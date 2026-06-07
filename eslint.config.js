/*
 * eslint.config.js — ESLint v9/v10 の flat config（フラット設定）
 *
 * このアプリは <script> で読み込む素のJavaScript（ESモジュールではない）です。
 * そのため sourceType は "script"。document や localStorage などの
 * ブラウザ標準のグローバルは globals.browser で一括登録します。
 *
 * 使い方:
 *   npm install            （初回のみ。依存をダウンロード）
 *   npm run lint           （チェック）
 *   npm run lint:fix       （自動修正できるものは直す）
 */
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  // ESLint 推奨ルール
  js.configs.recommended,

  // 全 .js 共通：ブラウザ環境の素のスクリプト
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // 使っていない変数は「警告」（エラーにはしない）。先頭が _ の引数は許可。
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      // 未定義の変数の使用はエラー（タイプミス検出）
      "no-undef": "error",
    },
  },

  // app.js だけが使う外部グローバル（他ファイル/CDN由来）を追加で許可
  {
    files: ["app.js"],
    languageOptions: {
      globals: {
        // storage.js / storage.supabase.js が定義する公開オブジェクト
        PaintStore: "readonly",
        // CDN: html5-qrcode（バーコード読取ライブラリ）
        Html5Qrcode: "readonly",
        Html5QrcodeSupportedFormats: "readonly",
      },
    },
  },

  // 設定ファイル自身は Node(CommonJS) で動く（require / module を使う）
  {
    files: ["eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },

  // ESLint の対象から外す
  {
    ignores: ["node_modules/**", "*.min.js", "seed-paints.csv"],
  },
];
