"""Schedule generation and manual-edit validation endpoints."""

from typing import Annotated

from fastapi import APIRouter, Body

from app.models.timetable import GenerateRequest, GenerateResponse, ValidationRequest, ValidationResult
from app.services.scheduler import generate_timetable
from app.services.presets import build_dfis_preset
from app.services.validation import validate_schedule

router = APIRouter(tags=["Timetable"])

GENERATE_EXAMPLES = {
    "dfis": {
        "summary": "DFIS demo: three theory periods and two batch practicals",
        "value": {"config": build_dfis_preset().model_dump(mode="json"), "lockedSessions": []},
    },
    "dfis-impossible": {
        "summary": "Impossible demo: three theory periods, faculty available for two",
        "value": {"config": build_dfis_preset(impossible=True).model_dump(mode="json"), "lockedSessions": []},
    },
}


@router.post("/generate", response_model=GenerateResponse)
def generate(request: Annotated[GenerateRequest, Body(openapi_examples=GENERATE_EXAMPLES)]) -> GenerateResponse:
    """Generate a complete timetable, retaining supplied locked assignments."""
    return generate_timetable(request)


@router.post("/validate", response_model=ValidationResult)
def validate(request: ValidationRequest) -> ValidationResult:
    """Check a complete schedule or proposed edit against mandatory rules."""
    return validate_schedule(request.config, request.sessions)
