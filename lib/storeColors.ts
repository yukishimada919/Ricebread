/**
 * グラフの線や凡例に使う店の色。
 *
 * 店ごとに固定の色を割り当てたいが、店の並び順は増減で変わるので、
 * id から決まる色を選ぶ(同じ店はいつも同じ色になる)。
 * 色は隣り合っても見分けられるよう、色相を散らして選んである。
 */
const PALETTE = [
  "#059669", // emerald-600
  "#2563eb", // blue-600
  "#d97706", // amber-600
  "#db2777", // pink-600
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
  "#dc2626", // red-600
  "#65a30d", // lime-600
];

/** id から色を決める(同じ id なら毎回同じ色) */
export function storeColor(storeId: string): string {
  let hash = 0;
  for (let i = 0; i < storeId.length; i++) {
    hash = (hash * 31 + storeId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
