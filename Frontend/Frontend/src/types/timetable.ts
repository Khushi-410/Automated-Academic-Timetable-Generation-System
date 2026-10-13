/** Shared frontend/backend domain contract. All cross-record references use stable string IDs. */
export type DayOfWeek = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday";
export type TimeString = `${number}${number}:${number}${number}` | string;
export type EntityId = string;

export interface TimeRange {
  startTime: TimeString;
  endTime: TimeString;
}

export interface ScheduledBreak extends TimeRange {
  id: EntityId;
  label: string;
}

export interface UniversityConfig {
  workingDays: DayOfWeek[];
  officialStartTime: TimeString;
  officialEndTime: TimeString;
  periodDurationMinutes: number;
  breaks: ScheduledBreak[];
}

export interface Room {
  id: EntityId;
  name: string;
  type: "classroom" | "laboratory";
  capacity: number;
  laboratoryType?: string;
  availability: Partial<Record<DayOfWeek, TimeRange[]>>;
}

export interface Faculty {
  id: EntityId;
  name: string;
  available: Partial<Record<DayOfWeek, TimeRange[]>>;
  unavailableSlots: Array<{ day: DayOfWeek; startTime: TimeString; endTime: TimeString }>;
  maxTeachingPeriodsPerDay?: number;
}

export interface StudentGroup {
  id: EntityId;
  programme: string;
  semester: string;
  section: string;
  strength: number;
}

export interface Batch {
  id: EntityId;
  studentGroupId: EntityId;
  name: string;
  strength: number;
}

export interface PreferredSlot {
  day?: DayOfWeek;
  startTime?: TimeString;
}

export interface TeachingRequirement {
  id: EntityId;
  subjectCode: string;
  subjectName: string;
  studentGroupId: EntityId;
  kind: "theory" | "practical";
  facultyId: EntityId;
  theoryPeriodsPerWeek?: number;
  practicalSessionsPerWeekPerBatch?: number;
  consecutivePeriodsPerSession?: number;
  requiredLaboratoryType?: string;
  preferredSlots?: PreferredSlot[];
}

export interface FixedCommitment {
  id: EntityId;
  teachingRequirementId: EntityId;
  batchId: EntityId | null;
  occurrenceIndex: number;
  day: DayOfWeek;
  startTime: TimeString;
  roomId: EntityId;
}

export interface SchedulingConfig {
  university: UniversityConfig;
  rooms: Room[];
  faculty: Faculty[];
  studentGroups: StudentGroup[];
  batches: Batch[];
  teachingRequirements: TeachingRequirement[];
  fixedCommitments: FixedCommitment[];
}

export interface ScheduledSession {
  id: EntityId;
  teachingRequirementId: EntityId;
  occurrenceIndex: number;
  subjectCode: string;
  subjectName: string;
  kind: "theory" | "practical";
  studentGroupId: EntityId;
  batchId: EntityId | null;
  facultyId: EntityId;
  roomId: EntityId;
  day: DayOfWeek;
  startTime: TimeString;
  endTime: TimeString;
  durationPeriods: number;
  /** A coordinator lock. Original fixed commitments are tracked separately by `fixedCommitments`. */
  locked: boolean;
}

export interface Diagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  relatedEntityIds: EntityId[];
  teachingRequirementId?: EntityId;
  suggestedChanges?: string[];
}

export interface UnassignedRequirement {
  teachingRequirementId: EntityId;
  subjectCode: string;
  expected: number;
  scheduled: number;
  unit: "periods" | "sessions";
}

export interface TimetableMetrics {
  requiredTheoryPeriods: number;
  scheduledTheoryPeriods: number;
  requiredPracticalSessions: number;
  scheduledPracticalSessions: number;
  preferencesSatisfied?: number;
  preferencesTotal?: number;
}

export interface ValidationResult {
  valid: boolean;
  conflicts: Diagnostic[];
}

export interface GenerateResponse {
  status: "feasible" | "infeasible" | "unknown";
  sessions: ScheduledSession[];
  diagnostics: Diagnostic[];
  unassignedRequirements: UnassignedRequirement[];
  metrics: TimetableMetrics;
}

export interface SavedTimetable {
  id: EntityId;
  name: string;
  status: "draft" | "published";
  config: SchedulingConfig;
  sessions: ScheduledSession[];
  validation?: ValidationResult;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorShape {
  error: { code: string; message: string; details?: unknown };
}

export interface GenerateRequest {
  config: SchedulingConfig;
  lockedSessions: ScheduledSession[];
}

export interface ValidateRequest {
  config: SchedulingConfig;
  sessions: ScheduledSession[];
}
