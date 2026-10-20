import { describe, expect, it } from "vitest";
import { seoulMonthRange, seoulWallToUtc, seoulWeekRange, seoulYearRange } from "@/domain/time";

describe("Asia/Seoul week boundaries", () => {
  it("starts Monday 00:00 and excludes the next Monday", () => {
    const monday = seoulWallToUtc(2026, 10, 19, 0, 0, 0);
    const range = seoulWeekRange(monday);
    expect(range.start.toISOString()).toBe("2026-10-18T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-25T15:00:00.000Z");
    expect(seoulWeekRange(new Date("2026-10-18T14:59:59.999Z")).start.toISOString()).toBe(
      "2026-10-11T15:00:00.000Z",
    );
    expect(seoulWeekRange(new Date("2026-10-18T15:00:00.000Z")).start.toISOString()).toBe(
      "2026-10-18T15:00:00.000Z",
    );
  });

  it("rolls across months and years using Korean civil dates", () => {
    const newYearEve = seoulWallToUtc(2026, 12, 31, 23, 59, 59);
    const week = seoulWeekRange(newYearEve);
    expect(week.start.toISOString()).toBe(seoulWallToUtc(2026, 12, 28).toISOString());
    expect(week.end.toISOString()).toBe(seoulWallToUtc(2027, 1, 4).toISOString());
    const month = seoulMonthRange(seoulWallToUtc(2026, 12, 31, 23, 0, 0));
    expect(month.end.toISOString()).toBe(seoulWallToUtc(2027, 1, 1).toISOString());
    const year = seoulYearRange(seoulWallToUtc(2027, 1, 1, 0, 0, 0));
    expect(year.start.toISOString()).toBe("2026-12-31T15:00:00.000Z");
    expect(seoulYearRange(new Date("2026-12-31T14:59:59.000Z")).start.toISOString()).toBe(
      "2025-12-31T15:00:00.000Z",
    );
  });
});
