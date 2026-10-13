# Backend API contract

Base URL: `http://127.0.0.1:8000`. Paths below include `/api`.
The frontend environment variable contains the base URL without `/api`.
JSON uses **camelCase**. Python code uses snake_case internally.
Authoritative field descriptions and schemas are also available at `/docs`
and `/openapi.json`.

## Available endpoints in Step 4

| Method | Path | Input | Response |
| --- | --- | --- | --- |
| GET | `/api/health` | None | Service health |
| GET | `/api/presets/dfis` | None | `SchedulingConfig` |
| GET | `/api/presets/dfis-impossible` | None | `SchedulingConfig` with insufficient theory faculty availability |
| POST | `/api/config/validate` | `SchedulingConfig` directly | `ConfigurationCheck`, or HTTP 422 |
| POST | `/api/generate` | `{ config, lockedSessions }` | `GenerateResponse`, or HTTP 422 |
| POST | `/api/validate` | `{ config, sessions }` | `ValidationResult`, or HTTP 422 |
| POST | `/api/timetables` | `{ name, config, sessions }` | Saved timetable, HTTP 201 |
| GET | `/api/timetables` | None | Saved timetable array |
| GET | `/api/timetables/{id}` | None | Saved timetable |
| PUT | `/api/timetables/{id}` | Partial name/config/sessions | Updated draft |
| POST | `/api/timetables/{id}/publish` | None | Validated published timetable |

Do not wrap the configuration in `{ "config": ... }` for `/api/config/validate`.
The `/api/generate` and `/api/validate` endpoints use wrapper objects as
described in the frontend build prompt.

## Configuration data

Copy `contracts/configuration.ts` and `contracts/timetable.ts` into the
frontend's types directory.
Full request examples are in `examples/dfis-config.json` and
`examples/dfis-impossible-config.json`.

The root configuration contains `university`, `rooms`, `faculty`,
`studentGroups`, `batches`, `teachingRequirements`, and `fixedCommitments`.

All IDs are nonempty strings and must be unique within their entity collection.
All population, duration, semester, and weekly-count fields are positive JSON
integers, not numeric strings or booleans. Unknown fields are rejected so that
misspelled constraints are not silently ignored.

### Calendar and availability

- Days are lowercase full names: `monday` through `sunday`.
- Times use exact 24-hour `HH:mm` strings, for example `09:00`.
- Ranges are half-open: start is included, end is excluded. Adjacent ranges
  therefore do not overlap. Overnight ranges are unsupported.
- University breaks apply on every configured working day and must fit within
  university hours without overlapping each other.
- `periodDurationMinutes` is the duration of one teaching period.
- Room and faculty `availability` are arrays of `{ day, startTime, endTime }`.
  An empty array means no availability, not unrestricted availability.
- Faculty `unavailableSlots` subtract from their availability.
- `maxDailyPeriods` is optional on faculty and student groups. For a student
  group, the later solver will enforce the limit for each student's track,
  counting whole-class teaching plus that student's batch teaching.

### Rooms, groups, and batches

Rooms have `type: "classroom" | "laboratory"`, `capacity`, and availability.
Laboratories require `labType`; classrooms must leave it null or omit it.
Use the same exact `labType` value on the practical requirement.

Student groups identify a programme, semester, and section, with `strength`.
Batches reference their `studentGroupId`. Within a group, batches represent
disjoint student subsets. Their total strength cannot exceed the group strength.
Students outside configured batches still participate in whole-class theory.

### Teaching requirements

A requirement belongs to one student group and one assigned faculty member.
Use separate requirement records for theory and practical teaching, even when
they relate to the same subject.

Theory uses `kind: "theory"` and `periodsPerWeek`. Each theory occurrence is
one period for the whole student group. Leave practical-only fields null or
omit them; `batchIds` must be empty.

Practical uses `kind: "practical"`, `sessionsPerWeek`, `durationPeriods`,
`batchIds`, and `requiredLabType`. `sessionsPerWeek` is **per selected batch**.
For the DFIS example, one session multiplied by two batches produces two
practical sessions. Each occupies two consecutive periods, for four practical
teaching periods in total. Set `durationPeriods` explicitly for multi-period labs.

`preferredSlots` contains availability-style windows. These express soft
preferences and will not override mandatory scheduling constraints.

### Fixed commitments

Specify `teachingRequirementId`, `batchId` for practicals, `occurrenceIndex`,
`day`, `startTime`, and `roomId`, plus an ID for the commitment itself.

`occurrenceIndex` starts at zero. For three weekly theory periods the valid
values are 0, 1, and 2. For practicals the numbering restarts within each batch.
Duration and faculty come from the requirement. One occurrence cannot have
multiple fixed commitments. User locking will be represented separately in
the later generation request.

## Configuration validation response

For either DFIS preset, a structurally valid request returns:

```json
{
  "valid": true,
  "message": "Configuration structure and references are valid. Scheduling feasibility has not been checked.",
  "requiredTheoryPeriods": 3,
  "requiredPracticalSessions": 2,
  "requiredPracticalPeriods": 4
}
```

This endpoint checks data shape, times, counts, entity references, and batch
populations. It does **not** run the solver, confirm capacity/availability is
sufficient, validate session overlaps, or certify a timetable for publication.
The impossible preset is deliberately well-formed; it must reach the solver
to produce an infeasibility explanation.

## Error response

