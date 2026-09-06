/**
 * 値段を「比べられる形」に揃えるための計算。
 *
 * スーパーの値札はそのままでは比較できない。
 *   - 税込のところと本体価格のところがある
 *   - 内容量が違う(500ml と 1000ml の牛乳)
 * ここで税込に揃え、単価(100g あたりなど)に直してから比べる。
 */

import type { SizeUnit } from "./types";

/** 選べる内容量の単位と、その表示名 */
export const SIZE_UNITS: { value: SizeUnit; label: string }[] = [
  { value: "g", label: "g" },
  { value: "ml", label: "ml" },
  { value: "piece", label: "個" },
];

/** よく使う税率(日本の消費税) */
export const TAX_RATES: { value: number; label: string }[] = [
  { value: 8, label: "8%(食品)" },
  { value: 10, label: "10%(酒・日用品)" },
  { value: 0, label: "0%(非課税)" },
];

/** 単位の表示名(g / ml / 個) */
export function unitLabel(unit: SizeUnit): string {
  return unit === "piece" ? "個" : unit;
}

/**
 * 単価の基準量。
 * g / ml は「100 あたり」、個数モノは「1 個あたり」で見るのが分かりやすい。
 */
export function unitBase(unit: SizeUnit): number {
  return unit === "piece" ? 1 : 100;
}

/** 「100gあたり」のような単価の見出し */
export function unitBaseLabel(unit: SizeUnit): string {
  return unit === "piece" ? "1個あたり" : `${unitBase(unit)}${unit}あたり`;
}

/**
 * 値札の数字を税込価格に直す。
 *
 * 本体価格からの計算は円未満を切り捨てる(スーパーのレジと同じ扱い)。
 * すでに税込なら何もしない。
 */
export function taxIncludedPrice(
  priceYen: number,
  taxIncluded: boolean,
  taxRatePercent: number
): number {
  if (!Number.isFinite(priceYen) || priceYen < 0) return 0;
  if (taxIncluded) return priceYen;
  const rate = Number.isFinite(taxRatePercent) ? taxRatePercent : 0;
  return Math.floor(priceYen * (1 + rate / 100));
}

/**
 * 単価(100g あたり / 100ml あたり / 1個あたり)を出す。
 * 内容量が分からない商品は比べようがないので null を返す。
 */
export function unitPrice(
  taxIncludedYen: number,
  sizeAmount: number | null | undefined,
  unit: SizeUnit
): number | null {
  if (!sizeAmount || sizeAmount <= 0) return null;
  if (!Number.isFinite(taxIncludedYen)) return null;
  return (taxIncludedYen / sizeAmount) * unitBase(unit);
}

/** 「198円」 */
export function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

/** 「198.4円」(単価のように小数が意味を持つとき) */
export function formatYenDetailed(value: number): string {
  // 100 円を超えたら小数はノイズなので落とす
  if (Math.abs(value) >= 100) return formatYen(value);
  return `${Math.round(value * 10) / 10}円`;
}

/** 「+32円」「-15円」(差額なので符号を必ず付ける) */
export function formatDiffYen(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "±";
  return `${sign}${Math.abs(rounded).toLocaleString("ja-JP")}円`;
}

/** 「+12%」「-8%」 */
export function formatDiffPercent(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "±";
  return `${sign}${Math.abs(rounded)}%`;
}

/** 「1000ml」「6個」。内容量が無ければ null */
export function formatSize(
  sizeAmount: number | null | undefined,
  unit: SizeUnit
): string | null {
  if (!sizeAmount || sizeAmount <= 0) return null;
  // 500.0 のような表示にならないよう、割り切れるときは整数で出す
  const amount = Number.isInteger(sizeAmount)
    ? String(sizeAmount)
    : String(Math.round(sizeAmount * 100) / 100);
  return `${amount}${unitLabel(unit)}`;
}

/** 「100gあたり 21円」。単価が出せなければ null */
export function formatUnitPrice(
  value: number | null,
  unit: SizeUnit
): string | null {
  if (value === null) return null;
  return `${unitBaseLabel(unit)} ${formatYenDetailed(value)}`;
}

/**
 * 「500g」「1.5L」のような文字列から内容量を読み取る。
 * 商品を登録するときに、パッケージの表記をそのまま貼れるようにするためのもの。
 * 読み取れなければ null。
 */
export function parseSizeText(
  text: string
): { amount: number; unit: SizeUnit } | null {
  const normalized = text
    .trim()
    // 全角の数字・記号・英字を半角に寄せる
    .replace(/[０-９．]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase();

  const match = normalized.match(
    /(\d+(?:\.\d+)?)\s*(kg|g|グラム|l|リットル|ml|cc|ミリリットル|個|こ|本|袋|枚|pieces?|pcs?)/
  );
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  switch (match[2]) {
    case "kg":
      return { amount: amount * 1000, unit: "g" };
    case "g":
    case "グラム":
      return { amount, unit: "g" };
    case "l":
    case "リットル":
      return { amount: amount * 1000, unit: "ml" };
    case "ml":
    case "cc":
    case "ミリリットル":
      return { amount, unit: "ml" };
    default:
      return { amount, unit: "piece" };
  }
}
