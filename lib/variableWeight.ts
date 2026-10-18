/**
 * 量り売りの商品(パックごとにグラム数が変わるもの)の扱い。
 *
 * ■ なぜ特別扱いするのか
 *
 * 精肉・鮮魚・青果の量り売りは、同じ「合いびき肉」でも
 * パックによって 380g だったり 520g だったりする。
 * そのままの値段で「398円 と 512円、どっちが安い?」と比べても意味が無く、
 * 100g あたりに直して初めて比べられる。
 *
 * 一方で卵・牛乳・加工食品は規格品なので、同じ商品なら量も同じ。
 * そのままの値段で比べてよいし、そのほうが分かりやすい。
 *
 * ■ 落とし穴
 *
 * 単価で比べるには「そのパックの実際のグラム数」が要る。
 * 登録時のグラム数で計算してしまうと、
 *   400g で登録 → 520g のパックを 650円で買う
 *   → 650 / 400 * 100 = 162.5円/100g(本当は 125円/100g)
 * のように、黙って間違った単価が出る。
 * だから量り売りの商品は、記録のたびにグラム数を入れてもらう必要がある。
 */

import type { Product } from "./types";

/**
 * 量り売りと判断するカテゴリ。
 *
 * AI にカテゴリを読ませたとき、この一覧に当たれば量り売り扱いにする。
 * 迷ったら量り売りにしない(false)方針。
 * 単価で比べるには毎回グラム数を入れる手間がかかるので、
 * 規格品にまでそれを強いると面倒なだけになるため。
 */
const VARIABLE_WEIGHT_CATEGORIES = [
  "精肉",
  "肉",
  "鮮魚",
  "魚",
  "魚介",
  "水産",
  "青果",
  "野菜",
  "果物",
  "惣菜",
];

/**
 * カテゴリ名から、量り売りらしいかどうかを推す。
 *
 * あくまで初期値を決めるための推測なので、外れても画面で直せる。
 * 「鶏肉」「牛肉」のように前後に字が付いていても拾えるよう、
 * 含まれていれば当たりとする。
 */
export function looksVariableWeight(
  category: string | null | undefined
): boolean {
  if (!category) return false;
  const c = category.trim();
  if (!c) return false;
  return VARIABLE_WEIGHT_CATEGORIES.some((k) => c.includes(k));
}

/**
 * この商品を既定で単価(100gあたり)で比べるかどうか。
 *
 * 量り売りでも、内容量そのものが登録されていなければ単価は出せない。
 * その場合は、そのままの値段で比べるしかない。
 */
export function shouldCompareByUnit(
  product: Pick<Product, "is_variable_weight" | "size_amount">
): boolean {
  if (!product.is_variable_weight) return false;
  return Boolean(product.size_amount && product.size_amount > 0);
}

/**
 * 記録するとき、そのパックの実際のグラム数を入れてもらう必要があるか。
 *
 * 量り売りの商品は毎回変わるので必須に近い。
 * 入っていないと、登録時のグラム数で計算されて単価が静かに狂う。
 */
export function needsSizeEachTime(
  product: Pick<Product, "is_variable_weight">
): boolean {
  return product.is_variable_weight;
}

/** 内容量の入力欄の見出し。量り売りかどうかで意味が変わる */
export function sizeFieldLabel(
  product: Pick<Product, "is_variable_weight">
): string {
  return product.is_variable_weight
    ? "このパックの内容量"
    : "内容量(いつもと違うときだけ)";
}

/** 内容量の入力欄に添える説明 */
export function sizeFieldHint(
  product: Pick<Product, "is_variable_weight">
): string | null {
  return product.is_variable_weight
    ? "量り売りの商品です。値札のグラム数を入れると、100gあたりで正しく比べられます。"
    : null;
}
