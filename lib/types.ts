// ============================================================
// DB のテーブルと 1 対 1 で対応する型。
// カラムを足したら必ずここも直すこと(型が合わないと画面側で気づけない)。
// ============================================================

/** 内容量の単位。g / ml は「100 あたり」、piece は「1 個あたり」で単価を出す */
export type SizeUnit = "g" | "ml" | "piece";

/**
 * 店。
 *
 * is_regular が「自分の近隣のよく行くスーパー」の印。
 * よその店の値段が高いか安いかを判断するときは、
 * この印が付いた店の記録だけを相場(ものさし)として使う。
 */
export type Store = {
  id: string;
  user_id: string;
  name: string;
  branch: string | null;
  is_regular: boolean;
  color: string | null;
  memo: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * 商品。
 *
 * size_amount / size_unit が入っていれば「100g あたり」などの単価が出せるので、
 * 内容量の違う商品どうしでも公平に比べられる。
 * tax_rate_percent は値札が本体価格だったときに税込へ直すために使う。
 */
export type Product = {
  id: string;
  user_id: string;
  name: string;
  maker: string | null;
  category: string | null;
  size_amount: number | null;
  size_unit: SizeUnit;
  tax_rate_percent: number;
  is_favorite: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 価格記録。「いつ・どの店で・その商品がいくらだったか」の 1 行。
 *
 * price_yen は値札の数字そのまま。税込かどうかは tax_included で持つので、
 * 比べるときは必ず lib/unitPrice.ts の taxIncludedPrice() で税込に揃えること。
 */
export type PriceLog = {
  id: string;
  user_id: string;
  product_id: string;
  store_id: string;
  recorded_on: string; // YYYY-MM-DD
  price_yen: number;
  tax_included: boolean;
  is_sale: boolean;
  /** その日だけ内容量が違ったときの上書き(空なら商品の size_amount を使う) */
  size_amount: number | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

/** 履歴一覧で商品名・店名も一緒に引いたもの */
export type PriceLogWithRefs = PriceLog & {
  products: Pick<
    Product,
    "id" | "name" | "maker" | "size_amount" | "size_unit" | "tax_rate_percent"
  > | null;
  stores: Pick<Store, "id" | "name" | "branch" | "is_regular"> | null;
};
