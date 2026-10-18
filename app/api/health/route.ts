import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/health
 *
 * データベースに実際に触れるかどうかを返す。目的は 2 つ。
 *
 * 1. Supabase の無料プランは一定期間アクセスが無いとプロジェクトが
 *    自動で一時停止する(実際に 2 回止まった)。止まるとログインも
 *    データ表示もできず、アプリが壊れたように見える。
 *    GitHub Actions から定期的にここを叩いて、動きを絶やさないようにする。
 *
 * 2. 「アプリが動かない」ときに、原因が Supabase なのかアプリなのかを
 *    すぐ切り分けられるようにする。ブラウザで開くだけで分かる。
 *
 * ログインは要らない(止まっているときはログインすらできないため)。
 * 代わりに、返すのは状態だけにして中身は一切出さない。
 */

// 常にその場で確かめる(キャッシュされた「正常」を返しても意味が無い)
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { ok: false, database: "not_configured" },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();

    // RLS があるのでログインしていなければ 0 件が返る。
    // 行が欲しいのではなく、Postgres まで問い合わせが届くことを確かめたいだけ。
    // 1 件に限っているので、止めておく効果のわりに負荷はごく小さい。
    const { error } = await supabase.from("stores").select("id").limit(1);

    if (error) {
      // 中身(スキーマやエラーの詳細)は返さない。原因はログに残す。
      console.error(`[health] database error: ${error.message}`);
      return NextResponse.json(
        { ok: false, database: "error", ms: Date.now() - startedAt },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      database: "ok",
      ms: Date.now() - startedAt,
    });
  } catch (e) {
    // 一時停止中はそもそも接続が張れず、ここに来る
    console.error(
      `[health] unreachable: ${e instanceof Error ? e.message : String(e)}`
    );
    return NextResponse.json(
      { ok: false, database: "unreachable", ms: Date.now() - startedAt },
      { status: 503 }
    );
  }
}
