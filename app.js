/*
 * app.js — 画面描画とロジック
 * 依存: storage.js (PaintStore), html5-qrcode (CDN)
 */
"use strict";

/* ============ 定数 ============ */
const COLOR_TYPES = [
  { key: "red",    label: "赤系",         color: "#d63a3a" },
  { key: "orange", label: "橙系",         color: "#e8822e" },
  { key: "yellow", label: "黄系",         color: "#e8c63a" },
  { key: "green",  label: "緑系",         color: "#3fae57" },
  { key: "blue",   label: "青系",         color: "#3f7fd6" },
  { key: "purple", label: "紫系",         color: "#8b5cd6" },
  { key: "pink",   label: "桃系",         color: "#e87fb0" },
  { key: "brown",  label: "茶系",         color: "#8a5a34" },
  { key: "white",  label: "白系",         color: "#f0f0f0" },
  { key: "gray",   label: "グレー系",      color: "#8b93a3" },
  { key: "black",  label: "黒系",         color: "#23262d" },
  { key: "metal",  label: "メタリック",    color: "#c0c4cc", cls: "metal" },
  { key: "clear",  label: "クリア（透明）", color: "#9fd8cf", cls: "clear" },
  { key: "primer", label: "サフ",         color: "#9a9a9a" },
  { key: "topcoat",label: "トップコート",  color: "#cfd8e0", cls: "clear" },
  { key: "other",  label: "その他",       color: "#5dd5c4" },
];
const colorMap = Object.fromEntries(COLOR_TYPES.map(c => [c.key, c]));
const NONE = "__NONE__"; // シリーズ「指定なし」を表すトークン

/* ============ 状態 ============ */
let state = { paints: [], pinnedMakers: [] };
let currentView = "all";       // all | owned | mix
let collapsed = new Set();      // 折りたたみ中のメーカーグループ
let selectedSeries = new Set(); // 選択中のシリーズ（複数可）。空=すべて
let formKind = "product";       // フォームの種別
let html5qr = null;
let scanMode = "search"; // "search"=既存検索/新規登録, "form"=編集中のバーコード欄に入れる

