"""Draft and publication contracts."""

from datetime import datetime
from typing import Literal, Self

from pydantic import Field, model_validator

from app.models.scheduling import ApiModel, Identifier, Label, SchedulingConfig
from app.models.timetable import ScheduledSession, ValidationResult


class DraftCreate(ApiModel):
    name: Label
    config: SchedulingConfig
    sessions: list[ScheduledSession] = Field(default_factory=list)


class DraftUpdate(ApiModel):
    name: Label | None = None
    config: SchedulingConfig | None = None
    sessions: list[ScheduledSession] | None = None

    @model_validator(mode="after")
    def check_changes(self) -> Self:
        if not self.model_fields_set:
            raise ValueError("Supply at least one of name, config, or sessions.")
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("Updated fields must not be null.")
        return self


class SavedTimetable(ApiModel):
    id: Identifier
    name: Label
    status: Literal["draft", "published"]
    config: SchedulingConfig
    sessions: list[ScheduledSession]
    validation: ValidationResult
    created_at: datetime
    updated_at: datetime
