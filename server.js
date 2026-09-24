import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { DIRECTOR_SYSTEM_PROMPT } from "./prompts/director.js";
import { buildUserContent } from "./prompts/brief.js";
import { all, one, run, nowIso, parseJson, storage } from "./lib/db.js";
import {
  hashPassword, verifyPassword, createSession, destroySession, currentUser, requireUser,
} from "./lib/auth.js";
import { buildCreatorMemory, ideaTitles } from "./lib/memory.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.KERANG_MODEL || "claude-opus-5";
const EFFORT = process.env.KERANG_EFFORT || "high";
const MAX_CONTINUATIONS = 5;
const MOCK = process.env.KERANG_MOCK === "1";
const AI_READY = MOCK || Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const STATUSES = ["belum direkam", "sudah direkam", "sudah tayang", "batal"];

let client = null;
const anthropic = () => (client ??= new Anthropic());

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "40mb" }));
// Lokal: Express yang melayani public/. Di Vercel: CDN yang melayani public/ (express.static diabaikan).
app.use(express.static(path.join(here, "public"), { extensions: ["html"] }));

// Pembungkus supaya error di handler async sampai ke error handler Express.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ================= Konfigurasi ================= */

app.get("/api/config", (req, res) => {
  res.json({ ai: { ready: AI_READY, mock: MOCK }, storage });
});

/* ================= Akun ================= */

const loginAttempts = new Map(); // key -> { count, resetAt }
function tooManyAttempts(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/auth/register", h(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!name) return res.status(400).json({ error: "Nama belum diisi." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Format email tidak valid." });
  if (password.length < 8) return res.status(400).json({ error: "Password minimal 8 karakter." });
  if (await one("SELECT 1 AS x FROM users WHERE email = ?", [email])) {
    return res.status(409).json({ error: "Email ini sudah terdaftar. Coba masuk." });
  }
  const hash = await hashPassword(password);
  const { rows } = await run(
    "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    [email, name, hash, nowIso()],
  );
  const id = Number(rows[0].id);
  await createSession(res, id);
  res.status(201).json({ user: { id, email, name } });
}));

