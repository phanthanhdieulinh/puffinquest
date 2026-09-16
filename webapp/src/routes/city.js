"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser } = require("../gamestate");
const content = require("../content");
const { getAiVisionStatus } = require("../ai-vision");

const router = express.Router();

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string" || val === "{}") return [];
  if (val.startsWith("{") && val.endsWith("}")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
}

router.get("/ai-status", (req, res) => {
  res.json(getAiVisionStatus());
});

router.get("/", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  let attempts = {};
  try {
    attempts = JSON.parse(user.city_attempts || "{}");
  } catch (e) {
    attempts = {};
  }
  res.json({
    city: user.city || null,
    catalog: content.CITY_CHALLENGES,
    doneIds: toArray(user.fun_done_ids),
    attempts,
    aiStatus: getAiVisionStatus()
  });
});

router.patch("/", requireAuth, async (req, res) => {
  const city = req.body && req.body.city ? String(req.body.city) : null;
  if (city && !content.ALLOWED_CITIES.includes(city)) {
    return res.status(400).json({ error: "Unknown city." });
  }
  await pool.query("UPDATE users SET city = $2 WHERE id = $1", [req.user.id, city]);
  res.json({ ok: true, city });
});

module.exports = router;
