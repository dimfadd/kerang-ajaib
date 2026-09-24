import { initThemeToggle } from "./theme.js";

const $ = (sel) => document.querySelector(sel);

const form = $("#briefForm");
const submitBtn = $("#submitBtn");
const submitLabel = $("#submitLabel");
const submitNote = $("#submitNote");
const formError = $("#formError");
const emptyState = $("#emptyState");
const turnsEl = $("#turns");
const reportSlot = $("#reportSlot");
const genMeta = $("#genMeta");
const outputActions = $("#outputActions");
const reviseForm = $("#reviseForm");
const reviseInput = $("#reviseInput");
const reviseBtn = $("#reviseBtn");

// Vercel menolak body request di atas ~4,5 MB, jadi foto dikecilkan dan jumlahnya dibatasi.
const MAX_IMAGES = 6;
const MAX_IMAGE_SIDE = 1024;
const IMAGE_QUALITY = 0.8;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const LOGIN_URL = "/masuk?mode=masuk&next=/app";
const STATUSES = ["belum direkam", "sudah direkam", "sudah tayang", "batal"];

const PERSONA_FIELDS = [
  "creatorName", "handle", "creatorType", "whoIs", "followers", "avgViews", "niche",
  "engagementNotes", "personality", "speakingStyle", "catchphrases", "signatureActions",
  "onCamera", "boundaries", "pastHits", "equipment", "location",
];

const state = {
  user: null,
  personas: [],
  personaId: null, // kreator yang sedang dipilih
  personasLoaded: false,
  current: null, // riwayat yang sedang tampil & dilanjutkan revisinya (ringkasan dari server)
  historyScope: "all",
  history: [],
  images: [], // { id, media_type, data, preview, label, note }
  lastPayload: null,
  markdownTurns: [],
  busy: false,
  ai: { ready: true, mock: false }, // dari /api/config; kalau gagal dianggap siap
};

initThemeToggle($("#themeToggle"));

/* ---------- Helper API ---------- */
class SessionExpired extends Error {}

function toLogin() {
  location.assign(LOGIN_URL);
}

