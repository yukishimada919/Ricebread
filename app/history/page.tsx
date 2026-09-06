"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { History as HistoryIcon, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDateLabel } from "@/lib/date";
import { formatYen, taxIncludedPrice } from "@/lib/unitPrice";
import type { PriceLogWithRefs } from "@/lib/types";

/** 1 度に読み込む件数(古い記録は「もっと見る」で足していく) */
const PAGE_SIZE = 50;

/**
 * 記録した値段を新しい順に並べた履歴。
 * 打ち間違いを見つけて消すための画面でもある。
 */
export default function HistoryPage() {
  const [logs, setLogs] = useState<PriceLogWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (offset: number) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("price_logs")
      .select(
        "*, products(id, name, maker, size_amount, size_unit, tax_rate_percent), stores(id, name, branch, is_regular)"
      )
      .order("recorded_on", { ascending: false })
      .order("created_at", { ascending: false })
      // 次のページがあるかを知るために 1 件多く取る
      .range(offset, offset + PAGE_SIZE);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  }, []);

  const load = useCallback(async () => {
    try {
      const { rows, hasMore } = await fetchPage(0);
      setLogs(rows);
      setHasMore(hasMore);
    } catch (e) {
      setError(`履歴の取得に失敗しました: ${(e as Error).message}`);
    }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { rows, hasMore } = await fetchPage(logs.length);
      setLogs((current) => [...current, ...rows]);
      setHasMore(hasMore);
    } catch (e) {
      setError(`続きの取得に失敗しました: ${(e as Error).message}`);
    }
    setLoadingMore(false);
  };

  const deleteLog = async (log: PriceLogWithRefs) => {
    if (
      !confirm(
        `${log.recorded_on} の「${log.products?.name ?? "この記録"}」を削除しますか?`
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase.from("price_logs").delete().eq("id", log.id);
    if (error) {
      setError(`削除に失敗しました: ${error.message}`);
    } else {
      setLogs((current) => current.filter((l) => l.id !== log.id));
    }
  };

  /** 日付ごとにまとめる(同じ日の買い物がひと目で分かるように) */
  const byDate = useMemo(() => {
    const groups = new Map<string, PriceLogWithRefs[]>();
    for (const log of logs) {
      const list = groups.get(log.recorded_on);
      if (list) list.push(log);
      else groups.set(log.recorded_on, [log]);
    }
    return [...groups.entries()];
  }, [logs]);

  return (
    <main className="p-4">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold">
        <HistoryIcon aria-hidden size={20} strokeWidth={2} />
        履歴
      </h1>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : logs.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          まだ記録がありません。
          <Link href="/" className="ml-1 font-semibold text-emerald-700">
            値段を記録する
          </Link>
        </p>
      ) : (
        <>
          {byDate.map(([date, dayLogs]) => (
            <section key={date} className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-gray-600">
                {formatDateLabel(date)}
              </h2>
              <ul className="flex flex-col gap-2">
                {dayLogs.map((log) => {
                  // 一覧では税込に揃えて出す(税抜の値札と混ざると比べられないため)
                  const withTax = taxIncludedPrice(
                    Number(log.price_yen),
                    log.tax_included,
                    Number(log.products?.tax_rate_percent ?? 0)
                  );
                  return (
                    <li
                      key={log.id}
                      className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        {log.products ? (
                          <Link
                            href={`/products/${log.products.id}`}
                            className="block truncate font-semibold"
                          >
                            {log.products.name}
                            {log.is_sale && (
                              <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold text-orange-700">
                                特売
                              </span>
                            )}
                          </Link>
                        ) : (
                          <p className="truncate font-semibold text-gray-400">
                            (削除された商品)
                          </p>
                        )}
                        <p className="truncate text-xs text-gray-500">
                          {log.stores?.name ?? "(削除された店)"}
                          {log.stores?.branch ? ` ${log.stores.branch}` : ""}
                          {log.memo ? ` ・${log.memo}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">
                          {formatYen(withTax)}
                        </p>
                        {!log.tax_included && (
                          <p className="text-xs text-gray-400">
                            税抜 {formatYen(Number(log.price_yen))}
                          </p>
                        )}
                      </div>
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
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 font-semibold active:bg-gray-50 disabled:opacity-40"
            >
              {loadingMore ? "読み込み中..." : "もっと見る"}
            </button>
          )}
        </>
      )}
    </main>
  );
}
