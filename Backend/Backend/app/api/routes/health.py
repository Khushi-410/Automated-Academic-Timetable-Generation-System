"""Service health endpoint."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "academic-timetable-backend"


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Confirm that the API process is responding."""
    return HealthResponse()
