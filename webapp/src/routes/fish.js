"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser } = require("../gamestate");
const content = require("../content");

const router = express.Router();
const CONSOLATION_COINS = 5;

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string" || val === "{}") return [];
  if (val.startsWith("{") && val.endsWith("}")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
}

/* ==========================================================================
   Fish Tab API (Central Puffin Mascot, Growth, Feeding, and Wardrobe Dress-Up)
   NOTE: Badges and titles are completely removed from Fish Tab per user request.
   ========================================================================== */
router.get("/", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const { rows } = await pool.query(
    "SELECT icon, label, detail, rarity, created_at FROM catch_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [user.id]
  );

  const growthPoints = user.puffin_growth || 0;
  const growthTier = content.getPuffinGrowthTier(growthPoints);

  res.json({
    puffinGrowth: growthPoints,
    puffinGrowthTier: growthTier,
    puffinItems: toArray(user.puffin_items),
    equippedHat: user.equipped_hat || null,
    equippedClothes: user.equipped_clothes || null,
    equippedShoes: user.equipped_shoes || null,
    wardrobeCatalog: content.PUFFIN_WARDROBE_ITEMS,
    growthLevels: content.PUFFIN_GROWTH_LEVELS,
    cost: content.FISH_COST,
    balance: user.balance,
    catchLog: rows.map((r) => ({ icon: r.icon, label: r.label, detail: r.detail, rarity: r.rarity }))
  });
});

router.post("/cast", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  if (user.balance < content.FISH_COST) {
    return res.status(400).json({ error: `Not enough Puffins to cast. Costs ${content.FISH_COST} Puffins.` });
  }

  const loot = content.pickWeightedLoot();
  let balanceDelta = -content.FISH_COST;
  let growthDelta = 0;
  let detail = "";
  let items = toArray(user.puffin_items);
  let equippedHat = user.equipped_hat || null;
  let equippedClothes = user.equipped_clothes || null;
  let equippedShoes = user.equipped_shoes || null;

  if (loot.type === "fish") {
    // Fish feeds the puffin: awards feed points + coins
    const feed = loot.feedPoints || 1;
    growthDelta = feed;
    const coins = (loot.min || 0) + Math.floor(Math.random() * ((loot.max || 0) - (loot.min || 0) + 1));
    balanceDelta += coins;
    detail = `Fed Puffin (+${feed} Growth, +${coins} Puffins)`;
  } else if (loot.type === "wardrobe") {
    // Cute accessories for the puffin wardrobe
    if (items.includes(loot.id)) {
      balanceDelta += CONSOLATION_COINS;
      detail = `Already in wardrobe — +${CONSOLATION_COINS} Puffins`;
    } else {
      items = [...items, loot.id];
      detail = `New Wardrobe Unlock! (${loot.category})`;
      // Auto-equip if slot is empty
      if (loot.category === "hat" && !equippedHat) equippedHat = loot.id;
      if (loot.category === "clothes" && !equippedClothes) equippedClothes = loot.id;
      if (loot.category === "shoes" && !equippedShoes) equippedShoes = loot.id;
    }
  } else if (loot.type === "streak-freeze") {
    // Streak Freeze: protects your streak if you miss 1 day
    detail = "Streak Freeze! Protects your streak for 1 missed day";
  } else if (loot.type === "coins" || loot.type === "jackpot") {
    const amount = (loot.min || 10) + Math.floor(Math.random() * ((loot.max || 25) - (loot.min || 10) + 1));
    balanceDelta += amount;
    detail = `+${amount} Puffins!`;
  }

  const streakFreezeDelta = loot.type === "streak-freeze" ? 1 : 0;

  const { rows } = await pool.query(
    `UPDATE users
     SET balance = balance + $2,
         puffin_growth = puffin_growth + $3,
         puffin_items = $4,
         equipped_hat = $5,
         equipped_clothes = $6,
         equipped_shoes = $7,
         streak_freezes = streak_freezes + $8
     WHERE id = $1
     RETURNING *`,
    [user.id, balanceDelta, growthDelta, items, equippedHat, equippedClothes, equippedShoes, streakFreezeDelta]
  );

  const updatedUser = rows[0];

  await pool.query(
    "INSERT INTO catch_log (user_id, icon, label, detail, rarity) VALUES ($1, $2, $3, $4, $5)",
    [user.id, loot.icon, loot.label, detail, loot.rarity]
  );

  const growthTier = content.getPuffinGrowthTier(updatedUser.puffin_growth || 0);

  res.json({
    catch: {
      id: loot.id,
      icon: loot.icon,
      label: loot.label,
      detail,
      rarity: loot.rarity,
      type: loot.type,
      category: loot.category || null,
      feedPoints: loot.feedPoints || 0
    },
    balance: updatedUser.balance,
    puffinGrowth: updatedUser.puffin_growth,
    puffinGrowthTier: growthTier,
    puffinItems: toArray(updatedUser.puffin_items),
    equippedHat: updatedUser.equipped_hat,
    equippedClothes: updatedUser.equipped_clothes,
    equippedShoes: updatedUser.equipped_shoes,
    streakFreezes: updatedUser.streak_freezes || 0
  });
});

router.post("/wear", requireAuth, async (req, res) => {
  const category = String((req.body && req.body.category) || "").toLowerCase();
  const itemId = req.body && req.body.itemId ? String(req.body.itemId) : null;
  const user = await refreshUser(req.user);
  const items = toArray(user.puffin_items);

  if (!["hat", "clothes", "shoes"].includes(category)) {
    return res.status(400).json({ error: "Invalid accessory category." });
  }

  if (itemId) {
    if (!items.includes(itemId)) {
      return res.status(400).json({ error: "You haven't unlocked this item yet." });
    }
    const def = content.PUFFIN_WARDROBE_ITEMS[itemId];
    if (!def || def.category !== category) {
      return res.status(400).json({ error: "Item does not match category." });
    }
  }

  const col = category === "hat" ? "equipped_hat" : category === "clothes" ? "equipped_clothes" : "equipped_shoes";
  const { rows } = await pool.query(
    `UPDATE users SET ${col} = $2 WHERE id = $1 RETURNING equipped_hat, equipped_clothes, equipped_shoes`,
    [user.id, itemId]
  );

  res.json({
    ok: true,
    equippedHat: rows[0].equipped_hat,
    equippedClothes: rows[0].equipped_clothes,
    equippedShoes: rows[0].equipped_shoes
  });
});

// Retained for backwards compatibility if equipped from profile
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
