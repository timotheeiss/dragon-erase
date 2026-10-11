"""FastAPI backend for the EraseFlow frontend.  Run: uvicorn erasure.api:app --reload"""
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .engine import Engine

app = FastAPI(title="Erasure agent API")
engine = Engine()


class NewRequest(BaseModel):
    name: str = Field(min_length=1)
    email: str = ""
    phone: str = ""
    aliases: list[str] = []
    roles: list[str] = []


class Decision(BaseModel):
    recordId: str
    action: str
    justification: str = ""
    approved: bool = False


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/state")
def get_state():
    return engine.snapshot()


@app.post("/api/requests")
def create_request(body: NewRequest):
    return engine.create_request(body.model_dump())


@app.post("/api/requests/{request_id}/select")
def select_request(request_id: str):
    try:
        return engine.select(request_id)
    except KeyError:
        raise HTTPException(404, "Unknown request")


@app.post("/api/scan")
def scan():
    return engine.scan()


@app.put("/api/decisions")
def decide(body: Decision):
    if body.action not in {"DELETE", "REDACT", "RETAIN", "MANUAL REVIEW", "REJECT"}:
        raise HTTPException(422, "Unknown action")
    return engine.decide(body.model_dump())


@app.post("/api/execute")
def execute():
    return engine.execute()


@app.post("/api/verify")
def verify():
    return engine.verify()


@app.post("/api/crm-sync")
def crm_sync():
    return engine.crm_sync()


@app.post("/api/reset")
def reset():
    return engine.reset()


@app.get("/api/certificate")
def certificate():
    return engine.certificate()


# Serve the built frontend (npm run build in frontend/) when present.
_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = _dist / path
        return FileResponse(f if f.is_file() else _dist / "index.html")
