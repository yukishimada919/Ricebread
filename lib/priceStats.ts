/**
 * 「その値段は高いのか安いのか」を判断するところ。このアプリの心臓部。
 *
 * 判断のしかたは 2 通りある。どちらも「相場(ふだんの値段)」を出して、
 * 目の前の値段がそこからどれだけ離れているかを見る、という同じ形をしている。
 *
 *   1. judgeAgainstRegularStores … よその店の値段を「いつもの店」の相場と比べる
 *      → たまに行ったスーパーが近所より高いのか安いのかが分かる
 *
 *   2. judgeAgainstOwnHistory … 同じ店の過去の値段と比べる
 *      → 同じ店でも日によって動く値段が、いつもより高いのか安いのかが分かる
 *
 * 相場の出し方で大事にしていること:
 *   - 平均ではなく中央値を使う。1 回の極端な値段(高級品を間違えて記録した等)に
 *     相場全体が引っ張られないようにするため。
 *   - 特売は相場から外す。特売を混ぜると「ふだんの値段」が実際より安く見えて、
 *     通常価格がいつも「高い」と判定されてしまう。
 *   - 記録が少ないうちは confidence を "low" にして、画面側で断定を避ける。
 */

import type { PriceLog, Product, SizeUnit, Store } from "./types";
import { taxIncludedPrice, unitPrice } from "./unitPrice";

// ------------------------------------------------------------
// 判定に使うデータの形
// ------------------------------------------------------------

/**
 * 判定に使う 1 件分の記録。
 * DB の行から、比較に必要なものだけを取り出して税込に揃えたもの。
 */
export type PricePoint = {
  storeId: string;
  /** その店が「いつもの店」か(相場のものさしに使ってよいか) */
  isRegularStore: boolean;
  recordedOn: string; // YYYY-MM-DD
  /** 税込に直した価格(円) */
  price: number;
  /** 単価(100g あたりなど)。内容量が分からなければ null */
  unitPrice: number | null;
  isSale: boolean;
};

/** 相場の計算に何件使ったか / 特売を混ぜざるを得なかったか */
export type Baseline = {
  /** 相場(円)。単価で比べているときは単価の相場 */
  value: number;
  /** 相場の計算に使った記録の件数 */
  sampleCount: number;
  /**
   * 通常価格の記録が 1 件も無く、やむを得ず特売も含めて計算した。
   * true のときは相場が実際より安めに出ているので、画面側で断り書きを出す。
   */
  includedSales: boolean;
};

/** 高い/安いの 5 段階 */
export type Verdict =
  | "much_cheaper"
  | "cheaper"
  | "normal"
  | "pricier"
  | "much_pricier"
  | "unknown";

export type Judgement = {
  verdict: Verdict;
  /** 相場との差(円)。プラスなら相場より高い */
  diff: number;
  /** 相場との差(%)。プラスなら相場より高い */
  diffPercent: number;
  /** 比較のものさしにした相場(判定できなかったときは null) */
  baseline: Baseline | null;
  /**
   * 判定の確からしさ。
   * 記録が少ないうちは "low"(画面側で「記録が少ないので目安です」と添える)。
   */
  confidence: "low" | "ok";
  /** 判定できなかった理由(verdict が "unknown" のときだけ入る) */
  reason: string | null;
};

// ------------------------------------------------------------
// しきい値
// ------------------------------------------------------------

/**
 * 相場から何 % 離れたら「安い/高い」と言うか。
 *
 * スーパーの値段は同じ商品でも日によって数 % は普通に動くので、
 * ±5% までは「ふつう」として騒がないことにしている。
 * 15% 以上ずれていれば、はっきり「かなり安い/かなり高い」と言ってよい。
 */
export const VERDICT_THRESHOLD_PERCENT = {
  /** これ以上離れていたら「かなり安い / かなり高い」 */
  large: 15,
  /** これ以上離れていたら「安い / 高い」 */
  small: 5,
} as const;

/** これ未満の件数で出した相場は、確からしさを "low" として扱う */
export const LOW_CONFIDENCE_SAMPLE_COUNT = 3;

/** 判定ラベルの表示文言 */
export const VERDICT_LABELS: Record<Verdict, string> = {
  much_cheaper: "かなり安い",
  cheaper: "安い",
  normal: "ふつう",
  pricier: "高い",
  much_pricier: "かなり高い",
  unknown: "判定できません",
};

// ------------------------------------------------------------
// DB の行 → 判定用のデータ
// ------------------------------------------------------------

/**
 * 価格記録を、税込・単価まで計算した判定用の形に直す。
 *
 * 内容量はその日の記録に上書きがあればそちらを優先する(増量パックなど)。
 * 税率は商品ごとに持っているので、値札が本体価格でもここで税込に揃う。
 */
