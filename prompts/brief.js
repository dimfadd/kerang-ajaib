// Mengubah isian form menjadi brief teks + gambar untuk pesan user pertama.

const BOLDNESS_LABEL = {
  aman: "Segar tapi aman",
  nyeleneh: "Nyeleneh",
  ekstrem: "Ekstrem (bagus banget atau jelek banget yang disengaja)",
};

const IMAGE_LABEL = {
  produk: "Foto produk",
  tempat: "Foto tempat / lokasi",
  kreator: "Foto kreator",
  properti: "Foto properti / barang",
  referensi: "Referensi visual",
  lainnya: "Foto lainnya",
};

function line(label, value) {
  if (value === undefined || value === null) return null;
  const text = Array.isArray(value) ? value.join(", ") : String(value).trim();
  return text ? `- ${label}: ${text}` : null;
}

function section(title, lines) {
  const body = lines.filter(Boolean);
  return body.length ? `## ${title}\n${body.join("\n")}` : null;
}

function formatNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("id-ID") : null;
}

function viewsRatio(b) {
  const followers = Number(b.followers);
  const views = Number(b.avgViews);
  if (!(followers > 0 && views > 0)) return null;
  const pct = (views / followers) * 100;
  return `${pct.toFixed(1).replace(".", ",")}% dari jumlah followers`;
}

export function buildBriefText(b) {
  const hasProduct = b.hasProduct && (b.productName || b.productUsp);

  const parts = [
    "# BRIEF KONTEN",
    section("Siapa kreatornya", [
      line("Nama / panggilan", b.creatorName),
      line("Akun", b.handle),
      line("Platform utama", b.platforms),
      line("Status", b.creatorType),
      line("Cerita tentang dia", b.whoIs),
      line("Niche", b.niche),
      line("Followers", formatNumber(b.followers)),
      line("Rata-rata views per video", formatNumber(b.avgViews)),
      line("Rasio rata-rata views", viewsRatio(b)),
      line("Catatan engagement", b.engagementNotes),
    ]),
    section("Persona & ciri khas", [
      line("Kepribadian & cara membawakan", b.personality),
      line("Gaya bahasa / logat", b.speakingStyle),
      line("Catchphrase khas", splitLines(b.catchphrases)),
      line("Kebiasaan / gestur berpola", b.signatureActions),
      line("Cara tampil di kamera", b.onCamera),
      line("Konten yang pernah ramai & dugaan penyebabnya", b.pastHits),
      line("Batasan (tidak mau dilakukan)", b.boundaries),
    ]),
    section("Konten yang mau dibuat", [
      line("Tujuan utama", b.goal),
      line("Topik / bahasan", b.topic),
      line("Target penonton", b.audience),
      line("Platform target video ini", b.targetPlatform),
      line("Durasi", b.duration ? `${b.duration} detik` : null),
    ]),
    hasProduct
      ? section("Produk keranjang kuning", [
          line("Nama produk", b.productName),
          line("Harga", b.productPrice || "[belum diisi, jangan mengarang harga]"),
          line("Keunggulan / USP", b.productUsp),
          line("Catatan brand (wajib, larangan, klaim yang boleh)", b.productNotes),
        ])
      : null,
    section("Bahan tambahan", [
      line("Isu / tren yang sedang ramai menurut kreator", b.trendNotes),
      line(
        "Riset tren otomatis",
        b.researchTrends
          ? "AKTIF. Gunakan web search untuk mencari tren, isu, atau format yang sedang ramai di Indonesia saat ini dan relevan dengan brief."
          : "tidak aktif, jangan cari di web",
      ),
      line("Alat & tim yang tersedia", b.equipment),
      line("Lokasi yang bisa dipakai", b.location),
      line("Konten referensi yang disukai", b.references),
    ]),
    section("Arahan", [
      line("Level keberanian", BOLDNESS_LABEL[b.boldness] || BOLDNESS_LABEL.nyeleneh),
      line("Jumlah ide yang diminta", b.ideaCount || 3),
      line("Catatan tambahan", b.extraNotes),
    ]),
  ];

  return parts.filter(Boolean).join("\n\n");
}

function splitLines(text) {
  if (!text) return null;
  const items = String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items.map((s) => `"${s}"`) : null;
}

// Gambar ditaruh sebelum teks brief, masing-masing diberi label supaya
// director tahu foto mana yang produk, mana yang lokasi.
export function buildUserContent(brief, images = [], memory = null) {
  const content = [];
  const today = new Date().toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  });
  content.push({ type: "text", text: `Tanggal hari ini: ${today}` });
  if (memory) content.push({ type: "text", text: memory });
  images.forEach((img, i) => {
    const label = IMAGE_LABEL[img.label] || IMAGE_LABEL.lainnya;
    const note = img.note ? ` (${img.note})` : "";
    content.push({ type: "text", text: `Lampiran ${i + 1}: ${label}${note}` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data },
    });
  });
  content.push({ type: "text", text: buildBriefText(brief) });
  return content;
}