async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Server Kerang nggak bisa dihubungi. Cek koneksi atau pastikan server jalan.");
  }
  if (res.status === 401) {
    toLogin();
    throw new SessionExpired("Sesi habis. Masuk lagi dulu.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server membalas ${res.status}.`);
  return data;
}

const fmtNumber = (n) => Number(n).toLocaleString("id-ID");
function fmtDate(sqlDate) {
  if (!sqlDate) return "";
  // SQLite datetime('now') = UTC tanpa zona
  const d = new Date(sqlDate.includes("T") ? sqlDate : `${sqlDate.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return sqlDate;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

/* ---------- Boot: cek sesi ---------- */
const boot = $("#boot");
const bootLine = $("#bootLine");
const bootRetry = $("#bootRetry");

async function start() {
  bootLine.textContent = "Kerang lagi ngecek kamu siapa…";
  bootRetry.hidden = true;
  try {
    const { user } = await api("/api/me");
    if (!user) {
      toLogin();
      return;
    }
    state.user = user;
  } catch (err) {
    if (err instanceof SessionExpired) return;
    bootLine.textContent = err.message;
    bootRetry.hidden = false;
    return;
  }
  const who = $("#whoName");
  who.textContent = `Halo, ${state.user.name}`;
  who.hidden = false;
  $("#logoutBtn").hidden = false;
  boot.hidden = true;
  $("#studio").hidden = false;
  loadPersonas();
  loadHistory();
  loadConfig();
}
bootRetry.addEventListener("click", start);

/* ---------- Status AI (deploy tanpa API key tetap bisa dipakai) ---------- */
function applyAiConfig() {
  $("#aiNote").hidden = state.ai.ready;
  $("#demoTag").hidden = !(state.ai.ready && state.ai.mock);
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!res.ok) return; // endpoint belum ada atau error: anggap siap, jangan halangi studio
    const data = await res.json();
    if (data && data.ai && typeof data.ai === "object") {
      state.ai = { ready: data.ai.ready !== false, mock: data.ai.mock === true };
    }
  } catch {
    // jaringan/JSON gagal: tetap anggap siap
  }
  applyAiConfig();
}

$("#logoutBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Keluar…";
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // tetap arahkan ke depan; cookie dibersihkan server kalau request sampai
  }
  location.assign("/");
});

/* ---------- Produk ---------- */
const hasProduct = $("#hasProduct");
const productBox = $("#productBox");
const goalSelect = form.elements.goal;
hasProduct.addEventListener("change", () => { productBox.hidden = !hasProduct.checked; });
goalSelect.addEventListener("change", () => {
  if (goalSelect.value.startsWith("Jualan") && !hasProduct.checked) {
    hasProduct.checked = true;
    productBox.hidden = false;
  }
});

/* ---------- Kreator (persona) ---------- */
const personaSelect = $("#personaSelect");
const personaMemory = $("#personaMemory");
const personaMsg = $("#personaMsg");
const personaUpdate = $("#personaUpdate");
const personaCreate = $("#personaCreate");
const personaDelete = $("#personaDelete");
const personaRetry = $("#personaRetry");

function readPlatforms() {
  return [...form.querySelectorAll('input[name="platforms"]:checked')].map((i) => i.value);
}

function collectPersonaData() {
  const data = {};
  PERSONA_FIELDS.forEach((f) => { data[f] = form.elements[f].value.trim(); });
  data.platforms = readPlatforms();
  return data;
}

function fillPersonaFields(data = {}) {
  PERSONA_FIELDS.forEach((f) => {
    const input = form.elements[f];
    if (input.tagName === "SELECT") {
      input.value = data[f] || input.options[0].value;
    } else {
      input.value = data[f] ?? "";
    }
  });
  const platforms = Array.isArray(data.platforms) ? data.platforms : ["TikTok"];
  form.querySelectorAll('input[name="platforms"]').forEach((i) => { i.checked = platforms.includes(i.value); });
}

function personaName(data) {
  if (data.creatorName) return data.creatorName;
  if (data.handle) return data.handle;
  const story = data.whoIs.replace(/\s+/g, " ").trim();
  return story ? `Kreator: ${story.slice(0, 40)}${story.length > 40 ? "…" : ""}` : "";
}

const selectedPersona = () => state.personas.find((p) => p.id === state.personaId) || null;

function isDirty() {
  const p = selectedPersona();
  if (!p) return false;
  const saved = { ...Object.fromEntries(PERSONA_FIELDS.map((f) => [f, ""])), platforms: [], ...p.data };
  const now = collectPersonaData();
  return PERSONA_FIELDS.some((f) => String(saved[f] ?? "").trim() !== now[f])
    || [...(saved.platforms || [])].sort().join("|") !== [...now.platforms].sort().join("|");
}

function renderPersonaUI() {
  const p = selectedPersona();
  personaUpdate.hidden = !p;
  personaDelete.hidden = !p;
  if (!state.personasLoaded) return;

  if (p) {
    const n = p.generation_count ?? 0;
    personaMemory.textContent = n
      ? `Kerang udah bikinin ${n} konten buat ${p.name}. Catatannya dibaca lagi tiap brief baru, biar ide lama nggak diulang.`
      : `Belum ada konten buat ${p.name}. Yang pertama bakal Kerang ingat.`;
    submitNote.textContent = `Konten ini dicatat di memori ${p.name}.`;
  } else if (state.personas.length) {
    personaMemory.textContent = "Kreator baru, belum disimpan. Pilih yang udah ada, atau isi bagian 1 dan 2.";
    submitNote.textContent = "Kreator yang belum disimpan otomatis disimpan waktu kamu tarik tali, biar Kerang bisa ingat konten ini buat brief berikutnya.";
  } else {
    personaMemory.textContent = "Belum ada kreator tersimpan. Kerang cuma bisa ingat kreator yang disimpan.";
    submitNote.textContent = "Kreator ini otomatis disimpan waktu kamu tarik tali, biar Kerang bisa ingat konten ini buat brief berikutnya.";
  }
  if (p && isDirty()) {
    personaMsg.textContent = `Ada perubahan yang belum disimpan ke ${p.name}.`;
    personaMsg.dataset.kind = "dirty";
  } else if (personaMsg.dataset.kind === "dirty") {
    personaMsg.textContent = "";
    delete personaMsg.dataset.kind;
  }
  $("#scopePersona").hidden = !p;
}

function renderPersonaOptions() {
  personaSelect.replaceChildren(
    new Option(state.personas.length ? "Kreator baru (belum disimpan)" : "Belum ada kreator tersimpan", ""),
    ...state.personas.map((p) => new Option(`${p.name} (${p.generation_count ?? 0} konten)`, String(p.id))),
  );
  personaSelect.value = state.personaId ? String(state.personaId) : "";
  personaSelect.disabled = false;
}

function setPersonaMsg(text, kind = "") {
  personaMsg.textContent = text;
  if (kind) personaMsg.dataset.kind = kind;
  else delete personaMsg.dataset.kind;
}

async function loadPersonas() {
  personaRetry.hidden = true;
  if (!state.personasLoaded) {
    personaSelect.disabled = true;
    personaMemory.textContent = "Memuat kreator…";
  }
  try {
    const { personas } = await api("/api/personas");
    state.personas = personas;
    if (state.personaId && !selectedPersona()) state.personaId = null;
    state.personasLoaded = true;
    renderPersonaOptions();
    renderPersonaUI();
    renderLegacy();
  } catch (err) {
    if (err instanceof SessionExpired) return;
    personaSelect.replaceChildren(new Option("Gagal memuat kreator", ""));
    personaMemory.textContent = "";
    setPersonaMsg(err.message, "error");
    personaRetry.hidden = false;
  }
}
personaRetry.addEventListener("click", loadPersonas);

/* Profil lama dari versi sebelum akun (disimpan di localStorage "kerang-profiles"). */
const LEGACY_KEY = "kerang-profiles";
const legacyBox = $("#legacyBox");
const legacyText = $("#legacyText");
const legacyImport = $("#legacyImport");

function readLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === "object" ? Object.entries(obj) : [];
  } catch {
    return [];
  }
}

function renderLegacy() {
  const list = readLegacy();
  legacyBox.hidden = list.length === 0;
  if (list.length) {
    legacyText.textContent = `Ada ${list.length} profil kreator lama yang cuma tersimpan di browser ini. Pindahkan ke akun supaya Kerang bisa ingat konten mereka.`;
  }
}

legacyImport.addEventListener("click", () => withButton(legacyImport, "Memindahkan…", async () => {
  const list = readLegacy();
  let moved = 0;
  try {
    for (const [name, data] of list) {
      const { persona } = await api("/api/personas", { method: "POST", body: { name, data } });
      state.personas.unshift({ ...persona, generation_count: 0 });
      moved += 1;
    }
    try { localStorage.removeItem(LEGACY_KEY); } catch {}
    renderPersonaOptions();
    renderPersonaUI();
    renderLegacy();
    setPersonaMsg(`${moved} profil lama dipindahkan ke akun. Pilih salah satu di daftar kreator.`);
  } catch (err) {
    if (err instanceof SessionExpired) return;
    // Yang sudah terkirim jangan dikirim ulang.
    try {
      const rest = Object.fromEntries(list.slice(moved));
      localStorage.setItem(LEGACY_KEY, JSON.stringify(rest));
    } catch {}
    renderPersonaOptions();
    renderLegacy();
    setPersonaMsg(`${moved} profil dipindahkan, sisanya gagal: ${err.message}`, "error");
  }
}));

personaSelect.addEventListener("change", () => {
  const id = Number(personaSelect.value) || null;
  const prev = selectedPersona();
  if (prev && isDirty() && !confirm(`Perubahan di ${prev.name} belum disimpan. Tetap ganti kreator?`)) {
    personaSelect.value = String(prev.id);
    return;
  }
  state.personaId = id;
  const p = selectedPersona();
  if (p) {
    fillPersonaFields(p.data);
    setPersonaMsg(`${p.name} dimuat. Tinggal isi mau bikin konten apa.`);
  } else {
    const hasContent = PERSONA_FIELDS.some((f) => form.elements[f].value.trim() && form.elements[f].tagName !== "SELECT");
    if (hasContent && confirm("Kosongkan isian kreator buat mulai kreator baru?")) {
      fillPersonaFields({});
      setPersonaMsg("Isian kreator dikosongkan.");
    } else {
      setPersonaMsg("Isian dibiarkan. Simpan sebagai kreator baru kalau mau disimpan.");
    }
  }
  if (state.historyScope === "persona" && !p) state.historyScope = "all";
  else if (p) state.historyScope = "persona";
  renderPersonaUI();
  loadHistory();
});

form.addEventListener("input", (e) => {
  if (state.personaId && (PERSONA_FIELDS.includes(e.target.name) || e.target.name === "platforms")) renderPersonaUI();
});

async function createPersona() {
  const data = collectPersonaData();
  const name = personaName(data);
  if (!name) throw new Error("Isi nama, akun, atau cerita kreatornya dulu supaya bisa disimpan.");
  const { persona } = await api("/api/personas", { method: "POST", body: { name, data } });
  state.personas.unshift({ ...persona, generation_count: 0 });
  state.personaId = persona.id;
  renderPersonaOptions();
  renderPersonaUI();
  return persona;
}

async function withButton(btn, busyText, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

personaCreate.addEventListener("click", () => withButton(personaCreate, "Menyimpan…", async () => {
  try {
    const p = await createPersona();
    setPersonaMsg(`${p.name} tersimpan. Mulai sekarang Kerang nyatet semua konten buat dia.`);
    state.historyScope = "persona";
    loadHistory();
  } catch (err) {
    if (!(err instanceof SessionExpired)) setPersonaMsg(err.message, "error");
  }
}));

personaUpdate.addEventListener("click", () => withButton(personaUpdate, "Menyimpan…", async () => {
  const p = selectedPersona();
  if (!p) return;
  if (!isDirty()) {
    setPersonaMsg(`Belum ada yang berubah dari data ${p.name}.`);
    return;
  }
  try {
    const data = collectPersonaData();
    const name = personaName(data) || p.name;
    const { persona } = await api(`/api/personas/${p.id}`, { method: "PUT", body: { name, data } });
    Object.assign(p, persona);
    renderPersonaOptions();
    renderPersonaUI();
    setPersonaMsg(`Perubahan ${persona.name} tersimpan.`);
  } catch (err) {
    if (!(err instanceof SessionExpired)) setPersonaMsg(err.message, "error");
  }
}));

personaDelete.addEventListener("click", async () => {
  const p = selectedPersona();
  if (!p) return;
  if (!confirm(`Hapus ${p.name}? Riwayat kontennya tetap ada, tapi Kerang nggak bisa lagi nyambungin memori ke kreator ini.`)) return;
  await withButton(personaDelete, "Menghapus…", async () => {
    try {
      await api(`/api/personas/${p.id}`, { method: "DELETE" });
      state.personas = state.personas.filter((x) => x.id !== p.id);
      state.personaId = null;
      state.historyScope = "all";
      renderPersonaOptions();
      renderPersonaUI();
      setPersonaMsg(`${p.name} dihapus. Isian form dibiarkan, bisa disimpan lagi kalau berubah pikiran.`);
      loadHistory();
    } catch (err) {
      if (!(err instanceof SessionExpired)) setPersonaMsg(err.message, "error");
    }
  });
});

/* ---------- Foto ---------- */
const imageInput = $("#imageInput");
const thumbs = $("#thumbs");

const LABEL_OPTIONS = [
  ["produk", "Produk"],
  ["tempat", "Tempat / lokasi"],
  ["kreator", "Kreator"],
  ["properti", "Properti / barang"],
  ["referensi", "Referensi visual"],
  ["lainnya", "Lainnya"],
];

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
      resolve({ media_type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Gagal membaca ${file.name}`));
    };
    img.src = url;
  });
}

