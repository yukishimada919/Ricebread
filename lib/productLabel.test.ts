import { describe, expect, it } from "vitest";
import {
  MAX_READABLE_PRICE_YEN,
  findMatchingProduct,
  isEmptyReading,
  normalizeReading,
  toPositiveOrNull,
  toPriceOrNull,
  toSizeInputText,
  toSizeUnit,
  toTaxRate,
  toText,
} from "./productLabel";
import { parseSizeText } from "./unitPrice";

/**
 * ここでテストしているのは「AI がおかしな値を返したときに壊れないか」。
 * 正常系より異常系のほうが大事なので、そちらを厚くしている。
 */

describe("単位", () => {
  it("知っている単位はそのまま通す", () => {
    expect(toSizeUnit("g")).toBe("g");
    expect(toSizeUnit("ml")).toBe("ml");
    expect(toSizeUnit("piece")).toBe("piece");
  });

  it("知らない単位は個数に倒す", () => {
    expect(toSizeUnit("kg")).toBe("piece");
    expect(toSizeUnit("リットル")).toBe("piece");
    expect(toSizeUnit(null)).toBe("piece");
    expect(toSizeUnit(123)).toBe("piece");
  });
});

describe("文字列", () => {
  it("前後の空白は落とす", () => {
    expect(toText("  おいしい牛乳  ", 100)).toBe("おいしい牛乳");
  });

  it("空文字と「不明」は未入力にする", () => {
    expect(toText("", 100)).toBeNull();
    expect(toText("   ", 100)).toBeNull();
    expect(toText("不明", 100)).toBeNull();
  });

  it("文字列でないものは未入力にする", () => {
    expect(toText(null, 100)).toBeNull();
    expect(toText(42, 100)).toBeNull();
    expect(toText({ a: 1 }, 100)).toBeNull();
  });

  it("長すぎる文字列は切り詰める(DB の桁あふれを防ぐ)", () => {
    expect(toText("あ".repeat(500), 100)).toHaveLength(100);
  });
});

