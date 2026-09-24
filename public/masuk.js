import { initThemeToggle } from "./theme.js";

initThemeToggle(document.getElementById("themeToggle"));

const params = new URLSearchParams(location.search);
const rawNext = params.get("next") || "";
// Hanya path internal. "//x" dan "/\x" bisa dibaca browser sebagai domain lain.
const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/app";

const COPY = {
  daftar: {
    num: "01",
    title: "Kenalan dulu.",
    line: "Kerang nggak bisa ngasih ide personal ke orang yang belum dia kenal. Bikin akun, terus kenalin kreator-kreatormu satu per satu.",
    submit: "Kenalan sama Kerang",
    busy: "Bentar, Kerang lagi nyatet…",
    switchText: "Udah punya akun?",
    switchBtn: "Masuk aja",
    switchTo: "masuk",
    pwAutocomplete: "new-password",
  },
  masuk: {
    num: "02",
    title: "Balik lagi?",
    line: "Kreator-kreatormu dan semua yang pernah Kerang bikinin masih tersimpan. Tinggal masuk.",
    submit: "Masuk ke studio",
    busy: "Bentar, lagi dicek…",
    switchText: "Belum punya akun?",
    switchBtn: "Daftar dulu",
    switchTo: "daftar",
    pwAutocomplete: "current-password",
  },
};

const form = document.getElementById("authForm");
const nameField = document.getElementById("nameField");
const pwInput = document.getElementById("password");
const pwHint = document.getElementById("pwHint");
const pwToggle = document.getElementById("pwToggle");
const pwMeter = document.getElementById("pwMeter");
const tabList = document.getElementById("tabList");
const sayConch = document.getElementById("sayConch");
const sayLine = document.getElementById("sayLine");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const errorEl = document.getElementById("authError");
const submitBtn = document.getElementById("authSubmit");
const submitLabel = document.getElementById("authSubmitLabel");
const switchLine = document.getElementById("switchLine");
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panel = document.getElementById("authPanel");

let mode = params.get("mode") === "masuk" ? "masuk" : "daftar";
let busy = false;

function setMode(nextMode, { focusTab = false } = {}) {
  const changed = nextMode !== mode;
  mode = nextMode;
  tabList.dataset.mode = mode;
  const c = COPY[mode];
  tabs.forEach((t) => {
    const on = t.dataset.mode === mode;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) {
      panel.setAttribute("aria-labelledby", t.id);
      if (focusTab) t.focus();
    }
  });
  document.getElementById("sayNum").textContent = c.num;
  document.getElementById("sayTitle").textContent = c.title;
  sayLine.textContent = c.line;
  if (changed && !reduceMotion.matches) {
    sayConch.classList.remove("talk");
    sayLine.classList.remove("pop");
    void sayLine.offsetWidth; // mulai ulang animasi
    sayConch.classList.add("talk");
    sayLine.classList.add("pop");
  }
  document.title = mode === "masuk" ? "Masuk ke Kerang Ajaib" : "Daftar ke Kerang Ajaib";
  nameField.hidden = mode === "masuk";
  pwHint.hidden = mode === "masuk";
  pwMeter.hidden = mode === "masuk";
  pwInput.autocomplete = c.pwAutocomplete;
  submitLabel.textContent = c.submit;
  switchLine.replaceChildren(
    document.createTextNode(`${c.switchText} `),
    Object.assign(document.createElement("button"), {
      type: "button",
      className: "link-btn",
      textContent: c.switchBtn,
      onclick: () => setMode(c.switchTo, { focusTab: true }),
    }),
  );
  clearErrors();
  updatePwHint();

  const url = new URL(location.href);
  if (mode === "masuk") url.searchParams.set("mode", "masuk");
  else url.searchParams.delete("mode");
  history.replaceState(null, "", url);
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
  tab.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") j = 0;
    if (e.key === "End") j = tabs.length - 1;
    setMode(tabs[j].dataset.mode, { focusTab: true });
  });
});