imageInput.addEventListener("change", async () => {
  const files = [...imageInput.files];
  imageInput.value = "";
  const room = MAX_IMAGES - state.images.length;
  if (files.length > room) {
    formError.textContent = `Maksimal ${MAX_IMAGES} foto. ${files.length - Math.max(room, 0)} foto tidak ditambahkan.`;
  }
  for (const file of files.slice(0, Math.max(room, 0))) {
    try {
      const img = await resizeImage(file);
      state.images.push({ id: crypto.randomUUID(), label: "produk", note: "", ...img });
    } catch (err) {
      formError.textContent = err.message;
    }
  }
  renderThumbs();
});

function renderThumbs() {
  thumbs.innerHTML = "";
  state.images.forEach((img, i) => {
    const li = document.createElement("li");

    const pic = document.createElement("img");
    pic.src = img.preview;
    pic.alt = `Foto referensi ${i + 1}`;

    const select = document.createElement("select");
    select.setAttribute("aria-label", `Jenis foto ${i + 1}`);
    LABEL_OPTIONS.forEach(([value, text]) => {
      select.append(new Option(text, value, false, value === img.label));
    });
    select.addEventListener("change", () => { img.label = select.value; });

    const note = document.createElement("input");
    note.placeholder = "Keterangan singkat";
    note.value = img.note;
    note.setAttribute("aria-label", `Keterangan foto ${i + 1}`);
    note.addEventListener("input", () => { img.note = note.value; });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost-btn danger remove";
    remove.textContent = "Buang foto";
    remove.addEventListener("click", () => {
      state.images = state.images.filter((x) => x.id !== img.id);
      renderThumbs();
    });

    li.append(pic, select, note, remove);
    thumbs.append(li);
  });
}

