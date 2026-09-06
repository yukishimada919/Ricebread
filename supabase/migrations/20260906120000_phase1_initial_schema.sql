-- ============================================================
-- ricebread / Phase 1: 初期スキーマ(店舗・商品・価格記録)
--
-- このアプリがやりたいこと:
--   1. よく行くスーパーの商品の値段を覚えておく
--   2. たまに行った別のスーパーの値段が、いつもの店に比べて高いか安いかを判断する
--   3. 同じ店でも日によって値段が動くので、いつもより高いか安いかを判断する
--
-- そのために必要な最小限のテーブルは 3 つだけ:
--   stores     … 店(いつもの店かどうかの印を持つ)
--   products   … 商品(内容量を持つので「100g あたり」で比べられる)
--   price_logs … 「いつ・どの店で・その商品がいくらだったか」の 1 行
--
-- 相場や「高い/安い」の判定そのものは DB ではなくアプリ側(lib/priceStats.ts)で
-- 計算する。判定のしきい値は後から変えたくなるので、
-- 生の記録だけを DB に残し、解釈はコード側に置いておく方針。
--
-- ★ 冪等(何度実行しても同じ結果)・非破壊:
--   DROP TABLE / TRUNCATE / DELETE は 1 つも含まれていません。
-- ============================================================

