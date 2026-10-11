import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { seedRecords } from "../fixtures";
import type { ErasureCase, SourceRecord } from "../types";

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (!this.db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get())
      this.reset();
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  reset() {
    this.transaction(() => {
      this.db.exec("DELETE FROM records; DELETE FROM cases; DELETE FROM meta;");
      for (const record of seedRecords()) this.putRecord(record);
      this.db
        .prepare("INSERT INTO meta (key,value) VALUES ('seeded','1')")
        .run();
    });
  }

  listRecords(): SourceRecord[] {
    return this.db
      .prepare("SELECT data FROM records ORDER BY id")
      .all()
      .map((row) => JSON.parse(row.data as string));
  }

  record(id: string): SourceRecord | null {
    const row = this.db
      .prepare("SELECT data FROM records WHERE id = ?")
      .get(id);
    return row ? JSON.parse(row.data as string) : null;
  }

  putRecord(record: SourceRecord) {
    this.db
      .prepare(
        "INSERT INTO records (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(record.id, JSON.stringify(record));
  }

  getCase(id: string): ErasureCase | null {
    const row = this.db.prepare("SELECT data FROM cases WHERE id = ?").get(id);
    return row ? JSON.parse(row.data as string) : null;
  }

  activeCase(): ErasureCase | null {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key='active'")
      .get();
    return row ? this.getCase(row.value as string) : null;
  }

  insertCase(value: ErasureCase) {
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO cases (id, revision, data) VALUES (?,?,?)")
        .run(value.id, value.revision, JSON.stringify(value));
      this.db
        .prepare(
          "INSERT INTO meta (key,value) VALUES ('active',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(value.id);
    });
  }

  /** Compare-and-swap prevents a slow model response from overwriting newer human work. */
  saveCase(value: ErasureCase) {
    const next = { ...value, revision: value.revision + 1 };
    const result = this.db
      .prepare("UPDATE cases SET revision=?, data=? WHERE id=? AND revision=?")
      .run(next.revision, JSON.stringify(next), value.id, value.revision);
    if (Number(result.changes) !== 1)
      throw new Error(
        "This case changed in another request. Refresh and try again.",
      );
    value.revision = next.revision;
  }

  close() {
    this.db.close();
  }
}

const globalStore = globalThis as typeof globalThis & { dragonStore?: Store };
export function getStore() {
  return (globalStore.dragonStore ??= new Store(
    process.env.DRAGON_DB_PATH || resolve(process.cwd(), ".data/dragon.sqlite"),
  ));
}
