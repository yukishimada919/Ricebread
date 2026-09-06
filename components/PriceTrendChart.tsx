"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateLabel, formatShortDateLabel } from "@/lib/date";
import type { TrendRow } from "@/lib/priceStats";

/** グラフの線 1 本分(店 1 つ分) */
export type TrendSeries = { key: string; name: string; color: string };

/**
 * ツールチップの中身。
 *
 * recharts が用意している formatter は型が厳しく、
 * 複数の店を並べたい今回の用途にも合わないので自前で描く。
 * その日に記録のある店だけが payload に入ってくる。
 */
function TrendTooltip({
  active,
  payload,
  label,
  suffix,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string | number;
  suffix: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 shadow-md">
      <p className="text-xs text-gray-500">{formatDateLabel(String(label))}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {payload.map((entry, index) => (
          <li key={index} className="flex items-center gap-1.5 text-sm">
            <span
              aria-hidden
              className="inline-block h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600">{entry.name}</span>
            <span className="ml-auto font-bold tabular-nums">
              {Math.round(Number(entry.value) * 10) / 10}
              {suffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 値動きの折れ線グラフ。店ごとに 1 本の線を引く。
 *
 * 「同じ商品でも日によって値段が変わる」のを目で確かめるためのもの。
 *
 * 記録の無い日は線をつないでいる(connectNulls)。
 * 店に行く日はばらばらなので、つながないと
 * どの店の線も点が飛び飛びになるだけで値動きが読めなくなるため。
 * 実際に記録した日は点(dot)で示してあるので、
 * 線のどこが実測でどこが間の推定かは見て分かる。
 */
export default function PriceTrendChart({
  rows,
  series,
  unitLabel,
}: {
  rows: TrendRow[];
  series: TrendSeries[];
  /** 縦軸の単位(「円(税込)」など) */
  unitLabel: string;
}) {
  // 点が 1 つだけだと線が引けないので、そのときは点を大きく描く
  const singlePoint = rows.length === 1;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDateLabel}
            tick={{ fontSize: 11 }}
            stroke="#9ca3af"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="#9ca3af"
            width={48}
            // 0 から描くと値動きが潰れて見えないので、データの幅に合わせる
            domain={["auto", "auto"]}
          />
          <Tooltip content={<TrendTooltip suffix="円" />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Line
              key={s.key}
              // 値段は滑らかに動くものではないので、曲線ではなく直線でつなぐ
              type="linear"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: singlePoint ? 4 : 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-xs text-gray-400">縦軸: {unitLabel}</p>
    </div>
  );
}
