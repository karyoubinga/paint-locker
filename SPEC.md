# 塗料ストック管理アプリ 仕様書 (SPEC)

模型用塗料のコレクションを管理するためのWebアプリの仕様書です。
このファイルは Claude Code に読み込ませて、仕様の確認・変更・実装の基準として使います。

- スキーマバージョン: 2
- 最終更新: 2026-05-31

---

## 1. 目的

模型用塗料（ガンプラ、美少女プラモデル等で使用）のコレクションを管理する。

- 市販の塗料に加え、自分で調色（ちょうしょく＝色を混ぜて作ること）した塗料も登録できる。
- 在庫本数と残量を把握し、買い足しや使い切りの判断に使う。
- 自宅PC・スマホの両方から利用する想定。

---

## 2. 用語

| 用語 | 意味 |
|------|------|
| メーカー (maker) | 塗料の製造元。例: GSIクレオス、タミヤ、ガイアノーツ |
| シリーズ (series) | メーカー内の製品ライン。例: Mr.カラー、水性ホビーカラー。未設定可（「指定なし」扱い） |
| 色系統 (colorKey) | 赤系・青系・メタリック等のおおまかな分類 |
| 本数 (qty) | 所持している本数 |
| 残量 (remaining) | 開封中ボトルの中身の残り。0〜100の百分率で保持 |
| 調色 (mix) | 複数の塗料を混ぜて作った自作色 |
| 配合 (recipe) | 調色塗料の材料と比率の記録 |
| ピン留め (pin) | よく使うメーカーを画面上部に固定する機能 |

---

## 3. データモデル

データは1つのオブジェクト `state` として保持し、永続化する。

```ts
type ColorKey =
  | "red" | "orange" | "yellow" | "green" | "blue" | "purple"
  | "pink" | "brown" | "white" | "gray" | "black"
  | "metal" | "clear" | "primer" | "other";

interface RecipeItem {
  name: string;   // 材料の塗料名（自由入力。既存塗料名を書いてもよい）
  parts: string;  // 比率や分量。例: "2", "10滴", "少量"
  note: string;   // 補足メモ
}

interface Paint {
  id: string;            // 一意なID
  kind: "product" | "mix"; // 市販品 or 調色（自作）
  name: string;          // 塗料名（必須）
  maker: string;         // メーカー名（空可。mixの既定は "自作"）
  series: string;        // シリーズ名（空文字 = 指定なし）
  colorKey: ColorKey;    // 色系統
  qty: number;           // 本数（0以上）
  remaining: number;     // 残量 0〜100（%）
  barcode: string;       // JANコード等（任意）
  note: string;          // メモ（任意）
  recipe: RecipeItem[];  // 配合（kind === "mix" のとき使用）
  recipeNote: string;    // 配合の補足メモ
  createdAt: number;     // 作成時刻 (epoch ms)
  updatedAt: number;     // 更新時刻 (epoch ms)
}

interface State {
  paints: Paint[];
  pinnedMakers: string[]; // ピン留めしたメーカー名の配列（表示順）
  schemaVersion: number;  // = 2
}
```

### 所持判定
- 「所持している」= `qty >= 1`。
- `qty === 0` は「使い切り／欲しいものリスト」として残す運用も可能。

---

## 4. 画面構成

単一ページ（SPA的）で、上から以下の順に並べる。

1. ヘッダー（タイトル＋統計：種類数・合計本数・所持数）
2. ピン留めバー（ピン留めメーカーのチップを横並び。タップで絞り込み、✕で解除）
3. ビュー切替タブ（後述）
4. フィルタ群（検索／メーカー→シリーズの2段階／色系統）
5. 一覧（メーカー → シリーズの階層でグループ表示、折りたたみ可）
6. 操作ボタン（バーコード読取／手動追加）
7. モーダル（追加・編集フォーム、バーコードスキャナ）

### ビュー（タブ）
- **すべて**: 全塗料
- **所持**: `qty >= 1` のみ
- **調色**: `kind === "mix"` のみ

---

## 5. 機能要件

### 5.1 塗料の登録・編集・削除
- 追加／編集はモーダルフォームで行う。
- `kind`（市販品／調色）をトグルで選択。
- `kind === "mix"` のときのみ配合エディタを表示する。
- 削除は確認ダイアログを挟む。