app.post("/api/auth/login", h(async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (tooManyAttempts(`${req.ip}|${email}`)) {
    return res.status(429).json({ error: "Terlalu banyak percobaan. Tunggu 15 menit." });
  }
  const user = await one("SELECT id, email, name, password_hash FROM users WHERE email = ?", [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: "Email atau password salah." });
  }
  await createSession(res, user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

app.post("/api/auth/logout", h(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

app.get("/api/me", h(async (req, res) => {
  // Selalu 200 supaya halaman publik bisa cek status login tanpa error di console.
  const user = await currentUser(req);
  if (!user) return res.json({ user: null });
  const p = await one("SELECT COUNT(*) AS n FROM personas WHERE user_id = ?", [user.id]);
  const g = await one("SELECT COUNT(*) AS n FROM generations WHERE user_id = ?", [user.id]);
  res.json({ user, stats: { personas: Number(p.n), generations: Number(g.n) } });
}));

/* ================= Persona ================= */

function personaRow(row) {
  return { id: row.id, name: row.name, data: parseJson(row.data, {}), created_at: row.created_at, updated_at: row.updated_at };
}

app.get("/api/personas", requireUser, h(async (req, res) => {
  const rows = await all(
    `SELECT p.*, (SELECT COUNT(*) FROM generations g WHERE g.persona_id = p.id) AS generation_count
     FROM personas p WHERE user_id = ? ORDER BY updated_at DESC`,
    [req.user.id],
  );
  res.json({ personas: rows.map((r) => ({ ...personaRow(r), generation_count: Number(r.generation_count) })) });
}));

app.post("/api/personas", requireUser, h(async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "Nama persona belum diisi." });
  const now = nowIso();
  const { rows } = await run(
    "INSERT INTO personas (user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *",
    [req.user.id, name, JSON.stringify(req.body?.data ?? {}), now, now],
  );
  res.status(201).json({ persona: personaRow(rows[0]) });
}));

app.put("/api/personas/:id", requireUser, h(async (req, res) => {
  const row = await one("SELECT * FROM personas WHERE id = ? AND user_id = ?", [Number(req.params.id), req.user.id]);
  if (!row) return res.status(404).json({ error: "Persona tidak ditemukan." });
  const name = String(req.body?.name ?? row.name).trim() || row.name;
  const data = req.body?.data ? JSON.stringify(req.body.data) : row.data;
  const { rows } = await run(
    "UPDATE personas SET name = ?, data = ?, updated_at = ? WHERE id = ? RETURNING *",
    [name, data, nowIso(), row.id],
  );
  res.json({ persona: personaRow(rows[0]) });
}));

app.delete("/api/personas/:id", requireUser, h(async (req, res) => {
  const { changes } = await run("DELETE FROM personas WHERE id = ? AND user_id = ?", [Number(req.params.id), req.user.id]);
  if (!changes) return res.status(404).json({ error: "Persona tidak ditemukan." });
  res.json({ ok: true });
}));

/* ================= Riwayat konten ================= */

function generationSummary(r) {
  const turns = parseJson(r.turns, []);
  return {
    id: r.id,
    persona_id: r.persona_id,
    persona_name: r.persona_name ?? null,
    title: r.title,
    ideas: ideaTitles(turns[0]?.markdown ?? ""),
    revisions: Math.max(0, turns.length - 1),
    status: r.status,
    result_views: r.result_views,
    result_notes: r.result_notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

app.get("/api/generations", requireUser, h(async (req, res) => {
  const personaId = req.query.persona_id ? Number(req.query.persona_id) : null;
  const params = [req.user.id];
  let filter = "";
  if (personaId) {
    filter = "AND g.persona_id = ?";
    params.push(personaId);
  }
  const rows = await all(
    `SELECT g.id, g.persona_id, g.title, g.turns, g.status, g.result_views, g.result_notes,
            g.created_at, g.updated_at, p.name AS persona_name
     FROM generations g LEFT JOIN personas p ON p.id = g.persona_id
     WHERE g.user_id = ? ${filter}
     ORDER BY g.created_at DESC LIMIT 100`,
    params,
  );
  res.json({ generations: rows.map(generationSummary) });
}));

app.get("/api/generations/:id", requireUser, h(async (req, res) => {
  const r = await one(
    `SELECT g.*, p.name AS persona_name FROM generations g
     LEFT JOIN personas p ON p.id = g.persona_id
     WHERE g.id = ? AND g.user_id = ?`,
    [Number(req.params.id), req.user.id],
  );
  if (!r) return res.status(404).json({ error: "Riwayat tidak ditemukan." });
  res.json({
    generation: {
      ...generationSummary(r),
      brief: parseJson(r.brief, {}),
      turns: parseJson(r.turns, []),
      use_search: Boolean(r.use_search),
    },
  });
}));

app.patch("/api/generations/:id", requireUser, h(async (req, res) => {
  const r = await one("SELECT * FROM generations WHERE id = ? AND user_id = ?", [Number(req.params.id), req.user.id]);
  if (!r) return res.status(404).json({ error: "Riwayat tidak ditemukan." });
  const body = req.body ?? {};
  const status = body.status !== undefined ? String(body.status) : r.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: "Status tidak dikenal." });
  let views = r.result_views;
  if (body.result_views !== undefined) {
    views = body.result_views === null || body.result_views === "" ? null : Math.max(0, Math.round(Number(body.result_views)));
    if (Number.isNaN(views)) return res.status(400).json({ error: "Views harus angka." });
  }
  const notes = body.result_notes !== undefined ? String(body.result_notes).trim() || null : r.result_notes;
  await run(
    "UPDATE generations SET status = ?, result_views = ?, result_notes = ?, updated_at = ? WHERE id = ?",
    [status, views, notes, nowIso(), r.id],
  );
  res.json({ ok: true });
}));

app.delete("/api/generations/:id", requireUser, h(async (req, res) => {
  const { changes } = await run("DELETE FROM generations WHERE id = ? AND user_id = ?", [Number(req.params.id), req.user.id]);
  if (!changes) return res.status(404).json({ error: "Riwayat tidak ditemukan." });
  res.json({ ok: true });
}));

/* ================= Generate ================= */

const WEB_SEARCH_TOOL = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
  user_location: { type: "approximate", country: "ID", timezone: "Asia/Jakarta" },
};

