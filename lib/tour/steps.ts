import type { TourId, TourStep } from "./types";

/**
 * ページごとの説明文。
 *
 * ■ 書きかたのルール
 * - 専門用語を使わない。初めてアプリを触る人が読んで分かる言葉にする
 * - 1 ステップは 1〜2 文。長い説明は複数ステップに分ける
 * - target は data-tour 属性の値。画面に無ければそのステップは自動で飛ばされるので、
 *   「記録が 1 件もない人」には出せない説明(判定バッジやグラフなど)もここに書いてよい
 *
 * ■ 何を説明すべきか
 *   このアプリで初めての人が分からないのは、操作そのものより「考えかた」の方。
 *   とくに次の 4 つは、説明しないと一生気づかれない。
 *     1. 「いつもの店」の印が比較の基準になること
 *     2. 相場は特売を除いた中央値であること
 *     3. 記録が貯まるまで判定が出ないこと(壊れていると誤解されやすい)
 *     4. 内容量を入れると単価で公平に比べられること
 *   操作の説明よりこちらを優先して入れている。
 */

/** どのページでも最後に出す共通のステップ */
const HELP_AGAIN: TourStep = {
  target: "help-button",
  title: "もう一度見たいとき",
  description:
    "この「?」ボタンを押すと、いつでもこの説明をやり直せます。ページごとに内容が変わります。",
};

const RECORD: TourStep[] = [
  {
    title: "値段を記録する画面です",
    description:
      "買い物のたびにここで値段を入れます。入れた瞬間に「その値段が高いか安いか」が出るので、レジに並ぶ前に決められます。",
  },
  {
    target: "record-date",
    title: "まずは日付",
    description:
      "ふだんは今日の日付が入っているので、そのままで大丈夫です。あとから思い出して入れるときだけ変えてください。",
  },
  {
    target: "record-store",
    title: "どの店にいるか",
    description:
      "いま値段を見ている店を選びます。「(いつもの店)」と付いている店が、高い安いを判断するときの基準になります。",
  },
  {
    target: "record-product",
    title: "どの商品か",
    description:
      "値段を追いかけたい商品を選びます。一覧に無ければ「商品」タブで先に登録してください。",
  },
  {
    target: "record-price",
    title: "値札の数字をそのまま",
    description:
      "計算せずに、値札に書いてある数字をそのまま入れてください。税込かどうかは下のチェックで選べます。",
  },
  {
    target: "record-flags",
    title: "税込か、特売か",
    description:
      "値札が本体価格なら「税込の値段」のチェックを外します。アプリが税込に直してから比べます。",
  },
  {
    target: "record-flags",
    title: "特売は分けて覚えます",
    description:
      "特売のときはチェックを入れてください。特売を混ぜると「ふだんの値段」が安く見えてしまい、通常価格がいつも高い判定になるためです。",
  },
  {
    target: "record-size",
    title: "増量パックのとき",
    description:
      "いつもと内容量が違うときだけ入れます。「100gあたりで比べる」にすると、量の違う商品どうしでも公平に比べられます。",
  },
  {
    target: "record-verdicts",
    title: "これが答えです",
    description:
      "「いつもの店の相場と比べて」と「この店のふだんと比べて」の 2 つが出ます。前者はよその店が近所より高いか、後者は同じ店で今日が高いかを見ています。",
  },
  {
    target: "record-submit",
    title: "最後に保存",
    description:
      "買っても買わなくても、値段を見たら記録しておくと相場が育ちます。記録が増えるほど判定が当たるようになります。",
  },
  {
    title: "はじめのうちは判定が出ません",
    description:
      "比べる相手がいないためで、壊れているわけではありません。同じ商品を 2〜3 回記録すると相場が出はじめます。",
  },
  HELP_AGAIN,
];

const PRODUCTS: TourStep[] = [
  {
    title: "商品の一覧です",
    description:
      "値段を追いかけたい商品を登録しておく場所です。買い物の前にここを見れば、どこで何を買うか決められます。",
  },
  {
    target: "products-scan",
    title: "写真から読み取れます",
    description:
      "商品のパッケージを撮ると、商品名・メーカー・内容量を読み取って入力欄に入れます。読み取った内容は必ず見比べて、違っていれば直してから登録してください。",
  },
  {
    // フォームがたたまれているときはこのボタン、開いていればフォーム本体を指す。
    // 片方は必ず画面にあるので、どちらの状態でもこのステップは出る。
    target: "products-add-toggle",
    title: "商品を追加する",
    description:
      "ここから商品を登録します。同じ「牛乳」でもメーカーが違えば別の商品として登録してください。",
  },
  {
    target: "products-add",
    title: "商品を追加する",
    description:
      "商品名を入れて登録します。同じ「牛乳」でもメーカーが違えば別の商品として登録してください。",
  },
  {
    // 登録フォームの中にある説明だが、たたまれていると飛んでしまう。
    // 内容量を入れるかどうかでこのアプリの便利さが変わるので、
    // target を付けずに必ず読ませる。
    title: "内容量を入れておくと得します",
    description:
      "商品を登録するとき「1000ml」「500g」「6個」のように内容量も書いておくと、容量の違う商品どうしを単価で比べられます。「500ml で 128 円」と「1000ml で 238 円」のどちらが得かが分かります。",
  },
  {
    target: "products-size",
    title: "内容量の書きかた",
    description:
      "「1000ml」のように単位ごと書けば、単位も自動で読み取ります。",
  },
  {
    target: "products-tax",
    title: "消費税率",
    description:
      "食品は 8%、酒や日用品は 10% です。値札が本体価格だったときに、税込へ直すために使います。",
  },
  {
    target: "products-search",
    title: "探す",
    description: "商品が増えてきたら、ここに名前を入れて絞り込めます。",
  },
  {
    target: "products-item",
    title: "相場と最安の店",
    description:
      "それぞれの商品の相場と、いちばん安い店が出ます。押すと値動きのグラフや店ごとの比較が見られます。",
  },
  {
    target: "products-favorite",
    title: "よく買うものは星を付ける",
    description:
      "星を付けた商品は一覧の先頭に並び、記録画面でも選びやすくなります。",
  },
  HELP_AGAIN,
];

