import {
  dfisConfig,
  feasibleMetrics,
  feasibleResponse,
  impossibleResponse,
} from "../data/fixtures";
import { timesOverlap } from "../lib/time";
import type {
  ApiErrorShape,
  Diagnostic,
  GenerateRequest,
  GenerateResponse,
  SavedTimetable,
  ScheduledSession,
  SchedulingConfig,
  ValidateRequest,
  ValidationResult,
} from "../types/timetable";

export interface TimetableApi {
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  validate(request: ValidateRequest): Promise<ValidationResult>;
  saveDraft(input: { name: string; config: SchedulingConfig; sessions: ScheduledSession[] }): Promise<SavedTimetable>;
  listTimetables(): Promise<SavedTimetable[]>;
  getTimetable(id: string): Promise<SavedTimetable>;
  updateTimetable(id: string, input: Partial<Pick<SavedTimetable, "name" | "config" | "sessions">>): Promise<SavedTimetable>;
  publishTimetable(id: string): Promise<SavedTimetable>;
}

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
export const usingMockApi = import.meta.env.VITE_USE_MOCK_API !== "false";

class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorShape | null;
    throw new ApiError(body?.error.code ?? `HTTP_${response.status}`, body?.error.message ?? "The timetable service could not complete this request.", body?.error.details);
  }
  return response.json() as Promise<T>;
}

const storageKey = "acadence.mock-timetables";
const clone = <T,>(value: T): T => structuredClone(value);
const isImpossibleDemo = (config: SchedulingConfig) => config.teachingRequirements.some((item) => item.subjectCode === "DFIS103");
const isDfisDemo = (config: SchedulingConfig) => config.studentGroups.length === 1
  && config.studentGroups[0].programme === dfisConfig.studentGroups[0].programme
  && config.teachingRequirements.length === 2
  && config.teachingRequirements.some((item) => item.subjectCode === "DFIS101")
  && config.teachingRequirements.some((item) => item.subjectCode === "DFIS102P");

function readDrafts(): SavedTimetable[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as SavedTimetable[];
  } catch {
    return [];
  }
}

function writeDrafts(items: SavedTimetable[]) {
  localStorage.setItem(storageKey, JSON.stringify(items));
}

function validateSessions(config: SchedulingConfig, sessions: ScheduledSession[]): ValidationResult {
  const conflicts: Diagnostic[] = [];
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i];
      const b = sessions[j];
      if (a.day !== b.day || !timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) continue;
      const sharedResource = a.facultyId === b.facultyId
        ? "faculty"
        : a.roomId === b.roomId
          ? "room"
          : a.studentGroupId === b.studentGroupId
            ? "student group"
            : null;
      if (sharedResource) {
        conflicts.push({
          code: "OVERLAPPING_SESSION",
          severity: "error",
          message: `${a.subjectCode} and ${b.subjectCode} overlap for the same ${sharedResource} on ${a.day}.`,
          relatedEntityIds: [a.id, b.id],
        });
      }
    }
  }

  for (const session of sessions) {
    const room = config.rooms.find((item) => item.id === session.roomId);
    const group = config.studentGroups.find((item) => item.id === session.studentGroupId);
    const batch = session.batchId ? config.batches.find((item) => item.id === session.batchId) : undefined;
    const requirement = config.teachingRequirements.find((item) => item.id === session.teachingRequirementId);
    const faculty = config.faculty.find((item) => item.id === session.facultyId);
    const strength = batch?.strength ?? group?.strength ?? 0;
    if (!config.university.workingDays.includes(session.day)) {
      conflicts.push({ code: "NON_WORKING_DAY", severity: "error", message: `${session.subjectCode} is set on a non-working day.`, relatedEntityIds: [session.id] });
    }
    if (session.startTime < config.university.officialStartTime || session.endTime > config.university.officialEndTime) {
      conflicts.push({ code: "OUTSIDE_WORKING_HOURS", severity: "error", message: `${session.subjectCode} falls outside official university hours.`, relatedEntityIds: [session.id] });
    }
    if (config.university.breaks.some((item) => timesOverlap(session.startTime, session.endTime, item.startTime, item.endTime))) {
      conflicts.push({ code: "SCHEDULED_BREAK", severity: "error", message: `${session.subjectCode} overlaps a scheduled break.`, relatedEntityIds: [session.id] });
    }
    const availableRanges = faculty?.available[session.day];
    if (faculty && (!availableRanges || !availableRanges.some((range) => range.startTime <= session.startTime && range.endTime >= session.endTime))) {
      conflicts.push({ code: "FACULTY_UNAVAILABLE", severity: "error", message: `${faculty.name} is unavailable for ${session.subjectCode} at that time.`, relatedEntityIds: [session.id, faculty.id] });
    }
    if (faculty?.unavailableSlots.some((slot) => slot.day === session.day && timesOverlap(session.startTime, session.endTime, slot.startTime, slot.endTime))) {
      conflicts.push({ code: "FACULTY_BLOCKED_SLOT", severity: "error", message: `${faculty.name} has an unavailable slot that conflicts with ${session.subjectCode}.`, relatedEntityIds: [session.id, faculty.id] });
    }
    const roomAvailabilityConfigured = room && Object.keys(room.availability).length > 0;
    const roomRanges = room?.availability[session.day];
    if (room && roomAvailabilityConfigured && (!roomRanges || !roomRanges.some((range) => range.startTime <= session.startTime && range.endTime >= session.endTime))) {
      conflicts.push({ code: "ROOM_UNAVAILABLE", severity: "error", message: `${room.name} is unavailable for ${session.subjectCode} at that time.`, relatedEntityIds: [session.id, room.id] });
    }
    if (room && room.capacity < strength) {
      conflicts.push({
        code: "ROOM_CAPACITY", severity: "error", message: `${room.name} has capacity ${room.capacity}, below the required ${strength}.`, relatedEntityIds: [session.id, room.id],
      });
    }
    if (session.kind === "practical" && room?.type !== "laboratory") {
      conflicts.push({ code: "LABORATORY_REQUIRED", severity: "error", message: `${session.subjectCode} is practical and requires a laboratory.`, relatedEntityIds: [session.id, session.roomId] });
    }
    if (session.kind === "practical" && requirement?.requiredLaboratoryType && room?.laboratoryType !== requirement.requiredLaboratoryType) {
      conflicts.push({ code: "LAB_TYPE_REQUIRED", severity: "error", message: `${session.subjectCode} requires a ${requirement.requiredLaboratoryType} laboratory.`, relatedEntityIds: [session.id, session.roomId] });
    }
  }
  for (const faculty of config.faculty) {
    if (!faculty.maxTeachingPeriodsPerDay) continue;
    for (const day of config.university.workingDays) {
      const assigned = sessions.filter((session) => session.facultyId === faculty.id && session.day === day);
      const periods = assigned.reduce((sum, session) => sum + session.durationPeriods, 0);
      if (periods > faculty.maxTeachingPeriodsPerDay) {
        conflicts.push({ code: "FACULTY_DAILY_LIMIT", severity: "error", message: `${faculty.name} exceeds the daily teaching limit of ${faculty.maxTeachingPeriodsPerDay} periods on ${day}.`, relatedEntityIds: assigned.map((session) => session.id).concat(faculty.id) });
      }
    }
  }
  return { valid: conflicts.length === 0, conflicts };
}

