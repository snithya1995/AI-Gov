import json
import pandas as pd
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import uuid4
import os
import io
import shutil
from typing import List, Optional, TypedDict

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from datetime import datetime
from pymongo import MongoClient

MONGODB_URI = os.getenv("MONGODB_URI")
MONGODB_DB = os.getenv("MONGODB_DB", "AI-Governance")
MONGODB_UPLOADS_COL = os.getenv("MONGODB_UPLOADS_COL", "rag_uploads")
MONGODB_CHATS_COL = os.getenv("MONGODB_CHATS_COL", "rag_chats")

_mongo = None
_uploads_col = None
_chats_col = None

router = APIRouter()

SESSIONS_DIR = Path(__file__).parent.parent / "saved_sessions"
SESSIONS_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# RAG (Qdrant + Vertex AI + LangGraph)
# ---------------------------------------------------------------------------
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams

from langchain_community.vectorstores import Qdrant as LCQdrant
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from langchain_google_vertexai import VertexAIEmbeddings, ChatVertexAI
from langchain_core.prompts import ChatPromptTemplate

from langgraph.graph import StateGraph, END
from langchain_core.messages import AIMessage, HumanMessage

# ---- Config ----
BASE_DIR = Path(__file__).parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "bionic-mercury-455722-g1")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
QDRANT_PATH = os.getenv("QDRANT_PATH", str(BASE_DIR / "data" / "qdrant_local"))
COLLECTION_NAME = os.getenv("RAG_COLLECTION", "rag_docs")
SAMPLE_CORPUS_DIR = Path(os.getenv("SAMPLE_CORPUS_DIR", str(BASE_DIR / "sample_docs")))
EMBEDDING_MODEL = os.getenv("VERTEX_EMBED_MODEL", "text-embedding-004")
CHAT_MODEL = os.getenv("VERTEX_CHAT_MODEL", "gemini-2.5-flash-lite")
TOP_K = int(os.getenv("RAG_TOP_K", "4"))

# ---- Globals ----
_qclient: Optional[QdrantClient] = None
_embeddings: Optional[VertexAIEmbeddings] = None
_vectorstore: Optional[LCQdrant] = None
_retriever = None

# Keep lightweight history per RAG chat session
class _History:
    def __init__(self):
        self.messages: list = []
    def add_user(self, text: str):
        self.messages.append(HumanMessage(content=text))
    def add_ai(self, text: str):
        self.messages.append(AIMessage(content=text))
    def to_plaintext(self) -> str:
        out = []
        for m in self.messages:
            role = "User" if isinstance(m, HumanMessage) else "Assistant"
            out.append(f"{role}: {m.content}")
        return "\n".join(out)

_rag_histories: dict[str, _History] = {}

# ---- Init & helpers ----
def _ensure_clients():
    global _qclient, _embeddings, _vectorstore, _retriever

    if _embeddings is None:
        _embeddings = VertexAIEmbeddings(
            model_name=EMBEDDING_MODEL,
            project=PROJECT,
            location=LOCATION
        )
    if _qclient is None:
        if not QDRANT_PATH.startswith("http"):
            Path(QDRANT_PATH).parent.mkdir(parents=True, exist_ok=True)
        _qclient = QdrantClient(
            url=os.getenv("QDRANT_PATH"),
            api_key=os.getenv("QDRANT_API_KEY")
        )

    dims = len(_embeddings.embed_query("dimension probe"))
    try:
        _qclient.get_collection(COLLECTION_NAME)
    except Exception:
        _qclient.recreate_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=dims, distance=Distance.COSINE),
        )

    if _vectorstore is None:
        try:
            _vectorstore = LCQdrant.from_existing_collection(
                collection_name=COLLECTION_NAME, client=_qclient, embeddings=_embeddings
            )
        except Exception:
            _vectorstore = LCQdrant(client=_qclient, collection_name=COLLECTION_NAME, embeddings=_embeddings)

    if _retriever is None:
        _retriever = _vectorstore.as_retriever(search_kwargs={"k": TOP_K})

    global _mongo, _uploads_col, _chats_col
    if _mongo is None and MONGODB_URI:
        _mongo = MongoClient(MONGODB_URI)
        db = _mongo[MONGODB_DB]
        _uploads_col = db[MONGODB_UPLOADS_COL]
        _chats_col = db[MONGODB_CHATS_COL]

