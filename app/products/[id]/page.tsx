"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PriceTrendChart from "@/components/PriceTrendChart";
import { VerdictPill } from "@/components/VerdictBadge";
import { relativeDateLabel } from "@/lib/date";
import { storeColor } from "@/lib/storeColors";
import {
  baselineOf,
  buildTrendSeries,
  canCompareByUnit,
  judge,
  regularStoreIdSet,
  summarize,
  summarizeByStore,
  toPricePoints,
} from "@/lib/priceStats";
import {
  formatSize,
  formatYen,
  formatYenDetailed,
  unitBaseLabel,
} from "@/lib/unitPrice";
import type { PriceLog, Product, Store } from "@/lib/types";

/**
 * 商品 1 つの詳細。
 *
 * ここで答えたいのは 2 つ。
 *   - どの店で買うのがいちばん安いのか(店ごとの相場を並べる)
 *   - 値段はふだんどう動いているのか(折れ線グラフ)
 */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [logs, setLogs] = useState<PriceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  /** 単価(100gあたりなど)で見るかどうか */
  const [byUnit, setByUnit] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [productResult, storeResult, logResult] = await Promise.all([
      supabase.from("products").select("*").eq("id", productId).maybeSingle(),
      supabase.from("stores").select("*").order("name"),
      supabase
        .from("price_logs")
        .select("*")
        .eq("product_id", productId)
        .order("recorded_on", { ascending: false })
        .limit(500),
    ]);

    const failure = productResult.error ?? storeResult.error ?? logResult.error;
    if (failure) {
      setError(`読み込みに失敗しました: ${failure.message}`);
    } else if (!productResult.data) {
      setNotFound(true);
    } else {
      setProduct(productResult.data);
      setStores(storeResult.data ?? []);
      setLogs(logResult.data ?? []);
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const regularIds = useMemo(() => regularStoreIdSet(stores), [stores]);
  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const storeLabel = useCallback(
    (storeId: string) => {
      const store = storeById.get(storeId);
      if (!store) return "(削除された店)";
      return store.branch ? `${store.name} ${store.branch}` : store.name;
    },
    [storeById]
  );

  const points = useMemo(
    () => (product ? toPricePoints(logs, product, regularIds) : []),
    [logs, product, regularIds]
  );

  const stats = useMemo(() => summarize(points, byUnit), [points, byUnit]);
  const baseline = useMemo(() => baselineOf(points, byUnit), [points, byUnit]);
  const byStore = useMemo(() => summarizeByStore(points, byUnit), [points, byUnit]);
  const trendRows = useMemo(() => buildTrendSeries(points, byUnit), [points, byUnit]);

  /** グラフに出す店(この商品の記録がある店だけ) */
  const series = useMemo(
    () =>
      byStore.map((s) => ({
        key: s.storeId,
        name: storeLabel(s.storeId),
        color: storeColor(s.storeId),
      })),
    [byStore, storeLabel]
  );

  const deleteLog = async (log: PriceLog) => {
    if (!confirm(`${log.recorded_on} の記録を削除しますか?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("price_logs").delete().eq("id", log.id);
    if (error) {
      setError(`削除に失敗しました: ${error.message}`);
    } else {
      await load();
    }
  };

  const deleteProduct = async () => {
    if (!product) return;
    if (
      !confirm(
        `「${product.name}」を削除しますか?\nこの商品の値段の記録もすべて削除されます。`
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      setError(`削除に失敗しました: ${error.message}`);
    } else {
      router.replace("/products");
    }
  };

  if (loading) {
    return (
      <main className="p-4">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </main>
    );
  }

  if (notFound || !product) {
    return (
      <main className="p-4">
        <Link href="/products" className="text-sm text-emerald-700">
          ← 商品一覧へ
        </Link>
        <p className="mt-4 rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          この商品は見つかりませんでした(削除された可能性があります)。
        </p>
      </main>
    );
  }

  const unitText = byUnit ? unitBaseLabel(product.size_unit) : "1点あたり";
  const showPrice = (value: number) =>
    byUnit ? formatYenDetailed(value) : formatYen(value);

  return (
    <main className="p-4">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-sm text-emerald-700"
      >
        <ArrowLeft aria-hidden size={16} />
        商品一覧へ
      </Link>

      <h1 className="mt-2 text-xl font-bold">{product.name}</h1>
      <p className="text-sm text-gray-500">
        {product.maker ? `${product.maker} ・ ` : ""}
        {formatSize(product.size_amount, product.size_unit) ?? "内容量の登録なし"}
        {" ・ 税率 "}
        {product.tax_rate_percent}%
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* 内容量が入っている商品だけ、単価での見方に切り替えられる */}
      {canCompareByUnit(product) && (
        <div className="mt-3 flex rounded-xl bg-gray-200 p-1 text-sm font-semibold">
          <button
            onClick={() => setByUnit(false)}
            className={`flex-1 rounded-lg py-2 ${
              byUnit ? "text-gray-500" : "bg-white text-gray-900 shadow-sm"
            }`}
          >
            そのままの値段
          </button>
          <button
            onClick={() => setByUnit(true)}
            className={`flex-1 rounded-lg py-2 ${
              byUnit ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {unitBaseLabel(product.size_unit)}
          </button>
        </div>
      )}

      {!stats || !baseline ? (
        <p className="mt-4 rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          まだ値段の記録がありません。
          <Link href="/" className="ml-1 font-semibold text-emerald-700">
            記録する
          </Link>
        </p>
      ) : (
        <>
          <section className="mt-4 grid grid-cols-3 gap-2">
            <SummaryTile label="相場" value={showPrice(baseline.value)} highlight />
            <SummaryTile label="いちばん安かった" value={showPrice(stats.min)} />
            <SummaryTile label="いちばん高かった" value={showPrice(stats.max)} />
          </section>
          <p className="mt-1 text-xs text-gray-400">
            {unitText}・記録 {stats.count}件
            {baseline.includedSales && "(特売しか記録が無いため特売込みの相場です)"}
          </p>

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-gray-600">
              店ごとの相場(安い順)
            </h2>
            <ul className="flex flex-col gap-2">
              {byStore.map((entry, index) => {
                // その店の相場が、全体の相場と比べて高いか安いかを出す
                const verdict = judge(entry.baseline.value, baseline);
                return (
                  <li
                    key={entry.storeId}
                    className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: storeColor(entry.storeId) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {storeLabel(entry.storeId)}
                        {index === 0 && (
                          <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                            最安
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {entry.isRegularStore ? "いつもの店 ・ " : ""}
                        記録 {entry.stats.count}件 ・ 最安{" "}
                        {showPrice(entry.stats.min)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">
                        {showPrice(entry.baseline.value)}
                      </p>
                      <VerdictPill verdict={verdict.verdict} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {trendRows.length > 0 && (
            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-gray-600">値動き</h2>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <PriceTrendChart
                  rows={trendRows}
                  series={series}
                  unitLabel={byUnit ? `${unitBaseLabel(product.size_unit)}(円)` : "円(税込)"}
                />
              </div>
            </section>
          )}

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-gray-600">
              記録の履歴({logs.length}件)
            </h2>
            <ul className="flex flex-col gap-2">
              {logs.map((log) => {
                const point = points.find(
                  (p) =>
                    p.storeId === log.store_id && p.recordedOn === log.recorded_on
                );
                const value = byUnit ? point?.unitPrice ?? null : point?.price ?? null;
                return (
                  <li
                    key={log.id}
                    className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {storeLabel(log.store_id)}
                        {log.is_sale && (
                          <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-700">
                            特売
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {relativeDateLabel(log.recorded_on)}
                        {log.memo ? ` ・${log.memo}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">
                      {value === null ? "—" : showPrice(value)}
                    </p>
                    <button
                      onClick={() => deleteLog(log)}
                      aria-label="この記録を削除"
                      className="shrink-0 rounded-lg p-2 text-gray-400 active:bg-gray-100"
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <button
        onClick={deleteProduct}
        className="mt-8 w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 active:bg-red-50"
      >
        この商品を削除する
      </button>
    </main>
  );
}

/** 相場・最安・最高を並べる小さなタイル */
function SummaryTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 text-center shadow-sm ${
        highlight ? "bg-emerald-600 text-white" : "bg-white"
      }`}
    >
      <p className={`text-xs ${highlight ? "opacity-90" : "text-gray-500"}`}>
        {label}
      </p>
      <p className="mt-0.5 font-bold tabular-nums">{value}</p>
    </div>
  );
}
