import { initThemeToggle } from "./theme.js";

initThemeToggle(document.getElementById("themeToggle"));

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Jawaban kerang ---------- */
// Tiap jawaban: kebiasaan yang sering kejadian + omelan Kerang. Urut, bukan acak,
// supaya tarikan terakhir selalu berujung ke ajakan kenalan.
const LINES = [
  {
    habit: "“Halo guys, balik lagi di channel aku…”",
    verdict: "Tiga detik pertama kamu pakai buat salam. Penonton udah geser dari detik kedua. Buka pakai kejadian, salamnya belakangan. Atau nggak usah.",
  },
  {
    habit: "Ikut sound yang lagi rame, gerakannya sama persis.",
    verdict: "Selamat, kamu jadi satu dari seribu video yang kembar. Soundnya boleh dipakai, tapi belokin ke hidupmu sendiri.",
  },
  {
    habit: "Pegang produk, baca tulisan di kemasan.",
    verdict: "Itu brosur, bukan konten. Produk masuk lewat cerita, lewat keluhan, lewat kejadian. Bukan lewat daftar keunggulan.",
  },
  {
    habit: "“Jangan lupa like, komen, dan follow ya!”",
    verdict: "Orang komen karena ada yang pengin mereka bantah, bukan karena disuruh. Kasih mereka alasan buat nggak setuju.",
  },
  {
    habit: "Videonya rapi, lumayan, aman.",
    verdict: "Lumayan itu nama lain dari dilupain. Pilih satu: bagus banget, atau jelek banget tapi disengaja.",
  },
  {
    habit: "Niru format kreator gede, ganti muka doang.",
    verdict: "Tes gampang: kalau idemu dipakai kreator lain tanpa diubah dan tetap jalan, berarti itu bukan idemu.",
  },
  {
    habit: "Catchphrase ditaruh paling akhir, pas orang udah pergi.",
    verdict: "Kalimat khasmu itu stempel. Taruh di momen yang pengin orang ulang, bukan di penutup yang nggak ditonton.",
  },
  {
    habit: "Followers 100 ribu, views 800.",
    verdict: "Kerang lebih percaya views. Kasih angka yang jujur, nanti hook-nya disetel sesuai seberapa keras dia harus teriak.",
  },
  {
    habit: "Tiap video mulai dari nol lagi.",
    verdict: "Kerang nyatet apa aja yang udah dia bikinin buat tiap kreator di akunmu. Yang jalan diterusin jadi series, yang basi nggak diulang.",
  },
  {
    habit: "“Terus aku harus bikin apa?”",
    verdict: "Nah, itu pertanyaan yang bener. Ceritain dulu kamu siapa.",
    cta: true,
  },
];

const conch = document.getElementById("conch");
const conchStage = document.getElementById("conchStage");
const ring = document.getElementById("ring");
const answerBody = document.getElementById("answerBody");
const answerNum = document.getElementById("answerNum");
const answer = document.getElementById("answer");
const specTitle = document.getElementById("specTitle");
const header = document.querySelector(".l-top");

// Isi awal kartu ("Kerang lagi diam."), disimpan buat tombol ulang.
const idleContent = [...answerBody.children].map((n) => n.cloneNode(true));

let index = -1; // -1 = belum ditarik, 0..9 = baris yang tampil
let ctaHref = "/masuk";
let ctaText = "Kenalin kreatormu ke Kerang";

function ctaLink() {
  const a = document.createElement("a");
  a.href = ctaHref;
  a.textContent = ctaText;
  return a;
}

function animateTalk() {
  if (reduceMotion.matches) return;
  answerBody.classList.remove("pop");
  conch.classList.remove("talk");
  ring.classList.remove("rang");
  answerNum.parentElement.classList.remove("bump");
  void answerBody.offsetWidth; // mulai ulang animasi
  answerBody.classList.add("pop");
  conch.classList.add("talk");
  ring.classList.add("rang");
  answerNum.parentElement.classList.add("bump");
}

