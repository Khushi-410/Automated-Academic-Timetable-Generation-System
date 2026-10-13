"""Calendar construction and resource availability shared by solver and validator."""

from dataclasses import dataclass

from app.models.scheduling import AvailabilityWindow, Day, SchedulingConfig, TeachingRequirement
from app.models.timetable import ScheduledSession, session_id


def minutes(value: str) -> int:
    hours, remainder = map(int, value.split(":"))
    return hours * 60 + remainder


def clock(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


def overlaps(start: int, end: int, other_start: int, other_end: int) -> bool:
    return start < other_end and other_start < end


def available(windows: list[AvailabilityWindow], day: Day, start: int, end: int) -> bool:
    """Union adjacent/overlapping windows before checking full interval coverage."""
    cursor = start
    for window in sorted((item for item in windows if item.day == day), key=lambda item: item.start_time):
        left, right = minutes(window.start_time), minutes(window.end_time)
        if left > cursor:
            break
        if right > cursor:
            cursor = right
        if cursor >= end:
            return True
    return False


def periods(config: SchedulingConfig) -> list[tuple[int, int]]:
    """Build complete periods separately in each uninterrupted teaching segment."""
    calendar = config.university
    boundaries = [(minutes(item.start_time), minutes(item.end_time)) for item in calendar.breaks]
    cursor = minutes(calendar.start_time)
    result = []
    for break_start, break_end in sorted(boundaries) + [(minutes(calendar.end_time), minutes(calendar.end_time))]:
        while cursor + calendar.period_duration_minutes <= break_start:
            result.append((cursor, cursor + calendar.period_duration_minutes))
            cursor += calendar.period_duration_minutes
        cursor = break_end
    return result


@dataclass(frozen=True)
class Occurrence:
    id: str
    requirement: TeachingRequirement
    batch_id: str | None
    index: int


@dataclass(frozen=True)
class Placement:
    day: Day
    start: int
    end: int
    room_id: str


def occurrences(config: SchedulingConfig) -> list[Occurrence]:
    result = []
    for item in config.teaching_requirements:
        count = item.periods_per_week if item.kind == "theory" else item.sessions_per_week
        for batch_id in ([None] if item.kind == "theory" else item.batch_ids):
            for index in range(count):
                result.append(Occurrence(session_id(item.id, batch_id, index), item, batch_id, index))
    return result


def tracks(config: SchedulingConfig, group_id: str, batch_id: str | None) -> list[str]:
    """Whole-class teaching consumes every batch track, plus unbatched students."""
    if batch_id is not None:
        return ["batch:" + batch_id]
    batches = [item for item in config.batches if item.student_group_id == group_id]
    group = next(item for item in config.student_groups if item.id == group_id)
    result = ["batch:" + item.id for item in batches]
    if sum(item.strength for item in batches) < group.strength:
        result.append("group:" + group_id)
    return result


def placements(config: SchedulingConfig, occurrence: Occurrence) -> list[Placement]:
    item = occurrence.requirement
    faculty = next(member for member in config.faculty if member.id == item.faculty_id)
    strength = (
        next(batch.strength for batch in config.batches if batch.id == occurrence.batch_id)
        if occurrence.batch_id is not None else
        next(group.strength for group in config.student_groups if group.id == item.student_group_id)
    )
    rooms = [room for room in config.rooms if room.capacity >= strength and (
        (item.kind == "theory" and room.type == "classroom") or
        (item.kind == "practical" and room.type == "laboratory" and room.lab_type == item.required_lab_type)
    )]
    timetable_periods = periods(config)
    result = []
    for day in config.university.working_days:
        for index, (start, _) in enumerate(timetable_periods):
            block = timetable_periods[index:index + item.duration_periods]
            if len(block) != item.duration_periods or any(a[1] != b[0] for a, b in zip(block, block[1:])):
                continue
            end = block[-1][1]
            if not available(faculty.availability, day, start, end):
                continue
            if any(window.day == day and overlaps(start, end, minutes(window.start_time), minutes(window.end_time)) for window in faculty.unavailable_slots):
                continue
            for room in rooms:
                if available(room.availability, day, start, end):
                    result.append(Placement(day, start, end, room.id))
    return result


def make_session(occurrence: Occurrence, placement: Placement, *, locked: bool = False) -> ScheduledSession:
    item = occurrence.requirement
    return ScheduledSession(
        id=occurrence.id, teaching_requirement_id=item.id, occurrence_index=occurrence.index,
        subject_code=item.subject_code, subject_name=item.subject_name, kind=item.kind,
        student_group_id=item.student_group_id, batch_id=occurrence.batch_id,
        faculty_id=item.faculty_id, room_id=placement.room_id, day=placement.day,
        start_time=clock(placement.start), end_time=clock(placement.end),
        duration_periods=item.duration_periods, locked=locked,
    )
