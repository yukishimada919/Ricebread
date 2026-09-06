import { describe, expect, it } from "vitest";
import {
  baselineOf,
  buildTrendSeries,
  cheapestStore,
  judge,
  judgeAgainstOwnHistory,
  judgeAgainstRegularStores,
  median,
  regularStoreIdSet,
  summarize,
  summarizeByStore,
  toPricePoints,
  verdictFromPercent,
  type PricePoint,
} from "./priceStats";
import type { PriceLog, Product } from "./types";

/** テスト用に 1 件分の記録を作る(必要な項目だけ渡せばよい) */
function point(overrides: Partial<PricePoint> = {}): PricePoint {
  return {
    storeId: "near",
    isRegularStore: true,
    recordedOn: "2026-09-01",
    price: 200,
    unitPrice: 20,
    isSale: false,
    ...overrides,
  };
}

describe("中央値", () => {
  it("奇数個なら真ん中", () => {
    expect(median([100, 200, 300])).toBe(200);
  });

  it("偶数個なら真ん中 2 つの平均", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });

  it("並び順に関係なく同じ結果になる", () => {
    expect(median([300, 100, 200])).toBe(200);
  });

  it("空なら null", () => {
    expect(median([])).toBeNull();
  });
});

describe("集計", () => {
  const points = [
    point({ recordedOn: "2026-09-01", price: 180 }),
    point({ recordedOn: "2026-09-03", price: 200 }),
    point({ recordedOn: "2026-09-02", price: 220 }),
  ];

  it("最安・最高・中央値・平均を出す", () => {
    const stats = summarize(points);
    expect(stats).not.toBeNull();
    expect(stats?.count).toBe(3);
    expect(stats?.min).toBe(180);
    expect(stats?.max).toBe(220);
    expect(stats?.median).toBe(200);
    expect(stats?.average).toBe(200);
  });

  it("いちばん新しい記録は日付で決まる(配列の順番ではない)", () => {
    expect(summarize(points)?.latest).toEqual({
      price: 200,
      date: "2026-09-03",
    });
  });

  it("単価モードでは単価を集計する", () => {
    const stats = summarize(
      [point({ price: 300, unitPrice: 60 }), point({ price: 200, unitPrice: 40 })],
      true
    );
    expect(stats?.median).toBe(50);
  });

  it("内容量が無い商品を単価モードで集計しようとしたら null", () => {
    expect(summarize([point({ unitPrice: null })], true)).toBeNull();
  });

  it("記録が無ければ null", () => {
    expect(summarize([])).toBeNull();
  });
});

describe("相場(ふだんの値段)", () => {
  it("通常価格の中央値を採る", () => {
    const baseline = baselineOf([
      point({ price: 180 }),
      point({ price: 200 }),
      point({ price: 220 }),
    ]);
    expect(baseline?.value).toBe(200);
    expect(baseline?.sampleCount).toBe(3);
    expect(baseline?.includedSales).toBe(false);
  });

  it("特売は相場から外す(ふだんの値段が安く見えてしまうため)", () => {
    const baseline = baselineOf([
      point({ price: 200 }),
      point({ price: 200 }),
      point({ price: 98, isSale: true }),
    ]);
    expect(baseline?.value).toBe(200);
    expect(baseline?.sampleCount).toBe(2);
  });

  it("極端に外れた 1 件があっても相場は動かない(平均ではなく中央値だから)", () => {
    const baseline = baselineOf([
      point({ price: 200 }),
      point({ price: 210 }),
      point({ price: 9800 }), // 桁を間違えて記録してしまった
    ]);
    expect(baseline?.value).toBe(210);
  });

  it("特売しか記録が無いときは特売から出し、その印を付ける", () => {
    const baseline = baselineOf([
      point({ price: 98, isSale: true }),
      point({ price: 108, isSale: true }),
    ]);
    expect(baseline?.value).toBe(103);
    expect(baseline?.includedSales).toBe(true);
  });

  it("記録が無ければ null", () => {
    expect(baselineOf([])).toBeNull();
  });
});

describe("高い / 安いのラベル", () => {
  it("相場から 15% 以上離れていれば「かなり」が付く", () => {
    expect(verdictFromPercent(-20)).toBe("much_cheaper");
    expect(verdictFromPercent(-15)).toBe("much_cheaper");
    expect(verdictFromPercent(20)).toBe("much_pricier");
    expect(verdictFromPercent(15)).toBe("much_pricier");
  });

  it("5〜15% なら「安い / 高い」", () => {
    expect(verdictFromPercent(-10)).toBe("cheaper");
    expect(verdictFromPercent(-5)).toBe("cheaper");
    expect(verdictFromPercent(10)).toBe("pricier");
  });

  it("±5% 未満は「ふつう」(日々の細かい値動きで騒がない)", () => {
    expect(verdictFromPercent(0)).toBe("normal");
    expect(verdictFromPercent(4.9)).toBe("normal");
    expect(verdictFromPercent(-4.9)).toBe("normal");
  });
});

