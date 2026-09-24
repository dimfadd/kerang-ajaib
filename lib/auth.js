import crypto from "node:crypto";
import { promisify } from "node:util";
import { one, run, nowIso } from "./db.js";

const scrypt = promisify(crypto.scrypt);
const COOKIE = "kerang_sesi";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [, saltHex, keyHex] = String(stored).split("$");
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

export async function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
    token, userId, nowIso(SESSION_MS),
  ]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MS,
    path: "/",
  });
}

export async function destroySession(req, res) {
  const token = readToken(req);
  if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
  res.clearCookie(COOKIE, { path: "/" });
}

function readToken(req) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function currentUser(req) {
  const token = readToken(req);
  if (!token) return null;
  return one(
    `SELECT u.id, u.email, u.name, u.created_at FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
    [token, nowIso()],
  );
}

export async function requireUser(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: "Kamu belum masuk." });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