/* ---------- Brief ---------- */
function collectBrief() {
  const f = form.elements;
  const val = (name) => f[name].value.trim();
  return {
    creatorName: val("creatorName"),
    handle: val("handle"),
    creatorType: val("creatorType"),
    whoIs: val("whoIs"),
    followers: val("followers"),
    avgViews: val("avgViews"),
    niche: val("niche"),
    engagementNotes: val("engagementNotes"),
    platforms: readPlatforms(),
    personality: val("personality"),
    speakingStyle: val("speakingStyle"),
    catchphrases: val("catchphrases"),
    signatureActions: val("signatureActions"),
    onCamera: val("onCamera"),
    boundaries: val("boundaries"),
    pastHits: val("pastHits"),
    topic: val("topic"),
    goal: val("goal"),
    audience: val("audience"),
    targetPlatform: val("targetPlatform"),
    duration: val("duration"),
    hasProduct: f.hasProduct.checked,
    productName: val("productName"),
    productPrice: val("productPrice"),
    productUsp: val("productUsp"),
    productNotes: val("productNotes"),
    trendNotes: val("trendNotes"),
    researchTrends: f.researchTrends.checked,
    equipment: val("equipment"),
    location: val("location"),
    references: val("references"),
    boldness: form.querySelector('input[name="boldness"]:checked')?.value || "nyeleneh",
    ideaCount: Number(val("ideaCount")) || 3,
    extraNotes: val("extraNotes"),
  };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (state.busy) return;
  formError.textContent = "";
  const brief = collectBrief();
  if (!brief.creatorName && !brief.whoIs) {
    formError.textContent = "Isi nama kreator atau cerita tentang dia dulu.";
    form.elements.creatorName.focus();
    return;
  }
  if (!brief.topic) {
    formError.textContent = "Topik kontennya belum diisi.";
    form.elements.topic.focus();
    return;
  }

  // Batas body Vercel ~4,5 MB: cek dulu sebelum apa pun dikirim.
  const images = state.images.map(({ media_type, data, label, note }) => ({ media_type, data, label, note }));
  const bodyBytes = new Blob([JSON.stringify({ brief, images, personaId: state.personaId || 0 })]).size;
  if (bodyBytes > MAX_BODY_BYTES) {
    const mb = (bodyBytes / (1024 * 1024)).toLocaleString("id-ID", { maximumFractionDigits: 1 });
    formError.textContent = `Brief dan fotonya kegedean buat dikirim (${mb} MB, batasnya 4 MB). Buang satu atau dua foto dulu, lalu tarik lagi.`;
    $("#thumbs").querySelector(".remove")?.focus();
    return;
  }

  // Kerang cuma bisa ingat kreator yang tersimpan: simpan otomatis kalau belum.
  if (!state.personaId) {
    setBusy(true, "Nyimpen kreator dulu…");
    try {
      const p = await createPersona();
      setPersonaMsg(`${p.name} otomatis disimpan, biar Kerang ingat konten ini buat brief berikutnya.`);
      state.historyScope = "persona";
    } catch (err) {
      setBusy(false);
      if (!(err instanceof SessionExpired)) {
        formError.textContent = `Kreator gagal disimpan, jadi Kerang belum jalan: ${err.message}`;
      }
      return;
    }
    setBusy(false);
  }

  resetOutput();
  switchView("result");
  runTurn({ brief, images, personaId: state.personaId }, null);
  if (matchMedia("(max-width: 1000px)").matches) {
    $(".output").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
});

