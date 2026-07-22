import uuid
import json
from pathlib import Path

import fitz
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("/app/uploads")
METADATA_FILE = UPLOAD_DIR / "metadata.json"
INSIGHTS_DIR = UPLOAD_DIR / "insights"
OLLAMA_URL = "http://host.docker.internal:11434"


def load_metadata() -> list[dict]:
    if METADATA_FILE.exists():
        return json.loads(METADATA_FILE.read_text())
    return []


def save_metadata(entries: list[dict]):
    METADATA_FILE.write_text(json.dumps(entries, indent=2))


def get_pdf_path(file_id: str) -> Path:
    entries = load_metadata()
    match = next((e for e in entries if e["id"] == file_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="File not found")
    path = UPLOAD_DIR / match["stored_name"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing from storage")
    return path


def extract_pdf_text(path: Path) -> str:
    doc = fitz.open(str(path))
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if text.strip():
            pages.append(f"[Page {i + 1}]\n{text}")
    doc.close()
    return "\n\n".join(pages)


def insights_path(file_id: str) -> Path:
    INSIGHTS_DIR.mkdir(exist_ok=True)
    return INSIGHTS_DIR / f"{file_id}.json"


def load_insights(file_id: str) -> dict:
    p = insights_path(file_id)
    if p.exists():
        return json.loads(p.read_text())
    return {"document_summary": None, "conversation_summary": None}


def save_insights(file_id: str, data: dict):
    p = insights_path(file_id)
    p.write_text(json.dumps(data, indent=2))


@app.get("/api/files")
def list_files():
    return load_metadata()


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    file_id = uuid.uuid4().hex
    stored_name = f"{file_id}.pdf"
    dest = UPLOAD_DIR / stored_name

    content = await file.read()
    dest.write_bytes(content)

    entry = {
        "id": file_id,
        "name": file.filename,
        "stored_name": stored_name,
        "size": len(content),
    }

    entries = load_metadata()
    entries.append(entry)
    save_metadata(entries)

    return entry


@app.delete("/api/files/{file_id}")
def delete_file(file_id: str):
    entries = load_metadata()
    match = next((e for e in entries if e["id"] == file_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="File not found")

    pdf_path = UPLOAD_DIR / match["stored_name"]
    if pdf_path.exists():
        pdf_path.unlink()

    ip = insights_path(file_id)
    if ip.exists():
        ip.unlink()

    entries = [e for e in entries if e["id"] != file_id]
    save_metadata(entries)

    return {"deleted": True}


@app.get("/api/files/{file_id}/pdf")
def serve_pdf(file_id: str):
    path = get_pdf_path(file_id)
    entries = load_metadata()
    match = next((e for e in entries if e["id"] == file_id), None)
    return FileResponse(path, media_type="application/pdf", filename=match["name"])


@app.get("/api/files/{file_id}/insights")
def get_insights(file_id: str):
    get_pdf_path(file_id)
    return load_insights(file_id)


@app.post("/api/files/{file_id}/summarize-document")
async def summarize_document(file_id: str):
    path = get_pdf_path(file_id)

    existing = load_insights(file_id)
    if existing.get("document_summary"):
        return {"summary": existing["document_summary"], "cached": True}

    pdf_text = extract_pdf_text(path)
    max_chars = 60000
    if len(pdf_text) > max_chars:
        pdf_text = pdf_text[:max_chars] + "\n\n[... truncated]"

    messages = [
        {
            "role": "system",
            "content": (
                "You summarize PDF documents. Provide a clear, structured summary "
                "covering the main topics, key points, and conclusions. "
                "Keep it concise but comprehensive."
            ),
        },
        {
            "role": "user",
            "content": f"Summarize this document:\n\n{pdf_text}",
        },
    ]

    accumulated = []

    async def stream():
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/chat",
                json={"model": "llama3.2", "messages": messages, "stream": True},
            ) as resp:
                if resp.status_code != 200:
                    error = await resp.aread()
                    yield json.dumps({"error": f"Ollama error: {error.decode()}"})
                    return
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        accumulated.append(token)
                        yield token
                    if chunk.get("done"):
                        full = "".join(accumulated)
                        data = load_insights(file_id)
                        data["document_summary"] = full
                        save_insights(file_id, data)

    return StreamingResponse(stream(), media_type="text/plain")


@app.post("/api/files/{file_id}/summarize-conversation")
async def summarize_conversation(file_id: str, body: dict):
    get_pdf_path(file_id)
    history = body.get("history", [])

    if len(history) < 2:
        return {"summary": None}

    conversation_text = "\n".join(
        f"{'User' if m['role'] == 'user' else 'Assistant'}: {m['content']}"
        for m in history
    )

    messages = [
        {
            "role": "system",
            "content": (
                "You summarize conversations about PDF documents. "
                "Capture the key questions asked, important answers given, "
                "and any conclusions reached. Be concise."
            ),
        },
        {
            "role": "user",
            "content": f"Summarize this conversation:\n\n{conversation_text}",
        },
    ]

    accumulated = []

    async def stream():
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/chat",
                json={"model": "llama3.2", "messages": messages, "stream": True},
            ) as resp:
                if resp.status_code != 200:
                    error = await resp.aread()
                    yield json.dumps({"error": f"Ollama error: {error.decode()}"})
                    return
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        accumulated.append(token)
                        yield token
                    if chunk.get("done"):
                        full = "".join(accumulated)
                        data = load_insights(file_id)
                        data["conversation_summary"] = full
                        save_insights(file_id, data)

    return StreamingResponse(stream(), media_type="text/plain")


@app.post("/api/chat")
async def chat(body: dict):
    file_id = body.get("file_id")
    message = body.get("message", "").strip()
    history = body.get("history", [])

    if not file_id or not message:
        raise HTTPException(status_code=400, detail="file_id and message required")

    path = get_pdf_path(file_id)

    pdf_text = extract_pdf_text(path)
    max_chars = 60000
    if len(pdf_text) > max_chars:
        pdf_text = pdf_text[:max_chars] + "\n\n[... truncated]"

    system_prompt = (
        "You are a helpful assistant that answers questions about a PDF document. "
        "Below is the extracted text from the PDF. Use it to answer the user's questions. "
        "If the answer is not in the document, say so.\n\n"
        f"--- PDF CONTENT ---\n{pdf_text}\n--- END PDF CONTENT ---"
    )

    messages = [{"role": "system", "content": system_prompt}]
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    async def stream():
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_URL}/api/chat",
                json={"model": "llama3.2", "messages": messages, "stream": True},
            ) as resp:
                if resp.status_code != 200:
                    error = await resp.aread()
                    yield json.dumps({"error": f"Ollama error: {error.decode()}"})
                    return
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    token = chunk.get("message", {}).get("content", "")
                    if token:
                        yield token

    return StreamingResponse(stream(), media_type="text/plain")
