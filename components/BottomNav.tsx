"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  History,
  ShoppingBasket,
  Store,
  Tag,
  type LucideIcon,
} from "lucide-react";

/**
 * 画面下部のタブ。
 *
 * アイコンは lucide-react(MIT)の線画に統一している。
 * 絵文字は端末ごとに絵柄も色も変わってしまい、統一感が出ないため使わない。
 * 必要なアイコンだけを名前指定で import すること(バンドルを膨らませないため)。
 */
const tabs: {
  href: string;
  label: string;
  Icon: LucideIcon;
}[] = [
  { href: "/", label: "記録", Icon: Tag },
  { href: "/products", label: "商品", Icon: ShoppingBasket },
  { href: "/stores", label: "店", Icon: Store },
  { href: "/compare", label: "比較", Icon: ArrowLeftRight },
  { href: "/history", label: "履歴", Icon: History },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md">
        {tabs.map(({ href, label, Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              // 指で押しやすいよう縦の当たり判定を 56px 以上確保する
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] leading-none transition-colors ${
                active ? "text-emerald-600" : "text-gray-400"
              }`}
            >
              <Icon
                aria-hidden
                size={22}
                // 選択中だけ線を太くして、色が見えにくい環境でも現在地が分かるようにする
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span
                className={`whitespace-nowrap ${
                  active ? "font-semibold" : "font-medium"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
