"use client";

import {
  CircleHelp,
  Minus,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  VERDICT_LABELS,
  type Judgement,
  type Verdict,
} from "@/lib/priceStats";
import { formatDiffPercent, formatDiffYen } from "@/lib/unitPrice";

/**
 * 判定ごとの見た目。
 *
 * 色だけで意味を伝えないよう、アイコン(下向き/上向き/横棒)と
 * 文字(かなり安い など)も必ず一緒に出している。
 */
const STYLES: Record<Verdict, { className: string; Icon: LucideIcon }> = {
  much_cheaper: {
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Icon: TrendingDown,
  },
  cheaper: {
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Icon: TrendingDown,
  },
  normal: {
    className: "bg-gray-100 text-gray-700 border-gray-200",
    Icon: Minus,
  },
  pricier: {
    className: "bg-amber-50 text-amber-800 border-amber-200",
    Icon: TrendingUp,
  },
  much_pricier: {
    className: "bg-red-100 text-red-800 border-red-200",
    Icon: TrendingUp,
  },
  unknown: {
    className: "bg-gray-50 text-gray-500 border-gray-200",
    Icon: CircleHelp,
  },
};

/** 小さいバッジ(一覧の行末などに置く) */
export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const { className, Icon } = STYLES[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      <Icon aria-hidden size={13} strokeWidth={2.25} />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

/**
 * 判定 1 件分のカード。
 *
 * title に「いつもの店と比べて」「この店のふだんと比べて」のように
 * 何と比べた結果なのかを必ず書く。
 * どちらの比較なのかが分からないと、数字を見ても意味が取れないため。
 */
export default function VerdictBadge({
  title,
  judgement,
}: {
  title: string;
  judgement: Judgement;
}) {
  const { className, Icon } = STYLES[judgement.verdict];

  if (judgement.verdict === "unknown") {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs font-semibold text-gray-500">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{judgement.reason}</p>
      </div>
    );
  }

  const { baseline } = judgement;

  return (
    <div className={`rounded-xl border p-3 ${className}`}>
      <p className="text-xs font-semibold opacity-80">{title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-lg font-bold leading-tight">
        <Icon aria-hidden size={20} strokeWidth={2.25} />
        {VERDICT_LABELS[judgement.verdict]}
      </p>
      <p className="mt-1 text-sm font-medium">
        {formatDiffYen(judgement.diff)}({formatDiffPercent(judgement.diffPercent)})
      </p>
      {baseline && (
        <p className="mt-1 text-xs opacity-80">
          相場 {Math.round(baseline.value).toLocaleString("ja-JP")}円 / 記録{" "}
          {baseline.sampleCount}件
          {judgement.confidence === "low" && " ・記録が少ないので目安です"}
          {baseline.includedSales && " ・特売しか記録が無いため特売込みの相場です"}
        </p>
      )}
    </div>
  );
}