/* ---------- Revisi ---------- */
reviseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendRevision(reviseInput.value.trim());
});
reviseForm.querySelectorAll("[data-revise]").forEach((btn) => {
  btn.addEventListener("click", () => sendRevision(btn.dataset.revise, btn.textContent));
});

function sendRevision(text, shortLabel) {
  if (!text) {
    reviseInput.focus();
    return;
  }
  if (state.busy || !state.current) return;
  reviseInput.value = "";
  runTurn({ generationId: state.current.id, followUp: text }, shortLabel || text);
}

/* ---------- Panel hasil ---------- */
function setBusy(busy, label) {
  state.busy = busy;
  submitBtn.disabled = busy;
  reviseBtn.disabled = busy;
  reviseForm.querySelectorAll(".chip-btn").forEach((b) => { b.disabled = busy; });
  submitLabel.textContent = busy ? (label || "Kerang lagi mikir…") : "Tarik tali Kerang Ajaib";
}

function renderMarkdown(target, md) {
  target.innerHTML = DOMPurify.sanitize(marked.parse(md));
}

function resetOutput() {
  state.current = null;
  state.markdownTurns = [];
  state.lastPayload = null;
  turnsEl.innerHTML = "";
  reportSlot.innerHTML = "";
  genMeta.hidden = true;
  genMeta.innerHTML = "";
  emptyState.hidden = false;
  outputActions.hidden = true;
  reviseForm.hidden = true;
}

function turnElement(requestLabel) {
  const turn = el("article", { className: "turn" });
  if (requestLabel) {
    turn.append(el("p", { className: "turn-request" }, el("strong", { textContent: "Revisi: " }), requestLabel));
  }
  return turn;
}

function renderCurrentMeta() {
  const g = state.current;
  if (!g) {
    genMeta.hidden = true;
    reportSlot.innerHTML = "";
    return;
  }
  const bits = [fmtDate(g.created_at)];
  if (g.persona_name) bits.push(g.persona_name);
  if (g.revisions) bits.push(`${g.revisions} revisi`);
  genMeta.replaceChildren(
    el("p", { className: "gen-title", textContent: g.title }),
    el("p", { className: "gen-sub", textContent: bits.join(" · ") }),
    statusLine(g),
  );
  genMeta.hidden = false;
  reportSlot.replaceChildren(buildReportForm(g, { open: false }));
}

function statusLine(g) {
  const line = el("p", { className: "status-line" }, el("span", { className: "status-badge", textContent: g.status }));
  line.querySelector(".status-badge").dataset.status = g.status;
  if (g.result_views != null) line.append(` ${fmtNumber(g.result_views)} views`);
  return line;
}

