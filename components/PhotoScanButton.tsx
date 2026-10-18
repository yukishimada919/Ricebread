"use client";

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { compressImage, imageErrorMessage } from "@/lib/image";
import type { ProductLabelReading } from "@/lib/types";

/**
 * 商品の写真を読み取るボタン。
 *
 * 商品タブ(事前に商品を登録する)と記録タブ(買い物中に値段ごと記録する)の
 * 両方から使うので、読み取りの手順はここに 1 つだけ置いている。
 * 読み取った内容をどう使うかは、呼び出し側それぞれの仕事。
 *
 * 写真はサーバーに送るだけで保存しない。確認用の URL を呼び出し側に渡す。
 */
export default function PhotoScanButton({
  label,
  onResult,
  onError,
  onStart,
}: {
  /** ボタンの文言(画面によって「商品」か「商品と値段」かが変わる) */
  label: string;
  /** 読み取れたとき。photoUrl は確認用の画像(使い終わったら解放すること) */
  onResult: (reading: ProductLabelReading, photoUrl: string) => void;
  onError: (message: string) => void;
  onStart?: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  /**
   * 読み取りを始めてからの経過秒数。
   *
   * 混み合っていると 30 秒以上かかることがあり、
   * 表示が止まったままだと固まったように見える。
   * 数字が動いていれば、待つか諦めるかを自分で決められる。
   */
  const [seconds, setSeconds] = useState(0);

  // 読み取り中だけ経過秒数を数える(終わったら止める)
  useEffect(() => {
    if (!scanning) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scanning]);

  const scan = async (file: File) => {
    setScanning(true);
    setSeconds(0);
    onStart?.();

    try {
      // そのまま送ると数 MB になるので、送る前に縮める
      const { blob, base64, mimeType } = await compressImage(file);
      // 読み取りに出したのと同じ画像を返す(結果と見比べられるように)
      const photoUrl = URL.createObjectURL(blob);

      const res = await fetch("/api/products/analyze-package", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType }),
      });
      const json = await res.json();

      if (!res.ok) {
        URL.revokeObjectURL(photoUrl);
        onError(json.error ?? "写真の読み取りに失敗しました。");
        return;
      }
      if (json.empty) {
        onError(
          "商品を読み取れませんでした。パッケージの表面が大きく写るように撮り直すか、手で入力してください。"
        );
        // 失敗しても写真は残す。何を撮ったのか分からないと直しようがないため
        onResult(json.reading as ProductLabelReading, photoUrl);
        return;
      }

      onResult(json.reading as ProductLabelReading, photoUrl);
    } catch (e) {
      onError(imageErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <label
        data-tour="products-scan"
        className={`flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600 px-4 py-3 font-semibold text-emerald-700 ${
          scanning ? "opacity-50" : "active:bg-emerald-50"
        }`}
      >
        <Camera aria-hidden size={18} />
        {scanning ? `読み取り中... ${seconds}秒` : label}
        <input
          type="file"
          accept="image/*"
          // capture は付けないこと。
          // 付けると iOS Safari はカメラを直接起動してしまい、
          // 写真ライブラリから選べなくなる(実機で詰まった)。
          // 外しておけば iOS / Android とも
          // 「写真を撮る / ライブラリから選ぶ」の両方が出る。
          disabled={scanning}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 同じ写真をもう一度選んでも onChange が起きるように値を空に戻す
            e.target.value = "";
            if (file) scan(file);
          }}
          className="hidden"
        />
      </label>

      {/* 待たせていることが分かるように、長引いたときだけ理由を添える */}
      {scanning && seconds >= 10 && (
        <p className="mt-2 rounded-lg bg-gray-100 p-3 text-xs leading-relaxed text-gray-600">
          AI が混み合っていると 30 秒ほどかかることがあります。そのままお待ちください。
        </p>
      )}
    </>
  );
}
