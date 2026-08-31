"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser } = require("../gamestate");
const content = require("../content");

const router = express.Router();
const CONSOLATION_COINS = 5;

router.get("/", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const { rows } = await pool.query(
    "SELECT icon, label, detail, rarity, created_at FROM catch_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [user.id]
  );
  res.json({
    titles: user.titles || [],
    badges: user.badges || [],
    equippedTitle: user.equipped_title,
    catchLog: rows.map((r) => ({ icon: r.icon, label: r.label, detail: r.detail, rarity: r.rarity }))
  });
});

router.post("/cast", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  if (user.balance < content.FISH_COST) {
    return res.status(400).json({ error: "Not enough Puffins to cast." });
  }

  const loot = content.pickWeightedLoot();
  let balanceDelta = -content.FISH_COST;
  let detail = "";
  let badges = user.badges || [];
  let titles = user.titles || [];

  if (loot.type === "coins" || loot.type === "jackpot") {
    const amount = loot.min + Math.floor(Math.random() * (loot.max - loot.min + 1));
    balanceDelta += amount;
    detail = "+" + amount + " Puffins";
  } else if (loot.type === "badge") {
    if (badges.includes(loot.id)) {
      balanceDelta += CONSOLATION_COINS;
      detail = "Already had it — +" + CONSOLATION_COINS + " Puffins";
    } else {
      badges = [...badges, loot.id];
      detail = "New badge!";
    }
  } else if (loot.type === "title") {
    if (titles.includes(loot.label)) {
      balanceDelta += CONSOLATION_COINS;
      detail = "Already had it — +" + CONSOLATION_COINS + " Puffins";
    } else {
      titles = [...titles, loot.label];
      detail = "New title!";
    }
  }

  const { rows } = await pool.query(
    "UPDATE users SET balance = balance + $2, badges = $3, titles = $4 WHERE id = $1 RETURNING balance",
    [user.id, balanceDelta, badges, titles]
  );
  await pool.query(
    "INSERT INTO catch_log (user_id, icon, label, detail, rarity) VALUES ($1, $2, $3, $4, $5)",
    [user.id, loot.icon, loot.label, detail, loot.rarity]
  );

  res.json({
    catch: { icon: loot.icon, label: loot.label, detail, rarity: loot.rarity, type: loot.type },
    balance: rows[0].balance
  });
});

router.post("/equip", requireAuth, async (req, res) => {
  const title = req.body && req.body.title ? String(req.body.title) : null;
  const user = await refreshUser(req.user);
  if (title && !(user.titles || []).includes(title)) {
    return res.status(400).json({ error: "You haven't earned that title yet." });
  }
  await pool.query("UPDATE users SET equipped_title = $2 WHERE id = $1", [user.id, title]);
  res.json({ ok: true, equippedTitle: title });
});

module.exports = router;
