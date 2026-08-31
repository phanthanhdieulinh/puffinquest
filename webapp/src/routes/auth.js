"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { signToken, requireAuth } = require("../auth");
const { serializeUserPrivate, refreshUser } = require("../gamestate");
const content = require("../content");

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

function setTokenCookie(res, token) {
  res.cookie("pq_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 180
  });
}

router.post("/register", async (req, res) => {
  const username = String((req.body && req.body.username) || "").trim();
  const password = String((req.body && req.body.password) || "");

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: "Username must be 3-20 characters: letters, numbers, _ or -." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const usernameLower = username.toLowerCase();
  const existing = await pool.query("SELECT id FROM users WHERE username_lower = $1", [usernameLower]);
  if (existing.rows[0]) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  const social = (req.body && req.body.socialLinks) || {};
  const socialFacebook = !!social.facebook;
  const socialInstagram = !!social.instagram;
  const socialLinkedin = !!social.linkedin;

  const hash = await bcrypt.hash(password, 10);
  const today = content.todayStr();
  const dailyIds = content.dailyQuestIdsFor(today);

  const { rows } = await pool.query(
    `INSERT INTO users (username, username_lower, password_hash, display_name, daily_date, daily_quest_ids, cove_date,
       social_facebook, social_instagram, social_linkedin)
     VALUES ($1, $2, $3, $1, $4, $5, $4, $6, $7, $8) RETURNING *`,
    [username, usernameLower, hash, today, dailyIds, socialFacebook, socialInstagram, socialLinkedin]
  );
  const user = rows[0];
  const token = signToken(user.id);
  setTokenCookie(res, token);
  res.status(201).json({ token, user: serializeUserPrivate(user) });
});

router.post("/login", async (req, res) => {
  const username = String((req.body && req.body.username) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");

  const { rows } = await pool.query("SELECT * FROM users WHERE username_lower = $1", [username]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Incorrect username or password." });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Incorrect username or password." });

  const fresh = await refreshUser(user);
  const token = signToken(fresh.id);
  setTokenCookie(res, token);
  res.json({ token, user: serializeUserPrivate(fresh) });
});

router.post("/logout", (req, res) => {
  res.clearCookie("pq_token");
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  const fresh = await refreshUser(req.user);
  res.json({ user: serializeUserPrivate(fresh) });
});

module.exports = router;