describe("値段と相場を突き合わせる", () => {
  const baseline = { value: 200, sampleCount: 5, includedSales: false };

  it("差額と差の割合を出す", () => {
    const result = judge(240, baseline);
    expect(result.diff).toBe(40);
    expect(result.diffPercent).toBe(20);
    expect(result.verdict).toBe("much_pricier");
    expect(result.confidence).toBe("ok");
  });

  it("相場より安ければマイナスになる", () => {
    const result = judge(160, baseline);
    expect(result.diff).toBe(-40);
    expect(result.verdict).toBe("much_cheaper");
  });

  it("記録が 3 件未満のうちは確からしさを low にする", () => {
    const result = judge(240, { value: 200, sampleCount: 2, includedSales: false });
    expect(result.verdict).toBe("much_pricier");
    expect(result.confidence).toBe("low");
  });

  it("比べる相場が無ければ判定しない(理由を返す)", () => {
    const result = judge(240, null);
    expect(result.verdict).toBe("unknown");
    expect(result.reason).not.toBeNull();
  });

  it("相場が 0 円なら割合が出せないので判定しない", () => {
    const result = judge(240, { value: 0, sampleCount: 3, includedSales: false });
    expect(result.verdict).toBe("unknown");
  });
});

describe("判定その1: よその店といつもの店を比べる", () => {
  // いつもの店(near)では 200 円前後、たまに行く店(far)の記録もある
  const points = [
    point({ storeId: "near", isRegularStore: true, price: 198 }),
    point({ storeId: "near2", isRegularStore: true, price: 202 }),
    point({ storeId: "near", isRegularStore: true, price: 200 }),
    point({ storeId: "far", isRegularStore: false, price: 320 }),
  ];

  it("たまに行った店が近所より高ければ「かなり高い」", () => {
    const result = judgeAgainstRegularStores(280, points, "far");
    expect(result.verdict).toBe("much_pricier");
    expect(result.baseline?.value).toBe(200);
  });

  it("たまに行った店が近所より安ければ「かなり安い」", () => {
    expect(judgeAgainstRegularStores(150, points, "far").verdict).toBe(
      "much_cheaper"
    );
  });

  it("近所と同じくらいなら「ふつう」", () => {
    expect(judgeAgainstRegularStores(205, points, "far").verdict).toBe("normal");
  });

  it("たまに行く店の高い値段は相場に混ぜない", () => {
    // far の 320 円が相場に入っていたら中央値は 201 より大きくなるはず
    const result = judgeAgainstRegularStores(280, points, "far");
    expect(result.baseline?.value).toBe(200);
    expect(result.baseline?.sampleCount).toBe(3);
  });

  it("いま見ている店自身は相場から外す(自分と比べても意味が無い)", () => {
    const result = judgeAgainstRegularStores(198, points, "near");
    // near の 198 / 200 が外れ、near2 の 202 だけが相場になる
    expect(result.baseline?.value).toBe(202);
    expect(result.baseline?.sampleCount).toBe(1);
  });

  it("よく行く店の記録がまだ無ければ判定しない", () => {
    const result = judgeAgainstRegularStores(280, [
      point({ storeId: "far", isRegularStore: false, price: 320 }),
    ]);
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toContain("よく行く店");
  });

  it("単価で比べれば内容量の違う商品どうしでも判定できる", () => {
    const bySize = [
      // いつもの店: 1000ml で 200 円 → 100ml あたり 20 円
      point({ storeId: "near", isRegularStore: true, price: 200, unitPrice: 20 }),
      point({ storeId: "near2", isRegularStore: true, price: 200, unitPrice: 20 }),
    ];
    // よその店: 500ml で 130 円 → 100ml あたり 26 円。
    // 値段だけ見れば安いが、単価で見れば 30% 高い。
    expect(judgeAgainstRegularStores(130, bySize, "far").verdict).toBe(
      "much_cheaper"
    );
    expect(
      judgeAgainstRegularStores(26, bySize, "far", { useUnitPrice: true }).verdict
    ).toBe("much_pricier");
  });
});

describe("判定その2: 同じ店のいつもの値段と比べる", () => {
  // いつもの店では 200 円前後で推移している
  const points = [
    point({ storeId: "near", recordedOn: "2026-08-20", price: 198 }),
    point({ storeId: "near", recordedOn: "2026-08-27", price: 200 }),
    point({ storeId: "near", recordedOn: "2026-09-03", price: 202 }),
    point({ storeId: "other", recordedOn: "2026-09-03", price: 400 }),
  ];

  it("いつもより高ければ「かなり高い」", () => {
    const result = judgeAgainstOwnHistory(250, points, "near");
    expect(result.verdict).toBe("much_pricier");
    expect(result.baseline?.value).toBe(200);
  });

  it("いつもより安ければ「かなり安い」", () => {
    expect(judgeAgainstOwnHistory(150, points, "near").verdict).toBe(
      "much_cheaper"
    );
  });

  it("よその店の値段は混ぜない(店が違えば値段の水準も違う)", () => {
    expect(judgeAgainstOwnHistory(250, points, "near").baseline?.sampleCount).toBe(3);
  });

  it("今日入れたばかりの記録は相場から外せる", () => {
    const withToday = [
      ...points,
      point({ storeId: "near", recordedOn: "2026-09-06", price: 260 }),
    ];
    // 今日の 260 円を含めると相場が上がってしまうので外す
    const result = judgeAgainstOwnHistory(260, withToday, "near", "2026-09-06");
    expect(result.baseline?.value).toBe(200);
    expect(result.verdict).toBe("much_pricier");
  });

  it("その店の記録がまだ無ければ判定しない", () => {
    const result = judgeAgainstOwnHistory(250, points, "brand-new");
    expect(result.verdict).toBe("unknown");
    expect(result.reason).toContain("この店");
  });
});

