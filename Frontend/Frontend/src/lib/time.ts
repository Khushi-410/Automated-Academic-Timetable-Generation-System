import type { DayOfWeek, ScheduledBreak, UniversityConfig } from "../types/timetable";

export interface PeriodSlot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  kind: "period" | "break";
  durationPeriods: number;
}

export const asMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const asTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const formatTime = (time: string): string => {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayedHour = hour % 12 || 12;
  return `${displayedHour}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const breaksAt = (breaks: ScheduledBreak[], minute: number) =>
  breaks.find((item) => asMinutes(item.startTime) === minute);

export function buildPeriodSlots(config: UniversityConfig): PeriodSlot[] {
  const slots: PeriodSlot[] = [];
  let cursor = asMinutes(config.officialStartTime);
  const end = asMinutes(config.officialEndTime);
  let index = 1;

  while (cursor < end) {
    const scheduledBreak = breaksAt(config.breaks, cursor);
    if (scheduledBreak) {
      slots.push({
        id: scheduledBreak.id,
        startTime: scheduledBreak.startTime,
        endTime: scheduledBreak.endTime,
        label: scheduledBreak.label,
        kind: "break",
        durationPeriods: 0,
      });
      cursor = asMinutes(scheduledBreak.endTime);
      continue;
    }

    const next = cursor + config.periodDurationMinutes;
    if (next > end) break;
    slots.push({
      id: `period-${index}`,
      startTime: asTime(cursor),
      endTime: asTime(next),
      label: `P${index}`,
      kind: "period",
      durationPeriods: 1,
    });
    cursor = next;
    index += 1;
  }
  return slots;
}

export function endTimeFor(startTime: string, periods: number, config: UniversityConfig): string {
  const slots = buildPeriodSlots(config);
  const startIndex = slots.findIndex((slot) => slot.startTime === startTime);
  const target = slots[startIndex + periods - 1];
  return target?.kind === "period" ? target.endTime : asTime(asMinutes(startTime) + config.periodDurationMinutes * periods);
}

export const dayShortName = (day: DayOfWeek) => day.slice(0, 3);

export const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  asMinutes(aStart) < asMinutes(bEnd) && asMinutes(bStart) < asMinutes(aEnd);
