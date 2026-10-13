"""Coordinator configuration, with camelCase JSON for the frontend."""

from enum import StrEnum
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ClockTime = Annotated[str, StringConstraints(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")]
PositiveInt = Annotated[int, Field(strict=True, gt=0)]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        extra="forbid",
    )


class Day(StrEnum):
    MONDAY = "monday"
    TUESDAY = "tuesday"
    WEDNESDAY = "wednesday"
    THURSDAY = "thursday"
    FRIDAY = "friday"
    SATURDAY = "saturday"
    SUNDAY = "sunday"


class TimeRange(ApiModel):
    start_time: ClockTime
    end_time: ClockTime

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.start_time >= self.end_time:
            raise ValueError("startTime must be earlier than endTime; overnight ranges are unsupported.")
        return self


class AvailabilityWindow(TimeRange):
    day: Day


class ScheduledBreak(TimeRange):
    id: Identifier | None = None
    label: Label = "Break"


class UniversityConfig(TimeRange):
    working_days: Annotated[list[Day], Field(min_length=1)]
    period_duration_minutes: PositiveInt
    breaks: list[ScheduledBreak] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_calendar(self) -> Self:
        if len(set(self.working_days)) != len(self.working_days):
            raise ValueError("workingDays must not contain duplicates.")
        previous_end = self.start_time
        for item in sorted(self.breaks, key=lambda item: item.start_time):
            if item.start_time < self.start_time or item.end_time > self.end_time:
                raise ValueError("Breaks must fall within university working hours.")
            if item.start_time < previous_end:
                raise ValueError("Breaks must not overlap.")
            previous_end = item.end_time
        return self


class Room(ApiModel):
    id: Identifier
    name: Label
    type: Literal["classroom", "laboratory"]
    capacity: PositiveInt
    lab_type: Label | None = None
    availability: list[AvailabilityWindow]

    @model_validator(mode="after")
    def check_lab_type(self) -> Self:
        if self.type == "laboratory" and self.lab_type is None:
            raise ValueError("Laboratories must specify labType.")
        if self.type == "classroom" and self.lab_type is not None:
            raise ValueError("Classrooms must not specify labType.")
        return self


class Faculty(ApiModel):
    id: Identifier
    name: Label
    availability: list[AvailabilityWindow]
    unavailable_slots: list[AvailabilityWindow] = Field(default_factory=list)
    max_daily_periods: PositiveInt | None = None


class StudentGroup(ApiModel):
    id: Identifier
    programme: Label
    semester: PositiveInt
    section: Label
    strength: PositiveInt
    max_daily_periods: PositiveInt | None = None


class Batch(ApiModel):
    id: Identifier
    name: Label
    student_group_id: Identifier
    strength: PositiveInt


class TeachingRequirement(ApiModel):
    id: Identifier
    subject_code: Label
    subject_name: Label
    student_group_id: Identifier
    kind: Literal["theory", "practical"]
    faculty_id: Identifier
    periods_per_week: PositiveInt | None = None
    sessions_per_week: PositiveInt | None = None
    duration_periods: PositiveInt = 1
    batch_ids: list[Identifier] = Field(default_factory=list)
    required_lab_type: Label | None = None
    preferred_slots: list[AvailabilityWindow] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_teaching_shape(self) -> Self:
        if self.kind == "theory":
            if self.periods_per_week is None:
                raise ValueError("Theory requires periodsPerWeek.")
            if self.sessions_per_week is not None or self.duration_periods != 1:
                raise ValueError("Theory uses one-period sessions and periodsPerWeek.")
            if self.batch_ids or self.required_lab_type is not None:
                raise ValueError("Theory is a whole-class requirement without batches or requiredLabType.")
        else:
            if self.sessions_per_week is None or not self.batch_ids or self.required_lab_type is None:
                raise ValueError("Practical requires sessionsPerWeek, batchIds, and requiredLabType.")
            if self.periods_per_week is not None:
                raise ValueError("Practical uses sessionsPerWeek per batch, not periodsPerWeek.")
            if len(set(self.batch_ids)) != len(self.batch_ids):
                raise ValueError("batchIds must not contain duplicates.")
        return self


class FixedCommitment(ApiModel):
    id: Identifier
    teaching_requirement_id: Identifier
    batch_id: Identifier | None = None
    occurrence_index: Annotated[int, Field(strict=True, ge=0)]
    day: Day
    start_time: ClockTime
    room_id: Identifier


class SchedulingConfig(ApiModel):
    university: UniversityConfig
    rooms: list[Room]
    faculty: list[Faculty]
    student_groups: list[StudentGroup]
    batches: list[Batch] = Field(default_factory=list)
    teaching_requirements: list[TeachingRequirement]
    fixed_commitments: list[FixedCommitment] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_references(self) -> Self:
        collections = {
            "rooms": self.rooms,
            "faculty": self.faculty,
            "studentGroups": self.student_groups,
            "batches": self.batches,
            "teachingRequirements": self.teaching_requirements,
            "fixedCommitments": self.fixed_commitments,
        }
        for name, records in collections.items():
            ids = [record.id for record in records]
            if len(set(ids)) != len(ids):
                raise ValueError(f"Duplicate IDs in {name}.")

        groups = {group.id: group for group in self.student_groups}
        batches = {batch.id: batch for batch in self.batches}
        faculty_ids = {member.id for member in self.faculty}
        room_ids = {room.id for room in self.rooms}
        requirements = {item.id: item for item in self.teaching_requirements}
        batch_totals: dict[str, int] = {}

        for batch in self.batches:
            if batch.student_group_id not in groups:
                raise ValueError(f"Batch {batch.id} references an unknown studentGroupId.")
            batch_totals[batch.student_group_id] = batch_totals.get(batch.student_group_id, 0) + batch.strength
        for group_id, total in batch_totals.items():
            if total > groups[group_id].strength:
                raise ValueError(f"Batch strengths exceed student group {group_id}'s strength.")

        for item in self.teaching_requirements:
            if item.student_group_id not in groups:
                raise ValueError(f"Requirement {item.id} references an unknown studentGroupId.")
            if item.faculty_id not in faculty_ids:
                raise ValueError(f"Requirement {item.id} references an unknown facultyId.")
            for batch_id in item.batch_ids:
                if batch_id not in batches or batches[batch_id].student_group_id != item.student_group_id:
                    raise ValueError(f"Requirement {item.id} references a batch outside its student group.")

        fixed_occurrences: set[tuple[str, str | None, int]] = set()
        for commitment in self.fixed_commitments:
            item = requirements.get(commitment.teaching_requirement_id)
            if item is None:
                raise ValueError(f"Fixed commitment {commitment.id} references an unknown requirement.")
            if commitment.room_id not in room_ids:
                raise ValueError(f"Fixed commitment {commitment.id} references an unknown roomId.")
            if commitment.day not in self.university.working_days:
                raise ValueError(f"Fixed commitment {commitment.id} is on a non-working day.")
            if item.kind == "theory" and commitment.batch_id is not None:
                raise ValueError("A fixed theory commitment cannot specify batchId.")
            if item.kind == "practical" and commitment.batch_id not in item.batch_ids:
                raise ValueError("A fixed practical commitment must reference one of its requirement's batches.")
            count = item.periods_per_week if item.kind == "theory" else item.sessions_per_week
            if commitment.occurrence_index >= count:
                raise ValueError(f"Fixed commitment {commitment.id} has an out-of-range occurrenceIndex.")
            key = (item.id, commitment.batch_id, commitment.occurrence_index)
            if key in fixed_occurrences:
                raise ValueError("A session occurrence cannot have multiple fixed commitments.")
            fixed_occurrences.add(key)
        return self


class ConfigurationCheck(ApiModel):
    valid: bool = True
    message: str = "Configuration structure and references are valid. Scheduling feasibility has not been checked."
    required_theory_periods: int
    required_practical_sessions: int
    required_practical_periods: int
