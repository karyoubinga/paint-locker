/*
 * storage.js — データ永続化層
 *
 * 既定では localStorage（端末内）に保存します。
 * 複数端末で同期したい場合は、この load / save の中身を
 * サーバーAPI呼び出し（fetch）などに差し替えてください。
 * 呼び出し側（app.js）は load / save の「形」しか知らないので、
 * 中身を変えても app.js は修正不要です。
 */
const PaintStore = (() => {
  // 保存場所の名札。既存データ保護のため、アプリ名を変えてもこのKEYは変更しない。
  const KEY = "paint-manager-v2";

  function emptyState() {
    return { paints: [], pinnedMakers: [], schemaVersion: 2 };
  }

  // 保存データを読み込む。無ければ空の状態を返す。
  async function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const data = JSON.parse(raw);
      const base = emptyState();
      return {
        paints: Array.isArray(data.paints) ? data.paints : base.paints,
        pinnedMakers: Array.isArray(data.pinnedMakers) ? data.pinnedMakers : base.pinnedMakers,
        schemaVersion: 2,
      };
    } catch (e) {
      console.error("load失敗:", e);
      return emptyState();
    }
  }

  // 状態を保存する。
  async function save(state) {
    try {
      const payload = {
        paints: state.paints,
        pinnedMakers: state.pinnedMakers,
        schemaVersion: 2,
      };
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("save失敗:", e);
      alert("保存に失敗しました。ブラウザの保存容量をご確認ください。");
    }
  }

  // 全データをJSON文字列で書き出す（バックアップ用）。
  function exportJson(state) {
    return JSON.stringify({ paints: state.paints, pinnedMakers: state.pinnedMakers, schemaVersion: 2 }, null, 2);
  }

  return { load, save, exportJson, KEY };
})();
