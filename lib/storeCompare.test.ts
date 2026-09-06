import { describe, expect, it } from "vitest";
import { comparisonSummary, compareStores } from "./storeCompare";
import type { PricePoint } from "./priceStats";

function point(overrides: Partial<PricePoint> = {}): PricePoint {
  return {
    storeId: "a",
    isRegularStore: true,
    recordedOn: "2026-09-01",
    price: 200,
    unitPrice: 20,
    isSale: false,
    ...overrides,
  };
}

/**
 * 牛乳・卵・食パンの 3 商品。
 *   牛乳   A 200円 / B 240円 → A が安い
 *   卵     A 300円 / B 260円 → B が安い
 *   食パン A 150円 / B のみ記録なし → 比較から外れる
 */
const pointsByProduct = new Map<string, PricePoint[]>([
  [
    "milk",
    [
      point({ storeId: "a", price: 200 }),
      point({ storeId: "b", price: 240 }),
    ],
  ],
  [
    "egg",
    [
      point({ storeId: "a", price: 300 }),
      point({ storeId: "b", price: 260 }),
    ],
  ],
  ["bread", [point({ storeId: "a", price: 150 })]],
]);

describe("店まるごとの比較", () => {
  const result = compareStores(pointsByProduct, "a", "b");

  it("両方に記録がある商品だけを比べる", () => {
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.productId).sort()).toEqual(["egg", "milk"]);
  });

  it("商品ごとにどちらが安いか分かる", () => {
    const milk = result.rows.find((r) => r.productId === "milk");
    expect(milk?.cheaper).toBe("a");
    expect(milk?.diff).toBe(40);
    expect(milk?.diffPercent).toBe(20);

    const egg = result.rows.find((r) => r.productId === "egg");
    expect(egg?.cheaper).toBe("b");
    expect(egg?.diff).toBe(-40);
  });

  it("勝ち負けの数を数える", () => {
    expect(result.winsA).toBe(1);
    expect(result.winsB).toBe(1);
    expect(result.ties).toBe(0);
  });

  it("1 個ずつ買ったときの合計差額を出す", () => {
    // A: 200 + 300 = 500 / B: 240 + 260 = 500 → 引き分け
    expect(result.totalDiff).toBe(0);
  });

  it("差の大きい商品から順に並ぶ", () => {
    const diffs = result.rows.map((r) => Math.abs(r.diff));
    expect(diffs[0]).toBeGreaterThanOrEqual(diffs[1]);
  });

  it("同じ値段なら引き分けとして数える", () => {
    const tied = compareStores(
      new Map([
        ["milk", [point({ storeId: "a", price: 200 }), point({ storeId: "b", price: 200 })]],
      ]),
      "a",
      "b"
    );
    expect(tied.ties).toBe(1);
    expect(tied.winsA).toBe(0);
    expect(tied.winsB).toBe(0);
  });

  it("特売は相場から外れるので比較にも影響しない", () => {
    const withSale = compareStores(
      new Map([
        [
          "milk",
          [
            point({ storeId: "a", price: 200 }),
            point({ storeId: "a", price: 98, isSale: true }),
            point({ storeId: "b", price: 240 }),
          ],
        ],
      ]),
      "a",
      "b"
    );
    expect(withSale.rows[0].priceA).toBe(200);
  });

  it("単価モードでは単価どうしで比べる", () => {
    const byUnit = compareStores(
      new Map([
        [
          "milk",
          [
            point({ storeId: "a", price: 200, unitPrice: 20 }),
            point({ storeId: "b", price: 130, unitPrice: 26 }),
          ],
        ],
      ]),
      "a",
      "b",
      true
    );
    // 値段だけ見れば B が安いが、単価で見れば A の方が安い
    expect(byUnit.rows[0].cheaper).toBe("a");
  });

  it("共通の商品が無ければ空の結果になる", () => {
    const nothing = compareStores(
      new Map([["bread", [point({ storeId: "a", price: 150 })]]]),
      "a",
      "b"
    );
    expect(nothing.rows).toHaveLength(0);
    expect(nothing.totalDiff).toBe(0);
  });
});

describe("比較結果の一言まとめ", () => {
  it("合計で安い方の店の名前と差額を言う", () => {
    const result = compareStores(
      new Map([
        ["milk", [point({ storeId: "a", price: 200 }), point({ storeId: "b", price: 240 })]],
      ]),
      "a",
      "b"
    );
    expect(comparisonSummary(result, "Aスーパー", "Bスーパー")).toBe(
      "1 商品を 1 個ずつ買うと、Aスーパー の方が 40円 安く済みます"
    );
  });

  it("差が無ければ「ほぼ同じ」と言う", () => {
    const result = compareStores(pointsByProduct, "a", "b");
    expect(comparisonSummary(result, "Aスーパー", "Bスーパー")).toContain(
      "ほぼ同じ"
    );
  });

  it("比べられる商品が無ければそう言う", () => {
    const result = compareStores(new Map(), "a", "b");
    expect(comparisonSummary(result, "A", "B")).toContain("まだありません");
  });
});