// viaKeyboard: tarikan lewat Enter/Spasi. Cuma dipakai buat mutusin fokus ikut pindah atau tidak.
function speak(viaKeyboard = false) {
  cancelAdvance();
  const last = LINES.length - 1;

  // Sudah di baris ke-10: jangan mulai lagi dari 01. Kerang tutup, ajakan tetap ada, ulang cuma kalau diminta.
  if (index >= last) {
    speakRest();
    return;
  }

  index += 1;
  const line = LINES[index];
  answerNum.textContent = String(index + 1).padStart(2, "0");

  const label = document.createElement("p");
  label.className = "answer-habit-label";
  label.textContent = `Tarikan ${index + 1} dari ${LINES.length}. Yang sering kejadian:`;
  const habit = document.createElement("p");
  habit.className = "answer-habit";
  habit.textContent = line.habit;
  const verdict = document.createElement("p");
  verdict.className = "answer-verdict";
  verdict.textContent = line.verdict + " ";
  if (line.cta) verdict.append(ctaLink());
  answerBody.replaceChildren(label, habit, verdict);

  animateTalk();
  // Fokus tidak dipindah: jawaban diumumkan lewat aria-live, dan ring tetap siap ditarik lagi.
  requestAnimationFrame(revealAnswer);

  if (index === last) scheduleAdvance(viaKeyboard);
}

// Tarikan sesudah yang ke-10: penutup pendek + ajakan + tombol ulang. Nomor tetap 10.
function speakRest() {
  answerNum.textContent = String(LINES.length).padStart(2, "0");
  const label = document.createElement("p");
  label.className = "answer-habit-label";
  label.textContent = `Tarikan ${LINES.length} dari ${LINES.length}. Talinya udah habis.`;
  const verdict = document.createElement("p");
  verdict.className = "answer-verdict";
  verdict.textContent = "Udah, Kerang capek ngomel. Sekarang giliranmu. ";
  verdict.append(ctaLink());
  const restart = document.createElement("button");
  restart.type = "button";
  restart.className = "answer-restart";
  restart.textContent = "Ulang dari 01";
  restart.addEventListener("click", () => {
    resetConch();
    ring.focus({ preventScroll: true });
  });
  answerBody.replaceChildren(label, verdict, restart);
  animateTalk();
  requestAnimationFrame(revealAnswer);
}

// Balik ke 00, kerang diam lagi.
function resetConch() {
  cancelAdvance();
  index = -1;
  answerNum.textContent = "00";
  answerBody.replaceChildren(...idleContent.map((n) => n.cloneNode(true)));
}

/* ---------- Habis tarikan ke-10: turun ke spektrum ---------- */
// 2400 ms: jawaban ke-10 cuma dua kalimat pendek (sekitar 9 kata, kira-kira 2 detik baca santai), ditambah
// 350 ms animasi muncul. Lebih pendek dari itu kalimatnya belum kebaca; lebih panjang, isyaratnya kerasa macet.
// Kalau ada yang masih baca atau mau nge-tap link, interaksi apa pun membatalkan.
const ADVANCE_MS = 2400;
const CANCEL_EVENTS = ["pointerdown", "wheel", "touchstart", "keydown"];
let advanceTimer = 0;
let advanceCue = null;
let ignoreScrollUntil = 0;

function scheduleAdvance(viaKeyboard) {
  if (!specTitle) return;
  advanceCue = document.createElement("p");
  advanceCue.className = "answer-next";
  advanceCue.style.setProperty("--next-ms", `${ADVANCE_MS}ms`);
  const text = document.createElement("span");
  text.textContent = "Lanjut ke bawah...";
  const bar = document.createElement("span");
  bar.className = "answer-next-bar";
  bar.setAttribute("aria-hidden", "true");
  advanceCue.append(text, bar);
  answerBody.append(advanceCue);

  // Didaftarkan sesudah frame berikutnya, supaya event dari tarikan barusan tidak ikut membatalkan.
  requestAnimationFrame(() => {
    if (!advanceCue) return;
    CANCEL_EVENTS.forEach((t) => window.addEventListener(t, cancelAdvance, { capture: true, passive: true }));
    window.addEventListener("scroll", onUserScroll, { passive: true });
    document.addEventListener("visibilitychange", cancelAdvance);
  });
  advanceTimer = setTimeout(() => advance(viaKeyboard), ADVANCE_MS);
}