### 5.2 階層（メーカー → シリーズ）
- フィルタは2段階。メーカーを選ぶとシリーズ候補がそのメーカーのものに絞られる。
- シリーズ未設定は「（指定なし）」として扱い、選択肢にも出す。
- 一覧はメーカーで大グループ、シリーズで小グループに分けて表示する（折りたたみ対応）。

### 5.3 ピン留め
- メーカーをピン留めすると、画面上部のピン留めバーにチップとして固定表示。
- チップのタップでそのメーカーに絞り込む。✕で解除。
- ピン留め情報は永続化する。

### 5.4 残量メモ
- 各塗料に残量（0〜100%）を持たせる。
- 編集フォームのスライダーで設定。一覧にはバーで可視化する。

### 5.5 本数管理
- 一覧の「＋／−」で本数を増減（0未満にはしない）。

### 5.6 所持一覧（別ビュー）
- 「所持」タブで `qty >= 1` のみを表示する。

### 5.7 調色塗料の登録と配合メモ
- `kind === "mix"` の塗料は配合（材料名・比率・メモの行）を複数登録できる。
- 行の追加・削除に対応。
- 全体メモ（recipeNote）も別に持つ。
- 一覧では配合内容を確認できるよう表示する。

### 5.8 バーコード読取（初回登録方式）
- スマホのカメラでJANコード等を読み取る（html5-qrcodeを使用）。
- 既存の `barcode` と一致 → 該当塗料を強調し、本数+1の確認を出す。
- 未登録のコード → 追加フォームを開き `barcode` を自動入力する。
- バーコード単体から名称・メーカーを自動取得できる公開DBは存在しないため、
  初回のみ手入力する「初回登録方式」を採用する。

---

## 6. 永続化方針

データ層は `storage.js` に隔離する（差し替え前提）。

```js
PaintStore.load(): Promise<State>
PaintStore.save(state: State): Promise<void>
```

- 既定実装は **localStorage**（端末内・同期なし・セットアップ不要）。
- `load` / `save` を async にしてあるので、将来サーバーAPIへ差し替え可能。

### 複数端末同期：Supabase方式（採用）

複数端末（PC・スマホ）で同じデータを見るため、Supabaseで同期する。
詳細な構築手順は `SETUP_SUPABASE.md` を参照。

- データ層 `storage.supabase.js` を `storage.js` の代わりに読み込む。
- `load` / `save` の関数の形は localStorage 版と同一（app.jsは無改修）。
- app.js 側は、ログイン状態の変化で読み直すフック（`PaintStore.onAuthChange`）にのみ対応済み。

**保存単位**: 1ユーザー = 1行。状態まるごと（paints, pinnedMakers）をJSONで保持する。

**テーブル**:
```sql
paint_state(
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
)
```

**アクセス制御**: RLS（行レベルセキュリティ）を有効化し、`auth.uid() = user_id` の行のみ
select / insert / update 可能にする。anon key はクライアントに置く（公開前提）。
service_role key はクライアントに置かない。

**認証**: メールのマジックリンク（`signInWithOtp`）。
Supabaseの URL Configuration に本番URLと `http://localhost:8000` を登録する。

**競合方針**: 最後に保存した内容が勝つ（last-write-wins）。
1人が複数端末で使う前提では許容。同時編集の厳密な統合が必要なら「行分割」（第8章）へ発展させる。

### その他の同期選択肢（不採用・記録のみ）
- 自前API方式（Cloudflare Workers + KV 等）
- JSONエクスポート/インポートによる手動同期（簡易バックアップとして併用は可能）

---

## 7. ファイル構成

```
paint-manager/
├── index.html          画面の骨組み
├── styles.css          スタイル
├── storage.js          データ永続化層（localStorage既定）
├── storage.supabase.js データ永続化層（Supabase版・同期する場合に差し替え）
├── app.js              画面描画とロジック
├── SPEC.md             本仕様書
├── README.md           起動方法とClaude Code運用メモ
└── SETUP_SUPABASE.md   Supabase同期の構築手順
```

依存ライブラリは html5-qrcode のみ（CDN読み込み）。ビルド工程は不要。

---

## 8. 今後の拡張候補

- データのエクスポート／インポート（JSON）
- 複数端末同期（上記6章）
- 残量を「開封済みボトル単位」で複数管理
- 調色の材料を既存塗料IDで参照し、在庫と連動
- 写真添付（塗装サンプルの記録）
