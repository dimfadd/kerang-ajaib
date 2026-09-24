// Toggle tema bersama untuk semua halaman. Pilihan disimpan di "kerang-theme".
// Tema awal sudah dipasang oleh skrip kecil di <head> supaya tidak berkedip.
//
// Markup di tiap halaman (sama persis):
//   <button type="button" class="theme-toggle" id="themeToggle" aria-pressed="false">
//     <span class="theme-toggle-label">Mode gelap</span>
//   </button>
// Bagian visual (rel laut + matahari/bulan) dipasang dari sini, jadi cuma ada satu sumber.

const STORAGE_KEY = "kerang-theme";
const osDark = matchMedia("(prefers-color-scheme: dark)");

export function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set === "dark" || set === "light") return set;
  return osDark.matches ? "dark" : "light";
}

const TRACK = `
<span class="theme-toggle-track" aria-hidden="true">
  <svg class="theme-toggle-sea" viewBox="0 0 56 10" preserveAspectRatio="none" focusable="false">
    <path d="M0 6 Q7 1 14 6 T28 6 T42 6 T56 6"/>
  </svg>
  <span class="theme-toggle-thumb">
    <svg class="theme-toggle-sun" viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="4.2"/>
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>
    </svg>
    <svg class="theme-toggle-moon" viewBox="0 0 24 24" focusable="false">
      <path d="M15.8 3.6a8.6 8.6 0 1 0 4.6 12.9 7 7 0 0 1-4.6-12.9Z"/>
    </svg>
  </span>
</span>`;

export function initThemeToggle(button) {
  if (!button) return;
  if (!button.querySelector(".theme-toggle-track")) {
    button.insertAdjacentHTML("afterbegin", TRACK);
  }
  // Nama aksesibel tetap "Mode gelap"; statusnya dibawa aria-pressed.
  const sync = () => {
    button.setAttribute("aria-pressed", String(currentTheme() === "dark"));
  };
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    sync();
  });
  // Belum pernah milih? Ikut tema OS, termasuk kalau OS ganti tema di tengah jalan.
  osDark.addEventListener("change", sync);
  sync();
  // Transisi baru dinyalakan setelah status awal terpasang, supaya jempolnya nggak meluncur saat halaman dibuka.
  requestAnimationFrame(() => button.classList.add("is-ready"));
}
