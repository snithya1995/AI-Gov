# agents/chat_agent.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import uuid4

router = APIRouter()

# All 11 intake questions
QUESTIONS = [
    "1) Please enter your name (or the request owner’s name) and the country in which they are located.",
    "2) Is this project internal to our organization (reply '1') or does it involve third parties (reply '2')?",
    "3) From which regions do you need data for this AI use-case?",
    "4) What is the intended purpose of the AI system? (Briefly describe how it will address a need aligning with organizational objectives.)",
    "5) Is your AI system considered a general-purpose AI model like Gen AI? (yes/no)",
    "6) Please describe the learning model used by the AI system.",
    "7) Has a comprehensive review been conducted to identify all existing regulations and guidelines that could impact the AI system? (yes/no)",
    "8) Is there human oversight of the system’s outputs? (yes/no)",
    "9) Which groups or categories of individuals are being assessed, monitored, or otherwise affected by this AI system?",
    "10) Select a date range for when you would like to start and complete the project (YYYY-MM-DD to YYYY-MM-DD).",
    "11) Are there any factors that might extend your project timeline?"
]

# In‐memory sessions store: session_id → { idx: int, answers: dict[int,str] }
sessions: dict[str, dict] = {}

class ChatIn(BaseModel):
    session_id: str | None = None
    answer: str | None    = None
    project_id: str | None = None

class ChatOut(BaseModel):
    session_id: str
    question: str | None
    finished: bool
    summary: dict[int,str] | None = None

@router.post("/", response_model=ChatOut)
def chat(payload: ChatIn):
    # 1) Start new session if none provided
    if not payload.session_id:
        sid = str(uuid4())
        sessions[sid] = {"idx": 0, "answers": {}}
    else:
        sid = payload.session_id
        if sid not in sessions:
            raise HTTPException(404, "Session not found")

    sess = sessions[sid]
    idx  = sess["idx"]

    # 2) If an answer is given, record it and advance
    if payload.answer is not None:
        sess["answers"][idx + 1] = payload.answer.strip()
        idx += 1
        sess["idx"] = idx

    # 3) If we’ve asked all questions, return summary
    if idx >= len(QUESTIONS):
        summary = sess["answers"]
        sessions.pop(sid, None)
        return ChatOut(
            session_id=sid,
            question=None,
            finished=True,
            summary=summary,
        )

    # 4) Otherwise, ask the next question
    next_q = QUESTIONS[idx]
    return ChatOut(
        session_id=sid,
        question=next_q,
        finished=False,
        summary=None,
    )
