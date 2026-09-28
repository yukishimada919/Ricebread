/**
 * 写真から読み取った商品情報を、アプリで使える形に整える。
 *
 * AI の返事は信用しない、という前提で書いてある。
 * 数値のはずが文字列で来る、マイナスが来る、「不明」という文字列が来る、
 * 日本に存在しない税率が来る……といったことが実際に起こる。
 * そのまま登録フォームに流し込むと、おかしな商品が登録されてしまうので、
 * ここで必ず通してから使うこと。
 *
 * 判断に迷う値は「未入力(null)」に倒す。
 * 間違った値が入っているより、空欄のほうがユーザーが気づいて直せるため。
 */

import type { ProductLabelReading, SizeUnit } from "./types";

const SIZE_UNITS: SizeUnit[] = ["g", "ml", "piece"];

/** 知らない単位は piece(個数)に倒す */
export function toSizeUnit(value: unknown): SizeUnit {
  return SIZE_UNITS.includes(value as SizeUnit) ? (value as SizeUnit) : "piece";
}

/** 空文字と「不明」は未入力として扱い、長すぎる文字列は切り詰める */
export function toText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "不明") return null;
  return trimmed.slice(0, max);
}

/** 正の数だけ通す(0・マイナス・数値でないものは未入力扱い) */
export function toPositiveOrNull(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * 税率は 8 か 10 のどちらかにする。
 *
 * AI が 5 や 0 のような数字を返すことがあるが、日本の現行税率ではない。
 * 食品を扱うアプリなので、判断が付かないときは軽減税率の 8 に倒す。
 * 画面で直せるようにしてあるので、外れても致命傷にならない。
 */
export function toTaxRate(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return n === 10 ? 10 : 8;
}

/** AI の返事(パース済み JSON)を、そのまま画面に渡せる形に整える */
export function normalizeReading(parsed: unknown): ProductLabelReading {
  const o = (parsed ?? {}) as Record<string, unknown>;
  return {
    name: toText(o.name, 100),
    maker: toText(o.maker, 60),
    size_amount: toPositiveOrNull(o.size_amount),
    size_unit: toSizeUnit(o.size_unit),
    size_text: toText(o.size_text, 40),
    tax_rate_percent: toTaxRate(o.tax_rate_percent),
    note: toText(o.note, 200),
  };
}

/**
 * 登録フォームに流し込む意味があるかどうか。
 *
 * 商品名が取れていなければ、ほかが埋まっていても登録できないので
 * 「読み取れなかった」として撮り直しを案内する。
 */
export function isEmptyReading(reading: ProductLabelReading): boolean {
  return reading.name === null;
}

/**
 * 読み取った内容量を、登録フォームの入力欄に入れる文字列にする。
 *
 * 単位まで含めた文字列にしておくと、保存時に parseSizeText() が
 * そのまま読み直せる(画面と保存で同じ解釈になる)。
 */
export function toSizeInputText(reading: ProductLabelReading): string {
  if (reading.size_amount === null) return "";
  const unit = reading.size_unit === "piece" ? "個" : reading.size_unit;
  return `${reading.size_amount}${unit}`;
}
