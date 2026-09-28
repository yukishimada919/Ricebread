"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, ChevronRight, Search, ShoppingBasket, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import HelpButton from "@/components/HelpButton";
import PhotoPreview from "@/components/PhotoPreview";
import { compressImage, imageErrorMessage } from "@/lib/image";
import { toSizeInputText } from "@/lib/productLabel";
import {
  baselineOf,
  cheapestStore,
  regularStoreIdSet,
  toPricePoints,
  type PricePoint,
} from "@/lib/priceStats";
import { SIZE_UNITS, TAX_RATES, formatSize, formatYen, parseSizeText } from "@/lib/unitPrice";
import type {
  PriceLog,
  Product,
  ProductLabelReading,
  SizeUnit,
  Store,
} from "@/lib/types";

/**
 * 商品の一覧。
 * それぞれの商品について「相場はいくらか」「どの店がいちばん安いか」を出す。
 * 買い物の前にここを見れば、どこで何を買うべきかが分かる。
 */
export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [logs, setLogs] = useState<PriceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");

  // 追加フォーム
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const [sizeText, setSizeText] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("g");
  const [taxRate, setTaxRate] = useState(8);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // 写真からの読み取り
  const [scanning, setScanning] = useState(false);
  /** 読み取りに使った写真(確認用に出しておく。保存はしない) */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  /** 読み取り結果の補足(単位を換算した、など) */
  const [scanNote, setScanNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [productResult, storeResult, logResult] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .order("is_favorite", { ascending: false })
        .order("name"),
      supabase.from("stores").select("*").order("name"),
      // 相場を出すのに全商品の記録が要る。個人用なので件数は知れているが、
      // 念のため新しいものから上限を付けて読む。
      supabase
        .from("price_logs")
        .select("*")
        .order("recorded_on", { ascending: false })
        .limit(3000),
    ]);

    const failure = productResult.error ?? storeResult.error ?? logResult.error;
    if (failure) {
      setError(`読み込みに失敗しました: ${failure.message}`);
    } else {
      setProducts(productResult.data ?? []);
      setStores(storeResult.data ?? []);
      setLogs(logResult.data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const regularIds = useMemo(() => regularStoreIdSet(stores), [stores]);
  const storeNameById = useMemo(
    () => new Map(stores.map((s) => [s.id, s.branch ? `${s.name} ${s.branch}` : s.name])),
    [stores]
  );

  /** 商品ごとの記録を、判定に使える形にまとめておく */
  const pointsByProduct = useMemo(() => {
    const byProduct = new Map<string, PriceLog[]>();
    for (const log of logs) {
      const list = byProduct.get(log.product_id);
      if (list) list.push(log);
      else byProduct.set(log.product_id, [log]);
    }
    const result = new Map<string, PricePoint[]>();
    for (const product of products) {
      const productLogs = byProduct.get(product.id) ?? [];
      result.set(product.id, toPricePoints(productLogs, product, regularIds));
    }
    return result;
  }, [logs, products, regularIds]);

  const visible = useMemo(() => {
    const word = keyword.trim().toLowerCase();
    if (!word) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(word) ||
        (p.maker ?? "").toLowerCase().includes(word) ||
        (p.category ?? "").toLowerCase().includes(word)
    );
  }, [products, keyword]);

  /** 入力された内容量の文字列(「500g」など)から数値と単位を読み取る */
  const parsedSize = useMemo(() => parseSizeText(sizeText), [sizeText]);

  /**
   * 商品パッケージの写真を読み取って、登録フォームに流し込む。
   *
   * 読み取った内容はそのまま保存せず、必ずフォームに入れて
   * ユーザーが直せる形にする(AI は読み間違えるため)。
   * 写真自体は保存しない。確認用に画面に出すだけ。
   */
  const scanPhoto = async (file: File) => {
    setScanning(true);
    setError(null);
    setScanNote(null);

    try {
      // そのまま送ると数 MB になるので、送る前に縮める
      const { blob, base64, mimeType } = await compressImage(file);
      // 読み取りに出したのと同じ画像を画面に残す(結果と見比べられるように)
      const url = URL.createObjectURL(blob);
      setPhotoUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });

      const res = await fetch("/api/products/analyze-package", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "写真の読み取りに失敗しました。");
        return;
      }

      const reading = json.reading as ProductLabelReading;
      if (json.empty) {
        setError(
          "商品を読み取れませんでした。パッケージの表面が大きく写るように撮り直すか、手で入力してください。"
        );
        return;
      }

      // フォームを開いて、読み取れたものだけ埋める。
      // 読み取れなかった項目は手で入れてもらうので、既存の入力は消さない。
      setFormOpen(true);
      if (reading.name) setName(reading.name);
      if (reading.maker) setMaker(reading.maker);
      if (reading.size_amount) {
        // 単位まで含めた文字列にしておくと、保存時の parseSizeText がそのまま読み直せる
        // (往復して値が変わらないことは lib/productLabel.test.ts で確かめている)
        setSizeText(toSizeInputText(reading));
        setSizeUnit(reading.size_unit);
      }
      setTaxRate(reading.tax_rate_percent);
      setScanNote(reading.note);
    } catch (e) {
      setError(imageErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const addProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // セッションが切れている場合(AppShell が /login に飛ばす)
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("products").insert({
      user_id: user.id,
      name: name.trim(),
      maker: maker.trim() || null,
      // 「500g」のように単位ごと書かれていれば単位もそこから採る
      size_amount: parsedSize?.amount ?? null,
      size_unit: parsedSize?.unit ?? sizeUnit,
      tax_rate_percent: taxRate,
    });

    if (error) {
      setError(
        error.code === "23505"
          ? "同じ商品(同じメーカー・同じ名前)がすでに登録されています。"
          : `登録に失敗しました: ${error.message}`
      );
    } else {
      setName("");
      setMaker("");
      setSizeText("");
      setFormOpen(false);
      setScanNote(null);
      setPhotoUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      await load();
    }
    setSaving(false);
  };

  const toggleFavorite = async (product: Product) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({ is_favorite: !product.is_favorite })
      .eq("id", product.id);
    if (error) {
      setError(`更新に失敗しました: ${error.message}`);
    } else {
      await load();
    }
  };

  return (
    <main className="p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ShoppingBasket aria-hidden size={20} strokeWidth={2} />
          商品
        </h1>
        <HelpButton tour="products" />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {/* パッケージを撮れば商品名・メーカー・内容量が埋まる。
          内容量は手で打つのが面倒なうえ、入っていないと単価比較が効かないので、
          写真から入れられる意味が大きい。 */}
      <label
        data-tour="products-scan"
        className={`mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 px-4 py-3 font-semibold text-emerald-700 ${
          scanning ? "opacity-50" : "active:bg-emerald-50"
        }`}
      >
        <Camera aria-hidden size={18} />
        {scanning ? "読み取り中..." : "写真から商品を読み取る"}
        <input
          type="file"
          accept="image/*"
          // スマホではその場でカメラが開く
          capture="environment"
          disabled={scanning}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 同じ写真をもう一度選んでも onChange が起きるように値を空に戻す
            e.target.value = "";
            if (file) scanPhoto(file);
          }}
          className="hidden"
        />
      </label>

      {photoUrl && (
        <PhotoPreview
          key={photoUrl}
          url={photoUrl}
          title="読み取った写真"
          hint="入力された内容が合っているか、写真と見比べて確かめてください。"
          className="mb-3"
        />
      )}

      {scanNote && (
        <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          {scanNote}
        </p>
      )}

      {/* 追加フォームは普段たたんでおく(一覧を見に来ることの方が多いので) */}
      {formOpen ? (
        <form
          onSubmit={addProduct}
          data-tour="products-add"
          className="mb-4 rounded-xl bg-white p-3 shadow-sm"
        >
          <h2 className="mb-2 text-sm font-semibold text-gray-600">商品を追加</h2>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="商品名(例: 牛乳)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <input
            type="text"
            value={maker}
            onChange={(e) => setMaker(e.target.value)}
            placeholder="メーカー・ブランド(任意)"
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <div data-tour="products-size" className="mt-2 flex gap-2">
            <input
              type="text"
              value={sizeText}
              onChange={(e) => setSizeText(e.target.value)}
              placeholder="内容量(例: 1000ml、500g、6個)"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
            />
            <select
              value={parsedSize?.unit ?? sizeUnit}
              onChange={(e) => setSizeUnit(e.target.value as SizeUnit)}
              disabled={parsedSize !== null}
              className="w-20 shrink-0 rounded-lg border border-gray-300 px-2 py-2 disabled:bg-gray-100"
            >
              {SIZE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            内容量を入れておくと、容量の違う商品どうしでも
            単価(100gあたりなど)で公平に比べられます。
          </p>

          <label className="mt-3 block text-xs font-semibold text-gray-500">
            消費税率(値札が本体価格だったときに税込へ直すのに使います)
          </label>
          <select
            data-tour="products-tax"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            {TAX_RATES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-semibold active:bg-gray-50"
            >
              やめる
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:opacity-80 disabled:opacity-40"
            >
              {saving ? "追加中..." : "追加する"}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setFormOpen(true)}
          data-tour="products-add-toggle"
          className="mb-4 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:opacity-80"
        >
          商品を追加する
        </button>
      )}

      {products.length > 0 && (
        <div data-tour="products-search" className="relative mb-3">
          <Search
            aria-hidden
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="商品名で探す"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3"
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : visible.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          {products.length === 0
            ? "まだ商品が登録されていません。"
            : "見つかりませんでした。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((product) => {
            const points = pointsByProduct.get(product.id) ?? [];
            const baseline = baselineOf(points);
            const cheapest = cheapestStore(points);

            return (
              <li
                key={product.id}
                data-tour="products-item"
                className="flex items-center gap-1 rounded-xl bg-white shadow-sm"
              >
                <button
                  data-tour="products-favorite"
                  onClick={() => toggleFavorite(product)}
                  aria-label={
                    product.is_favorite
                      ? `${product.name} をよく買う商品から外す`
                      : `${product.name} をよく買う商品にする`
                  }
                  className={`shrink-0 rounded-lg p-3 ${
                    product.is_favorite ? "text-amber-500" : "text-gray-300"
                  }`}
                >
                  <Star
                    aria-hidden
                    size={18}
                    fill={product.is_favorite ? "currentColor" : "none"}
                  />
                </button>

                <Link
                  href={`/products/${product.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {product.name}
                      {formatSize(product.size_amount, product.size_unit) && (
                        <span className="ml-1 text-sm font-normal text-gray-500">
                          {formatSize(product.size_amount, product.size_unit)}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {product.maker ? `${product.maker} ・ ` : ""}
                      {baseline
                        ? `相場 ${formatYen(baseline.value)}(記録 ${baseline.sampleCount}件)`
                        : "まだ記録がありません"}
                    </p>
                    {cheapest && (
                      <p className="truncate text-xs font-medium text-emerald-700">
                        最安 {storeNameById.get(cheapest.storeId) ?? "不明な店"} ・{" "}
                        {formatYen(cheapest.baseline.value)}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    aria-hidden
                    size={18}
                    className="shrink-0 text-gray-300"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
