# GitHub Pages 公開手順（Paint Locker）

Paint Locker を GitHub Pages（GitHubが無料で提供する静的サイト公開機能）に載せ、
PC・スマホからHTTPSで開けるようにするまでの手順です。

- 前提：GitHubアカウントを持っていること（なければ先にご自身で作成してください）
- 所要時間：10分ほど
- 公開URLの形：`https://ユーザー名.github.io/paint-locker/`

---

## 手順1：GitHubでリポジトリを作る（空でよい）

1. GitHubにログインし、右上の「＋」→「New repository」を開きます。
2. 次のように設定します。
   - **Repository name**：`paint-locker`
   - **Public / Private**：どちらでも可
     （Pagesは無料プランでもPrivateリポジトリから公開できます）
   - **Add a README / .gitignore / license**：すべてチェックを外す（空で作る）
3. 「Create repository」を押します。
4. 次の画面に出る、リポジトリのURLを控えます。
   - 例：`https://github.com/ユーザー名/paint-locker.git`

> 中身は手元から送るので、リポジトリは空で作ります。

---

## 手順2：手元のファイルをGit管理にする

`paint-locker` フォルダの直下で、ターミナルから実行します。

```bash
cd paint-locker      # このフォルダに移動
git init             # Gitリポジトリにする
git add .            # 全ファイルを追加対象に
git commit -m "初期コミット: Paint Locker"
```

> `git init` は「この箱をGitで管理し始める」宣言です。
> `add` で対象を選び、`commit` で1つの区切り（セーブポイント）を作ります。

---

## 手順3：GitHubのリポジトリと繋いで送る

手順1で控えたURLを使います。

```bash
git branch -M main                                   # 主ブランチ名を main に
git remote add origin https://github.com/ユーザー名/paint-locker.git
git push -u origin main                              # 送信
```

- `remote add origin ...` は「送り先（GitHub側）の住所を登録」する操作です。
- `push` で手元の内容をGitHubへ送ります。
- 途中で認証を求められたら、GitHubのユーザー名と
  **Personal Access Token（パスワードの代わりの鍵）** を入力します。
  （GitHubはパスワード認証を廃止済みです。トークンは GitHub の
  Settings → Developer settings → Personal access tokens で発行します）

> トークンは入力欄に貼り付けてください。私が代理で入力・発行することはできません。

---

## 手順4：GitHub Pagesを有効にする

1. GitHubのリポジトリ画面で「Settings」タブを開きます。
2. 左メニューの「Pages」を開きます。
3. 「Build and deployment」の **Source** を「Deploy from a branch」にします。
4. **Branch** を `main`、フォルダを `/ (root)` にして「Save」します。
5. 1〜2分待つと、ページ上部に公開URLが表示されます。
   - `https://ユーザー名.github.io/paint-locker/`

> このアプリはビルド不要（HTML/CSS/JSだけ）なので、root をそのまま公開できます。

---

## 手順5：開いて確認する

1. 表示された公開URLを、PCのブラウザで開きます。
2. スマホでも同じURLを開きます。
   - HTTPSなので、スマホでもカメラ（バーコード読取）が使えます。

これで公開は完了です。

---

## 更新のしかた（2回目以降）

ファイルを直したら、同じ3コマンドで反映できます。

```bash
git add .
git commit -m "変更内容を一言で"
git push
```

push の1〜2分後に、公開ページへ自動反映されます。

---

## 補足

### バーコード読取について
GitHub PagesはHTTPSなので、スマホのカメラが使えます。
`file://`（ファイルを直接開く）やHTTP接続ではカメラが起動しないため、
スマホで読み取りを使うなら、この公開URL経由が確実です。

### Supabase同期も使う場合
クラウド同期（`SETUP_SUPABASE.md`）も併用するなら、
公開後に Supabase 側の設定を1つ追加します。

- Supabase →「Authentication」→「URL Configuration」
- **Site URL** と **Redirect URLs** に、この公開URL
  （`https://ユーザー名.github.io/paint-locker/`）を登録する

登録しないと、ログインリンクを開いてもアプリに戻れません。

### Privateリポジトリでも公開される点に注意
Pagesで公開すると、リポジトリがPrivateでも**サイト自体は誰でも閲覧できます**。
URLを知っている人は中身を見られます。
塗料データは各自のブラウザ／Supabaseアカウント側にあるので公開されませんが、
コードとアプリ画面は公開される、という点だけ把握しておいてください。

### Claude Code での進め方
この手順自体を Claude Code に手伝ってもらうこともできます。

```
DEPLOY_GITHUB_PAGES.md を読んで、手順2と3のコマンドを
このリポジトリ用に整えて実行を手伝ってください
```

ただし、トークン入力やGitHub上でのボタン操作（手順1・4）はご自身で行ってください。
