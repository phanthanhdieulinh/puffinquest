"use strict";

const express = require("express");
const content = require("../content");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    dailyPool: content.DAILY_POOL,
    greenPool: content.GREEN_COVE_QUESTS,
    culturePool: content.CULTURE_COVE_QUESTS,
    funPool: content.FUN_POOL,
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
    lootTable: content.LOOT_TABLE.map((l) => ({ id: l.id, label: l.label, icon: l.icon, rarity: l.rarity, type: l.type, category: l.category || null })),
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
