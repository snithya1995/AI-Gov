import io
import json
import os
from typing import Any, Dict, List, Optional, TypedDict

import pandas as pd
from dotenv import load_dotenv
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from langgraph.graph import END, StateGraph
from pydantic import BaseModel
from pypdf import PdfReader

from .llm_provider import get_chat_model

load_dotenv()

router = APIRouter()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")


class CollectionState(TypedDict):
    messages: List[Any]
    requirements: List[Dict[str, Any]]
    next_question: str
    finished: bool
    project_id: Optional[str]
    context_grounding: Optional[str]


EXTRACTION_PROMPT = """
You are a Cyber Security Requirement Extractor.
Analyze the following conversation and extract all security requirements.
For each requirement, provide:
- title: A short descriptive name
- description: A detailed explanation of the requirement
- category: One of [Authentication, Access Control, Encryption, Data Protection, Logging, Network Security, Physical Security, Incident Response, Compliance, AI Security, IoT Security, Other]
- priority: One of [Critical, High, Medium, Low]

Return the response ONLY as a JSON list of objects.

Conversation:
{history}
"""

CHAT_PROMPT = """
You are a Security Consultant helping a user gather security requirements for an AI governance inventory.

Work as a guided intake assistant:
- Ask one relevant follow-up question at a time when the user's input is incomplete.
- If you can infer useful requirements, briefly summarize them and ask the user to confirm before they are added to inventory.
- Do not claim you have saved anything. The application will save only after the user confirms.
- After confirmation, move to the next useful topic such as authentication, data protection, logging, model governance, incident response, or compliance mapping.

Conversation:
{history}
"""


def _extract_text_response(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for part in content:
            if isinstance(part, dict) and "text" in part:
                parts.append(str(part["text"]))
            else:
                parts.append(str(part))
        return "".join(parts)
    return str(content)


def _clean_json_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:-3].strip()
    elif text.startswith("```"):
        text = text[3:-3].strip()

    start = text.find("[")
    if start == -1:
        start = text.find("{")
    end = text.rfind("]")
    if end == -1:
        end = text.rfind("}")

    if start != -1 and end != -1:
        text = text[start : end + 1]
    return text


def extract_requirements(state: CollectionState):
    llm = get_chat_model(temperature=0)
    history = "\n".join(f"{m['role']}: {m['content']}" for m in state["messages"])
    prompt = EXTRACTION_PROMPT.format(history=history)
    grounding = state.get("context_grounding") or ""
    if grounding:
        prompt = f"Grounding Context (Ground extracted requirements here when relevant):\n{grounding}\n\n" + prompt

    try:
        response = llm.invoke(prompt)
        text = _clean_json_block(_extract_text_response(response.content))
        return {"requirements": json.loads(text)}
    except Exception as exc:
        print(f"Error parsing requirements: {exc}")
        return {"requirements": []}


def generate_response(state: CollectionState):
    llm = get_chat_model(temperature=0.2)
    history = "\n".join(f"{m['role']}: {m['content']}" for m in state["messages"])
    prompt = CHAT_PROMPT.format(history=history)
    grounding = state.get("context_grounding") or ""
    if grounding:
        prompt = f"Grounding Context (Use this to customize follow-ups and ground suggestions):\n{grounding}\n\n" + prompt

    try:
        response = llm.invoke(prompt)
        return {"next_question": _extract_text_response(response.content).strip()}
    except Exception as exc:
        print(f"Error generating response: {exc}")
        return {"next_question": "Could you provide more details about your security requirements?"}


def build_graph():
    graph = StateGraph(CollectionState)
    graph.add_node("extract", extract_requirements)
    graph.add_node("respond", generate_response)
    graph.set_entry_point("extract")
    graph.add_edge("extract", "respond")
    graph.add_edge("respond", END)
    return graph.compile()


_graph = build_graph()


class CollectionIn(BaseModel):
    session_id: Optional[str] = None
    messages: List[Dict[str, str]]
    project_id: Optional[str] = None