HTTP 422 means an invalid input, for example a missing faculty reference:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the supplied input values.",
    "details": [
      {
        "location": ["body"],
        "message": "Value error, Requirement req-dfis103-theory references an unknown facultyId.",
        "type": "value_error"
      }
    ]
  }
}
```

Locations may point to individual nested fields or to the configuration as a
whole for cross-record errors. Display the supplied messages to the coordinator.

## Saved timetables

Saved records contain `id`, `name`, `status`, `config`, `sessions`, `validation`,
`createdAt`, and `updatedAt`. Timestamps are ISO 8601 UTC strings. SQLite persists
records across process restarts. Saving permits incomplete drafts; publication
validates the current stored snapshot and rejects conflicts or an empty timetable
with HTTP 422, code `VALIDATION_FAILED`, and diagnostic details. Updates reset
status to draft and recompute validation. The frontend saves current edits before
publishing. Unknown IDs return HTTP 404 with code `TIMETABLE_NOT_FOUND`.

Breaks optionally preserve `id` and `label` alongside times so named breaks
survive reopening. `../Frontend/src/services/apiAdapter.ts` converts display
records to the canonical wire schemas documented here.

Supporting faculty names, room names, subject titles, and codes in the preset
are fictional demo data. The class strength, batch sizes, and weekly teaching
counts follow the selected problem statement example.

## Generation

`POST /api/generate` accepts `{ "config": SchedulingConfig, "lockedSessions": [] }`.
Full request bodies are provided in `examples/dfis-generate-request.json` and
`examples/dfis-impossible-generate-request.json`. Swagger `/docs` includes both
as selectable examples, so no manual JSON construction is needed for the demo.

Every required theory occurrence and every required practical batch occurrence
receives a stable session ID. One two-period practical is one session with
`durationPeriods: 2`. The DFIS result has five sessions representing seven
teaching periods: three theory and four practical periods.

The solver enforces faculty, room, and student occupancy at each teaching period;
whole-class theory consumes every batch's student track. Different batches can
run simultaneously when they have distinct faculty and rooms. Daily student
limits are counted per student track rather than summing parallel batch loads.
Theory uses a classroom; practicals require a laboratory with matching type.
Faculty unavailability overrides availability. All room and faculty availability
windows must cover the entire session, including both periods of a practical.
Adjacent availability windows are merged for coverage checks.

Periods are built from each uninterrupted segment of university working hours,
starting at opening time and restarting after each break. Any leftover segment
shorter than a period is unavailable for teaching. Practical periods must be
adjacent in real time, so they cannot bridge breaks or short leftover intervals.

The response is always a structured result for well-formed requests:

| Status | Meaning | Sessions |
| --- | --- | --- |
| `feasible` | Complete schedule found and validated | All required sessions |
| `infeasible` | A necessary-condition check or solver proved no complete schedule exists | Empty |
| `unknown` | No proof or complete valid result, including solver time/service limits | Empty |

HTTP 200 can contain any of these statuses; inspect `status` before showing
success. HTTP 422 still means the request itself is malformed.

`unassignedRequirements` on unsuccessful runs lists all outstanding requirements
because no partial schedule is returned. These are not all necessarily causes of
infeasibility. Diagnostics identify proved shortfalls or a conflicting session
set. A solver conflict set is not claimed to be minimal, and its related IDs are
context for the coordinator rather than proof that a particular constraint is
the sole cause.

`preferredSlots` are soft windows. The objective maximizes the number of sessions
fully inside their requirement's preferred windows. `preferencesTotal` counts
session occurrences with any preferred window, and `preferencesSatisfied` counts
those placed within one. A feasible result need not be optimal if the search time
limit is reached after finding a complete schedule.

The default solver search limit is 10 seconds, configurable with
`SOLVER_TIME_LIMIT_SECONDS` (positive, at most 120). Candidate generation and
validation add processing time outside the solver search. Requests over 5000
session occurrences or `SOLVER_MAX_CANDIDATES` (default 200000) candidate placements
return `unknown` to bound model size. These limits are not infeasibility evidence.

## Locked regeneration

Send selected complete session objects from the previous result in
`lockedSessions`. Every entry is treated as a lock, regardless of its incoming
`locked` flag. The returned matching session has `locked: true` and retains its
ID, day, start time, end time, and room. Other sessions are free to move, but a
regeneration is not guaranteed to produce a different arrangement.

Original fixed commitments remain enforced as well. A fixed/locked conflict
produces an infeasible result. Unknown, duplicate, or stale session metadata
produces HTTP 422. Obtain IDs from generation rather than synthesizing them.

## Timetable validation and manual editing

`POST /api/validate` accepts `{ "config": SchedulingConfig, "sessions": [...] }`.
Use the full schedule, including unchanged sessions, when validating an edit.
Stable IDs and occurrence metadata must be retained when moving a session.

A valid complete schedule returns:

```json
{ "valid": true, "conflicts": [] }
```

An invalid schedule returns HTTP 200 with `valid: false` and diagnostics for
missing/duplicate sessions, metadata mismatches, illegal placements, faculty,
room or student overlaps, daily limits, and moved fixed commitments. Reject the
proposed edit in the frontend and retain the previous valid schedule.

`locked` is a regeneration flag; this stateless validation endpoint cannot
compare an edit with a prior saved lock. The frontend prevents manual editing
of locked sessions until unlocked. Saved drafts retain flags for regeneration;
publication validates the stored schedule's mandatory rules.
