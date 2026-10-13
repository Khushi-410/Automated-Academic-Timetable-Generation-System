// Step 3 generation and validation contract; keep beside configuration.ts.
import type { Day, SchedulingConfig } from "./configuration";

export interface ScheduledSession {
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
  day: Day;
  startTime: string;
  endTime: string;
  durationPeriods: number;
  locked: boolean;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  relatedEntityIds: string[];
  teachingRequirementId: string | null;
  suggestedChanges: string[];
}

export interface GenerateRequest {
  config: SchedulingConfig;
  lockedSessions?: ScheduledSession[];
}

export interface ValidationRequest {
  config: SchedulingConfig;
  sessions: ScheduledSession[];
}

export interface ValidationResult {
  valid: boolean;
  conflicts: Diagnostic[];
}

export interface UnassignedRequirement {
  teachingRequirementId: string;
  subjectCode: string;
  batchId: string | null;
  missingSessions: number;
  missingPeriods: number;
}

export interface GenerationMetrics {
  requiredSessions: number;
  scheduledSessions: number;
  requiredTheoryPeriods: number;
  scheduledTheoryPeriods: number;
  requiredPracticalSessions: number;
  scheduledPracticalSessions: number;
  requiredPracticalPeriods: number;
  scheduledPracticalPeriods: number;
  preferencesTotal: number;
  preferencesSatisfied: number;
  solverWallTimeSeconds: number;
}

export interface GenerateResponse {
  status: "feasible" | "infeasible" | "unknown";
  sessions: ScheduledSession[];
  diagnostics: Diagnostic[];
  unassignedRequirements: UnassignedRequirement[];
  metrics: GenerationMetrics;
}
