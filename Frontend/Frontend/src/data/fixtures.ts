import type {
  GenerateResponse,
  ScheduledSession,
  SchedulingConfig,
  TimetableMetrics,
  ValidationResult,
} from "../types/timetable";

export const dfisConfig: SchedulingConfig = {
  university: {
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    officialStartTime: "09:00",
    officialEndTime: "14:30",
    periodDurationMinutes: 50,
    breaks: [{ id: "break-lunch", label: "Lunch break", startTime: "11:30", endTime: "12:00" }],
  },
  rooms: [
    { id: "room-101", name: "Room 101", type: "classroom", capacity: 48, availability: {} },
    { id: "lab-dfis", name: "DFIS Lab", type: "laboratory", capacity: 24, laboratoryType: "Data forensics", availability: {} },
    { id: "lab-systems", name: "Systems Lab", type: "laboratory", capacity: 24, laboratoryType: "Data forensics", availability: {} },
  ],
  faculty: [
    {
      id: "faculty-anita",
      name: "Dr. Anita Rao",
      available: {
        Monday: [{ startTime: "09:00", endTime: "14:30" }],
        Wednesday: [{ startTime: "09:00", endTime: "14:30" }],
        Friday: [{ startTime: "09:00", endTime: "14:30" }],
      },
      unavailableSlots: [],
      maxTeachingPeriodsPerDay: 4,
    },
    {
      id: "faculty-kabir",
      name: "Prof. Kabir Menon",
      available: {
        Monday: [{ startTime: "12:00", endTime: "14:30" }],
        Tuesday: [{ startTime: "12:00", endTime: "14:30" }],
        Thursday: [{ startTime: "09:00", endTime: "14:30" }],
      },
      unavailableSlots: [],
      maxTeachingPeriodsPerDay: 4,
    },
  ],
  studentGroups: [
    { id: "group-dfis-i-a", programme: "M.Sc. DFIS", semester: "Semester I", section: "A", strength: 40 },
  ],
  batches: [
    { id: "batch-dfis-a", studentGroupId: "group-dfis-i-a", name: "Batch A", strength: 20 },
    { id: "batch-dfis-b", studentGroupId: "group-dfis-i-a", name: "Batch B", strength: 20 },
  ],
  teachingRequirements: [
    {
      id: "requirement-dfis101",
      subjectCode: "DFIS101",
      subjectName: "Digital Forensics Foundations",
      studentGroupId: "group-dfis-i-a",
      kind: "theory",
      facultyId: "faculty-anita",
      theoryPeriodsPerWeek: 3,
      preferredSlots: [{ day: "Monday", startTime: "09:00" }],
    },
    {
      id: "requirement-dfis102p",
      subjectCode: "DFIS102P",
      subjectName: "Evidence Analysis Lab",
      studentGroupId: "group-dfis-i-a",
      kind: "practical",
      facultyId: "faculty-kabir",
      practicalSessionsPerWeekPerBatch: 1,
      consecutivePeriodsPerSession: 2,
      requiredLaboratoryType: "Data forensics",
      preferredSlots: [{ day: "Tuesday", startTime: "12:00" }],
    },
  ],
  fixedCommitments: [
    {
      id: "fixed-dfis-theory-1",
      teachingRequirementId: "requirement-dfis101",
      batchId: null,
      occurrenceIndex: 1,
      day: "Monday",
      startTime: "09:00",
      roomId: "room-101",
    },
  ],
};