async function runTurn(payload, requestLabel) {
  state.lastPayload = { payload, requestLabel };
  emptyState.hidden = true;
  outputActions.hidden = true;
  setBusy(true);

  const turn = turnElement(requestLabel);
  const statusLog = el("ul", { className: "status-log" });
  statusLog.setAttribute("aria-live", "polite");
  const thinking = el("details", { className: "thinking", hidden: true });
  thinking.innerHTML = "<summary>Lihat proses mikir Kerang</summary><pre></pre>";
  const result = el("div", { className: "result" });
  turn.append(statusLog, thinking, result);
  turnsEl.append(turn);
  turn.scrollIntoView({ block: "start" });

  let liveStatus = null;
  const addStatus = (text) => {
    liveStatus?.classList.remove("live");
    liveStatus = el("li", { textContent: text, className: "live" });
    statusLog.append(liveStatus);
  };
  addStatus(requestLabel ? "Kerang lagi baca permintaan revisi" : "Kerang lagi dengerin brief kamu, sambil buka catatan kreator ini");

  let markdown = "";
  let thinkingText = "";
  let renderQueued = false;
  let gotText = false;
  let failed = false;
  let doneId = null;

  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderMarkdown(result, markdown);
    });
  };

  const handle = (event, data) => {
    if (event === "text") {
      if (!gotText) {
        gotText = true;
        addStatus("Menulis arahan");
      }
      markdown += data.text;
      scheduleRender();
    } else if (event === "thinking") {
      if (!thinkingText) {
        thinking.hidden = false;
        addStatus("Bedah persona dan corat-coret ide mentah");
      }
      thinkingText += data.text;
      thinking.querySelector("pre").textContent = thinkingText;
    } else if (event === "status") {
      if (data.kind === "search") addStatus(`Cari tren: ${data.query || "…"}`);
      else if (data.kind === "search_result" && data.titles?.length) {
        addStatus(`Ketemu: ${data.titles.slice(0, 2).join(" | ")}`);
      } else if (data.kind === "truncated") {
        addStatus("Jawaban kepotong karena terlalu panjang. Minta revisi untuk melanjutkan.");
      }
    } else if (event === "done") {
      doneId = data.generationId;
    } else if (event === "error") {
      failed = true;
      showError(turn, data.message);
    }
    // "saved" datang pertama; riwayat baru dianggap sah setelah "done",
    // karena server menghapus riwayat baru yang gagal.
  };

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      toLogin();
      return;
    }
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !res.body || !type.includes("text/event-stream")) {
      // Bukan event stream (misalnya 503 AI_NOT_CONFIGURED): baca JSON dan tampilkan pesannya.
      const body = await res.json().catch(() => ({}));
      if (body.code === "AI_NOT_CONFIGURED") {
        state.ai.ready = false;
        applyAiConfig();
        failed = true;
        statusLog.remove();
        showError(turn, body.error || "Kerang belum disambungkan ke AI. Pemilik aplikasi perlu mengisi ANTHROPIC_API_KEY di environment variables deployment.", { calm: true });
      } else {
        throw new Error(body.error || `Server membalas ${res.status}. Coba lagi sebentar.`);
      }
    } else {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = /^event: (.+)$/m.exec(raw)?.[1];
          const dataLine = /^data: (.*)$/m.exec(raw)?.[1];
          if (ev && dataLine) {
            try {
              handle(ev, JSON.parse(dataLine));
            } catch {
              // frame rusak, lewati
            }
          }
        }
      }
      if (!doneId && !failed) {
        failed = true;
        showError(turn, "Sambungan ke Kerang putus sebelum selesai. Hasil yang belum lengkap tidak disimpan.");
      }
    }
  } catch (err) {
    failed = true;
    showError(turn, err.message.includes("fetch")
      ? "Server Kerang Ajaib nggak bisa dihubungi. Pastikan server jalan, lalu coba lagi."
      : err.message);
  }

  liveStatus?.classList.remove("live");
  renderMarkdown(result, markdown);
  if (markdown && doneId) {
    state.markdownTurns.push(requestLabel ? `\n\n---\n\n## Revisi: ${requestLabel}\n\n${markdown}` : markdown);
  }
  if (!failed && markdown) statusLog.remove();
  outputActions.hidden = state.markdownTurns.length === 0;
  setBusy(false);

  if (doneId) {
    const isNew = !state.current || state.current.id !== doneId;
    if (isNew) state.current = { id: doneId, title: payload.brief?.topic || "Konten baru", created_at: null, status: "belum direkam", result_views: null, revisions: 0 };
    reviseForm.hidden = false;
    await Promise.all([loadHistory(), loadPersonas()]);
    const fresh = state.history.find((g) => g.id === doneId);
    if (fresh) state.current = fresh;
    renderCurrentMeta();
  } else {
    reviseForm.hidden = !state.current;
  }
}

function showError(turn, message, { calm = false } = {}) {
  const retry = el("button", { type: "button", className: "ghost-btn", textContent: "Coba lagi" });
  retry.addEventListener("click", () => {
    if (state.busy || !state.lastPayload) return;
    turn.remove();
    const { payload, requestLabel } = state.lastPayload;
    runTurn(payload, requestLabel);
  });
  turn.append(el("div", { className: calm ? "error-box calm" : "error-box" }, el("p", { textContent: message }), retry));
}

/* ---------- Lapor hasil ---------- */
function buildReportForm(g, { open = false } = {}) {
  const details = el("details", { className: "report", open });
  details.append(el("summary", { textContent: "Lapor hasil ke Kerang" }));

  const idStatus = nextId("status");
  const idViews = nextId("views");
  const idNotes = nextId("notes");
  const statusSel = el("select", { id: idStatus, name: "status" }, ...STATUSES.map((s) => new Option(s, s, false, s === g.status)));
  const views = el("input", { id: idViews, name: "views", type: "text", inputMode: "numeric", autocomplete: "off", placeholder: "misal 48.000", value: g.result_views != null ? fmtNumber(g.result_views) : "" });
  const notes = el("textarea", { id: idNotes, name: "notes", rows: 2, placeholder: "Komen pada minta part 2, yang ramai malah bagian ending", value: g.result_notes ?? "" });
  const msg = el("p", { className: "report-msg" });
  msg.setAttribute("role", "status");
  const save = el("button", { type: "submit", className: "pull-btn small", textContent: "Simpan laporan" });

  const f = el("form", { className: "report-form", noValidate: true },
    el("p", { className: "report-why", textContent: "Lapor hasilnya biar Kerang tahu mana yang jalan. Brief berikutnya buat kreator ini ikut belajar dari sini." }),
    el("div", { className: "report-grid" },
      el("label", { htmlFor: idStatus, textContent: "Status" }, statusSel),
      el("label", { htmlFor: idViews, textContent: "Views" }, views),
    ),
    el("label", { htmlFor: idNotes, textContent: "Catatan buat Kerang" }, notes),
    el("div", { className: "report-actions" }, save, msg),
  );

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    // "48.000" atau "48,000" diterima: pemisah ribuan dibuang.
    const v = views.value.trim().replace(/[.,\s]/g, "");
    if (v && !/^\d+$/.test(v)) {
      msg.textContent = "Views harus angka, misalnya 48000.";
      msg.dataset.kind = "error";
      views.focus();
      return;
    }
    save.disabled = true;
    save.textContent = "Menyimpan…";
    msg.textContent = "";
    try {
      await api(`/api/generations/${g.id}`, {
        method: "PATCH",
        body: { status: statusSel.value, result_views: v === "" ? null : Number(v), result_notes: notes.value },
      });
      Object.assign(g, { status: statusSel.value, result_views: v === "" ? null : Number(v), result_notes: notes.value.trim() || null });
      msg.textContent = "Tersimpan. Kerang pakai ini buat brief berikutnya.";
      msg.dataset.kind = "ok";
      if (state.current?.id === g.id) {
        Object.assign(state.current, g);
        const line = genMeta.querySelector(".status-line");
        if (line) line.replaceWith(statusLine(state.current));
      }
      refreshHistoryItem(g);
    } catch (err) {
      if (err instanceof SessionExpired) return;
      msg.textContent = err.message;
      msg.dataset.kind = "error";
    } finally {
      save.disabled = false;
      save.textContent = "Simpan laporan";
    }
  });

  details.append(f);
  return details;
}

