"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser, finalizeSubmission } = require("../gamestate");
const { addBotApprovals } = require("../bots");
const content = require("../content");

const router = express.Router();

const MAX_CAPTION = 50;
const MAX_THUMB_CHARS = 400000; // ~300KB image, generous for a resized thumbnail

router.get("/", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  res.json({
    dailyQuestIds: user.daily_quest_ids,
    dailyDoneIds: user.daily_done_ids,
    funDoneIds: user.fun_done_ids
  });
});

// Lets a user swap today's 3 Daily Quests for a fresh random pick (excluding
// ones already done today). Purely a convenience reroll — no cost, no limit.
router.post("/reroll", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const available = content.DAILY_POOL.filter((q) => !user.daily_done_ids.includes(q.id));
  const shuffled = content.seededShuffle(available.length ? available : content.DAILY_POOL, Math.random);
  const newIds = shuffled.slice(0, 3).map((q) => q.id);
  await pool.query("UPDATE users SET daily_quest_ids = $2 WHERE id = $1", [user.id, newIds]);
  res.json({ dailyQuestIds: newIds });
});

router.get("/pending", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, quest_id, is_daily, title, icon, base_reward, bonus_reward, approvals, created_at
     FROM submissions WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({
    pending: rows.map((r) => ({
      id: r.id,
      questId: r.quest_id,
      isDaily: r.is_daily,
      title: r.title,
      icon: r.icon,
      reward: r.base_reward + r.bonus_reward,
      approvals: r.approvals,
      createdAt: r.created_at
    }))
  });
});

router.post("/submit", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const questId = String((req.body && req.body.questId) || "");
  const caption = String((req.body && req.body.caption) || "").trim().slice(0, MAX_CAPTION);
  const thumb = req.body && req.body.thumb ? String(req.body.thumb) : null;

  if (thumb && (thumb.length > MAX_THUMB_CHARS || !thumb.startsWith("data:image/"))) {
    return res.status(400).json({ error: "That photo is too large or not an image." });
  }

  const quest = content.findQuest(questId);
  if (!quest) return res.status(404).json({ error: "Unknown quest." });

  if (quest.requiresPhoto && !thumb) {
    return res.status(400).json({ error: "Add a photo to prove you found it!" });
  }

  const isDaily = user.daily_quest_ids.includes(questId);
  const isFun = content.FUN_POOL.some((q) => q.id === questId);
  const isCity = !!quest.cityKey;
  if (!isDaily && !isFun && !isCity) {
    return res.status(400).json({ error: "That quest isn't available right now." });
  }
  const doneIds = isDaily ? user.daily_done_ids : user.fun_done_ids;
  if (doneIds.includes(questId)) {
    return res.status(409).json({ error: "You've already completed this quest." });
  }

  const existingPending = await pool.query(
    "SELECT id FROM submissions WHERE user_id = $1 AND quest_id = $2 AND status = 'pending'",
    [user.id, questId]
  );
  if (existingPending.rows[0]) {
    return res.status(409).json({ error: "That quest is already being processed." });
  }

  const bonus = content.questBonus(!!thumb, !!caption);

  // Every quest now finalizes instantly — Daily Quests need no review at
  // all, and Fun/City Challenge quests are decided by the 2 bot puffineers
  // alone (no real-user approval required). Real users can still cheer/skip
  // a finished Fun/City submission afterward in the Networking Cove, but
  // that's a separate, purely social action (see routes/cove.js) that
  // never affects whether the quest itself was rewarded.
  const client = await pool.connect();
  let submission;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO submissions (user_id, quest_id, is_daily, title, icon, base_reward, bonus_reward, caption, thumb)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [user.id, questId, isDaily, quest.title, quest.icon, quest.reward, bonus, caption, thumb]
    );
    submission = rows[0];
    if (!isDaily) {
      // Bot comments give the journal entry some flavor reactions even
      // though they no longer gate the reward.
      await addBotApprovals(client, submission.id);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  await finalizeSubmission(submission.id);

  res.status(201).json({
    submission: {
      id: submission.id,
      questId: submission.quest_id,
      isDaily,
      title: submission.title,
      icon: submission.icon,
      reward: submission.base_reward + submission.bonus_reward,
      status: "approved",
      createdAt: submission.created_at
    }
  });
});

module.exports = router;
