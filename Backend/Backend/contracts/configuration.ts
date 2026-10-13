// Step 2 backend configuration contract. JSON uses camelCase.
export type Day =
  | "monday" | "tuesday" | "wednesday" | "thursday"
  | "friday" | "saturday" | "sunday";

export interface TimeRange {
  startTime: string; // 24-hour HH:mm
  endTime: string;
}

export interface AvailabilityWindow extends TimeRange {
  day: Day;
}

export interface UniversityConfig extends TimeRange {
  workingDays: Day[];
  periodDurationMinutes: number;
  breaks: Array<TimeRange & { id?: string | null; label?: string }>;
}

export interface Room {
  id: string;
  name: string;
  type: "classroom" | "laboratory";
  capacity: number;
  labType?: string | null;
  availability: AvailabilityWindow[];
}

export interface Faculty {
  id: string;
  name: string;
  availability: AvailabilityWindow[];
  unavailableSlots?: AvailabilityWindow[];
  maxDailyPeriods?: number | null;
}

export interface StudentGroup {
  id: string;
  programme: string;
  semester: number;
  section: string;
  strength: number;
  maxDailyPeriods?: number | null;
}

export interface Batch {
  id: string;
  name: string;
  studentGroupId: string;
  strength: number;
}

interface RequirementBase {
  id: string;
  subjectCode: string;
  subjectName: string;
  studentGroupId: string;
  facultyId: string;
  preferredSlots?: AvailabilityWindow[];
}

export interface TheoryRequirement extends RequirementBase {
  kind: "theory";
  periodsPerWeek: number;
  sessionsPerWeek?: null;
  durationPeriods?: 1;
  batchIds?: [];
  requiredLabType?: null;
}

export interface PracticalRequirement extends RequirementBase {
  kind: "practical";
  periodsPerWeek?: null;
  sessionsPerWeek: number; // Per selected batch per week
  durationPeriods?: number; // Defaults to 1; set to 2 for the DFIS demo
  batchIds: string[];
  requiredLabType: string;
}

export type TeachingRequirement = TheoryRequirement | PracticalRequirement;

export interface FixedCommitment {
  id: string;
  teachingRequirementId: string;
  batchId?: string | null;
  occurrenceIndex: number; // Zero-based, within requirement and batch
  day: Day;
  startTime: string;
  roomId: string;
}

export interface SchedulingConfig {
  university: UniversityConfig;
  rooms: Room[];
  faculty: Faculty[];
  studentGroups: StudentGroup[];
  batches?: Batch[];
  teachingRequirements: TeachingRequirement[];
  fixedCommitments?: FixedCommitment[];
}

export interface ConfigurationCheck {
  valid: boolean; // Input validity only; does not indicate solver feasibility
  message: string;
  requiredTheoryPeriods: number;
  requiredPracticalSessions: number;
  requiredPracticalPeriods: number;
}