describe("店ごとのまとめ", () => {
  const points = [
    point({ storeId: "a", price: 300 }),
    point({ storeId: "a", price: 320 }),
    point({ storeId: "b", price: 240 }),
    point({ storeId: "b", price: 260 }),
    point({ storeId: "c", isRegularStore: false, price: 280 }),
  ];

  it("相場の安い順に並ぶ", () => {
    expect(summarizeByStore(points).map((s) => s.storeId)).toEqual(["b", "c", "a"]);
  });

  it("いちばん安い店を取り出せる", () => {
    const cheapest = cheapestStore(points);
    expect(cheapest?.storeId).toBe("b");
    expect(cheapest?.baseline.value).toBe(250);
  });

  it("いつもの店かどうかを保つ", () => {
    const byStore = summarizeByStore(points);
    expect(byStore.find((s) => s.storeId === "c")?.isRegularStore).toBe(false);
    expect(byStore.find((s) => s.storeId === "b")?.isRegularStore).toBe(true);
  });

  it("記録が無ければ空", () => {
    expect(summarizeByStore([])).toEqual([]);
    expect(cheapestStore([])).toBeNull();
  });
});

describe("値動きのグラフ用データ", () => {
  it("日付順に並べ、店ごとの値段を 1 行にまとめる", () => {
    const rows = buildTrendSeries([
      point({ storeId: "a", recordedOn: "2026-09-03", price: 210 }),
      point({ storeId: "a", recordedOn: "2026-09-01", price: 200 }),
      point({ storeId: "b", recordedOn: "2026-09-01", price: 180 }),
    ]);
    expect(rows).toEqual([
      { date: "2026-09-01", a: 200, b: 180 },
      { date: "2026-09-03", a: 210 },
    ]);
  });

  it("同じ日に同じ店の記録が 2 つあれば安い方を採る(特売を拾う)", () => {
    const rows = buildTrendSeries([
      point({ storeId: "a", recordedOn: "2026-09-01", price: 200 }),
      point({ storeId: "a", recordedOn: "2026-09-01", price: 158, isSale: true }),
    ]);
    expect(rows).toEqual([{ date: "2026-09-01", a: 158 }]);
  });

  it("記録が無ければ空", () => {
    expect(buildTrendSeries([])).toEqual([]);
  });
});

describe("DB の行から判定用のデータを作る", () => {
  const product: Pick<Product, "size_amount" | "size_unit" | "tax_rate_percent"> = {
    size_amount: 1000,
    size_unit: "ml",
    tax_rate_percent: 8,
  };

  /** テスト用に DB の 1 行を作る */
  function log(overrides: Partial<PriceLog> = {}): PriceLog {
    return {
      id: "log-1",
      user_id: "user-1",
      product_id: "product-1",
      store_id: "near",
      recorded_on: "2026-09-01",
      price_yen: 200,
      tax_included: true,
      is_sale: false,
      size_amount: null,
      memo: null,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      ...overrides,
    };
  }

  it("本体価格の記録は税込に直る", () => {
    const [converted] = toPricePoints([log({ tax_included: false })], product, new Set());
    // 200 * 1.08 = 216
    expect(converted.price).toBe(216);
  });

  it("単価も一緒に計算される", () => {
    const [converted] = toPricePoints([log()], product, new Set());
    expect(converted.unitPrice).toBe(20);
  });

  it("その日だけ内容量が違えば、そちらを使って単価を出す", () => {
    // 増量パック: 同じ 200 円で 1250ml 入っていた
    const [converted] = toPricePoints([log({ size_amount: 1250 })], product, new Set());
    expect(converted.unitPrice).toBe(16);
  });

  it("いつもの店かどうかの印が付く", () => {
    const [converted] = toPricePoints([log()], product, new Set(["near"]));
    expect(converted.isRegularStore).toBe(true);
    const [other] = toPricePoints([log()], product, new Set(["far"]));
    expect(other.isRegularStore).toBe(false);
  });

  it("内容量の無い商品は単価が null になる", () => {
    const [converted] = toPricePoints(
      [log()],
      { size_amount: null, size_unit: "piece", tax_rate_percent: 8 },
      new Set()
    );
    expect(converted.unitPrice).toBeNull();
  });

  it("店の一覧から「よく行く店」の id を集められる", () => {
    const ids = regularStoreIdSet([
      { id: "a", is_regular: true },
      { id: "b", is_regular: false },
      { id: "c", is_regular: true },
    ]);
    expect([...ids].sort()).toEqual(["a", "c"]);
  });
});
