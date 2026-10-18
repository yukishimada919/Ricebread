import { describe, expect, it } from "vitest";
import {
  looksVariableWeight,
  needsSizeEachTime,
  shouldCompareByUnit,
  sizeFieldHint,
  sizeFieldLabel,
} from "./variableWeight";

/** テスト用の商品(必要な項目だけ渡せばよい) */
function product(over: Partial<{
  is_variable_weight: boolean;
  size_amount: number | null;
}> = {}) {
  return { is_variable_weight: false, size_amount: 400, ...over };
}

describe("カテゴリから量り売りを推す", () => {
  it("精肉・鮮魚・青果は量り売り扱いにする", () => {
    for (const c of ["精肉", "鮮魚", "青果", "水産", "惣菜"]) {
      expect(looksVariableWeight(c)).toBe(true);
    }
  });

  it("前後に字が付いていても拾う", () => {
    expect(looksVariableWeight("牛肉")).toBe(true);
    expect(looksVariableWeight("鶏肉・精肉")).toBe(true);
    expect(looksVariableWeight("生鮮魚介")).toBe(true);
  });

  it("規格品のカテゴリは量り売りにしない", () => {
    for (const c of ["卵", "乳製品", "パン", "調味料", "飲料", "日用品", "菓子"]) {
      expect(looksVariableWeight(c)).toBe(false);
    }
  });

  it("カテゴリが無ければ量り売りにしない(迷ったら false)", () => {
    expect(looksVariableWeight(null)).toBe(false);
    expect(looksVariableWeight("")).toBe(false);
    expect(looksVariableWeight("   ")).toBe(false);
    expect(looksVariableWeight(undefined)).toBe(false);
  });
});

describe("既定で単価で比べるか", () => {
  it("量り売りなら単価で比べる", () => {
    expect(shouldCompareByUnit(product({ is_variable_weight: true }))).toBe(true);
  });

  it("規格品はそのままの値段で比べる", () => {
    expect(shouldCompareByUnit(product({ is_variable_weight: false }))).toBe(false);
  });

  it("量り売りでも内容量が登録されていなければ単価は出せない", () => {
    expect(
      shouldCompareByUnit(product({ is_variable_weight: true, size_amount: null }))
    ).toBe(false);
    expect(
      shouldCompareByUnit(product({ is_variable_weight: true, size_amount: 0 }))
    ).toBe(false);
  });
});

describe("記録のたびにグラム数が要るか", () => {
  it("量り売りは毎回入れてもらう(登録時の量で計算すると単価が狂うため)", () => {
    expect(needsSizeEachTime({ is_variable_weight: true })).toBe(true);
  });

  it("規格品は毎回入れなくてよい", () => {
    expect(needsSizeEachTime({ is_variable_weight: false })).toBe(false);
  });
});

describe("入力欄の文言", () => {
  it("量り売りは「このパックの内容量」として、理由も添える", () => {
    expect(sizeFieldLabel({ is_variable_weight: true })).toBe("このパックの内容量");
    expect(sizeFieldHint({ is_variable_weight: true })).toContain("量り売り");
  });

  it("規格品は「いつもと違うときだけ」のまま", () => {
    expect(sizeFieldLabel({ is_variable_weight: false })).toContain("いつもと違う");
    expect(sizeFieldHint({ is_variable_weight: false })).toBeNull();
  });
});