const PRODUCT: TourStep[] = [
  {
    title: "商品ひとつ分の詳細です",
    description:
      "この商品を「どこで買うのがいちばん安いか」「値段はふだんどう動くか」が分かります。",
  },
  {
    target: "product-unit-toggle",
    title: "値段か、単価か",
    description:
      "「100mlあたり」に切り替えると、内容量の違う商品どうしでも公平に比べられます。内容量を登録した商品だけ出ます。",
  },
  {
    target: "product-summary",
    title: "相場・最安・最高",
    description:
      "相場は特売を除いた真ん中の値段です。平均ではなく真ん中を採るので、一度だけ極端に高かった記録に引きずられません。",
  },
  {
    target: "product-stores",
    title: "店ごとの相場",
    description:
      "安い順に並びます。「最安」が付いた店で買うのがいちばん得ということです。",
  },
  {
    target: "product-chart",
    title: "値動きのグラフ",
    description:
      "店ごとに線が引かれます。点が実際に記録した日で、その間の線はつないだだけなので参考程度に見てください。",
  },
  {
    target: "product-history",
    title: "記録の履歴",
    description:
      "この商品の記録が新しい順に並びます。打ち間違えたらゴミ箱ボタンで消せます。",
  },
  HELP_AGAIN,
];

const STORES: TourStep[] = [
  {
    title: "店を登録する画面です",
    description:
      "この画面でいちばん大事なのは「いつもの店」の印です。ここを間違えると判定がおかしくなります。",
  },
  {
    target: "stores-add",
    title: "店を追加する",
    description:
      "店名を入れて登録します。同じチェーンの別の店舗を使い分けるなら、支店名も入れておくと区別できます。",
  },
  {
    target: "stores-regular",
    title: "「いつもの店」の印",
    description:
      "近所でよく行く店にだけチェックを入れてください。この印が付いた店の記録が、よその店の値段を判断するときの基準になります。",
  },
  {
    target: "stores-regular",
    title: "旅先の店には付けないこと",
    description:
      "たまにしか行かない店に印を付けると、そこの高い値段が基準に混ざって「近所の相場」が狂います。",
  },
  {
    target: "stores-list",
    title: "あとから切り替えられます",
    description:
      "一覧のバッジを押すと「いつもの店」と「たまに行く」を切り替えられます。引っ越したときなどに使ってください。",
  },
  HELP_AGAIN,
];

const COMPARE: TourStep[] = [
  {
    title: "店まるごとの比較です",
    description:
      "「A スーパーと B スーパー、結局どっちが安いのか」に答えます。",
  },
  {
    target: "compare-pickers",
    title: "比べる 2 店を選ぶ",
    description: "比べたい店を 2 つ選ぶと、すぐ下に結果が出ます。",
  },
  {
    target: "compare-summary",
    title: "結論はここ",
    description:
      "両方の店で記録したことがある商品を 1 個ずつ買ったら、どちらがいくら安いかが出ます。表を読まなくてもここだけで分かります。",
  },
  {
    target: "compare-rows",
    title: "商品ごとの内訳",
    description:
      "差の大きい商品から順に並びます。「この商品だけは向こうの店が安い」といった使い分けが見えてきます。",
  },
  {
    title: "両方で記録した商品だけが対象です",
    description:
      "片方にしか記録が無い商品を混ぜると公平に比べられないので、自動で除いています。比較が少なく感じたら、同じ商品を両方の店で記録してみてください。",
  },
  HELP_AGAIN,
];

const HISTORY: TourStep[] = [
  {
    title: "記録の履歴です",
    description:
      "これまでに入れた値段が新しい順に並びます。打ち間違いを見つけて直すための画面でもあります。",
  },
  {
    target: "history-item",
    title: "税込に揃えて表示します",
    description:
      "本体価格で入れた記録も、ここでは税込に直して出しています。税抜の値札の数字も小さく併記されます。",
  },
  {
    target: "history-delete",
    title: "消したいとき",
    description:
      "ゴミ箱ボタンで消せます。間違った値段を残しておくと相場が狂うので、気づいたら消してください。",
  },
  HELP_AGAIN,
];

export const TOURS: Record<TourId, TourStep[]> = {
  record: RECORD,
  products: PRODUCTS,
  product: PRODUCT,
  stores: STORES,
  compare: COMPARE,
  history: HISTORY,
};
