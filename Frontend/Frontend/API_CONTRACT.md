# Academic timetable API contract

All IDs are stable strings. Times are 24-hour `HH:mm` strings. Components use only `src/services/api.ts`; switching `VITE_USE_MOCK_API` to `false` selects these live routes.

## Core records

`SchedulingConfig` contains these arrays:

```ts
{
  university: {
    workingDays: DayOfWeek[];
    officialStartTime: "HH:mm";
    officialEndTime: "HH:mm";
    periodDurationMinutes: number;
    breaks: Array<{ id: string; label: string; startTime: "HH:mm"; endTime: "HH:mm" }>;
  };
  rooms: Room[];
  faculty: Faculty[];
  studentGroups: StudentGroup[];
  batches: Batch[];
  teachingRequirements: TeachingRequirement[];
  fixedCommitments: FixedCommitment[];
}
```

`ScheduledSession` is one logical session. A two-period practical stays a single record with `durationPeriods: 2`.

```ts
{
  id: string;
  teachingRequirementId: string;
  occurrenceIndex: number;
  subjectCode: string;
  subjectName: string;
  kind: "theory" | "practical";
  studentGroupId: string;
  batchId: string | null;
  facultyId: string;
  roomId: string;
  day: DayOfWeek;
  startTime: "HH:mm";
  endTime: "HH:mm";
  durationPeriods: number;
  locked: boolean;
}
```

## Generate

`POST /api/generate`

```json
{
  "config": { "university": { "workingDays": ["Monday"], "officialStartTime": "09:00", "officialEndTime": "14:30", "periodDurationMinutes": 50, "breaks": [] }, "rooms": [], "faculty": [], "studentGroups": [], "batches": [], "teachingRequirements": [], "fixedCommitments": [] },
  "lockedSessions": []
}
```

Return `GenerateResponse`:

```json
{
  "status": "feasible",
  "sessions": [{ "id": "session-dfis101-1", "teachingRequirementId": "requirement-dfis101", "occurrenceIndex": 1, "subjectCode": "DFIS101", "subjectName": "Digital Forensics Foundations", "kind": "theory", "studentGroupId": "group-dfis-i-a", "batchId": null, "facultyId": "faculty-anita", "roomId": "room-101", "day": "Monday", "startTime": "09:00", "endTime": "09:50", "durationPeriods": 1, "locked": false }],
  "diagnostics": [],
  "unassignedRequirements": [],
  "metrics": { "requiredTheoryPeriods": 3, "scheduledTheoryPeriods": 3, "requiredPracticalSessions": 2, "scheduledPracticalSessions": 2, "preferencesSatisfied": 2, "preferencesTotal": 2 }
}
```

`status` is `"feasible"`, `"infeasible"`, or `"unknown"`. An `unknown` result must not be interpreted as infeasibility. On an infeasible result, `sessions` must be empty or otherwise explicitly non-publishable and `diagnostics` must explain unmet hard constraints.

## Validate

`POST /api/validate`

```json
{ "config": { "...": "SchedulingConfig" }, "sessions": [{ "...": "ScheduledSession" }] }
```

```json
{
  "valid": false,
  "conflicts": [{ "code": "OVERLAPPING_SESSION", "severity": "error", "message": "DFIS101 and DFIS102P overlap for the same student group on Monday.", "relatedEntityIds": ["session-a", "session-b"] }]
}
```

## Save, retrieve, update, and publish

| Method and route | Request | Response |
| --- | --- | --- |
| `POST /api/timetables` | `{ name, config, sessions }` | `SavedTimetable` |
| `GET /api/timetables` | none | `SavedTimetable[]` |
| `GET /api/timetables/{id}` | none | `SavedTimetable` |
| `PUT /api/timetables/{id}` | updated draft fields | `SavedTimetable` |
| `POST /api/timetables/{id}/publish` | none | validated, published `SavedTimetable` |

```ts
interface SavedTimetable {
  id: string;
  name: string;
  status: "draft" | "published";
  config: SchedulingConfig;
  sessions: ScheduledSession[];
  validation?: { valid: boolean; conflicts: Diagnostic[] };
  createdAt: string;
  updatedAt: string;
}
```

## Diagnostics and errors

```ts
interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  relatedEntityIds: string[];
  teachingRequirementId?: string;
  suggestedChanges?: string[];
}
```

Non-2xx responses use one consistent envelope:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Publishing is blocked until every conflict is resolved.", "details": [] } }
```
