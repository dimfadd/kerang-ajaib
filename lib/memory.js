import { all, one, parseJson } from "./db.js";

const MEMORY_LIMIT = 10;

export function ideaTitles(markdown) {
  return [...String(markdown).matchAll(/^##\s*Ide\s*\d+\s*[:.]\s*(.+)$/gim)].map((m) => m[1].trim());
}

// Ringkasan konten-konten sebelumnya untuk kreator yang sama. Dikirim di
// pesan user (bukan system prompt) supaya system prompt tetap ter-cache.
export async function buildCreatorMemory(userId, personaId) {
  if (!personaId) return null;
  const rows = await all(
    `SELECT title, turns, status, result_views, result_notes, created_at
     FROM generations WHERE user_id = ? AND persona_id = ?
     ORDER BY created_at DESC LIMIT ${MEMORY_LIMIT}`,
    [userId, personaId],
  );
  if (!rows.length) {
    return "# MEMORI KERANG\nIni pertama kalinya Kerang Ajaib menyusun konten untuk kreator ini.";
  }

  const { n } = await one("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND persona_id = ?", [
    userId, personaId,
  ]);

  const lines = rows.map((r) => {
    const turns = parseJson(r.turns, []);
    const ideas = ideaTitles(turns[0]?.markdown ?? "");
    const parts = [`- ${String(r.created_at).slice(0, 10)} | ${r.title}`];
    if (ideas.length) parts.push(`  Ide yang diusulkan: ${ideas.join("; ")}`);
    parts.push(`  Status: ${r.status}`);
    if (r.result_views != null) parts.push(`  Views setelah tayang: ${Number(r.result_views).toLocaleString("id-ID")}`);
    if (r.result_notes) parts.push(`  Catatan kreator: ${r.result_notes}`);
    return parts.join("\n");
  });

  return [
    "# MEMORI KERANG",
    `Kerang Ajaib sudah ${Number(n)} kali menyusun konten untuk kreator ini. ${rows.length} terakhir:`,
    lines.join("\n"),
  ].join("\n");
}