const mockApi: TimetableApi = {
  async generate({ config, lockedSessions }) {
    await new Promise((resolve) => setTimeout(resolve, 550));
    if (isImpossibleDemo(config)) return clone(impossibleResponse);
    if (!isDfisDemo(config)) {
      return {
        status: "unknown",
        sessions: [],
        diagnostics: [{
          code: "MOCK_SCOPE_LIMIT", severity: "warning",
          message: "Mock mode only schedules the supplied DFIS presets. Connect the FastAPI solver to generate a new configuration.", relatedEntityIds: [],
        }],
        unassignedRequirements: [],
        metrics: { requiredTheoryPeriods: 0, scheduledTheoryPeriods: 0, requiredPracticalSessions: 0, scheduledPracticalSessions: 0 },
      };
    }
    const fixture = clone(feasibleResponse);
    fixture.sessions = fixture.sessions.map((session) => {
      const locked = lockedSessions.find((item) => item.id === session.id);
      return locked ? { ...locked, locked: true } : session;
    });
    const validation = validateSessions(config, fixture.sessions);
    if (!validation.valid) {
      return { ...fixture, status: "infeasible", sessions: [], diagnostics: validation.conflicts, unassignedRequirements: [], metrics: feasibleMetrics };
    }
    return fixture;
  },

  async validate({ config, sessions }) {
    await new Promise((resolve) => setTimeout(resolve, 220));
    return validateSessions(config, sessions);
  },

  async saveDraft({ name, config, sessions }) {
    const now = new Date().toISOString();
    const validation = validateSessions(config, sessions);
    const record: SavedTimetable = { id: `draft-${crypto.randomUUID()}`, name, status: "draft", config: clone(config), sessions: clone(sessions), validation, createdAt: now, updatedAt: now };
    writeDrafts([record, ...readDrafts()]);
    return record;
  },

  async listTimetables() { return readDrafts(); },

  async getTimetable(id) {
    const item = readDrafts().find((record) => record.id === id);
    if (!item) throw new ApiError("NOT_FOUND", "That saved timetable no longer exists.");
    return item;
  },

  async updateTimetable(id, input) {
    const records = readDrafts();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new ApiError("NOT_FOUND", "That saved timetable no longer exists.");
    const next = { ...records[index], ...clone(input), updatedAt: new Date().toISOString() };
    records[index] = next;
    writeDrafts(records);
    return next;
  },

  async publishTimetable(id) {
    const records = readDrafts();
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new ApiError("NOT_FOUND", "Save the timetable before publishing it.");
    const validation = validateSessions(records[index].config, records[index].sessions);
    if (!validation.valid) throw new ApiError("VALIDATION_FAILED", "Publishing is blocked until every conflict is resolved.", validation.conflicts);
    records[index] = { ...records[index], status: "published", validation, updatedAt: new Date().toISOString() };
    writeDrafts(records);
    return records[index];
  },
};

const liveApi: TimetableApi = {
  generate: (body) => request<GenerateResponse>("/api/generate", { method: "POST", body: JSON.stringify(body) }),
  validate: (body) => request<ValidationResult>("/api/validate", { method: "POST", body: JSON.stringify(body) }),
  saveDraft: (body) => request<SavedTimetable>("/api/timetables", { method: "POST", body: JSON.stringify(body) }),
  listTimetables: () => request<SavedTimetable[]>("/api/timetables"),
  getTimetable: (id) => request<SavedTimetable>(`/api/timetables/${id}`),
  updateTimetable: (id, body) => request<SavedTimetable>(`/api/timetables/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  publishTimetable: (id) => request<SavedTimetable>(`/api/timetables/${id}/publish`, { method: "POST" }),
};

export const api: TimetableApi = usingMockApi ? mockApi : liveApi;
export { ApiError };
