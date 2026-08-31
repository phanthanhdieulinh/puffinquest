"use strict";

const jwt = require("jsonwebtoken");
const { pool } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const TOKEN_TTL = "180d";

function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function getTokenFromReq(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  if (req.cookies && req.cookies.pq_token) return req.cookies.pq_token;
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromReq(req);
    if (!token) return res.status(401).json({ error: "Not signed in." });
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [payload.uid]);
    if (!rows[0]) return res.status(401).json({ error: "Not signed in." });
    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired, please sign in again." });
  }
}

module.exports = { signToken, requireAuth };