describe("数値", () => {
  it("正の数は通す", () => {
    expect(toPositiveOrNull(1000)).toBe(1000);
    expect(toPositiveOrNull(2.5)).toBe(2.5);
  });

  it("文字列で来ても数値として読む", () => {
    expect(toPositiveOrNull("500")).toBe(500);
  });

  it("0・マイナス・数値でないものは未入力にする", () => {
    expect(toPositiveOrNull(0)).toBeNull();
    expect(toPositiveOrNull(-100)).toBeNull();
    expect(toPositiveOrNull("たくさん")).toBeNull();
    expect(toPositiveOrNull(null)).toBeNull();
    expect(toPositiveOrNull(Number.NaN)).toBeNull();
    expect(toPositiveOrNull(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("細かすぎる小数は丸める", () => {
    expect(toPositiveOrNull(333.33333)).toBe(333.33);
  });
});

describe("税率", () => {
  it("酒類などの 10% はそのまま", () => {
    expect(toTaxRate(10)).toBe(10);
    expect(toTaxRate("10")).toBe(10);
  });

  it("食品の 8% はそのまま", () => {
    expect(toTaxRate(8)).toBe(8);
  });

  it("日本に無い税率が来たら 8% に倒す(食品を扱うアプリなので)", () => {
    expect(toTaxRate(5)).toBe(8);
    expect(toTaxRate(0)).toBe(8);
    expect(toTaxRate(100)).toBe(8);
    expect(toTaxRate("よくわからない")).toBe(8);
    expect(toTaxRate(null)).toBe(8);
  });
});

describe("読み取り結果をまとめて整える", () => {
  it("ちゃんとした返事はそのまま通る", () => {
    expect(
      normalizeReading({
        name: "おいしい牛乳",
        maker: "明治",
        size_amount: 1000,
        size_unit: "ml",
        size_text: "1000ml",
        tax_rate_percent: 8,
        note: "",
      })
    ).toEqual({
      name: "おいしい牛乳",
      maker: "明治",
      size_amount: 1000,
      size_unit: "ml",
      size_text: "1000ml",
      tax_rate_percent: 8,
      // 値札が写っていない写真なので、値段まわりは未入力のまま
      price_yen: null,
      price_tax_included: true,
      is_sale: false,
      price_text: null,
      note: null,
    });
  });

  it("項目が足りない返事でも落ちない", () => {
    const r = normalizeReading({ name: "食パン" });
    expect(r.name).toBe("食パン");
    expect(r.maker).toBeNull();
    expect(r.size_amount).toBeNull();
    expect(r.size_unit).toBe("piece");
    expect(r.tax_rate_percent).toBe(8);
  });

  it("空の返事でも落ちない", () => {
    expect(() => normalizeReading(null)).not.toThrow();
    expect(() => normalizeReading(undefined)).not.toThrow();
    expect(normalizeReading({}).name).toBeNull();
  });

  it("でたらめな値が混ざっていても、おかしな商品を作らない", () => {
    const r = normalizeReading({
      name: "不明",
      maker: 12345,
      size_amount: -50,
      size_unit: "たる",
      tax_rate_percent: 3,
    });
    expect(r.name).toBeNull();
    expect(r.maker).toBeNull();
    expect(r.size_amount).toBeNull();
    expect(r.size_unit).toBe("piece");
    expect(r.tax_rate_percent).toBe(8);
  });
});

describe("読み取れたかどうかの判定", () => {
  it("商品名が取れていなければ「読み取れなかった」扱い", () => {
    expect(isEmptyReading(normalizeReading({ size_amount: 500 }))).toBe(true);
  });

  it("商品名さえ取れていれば使える", () => {
    expect(isEmptyReading(normalizeReading({ name: "牛乳" }))).toBe(false);
  });
});

describe("内容量の入力欄に入れる文字列", () => {
  it("単位まで含めた形にする(保存時に読み直せるように)", () => {
    expect(toSizeInputText(normalizeReading({ name: "x", size_amount: 1000, size_unit: "ml" })))
      .toBe("1000ml");
    expect(toSizeInputText(normalizeReading({ name: "x", size_amount: 500, size_unit: "g" })))
      .toBe("500g");
  });

  it("個数は「個」と書く(parseSizeText がこの形を読める)", () => {
    expect(toSizeInputText(normalizeReading({ name: "x", size_amount: 6, size_unit: "piece" })))
      .toBe("6個");
  });

  it("内容量が読み取れなければ空にする", () => {
    expect(toSizeInputText(normalizeReading({ name: "x" }))).toBe("");
  });
});

/**
 * 写真から読み取った内容量は、いったん入力欄の文字列になり、
 * 保存するときに parseSizeText() で数値に戻される。
 * ここがずれると「1000ml と読み取ったのに 0ml で保存される」ことが起きるので、
 * 往復して元に戻ることを確かめておく。
 */
describe("読み取り → 入力欄 → 保存 の往復", () => {
  const cases = [
    { amount: 1000, unit: "ml" as const },
    { amount: 500, unit: "g" as const },
    { amount: 6, unit: "piece" as const },
    { amount: 1.5, unit: "ml" as const },
    { amount: 2000, unit: "g" as const },
  ];

  for (const { amount, unit } of cases) {
    it(`${amount}${unit} が往復しても変わらない`, () => {
      const reading = normalizeReading({
        name: "テスト商品",
        size_amount: amount,
        size_unit: unit,
      });
      const text = toSizeInputText(reading);
      const parsed = parseSizeText(text);
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe(amount);
      expect(parsed?.unit).toBe(unit);
    });
  }
});

/**
 * 値札の読み取り。
 *
 * 値段は相場の計算に直接入るので、読み違いがそのまま入ると
 * 以後の「高い/安い」の判定が全部狂う。
 * 怪しい値は通さず「未入力」にして、手で入れてもらう方針。
 */
describe("値段", () => {
  it("ふつうの値段は通す", () => {
    expect(toPriceOrNull(298)).toBe(298);
    expect(toPriceOrNull("1280")).toBe(1280);
  });

  it("小数は円単位に切り捨てる", () => {
    expect(toPriceOrNull(298.7)).toBe(298);
  });

  it("桁を読み違えたような値は通さない(相場が壊れるため)", () => {
    expect(toPriceOrNull(MAX_READABLE_PRICE_YEN + 1)).toBeNull();
    expect(toPriceOrNull(9_999_999)).toBeNull();
  });

  it("上限ちょうどは通す", () => {
    expect(toPriceOrNull(MAX_READABLE_PRICE_YEN)).toBe(MAX_READABLE_PRICE_YEN);
  });

  it("0・マイナス・数値でないものは未入力にする", () => {
    expect(toPriceOrNull(0)).toBeNull();
    expect(toPriceOrNull(-100)).toBeNull();
    expect(toPriceOrNull("安い")).toBeNull();
    expect(toPriceOrNull(null)).toBeNull();
  });
});

describe("値札まわりの既定値", () => {
  it("税込かどうかが分からなければ税込として扱う(日本の表示は税込が主流)", () => {
    expect(normalizeReading({ name: "x" }).price_tax_included).toBe(true);
    expect(
      normalizeReading({ name: "x", price_tax_included: false }).price_tax_included
    ).toBe(false);
  });

  it("値引きシールの有無は、はっきり true のときだけ特売にする", () => {
    expect(normalizeReading({ name: "x" }).is_sale).toBe(false);
    expect(normalizeReading({ name: "x", is_sale: "はい" }).is_sale).toBe(false);
    expect(normalizeReading({ name: "x", is_sale: true }).is_sale).toBe(true);
  });

  it("値札が写っていなければ値段は未入力のまま", () => {
    const r = normalizeReading({ name: "牛乳" });
    expect(r.price_yen).toBeNull();
    expect(r.price_text).toBeNull();
  });

  it("商品と値札がそろっていれば両方そのまま通る", () => {
    const r = normalizeReading({
      name: "合いびき肉",
      size_amount: 400,
      size_unit: "g",
      price_yen: 321,
      price_tax_included: true,
      is_sale: true,
      price_text: "298円(税込321円) 20%引",
    });
    expect(r.price_yen).toBe(321);
    expect(r.is_sale).toBe(true);
    expect(r.price_text).toContain("20%引");
  });
});

/**
 * 登録済みの商品を探す規則。
 *
 * DB 側のユニーク制約と同じでなければならない。
 * ずれると、同じ商品を二重に登録しようとして弾かれるか、
 * 別の商品を同じものと見なして値段を混ぜてしまう。
 */
describe("登録済みの商品を探す", () => {
  const products = [
    { name: "牛乳", maker: "明治" },
    { name: "食パン", maker: null },
    { name: "たまご", maker: "JA" },
  ];

  it("同じ名前・同じメーカーなら見つかる", () => {
    expect(findMatchingProduct(products, "牛乳", "明治")?.maker).toBe("明治");
  });

  it("メーカーが違えば別の商品として扱う", () => {
    expect(findMatchingProduct(products, "牛乳", "森永")).toBeNull();
  });

  it("前後の空白と大文字小文字は無視する(DB の制約と同じ)", () => {
    expect(findMatchingProduct(products, " 牛乳 ", " 明治 ")).not.toBeNull();
    expect(
      findMatchingProduct([{ name: "Milk", maker: "MEIJI" }], "milk", "meiji")
    ).not.toBeNull();
  });

  it("メーカー無しどうしは名前だけで判定する", () => {
    expect(findMatchingProduct(products, "食パン", null)).not.toBeNull();
    expect(findMatchingProduct(products, "食パン", "")).not.toBeNull();
  });

  it("メーカー無しと、メーカーありは別物", () => {
    expect(findMatchingProduct(products, "食パン", "山崎")).toBeNull();
  });

  it("名前が部分的に一致するだけでは同じ商品にしない", () => {
    expect(findMatchingProduct(products, "牛乳パック", "明治")).toBeNull();
    expect(findMatchingProduct(products, "牛", "明治")).toBeNull();
  });

  it("登録が無ければ null", () => {
    expect(findMatchingProduct([], "牛乳", "明治")).toBeNull();
  });
});