export function toPricePoints(
  logs: PriceLog[],
  product: Pick<Product, "size_amount" | "size_unit" | "tax_rate_percent">,
  regularStoreIds: ReadonlySet<string>
): PricePoint[] {
  return logs.map((log) => {
    const price = taxIncludedPrice(
      Number(log.price_yen),
      log.tax_included,
      Number(product.tax_rate_percent)
    );
    const size = log.size_amount ?? product.size_amount;
    return {
      storeId: log.store_id,
      isRegularStore: regularStoreIds.has(log.store_id),
      recordedOn: log.recorded_on,
      price,
      unitPrice: unitPrice(price, size, product.size_unit),
      isSale: log.is_sale,
    };
  });
}

/** 店の一覧から「いつもの店」の id を集める */
export function regularStoreIdSet(
  stores: Pick<Store, "id" | "is_regular">[]
): Set<string> {
  return new Set(stores.filter((s) => s.is_regular).map((s) => s.id));
}

// ------------------------------------------------------------
// 基本の集計
// ------------------------------------------------------------

/** 判定に使う値を取り出す。単価で比べたいときは unitPrice、無ければ null */
function valueOf(point: PricePoint, useUnitPrice: boolean): number | null {
  return useUnitPrice ? point.unitPrice : point.price;
}

/** 中央値(値が偶数個なら真ん中 2 つの平均) */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export type PriceStats = {
  count: number;
  min: number;
  max: number;
  median: number;
  average: number;
  /** いちばん新しい記録(同じ日が複数あれば配列の後ろにあるものを採る) */
  latest: { price: number; date: string } | null;
};

/** 記録のかたまりを集計する。1 件も使える値が無ければ null */
export function summarize(
  points: PricePoint[],
  useUnitPrice = false
): PriceStats | null {
  const usable = points.filter((p) => valueOf(p, useUnitPrice) !== null);
  if (usable.length === 0) return null;

  const values = usable.map((p) => valueOf(p, useUnitPrice) as number);
  const latest = [...usable].sort((a, b) =>
    a.recordedOn < b.recordedOn ? -1 : a.recordedOn > b.recordedOn ? 1 : 0
  )[usable.length - 1];

  return {
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    median: median(values) as number,
    average: values.reduce((sum, v) => sum + v, 0) / values.length,
    latest: {
      price: valueOf(latest, useUnitPrice) as number,
      date: latest.recordedOn,
    },
  };
}

// ------------------------------------------------------------
// 相場を出す
// ------------------------------------------------------------

/**
 * 相場(ふだんの値段)を出す。
 *
 * 通常価格の記録だけの中央値を採る。
 * 通常価格の記録が 1 件も無いときだけ、特売も含めて計算し
 * includedSales に印を付けて返す(画面側で断り書きを出せるように)。
 */
export function baselineOf(
  points: PricePoint[],
  useUnitPrice = false
): Baseline | null {
  const usable = points.filter((p) => valueOf(p, useUnitPrice) !== null);
  if (usable.length === 0) return null;

  const regular = usable.filter((p) => !p.isSale);
  const source = regular.length > 0 ? regular : usable;
  const value = median(source.map((p) => valueOf(p, useUnitPrice) as number));
  if (value === null) return null;

  return {
    value,
    sampleCount: source.length,
    includedSales: regular.length === 0,
  };
}

// ------------------------------------------------------------
// 判定する
// ------------------------------------------------------------

/** 相場からのずれ(%)を 5 段階のラベルに落とす */
export function verdictFromPercent(diffPercent: number): Verdict {
  const { large, small } = VERDICT_THRESHOLD_PERCENT;
  if (diffPercent <= -large) return "much_cheaper";
  if (diffPercent <= -small) return "cheaper";
  if (diffPercent < small) return "normal";
  if (diffPercent < large) return "pricier";
  return "much_pricier";
}

/** 判定できなかったときの戻り値 */
function unknown(reason: string): Judgement {
  return {
    verdict: "unknown",
    diff: 0,
    diffPercent: 0,
    baseline: null,
    confidence: "low",
    reason,
  };
}

/** 値段と相場を突き合わせて 5 段階のラベルを付ける */
export function judge(price: number, baseline: Baseline | null): Judgement {
  if (baseline === null) {
    return unknown("比べられる過去の記録がまだありません");
  }
  if (baseline.value <= 0) {
    return unknown("相場が 0 円なので比べられません");
  }

  const diff = price - baseline.value;
  const diffPercent = (diff / baseline.value) * 100;

  return {
    verdict: verdictFromPercent(diffPercent),
    diff,
    diffPercent,
    baseline,
    confidence:
      baseline.sampleCount < LOW_CONFIDENCE_SAMPLE_COUNT ? "low" : "ok",
    reason: null,
  };
}

export type JudgeOptions = {
  /** 内容量の違う商品と比べたいときは true(単価で判定する) */
  useUnitPrice?: boolean;
};

/**
 * 判定その 1:「よその店と比べて高いか安いか」
 *
 * いつもの店(is_regular)の記録だけを相場のものさしにする。
 * 旅先のスーパーのような、たまにしか行かない店の値段に
 * 相場が引っ張られないようにするため。
 *
 * @param price      いま見ている値段(税込。単価で比べるときは単価)
 * @param points     その商品の全記録
 * @param excludeStoreId いま見ている店。自分自身を相場に含めないよう外す
 */