-- ------------------------------------------------------------
-- 0. 共通: updated_at の自動更新
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 1. 店 (stores)
--
--    is_regular が「自分の近隣のよく行くスーパー」の印。
--    「たまに行った店が高いか安いか」を判断するときは、
--    この印が付いた店の記録だけを相場(比較のものさし)として使う。
--    印の付いていない店(旅先のスーパーなど)の高い値段に
--    引きずられて相場が狂うのを防ぐため。
-- ------------------------------------------------------------
create table if not exists public.stores (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (btrim(name) <> ''),   -- 店名(例: 業務スーパー)
  branch     text,                                      -- 店舗名・場所(例: 〇〇店)。同じチェーンを区別する
  is_regular boolean not null default true,             -- よく行く店(相場のものさしに使う)
  color      text,                                      -- グラフ・バッジの色(#rrggbb / 任意)
  memo       text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stores is
  'ユーザーが値段を記録するスーパー。is_regular = true の店が「いつもの店」で、相場の基準になる。';
comment on column public.stores.is_regular is
  'よく行く近隣の店かどうか。true の店の記録だけを他店比較の基準(相場)に使う。';

create index if not exists stores_user_sort_idx
  on public.stores (user_id, sort_order, name);

-- 同じ店を二重登録しない(支店名が未入力どうしは店名だけで判定)
create unique index if not exists stores_user_name_branch_key
  on public.stores (user_id, lower(btrim(name)), lower(coalesce(btrim(branch), '')));

-- ------------------------------------------------------------
-- 2. 商品 (products)
--
--    size_amount / size_unit は内容量(例: 500 g、1000 ml、6 個)。
--    入っていれば「100g あたり」「1個あたり」に直して比べられるので、
--    容量の違う商品どうしでも公平に高い/安いが判断できる。
--
--    tax_rate_percent は消費税率。日本のスーパーは
--    「本体価格」と「税込価格」の表示が混在していて、
--    値札をそのまま入れると比較が狂う。商品ごとに税率を持たせて、
--    アプリ側で必ず税込に揃えてから比べる。
--      8  … 軽減税率(食品・飲料)
--      10 … 標準税率(酒類・日用品など)
--      0  … 非課税として扱いたいとき
-- ------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (btrim(name) <> ''),  -- 商品名(例: 牛乳)
  maker            text,                                     -- メーカー・ブランド(例: 明治)
  category         text,                                     -- 分類(例: 乳製品)
  size_amount      numeric(10, 2) check (size_amount > 0),   -- 内容量の数値(任意)
  size_unit        text not null default 'piece'
                     check (size_unit in ('g', 'ml', 'piece')),
  tax_rate_percent numeric(4, 1) not null default 8
                     check (tax_rate_percent >= 0 and tax_rate_percent <= 100),
  is_favorite      boolean not null default false,           -- よく買う商品(一覧の先頭に出す)
  memo             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.products is
  '値段を追いかけたい商品。内容量(size_amount / size_unit)が入っていれば単価でも比較できる。';
comment on column public.products.tax_rate_percent is
  '消費税率(%)。値札が本体価格のときに税込へ直すために使う。食品は 8、酒類・日用品は 10。';

create index if not exists products_user_name_idx
  on public.products (user_id, name);

create index if not exists products_user_favorite_idx
  on public.products (user_id, is_favorite desc, name);

-- 同じ商品を二重登録しない(メーカー未入力どうしは商品名だけで判定)
create unique index if not exists products_user_name_maker_key
  on public.products (user_id, lower(btrim(name)), lower(coalesce(btrim(maker), '')));

-- ------------------------------------------------------------
-- 3. 価格記録 (price_logs)
--
--    「2026-09-06 に 〇〇スーパーで 牛乳が 198 円だった」の 1 行。
--    このテーブルにたまった記録から相場を出し、高い/安いを判断する。
--
--    price_yen は値札に書いてあった数字をそのまま入れる。
--    それが税込か本体価格かは tax_included で区別する。
--
--    is_sale(特売)を分けているのは、相場を出すときに
--    特売を混ぜると「いつもの値段」が実際より安く見えてしまうため。
--    相場は通常価格の記録だけから出す。
-- ------------------------------------------------------------
create table if not exists public.price_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  product_id   uuid not null references public.products (id) on delete cascade,
  store_id     uuid not null references public.stores (id) on delete cascade,
  recorded_on  date not null default current_date,
  price_yen    numeric(10, 2) not null check (price_yen >= 0),  -- 値札の数字そのまま
  tax_included boolean not null default true,                  -- その数字が税込かどうか
  is_sale      boolean not null default false,                 -- 特売・見切り品
  -- その日だけ内容量が違ったとき(増量パック・徳用など)の上書き。
  -- 空なら products.size_amount を使う。
  size_amount  numeric(10, 2) check (size_amount > 0),
  memo         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.price_logs is
  '「いつ・どの店で・その商品がいくらだったか」の記録。相場と高い/安いの判定はすべてここから計算する。';
comment on column public.price_logs.is_sale is
  '特売・見切り品かどうか。true の記録は「いつもの値段(相場)」の計算から外す。';
comment on column public.price_logs.size_amount is
  'その日だけ内容量が違った場合の上書き(増量パックなど)。空なら products.size_amount を使う。';

-- 商品の値動きを日付順に引く(商品詳細のグラフ・「いつもより高い?」の判定)
create index if not exists price_logs_user_product_date_idx
  on public.price_logs (user_id, product_id, recorded_on desc);

-- 店ごとの記録を引く(店舗まるごと比較・履歴)
create index if not exists price_logs_user_store_date_idx
  on public.price_logs (user_id, store_id, recorded_on desc);

-- 履歴画面(日付の新しい順)
create index if not exists price_logs_user_date_idx
  on public.price_logs (user_id, recorded_on desc, created_at desc);

-- 同じ日・同じ店・同じ商品の記録は 1 件にする。
-- 値札を二度打ちしたときに相場が狂わないようにするための制約で、
-- アプリ側は upsert(あれば上書き)で書き込む。
-- ただし特売と通常価格が同じ日に並ぶことはあるので is_sale は別扱いにする。
create unique index if not exists price_logs_unique_entry_key
  on public.price_logs (product_id, store_id, recorded_on, is_sale);

drop trigger if exists stores_set_updated_at on public.stores;
create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists price_logs_set_updated_at on public.price_logs;
create trigger price_logs_set_updated_at
  before update on public.price_logs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 4. Row Level Security (RLS)
--    値段の記録は完全に本人専用。共有する行は作らない。
-- ------------------------------------------------------------
alter table public.stores     enable row level security;
alter table public.products   enable row level security;
alter table public.price_logs enable row level security;

-- stores
drop policy if exists "own stores: select" on public.stores;
create policy "own stores: select" on public.stores
  for select using (auth.uid() = user_id);

drop policy if exists "own stores: insert" on public.stores;
create policy "own stores: insert" on public.stores
  for insert with check (auth.uid() = user_id);

drop policy if exists "own stores: update" on public.stores;
create policy "own stores: update" on public.stores
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own stores: delete" on public.stores;
create policy "own stores: delete" on public.stores
  for delete using (auth.uid() = user_id);

-- products
drop policy if exists "own products: select" on public.products;
create policy "own products: select" on public.products
  for select using (auth.uid() = user_id);

drop policy if exists "own products: insert" on public.products;
create policy "own products: insert" on public.products
  for insert with check (auth.uid() = user_id);

drop policy if exists "own products: update" on public.products;
create policy "own products: update" on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own products: delete" on public.products;
create policy "own products: delete" on public.products
  for delete using (auth.uid() = user_id);

-- price_logs(参照先の商品・店も自分のものであることを確かめる)
drop policy if exists "own price_logs: select" on public.price_logs;
create policy "own price_logs: select" on public.price_logs
  for select using (auth.uid() = user_id);

drop policy if exists "own price_logs: insert" on public.price_logs;
create policy "own price_logs: insert" on public.price_logs
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "own price_logs: update" on public.price_logs;
create policy "own price_logs: update" on public.price_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own price_logs: delete" on public.price_logs;
create policy "own price_logs: delete" on public.price_logs
  for delete using (auth.uid() = user_id);
