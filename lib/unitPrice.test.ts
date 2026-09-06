import { describe, expect, it } from "vitest";
import {
  formatDiffPercent,
  formatDiffYen,
  formatSize,
  formatUnitPrice,
  formatYen,
  formatYenDetailed,
  parseSizeText,
  taxIncludedPrice,
  unitBase,
  unitBaseLabel,
  unitLabel,
  unitPrice,
} from "./unitPrice";

describe("税込への揃え方", () => {
  it("すでに税込ならそのまま", () => {
    expect(taxIncludedPrice(198, true, 8)).toBe(198);
  });

  it("本体価格なら税を足す(円未満は切り捨て)", () => {
    // 198 * 1.08 = 213.84 → レジと同じく切り捨てて 213
    expect(taxIncludedPrice(198, false, 8)).toBe(213);
    // 500 * 1.1 = 550
    expect(taxIncludedPrice(500, false, 10)).toBe(550);
  });

  it("非課税(0%)なら本体価格のまま", () => {
    expect(taxIncludedPrice(300, false, 0)).toBe(300);
  });

  it("おかしな値が来ても 0 円として扱う(画面を壊さない)", () => {
    expect(taxIncludedPrice(Number.NaN, true, 8)).toBe(0);
    expect(taxIncludedPrice(-100, true, 8)).toBe(0);
  });
});

describe("単価", () => {
  it("g は 100g あたりで出す", () => {
    // 500g で 300 円 → 100g あたり 60 円
    expect(unitPrice(300, 500, "g")).toBe(60);
  });

  it("ml は 100ml あたりで出す", () => {
    // 1000ml で 198 円 → 100ml あたり 19.8 円
    expect(unitPrice(198, 1000, "ml")).toBeCloseTo(19.8);
  });

  it("個数モノは 1 個あたりで出す", () => {
    // 6 個で 240 円 → 1 個 40 円
    expect(unitPrice(240, 6, "piece")).toBe(40);
  });

  it("内容量が分からなければ比べようがないので null", () => {
    expect(unitPrice(300, null, "g")).toBeNull();
    expect(unitPrice(300, 0, "g")).toBeNull();
  });

  it("単位の基準量と見出し", () => {
    expect(unitBase("g")).toBe(100);
    expect(unitBase("piece")).toBe(1);
    expect(unitLabel("piece")).toBe("個");
    expect(unitBaseLabel("ml")).toBe("100mlあたり");
    expect(unitBaseLabel("piece")).toBe("1個あたり");
  });

  it("容量が違っても単価なら公平に比べられる", () => {
    // 500ml 128 円 と 1000ml 238 円 → 100ml あたり 25.6 円 と 23.8 円で
    // 大きい方が安い、と正しく分かる
    const small = unitPrice(128, 500, "ml") as number;
    const large = unitPrice(238, 1000, "ml") as number;
    expect(large).toBeLessThan(small);
  });
});

describe("表示の整形", () => {
  it("円の表示", () => {
    expect(formatYen(198)).toBe("198円");
    expect(formatYen(1980)).toBe("1,980円");
    expect(formatYen(198.6)).toBe("199円");
  });

  it("小さい単価は小数第 1 位まで残す", () => {
    expect(formatYenDetailed(19.83)).toBe("19.8円");
    // 100 円を超えたら小数はノイズなので落とす
    expect(formatYenDetailed(123.4)).toBe("123円");
  });

  it("差額には必ず符号を付ける", () => {
    expect(formatDiffYen(32)).toBe("+32円");
    expect(formatDiffYen(-15)).toBe("-15円");
    expect(formatDiffYen(0)).toBe("±0円");
    expect(formatDiffPercent(12.4)).toBe("+12%");
    expect(formatDiffPercent(-8)).toBe("-8%");
  });

  it("内容量と単価の表示", () => {
    expect(formatSize(1000, "ml")).toBe("1000ml");
    expect(formatSize(6, "piece")).toBe("6個");
    expect(formatSize(null, "g")).toBeNull();
    expect(formatUnitPrice(19.8, "ml")).toBe("100mlあたり 19.8円");
    expect(formatUnitPrice(null, "ml")).toBeNull();
  });
});

describe("内容量の文字列を読み取る", () => {
  it("g / ml をそのまま読む", () => {
    expect(parseSizeText("500g")).toEqual({ amount: 500, unit: "g" });
    expect(parseSizeText("1000ml")).toEqual({ amount: 1000, unit: "ml" });
  });

  it("kg / L は g / ml に直す", () => {
    expect(parseSizeText("2kg")).toEqual({ amount: 2000, unit: "g" });
    expect(parseSizeText("1.5L")).toEqual({ amount: 1500, unit: "ml" });
  });

  it("個数の表記は piece にまとめる", () => {
    expect(parseSizeText("6個")).toEqual({ amount: 6, unit: "piece" });
    expect(parseSizeText("10枚")).toEqual({ amount: 10, unit: "piece" });
  });

  it("全角で書かれていても読める", () => {
    expect(parseSizeText("５００ｇ")).toEqual({ amount: 500, unit: "g" });
  });

  it("余計な文字が混じっていても数字と単位を拾う", () => {
    expect(parseSizeText("牛乳 1000ml 紙パック")).toEqual({
      amount: 1000,
      unit: "ml",
    });
  });

  it("読み取れなければ null", () => {
    expect(parseSizeText("おいしい牛乳")).toBeNull();
    expect(parseSizeText("")).toBeNull();
    expect(parseSizeText("0g")).toBeNull();
  });
});