function onUserScroll() {
  // Geseran otomatis dari revealAnswer bukan tanda orang lagi baca; sisanya dianggap scroll manual.
  if (performance.now() < ignoreScrollUntil) return;
  cancelAdvance();
}

function stopListening() {
  clearTimeout(advanceTimer);
  advanceTimer = 0;
  CANCEL_EVENTS.forEach((t) => window.removeEventListener(t, cancelAdvance, { capture: true }));
  window.removeEventListener("scroll", onUserScroll);
  document.removeEventListener("visibilitychange", cancelAdvance);
  if (advanceCue) advanceCue.remove();
  advanceCue = null;
}

function cancelAdvance() {
  if (!advanceCue && !advanceTimer) return;
  stopListening();
}

function advance(viaKeyboard) {
  stopListening();
  if (document.hidden) return; // tab lagi di belakang: jangan pindahin halaman diam-diam
  const pos = header ? getComputedStyle(header).position : "";
  const headerOffset = pos === "sticky" || pos === "fixed" ? header.getBoundingClientRect().height : 0;
  const top = specTitle.getBoundingClientRect().top + window.scrollY - headerOffset - 24;
  window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion.matches ? "auto" : "smooth" });
  // Pengguna keyboard dan pembaca layar ikut pindah; pengguna mouse/sentuh fokusnya tidak dicuri.
  if (viaKeyboard) specTitle.focus({ preventScroll: true });
}

/* ---------- Pastikan jawaban kelihatan ---------- */
// Kalau kartu jawaban (atau sebagian) di luar layar, geser halaman secukupnya supaya kerang
// dan jawabannya kelihatan bareng. Kalau sudah kelihatan, diam. Tarikan beruntun tidak bikin
// halaman loncat-loncat: setelah satu geseran, tunggu dulu sebentar.
const EDGE = 12;
let lastReveal = 0;
function revealAnswer() {
  const now = performance.now();
  if (now - lastReveal < 900) return;
  const vh = window.innerHeight;
  const a = answer.getBoundingClientRect();
  if (a.top >= EDGE && a.bottom <= vh - EDGE) return;

  const c = conchStage.getBoundingClientRect();
  const top = Math.min(a.top, c.top);
  const bottom = Math.max(a.bottom, c.bottom);
  let delta;
  if (bottom - top <= vh - EDGE * 2) {
    // Muat semua: geser minimal supaya bagian bawah masuk, atau bagian atas turun ke layar.
    delta = a.bottom > vh - EDGE ? bottom - (vh - EDGE) : top - EDGE;
  } else {
    // Nggak muat: prioritaskan awal jawaban.
    delta = a.top - EDGE;
  }
  if (Math.abs(delta) < 4) return;
  lastReveal = now;
  ignoreScrollUntil = now + 1200;
  window.scrollBy({ top: delta, behavior: reduceMotion.matches ? "auto" : "smooth" });
}

/* ---------- Tali: drag, klik, keyboard ---------- */
const MAX_PULL = 130;
const TRIGGER_PULL = 40;
let dragging = false;
let startY = 0;
let pull = 0;
let suppressClick = false;

function setPull(value) {
  pull = value;
  conchStage.style.setProperty("--pull", String(value));
}

function springBack() {
  conchStage.classList.remove("yanking", "armed");
  conchStage.classList.add("springing");
  setPull(0);
}

ring.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  startY = e.clientY;
  conchStage.classList.remove("springing", "yanking");
  ring.setPointerCapture(e.pointerId);
});

ring.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dy = Math.max(0, Math.min(MAX_PULL, e.clientY - startY));
  // makin jauh makin berat, biar kerasa kayak tali
  setPull(Math.round(dy * (1 - dy / (MAX_PULL * 2.4))));
  conchStage.classList.toggle("armed", pull >= TRIGGER_PULL);
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  if (pull >= TRIGGER_PULL) {
    speak();
    suppressClick = true;
  } else if (pull > 6) {
    suppressClick = true; // ditarik dikit, dilepas: tidak dihitung
  }
  springBack();
}
ring.addEventListener("pointerup", endDrag);
ring.addEventListener("pointercancel", endDrag);

