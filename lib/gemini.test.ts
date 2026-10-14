import { describe, expect, it } from "vitest";
import {
  describeGeminiError,
  generateContent,
  invalidateModelCache,
  rankModels,
} from "./gemini";
import type { GoogleGenAI } from "@google/genai";

/**
 * モデル選定のテスト。
 *
 * 2026 年 9 月に、コードに直書きしていたモデル名 3 つが同時に提供終了して
 * AI 機能が全滅した。その再発防止として「使えるモデルを一覧から選ぶ」ように
 * したので、その選び方が意図どおりかをここで固定する。
 */
describe("rankModels", () => {
  it("文章生成に使えないモデル(埋め込み・画像生成・音声)を除く", () => {
    const models = rankModels([
      { name: "models/text-embedding-004" },
      { name: "models/imagen-4.0-generate-001" },
      { name: "models/gemini-2.5-flash-image" },
      { name: "models/gemini-2.5-flash-tts" },
      { name: "models/veo-3.0-generate-001" },
      { name: "models/gemini-2.5-flash" },
    ]);
    expect(models).toEqual(["gemini-2.5-flash"]);
  });

  it("同じ世代なら flash を pro より優先する(速くて安いため)", () => {
    const models = rankModels([
      { name: "models/gemini-2.5-pro" },
      { name: "models/gemini-2.5-flash" },
    ]);
    expect(models[0]).toBe("gemini-2.5-flash");
  });

  it("新しい pro より、古くても flash を選ぶ(無料枠が pro は極端に少ないため)", () => {
    const models = rankModels([
      { name: "models/gemini-4.0-pro" },
      { name: "models/gemini-2.5-flash" },
    ]);
    expect(models[0]).toBe("gemini-2.5-flash");
  });

  it("flash が無ければ flash-lite、それも無ければ pro を使う", () => {
    expect(
      rankModels([{ name: "models/gemini-4.0-pro" }, { name: "models/gemini-2.5-flash-lite" }])[0]
    ).toBe("gemini-2.5-flash-lite");
    expect(rankModels([{ name: "models/gemini-4.0-pro" }])[0]).toBe("gemini-4.0-pro");
  });

  it("新しい世代を優先する", () => {
    const models = rankModels([
      { name: "models/gemini-2.0-flash" },
      { name: "models/gemini-4.1-flash" },
      { name: "models/gemini-2.5-flash" },
    ]);
    expect(models[0]).toBe("gemini-4.1-flash");
  });

  it("試験版(preview / exp)は安定版より後ろに回す", () => {
    const models = rankModels([
      { name: "models/gemini-2.5-flash-preview-09-2026" },
      { name: "models/gemini-2.5-flash" },
    ]);
    expect(models[0]).toBe("gemini-2.5-flash");
  });

  it("版数の無い別名(-latest)は、より新しい版があればそちらに譲る", () => {
    const models = rankModels([
      { name: "models/gemini-flash-latest" },
      { name: "models/gemini-4.0-flash" },
      { name: "models/gemini-2.0-flash" },
    ]);
    expect(models[0]).toBe("gemini-4.0-flash");
    // 古い版よりは別名を優先する(別名は常に最新へ向け直されるため)
    expect(models[1]).toBe("gemini-flash-latest");
  });

  it("generateContent に対応していないモデルは選ばない", () => {
    const models = rankModels([
      { name: "models/gemini-2.5-flash-live", supportedActions: ["bidiGenerateContent"] },
      { name: "models/gemini-2.5-flash", supportedActions: ["generateContent"] },
    ]);
    expect(models).toEqual(["gemini-2.5-flash"]);
  });

  it("フォールバック用に上位 3 つまで返す", () => {
    const models = rankModels([
      { name: "models/gemini-3.0-flash" },
      { name: "models/gemini-2.5-flash" },
      { name: "models/gemini-2.0-flash" },
      { name: "models/gemini-1.5-flash" },
    ]);
    expect(models).toHaveLength(3);
    expect(models).toEqual([
      "gemini-3.0-flash",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ]);
  });

  it("候補が無ければ空を返す(呼び出し側がフォールバックに切り替える)", () => {
    expect(rankModels([{ name: "models/text-embedding-004" }])).toEqual([]);
  });
});

/**
 * 失敗の種類分け。
 *
 * ここを間違えると、待てば直る失敗(混雑)で即座に諦めたり、
 * 逆に直らない失敗(キー不正)で延々と再試行したりする。
 *
 * 実際、混雑(503)が「再試行してよい失敗」に入っていなかったため、
 * 写真の読み取りが 6 回中 3 回失敗していた(2026-10-14 に判明)。
 */
