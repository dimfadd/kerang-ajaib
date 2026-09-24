// Toggle tema bersama untuk semua halaman. Pilihan disimpan di "kerang-theme".
// Tema awal sudah dipasang oleh skrip kecil di <head> supaya tidak berkedip.

export function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initThemeToggle(button) {
  if (!button) return;
  const label = button.querySelector("[data-theme-label]") || button;
  const sync = () => {
    const dark = currentTheme() === "dark";
    label.textContent = dark ? "Mode terang" : "Mode gelap";
  };
  button.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("kerang-theme", next); } catch {}
    sync();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", sync);
  sync();
}
