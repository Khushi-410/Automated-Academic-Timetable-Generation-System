"""Validate complete generated or manually edited schedules."""

from collections import Counter, defaultdict
from itertools import combinations

from app.models.scheduling import SchedulingConfig
from app.models.timetable import Diagnostic, ScheduledSession, ValidationResult, session_id
from app.services.calendar import (
    Placement, make_session, minutes, occurrences, overlaps, placements, tracks,
)


def validate_schedule(config: SchedulingConfig, sessions: list[ScheduledSession]) -> ValidationResult:
    conflicts = []

    def report(code: str, message: str, ids: list[str]) -> None:
        conflicts.append(Diagnostic(code=code, message=message, related_entity_ids=ids))

    expected = {item.id: item for item in occurrences(config)}
    counts = Counter(session.id for session in sessions)
    valid_records = []
    candidate_cache = {}
    for item in expected.values():
        if counts[item.id] == 0:
            report("MISSING_SESSION", f"Missing {item.requirement.subject_code} session {item.index + 1}.", [item.id, item.requirement.id])
    for identifier, count in counts.items():
        if count > 1:
            report("DUPLICATE_SESSION", "A session occurrence is scheduled more than once.", [identifier])
    for session in sessions:
        item = expected.get(session.id)
        if item is None:
            report("UNKNOWN_SESSION", "Session ID does not identify a required occurrence.", [session.id])
            continue
        placement = Placement(session.day, minutes(session.start_time), minutes(session.end_time), session.room_id)
        canonical = make_session(item, placement, locked=session.locked)
        if session != canonical:
            report("SESSION_METADATA_MISMATCH", "Session metadata does not match its teaching requirement.", [session.id])
            continue
        cache_key = (item.requirement.id, item.batch_id)
        if cache_key not in candidate_cache:
            candidate_cache[cache_key] = set(placements(config, item))
        if placement not in candidate_cache[cache_key]:
            report("INVALID_PLACEMENT", "Session violates period alignment, consecutive duration, working hours, breaks, availability, room capacity, or room type.", [session.id, session.faculty_id, session.room_id])
        valid_records.append(session)

    for left, right in combinations(valid_records, 2):
        if left.day != right.day or not overlaps(minutes(left.start_time), minutes(left.end_time), minutes(right.start_time), minutes(right.end_time)):
            continue
        if left.faculty_id == right.faculty_id:
            report("FACULTY_OVERLAP", "A faculty member is assigned to overlapping sessions.", [left.id, right.id, left.faculty_id])
        if left.room_id == right.room_id:
            report("ROOM_OVERLAP", "A room is assigned to overlapping sessions.", [left.id, right.id, left.room_id])
        if left.student_group_id == right.student_group_id and (
            left.batch_id is None or right.batch_id is None or left.batch_id == right.batch_id
        ):
            report("STUDENT_OVERLAP", "Sessions involve overlapping students from the same class or batch.", [left.id, right.id, left.student_group_id])

    faculty_load = defaultdict(int)
    track_load = defaultdict(int)
    for session in valid_records:
        faculty_load[session.faculty_id, session.day] += session.duration_periods
        for track in tracks(config, session.student_group_id, session.batch_id):
            track_load[session.student_group_id, track, session.day] += session.duration_periods
    for member in config.faculty:
        for day in config.university.working_days:
            if member.max_daily_periods is not None and faculty_load[member.id, day] > member.max_daily_periods:
                report("FACULTY_DAILY_LIMIT", f"{member.name} exceeds the daily teaching limit on {day}.", [member.id])
    for group in config.student_groups:
        for (group_id, track, day), load in track_load.items():
            if group_id == group.id and group.max_daily_periods is not None and load > group.max_daily_periods:
                report("STUDENT_DAILY_LIMIT", f"Students in {track} exceed their daily period limit on {day}.", [group.id, track])

    indexed = {item.id: item for item in valid_records}
    for fixed in config.fixed_commitments:
        identifier = session_id(fixed.teaching_requirement_id, fixed.batch_id, fixed.occurrence_index)
        session = indexed.get(identifier)
        if session is None or (session.day, session.start_time, session.room_id) != (fixed.day, fixed.start_time, fixed.room_id):
            report("FIXED_COMMITMENT_CHANGED", "A fixed teaching commitment is missing or has moved.", [fixed.id, identifier])
    return ValidationResult(valid=not conflicts, conflicts=conflicts)
