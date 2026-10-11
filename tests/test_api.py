from fastapi.testclient import TestClient

from erasure import api
from erasure.engine import Engine


def client(tmp_path):
    api.engine = Engine(tmp_path / "sim")
    return TestClient(api.app)


def test_initial_discovery(tmp_path):
    s = client(tmp_path).get("/api/state").json()
    hits = {m["recordId"]: m["suggestedAction"] for m in s["matches"]}
    assert hits["gmail-001"] == "DELETE" and hits["sf-contact-001"] == "DELETE"
    assert hits["sf-invoice-001"] == "RETAIN"
    assert hits["slack-002"] == "MANUAL REVIEW"            # alias only
    assert hits["notion-001"] == "REDACT"                  # role-only
    assert hits["drive-001"] == "REDACT" and hits["drive-002"] == "DELETE"
    assert "slack-003" not in hits and "drive-003" not in hits   # false positives untouched


def test_full_flow_leaves_decoys_untouched(tmp_path):
    c = client(tmp_path)
    s = c.get("/api/state").json()
    before = {r["id"]: r["content"] for r in s["records"]}
    for m in s["matches"]:
        action = "REDACT" if m["suggestedAction"] == "MANUAL REVIEW" else m["suggestedAction"]
        c.put("/api/decisions", json={"recordId": m["recordId"], "action": action,
                                      "justification": "statutory retention" if action == "RETAIN" else "", "approved": True})
    s = c.post("/api/execute").json()
    assert all(e["result"] == "success" for e in s["execution"])
    s = c.post("/api/verify").json()
    assert s["verification"]["status"] == "COMPLETE"
    assert s["verification"]["retainedIds"] == ["sf-invoice-001"]
    after = {r["id"]: r["content"] for r in s["records"]}
    assert after["slack-003"] == before["slack-003"] and after["drive-003"] == before["drive-003"]
    assert "gmail-001" not in after
    assert "Sarah Chen" not in after["drive-002"] and "Marcus Webb" in after["drive-002"]
    cert = c.get("/api/certificate").json()
    assert cert["status"] == "COMPLETE" and cert["auditTrail"]


def test_unapproved_plan_changes_nothing(tmp_path):
    c = client(tmp_path)
    s = c.post("/api/execute").json()
    assert s["execution"] == []
    assert c.post("/api/verify").json()["verification"]["status"] == "INCOMPLETE"