describe("describeGeminiError", () => {
  /** API が返すエラーの形をまねる */
  const err = (status: number, message = "") =>
    Object.assign(new Error(message), { status });

  it("混雑(503)は SERVICE_UNAVAILABLE になる", () => {
    expect(describeGeminiError(err(503)).code).toBe("SERVICE_UNAVAILABLE");
  });

  it("ステータスが無くても overloaded の文言で混雑と分かる", () => {
    expect(describeGeminiError(new Error("The model is overloaded")).code).toBe(
      "SERVICE_UNAVAILABLE"
    );
  });

  it("レート制限(429)と混雑(503)は別物として扱う", () => {
    expect(describeGeminiError(err(429)).code).toBe("RATE_LIMITED");
    expect(describeGeminiError(err(503)).code).not.toBe("RATE_LIMITED");
  });

  it("キー不正は再試行しても直らないので別のコードにする", () => {
    const code = describeGeminiError(err(401)).code;
    expect(code).not.toBe("SERVICE_UNAVAILABLE");
    expect(code).not.toBe("RATE_LIMITED");
  });

  it("どのエラーでも、画面に出せる日本語のメッセージが付く", () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      const failure = describeGeminiError(err(status));
      expect(failure.message.length).toBeGreaterThan(0);
      expect(failure.code.length).toBeGreaterThan(0);
      expect(failure.status).toBeGreaterThanOrEqual(400);
    }
  });
});

/**
 * 混雑したときに、ちゃんと待ち直すか。
 *
 * 以前は 503 を「再試行してよい失敗」に入れ忘れていたため、
 * 1 回混んでいるだけで即座に諦めていた。実際に写真の読み取りが
 * 6 回中 3 回失敗し、同じ画像でも 4 回目でようやく通る状態だった。
 *
 * 実際に待つので数秒かかるが、ここが壊れると
 * 「たまに失敗するアプリ」に戻ってしまうので残しておく。
 */
describe("混雑(503)のときの再試行", () => {
  /** 指定した回数だけ 503 を返し、そのあと成功する偽のクライアント */
  function fakeAi(failTimes: number, calls: { n: number }) {
    return {
      models: {
        list: async () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              name: "models/gemini-2.5-flash",
              supportedActions: ["generateContent"],
            };
          },
        }),
        generateContent: async () => {
          calls.n++;
          if (calls.n <= failTimes) {
            throw Object.assign(
              new Error("The model is overloaded. Please try again later."),
              { status: 503 }
            );
          }
          return { candidates: [{ content: { parts: [{ text: "{}" }] } }] };
        },
      },
    } as unknown as GoogleGenAI;
  }

  const opts = { label: "test", contents: [], timeoutMs: 40_000 };

  it("1 回混んでいても、待ち直して成功する", async () => {
    invalidateModelCache();
    const calls = { n: 0 };
    const { response } = await generateContent(fakeAi(1, calls), opts);
    expect(response).toBeTruthy();
    expect(calls.n).toBe(2);
  }, 20_000);

  it("2 回続けて混んでいても、3 回目で成功する", async () => {
    invalidateModelCache();
    const calls = { n: 0 };
    const { response } = await generateContent(fakeAi(2, calls), opts);
    expect(response).toBeTruthy();
    expect(calls.n).toBe(3);
  }, 20_000);

  it("ずっと混んでいれば諦めるが、1 回で諦めたりはしない", async () => {
    invalidateModelCache();
    const calls = { n: 0 };
    await expect(generateContent(fakeAi(99, calls), opts)).rejects.toThrow();
    expect(calls.n).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("時間が残っていなければ待ち直さず、混雑のまま返す(時間切れに化けさせない)", async () => {
    // 実機で踏んだ不具合の再現。
    // 1 回目に時間をほとんど使ったあと待ち直すと、残り時間が足りずに
    // 打ち切られ、画面には「混み合っています」ではなく
    // 「時間がかかりすぎたため中断しました(TIMEOUT)」が出ていた。
    // 原因が分からなくなるうえ、ユーザーは電波のせいだと誤解する。
    invalidateModelCache();
    const calls = { n: 0 };
    const slowThenOverloaded = {
      models: {
        list: async () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              name: "models/gemini-2.5-flash",
              supportedActions: ["generateContent"],
            };
          },
        }),
        generateContent: async () => {
          calls.n++;
          // 持ち時間 2 秒のうち 1.5 秒を使ってから混雑で落ちる
          await new Promise((r) => setTimeout(r, 1_500));
          throw Object.assign(new Error("The model is overloaded."), {
            status: 503,
          });
        },
      },
    } as unknown as GoogleGenAI;

    await expect(
      generateContent(slowThenOverloaded, { ...opts, timeoutMs: 2_000 })
    ).rejects.toMatchObject({ failure: { code: "SERVICE_UNAVAILABLE" } });
    // 残り時間が足りないので待ち直さない
    expect(calls.n).toBe(1);
  }, 20_000);
});