/* ---------- Tab hasil / riwayat ---------- */
const tabResult = $("#tabResult");
const tabHistory = $("#tabHistory");
const viewResult = $("#viewResult");
const viewHistory = $("#viewHistory");
const viewTabs = [tabResult, tabHistory];

function switchView(which, { focus = false } = {}) {
  const isHistory = which === "history";
  tabResult.setAttribute("aria-selected", String(!isHistory));
  tabHistory.setAttribute("aria-selected", String(isHistory));
  tabResult.tabIndex = isHistory ? -1 : 0;
  tabHistory.tabIndex = isHistory ? 0 : -1;
  viewResult.hidden = isHistory;
  viewHistory.hidden = !isHistory;
  outputActions.hidden = isHistory || state.markdownTurns.length === 0;
  if (focus) (isHistory ? tabHistory : tabResult).focus();
}
tabResult.addEventListener("click", () => switchView("result"));
tabHistory.addEventListener("click", () => switchView("history"));
viewTabs.forEach((tab) => {
  tab.addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const toHistory = e.key === "End" || ((e.key === "ArrowRight" || e.key === "ArrowLeft") && tab === tabResult);
    switchView(toHistory ? "history" : "result", { focus: true });
  });
});
$("#emptyToHistory").addEventListener("click", () => switchView("history", { focus: true }));

/* ---------- Riwayat ---------- */
const historyList = $("#historyList");
const historyState = $("#historyState");
const historyMsg = $("#historyMsg");
const historyCount = $("#historyCount");
const historyLead = $("#historyLead");
const scopePersona = $("#scopePersona");
const scopeAll = $("#scopeAll");

scopePersona.addEventListener("click", () => { state.historyScope = "persona"; loadHistory(); });
scopeAll.addEventListener("click", () => { state.historyScope = "all"; loadHistory(); });

let historyRequest = 0;
async function loadHistory() {
  const p = selectedPersona();
  if (state.historyScope === "persona" && !state.personaId) state.historyScope = "all";
  const scoped = state.historyScope === "persona" && state.personaId;
  scopePersona.setAttribute("aria-pressed", String(Boolean(scoped)));
  scopeAll.setAttribute("aria-pressed", String(!scoped));
  historyLead.textContent = scoped && p
    ? `Semua yang pernah Kerang bikinin buat ${p.name}.`
    : "Semua yang pernah Kerang bikinin di akunmu.";

  const req = ++historyRequest;
  historyMsg.textContent = "";
  historyState.replaceChildren(el("p", { className: "history-loading", textContent: "Membuka catatan Kerang…" }));
  historyList.setAttribute("aria-busy", "true");
  try {
    const url = scoped ? `/api/generations?persona_id=${state.personaId}` : "/api/generations";
    const { generations } = await api(url);
    if (req !== historyRequest) return;
    state.history = generations;
    renderHistory();
  } catch (err) {
    if (err instanceof SessionExpired || req !== historyRequest) return;
    const retry = el("button", { type: "button", className: "ghost-btn", textContent: "Coba lagi" });
    retry.addEventListener("click", loadHistory);
    historyList.replaceChildren();
    historyState.replaceChildren(el("div", { className: "error-box" }, el("p", { textContent: err.message }), retry));
  } finally {
    if (req === historyRequest) historyList.removeAttribute("aria-busy");
  }
}

function renderHistory() {
  const items = state.history;
  historyCount.textContent = items.length ? `(${items.length})` : "";
  historyList.replaceChildren();
  if (!items.length) {
    const p = selectedPersona();
    const scoped = state.historyScope === "persona" && p;
    historyState.replaceChildren(el("div", { className: "empty" },
      el("p", { className: "empty-lead", textContent: "Catatan Kerang masih kosong." }),
      el("p", { textContent: scoped
        ? `Belum ada konten buat ${p.name}. Isi topik di brief, tarik talinya, nanti hasilnya muncul di sini.`
        : "Setiap kali kamu tarik tali, hasilnya disimpan di sini lengkap sama revisinya." }),
    ));
    return;
  }
  historyState.replaceChildren();
  const showPersona = state.historyScope !== "persona";
  items.forEach((g, i) => historyList.append(historyItem(g, items.length - i, showPersona)));
}