class CollectionOut(BaseModel):
    session_id: str
    requirements: List[Dict[str, Any]]
    answer: str
    finished: bool


def extract_text_from_pdf(content: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        print(f"PDF Error: {exc}")
        return ""


def extract_text_from_excel(content: bytes) -> str:
    try:
        return pd.read_excel(io.BytesIO(content)).to_string()
    except Exception as exc:
        print(f"Excel Error: {exc}")
        return ""


@router.post("/collect", response_model=CollectionOut)
async def collect_requirements(payload: CollectionIn):
    sid = payload.session_id or "new-session"

    if not GOOGLE_API_KEY:
        print("[ERROR] GOOGLE_API_KEY is missing!")
        return CollectionOut(
            session_id=sid,
            requirements=[],
            answer="AI not configured. Add GOOGLE_API_KEY.",
            finished=False,
        )

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
            print(f"Error fetching MongoDB project context for grounding: {db_err}")

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
        print(f"Error loading Excel libraries for grounding: {ee}")

    inputs: CollectionState = {
        "messages": payload.messages,
        "requirements": [],
        "next_question": "",
        "finished": False,
        "project_id": payload.project_id,
        "context_grounding": context_grounding
    }

    try:
        result = _graph.invoke(inputs)
        return CollectionOut(
            session_id=sid,
            requirements=result.get("requirements", []),
            answer=result.get("next_question", "I've analyzed the conversation."),
            finished=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    session_id: str = Form("upload-session"),
):
    try:
        content = await file.read()
        filename = file.filename.lower()

        if filename.endswith(".pdf"):
            extracted_text = extract_text_from_pdf(content)
        elif filename.endswith((".xlsx", ".xls")):
            extracted_text = extract_text_from_excel(content)
        elif filename.endswith((".txt", ".md")):
            extracted_text = content.decode("utf-8")
        else:
            raise HTTPException(400, "Unsupported file type. Please upload PDF, Excel, or Text files.")

        if not extracted_text.strip():
            raise HTTPException(400, "Could not extract any text from the document.")

        llm = get_chat_model(temperature=0)
        history = f"DOCUMENT: {filename}\nCONTENT:\n{extracted_text[:10000]}"
        prompt = EXTRACTION_PROMPT.format(history=history)
        response = llm.invoke(prompt)
        text = _clean_json_block(_extract_text_response(response.content))
        parsed = json.loads(text)

        requirements: List[Dict[str, Any]]
        if isinstance(parsed, list):
            requirements = parsed
        elif isinstance(parsed, dict):
            requirements = parsed.get("requirements") or parsed.get("data") or parsed.get("items") or []
        else:
            requirements = []

        if not isinstance(requirements, list):
            requirements = []

        for item in requirements:
            if isinstance(item, dict):
                item["source"] = f"Document: {filename}"

        print(f"[SUCCESS] Extracted {len(requirements)} items from {filename}")
        return {
            "success": True,
            "requirements": requirements,
            "message": f"Successfully extracted {len(requirements)} requirements from {filename}.",
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Upload Error: {exc}")
        raise HTTPException(500, detail=str(exc))


DISCOVERY_PROMPT = """
You are an AI Governance and Risk Consultant.
Analyze the following list of compliance/security requirements for an AI project.
Based on these requirements, identify the AI assets (such as ML models, NLP models, Speech models, datasets, APIs, internal tools, or AI infrastructure) that must exist to satisfy these requirements or are referred to in them.

For each identified asset, provide:
- name: Clear, descriptive name of the asset (e.g. "Customer Speech-to-Text Model", "Patient Clinical Dataset")
- type: One of [NLP Model, ML Model, Computer Vision, Speech AI, Other] (map strictly to these categories)
- description: Detailed explanation of what the asset does and why it was identified from the requirements.
- riskLevel: Initial estimated risk level, one of [Low, Medium, High, Critical]
- owner: Suggested owner or team (e.g. "Data Science Team", "Platform Team")

Return the response ONLY as a JSON list of objects.

Requirements:
{requirements}
"""

class DiscoveryIn(BaseModel):
    requirements: List[Dict[str, Any]]


@router.post("/discover-assets")
async def discover_assets(payload: DiscoveryIn):
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="AI not configured. Add GOOGLE_API_KEY.")
    
    req_texts = []
    for req in payload.requirements:
        req_texts.append(f"- [{req.get('id', 'REQ')}] {req.get('title')}: {req.get('description')} (Category: {req.get('category')})")
    
    req_summary = "\n".join(req_texts)
    
    llm = get_chat_model(temperature=0)
    prompt = DISCOVERY_PROMPT.format(requirements=req_summary)
    
    try:
        response = llm.invoke(prompt)
        text = _clean_json_block(_extract_text_response(response.content))
        assets = json.loads(text)
        
        if not isinstance(assets, list):
            assets = []
            
        return {"success": True, "assets": assets}
    except Exception as exc:
        print(f"Error discovering assets: {exc}")
        
        # --- RESILIENT FALLBACK FOR QUOTA EXHAUSTED OR API FAILURES ---
        exc_str = str(exc)
        if "429" in exc_str or "RESOURCE_EXHAUSTED" in exc_str or "quota" in exc_str.lower():
            print("[AUTO DISCOVERY] Gemini API Quota Exhausted. Using fallback mock asset discovery...")
            fallback_assets = []
            for req in payload.requirements:
                title = req.get('title', '').lower()
                desc = req.get('description', '').lower()
                category = req.get('category', 'Other')
                
                if "encrypt" in title or "data protection" in title or "encryption" in title or "crypt" in desc:
                    fallback_assets.append({
                        "name": "Data Encryption Service",
                        "type": "Other",
                        "description": "Automatically identified to secure and encrypt customer sensitive data.",
                        "riskLevel": "Medium",
                        "owner": "Security Team"
                    })
                elif "speech" in title or "voice" in title or "speech" in desc:
                    fallback_assets.append({
                        "name": "Customer Speech Recognition Engine",
                        "type": "Speech AI",
                        "description": "Speech-to-text translation service identified from voice/speech requirements.",
                        "riskLevel": "Low",
                        "owner": "AI Platform Team"
                    })
                elif "nlp" in title or "language" in title or "text" in title or "chat" in title or "gpt" in desc:
                    fallback_assets.append({
                        "name": "Natural Language Processing Engine",
                        "type": "NLP Model",
                        "description": "Language model identified from text processing and chat requirements.",
                        "riskLevel": "Medium",
                        "owner": "Data Science Team"
                    })
                elif "model" in title or "algorithm" in title or "predict" in title or "fraud" in title or "predict" in desc:
                    fallback_assets.append({
                        "name": "Fraud Detection Classifier",
                        "type": "ML Model",
                        "description": "Predictive classifier identified from core model/fraud requirements.",
                        "riskLevel": "High",
                        "owner": "Data Team"
                    })
                elif "vision" in title or "image" in title or "camera" in title or "image" in desc:
                    fallback_assets.append({
                        "name": "Computer Vision Classifier",
                        "type": "Computer Vision",
                        "description": "Image and object detection model identified from vision/image requirements.",
                        "riskLevel": "Medium",
                        "owner": "AI Platform Team"
                    })
            
            if not fallback_assets:
                fallback_assets = [
                    {
                        "name": "Core Machine Learning Model",
                        "type": "ML Model",
                        "description": "Main prediction model identified from project security requirements.",
                        "riskLevel": "Medium",
                        "owner": "Data Science Team"
                    },
                    {
                        "name": "Core Application API",
                        "type": "Other",
                        "description": "Application programming interface to deliver ML predictions.",
                        "riskLevel": "Low",
                        "owner": "Platform Team"
                    }
                ]
            return {"success": True, "assets": fallback_assets, "message": "Discovered via fallback agent due to API quota limits."}
            
        raise HTTPException(status_code=500, detail=str(exc))