// Brief baru: { brief, images, personaId }
// Revisi:     { generationId, followUp }
app.post("/api/generate", requireUser, h(async (req, res) => {
  if (!AI_READY) {
    return res.status(503).json({
      code: "AI_NOT_CONFIGURED",
      error:
        "Kerang belum disambungkan ke AI. Pemilik aplikasi perlu mengisi ANTHROPIC_API_KEY di environment variables, lalu deploy ulang.",
    });
  }

  const userId = req.user.id;
  const { brief, images, personaId, generationId, followUp } = req.body ?? {};

  let messages;
  let useSearch;
  let genRow = null;

  if (generationId && followUp) {
    genRow = await one("SELECT * FROM generations WHERE id = ? AND user_id = ?", [Number(generationId), userId]);
    if (!genRow) return res.status(404).json({ error: "Riwayat tidak ditemukan." });
    messages = [...parseJson(genRow.history, []), { role: "user", content: String(followUp) }];
    useSearch = Boolean(genRow.use_search);
  } else if (brief?.topic) {
    const pid = personaId ? Number(personaId) : null;
    if (pid && !(await one("SELECT 1 AS x FROM personas WHERE id = ? AND user_id = ?", [pid, userId]))) {
      return res.status(404).json({ error: "Persona tidak ditemukan." });
    }
    useSearch = Boolean(brief.researchTrends);
    const memory = await buildCreatorMemory(userId, pid);
    messages = [{ role: "user", content: buildUserContent(brief, images, memory) }];
    const title = String(brief.topic).trim().replace(/\s+/g, " ").slice(0, 80);
    const now = nowIso();
    const { rows } = await run(
      `INSERT INTO generations (user_id, persona_id, title, brief, use_search, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      [userId, pid, title, JSON.stringify(brief), useSearch ? 1 : 0, now, now],
    );
    genRow = rows[0];
  } else {
    return res.status(400).json({ error: "Topik konten belum diisi." });
  }

  const isNew = !followUp;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("saved", { generationId: genRow.id });

  let aborted = false;
  let currentStream = null;
  res.on("close", () => {
    aborted = true;
    currentStream?.abort();
  });

  let markdown = "";
  let finished = false;

  try {
    if (MOCK) {
      markdown = await streamMock(send, followUp, () => aborted);
      messages.push({ role: "assistant", content: [{ type: "text", text: markdown }] });
    }
    for (let turn = 0; !MOCK && turn <= MAX_CONTINUATIONS && !aborted; turn++) {
      const stream = anthropic().beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        system: [{ type: "text", text: DIRECTOR_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        thinking: { type: "adaptive", display: "summarized" },
        output_config: { effort: EFFORT },
        tools: useSearch ? [WEB_SEARCH_TOOL] : undefined,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        messages,
      });
      currentStream = stream;

      const toolInputs = new Map();
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "server_tool_use") toolInputs.set(event.index, "");
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            const titles = block.content.slice(0, 4).map((r) => r.title).filter(Boolean);
            send("status", { kind: "search_result", titles });
          }
        } else if (event.type === "content_block_delta") {
          const d = event.delta;
          if (d.type === "text_delta") {
            markdown += d.text;
            send("text", { text: d.text });
          } else if (d.type === "thinking_delta") send("thinking", { text: d.thinking });
          else if (d.type === "input_json_delta" && toolInputs.has(event.index)) {
            toolInputs.set(event.index, toolInputs.get(event.index) + d.partial_json);
          }
        } else if (event.type === "content_block_stop" && toolInputs.has(event.index)) {
          let query = "";
          try {
            query = JSON.parse(toolInputs.get(event.index) || "{}").query ?? "";
          } catch {
            // input tidak lengkap, status tetap dikirim tanpa query
          }
          send("status", { kind: "search", query });
          toolInputs.delete(event.index);
        }
      }

      const message = await stream.finalMessage();
      messages.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "pause_turn") continue;
      if (message.stop_reason === "refusal") {
        send("error", {
          message: "Kerang Ajaib menolak brief ini karena alasan keamanan. Coba ubah topik atau bagian brief yang sensitif.",
        });
      } else if (message.stop_reason === "max_tokens") {
        send("status", { kind: "truncated" });
      }
      break;
    }
    finished = !aborted;
  } catch (err) {
    if (!aborted) {
      console.error(err);
      send("error", { message: describeError(err) });
    }
  }

  try {
    if (markdown && finished) {
      const turns = parseJson(genRow.turns, []);
      turns.push({ request: followUp ? String(followUp) : null, markdown, created_at: nowIso() });
      await run("UPDATE generations SET turns = ?, history = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(turns), JSON.stringify(messages), nowIso(), genRow.id,
      ]);
      if (!aborted) send("done", { generationId: genRow.id });
    } else if (isNew) {
      // Tidak ada hasil yang layak disimpan, jangan tinggalkan riwayat kosong.
      await run("DELETE FROM generations WHERE id = ?", [genRow.id]);
    }
  } catch (err) {
    console.error(err);
    if (!aborted) send("error", { message: "Hasil jadi, tapi gagal disimpan ke database. Salin dulu hasilnya." });
  }
  res.end();
}));

// Mode demo: respons contoh tanpa memanggil API, untuk menguji tampilan.
async function streamMock(send, followUp, isAborted) {
  const md = followUp
    ? `Oke, ini revisinya sesuai permintaan: "${followUp}".\n\n## Ide 1: Versi revisi (DEMO)\n**Konsep singkat:** contoh revisi dari mode demo.\n`
    : [
        "## Bedah Persona",
        "- (DEMO) Ini respons contoh dari mode KERANG_MOCK, bukan hasil AI.",
        "",
        "## Ide 1: Contoh Ide Demo",
        "**Konsep singkat:** contoh.",
        "",
        "| Detik | Visual / Shot | Ucapan / VO | Teks layar | Suara / SFX |",
        "|---|---|---|---|---|",
        '| 0-3 | Close up | "ganjel dulu, boss" | LEVEL 10?? | ding |',
        "",
        "## Rekomendasi Director",
        "Rekam Ide 1 duluan.",
      ].join("\n");
  send("thinking", { text: "(demo) bedah persona..." });
  for (const chunk of md.match(/[\s\S]{1,24}/g)) {
    if (isAborted()) break;
    send("text", { text: chunk });
    await new Promise((r) => setTimeout(r, 25));
  }
  return md;
}

function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "API key tidak valid. Cek ANTHROPIC_API_KEY di environment variables.";
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "API key ini tidak punya akses ke model atau fitur yang dipakai.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.";
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `Permintaan ditolak API: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "Tidak bisa terhubung ke API. Cek koneksi internet.";
  }
  if (err instanceof Anthropic.APIError) {
    return `Error dari API (${err.status}): ${err.message}`;
  }
  return `Terjadi kesalahan: ${err?.message ?? err}`;
}

// Error yang lolos dari handler: balas JSON, jangan halaman HTML bawaan Express.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return res.end();
  const dbDown = /ECONNREFUSED|ENOTFOUND|password authentication|database/i.test(String(err?.message));
  res.status(500).json({
    error: dbDown
      ? "Database belum tersambung. Cek DATABASE_URL di environment variables."
      : "Ada yang salah di server Kerang. Coba lagi sebentar.",
  });
});

// Di Vercel, app di-export dan dijalankan sebagai Vercel Function. Lokal: listen biasa.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const mode = MOCK ? "MODE DEMO, tanpa AI" : AI_READY ? `model: ${MODEL}` : "API key belum diisi";
    console.log(`Kerang Ajaib siap di http://localhost:${PORT} (${mode}, database: ${storage})`);
  });
}

export default app;