function historyItem(g, number, showPersona) {
  const li = el("li", { className: "h-item" });
  li.dataset.id = g.id;
  if (state.current?.id === g.id) li.classList.add("is-open");

  const meta = [fmtDate(g.created_at)];
  if (showPersona) meta.push(g.persona_name || "kreator sudah dihapus");
  if (g.revisions) meta.push(`${g.revisions} revisi`);

  const head = el("div", { className: "h-top" },
    el("span", { className: "h-num", textContent: String(number).padStart(2, "0") }),
    el("div", { className: "h-text" },
      el("h3", { className: "h-title", textContent: g.title }),
      el("p", { className: "h-meta", textContent: meta.join(" · ") }),
    ),
  );
  li.append(head);

  if (g.ideas?.length) {
    li.append(el("ul", { className: "h-ideas" }, ...g.ideas.map((t) => el("li", { textContent: t }))));
  }
  li.append(statusLine(g));

  const open = el("button", { type: "button", className: "ghost-btn", textContent: state.current?.id === g.id ? "Lagi dibuka" : "Buka" });
  open.addEventListener("click", () => openGeneration(g.id));
  const del = el("button", { type: "button", className: "ghost-btn danger", textContent: "Hapus" });
  del.addEventListener("click", () => deleteGeneration(g, del));
  li.append(el("div", { className: "h-actions" }, open, del));
  li.append(buildReportForm(g));
  return li;
}

function refreshHistoryItem(g) {
  const item = historyList.querySelector(`.h-item[data-id="${g.id}"]`);
  if (!item) return;
  const line = item.querySelector(":scope > .status-line");
  if (line) line.replaceWith(statusLine(g));
  const inList = state.history.find((x) => x.id === g.id);
  if (inList && inList !== g) Object.assign(inList, g);
}

async function openGeneration(id) {
  if (state.busy) {
    historyMsg.textContent = "Tunggu Kerang selesai nulis dulu, baru buka riwayat lain.";
    return;
  }
  historyMsg.textContent = "";
  resetOutput();
  emptyState.hidden = true;
  switchView("result");
  const loading = el("p", { className: "history-loading", textContent: "Membuka riwayat…" });
  turnsEl.append(loading);
  try {
    const { generation } = await api(`/api/generations/${id}`);
    turnsEl.replaceChildren();
    generation.turns.forEach((t) => {
      const turn = turnElement(t.request);
      const result = el("div", { className: "result" });
      renderMarkdown(result, t.markdown);
      turn.append(result);
      turnsEl.append(turn);
      state.markdownTurns.push(t.request ? `\n\n---\n\n## Revisi: ${t.request}\n\n${t.markdown}` : t.markdown);
    });
    if (!generation.turns.length) {
      turnsEl.append(el("p", { className: "hint", textContent: "Riwayat ini belum punya isi." }));
    }
    const { brief, turns, use_search, ...summary } = generation;
    state.current = state.history.find((g) => g.id === generation.id) || summary;
    Object.assign(state.current, summary);
    renderCurrentMeta();
    outputActions.hidden = state.markdownTurns.length === 0;
    reviseForm.hidden = false;
    renderHistory();
    genMeta.scrollIntoView({ block: "start" });
  } catch (err) {
    if (err instanceof SessionExpired) return;
    turnsEl.replaceChildren();
    const turn = el("article", { className: "turn" });
    const retry = el("button", { type: "button", className: "ghost-btn", textContent: "Coba lagi" });
    retry.addEventListener("click", () => openGeneration(id));
    turn.append(el("div", { className: "error-box" }, el("p", { textContent: err.message }), retry));
    turnsEl.append(turn);
  }
}

async function deleteGeneration(g, btn) {
  if (state.busy && state.current?.id === g.id) {
    historyMsg.textContent = "Konten ini lagi direvisi. Tunggu selesai dulu.";
    return;
  }
  if (!confirm(`Hapus "${g.title}" dari riwayat? Kerang juga bakal lupa pernah bikin ini.`)) return;
  btn.disabled = true;
  btn.textContent = "Menghapus…";
  try {
    await api(`/api/generations/${g.id}`, { method: "DELETE" });
    if (state.current?.id === g.id) resetOutput();
    await Promise.all([loadHistory(), loadPersonas()]);
    historyMsg.textContent = `"${g.title}" dihapus.`;
  } catch (err) {
    if (err instanceof SessionExpired) return;
    btn.disabled = false;
    btn.textContent = "Hapus";
    historyMsg.textContent = err.message;
  }
}

/* ---------- Salin & unduh ---------- */
$("#copyBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(state.markdownTurns.join(""));
    btn.textContent = "Tersalin";
  } catch {
    btn.textContent = "Gagal menyalin";
  }
  setTimeout(() => { btn.textContent = "Salin semua"; }, 1800);
});

$("#downloadBtn").addEventListener("click", () => {
  const base = state.current?.title || form.elements.creatorName.value.trim() || "kreator";
  const name = base.toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "kreator";
  const blob = new Blob([state.markdownTurns.join("")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kerang-ajaib-${name}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
});

start();