export const dfisSessions: ScheduledSession[] = [
  {
    id: "session-dfis101-1", teachingRequirementId: "requirement-dfis101", occurrenceIndex: 1,
    subjectCode: "DFIS101", subjectName: "Digital Forensics Foundations", kind: "theory",
    studentGroupId: "group-dfis-i-a", batchId: null, facultyId: "faculty-anita", roomId: "room-101",
    day: "Monday", startTime: "09:00", endTime: "09:50", durationPeriods: 1, locked: false,
  },
  {
    id: "session-dfis101-2", teachingRequirementId: "requirement-dfis101", occurrenceIndex: 2,
    subjectCode: "DFIS101", subjectName: "Digital Forensics Foundations", kind: "theory",
    studentGroupId: "group-dfis-i-a", batchId: null, facultyId: "faculty-anita", roomId: "room-101",
    day: "Wednesday", startTime: "09:50", endTime: "10:40", durationPeriods: 1, locked: false,
  },
  {
    id: "session-dfis101-3", teachingRequirementId: "requirement-dfis101", occurrenceIndex: 3,
    subjectCode: "DFIS101", subjectName: "Digital Forensics Foundations", kind: "theory",
    studentGroupId: "group-dfis-i-a", batchId: null, facultyId: "faculty-anita", roomId: "room-101",
    day: "Friday", startTime: "10:40", endTime: "11:30", durationPeriods: 1, locked: false,
  },
  {
    id: "session-dfis102p-a", teachingRequirementId: "requirement-dfis102p", occurrenceIndex: 1,
    subjectCode: "DFIS102P", subjectName: "Evidence Analysis Lab", kind: "practical",
    studentGroupId: "group-dfis-i-a", batchId: "batch-dfis-a", facultyId: "faculty-kabir", roomId: "lab-dfis",
    day: "Tuesday", startTime: "12:00", endTime: "13:40", durationPeriods: 2, locked: false,
  },
  {
    id: "session-dfis102p-b", teachingRequirementId: "requirement-dfis102p", occurrenceIndex: 2,
    subjectCode: "DFIS102P", subjectName: "Evidence Analysis Lab", kind: "practical",
    studentGroupId: "group-dfis-i-a", batchId: "batch-dfis-b", facultyId: "faculty-kabir", roomId: "lab-systems",
    day: "Thursday", startTime: "09:00", endTime: "10:40", durationPeriods: 2, locked: false,
  },
];

export const feasibleMetrics: TimetableMetrics = {
  requiredTheoryPeriods: 3,
  scheduledTheoryPeriods: 3,
  requiredPracticalSessions: 2,
  scheduledPracticalSessions: 2,
  preferencesSatisfied: 2,
  preferencesTotal: 2,
};

export const feasibleResponse: GenerateResponse = {
  status: "feasible",
  sessions: dfisSessions,
  diagnostics: [{
    code: "SCHEDULE_VALID", severity: "info", message: "All required DFIS sessions were scheduled without mandatory-constraint violations.", relatedEntityIds: [],
  }],
  unassignedRequirements: [],
  metrics: feasibleMetrics,
};

export const impossibleConfig: SchedulingConfig = {
  ...dfisConfig,
  faculty: dfisConfig.faculty.map((faculty) => faculty.id === "faculty-anita" ? {
    ...faculty,
    available: { Monday: [{ startTime: "09:00", endTime: "10:40" }] },
  } : faculty),
  teachingRequirements: dfisConfig.teachingRequirements.map((requirement) => requirement.id === "requirement-dfis101" ? {
    ...requirement, subjectCode: "DFIS103", subjectName: "Digital Investigation Methods",
  } : requirement),
};

export const impossibleResponse: GenerateResponse = {
  status: "infeasible",
  sessions: [],
  diagnostics: [{
    code: "FACULTY_AVAILABILITY_SHORTFALL",
    severity: "error",
    message: "Subject DFIS103 requires three weekly periods, but Dr. Anita Rao is available for only two periods.",
    relatedEntityIds: ["requirement-dfis101", "faculty-anita"],
    teachingRequirementId: "requirement-dfis101",
    suggestedChanges: ["Add at least one available period for Dr. Anita Rao.", "Assign a different qualified faculty member.", "Reduce the required weekly theory periods."],
  }],
  unassignedRequirements: [{
    teachingRequirementId: "requirement-dfis101", subjectCode: "DFIS103", expected: 3, scheduled: 0, unit: "periods",
  }],
  metrics: { ...feasibleMetrics, scheduledTheoryPeriods: 0, scheduledPracticalSessions: 0 },
};

export const initialValidation: ValidationResult = { valid: true, conflicts: [] };
