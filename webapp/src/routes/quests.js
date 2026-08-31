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
      approvalsNeeded: content.REVIEW_APPROVALS_NEEDED,
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

  const isDaily = user.daily_quest_ids.includes(questId);
  const isFun = content.FUN_POOL.some((q) => q.id === questId);
  if (!isDaily && !isFun) {
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
    return res.status(409).json({ error: "That quest is already waiting for review." });
  }

  const bonus = content.questBonus(!!thumb, !!caption);

  if (isDaily) {
    // Daily quests are instant — no Cove review needed at all. Insert as
    // pending then immediately finalize, reusing the same crediting logic
    // the reviewed path uses.
    const { rows } = await pool.query(
      `INSERT INTO submissions (user_id, quest_id, is_daily, title, icon, base_reward, bonus_reward, caption, thumb)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [user.id, questId, isDaily, quest.title, quest.icon, quest.reward, bonus, caption, thumb]
    );
    const submission = rows[0];
    await finalizeSubmission(submission.id);
    return res.status(201).json({
      submission: {
        id: submission.id,
        questId: submission.quest_id,
        isDaily: true,
        title: submission.title,
        icon: submission.icon,
        reward: submission.base_reward + submission.bonus_reward,
        status: "approved",
        createdAt: submission.created_at
      }
    });
  }

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
    // 2 always-on bot puffineers pre-approve every fun-quest submission so
    // it never gets stuck — only 1 real puffineer's approval finishes it.
    const botApprovals = await addBotApprovals(client, submission.id);
    submission.approvals = botApprovals;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  res.status(201).json({
    submission: {
      id: submission.id,
      questId: submission.quest_id,
      isDaily: submission.is_daily,
      title: submission.title,
      icon: submission.icon,
      reward: submission.base_reward + submission.bonus_reward,
      status: "pending",
      approvals: submission.approvals,
      approvalsNeeded: content.REVIEW_APPROVALS_NEEDED,
      createdAt: submission.created_at
    }
  });
});

module.exports = router;
