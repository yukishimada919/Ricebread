import { NextResponse } from "next/server";
import { ThinkingLevel, Type } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import {
  GEMINI_NOT_CONFIGURED_MESSAGE,
  IMAGE_TIMEOUT_MS,
  describeGeminiError,
  extractText,
  failureBody,
  generateContent,
  getGeminiClient,
  parseJsonFromText,
  readImageRequest,
} from "@/lib/gemini";
import { isEmptyReading, normalizeReading } from "@/lib/productLabel";

// 画像解析は数秒〜十数秒かかることがあるため上限を延長
export const maxDuration = 60;

const LABEL = "analyze-package";

/**
 * POST /api/products/analyze-package
 * body: { image: string (base64), mimeType: string }
 *
 * 商品パッケージを撮った写真から、商品名・メーカー・内容量を読み取って返す。
 * 返した値はそのまま保存せず、必ず登録フォームに流し込んで
 * ユーザーが確認・修正できる形で表示すること。
 *
 * Gemini API はこのサーバー内でのみ呼び出す(キーはクライアントに露出しない)。
 */
export async function POST(request: Request) {
  // ログインユーザーのみ利用可(API キーの悪用防止)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const ai = getGeminiClient();
  if (!ai) {
    console.error(`[gemini] ${LABEL} aborted: GEMINI_API_KEY is not set`);
    return NextResponse.json(
      { error: GEMINI_NOT_CONFIGURED_MESSAGE, code: "NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  try {
    const { image, mimeType } = await readImageRequest(request);
    console.log(
      `[gemini] ${LABEL} start mimeType=${mimeType} base64Length=${image.length}`
    );

    const { response } = await generateContent(ai, {
      label: LABEL,
      timeoutMs: IMAGE_TIMEOUT_MS,
      thinkingLevel: ThinkingLevel.LOW,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: image } },
            {
              text: [
                "これはスーパーで売っている商品のパッケージの写真です。",
                "値段を記録するための商品登録に使うので、次の項目を読み取ってください。",
                "",
                "【読み取るもの】",
                "- name: 商品名。パッケージに大きく書かれている名前をそのまま。",
                "    メーカー名は含めないこと(例: 「明治おいしい牛乳」なら name は「おいしい牛乳」)。",
                "    読み取れなければ空文字。",
                "- maker: メーカー名・ブランド名(例: 明治、サントリー)。無ければ空文字。",
                "- size_amount: 内容量の数値だけ(例: 「1000ml」なら 1000)。読み取れなければ 0。",
                "- size_unit: 内容量の単位。g / ml / piece のいずれか。",
                "    重さ(g・kg)なら g、体積(ml・L)なら ml、",
                "    個数(個・本・枚・袋・玉)なら piece。",
                "- size_text: パッケージに書かれていた内容量の文言そのまま(例: 「1L」「500g」「6個入」)。無ければ空文字。",
                "- tax_rate_percent: 酒類(ビール・日本酒・ワイン・チューハイなど)なら 10、",
                "    それ以外の食品・飲料なら 8。食品以外の日用品も 10。",
                "- note: 読み取りの補足。無ければ空文字。",
                "",
                "【単位の換算】",
                "- kg は g に直してください(例: 「2kg」→ size_amount 2000, size_unit g)。",
                "- L は ml に直してください(例: 「1L」→ size_amount 1000, size_unit ml)。",
                "- それ以外の換算はしないこと。",
                "",
                "【注意】",
                "- 写真から読み取れないものは、でっち上げずに空文字か 0 にしてください。",
                "- 「6本入り 各500ml」のように 1 本あたりと総量が両方書いてある場合は、",
                "  1 個(1 本)あたりの量を size_amount にし、note にその旨を書いてください。",
                "  値段は 1 パックあたりで記録されることが多いためです。",
                "- 商品のパッケージが写っていない場合は、すべて空文字 / 0 にし、",
                "  note に「商品が見つかりませんでした」と書いてください。",
              ].join("\n"),
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            maker: { type: Type.STRING },
            size_amount: { type: Type.NUMBER },
            size_unit: { type: Type.STRING, enum: ["g", "ml", "piece"] },
            size_text: { type: Type.STRING },
            tax_rate_percent: { type: Type.NUMBER },
            note: { type: Type.STRING },
          },
          required: [
            "name",
            "maker",
            "size_amount",
            "size_unit",
            "size_text",
            "tax_rate_percent",
            "note",
          ],
        },
      },
    });

    const text = extractText(response, LABEL);
    const parsed = parseJsonFromText(text) as Record<string, unknown> | null;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error(
        `[gemini] ${LABEL} unexpected response shape: ${text.slice(0, 300)}`
      );
      return NextResponse.json(
        {
          error:
            "商品を読み取れませんでした。パッケージの表面が大きく写るように撮り直すか、手入力してください。(PARSE_FAILED)",
          code: "PARSE_FAILED",
        },
        { status: 502 }
      );
    }

    // AI の返事はそのまま信用せず、必ずここを通してから返す
    // (整形の中身と、その理由は lib/productLabel.ts にまとめてある)
    const reading = normalizeReading(parsed);
    const empty = isEmptyReading(reading);

    console.log(
      `[gemini] ${LABEL} done empty=${empty} size=${reading.size_amount}${reading.size_unit}`
    );
    return NextResponse.json({ reading, empty });
  } catch (e) {
    const failure = describeGeminiError(e);
    console.error(`[gemini] ${LABEL} responding ${failure.status} ${failure.code}`);
    return NextResponse.json(failureBody(failure), { status: failure.status });
  }
}
