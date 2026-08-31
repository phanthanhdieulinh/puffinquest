"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser, fetchJournal, serializeUserPrivate, serializeUserPublic } = require("../gamestate");

const router = express.Router();
const MAX_PHOTO_CHARS = 500000;
const MAX_NAME = 24;

router.get("/me", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const journal = await fetchJournal(user.id, 120);
  res.json({ user: serializeUserPrivate(user), journal });
});

router.get("/by/:username", async (req, res) => {
  const username = String(req.params.username || "").toLowerCase();
  const { rows } = await pool.query("SELECT * FROM users WHERE username_lower = $1", [username]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "No puffineer by that name." });
  const journal = await fetchJournal(user.id, 40);
  res.json({ profile: serializeUserPublic(user, journal) });
});

router.patch("/name", requireAuth, async (req, res) => {
  const displayName = String((req.body && req.body.displayName) || "").trim().slice(0, MAX_NAME);
  if (!displayName) return res.status(400).json({ error: "Name can't be empty." });
  await pool.query("UPDATE users SET display_name = $2 WHERE id = $1", [req.user.id, displayName]);
  res.json({ ok: true, displayName });
});

router.patch("/social", requireAuth, async (req, res) => {
  const social = (req.body && req.body.socialLinks) || {};
  const facebook = !!social.facebook;
  const instagram = !!social.instagram;
  const linkedin = !!social.linkedin;
  await pool.query(
    "UPDATE users SET social_facebook = $2, social_instagram = $3, social_linkedin = $4 WHERE id = $1",
    [req.user.id, facebook, instagram, linkedin]
  );
  res.json({ ok: true, socialFlags: { facebook, instagram, linkedin } });
});

router.patch("/photo", requireAuth, async (req, res) => {
  const body = req.body || {};
  const updates = [];
  const values = [req.user.id];

  if ("avatarPhoto" in body) {
    const v = body.avatarPhoto;
    if (v !== null && (typeof v !== "string" || v.length > MAX_PHOTO_CHARS || !v.startsWith("data:image/"))) {
      return res.status(400).json({ error: "That profile photo is too large or not an image." });
    }
    values.push(v);
    updates.push(`avatar_photo = $${values.length}`);
  }
  if ("coverPhoto" in body) {
    const v = body.coverPhoto;
    if (v !== null && (typeof v !== "string" || v.length > MAX_PHOTO_CHARS || !v.startsWith("data:image/"))) {
      return res.status(400).json({ error: "That cover photo is too large or not an image." });
    }
    values.push(v);
    updates.push(`cover_photo = $${values.length}`);
  }
  if (!updates.length) return res.status(400).json({ error: "Nothing to update." });

  await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $1`, values);
  res.json({ ok: true });
});

module.exports = router;
