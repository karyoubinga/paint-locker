/*
 * storage.supabase.js — Supabase版のデータ永続化層
 *
 * storage.js（localStorage版）の代わりに読み込むと、
 * クラウドDBに保存され、ログインした端末どうしで同期します。
 *
 * 公開している関数（app.jsが使う「形」）:
 *   PaintStore.load()        : Promise<State>
 *   PaintStore.save(state)   : Promise<void>
 *   PaintStore.exportJson(s) : string
 *   PaintStore.onAuthChange(cb) : ログイン状態が変わると cb(user) を呼ぶ
 *
 * 事前準備（SETUP_SUPABASE.md 参照）:
 *   1. index.html で supabase-js をCDN読み込み
 *   2. window.SUPABASE_CONFIG = { url, anonKey } を設定
 *   3. paint_state テーブルとRLSをSQLで作成
 */
const PaintStore = (() => {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anonKey) {
    console.error("Supabaseの設定が不足しています。SETUP_SUPABASE.md を確認してください。");
  }

  // ライブラリのグローバルは window.supabase。クライアントは client と命名（名前衝突回避）。
  const client = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  const authCbs = [];
  let currentUser = null;

  function emptyState() { return { paints: [], pinnedMakers: [], schemaVersion: 2 }; }

  /* ---- 認証バー（ログインUI）を画面上部に差し込む ---- */
  let barEmail, barStatus, barLoginWrap, barUserWrap, barUserLabel;
  function injectBar() {
    const bar = document.createElement("div");
    bar.id = "authbar";
    bar.style.cssText =
      "position:sticky;top:0;z-index:60;display:flex;gap:8px;align-items:center;flex-wrap:wrap;" +
      "background:#1b1e25;border-bottom:1px solid #343a47;padding:8px 12px;font-size:13px;color:#e7eaf0;";

    barLoginWrap = document.createElement("div");
    barLoginWrap.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:1;";
    barEmail = document.createElement("input");
    barEmail.type = "email";
    barEmail.placeholder = "メールアドレスでログイン";
    barEmail.style.cssText =
      "flex:1;min-width:160px;background:#22262f;border:1px solid #343a47;color:#e7eaf0;" +
      "border-radius:9px;padding:8px 10px;font-size:13px;";
    const loginBtn = document.createElement("button");
    loginBtn.textContent = "リンクを送る";
    loginBtn.style.cssText =
      "border:none;background:#5dd5c4;color:#06231f;font-weight:700;border-radius:9px;" +
      "padding:8px 14px;cursor:pointer;font-size:13px;";
    loginBtn.onclick = () => signIn(barEmail.value.trim());
    barLoginWrap.append(barEmail, loginBtn);

    barUserWrap = document.createElement("div");
    barUserWrap.style.cssText = "display:none;gap:10px;align-items:center;flex:1;";
    barUserLabel = document.createElement("span");
    barUserLabel.style.cssText = "color:#6fbf73;";
    const logoutBtn = document.createElement("button");
    logoutBtn.textContent = "ログアウト";
    logoutBtn.style.cssText =
      "border:1px solid #343a47;background:transparent;color:#8b93a3;border-radius:9px;" +
      "padding:6px 12px;cursor:pointer;font-size:12px;";
    logoutBtn.onclick = () => client.auth.signOut();
    barUserWrap.append(barUserLabel, logoutBtn);

    barStatus = document.createElement("span");
    barStatus.style.cssText = "color:#8b93a3;font-size:12px;";

    bar.append(barLoginWrap, barUserWrap, barStatus);
    document.body.prepend(bar);
  }
  function renderBar() {
    if (!barLoginWrap) return;
    if (currentUser) {
      barLoginWrap.style.display = "none";
      barUserWrap.style.display = "flex";
      barUserLabel.textContent = "✓ " + (currentUser.email || "ログイン中");
      barStatus.textContent = "クラウド同期中";
    } else {
      barLoginWrap.style.display = "flex";
      barUserWrap.style.display = "none";
      barStatus.textContent = "未ログイン（このままだと同期されません）";
    }
  }

  async function signIn(email) {
    if (!email) { alert("メールアドレスを入力してください。"); return; }
    barStatus.textContent = "送信中…";
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href.split("#")[0] },
    });
    if (error) { barStatus.textContent = "送信に失敗しました"; alert(error.message); }
    else barStatus.textContent = "メールのログインリンクを開いてください";
  }

  // 認証状態の変化を監視
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session && session.user ? session.user : null;
    renderBar();
    authCbs.forEach(cb => cb(currentUser));
  });

  async function getUser() {
    const { data } = await client.auth.getUser();
    currentUser = data && data.user ? data.user : null;
    return currentUser;
  }

  /* ---- 公開関数 ---- */
  async function load() {
    if (!barLoginWrap) injectBar();
    const user = await getUser();
    renderBar();
    if (!user) return emptyState();
    const { data, error } = await client
      .from("paint_state").select("data").eq("user_id", user.id).maybeSingle();
    if (error) { console.error(error); return emptyState(); }
    const d = (data && data.data) || {};
    return {
      paints: Array.isArray(d.paints) ? d.paints : [],
      pinnedMakers: Array.isArray(d.pinnedMakers) ? d.pinnedMakers : [],
      schemaVersion: 2,
    };
  }

  async function save(state) {
    const user = await getUser();
    if (!user) { alert("クラウド保存するにはログインしてください。"); return; }
    const payload = {
      user_id: user.id,
      data: { paints: state.paints, pinnedMakers: state.pinnedMakers, schemaVersion: 2 },
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from("paint_state").upsert(payload, { onConflict: "user_id" });
    if (error) { console.error(error); alert("保存に失敗しました。"); }
  }

  function exportJson(state) {
    return JSON.stringify({ paints: state.paints, pinnedMakers: state.pinnedMakers, schemaVersion: 2 }, null, 2);
  }

  function onAuthChange(cb) { authCbs.push(cb); }

  return { load, save, exportJson, onAuthChange, KEY: "supabase" };
})();
