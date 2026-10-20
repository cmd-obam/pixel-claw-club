export const APP_TIME_ZONE = "Asia/Seoul";
const WEEKDAY_MON0: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

export interface SeoulDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const found = parts.find((item) => item.type === type);
  if (!found) {
    throw new Error(`missing date part ${type}`);
  }
  return found.value;
}

export function seoulDateTime(instant: Date): SeoulDateTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  return {
    year: Number(part(parts, "year")),
    month: Number(part(parts, "month")),
    day: Number(part(parts, "day")),
    hour: Number(part(parts, "hour")),
    minute: Number(part(parts, "minute")),
    second: Number(part(parts, "second")),
  };
}

export function seoulWeekdayMon0(instant: Date): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
  }).format(instant);
  const weekday = WEEKDAY_MON0[label];
  if (weekday === undefined) {
    throw new Error(`unexpected weekday ${label}`);
  }
  return weekday;
}

/** Interpret a civil clock time as Asia/Seoul and return the UTC instant. */
export function seoulWallToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second, millisecond));
}

function addCalendarDays(year: number, month: number, day: number, days: number): Date {
  return new Date(Date.UTC(year, month - 1, day + days));
}

export function seoulWeekRange(instant: Date): TimeRange {
  const { year, month, day } = seoulDateTime(instant);
  const monday = addCalendarDays(year, month, day, -seoulWeekdayMon0(instant));
  const nextMonday = addCalendarDays(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    7,
  );
  return {
    start: seoulWallToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    end: seoulWallToUtc(
      nextMonday.getUTCFullYear(),
      nextMonday.getUTCMonth() + 1,
      nextMonday.getUTCDate(),
    ),
  };
}

export function seoulMonthRange(instant: Date): TimeRange {
  const { year, month } = seoulDateTime(instant);
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return {
    start: seoulWallToUtc(year, month, 1),
    end: seoulWallToUtc(nextMonth.year, nextMonth.month, 1),
  };
}

export function seoulYearRange(instant: Date): TimeRange {
  const { year } = seoulDateTime(instant);
  return {
    start: seoulWallToUtc(year, 1, 1),
    end: seoulWallToUtc(year + 1, 1, 1),
  };
}

export function inRange(instant: Date, range: TimeRange | null): boolean {
  if (!range) {
    return true;
  }
  const time = instant.getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

export function parseIso(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid date");
  }
  return date;
}

/** datetime-local value (no zone) is interpreted as Korean civil time. */
export function seoulLocalInputToUtc(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) {
    throw new Error("invalid local datetime");
  }
  return seoulWallToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? "0"),
  );
}

export function utcToSeoulLocalInput(instant: Date): string {
  const parts = seoulDateTime(instant);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatSeoul(instant: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
