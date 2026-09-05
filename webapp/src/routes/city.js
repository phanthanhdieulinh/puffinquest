"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser } = require("../gamestate");
const content = require("../content");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  res.json({
    city: user.city || null,
    catalog: content.CITY_CHALLENGES,
    doneIds: user.fun_done_ids || []
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
