import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatDate,
  formatDateLabel,
  formatShortDateLabel,
  parseDate,
  relativeDateLabel,
} from "./date";

describe("日付の変換", () => {
  it("Date と YYYY-MM-DD を行き来できる", () => {
    expect(formatDate(new Date(2026, 8, 6))).toBe("2026-09-06");
    expect(parseDate("2026-09-06").getMonth()).toBe(8);
  });

  it("月と日は 2 桁に揃える", () => {
    expect(formatDate(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("曜日つきの表示", () => {
    // 2026-09-06 は日曜日
    expect(formatDateLabel("2026-09-06")).toBe("2026年9月6日(日)");
    expect(formatShortDateLabel("2026-09-06")).toBe("9/6");
  });
});

describe("日数の差", () => {
  it("未来ならプラス", () => {
    expect(daysBetween("2026-09-01", "2026-09-06")).toBe(5);
  });

  it("過去ならマイナス", () => {
    expect(daysBetween("2026-09-06", "2026-09-01")).toBe(-5);
  });

  it("月をまたいでも数えられる", () => {
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
  });
});

describe("近い日付は短く書く", () => {
  const today = "2026-09-06";

  it("今日・昨日・◯日前", () => {
    expect(relativeDateLabel("2026-09-06", today)).toBe("今日");
    expect(relativeDateLabel("2026-09-05", today)).toBe("昨日");
    expect(relativeDateLabel("2026-09-01", today)).toBe("5日前");
  });

  it("2 週間以上前は日付をそのまま出す", () => {
    expect(relativeDateLabel("2026-08-01", today)).toBe("2026年8月1日(土)");
  });
});
