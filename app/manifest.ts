import type { MetadataRoute } from "next";

/**
 * Web App Manifest(/manifest.webmanifest として配信される)。
 * ホーム画面に追加したときのアプリ名・アイコン・起動時の見た目を決める。
 * アイコンは scripts/generate-icons.mjs で生成したものを使う。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "market-price",
    short_name: "market-price",
    description:
      "スーパーの値段を覚えておいて、よその店やいつもの日と比べて高いか安いかを判断する買い物アプリ",
    lang: "ja",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#059669",
    background_color: "#f4f5f7",
    categories: ["shopping", "finance", "lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "値段を記録する", short_name: "記録", url: "/" },
      { name: "商品の相場を見る", short_name: "商品", url: "/products" },
      { name: "店を比べる", short_name: "比較", url: "/compare" },
    ],
  };
}