// Klik biasa, Enter, atau Spasi: tarik otomatis.
ring.addEventListener("click", (e) => {
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const viaKeyboard = e.detail === 0; // Enter/Spasi memicu click tanpa hitungan klik mouse
  if (reduceMotion.matches) {
    speak(viaKeyboard);
    return;
  }
  conchStage.classList.remove("springing");
  conchStage.classList.add("yanking");
  setPull(90);
  setTimeout(() => {
    speak(viaKeyboard);
    springBack();
  }, 170);
});

// "Tarik talinya lagi" di footer: benar-benar mulai lagi dari 00, lalu fokus ke ring supaya siap ditarik.
document.querySelectorAll("[data-restart]").forEach((link) => {
  link.addEventListener("click", () => {
    resetConch();
    // Sesudah lompatan ke #tanya selesai diproses browser; kalau dipanggil langsung, fokusnya ditimpa lompatan itu.
    setTimeout(() => ring.focus({ preventScroll: true }), 0);
  });
});

/* ---------- Meter nanggung ---------- */
const spectrum = document.querySelector(".spectrum");
const range = document.getElementById("specRange");
const specWord = document.getElementById("specWord");
const specNote = document.getElementById("specNote");

const ZONES = [
  { max: 15, cls: "is-bad", word: "Jelek banget. Sengaja.", note: "Orang komen “ini apaan sih”, terus nonton ulang buat mastiin. Terus kirim ke temennya." },
  { max: 30, cls: "is-bad", word: "Jelek, tapi kurang niat.", note: "Hampir. Jeleknya harus kelihatan disengaja, kalau nggak orang cuma ngira kamu nggak bisa ngedit." },
  { max: 70, cls: "", word: "Nanggung.", note: "Nggak ada yang benci, nggak ada yang ingat. Jempol penonton udah geser sebelum kamu selesai ngomong." },
  { max: 85, cls: "is-good", word: "Bagus, tapi ketuker.", note: "Rapi dan enak ditonton, tapi bisa aja ini video orang lain. Kurang satu hal yang cuma kamu punya." },
  { max: 100, cls: "is-good", word: "Bagus banget.", note: "Orang save, orang kirim ke grup, orang nunggu part 2. Dan nggak ada kreator lain yang bisa bikin versi ini." },
];

let lastZone = null;
function updateSpectrum() {
  const v = Number(range.value);
  const zone = ZONES.find((z) => v <= z.max);
  range.setAttribute("aria-valuetext", zone.word);
  if (zone === lastZone) return;
  lastZone = zone;
  spectrum.classList.remove("is-bad", "is-good");
  if (zone.cls) spectrum.classList.add(zone.cls);
  specWord.textContent = zone.word;
  specNote.textContent = zone.note;
}
range.addEventListener("input", updateSpectrum);
updateSpectrum();

/* ---------- Sudah masuk? Ganti ajakan ---------- */
async function checkSession() {
  try {
    const res = await fetch("/api/me", { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    const { user } = await res.json();
    if (!user) return;
    ctaHref = "/app";
    ctaText = "Lanjut ke studio";
    document.querySelectorAll('[data-cta="register"]').forEach((a) => {
      a.href = "/app";
      const label = a.querySelector("[data-cta-label]");
      if (label) label.textContent = "Lanjut ke studio";
    });
    document.querySelectorAll('[data-cta="login"]').forEach((a) => {
      if (a.classList.contains("ghost-btn")) {
        a.href = "/app";
        a.textContent = "Studio";
      } else {
        a.hidden = true;
      }
    });
    const greeting = document.getElementById("greeting");
    if (greeting && user?.name) greeting.textContent = `Halo lagi, ${user.name}. Kerang masih di sini.`;
    // Kalau jawaban terakhir berisi ajakan, perbarui juga link-nya.
    answerBody.querySelectorAll(".answer-verdict a").forEach((a) => {
      a.href = ctaHref;
      a.textContent = ctaText;
    });
  } catch {
    // Server tidak bisa dihubungi: biarkan ajakan default (daftar/masuk).
  }
}
checkSession();
