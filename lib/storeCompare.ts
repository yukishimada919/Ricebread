/**
 * 店まるごとの比較。
 *
 * 「A スーパーと B スーパー、結局どっちが安いのか」を、
 * 両方で値段を記録したことがある商品だけを突き合わせて出す。
 *
 * 片方にしか記録が無い商品を混ぜると、
 * たまたま高い商品を多く記録した店が不利になってしまうので、
 * 必ず「両方に記録がある商品」だけで比べる。
 */

import { baselineOf, type PricePoint } from "./priceStats";

/** 比較 1 行分(商品 1 つ分) */
export type StoreComparisonRow = {
  productId: string;
  /** 店 A の相場 */
  priceA: number;
  /** 店 B の相場 */
  priceB: number;
  /** B - A(プラスなら B の方が高い) */
  diff: number;
  /** A に対して B が何 % 高いか(プラスなら B の方が高い) */
  diffPercent: number;
  /** どちらが安いか。同額なら "tie" */
  cheaper: "a" | "b" | "tie";
};

export type StoreComparison = {
  rows: StoreComparisonRow[];
  /** A の方が安かった商品の数 */
  winsA: number;
  /** B の方が安かった商品の数 */
  winsB: number;
  ties: number;
  /**
   * 比べた商品を 1 個ずつ買ったときの合計差額(B の合計 - A の合計)。
   * プラスなら B の方が高くつく。
   */
  totalDiff: number;
  /** 合計で見て A が何 % 高いか / 安いか(プラスなら B の方が高い) */
  totalDiffPercent: number;
};

/**
 * 2 つの店を比べる。
 *
 * @param pointsByProduct 商品 id → その商品の全記録
 */
export function compareStores(
  pointsByProduct: Map<string, PricePoint[]>,
  storeIdA: string,
  storeIdB: string,
  useUnitPrice = false
): StoreComparison {
  const rows: StoreComparisonRow[] = [];

  for (const [productId, points] of pointsByProduct) {
    const baselineA = baselineOf(
      points.filter((p) => p.storeId === storeIdA),
      useUnitPrice
    );
    const baselineB = baselineOf(
      points.filter((p) => p.storeId === storeIdB),
      useUnitPrice
    );
    // 片方にしか記録が無い商品は比べられないので飛ばす
    if (!baselineA || !baselineB) continue;

    const priceA = baselineA.value;
    const priceB = baselineB.value;
    const diff = priceB - priceA;

    rows.push({
      productId,
      priceA,
      priceB,
      diff,
      diffPercent: priceA > 0 ? (diff / priceA) * 100 : 0,
      cheaper: diff > 0 ? "a" : diff < 0 ? "b" : "tie",
    });
  }

  // 差の大きい商品を上に出す(見て意味のある順)
  rows.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));

  const totalA = rows.reduce((sum, r) => sum + r.priceA, 0);
  const totalB = rows.reduce((sum, r) => sum + r.priceB, 0);

  return {
    rows,
    winsA: rows.filter((r) => r.cheaper === "a").length,
    winsB: rows.filter((r) => r.cheaper === "b").length,
    ties: rows.filter((r) => r.cheaper === "tie").length,
    totalDiff: totalB - totalA,
    totalDiffPercent: totalA > 0 ? ((totalB - totalA) / totalA) * 100 : 0,
  };
}

/**
 * 比較結果を一言でまとめる。
 * 画面の見出しに出して、表を読まなくても結論が分かるようにする。
 */
export function comparisonSummary(
  comparison: StoreComparison,
  nameA: string,
  nameB: string
): string {
  if (comparison.rows.length === 0) {
    return "両方の店で値段を記録した商品がまだありません";
  }
  const diff = Math.round(Math.abs(comparison.totalDiff));
  const count = comparison.rows.length;

  if (diff === 0) {
    return `${count} 商品を比べて、合計はほぼ同じでした`;
  }
  const cheaper = comparison.totalDiff > 0 ? nameA : nameB;
  return `${count} 商品を 1 個ずつ買うと、${cheaper} の方が ${diff.toLocaleString(
    "ja-JP"
  )}円 安く済みます`;
}
