"use strict";

const express = require("express");
const content = require("../content");

const { pool } = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
  let greenCompleted = 36;
  try {
    const greenIds = content.GREEN_COVE_QUESTS.map((q) => q.id);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS count FROM submissions WHERE quest_id = ANY($1) AND status = 'approved'`,
      [greenIds]
    );
    if (rows && rows[0] && typeof rows[0].count === "number") {
      greenCompleted = Math.max(36, 36 + rows[0].count);
    }
  } catch (e) {
    // fallback
  }

  res.json({
    dailyPool: content.DAILY_POOL,
    greenPool: content.GREEN_COVE_QUESTS,
    culturePool: content.CULTURE_COVE_QUESTS,
    funPool: content.FUN_POOL,
    greenQuestCampaign: {
      target: 500,
      completed: greenCompleted,
      trees: Math.floor(greenCompleted / 500)
    },
    fightDefs: content.FIGHT_DEFS.map((f) => ({
      key: f.key,
      label: f.label,
      name: f.name,
      desc: f.desc,
      target: f.target,
      reward: f.reward,
      badgeReward: f.badgeReward || null,
      titleReward: f.titleReward || null
    })),
    lootTable: content.LOOT_TABLE.map((l) => ({ id: l.id, label: l.label, icon: l.icon, rarity: l.rarity, type: l.type, desc: l.desc || null, category: l.category || null })),
    wardrobeItems: content.PUFFIN_WARDROBE_ITEMS,
    growthLevels: content.PUFFIN_GROWTH_LEVELS,
    fishCost: content.FISH_COST,
    photoBonus: content.PHOTO_BONUS,
    captionBonus: content.CAPTION_BONUS,
    cheerReward: content.CHEER_REWARD,
    cityChallenges: content.CITY_CHALLENGES,
    allowedCities: content.ALLOWED_CITIES
  });
});

module.exports = router;
