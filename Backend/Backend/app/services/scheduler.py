"""CP-SAT scheduling: one candidate per occurrence, with resource constraints."""

from collections import defaultdict

from ortools.sat.python import cp_model

from app.core.config import get_settings
from app.models.timetable import (
    Diagnostic, GenerateRequest, GenerateResponse, GenerationMetrics,
    UnassignedRequirement, session_id,
)
from app.services.calendar import (
    available, make_session, minutes, occurrences, overlaps, periods, placements, tracks,
)
from app.services.validation import validate_schedule


def generate_timetable(request: GenerateRequest) -> GenerateResponse:
    config = request.config
    settings = get_settings()
    totals = {"theory": 0, "practical_sessions": 0, "practical_periods": 0}
    outstanding = []
    preferences_total = 0
    for item in config.teaching_requirements:
        count = item.periods_per_week if item.kind == "theory" else item.sessions_per_week
        for batch_id in ([None] if item.kind == "theory" else item.batch_ids):
            outstanding.append(UnassignedRequirement(
                teaching_requirement_id=item.id, subject_code=item.subject_code,
                batch_id=batch_id, missing_sessions=count, missing_periods=count * item.duration_periods,
            ))
            if item.preferred_slots:
                preferences_total += count
            if item.kind == "theory":
                totals["theory"] += count
            else:
                totals["practical_sessions"] += count
                totals["practical_periods"] += count * item.duration_periods

    metrics = GenerationMetrics(
        required_sessions=totals["theory"] + totals["practical_sessions"], scheduled_sessions=0,
        required_theory_periods=totals["theory"], scheduled_theory_periods=0,
        required_practical_sessions=totals["practical_sessions"], scheduled_practical_sessions=0,
        required_practical_periods=totals["practical_periods"], scheduled_practical_periods=0,
        preferences_total=preferences_total,
    )

    def failed(status: str, diagnostics: list[Diagnostic]) -> GenerateResponse:
        return GenerateResponse(status=status, diagnostics=diagnostics, unassigned_requirements=outstanding, metrics=metrics)

    # Bound memory before expanding occurrences. Reaching a service limit is not
    # evidence of infeasibility, so return unknown rather than a partial success.
    if metrics.required_sessions > 5000:
        return failed("unknown", [Diagnostic(
            code="MODEL_SIZE_LIMIT", message="This request exceeds the service limit of 5000 session occurrences.",
            suggested_changes=["Split independent departments into separate scheduling requests."],
        )])

    calendar_periods = periods(config)
    diagnostics = []
    for member in config.faculty:
        assigned = [item for item in config.teaching_requirements if item.faculty_id == member.id]
        demand = sum((item.periods_per_week if item.kind == "theory" else item.sessions_per_week * len(item.batch_ids)) * item.duration_periods for item in assigned)
        capacity = 0
        for day in config.university.working_days:
            usable = sum(
                available(member.availability, day, start, end) and not any(
                    window.day == day and overlaps(start, end, minutes(window.start_time), minutes(window.end_time))
                    for window in member.unavailable_slots
                ) for start, end in calendar_periods
            )
            capacity += min(usable, member.max_daily_periods) if member.max_daily_periods is not None else usable
        if demand > capacity:
            codes = ", ".join(dict.fromkeys(item.subject_code for item in assigned))
            diagnostics.append(Diagnostic(
                code="FACULTY_CAPACITY_SHORTFALL",
                message=f"{codes} requires {demand} weekly teaching periods, but {member.name} is available for at most {capacity} periods after breaks, unavailability, and daily limits.",
                related_entity_ids=[member.id, *(item.id for item in assigned)],
                teaching_requirement_id=assigned[0].id if len(assigned) == 1 else None,
                suggested_changes=["Increase faculty availability, revise the daily limit, reduce teaching demand, or assign another eligible faculty member."],
            ))
    if diagnostics:
        return failed("infeasible", diagnostics)

    required = occurrences(config)
    locked = {item.id: item for item in request.locked_sessions}
    fixed = {
        session_id(item.teaching_requirement_id, item.batch_id, item.occurrence_index): item
        for item in config.fixed_commitments
    }
    model = cp_model.CpModel()
    resource_use = defaultdict(list)
    daily_faculty = defaultdict(list)
    daily_students = defaultdict(list)
    choices = {}
    assumption_occurrences = {}
    preferences = []
    candidate_cache = {}
    total_candidates = 0

    for occurrence in required:
        item = occurrence.requirement
        cache_key = (item.id, occurrence.batch_id)
        if cache_key not in candidate_cache:
            candidate_cache[cache_key] = placements(config, occurrence)
        domain = candidate_cache[cache_key]
        if occurrence.id in fixed:
            commitment = fixed[occurrence.id]
            domain = [place for place in domain if (place.day, place.start, place.room_id) == (commitment.day, minutes(commitment.start_time), commitment.room_id)]
        if occurrence.id in locked:
            lock = locked[occurrence.id]
            domain = [place for place in domain if (place.day, place.start, place.end, place.room_id) == (lock.day, minutes(lock.start_time), minutes(lock.end_time), lock.room_id)]
        if not domain:
            diagnostics.append(Diagnostic(
                code="NO_LEGAL_PLACEMENT",
                message=f"{item.subject_code}, occurrence {occurrence.index + 1}" + (f", batch {occurrence.batch_id}" if occurrence.batch_id else "") + " has no legal placement satisfying consecutive periods, room type/capacity, availability, breaks, and any fixed or locked assignment.",
                related_entity_ids=[occurrence.id, item.id, item.faculty_id, item.student_group_id],
                teaching_requirement_id=item.id,
                suggested_changes=["Check room capacity and laboratory type, consecutive faculty/room availability, and fixed or locked sessions."],
            ))
            continue
        total_candidates += len(domain)
        if total_candidates > settings.solver_max_candidates:
            return failed("unknown", [Diagnostic(code="MODEL_SIZE_LIMIT", message="The candidate placement limit was reached before solving. Feasibility is unknown.")])
        occurrence_tracks = tracks(config, item.student_group_id, occurrence.batch_id)
        options = []
        for index, place in enumerate(domain):
            variable = model.new_bool_var(f"{occurrence.id}:{index}")
            options.append((variable, place))
            for period_start, period_end in calendar_periods:
                if place.start <= period_start and period_end <= place.end:
                    resource_use["faculty", item.faculty_id, place.day, period_start].append(variable)
                    resource_use["room", place.room_id, place.day, period_start].append(variable)
                    for track in occurrence_tracks:
                        resource_use["student", track, place.day, period_start].append(variable)
            daily_faculty[item.faculty_id, place.day].append(variable * item.duration_periods)
            for track in occurrence_tracks:
                daily_students[item.student_group_id, track, place.day].append(variable * item.duration_periods)
            if item.preferred_slots and available(item.preferred_slots, place.day, place.start, place.end):
                preferences.append(variable)
        presence = model.new_bool_var("required:" + occurrence.id)
        model.add(sum(variable for variable, _ in options) == presence)
        model.add_assumption(presence)
        assumption_occurrences[presence.index] = occurrence
        choices[occurrence.id] = options

    if diagnostics:
        return failed("infeasible", diagnostics)
    for variables in resource_use.values():
        model.add_at_most_one(variables)
    for member in config.faculty:
        if member.max_daily_periods is not None:
            for day in config.university.working_days:
                model.add(sum(daily_faculty[member.id, day]) <= member.max_daily_periods)
    for group in config.student_groups:
        if group.max_daily_periods is not None:
            for (group_id, track, day), expressions in daily_students.items():
                if group_id == group.id:
                    model.add(sum(expressions) <= group.max_daily_periods)
    if preferences:
        model.maximize(sum(preferences))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = settings.solver_time_limit_seconds
    # Single-worker solving supports useful assumption-based infeasibility cores.
    solver.parameters.num_search_workers = 1
    result = solver.solve(model)
    metrics.solver_wall_time_seconds = solver.wall_time

    if result == cp_model.INFEASIBLE:
        core = [assumption_occurrences[index] for index in solver.sufficient_assumptions_for_infeasibility() if index in assumption_occurrences]
        ids = list(dict.fromkeys(entity for occurrence in core for entity in [occurrence.id, occurrence.requirement.id, occurrence.requirement.faculty_id, occurrence.requirement.student_group_id]))
        codes = ", ".join(dict.fromkeys(occurrence.requirement.subject_code for occurrence in core))
        return failed("infeasible", [Diagnostic(
            code="CONSTRAINT_CONFLICT",
            message=f"No complete timetable exists. The conflicting session set includes {codes or 'the entered requirements'} under the configured resource, overlap, daily-limit, fixed, and locked constraints. This set may not be minimal.",
            related_entity_ids=ids,
            suggested_changes=["Review the related sessions, increase compatible resource availability, or revise fixed sessions, locks, and daily teaching limits."],
        )])
    if result not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return failed("unknown", [Diagnostic(
            code="SOLVER_MODEL_INVALID" if result == cp_model.MODEL_INVALID else "SOLVER_TIME_LIMIT",
            message="The solver stopped without a complete solution or proof of infeasibility.",
            suggested_changes=["Retry with a longer solver time limit or reduce the request size."],
        )])

    sessions = [
        make_session(occurrence, next(place for variable, place in choices[occurrence.id] if solver.value(variable)), locked=occurrence.id in locked)
        for occurrence in required
    ]
    validation = validate_schedule(config, sessions)
    if not validation.valid:
        # Never return an invalid/partial timetable as successful, even if a
        # future solver change accidentally introduces a modelling regression.
        return failed("unknown", [Diagnostic(code="INTERNAL_VALIDATION_FAILED", message="The generated schedule failed independent validation. No timetable was returned."), *validation.conflicts])
    day_order = {day: index for index, day in enumerate(config.university.working_days)}
    sessions.sort(key=lambda item: (day_order[item.day], item.start_time, item.room_id, item.id))
    metrics.scheduled_sessions = len(sessions)
    metrics.scheduled_theory_periods = totals["theory"]
    metrics.scheduled_practical_sessions = totals["practical_sessions"]
    metrics.scheduled_practical_periods = totals["practical_periods"]
    metrics.preferences_satisfied = sum(solver.value(variable) for variable in preferences)
    return GenerateResponse(status="feasible", sessions=sessions, metrics=metrics)
