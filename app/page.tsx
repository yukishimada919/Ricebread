"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Store as StoreIcon, Tag, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import VerdictBadge from "@/components/VerdictBadge";
import { formatDateLabel, todayString } from "@/lib/date";
import {
  canCompareByUnit,
  judgeAgainstOwnHistory,
  judgeAgainstRegularStores,
  regularStoreIdSet,
  toPricePoints,
} from "@/lib/priceStats";
import {
  formatSize,
  formatUnitPrice,
  formatYen,
  taxIncludedPrice,
  unitBaseLabel,
  unitPrice,
} from "@/lib/unitPrice";
import type { PriceLog, PriceLogWithRefs, Product, Store } from "@/lib/types";

/**
 * 値段を記録する画面(このアプリのメイン)。
 *
 * 店 → 商品 → 値段 の順に選ぶと、保存する前から
 * 「いつもの店と比べて高いか」「この店のふだんと比べて高いか」が出る。
 * レジに並ぶ前に、その場で買うかどうか決められるようにするため。
 */
export default function RecordPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [todayLogs, setTodayLogs] = useState<PriceLogWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 入力中の内容
  const [date, setDate] = useState(todayString());
  const [storeId, setStoreId] = useState("");
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [isSale, setIsSale] = useState(false);
  const [sizeOverride, setSizeOverride] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);

  // 選んだ商品の過去の記録(判定のものさし)
  const [productLogs, setProductLogs] = useState<PriceLog[]>([]);
  const [compareByUnit, setCompareByUnit] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  const loadMasters = useCallback(async () => {
    const supabase = createClient();
    const [storeResult, productResult] = await Promise.all([
      supabase.from("stores").select("*").order("sort_order").order("name"),
      supabase
        .from("products")
        .select("*")
        .order("is_favorite", { ascending: false })
        .order("name"),
    ]);

    if (storeResult.error || productResult.error) {
      setError(
        `読み込みに失敗しました: ${
          storeResult.error?.message ?? productResult.error?.message
        }`
      );
    } else {
      setStores(storeResult.data ?? []);
      setProducts(productResult.data ?? []);
      // よく行く店が 1 つだけなら選んでおく(毎回選ぶ手間を省く)
      const regulars = (storeResult.data ?? []).filter((s) => s.is_regular);
      if (regulars.length === 1) setStoreId(regulars[0].id);
    }
    setLoading(false);
  }, []);

  const loadTodayLogs = useCallback(async (targetDate: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("price_logs")
      .select(
        "*, products(id, name, maker, size_amount, size_unit, tax_rate_percent), stores(id, name, branch, is_regular)"
      )
      .eq("recorded_on", targetDate)
      .order("created_at", { ascending: false });
    if (error) {
      setError(`その日の記録の取得に失敗しました: ${error.message}`);
    } else {
      setTodayLogs(data ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadMasters();
    })();
  }, [loadMasters]);

  useEffect(() => {
    (async () => {
      await loadTodayLogs(date);
    })();
  }, [date, loadTodayLogs]);

  /** 選んだ商品の過去の記録を読み直す(判定のものさしになる) */
  const loadProductLogs = useCallback(async (targetProductId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("price_logs")
      .select("*")
      .eq("product_id", targetProductId)
      .order("recorded_on", { ascending: false })
      .limit(300);
    if (error) {
      setError(`過去の記録の取得に失敗しました: ${error.message}`);
      return;
    }
    setProductLogs(data ?? []);
  }, []);

  // 商品を選んだら、その商品の過去の記録をまとめて読む。
  // 別の商品に切り替わったあとに古い応答が届いても上書きしないよう、
  // 後片付けで印を付けて捨てる。
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("price_logs")
        .select("*")
        .eq("product_id", productId)
        .order("recorded_on", { ascending: false })
        .limit(300);
      if (cancelled) return;
      if (error) {
        setError(`過去の記録の取得に失敗しました: ${error.message}`);
      } else {
        setProductLogs(data ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  /**
   * 商品を選び直す。
   *
   * 内容量の上書きと単価モードは前の商品のものなので一緒に捨てる
   * (別の商品に前の商品の内容量が残っていると単価が狂う)。
   * 過去の記録も、読み直しが終わるまでは前の商品のものなので空にする。
   * 前の商品の相場で判定してしまうと、まったく違う答えが出てしまうため。
   *
   * 同じ商品が選び直されたときは何もしない。
   * ここで記録を空にしても、商品が変わっていない以上は
   * 読み直しの useEffect が動かず、判定が出せなくなってしまう。
   */
  const selectProduct = (nextProductId: string) => {
    if (nextProductId === productId) return;
    setProductId(nextProductId);
    setProductLogs([]);
    setSizeOverride("");
    setCompareByUnit(false);
  };

  const regularIds = useMemo(() => regularStoreIdSet(stores), [stores]);

  const points = useMemo(() => {
    if (!selectedProduct) return [];
    return toPricePoints(productLogs, selectedProduct, regularIds);
  }, [productLogs, selectedProduct, regularIds]);

  // 入力中の値段を税込・単価に直したもの(判定に使う値)
  const entered = useMemo(() => {
    if (!selectedProduct) return null;
    const raw = Number(price);
    if (!price.trim() || !Number.isFinite(raw) || raw <= 0) return null;

    const withTax = taxIncludedPrice(
      raw,
      taxIncluded,
      Number(selectedProduct.tax_rate_percent)
    );
    const size = sizeOverride.trim()
      ? Number(sizeOverride)
      : selectedProduct.size_amount;
    return {
      price: withTax,
      unitPrice: unitPrice(withTax, size, selectedProduct.size_unit),
    };
  }, [price, taxIncluded, selectedProduct, sizeOverride]);

  /** 判定に使う値。単価モードなら単価、そうでなければ税込価格 */
  const comparedValue = compareByUnit ? entered?.unitPrice ?? null : entered?.price ?? null;

  const verdicts = useMemo(() => {
    if (comparedValue === null || !storeId) return null;
    const options = { useUnitPrice: compareByUnit };
    return {
      vsOtherStores: judgeAgainstRegularStores(
        comparedValue,
        points,
        storeId,
        options
      ),
      // 今日つけた記録を相場に混ぜないよう、同じ日付の記録は外す
      vsOwnHistory: judgeAgainstOwnHistory(
        comparedValue,
        points,
        storeId,
        date,
        options
      ),
    };
  }, [comparedValue, points, storeId, date, compareByUnit]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeId || !productId || !price.trim()) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // セッションが切れている場合(AppShell が /login に飛ばす)。
    // ボタンが押せないまま固まらないよう保存中フラグは戻しておく。
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("price_logs").upsert(
      {
        user_id: user.id,
        product_id: productId,
        store_id: storeId,
        recorded_on: date,
        price_yen: Number(price),
        tax_included: taxIncluded,
        is_sale: isSale,
        size_amount: sizeOverride.trim() ? Number(sizeOverride) : null,
        memo: memo.trim() || null,
      },
      // 同じ日・同じ店・同じ商品を二度打ちしたときは上書きする
      // (相場が二重に数えられて狂わないようにするため)
      { onConflict: "product_id,store_id,recorded_on,is_sale" }
    );

    if (error) {
      setError(`保存に失敗しました: ${error.message}`);
    } else {
      setPrice("");
      setMemo("");
      setIsSale(false);
      setSizeOverride("");
      await Promise.all([loadTodayLogs(date), loadProductLogs(productId)]);
    }
    setSaving(false);
  };

  const deleteLog = async (log: PriceLogWithRefs) => {
    if (!confirm(`「${log.products?.name ?? "この記録"}」の記録を削除しますか?`))
      return;
    const supabase = createClient();
    const { error } = await supabase.from("price_logs").delete().eq("id", log.id);
    if (error) {
      setError(`削除に失敗しました: ${error.message}`);
    } else {
      await loadTodayLogs(date);
    }
  };

  if (loading) {
    return (
      <main className="p-4">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  // 店か商品が 1 つも無いと記録できないので、先にそちらへ案内する
  if (stores.length === 0 || products.length === 0) {
    return (
      <main className="p-4">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Tag aria-hidden size={20} strokeWidth={2} />
          値段を記録
        </h1>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">はじめの準備</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            値段を記録するには、先に「店」と「商品」を登録してください。
            いつも行く店を登録しておくと、よその店の値段が高いか安いかを
            比べられるようになります。
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {stores.length === 0 && (
              <Link
                href="/stores"
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:opacity-80"
              >
                <StoreIcon aria-hidden size={18} />
                まず店を登録する
              </Link>
            )}
            {products.length === 0 && (
              <Link
                href="/products"
                className="flex items-center justify-center gap-2 rounded-xl border border-emerald-600 px-4 py-3 font-semibold text-emerald-700 active:opacity-80"
              >
                <Plus aria-hidden size={18} />
                商品を登録する
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold">
        <Tag aria-hidden size={20} strokeWidth={2} />
        値段を記録
      </h1>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={save} className="rounded-xl bg-white p-3 shadow-sm">
        <label className="block text-xs font-semibold text-gray-500">日付</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />

        <label className="mt-3 block text-xs font-semibold text-gray-500">
          店
        </label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">選んでください</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.branch ? ` ${s.branch}` : ""}
              {s.is_regular ? "(いつもの店)" : ""}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-xs font-semibold text-gray-500">
          商品
        </label>
        <select
          value={productId}
          onChange={(e) => selectProduct(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">選んでください</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.is_favorite ? "★ " : ""}
              {p.name}
              {p.maker ? `(${p.maker})` : ""}
              {formatSize(p.size_amount, p.size_unit)
                ? ` ${formatSize(p.size_amount, p.size_unit)}`
                : ""}
            </option>
          ))}
        </select>

        <label className="mt-3 block text-xs font-semibold text-gray-500">
          値段
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="198"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold"
          />
          <span className="shrink-0 text-sm text-gray-500">円</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={taxIncluded}
              onChange={(e) => setTaxIncluded(e.target.checked)}
              className="size-4"
            />
            税込の値段
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={isSale}
              onChange={(e) => setIsSale(e.target.checked)}
              className="size-4"
            />
            特売・見切り品
          </label>
        </div>

        {/* 税抜で入れたときは、実際に払う額を出して確認できるようにする */}
        {!taxIncluded && entered && (
          <p className="mt-2 text-xs text-gray-500">
            税込 {formatYen(entered.price)}(税率{" "}
            {selectedProduct?.tax_rate_percent}%)
          </p>
        )}

        {selectedProduct && canCompareByUnit(selectedProduct) && (
          <>
            <label className="mt-3 block text-xs font-semibold text-gray-500">
              内容量(いつもと違うときだけ)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={sizeOverride}
                onChange={(e) => setSizeOverride(e.target.value)}
                placeholder={String(selectedProduct.size_amount ?? "")}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
              />
              <span className="shrink-0 text-sm text-gray-500">
                {selectedProduct.size_unit === "piece"
                  ? "個"
                  : selectedProduct.size_unit}
              </span>
            </div>
            <label className="mt-2 flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={compareByUnit}
                onChange={(e) => setCompareByUnit(e.target.checked)}
                className="size-4"
              />
              {unitBaseLabel(selectedProduct.size_unit)}で比べる
            </label>
            {entered?.unitPrice !== null && entered !== null && (
              <p className="mt-1 text-xs text-gray-500">
                この値段は{" "}
                {formatUnitPrice(entered.unitPrice, selectedProduct.size_unit)}
              </p>
            )}
          </>
        )}

        <label className="mt-3 block text-xs font-semibold text-gray-500">
          メモ(任意)
        </label>
        <input
          type="text"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="増量パック、閉店前の値引きなど"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
        />

        <button
          type="submit"
          disabled={saving || !storeId || !productId || !price.trim()}
          className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          {saving ? "保存中..." : "この値段を記録する"}
        </button>
      </form>

      {/* 保存する前に判定を出す。買うかどうかはレジに並ぶ前に決めたいので */}
      {verdicts && (
        <section className="mt-4 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-600">
            この値段は高い?安い?
          </h2>
          <VerdictBadge
            title="いつも行く店の相場と比べて"
            judgement={verdicts.vsOtherStores}
          />
          <VerdictBadge
            title="この店のふだんの値段と比べて"
            judgement={verdicts.vsOwnHistory}
          />
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">
          {formatDateLabel(date)} の記録({todayLogs.length}件)
        </h2>
        {todayLogs.length === 0 ? (
          <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
            まだこの日の記録はありません。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {todayLogs.map((log) => (
              <li
                key={log.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {log.products?.name ?? "(削除された商品)"}
                    {log.is_sale && (
                      <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-700">
                        特売
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {log.stores?.name ?? "(削除された店)"}
                    {log.stores?.branch ? ` ${log.stores.branch}` : ""}
                    {log.memo ? ` ・${log.memo}` : ""}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {formatYen(Number(log.price_yen))}
                  {!log.tax_included && (
                    <span className="ml-1 text-xs font-normal text-gray-500">
                      税抜
                    </span>
                  )}
                </p>
                <button
                  onClick={() => deleteLog(log)}
                  aria-label="この記録を削除"
                  className="shrink-0 rounded-lg p-2 text-gray-400 active:bg-gray-100"
                >
                  <Trash2 aria-hidden size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