// Tombol mata: sentuh/klik tidak mencuri fokus dari input, jadi keyboard HP tetap terbuka
// dan posisi kursor tidak hilang. Lewat keyboard (Tab lalu Enter/Spasi) fokus tetap di tombol.
pwToggle.addEventListener("pointerdown", (e) => {
  if (document.activeElement === pwInput) e.preventDefault();
});
pwToggle.addEventListener("click", () => {
  const show = pwInput.type === "password";
  const hadFocus = document.activeElement === pwInput;
  const start = pwInput.selectionStart;
  const end = pwInput.selectionEnd;
  pwInput.type = show ? "text" : "password";
  pwToggle.setAttribute("aria-pressed", String(show));
  pwToggle.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
  if (hadFocus && start !== null) {
    // Ganti type bisa mereset kursor (Chrome melakukannya sesudah event selesai), jadi dipasang lagi di frame berikutnya.
    const restore = () => { try { pwInput.setSelectionRange(start, end); } catch {} };
    restore();
    requestAnimationFrame(restore);
  }
});

// Petunjuk panjang password saat daftar. Cuma ngukur panjang, nggak ngeblok apa-apa.
function updatePwHint() {
  if (mode !== "daftar") return;
  const n = pwInput.value.length;
  let level = 0;
  let text = "Minimal 8 karakter.";
  if (n > 0 && n < 8) { level = 1; text = `Kurang ${8 - n} karakter lagi.`; }
  else if (n >= 8 && n < 12) { level = 2; text = "Udah cukup. Makin panjang makin susah ditebak."; }
  else if (n >= 12) { level = 3; text = "Panjang. Mantap."; }
  pwMeter.dataset.level = String(level);
  pwHint.textContent = text;
}
pwInput.addEventListener("input", updatePwHint);

function clearErrors() {
  errorEl.textContent = "";
  form.querySelectorAll(".m-field-error").forEach((el) => { el.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
}

// Error yang jelas punya pemilik ditaruh di bawah field-nya (dibaca lewat aria-describedby saat field difokus).
// Error umum (server, koneksi) ke kotak role="alert".
function fail(message, field) {
  const slot = field && document.getElementById(`${field.id}Err`);
  if (slot) slot.textContent = message;
  else errorEl.textContent = message;
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

// Begitu diketik ulang, tanda error di field itu hilang.
form.addEventListener("input", (e) => {
  const field = e.target;
  if (field.getAttribute?.("aria-invalid") !== "true") return;
  field.removeAttribute("aria-invalid");
  const slot = document.getElementById(`${field.id}Err`);
  if (slot) slot.textContent = "";
});

function setBusy(on) {
  busy = on;
  submitBtn.disabled = on;
  submitBtn.setAttribute("aria-busy", String(on));
  form.setAttribute("aria-busy", String(on));
  submitLabel.textContent = on ? COPY[mode].busy : COPY[mode].submit;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  clearErrors();
  const f = form.elements;
  const name = f.name.value.trim();
  const email = f.email.value.trim();
  const password = f.password.value;

  if (mode === "daftar" && !name) return fail("Namamu siapa? Kerang perlu manggil kamu.", f.name);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Format emailnya belum bener.", f.email);
  if (!password) return fail("Password belum diisi.", f.password);
  if (mode === "daftar" && password.length < 8) return fail("Password minimal 8 karakter.", f.password);

  setBusy(true);
  try {
    const res = await fetch(mode === "daftar" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "daftar" ? { name, email, password } : { email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      const field = res.status === 409 ? f.email : null;
      return fail(body.error || `Server membalas ${res.status}. Coba lagi sebentar.`, field);
    }
    submitLabel.textContent = "Beres. Masuk studio…";
    location.assign(next);
  } catch {
    setBusy(false);
    fail("Server Kerang nggak bisa dihubungi. Cek koneksi, lalu coba lagi.");
  }
});

setMode(mode);
requestAnimationFrame(() => tabList.classList.add("is-ready"));

// Sudah masuk? Langsung ke tujuan.
fetch("/api/me")
  .then((res) => (res.ok ? res.json() : {}))
  .then((data) => { if (data.user) location.replace(next); })
  .catch(() => {});