export function judgeAgainstRegularStores(
  price: number,
  points: PricePoint[],
  excludeStoreId?: string,
  options: JudgeOptions = {}
): Judgement {
  const useUnitPrice = options.useUnitPrice ?? false;
  const reference = points.filter(
    (p) => p.isRegularStore && p.storeId !== excludeStoreId
  );

  if (reference.length === 0) {
    return unknown(
      "いつも行く店の記録がまだありません。店の設定で「よく行く店」に印を付けてください"
    );
  }
  return judge(price, baselineOf(reference, useUnitPrice));
}

/**
 * 判定その 2:「この店のいつもの値段と比べて高いか安いか」
 *
 * 同じ店・同じ商品の過去の記録だけを相場にする。
 * 店が違えば値段の水準も違うので、店をまたいで混ぜない。
 *
 * @param excludeDate 今日入れたばかりの記録を相場から外したいときに渡す
 */
export function judgeAgainstOwnHistory(
  price: number,
  points: PricePoint[],
  storeId: string,
  excludeDate?: string,
  options: JudgeOptions = {}
): Judgement {
  const useUnitPrice = options.useUnitPrice ?? false;
  const history = points.filter(
    (p) => p.storeId === storeId && p.recordedOn !== excludeDate
  );

  if (history.length === 0) {
    return unknown("この店での過去の記録がまだありません");
  }
  return judge(price, baselineOf(history, useUnitPrice));
}

// ------------------------------------------------------------
// 店ごとのまとめ(商品詳細画面で「どの店が安いか」を出す)
// ------------------------------------------------------------

export type StorePriceSummary = {
  storeId: string;
  isRegularStore: boolean;
  stats: PriceStats;
  /** その店での相場(特売を除いた中央値) */
  baseline: Baseline;
};

/**
 * 店ごとに集計して、相場の安い順に並べる。
 * 同じ相場なら記録の多い店(信用できる方)を先に出す。
 */
export function summarizeByStore(
  points: PricePoint[],
  useUnitPrice = false
): StorePriceSummary[] {
  const byStore = new Map<string, PricePoint[]>();
  for (const point of points) {
    const list = byStore.get(point.storeId);
    if (list) list.push(point);
    else byStore.set(point.storeId, [point]);
  }

  const summaries: StorePriceSummary[] = [];
  for (const [storeId, storePoints] of byStore) {
    const stats = summarize(storePoints, useUnitPrice);
    const baseline = baselineOf(storePoints, useUnitPrice);
    if (!stats || !baseline) continue;
    summaries.push({
      storeId,
      isRegularStore: storePoints.some((p) => p.isRegularStore),
      stats,
      baseline,
    });
  }

  return summaries.sort(
    (a, b) =>
      a.baseline.value - b.baseline.value ||
      b.baseline.sampleCount - a.baseline.sampleCount
  );
}

/** いちばん安い店。記録が無ければ null */
export function cheapestStore(
  points: PricePoint[],
  useUnitPrice = false
): StorePriceSummary | null {
  return summarizeByStore(points, useUnitPrice)[0] ?? null;
}

// ------------------------------------------------------------
// 値動きのグラフ用
// ------------------------------------------------------------

/** グラフ 1 点分。店の id をキーにして、その日その店の値段を入れる */
export type TrendRow = { date: string } & Record<string, number | string | null>;

/**
 * 日付を横軸、店ごとの折れ線にしたデータを作る。
 * 記録の無い日はキー自体を入れない(recharts が線を途切れさせる)。
 * 同じ日に複数の記録があるときは安い方(特売を拾いたい)を採る。
 */
export function buildTrendSeries(
  points: PricePoint[],
  useUnitPrice = false
): TrendRow[] {
  const byDate = new Map<string, Map<string, number>>();

  for (const point of points) {
    const value = valueOf(point, useUnitPrice);
    if (value === null) continue;
    let row = byDate.get(point.recordedOn);
    if (!row) {
      row = new Map();
      byDate.set(point.recordedOn, row);
    }
    const current = row.get(point.storeId);
    if (current === undefined || value < current) {
      row.set(point.storeId, value);
    }
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, row]) => {
      const out: TrendRow = { date };
      for (const [storeId, value] of row) out[storeId] = value;
      return out;
    });
}

/** 単価で比べられるか(内容量が入っている商品か) */
export function canCompareByUnit(
  product: Pick<Product, "size_amount">
): boolean {
  return Boolean(product.size_amount && product.size_amount > 0);
}

/** 比較に使う単位の見出し(単価モードかどうかで変わる) */
export function comparisonUnit(
  product: Pick<Product, "size_unit">,
  useUnitPrice: boolean
): SizeUnit | null {
  return useUnitPrice ? product.size_unit : null;
}
