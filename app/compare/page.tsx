"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  regularStoreIdSet,
  toPricePoints,
  type PricePoint,
} from "@/lib/priceStats";
import { comparisonSummary, compareStores } from "@/lib/storeCompare";
import { formatDiffPercent, formatDiffYen, formatYen } from "@/lib/unitPrice";
import type { PriceLog, Product, Store } from "@/lib/types";

/**
 * 店まるごとの比較。
 *
 * 「A スーパーと B スーパー、結局どっちが安いのか」に答える画面。
 * 両方で記録したことがある商品だけを突き合わせるので、
 * 片方でしか記録していない商品に結果が引っぱられない。
 */
export default function ComparePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<PriceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [storeA, setStoreA] = useState("");
  const [storeB, setStoreB] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [storeResult, productResult, logResult] = await Promise.all([
      supabase
        .from("stores")
        .select("*")
        .order("is_regular", { ascending: false })
        .order("name"),
      supabase.from("products").select("*").order("name"),
      supabase
        .from("price_logs")
        .select("*")
        .order("recorded_on", { ascending: false })
        .limit(3000),
    ]);

    const failure = storeResult.error ?? productResult.error ?? logResult.error;
    if (failure) {
      setError(`読み込みに失敗しました: ${failure.message}`);
    } else {
      const loaded = storeResult.data ?? [];
      setStores(loaded);
      setProducts(productResult.data ?? []);
      setLogs(logResult.data ?? []);
      // よく使う組み合わせを最初から選んでおく
      if (loaded.length >= 2) {
        setStoreA((current) => current || loaded[0].id);
        setStoreB((current) => current || loaded[1].id);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const regularIds = useMemo(() => regularStoreIdSet(stores), [stores]);
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );
  const storeLabel = useCallback(
    (storeId: string) => {
      const store = stores.find((s) => s.id === storeId);
      if (!store) return "";
      return store.branch ? `${store.name} ${store.branch}` : store.name;
    },
    [stores]
  );

  /** 商品ごとの記録(税込・単価に直したもの) */
  const pointsByProduct = useMemo(() => {
    const byProduct = new Map<string, PriceLog[]>();
    for (const log of logs) {
      const list = byProduct.get(log.product_id);
      if (list) list.push(log);
      else byProduct.set(log.product_id, [log]);
    }
    const result = new Map<string, PricePoint[]>();
    for (const product of products) {
      result.set(
        product.id,
        toPricePoints(byProduct.get(product.id) ?? [], product, regularIds)
      );
    }
    return result;
  }, [logs, products, regularIds]);

  const comparison = useMemo(() => {
    if (!storeA || !storeB || storeA === storeB) return null;
    return compareStores(pointsByProduct, storeA, storeB);
  }, [pointsByProduct, storeA, storeB]);

  return (
    <main className="p-4">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <ArrowLeftRight aria-hidden size={20} strokeWidth={2} />
        店を比べる
      </h1>
      <p className="mb-4 text-xs leading-relaxed text-gray-500">
        両方の店で値段を記録したことがある商品だけを突き合わせます。
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : stores.length < 2 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          比べるには店が 2 つ以上必要です。
          <Link href="/stores" className="ml-1 font-semibold text-emerald-700">
            店を登録する
          </Link>
        </p>
      ) : (
        <>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <label className="block text-xs font-semibold text-gray-500">
              比べる店 A
            </label>
            <select
              value={storeA}
              onChange={(e) => setStoreA(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {storeLabel(s.id)}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-xs font-semibold text-gray-500">
              比べる店 B
            </label>
            <select
              value={storeB}
              onChange={(e) => setStoreB(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {storeLabel(s.id)}
                </option>
              ))}
            </select>
          </div>

          {storeA === storeB ? (
            <p className="mt-4 rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
              違う店を 2 つ選んでください。
            </p>
          ) : comparison === null ? null : (
            <>
              {/* 表を読まなくても結論が分かるよう、まず一言でまとめる */}
              <p className="mt-4 rounded-xl bg-emerald-600 p-4 text-sm font-semibold leading-relaxed text-white">
                {comparisonSummary(
                  comparison,
                  storeLabel(storeA),
                  storeLabel(storeB)
                )}
              </p>

              {comparison.rows.length > 0 && (
                <>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="truncate text-xs text-gray-500">
                        {storeLabel(storeA)} が安い
                      </p>
                      <p className="mt-0.5 font-bold">{comparison.winsA} 商品</p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-xs text-gray-500">同じ</p>
                      <p className="mt-0.5 font-bold">{comparison.ties} 商品</p>
                    </div>
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="truncate text-xs text-gray-500">
                        {storeLabel(storeB)} が安い
                      </p>
                      <p className="mt-0.5 font-bold">{comparison.winsB} 商品</p>
                    </div>
                  </div>

                  <h2 className="mt-5 mb-2 text-sm font-semibold text-gray-600">
                    商品ごとの差(差の大きい順)
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {comparison.rows.map((row) => {
                      const product = productById.get(row.productId);
                      const cheaperLabel =
                        row.cheaper === "a"
                          ? storeLabel(storeA)
                          : row.cheaper === "b"
                            ? storeLabel(storeB)
                            : null;
                      return (
                        <li
                          key={row.productId}
                          className="rounded-xl bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/products/${row.productId}`}
                              className="min-w-0 flex-1 truncate font-semibold"
                            >
                              {product?.name ?? "(削除された商品)"}
                            </Link>
                            {cheaperLabel ? (
                              <span className="shrink-0 truncate rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                {cheaperLabel} が
                                {formatDiffYen(Math.abs(row.diff)).replace("+", "")}
                                安い
                              </span>
                            ) : (
                              <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                                同じ
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                            <span className="tabular-nums">
                              A {formatYen(row.priceA)}
                            </span>
                            <span aria-hidden>/</span>
                            <span className="tabular-nums">
                              B {formatYen(row.priceB)}
                            </span>
                            <span className="ml-auto tabular-nums">
                              {formatDiffPercent(row.diffPercent)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