def _read_file(fp: Path) -> Optional[str]:
    ext = fp.suffix.lower()
    try:
        if ext in {".txt", ".md", ".py", ".json", ".yaml", ".yml"}:
            return fp.read_text(encoding="utf-8", errors="ignore")
        if ext == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(str(fp))
            return "\n\n".join(page.extract_text() or "" for page in reader.pages)
        if ext in {".docx"}:
            import docx2txt
            return docx2txt.process(str(fp))
        if ext in {".xlsx", ".xls"}:
            xls = pd.ExcelFile(str(fp))
            sheets = []
            for name in xls.sheet_names:
                df = xls.parse(name).fillna("")
                sheets.append(f"=== Sheet: {name} ===\n" + df.to_csv(index=False))
            return "\n\n".join(sheets)
        if ext == ".csv":
            df = pd.read_csv(str(fp)).fillna("")
            return df.to_csv(index=False)
        return fp.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None

def _chunk(text: str, source: str) -> List[Document]:
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    docs = splitter.split_text(text)
    return [Document(page_content=d, metadata={"source": source}) for d in docs]

def _ingest_paths(paths: List[Path]) -> dict:
    _ensure_clients()
    added = 0
    skipped = 0
    docs: List[Document] = []
    for p in paths:
        if p.is_dir():
            for fp in p.rglob("*"):
                if fp.is_file():
                    txt = _read_file(fp)
                    if txt:
                        docs.extend(_chunk(txt, str(fp)))
                        added += 1
                    else:
                        skipped += 1
        elif p.is_file():
            txt = _read_file(p)
            if txt:
                docs.extend(_chunk(txt, str(p)))
                added += 1
            else:
                skipped += 1
    if docs:
        _vectorstore.add_documents(docs)
    return {"files_indexed": added, "files_skipped": skipped, "chunks_added": len(docs)}

# ---- LangGraph: retrieve -> generate ----
class RAGState(TypedDict):
    question: str
    context: str
    answer: str
    grounding: str

_prompt = ChatPromptTemplate.from_template(
    (
        "You are a concise, accurate assistant. Use ONLY the provided context to answer. "
        "If the answer isn't in the context, say you don't know.\n\n"
        "Grounding Context:\n{grounding}\n\n"
        "Chat history (may be empty):\n{history}\n\n"
        "Context:\n{context}\n\n"
        "Question: {question}"
    )
)

_llm = None  # lazy

def _build_graph():
    _ensure_clients()
    global _llm
    if _llm is None:
        _llm = ChatVertexAI(
            model_name=CHAT_MODEL,
            project=PROJECT,
            location=LOCATION,
            temperature=0.2
        )

    graph = StateGraph(RAGState)

    def retrieve(state: RAGState):
        docs = _retriever.get_relevant_documents(state["question"])
        ctx = []
        sources = []
        for d in docs:
            src = d.metadata.get("source", "unknown")
            ctx.append(f"Source: {src}\n{d.page_content}")
            sources.append({"source": src})
        return {"context": "\n\n".join(ctx), "sources": sources}

    def generate(state: RAGState):
        history_text = state.get("history", "") if isinstance(state, dict) else ""
        msg = _prompt.format_messages(
            history=history_text,
            context=state.get("context", ""),
            question=state["question"],
            grounding=state.get("grounding", ""),
        )
        out = _llm.invoke(msg)
        return {"answer": out.content}

    graph.add_node("retrieve", retrieve)
    graph.add_node("generate", generate)
    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "generate")
    graph.add_edge("generate", END)
    return graph.compile()

_graph = _build_graph()

# ---- API Schemas ----
class RAGAskIn(BaseModel):
    question: str
    session_id: Optional[str] = None
    project_id: Optional[str] = None

class RAGAskOut(BaseModel):
    session_id: str
    answer: str

class RAGIngestFolderIn(BaseModel):
    path: Optional[str] = None

# ---- RAG Endpoints ----
@router.get("/rag/health")
def rag_health():
    _ensure_clients()
    return {"ok": True, "collection": COLLECTION_NAME, "qdrant_path": QDRANT_PATH}

@router.post("/rag/ingest-folder")
def rag_ingest_folder(payload: RAGIngestFolderIn):
    path = Path(payload.path) if payload.path else SAMPLE_CORPUS_DIR
    if not path.exists():
        raise HTTPException(404, f"Folder not found: {path}")
    stats = _ingest_paths([path])
    return {"status": "ok", **stats}

