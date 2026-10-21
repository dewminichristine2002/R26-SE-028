"""HTTP endpoints for the Unified Conversational Dashboard.

The Node backend is the only expected caller. It supplies the schema digest
and recent-message context; we never touch the database from here.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.nl2sql import generate_sql
from app.services.ollama_client import OllamaError
from app.services.health_advice_answer import generate_health_advice
from app.services.rag_answer import generate_answer


router = APIRouter(prefix="/assistant", tags=["assistant"])


class RecentMessage(BaseModel):
    role: str = Field(..., description="user | assistant | system")
    content: str = ""


class Nl2SqlRequest(BaseModel):
    question: str = Field(..., min_length=1)
    schema_digest: str = Field(..., min_length=1)
    recent_messages: list[RecentMessage] = Field(default_factory=list)
    user_role: str = "user"


class Nl2SqlResponse(BaseModel):
    sql: str
    params: list[str]
    intent: str
    fallback: bool
    fallback_message: str


class AnswerRequest(BaseModel):
    question: str = Field(..., min_length=1)
    sql: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)
    intent: str = ""
    user_role: str = "user"


class AnswerResponse(BaseModel):
    answer: str
    follow_ups: list[str] = Field(default_factory=list)


class HealthAdviceRequest(BaseModel):
    question: str = Field(..., min_length=1)
    risk_type: str = Field(..., min_length=1)
    prediction: dict[str, Any] = Field(default_factory=dict)
    retrieved_chunks: list[dict[str, Any]] = Field(default_factory=list)
    user_role: str = "user"


class HealthAdviceResponse(BaseModel):
    answer: str


@router.post("/nl2sql", response_model=Nl2SqlResponse)
async def nl2sql_endpoint(payload: Nl2SqlRequest) -> Nl2SqlResponse:
    try:
        result = await generate_sql(
            question=payload.question,
            schema_digest=payload.schema_digest,
            recent_messages=[m.model_dump() for m in payload.recent_messages],
            user_role=payload.user_role,
        )
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return Nl2SqlResponse(
        sql=result.sql,
        params=result.params,
        intent=result.intent,
        fallback=result.fallback,
        fallback_message=result.fallback_message,
    )


@router.post("/answer", response_model=AnswerResponse)
async def answer_endpoint(payload: AnswerRequest) -> AnswerResponse:
    try:
        result = await generate_answer(
            question=payload.question,
            sql=payload.sql,
            rows=payload.rows,
            intent=payload.intent,
            user_role=payload.user_role,
        )
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return AnswerResponse(answer=result.answer, follow_ups=result.follow_ups)


@router.post("/health-advice", response_model=HealthAdviceResponse)
async def health_advice_endpoint(payload: HealthAdviceRequest) -> HealthAdviceResponse:
    try:
        result = await generate_health_advice(
            question=payload.question,
            risk_type=payload.risk_type,
            prediction=payload.prediction,
            retrieved_chunks=payload.retrieved_chunks,
            user_role=payload.user_role,
        )
    except OllamaError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return HealthAdviceResponse(answer=result.answer)
