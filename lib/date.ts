/**
 * 日付まわりの共通ヘルパー。
 * YYYY-MM-DD の文字列をローカル日付として扱う(タイムゾーンずれ防止)。
 */

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** Date を YYYY-MM-DD にする */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 今日の YYYY-MM-DD */
export function todayString(): string {
  return formatDate(new Date());
}

/** YYYY-MM-DD をローカル日付の Date にする */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 「2026年9月6日(日)」形式 */
export function formatDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${
    WEEKDAY_LABELS[date.getDay()]
  })`;
}

/** 「9/6」形式(グラフの軸など狭い場所用) */
export function formatShortDateLabel(dateStr: string): string {
  const date = parseDate(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 2 つの日付が何日離れているか(from → to が未来ならプラス) */
export function daysBetween(from: string, to: string): number {
  const ms = parseDate(to).getTime() - parseDate(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * 「今日」「昨日」「3日前」「2026年8月1日(金)」のように、
 * 近い日付ほど短く書く。履歴一覧で日付を追いやすくするためのもの。
 */
export function relativeDateLabel(dateStr: string, today = todayString()): string {
  const days = daysBetween(dateStr, today);
  if (days === 0) return "今日";
  if (days === 1) return "昨日";
  if (days > 1 && days <= 13) return `${days}日前`;
  return formatDateLabel(dateStr);
}
