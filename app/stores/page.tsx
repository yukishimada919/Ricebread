"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Store as StoreIcon, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Store } from "@/lib/types";

/**
 * 店の登録画面。
 *
 * ここでいちばん大事なのは「いつもの店」の印。
 * 印が付いた店の記録だけが、よその店の値段を判断するときの
 * ものさし(相場)になる。旅先のスーパーのような、たまにしか
 * 行かない店を印から外しておかないと相場が狂う。
 */
export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [isRegular, setIsRegular] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editing, setEditing] = useState<Store | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .order("is_regular", { ascending: false })
      .order("sort_order")
      .order("name");
    if (error) {
      setError(`店の取得に失敗しました: ${error.message}`);
    } else {
      setStores(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const addStore = async (e: React.FormEvent) => {
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

    const { error } = await supabase.from("stores").insert({
      user_id: user.id,
      name: name.trim(),
      branch: branch.trim() || null,
      is_regular: isRegular,
    });

    if (error) {
      // 同じ店を二度登録しようとしたときは、DB の制約名ではなく
      // 何が起きたのかが分かる言葉で伝える
      setError(
        error.code === "23505"
          ? "同じ名前の店がすでに登録されています。"
          : `登録に失敗しました: ${error.message}`
      );
    } else {
      setName("");
      setBranch("");
      await load();
    }
    setSaving(false);
  };

  /** 「いつもの店」の印だけをその場で切り替える */
  const toggleRegular = async (store: Store) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("stores")
      .update({ is_regular: !store.is_regular })
      .eq("id", store.id);
    if (error) {
      setError(`更新に失敗しました: ${error.message}`);
    } else {
      await load();
    }
  };

  const saveEditing = async () => {
    if (!editing || !editing.name.trim()) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("stores")
      .update({
        name: editing.name.trim(),
        branch: editing.branch?.trim() || null,
        memo: editing.memo?.trim() || null,
      })
      .eq("id", editing.id);
    if (error) {
      setError(`更新に失敗しました: ${error.message}`);
    } else {
      setEditing(null);
      await load();
    }
  };

  const deleteStore = async (store: Store) => {
    if (
      !confirm(
        `「${store.name}」を削除しますか?\nこの店で記録した値段もすべて削除されます。`
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase.from("stores").delete().eq("id", store.id);
    if (error) {
      setError(`削除に失敗しました: ${error.message}`);
    } else {
      await load();
    }
  };

  const regulars = stores.filter((s) => s.is_regular);
  const others = stores.filter((s) => !s.is_regular);

  return (
    <main className="p-4">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <StoreIcon aria-hidden size={20} strokeWidth={2} />
        店
      </h1>
      <p className="mb-4 text-xs leading-relaxed text-gray-500">
        「いつもの店」に印を付けた店の記録が、よその店の値段を
        高い/安いと判断するときの基準になります。
      </p>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}

      <form onSubmit={addStore} className="mb-4 rounded-xl bg-white p-3 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-600">店を追加</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="店名(例: 業務スーパー)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="支店名・場所(任意。例: 東口店)"
          className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        <label className="mt-2 flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={isRegular}
            onChange={(e) => setIsRegular(e.target.checked)}
            className="size-4"
          />
          いつもの店(近所でよく行く)
        </label>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          {saving ? "追加中..." : "追加する"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">読み込み中...</p>
      ) : stores.length === 0 ? (
        <p className="rounded-xl bg-white p-4 text-sm text-gray-500 shadow-sm">
          まだ店が登録されていません。
        </p>
      ) : (
        <>
          <StoreSection
            title="いつもの店"
            description="この店の記録が相場の基準になります"
            stores={regulars}
            onToggle={toggleRegular}
            onEdit={setEditing}
            onDelete={deleteStore}
          />
          <StoreSection
            title="たまに行く店"
            description="相場の基準には使いません"
            stores={others}
            onToggle={toggleRegular}
            onEdit={setEditing}
            onDelete={deleteStore}
          />
        </>
      )}

      {/* 編集ダイアログ */}
      {editing && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <h2 className="mb-3 text-base font-bold">店を編集</h2>
            <input
              type="text"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="店名"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              type="text"
              value={editing.branch ?? ""}
              onChange={(e) => setEditing({ ...editing, branch: e.target.value })}
              placeholder="支店名・場所(任意)"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <input
              type="text"
              value={editing.memo ?? ""}
              onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
              placeholder="メモ(任意)"
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-semibold active:bg-gray-50"
              >
                やめる
              </button>
              <button
                onClick={saveEditing}
                disabled={!editing.name.trim()}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/** 「いつもの店」「たまに行く店」の 2 つを同じ形で出すための部品 */
function StoreSection({
  title,
  description,
  stores,
  onToggle,
  onEdit,
  onDelete,
}: {
  title: string;
  description: string;
  stores: Store[];
  onToggle: (store: Store) => void;
  onEdit: (store: Store) => void;
  onDelete: (store: Store) => void;
}) {
  if (stores.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold text-gray-600">{title}</h2>
      <p className="mb-2 text-xs text-gray-400">{description}</p>
      <ul className="flex flex-col gap-2">
        {stores.map((store) => (
          <li
            key={store.id}
            className="flex items-center gap-2 rounded-xl bg-white p-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {store.name}
                {store.branch && (
                  <span className="ml-1 text-sm font-normal text-gray-500">
                    {store.branch}
                  </span>
                )}
              </p>
              {store.memo && (
                <p className="truncate text-xs text-gray-500">{store.memo}</p>
              )}
            </div>
            <button
              onClick={() => onToggle(store)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                store.is_regular
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-gray-50 text-gray-500"
              }`}
            >
              {store.is_regular ? "いつもの店" : "たまに行く"}
            </button>
            <button
              onClick={() => onEdit(store)}
              aria-label={`${store.name} を編集`}
              className="shrink-0 rounded-lg p-2 text-gray-400 active:bg-gray-100"
            >
              <Pencil aria-hidden size={16} />
            </button>
            <button
              onClick={() => onDelete(store)}
              aria-label={`${store.name} を削除`}
              className="shrink-0 rounded-lg p-2 text-gray-400 active:bg-gray-100"
            >
              <Trash2 aria-hidden size={16} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
