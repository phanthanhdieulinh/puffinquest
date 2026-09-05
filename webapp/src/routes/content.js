"use strict";

const express = require("express");
const content = require("../content");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    dailyPool: content.DAILY_POOL,
    funPool: content.FUN_POOL,
    fightDefs: content.FIGHT_DEFS.map((f) => ({ key: f.key, label: f.label, name: f.name, desc: f.desc, target: f.target, reward: f.reward, titleReward: f.titleReward || null })),
    lootTable: content.LOOT_TABLE.map((l) => ({ id: l.id, label: l.label, icon: l.icon, rarity: l.rarity })),
    fishCost: content.FISH_COST,
    photoBonus: content.PHOTO_BONUS,
    captionBonus: content.CAPTION_BONUS,
    cheerReward: content.CHEER_REWARD,
    cityChallenges: content.CITY_CHALLENGES,
    allowedCities: content.ALLOWED_CITIES
  });
});

module.exports = router;