@router.post("/rag/upload")
def rag_upload(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(400, "No files uploaded")

    saved_paths: List[Path] = []
    for uf in files:
        dest = UPLOADS_DIR / uf.filename
        with dest.open("wb") as f:
            shutil.copyfileobj(uf.file, f)
        saved_paths.append(dest)
        if _uploads_col is not None:
            try:
                _uploads_col.insert_one({
                    "filename": uf.filename,
                    "path": str(dest),
                    "size": dest.stat().st_size,
                    "content_type": uf.content_type,
                    "ingested_at": datetime.utcnow(),
                })
            except Exception:
                pass

    stats = _ingest_paths(saved_paths)
    return {"status": "ok", "uploaded": [str(p) for p in saved_paths], **stats}

@router.post("/rag/ask", response_model=RAGAskOut)
def rag_ask(payload: RAGAskIn):
    if not payload.question or not payload.question.strip():
        raise HTTPException(400, "Question is required")

    sid = payload.session_id or str(uuid4())
    hist = _rag_histories.get(sid) or _History()
    hist.add_user(payload.question)

    context_grounding = ""
    if payload.project_id:
        try:
            from .library_store import _db
            db = _db()
            if db is not None:
                project = db.projects.find_one({"projectId": payload.project_id})
                if project:
                    context_grounding += f"=== Active Project: {project.get('projectName', 'Unnamed')} ===\n"
                    q_resp = project.get("questionnaireResponses")
                    if q_resp:
                        context_grounding += "Project Questionnaire Answers:\n"
                        for key, val in q_resp.items():
                            if val:
                                context_grounding += f"- {key}: {val}\n"
                    
                    # Fetch assets
                    project_obj_id = project.get("_id")
                    if project_obj_id:
                        assets = list(db.assets.find({"project": project_obj_id}))
                        if assets:
                            context_grounding += "\nProject Registered Assets:\n"
                            for a in assets:
                                context_grounding += f"- Name: {a.get('name')} | Type: {a.get('type')} | Risk Level: {a.get('riskLevel')} | Description: {a.get('description')}\n"
                    
                    # Fetch requirements
                    reqs = list(db.securityrequirements.find({"projectId": payload.project_id}))
                    if reqs:
                        context_grounding += "\nProject Saved Security Requirements:\n"
                        for r in reqs:
                            context_grounding += f"- Title: {r.get('title')} | Category: {r.get('category')} | Priority: {r.get('priority')} | Description: {r.get('description')}\n"
        except Exception as db_err:
            print(f"Error fetching MongoDB project context for RAG grounding: {db_err}")

    # Load predefined risks and controls from Excel library
    try:
        from .library_store import read_ai_risks_from_store, read_ai_controls_from_store
        ai_risks = read_ai_risks_from_store()
        ai_controls = read_ai_controls_from_store()
        
        context_grounding += "\n=== Reference Excel Framework Library ===\n"
        context_grounding += "Predefined AI Risks:\n"
        for _, row in ai_risks.head(15).iterrows():
            risk_id = row.get("risk id") or row.get("risk") or ""
            risk_name = row.get("risk name") or row.get("risk") or ""
            mitigation = row.get("mitigation") or ""
            context_grounding += f"- [{risk_id}] {risk_name} (Mitigation: {mitigation})\n"
            
        context_grounding += "\nPredefined AI Controls:\n"
        for _, row in ai_controls.head(15).iterrows():
            code = row.get("code") or row.get("control_id") or ""
            ctrl = row.get("control") or ""
            reqs = row.get("requirements") or ""
            context_grounding += f"- [{code}] {ctrl} (Requirements: {reqs})\n"
    except Exception as ee:
        print(f"Error loading Excel libraries for RAG grounding: {ee}")

    inputs = {
        "question": payload.question,
        "context": "",
        "answer": "",
        "history": hist.to_plaintext(),
        "grounding": context_grounding,
    }

    result = _graph.invoke(inputs)
    answer = result.get("answer", "I don't know.")
    sources = result.get("sources", [])

    if _chats_col is not None:
        try:
            _chats_col.insert_one({
                "session_id": sid,
                "question": payload.question,
                "answer": answer,
                "sources": sources,
                "created_at": datetime.utcnow(),
            })
        except Exception:
            pass

    hist.add_ai(answer)
    _rag_histories[sid] = hist

    return RAGAskOut(session_id=sid, answer=answer)

@router.get("/rag/list")
def rag_list_indexed():
    _ensure_clients()
    info = _qclient.get_collection(COLLECTION_NAME)
    return {"collection": COLLECTION_NAME, "vectors_count": getattr(info, "vectors_count", None)}