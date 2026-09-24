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
const errorEl = document.getElementById("authError");
const submitBtn = document.getElementById("authSubmit");
const submitLabel = document.getElementById("authSubmitLabel");
const switchLine = document.getElementById("switchLine");
const tabs = [...document.querySelectorAll('[role="tab"]')];
const panel = document.getElementById("authPanel");

let mode = params.get("mode") === "masuk" ? "masuk" : "daftar";
let busy = false;

function setMode(nextMode, { focusTab = false } = {}) {
  mode = nextMode;
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
  document.getElementById("sayLine").textContent = c.line;
  document.title = mode === "masuk" ? "Masuk ke Kerang Ajaib" : "Daftar ke Kerang Ajaib";
  nameField.hidden = mode === "masuk";
  pwHint.hidden = mode === "masuk";
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

pwToggle.addEventListener("click", () => {
  const show = pwInput.type === "password";
  pwInput.type = show ? "text" : "password";
  pwToggle.textContent = show ? "Tutup" : "Lihat";
  pwToggle.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
});

function clearErrors() {
  errorEl.textContent = "";
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
}

function fail(message, field) {
  errorEl.textContent = message;
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

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

// Sudah masuk? Langsung ke tujuan.
fetch("/api/me")
  .then((res) => (res.ok ? res.json() : {}))
  .then((data) => { if (data.user) location.replace(next); })
  .catch(() => {});
