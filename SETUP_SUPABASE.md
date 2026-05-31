# Supabaseでクラウド同期する手順

PCとスマホで同じ在庫を見られるようにする設定です。
所要時間は10〜15分ほど。アカウント作成はご自身で行ってください。

---

## 全体像

- データは Supabase（クラウドDB）に保存します。
- ログインは「メールにリンクが届く方式（マジックリンク）」です。
- 保存は「1ユーザーにつき1行（状態まるごとJSON）」です。
- 自分のデータは自分しか読めないよう、RLS（行レベルのアクセス制御）で守ります。

---

## 手順1：プロジェクトを作る

1. https://supabase.com にアクセスし、ご自身でアカウントを作成します。
2. 「New project」でプロジェクトを1つ作ります（リージョンは Tokyo が近いです）。
3. 作成後、左メニューの「Project Settings」→「API」を開きます。
4. 次の2つを控えます（あとで使います）。
   - **Project URL**（例：`https://xxxxxxxx.supabase.co`）
   - **anon public** key（公開して良いキーです。クライアントに書いてOK）

---

## 手順2：テーブルとアクセス制御を作る

左メニューの「SQL Editor」を開き、次のSQLを貼り付けて実行します。

```sql
-- 1ユーザー1行：状態まるごとをJSONで保持
create table if not exists paint_state (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 行レベルのアクセス制御を有効化
alter table paint_state enable row level security;

-- 自分の行だけ読める／書ける
create policy "select own" on paint_state
  for select using (auth.uid() = user_id);
create policy "insert own" on paint_state
  for insert with check (auth.uid() = user_id);
create policy "update own" on paint_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

> RLS（Row Level Security）は「鍵付きのロッカー」のようなものです。
> anon key は誰でも持てますが、ロッカーの中身は本人のログインがないと開けません。

---

## 手順3：メールログインを有効化する

1. 左メニュー「Authentication」→「Providers」→「Email」を開きます。
2. Email を有効（Enable）にします。マジックリンクはこれで使えます。
3. 「Authentication」→「URL Configuration」を開き、以下を登録します。
   - **Site URL**：本番URL（例：GitHub Pages の `https://ユーザー名.github.io/paint-manager/`）
   - **Redirect URLs**：上記の本番URLと、開発用の `http://localhost:8000` を追加

> ログインリンクを開いた後、この一覧にあるURLにだけ戻れます。
> 登録し忘れると「リンクを開いても戻れない」状態になります。

---

## 手順4：アプリ側の設定を切り替える

`index.html` を開き、末尾のスクリプト部分を切り替えます。

**変更前（localStorage）:**
```html
<script src="storage.js"></script>
<script src="app.js"></script>
```

**変更後（Supabase）:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  window.SUPABASE_CONFIG = {
    url: "https://xxxxxxxx.supabase.co",   // 手順1のProject URL
    anonKey: "手順1のanon publicキー"
  };
</script>
<script src="storage.supabase.js"></script>
<script src="app.js"></script>
```

`index.html` 内には同じ内容のコメントも入れてあります。

---

## 手順5：使ってみる

1. ローカルなら `python3 -m http.server 8000` で `http://localhost:8000` を開きます。
2. 画面上部のバーにメールアドレスを入れ「リンクを送る」を押します。
3. 届いたメールのリンクを開くとログイン完了です（バーに緑で表示）。
4. 塗料を登録すると、クラウドに保存されます。
5. スマホでも同じURLを開き、同じメールでログインすれば、同じ在庫が見えます。

---

## 補足

### 競合（同時編集）について
保存は「最後に保存した内容が勝つ（last-write-wins）」方式です。
1人で使う前提なら問題は起きにくいですが、2台で別々に編集すると片方が上書きされます。
気になる場合は、SPEC.md 第8章の「行分割」へ発展させると安全度が上がります。

### localStorageのデータを移したいとき
今までlocalStorageに登録した分は、

1. localStorage版のまま「バックアップ書き出し(JSON)」で書き出す
2. Supabase版に切り替えてログイン
3. （インポート機能は未実装のため）Claude Code に
   「JSONインポート機能を追加して」と頼んで取り込む

という流れになります。インポート機能の追加は SPEC.md 第8章にも候補として記載済みです。

### anon key は公開して大丈夫？
はい。anon key はクライアントに置く前提の公開キーです。
データの保護は RLS（手順2）が担います。逆に **service_role キーは絶対にクライアントへ置かないでください**。