/* ============ ショートカット ============ */
const $ = id => document.getElementById(id);
const listEl = $("list");
const escapeHtml = s => (s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const uid = () => "p" + Date.now() + Math.random().toString(36).slice(2, 6);
const now = () => Date.now();

async function persist() { await PaintStore.save(state); }

/* ============ 初期化 ============ */
// 保存層からデータを読み直して再描画する。
// （ログイン直後やログアウト時にも呼ばれる）
async function reloadFromStore() {
  const loaded = await PaintStore.load();
  state.paints = loaded.paints;
  state.pinnedMakers = loaded.pinnedMakers;
  $("loading").style.display = "none";
  render();
}

(async function init() {
  // 色系統セレクトを埋める
  COLOR_TYPES.forEach(c => {
    $("f-color").insertAdjacentHTML("beforeend", `<option value="${c.key}">${c.label}</option>`);
    $("i-color").insertAdjacentHTML("beforeend", `<option value="${c.key}">${c.label}</option>`);
  });
  bindEvents();
  // Supabase版のみ：ログイン状態が変わったら読み直す（localStorage版には無いので無害）
  if (typeof PaintStore.onAuthChange === "function") {
    PaintStore.onAuthChange(() => reloadFromStore());
  }
  await reloadFromStore();
})();

/* ============ イベント登録 ============ */
function bindEvents() {
  // タブ
  $("tabs").addEventListener("click", e => {
    const t = e.target.closest(".tab");
    if (!t) return;
    currentView = t.dataset.view;
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    render();
  });
  // フィルタ
  $("f-search").addEventListener("input", render);
  $("f-maker").addEventListener("change", () => { rebuildSeriesOptions(); render(); });
  $("f-color").addEventListener("change", render);
  // ピン
  $("pin-toggle").addEventListener("click", togglePinCurrent);
  // 追加・スキャン
  $("open-add").addEventListener("click", () => openForm(null));
  $("open-scan").addEventListener("click", () => startScan("search"));
  // フォーム
  $("form-cancel").addEventListener("click", closeForm);
  $("form-overlay").addEventListener("click", e => { if (e.target === $("form-overlay")) closeForm(); });
  $("form-save").addEventListener("click", saveForm);
  $("i-remaining").addEventListener("input", e => { $("rem-val").textContent = e.target.value; });
  $("i-hex").addEventListener("input", () => setHexField($("i-hex").value));
  $("form-scan").addEventListener("click", () => startScan("form"));
  $("hex-clear").addEventListener("click", () => {
    setHexField($("i-hex").dataset.set ? "" : $("i-hex").value);
  });
  document.querySelector(".kindtoggle").addEventListener("click", e => {
    const b = e.target.closest(".kbtn"); if (!b) return; setKind(b.dataset.kind);
  });
  $("recipe-add").addEventListener("click", () => { readRecipeFromDom(); recipeDraft.push({ name:"", parts:"", note:"" }); renderRecipeRows(); });
  // スキャナ
  $("scan-close").addEventListener("click", () => { scanMode = "search"; stopScan(); });
  // エクスポート
  $("export-btn").addEventListener("click", exportJson);
  // CSV取込
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", onImportFile);
  // 一覧（委譲）
  listEl.addEventListener("click", onListClick);
}

/* ============ シリーズ選択肢（メーカー依存） ============ */
function seriesInScope(makerFilter) {
  const set = new Set();
  state.paints.forEach(p => {
    if (makerFilter && (p.maker || "") !== makerFilter) return;
    set.add(p.series || "");
  });
  return [...set];
}
function rebuildSeriesOptions() {
  const wrap = $("f-series-chips");
  const makerFilter = $("f-maker").value;
  const list = seriesInScope(makerFilter).sort((a, b) => {
    if (a === "") return 1; if (b === "") return -1;
    return a.localeCompare(b, "ja");
  });
  // スコープ外になった選択は外す
  const scope = new Set(list.map(s => s === "" ? NONE : s));
  [...selectedSeries].forEach(v => { if (!scope.has(v)) selectedSeries.delete(v); });

  const chip = (val, label) => {
    const on = selectedSeries.has(val);
    return `<button type="button" class="schip ${on ? "on" : ""}" data-series="${escapeHtml(val)}">${escapeHtml(label)}</button>`;
  };
  let html = `<button type="button" class="schip allchip ${selectedSeries.size === 0 ? "on" : ""}" data-series="__ALL__">すべて</button>`;
  list.forEach(s => { html += (s === "") ? chip(NONE, "（指定なし）") : chip(s, s); });
  wrap.innerHTML = html;

  wrap.querySelectorAll(".schip").forEach(b => b.addEventListener("click", () => {
    const v = b.dataset.series;
    if (v === "__ALL__") { selectedSeries.clear(); }
    else if (selectedSeries.has(v)) { selectedSeries.delete(v); }
    else { selectedSeries.add(v); }
    render();
  }));
}

/* ============ メーカー選択肢・datalist ============ */
function refreshMakerOptions() {
  const makers = [...new Set(state.paints.map(p => p.maker).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  const fMaker = $("f-maker");
  const cur = fMaker.value;
  fMaker.innerHTML = '<option value="">すべて</option>' + makers.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  if (makers.includes(cur)) fMaker.value = cur;
  // フォーム用 datalist
  $("maker-list").innerHTML = makers.map(m => `<option value="${escapeHtml(m)}">`).join("");
  const allSeries = [...new Set(state.paints.map(p => p.series).filter(Boolean))];
  // よく使うシリーズ名を候補に常駐させる（手登録を楽にする）
  const presetSeries = [
    "True Metallic Metal", "Model Air", "Model Color", "Mecha Color", "Game Color", "Game Air",
    "Metal Color", "Panzer Aces", "Xpress Color", "Premium Color", "Liquid Gold",
    "Metallic", "Primary", "Auto",
  ];
  presetSeries.forEach(s => { if (!allSeries.includes(s)) allSeries.push(s); });
  allSeries.sort((a, b) => a.localeCompare(b, "ja"));
  $("series-list").innerHTML = allSeries.map(s => `<option value="${escapeHtml(s)}">`).join("");
}

/* ============ ピン留め ============ */
function togglePinCurrent() {
  const m = $("f-maker").value;
  if (!m) { alert("先にメーカーを選んでください。"); return; }
  const i = state.pinnedMakers.indexOf(m);
  if (i >= 0) state.pinnedMakers.splice(i, 1);
  else state.pinnedMakers.push(m);
  persist(); render();
}
function renderPinbar() {
  const bar = $("pinbar");
  const cur = $("f-maker").value;
  bar.innerHTML = state.pinnedMakers.map(m => `
    <span class="pinchip ${m === cur ? "activef" : ""}" data-maker="${escapeHtml(m)}">
      📌 ${escapeHtml(m)}
      <span class="x" data-unpin="${escapeHtml(m)}">✕</span>
    </span>`).join("");
  bar.querySelectorAll(".pinchip").forEach(chip => {
    chip.addEventListener("click", e => {
      if (e.target.dataset.unpin !== undefined) {
        const m = e.target.dataset.unpin;
        state.pinnedMakers = state.pinnedMakers.filter(x => x !== m);
        if ($("f-maker").value === m) { $("f-maker").value = ""; rebuildSeriesOptions(); }
        persist(); render();
      } else {
        const m = chip.dataset.maker;
        $("f-maker").value = ($("f-maker").value === m) ? "" : m;
        rebuildSeriesOptions(); render();
      }
    });
  });
  // ピンスター表示更新
  $("pin-toggle").classList.toggle("on", cur && state.pinnedMakers.includes(cur));
  $("pin-toggle").textContent = (cur && state.pinnedMakers.includes(cur)) ? "★" : "☆";
}

/* ============ 絞り込み ============ */
function getFiltered() {
  const q = $("f-search").value.trim().toLowerCase();
  const fm = $("f-maker").value;
  const fc = $("f-color").value;
  return state.paints.filter(p => {
    if (currentView === "owned" && !((Number(p.qty) || 0) >= 1)) return false;
    if (currentView === "mix" && p.kind !== "mix") return false;
    if (currentView === "wanted" && !p.wanted) return false;
    if (q) {
      const hay = ((p.name || "") + " " + (p.nameJa || "") + " " + (p.code || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (fm && (p.maker || "") !== fm) return false;
    // シリーズ複数選択：いずれかに一致すればOK（空=すべて通す）
    if (selectedSeries.size > 0) {
      const key = (p.series || "") === "" ? NONE : p.series;
      if (!selectedSeries.has(key)) return false;
    }
    if (fc && p.colorKey !== fc) return false;
    return true;
  });
}

/* ============ 残量バー ============ */
function remColor(v) { return v >= 50 ? "var(--ok)" : v >= 20 ? "var(--warn)" : "var(--danger)"; }
function clampRem(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 100; }

/* ============ メイン描画 ============ */
function render() {
  refreshMakerOptions();
  rebuildSeriesOptions();
  renderPinbar();

  // 統計
  $("stat-kinds").textContent = state.paints.length;
  $("stat-owned").textContent = state.paints.filter(p => (Number(p.qty) || 0) >= 1).length;
  $("stat-total").textContent = state.paints.reduce((s, p) => s + (Number(p.qty) || 0), 0);

  const filtered = getFiltered();
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty"><div class="big">${state.paints.length === 0 ? "🪣" : "🔍"}</div>${
      state.paints.length === 0
        ? "まだ塗料が登録されていません。<br>「バーコード読取」か「追加」から始めましょう。"
        : "条件に合う塗料がありません。"
    }</div>`;
    return;
  }

  // メーカー → シリーズ でグループ化
  const makerKey = p => p.maker || "（メーカー未設定）";
  const groups = {};
  filtered.forEach(p => {
    const mk = makerKey(p);
    (groups[mk] = groups[mk] || []).push(p);
  });
  // メーカー並び：ピン留め優先 → 五十音
  const makerNames = Object.keys(groups).sort((a, b) => {
    const pa = state.pinnedMakers.indexOf(a), pb = state.pinnedMakers.indexOf(b);
    if (pa >= 0 && pb < 0) return -1;
    if (pb >= 0 && pa < 0) return 1;
    if (pa >= 0 && pb >= 0) return pa - pb;
    return a.localeCompare(b, "ja");
  });

  let html = "";
  makerNames.forEach(mk => {
    const items = groups[mk];
    const isCollapsed = collapsed.has(mk);
    const pinned = state.pinnedMakers.includes(mk);
    html += `<div class="group">
      <div class="group-head ${isCollapsed ? "collapsed" : ""}" data-group="${escapeHtml(mk)}">
        <span class="caret">▼</span>
        <span>${pinned ? "📌 " : ""}${escapeHtml(mk)}</span>
        <span class="count">${items.length}件</span>
      </div>`;
    if (!isCollapsed) {
      // シリーズで小分け
      const bySeries = {};
      items.forEach(p => { const s = p.series || ""; (bySeries[s] = bySeries[s] || []).push(p); });
      const seriesNames = Object.keys(bySeries).sort((a, b) => {
        if (a === "") return 1; if (b === "") return -1; // 指定なしは末尾
        return a.localeCompare(b, "ja");
      });
      seriesNames.forEach(s => {
        html += `<div class="series-head">${s === "" ? "（指定なし）" : "└ " + escapeHtml(s)}</div><div class="cards">`;
        bySeries[s].sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"))
          .forEach(p => { html += cardHtml(p); });
        html += `</div>`;
      });
    }
    html += `</div>`;
  });
  listEl.innerHTML = html;
}

function cardHtml(p) {
  const c = colorMap[p.colorKey] || colorMap.other;
  const validHex = /^#[0-9a-fA-F]{6}$/.test(p.hex || "");
  // 実際の色(hex)があればそれを使う。無ければ色系統の代表色。
  const swatchColor = validHex ? p.hex : c.color;
  const cls = (!validHex && c.cls) ? " " + c.cls : "";
  const rem = clampRem(p.remaining);
  const recipeHtml = (p.kind === "mix" && p.recipe && p.recipe.length)
    ? `<div class="recipe-view"><div class="rtitle">🧪 配合</div><ul>${
        p.recipe.map(r => `<li>${escapeHtml(r.name)}${r.parts ? `：${escapeHtml(r.parts)}` : ""}${r.note ? `（${escapeHtml(r.note)}）` : ""}</li>`).join("")
      }</ul>${p.recipeNote ? `<div class="rnote">${escapeHtml(p.recipeNote)}</div>` : ""}</div>`
    : "";
  return `<div class="card ${p.wanted ? "wanted" : ""}" data-id="${p.id}">
    <div class="swatch${cls}" style="background-color:${swatchColor}">${p.kind === "mix" ? '<span class="mixmark">🧪</span>' : ""}</div>
    <div class="info">
      <div class="nm">${escapeHtml(p.nameJa || p.name)}${p.kind === "mix" ? '<span class="badge-mix">調色</span>' : ""}${p.wanted ? '<span class="badge-want">欲しい</span>' : ""}</div>
      ${p.nameJa ? `<div class="nm-sub">${escapeHtml(p.name)}</div>` : ""}
      <div class="meta">
        ${p.maker ? `<span class="tag">${escapeHtml(p.maker)}</span>` : ""}
        ${p.series ? `<span class="tag">${escapeHtml(p.series)}</span>` : ""}
        ${p.code ? `<span class="tag code">${escapeHtml(p.code)}</span>` : ""}
        <span class="tag">${c.label}</span>
        ${p.barcode ? `<span class="barcode">📷${escapeHtml(p.barcode)}</span>` : ""}
      </div>
      <div class="rembar"><i style="width:${rem}%;background:${remColor(rem)}"></i></div>
      <div class="remlabel">残量 ${rem}%</div>
      ${p.note ? `<div class="meta">📝 ${escapeHtml(p.note)}</div>` : ""}
      ${recipeHtml}
    </div>
    <div class="qtybox">
      <button class="qbtn" data-act="minus">−</button>
      <span class="qnum">${Number(p.qty) || 0}</span>
      <button class="qbtn" data-act="plus">＋</button>
    </div>
    <div class="rowbtns">
      ${p.wanted
        ? `<button class="iconbtn buy" data-act="buy" title="購入した（在庫へ）">🛒</button>`
        : `<button class="iconbtn want" data-act="want" title="欲しいものに追加">☆</button>`}
      <button class="iconbtn" data-act="edit">✎</button>
      <button class="iconbtn del" data-act="del">🗑</button>
    </div>
  </div>`;
}

/* ============ 一覧クリック処理 ============ */
async function onListClick(e) {
  const head = e.target.closest(".group-head");
  if (head) {
    const g = head.dataset.group;
    if (collapsed.has(g)) collapsed.delete(g); else collapsed.add(g);
    render();
    return;
  }
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const id = e.target.closest(".card").dataset.id;
  const p = state.paints.find(x => x.id === id);
  if (!p) return;
  const act = btn.dataset.act;
  if (act === "plus") { p.qty = (Number(p.qty) || 0) + 1; p.updatedAt = now(); await persist(); render(); }
  else if (act === "minus") { p.qty = Math.max(0, (Number(p.qty) || 0) - 1); p.updatedAt = now(); await persist(); render(); }
  else if (act === "want") { p.wanted = true; p.updatedAt = now(); await persist(); render(); }
  else if (act === "buy") {
    p.wanted = false;
    if ((Number(p.qty) || 0) < 1) p.qty = 1;
    p.updatedAt = now();
    await persist(); render();
  }
  else if (act === "edit") { openForm(p); }
  else if (act === "del") {
    if (confirm(`「${p.name}」を削除しますか？`)) {
      state.paints = state.paints.filter(x => x.id !== id);
      await persist(); render();
    }
  }
}

/* ============ 配合エディタ ============ */
let recipeDraft = [];
function renderRecipeRows() {
  const wrap = $("recipe-rows");
  if (recipeDraft.length === 0) recipeDraft = [{ name: "", parts: "", note: "" }];
  wrap.innerHTML = recipeDraft.map((r, i) => `
    <div class="recipe-row" data-i="${i}">
      <input class="r-name" placeholder="材料の塗料名" value="${escapeHtml(r.name)}">
      <input class="r-parts" placeholder="比率" value="${escapeHtml(r.parts)}">
      <input class="r-note" placeholder="メモ" value="${escapeHtml(r.note)}">
      <button type="button" class="rdel" data-ri="${i}">✕</button>
    </div>`).join("");
  wrap.querySelectorAll(".rdel").forEach(b => b.addEventListener("click", () => {
    readRecipeFromDom();
    recipeDraft.splice(Number(b.dataset.ri), 1);
    renderRecipeRows();
  }));
}
function readRecipeFromDom() {
  const rows = $("recipe-rows").querySelectorAll(".recipe-row");
  recipeDraft = [...rows].map(row => ({
    name: row.querySelector(".r-name").value.trim(),
    parts: row.querySelector(".r-parts").value.trim(),
    note: row.querySelector(".r-note").value.trim(),
  }));
}

/* ============ 種別トグル ============ */
function setKind(kind) {
  formKind = kind;
  document.querySelectorAll(".kbtn").forEach(b => b.classList.toggle("active", b.dataset.kind === kind));
  $("recipe-block").hidden = (kind !== "mix");
}

/* ============ フォーム ============ */
function openForm(p) {
  $("form-title").textContent = p ? "塗料を編集" : "塗料を追加";
  $("edit-id").value = p ? p.id : "";
  setKind(p ? (p.kind || "product") : "product");
  $("i-name").value = p ? p.name : "";
  $("i-nameja").value = p ? (p.nameJa || "") : "";
  $("i-maker").value = p ? (p.maker || "") : "";
  $("i-series").value = p ? (p.series || "") : "";
  $("i-color").value = p ? p.colorKey : "other";
  $("i-code").value = p ? (p.code || "") : "";
  setHexField(p && /^#[0-9a-fA-F]{6}$/.test(p.hex || "") ? p.hex : "");
  $("i-wanted").checked = p ? !!p.wanted : false;
  $("i-qty").value = p ? p.qty : 1;
  const rem = p ? clampRem(p.remaining) : 100;
  $("i-remaining").value = rem; $("rem-val").textContent = rem;
  $("i-barcode").value = p ? (p.barcode || "") : "";
  $("i-note").value = p ? (p.note || "") : "";
  $("i-recipenote").value = p ? (p.recipeNote || "") : "";
  recipeDraft = (p && p.recipe && p.recipe.length) ? p.recipe.map(r => ({ ...r })) : [{ name:"", parts:"", note:"" }];
  renderRecipeRows();
  $("form-overlay").classList.add("show");
  $("i-name").focus();
}
function closeForm() { $("form-overlay").classList.remove("show"); }

/* 実際の色(hex)欄の管理。「未設定」状態を data-set 属性で保持する */
function setHexField(hex) {
  const inp = $("i-hex"), btn = $("hex-clear");
  if (hex) {
    inp.value = hex; inp.dataset.set = "1";
    btn.textContent = "未設定にする";
  } else {
    inp.dataset.set = ""; 
    btn.textContent = "色を設定";
  }
}
function hexFieldValue() {
  const inp = $("i-hex");
  return inp.dataset.set ? inp.value : "";
}

async function saveForm() {
  const name = $("i-name").value.trim();
  if (!name) { alert("塗料名を入力してください。"); return; }
  readRecipeFromDom();
  const recipe = formKind === "mix" ? recipeDraft.filter(r => r.name) : [];
  const data = {
    kind: formKind,
    name,
    nameJa: $("i-nameja").value.trim(),
    maker: $("i-maker").value.trim() || (formKind === "mix" ? "自作" : ""),
    series: $("i-series").value.trim(),
    colorKey: $("i-color").value,
    code: $("i-code").value.trim(),
    hex: hexFieldValue(),
    wanted: $("i-wanted").checked,
    qty: Math.max(0, Number($("i-qty").value) || 0),
    remaining: Math.max(0, Math.min(100, Number($("i-remaining").value) || 0)),
    barcode: $("i-barcode").value.trim(),
    note: $("i-note").value.trim(),
    recipe,
    recipeNote: formKind === "mix" ? $("i-recipenote").value.trim() : "",
    updatedAt: now(),
  };
  const editId = $("edit-id").value;
  if (editId) {
    const p = state.paints.find(x => x.id === editId);
    Object.assign(p, data);
  } else {
    state.paints.push({ id: uid(), createdAt: now(), ...data });
  }
  await persist();
  closeForm();
  render();
}

/* ============ バーコード ============ */
function startScan(mode) {
  scanMode = (mode === "form") ? "form" : "search";
  $("scan-err").style.display = "none";
  $("scan-overlay").classList.add("show");
  if (typeof Html5Qrcode === "undefined") {
    return showScanErr("スキャナーの読み込みに失敗しました。通信環境をご確認ください。");
  }
  html5qr = new Html5Qrcode("reader");
  const config = {
    fps: 10,
    qrbox: { width: 250, height: 140 },
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
  };
  html5qr.start({ facingMode: "environment" }, config, onScanSuccess, () => {})
    .catch(err => showScanErr(
      "カメラを起動できませんでした。<br>別タブ（フルスクリーン）で開くか、カメラ許可をご確認ください。<br><small>" + escapeHtml(String(err)) + "</small>"
    ));
}
function showScanErr(msg) { const el = $("scan-err"); el.innerHTML = msg; el.style.display = "block"; }

async function stopScan() {
  if (html5qr) { try { await html5qr.stop(); html5qr.clear(); } catch (e) {} html5qr = null; }
  $("scan-overlay").classList.remove("show");
}

async function onScanSuccess(decodedText) {
  const code = decodedText.trim();
  await stopScan();

  // 編集フォームのバーコード欄に入れるモード
  if (scanMode === "form") {
    $("i-barcode").value = code;
    scanMode = "search";
    return; // フォームはそのまま開いている
  }

  // 従来モード：既存検索 or 新規登録
  const found = state.paints.find(p => p.barcode && p.barcode === code);
  if (found) {
    flashCard(found.id);
    if (confirm(`登録済みの「${found.name}」です。\n本数を1つ増やしますか？（現在 ${found.qty}本）`)) {
      found.qty = (Number(found.qty) || 0) + 1; found.updatedAt = now();
      await persist(); render(); flashCard(found.id);
    }
  } else {
    openForm(null);
    $("i-barcode").value = code;
    $("i-name").focus();
  }
}
function flashCard(id) {
  render();
  setTimeout(() => {
    const card = listEl.querySelector(`.card[data-id="${id}"]`);
    if (card) { card.classList.add("flash"); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }, 50);
}

/* ============ エクスポート ============ */
function exportJson() {
  const blob = new Blob([PaintStore.exportJson(state)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paint-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============ CSV取込 ============ */
// ごく単純なCSVパーサ。ダブルクオートで囲んだカンマにも対応。
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { importCsvText(String(reader.result)); e.target.value = ""; };
  reader.onerror = () => { alert("ファイルの読み込みに失敗しました。"); e.target.value = ""; };
  reader.readAsText(file, "utf-8");
}

async function importCsvText(text) {
  const lines = text.split(/\r?\n/);
  // ヘッダ行（maker,series,name,... を含む行）を探す
  const headerIdx = lines.findIndex(l => /(^|,)\s*maker\s*,/.test("," + l + ","));
  if (headerIdx < 0) { alert("CSVのヘッダ行（maker,series,name,...）が見つかりません。"); return; }
  const header = parseCsvLine(lines[headerIdx]).map(h => h.toLowerCase());
  const col = name => header.indexOf(name);
  const iMaker = col("maker"), iSeries = col("series"), iName = col("name"),
        iNameJa = col("name_ja"),
        iCode = col("code"), iJan = col("jan"), iColor = col("color_key"), iHex = col("hex"), iNote = col("note");

  const colorKeys = new Set(COLOR_TYPES.map(c => c.key));
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cells = parseCsvLine(raw);
    const name = (iName >= 0 ? cells[iName] : "") || "";
    if (!name || name.startsWith("（")) continue; // 見本プレースホルダ行はスキップ
    const colorKey = (iColor >= 0 && colorKeys.has(cells[iColor])) ? cells[iColor] : "other";
    rows.push({
      maker: iMaker >= 0 ? cells[iMaker] : "",
      series: iSeries >= 0 ? cells[iSeries] : "",
      name,
      nameJa: iNameJa >= 0 ? (cells[iNameJa] || "") : "",
      code: iCode >= 0 ? cells[iCode] : "",
      barcode: iJan >= 0 ? (cells[iJan] || "") : "",
      colorKey,
      hex: iHex >= 0 ? (cells[iHex] || "") : "",
      note: iNote >= 0 ? (cells[iNote] || "") : "",
    });
  }
  if (rows.length === 0) { alert("取り込める行が見つかりませんでした。"); return; }

  // 重複判定：同じ maker + code（codeが空なら maker + name）で既存があればスキップ
  const keyOf = r => (r.maker || "") + "|" + (r.code ? "c:" + r.code : "n:" + r.name);
  const existing = new Set(state.paints.map(keyOf));
  let added = 0, skipped = 0;
  rows.forEach(r => {
    if (existing.has(keyOf(r))) { skipped++; return; }
    state.paints.push({
      id: uid(), kind: "product",
      name: r.name, nameJa: r.nameJa, maker: r.maker, series: r.series, code: r.code,
      colorKey: r.colorKey, hex: r.hex || "", qty: 0, remaining: 100, wanted: false,
      barcode: r.barcode, note: r.note, recipe: [], recipeNote: "",
      createdAt: now(), updatedAt: now(),
    });
    existing.add(keyOf(r));
    added++;
  });

  await persist();
  render();
  alert(`取込完了：${added}件を追加（重複スキップ ${skipped}件）。\n` +
        `※在庫本数は0で登録しました。持っている色は本数を増やしてください。`);
}
