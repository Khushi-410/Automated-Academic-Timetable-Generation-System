"""Generation and schedule-validation API contracts."""

import hashlib
import json
from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from app.models.scheduling import (
    ApiModel, ClockTime, Day, Identifier, Label, PositiveInt, SchedulingConfig,
)


def session_id(requirement_id: str, batch_id: str | None, occurrence: int) -> str:
    key = json.dumps([requirement_id, batch_id, occurrence], separators=(",", ":"))
    return "session-" + hashlib.sha256(key.encode()).hexdigest()[:24]


class ScheduledSession(ApiModel):
    id: Identifier
    teaching_requirement_id: Identifier
    occurrence_index: Annotated[int, Field(strict=True, ge=0)]
    subject_code: Label
    subject_name: Label
    kind: Literal["theory", "practical"]
    student_group_id: Identifier
    batch_id: Identifier | None = None
    faculty_id: Identifier
    room_id: Identifier
    day: Day
    start_time: ClockTime
    end_time: ClockTime
    duration_periods: PositiveInt
    locked: bool = False


class Diagnostic(ApiModel):
    code: str
    severity: Literal["error", "warning", "info"] = "error"
    message: str
    related_entity_ids: list[str] = Field(default_factory=list)
    teaching_requirement_id: str | None = None
    suggested_changes: list[str] = Field(default_factory=list)


class GenerateRequest(ApiModel):
    config: SchedulingConfig
    locked_sessions: list[ScheduledSession] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_locks(self) -> Self:
        requirements = {item.id: item for item in self.config.teaching_requirements}
        ids: set[str] = set()
        for locked in self.locked_sessions:
            item = requirements.get(locked.teaching_requirement_id)
            if item is None:
                raise ValueError("A locked session references an unknown teaching requirement.")
            count = item.periods_per_week if item.kind == "theory" else item.sessions_per_week
            if locked.occurrence_index >= count:
                raise ValueError("A locked session has an out-of-range occurrenceIndex.")
            if (item.kind == "theory" and locked.batch_id is not None) or (
                item.kind == "practical" and locked.batch_id not in item.batch_ids
            ):
                raise ValueError("A locked session has an invalid batchId.")
            expected_id = session_id(item.id, locked.batch_id, locked.occurrence_index)
            if locked.id != expected_id or locked.id in ids:
                raise ValueError("Locked session IDs must be canonical and unique. Use IDs from generation.")
            ids.add(locked.id)
            if any([
                locked.kind != item.kind, locked.faculty_id != item.faculty_id,
                locked.student_group_id != item.student_group_id,
                locked.subject_code != item.subject_code, locked.subject_name != item.subject_name,
                locked.duration_periods != item.duration_periods,
            ]):
                raise ValueError("A locked session's metadata no longer matches the configuration.")
        return self


class ValidationRequest(ApiModel):
    config: SchedulingConfig
    sessions: list[ScheduledSession]


class ValidationResult(ApiModel):
    valid: bool
    conflicts: list[Diagnostic] = Field(default_factory=list)


class UnassignedRequirement(ApiModel):
    teaching_requirement_id: str
    subject_code: str
    batch_id: str | None = None
    missing_sessions: int
    missing_periods: int


class GenerationMetrics(ApiModel):
    required_sessions: int
    scheduled_sessions: int
    required_theory_periods: int
    scheduled_theory_periods: int
    required_practical_sessions: int
    scheduled_practical_sessions: int
    required_practical_periods: int
    scheduled_practical_periods: int
    preferences_total: int = 0
    preferences_satisfied: int = 0
    solver_wall_time_seconds: float = 0


class GenerateResponse(ApiModel):
    status: Literal["feasible", "infeasible", "unknown"]
    sessions: list[ScheduledSession] = Field(default_factory=list)
    diagnostics: list[Diagnostic] = Field(default_factory=list)
    unassigned_requirements: list[UnassignedRequirement] = Field(default_factory=list)
    metrics: GenerationMetrics
