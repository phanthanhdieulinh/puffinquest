"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser, finalizeSubmission } = require("../gamestate");
const { addBotApprovals } = require("../bots");
const content = require("../content");
const { analyzeLandmarkImage } = require("../ai-vision");

const router = express.Router();

const MAX_CAPTION = 50;
const MAX_THUMB_CHARS = 400000; // ~300KB image, generous for a resized thumbnail

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string" || val === "{}") return [];
  if (val.startsWith("{") && val.endsWith("}")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
}

router.get("/", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const { rows: pendingRows } = await pool.query(
    "SELECT quest_id FROM submissions WHERE user_id = $1 AND status = 'pending'",
    [user.id]
  );
  res.json({
    dailyQuestIds: toArray(user.daily_quest_ids),
    dailyDoneIds: toArray(user.daily_done_ids),
    funDoneIds: toArray(user.fun_done_ids),
    covePendingIds: pendingRows.map((r) => r.quest_id)
  });
});

// Lets a user swap today's 4 Daily Quests for a fresh random pick (excluding
// ones already done today). Purely a convenience reroll — no cost, no limit.
router.post("/reroll", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const doneIds = toArray(user.daily_done_ids);
  const available = content.DAILY_POOL.filter((q) => !doneIds.includes(q.id));
  const shuffled = content.seededShuffle(available.length ? available : content.DAILY_POOL, Math.random);
  const newIds = shuffled.slice(0, 4).map((q) => q.id);
  await pool.query("UPDATE users SET daily_quest_ids = $2 WHERE id = $1", [user.id, newIds]);
  res.json({ dailyQuestIds: newIds });
});

router.get("/pending", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, quest_id, is_daily, title, icon, base_reward, bonus_reward, approvals, proof_gps, media_type, created_at
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
      proofGps: r.proof_gps,
      mediaType: r.media_type,
      createdAt: r.created_at
    }))
  });
});

router.post("/submit", requireAuth, async (req, res) => {
  const questId = String((req.body && req.body.questId) || "").trim();
  const caption = String((req.body && req.body.caption) || "").trim();
  const thumb = req.body && req.body.thumb ? String(req.body.thumb) : null;
  const proofGps = req.body && req.body.proofGps ? String(req.body.proofGps).trim() : null;
  const mediaType = req.body && req.body.mediaType === "video" ? "video" : "image";
  const postToProfile = req.body && req.body.postToProfile !== undefined ? !!req.body.postToProfile : true;

  if (thumb && (thumb.length > MAX_THUMB_CHARS || (!thumb.startsWith("data:image/") && !thumb.startsWith("data:video/")))) {
    return res.status(400).json({ error: "That file is too large or not a valid image/video." });
  }

  const quest = content.findQuest(questId);
  if (!quest) return res.status(404).json({ error: "Unknown quest." });

  const user = await refreshUser(req.user);
  const isDaily = toArray(user.daily_quest_ids).includes(questId);
  const isFun = content.FUN_POOL.some((q) => q.id === questId);
  const isGreen = content.GREEN_COVE_QUESTS.some((q) => q.id === questId);
  const isCulture = (content.CULTURE_COVE_QUESTS || []).some((q) => q.id === questId);
  const isCity = !!quest.cityKey;
  if (!isDaily && !isFun && !isGreen && !isCulture && !isCity) {
    return res.status(400).json({ error: "That quest isn't available right now." });
  }

  const doneIds = isDaily ? toArray(user.daily_done_ids) : toArray(user.fun_done_ids);
  if (isCity) {
    const cityLandmarks = (content.CITY_CHALLENGES[quest.cityKey] && content.CITY_CHALLENGES[quest.cityKey].landmarks) || [];
    const completedCityLandmarks = cityLandmarks.filter((l) => doneIds.includes(l.id));
    if (completedCityLandmarks.length >= cityLandmarks.length) {
      return res.status(400).json({ error: "You have already completed all landmarks for this city!" });
    }
  }
  if (doneIds.includes(questId)) {
    return res.status(409).json({ error: "You've already completed this quest." });
  }

  const existingPending = await pool.query(
    "SELECT id FROM submissions WHERE user_id = $1 AND quest_id = $2 AND status = 'pending'",
    [user.id, questId]
  );
  if (existingPending.rows[0]) {
    return res.status(409).json({ error: "That quest is already in Cove waiting for community approval." });
  }

  // Cove Quests (non-daily) require real-world proof: to go to the community, you must take a picture. GPS is optional.
  if (!isDaily && !isCity && !thumb) {
    return res.status(400).json({ error: "To go to the community, you must take a picture. GPS is optional." });
  }

  const bonus = content.questBonus(!!thumb, !!caption) + (proofGps ? 1 : 0);

  // RULE 1 - Today's Quest:
  // Finish each day and no one needs to check it. Instant reward!
  if (isDaily) {
    const client = await pool.connect();
    let submission;
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO submissions (user_id, quest_id, is_daily, title, icon, base_reward, bonus_reward, caption, thumb, post_to_profile, proof_gps, media_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending') RETURNING *`,
        [user.id, questId, isDaily, quest.title, quest.icon, quest.reward, bonus, caption, thumb, postToProfile, proofGps, mediaType]
      );
      submission = rows[0];
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    try {
      await finalizeSubmission(submission.id);
    } catch (e) {
      console.error("finalizeSubmission error:", e);
    }

    return res.status(201).json({
      submission: {
        id: submission.id,
        questId: submission.quest_id,
        isDaily: true,
        title: submission.title,
        icon: submission.icon,
        reward: submission.base_reward + submission.bonus_reward,
        status: "approved",
        postToProfile,
        createdAt: submission.created_at
      }
    });
  }

  // RULE 3 - City Challenge (in Fight part):
  // Automatically approved within the system when matching 2 criteria:
  // 1/ Picture fits the landmark picture using AI (~80-90%).
  // 2/ Location matches the landmark within +-10 meters (GPS is a MUST, NOT optional).
  // Maximum 3 rounds per city challenge.
  if (isCity) {
    if (!thumb) {
      return res.status(400).json({ error: "City Challenge requires a photo of the landmark for AI review!" });
    }
    if (!proofGps) {
      return res.status(400).json({ error: "For City Challenge, GPS is a must, NOT optional! Please acquire your GPS location within ±10m." });
    }

    // Check if this specific landmark has already been completed
    if (doneIds.includes(questId)) {
      return res.status(400).json({ error: "You have already found this mystery landmark!" });
    }

    // 1. Check GPS match (Criterion 2 - within +-10m)
    const playerCoords = content.parseGpsString(proofGps);
    let distanceMeters = null;
    let gpsPassed = false;
    if (playerCoords && quest.lat && quest.lng) {
      distanceMeters = content.haversineDistanceMeters(
        playerCoords.lat,
        playerCoords.lng,
        quest.lat,
        quest.lng
      );
      gpsPassed = distanceMeters <= content.CITY_GPS_TOLERANCE_METERS;
    }

    // 2. Check AI image detection (Criterion 1 - fit ~80-90%)
    const aiResult = await analyzeLandmarkImage(questId, thumb);
    const aiPassed = aiResult.passed;

    // Both criteria approved: Auto-approved immediately!
    if (gpsPassed && aiPassed) {
      const client = await pool.connect();
      let submission;
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `INSERT INTO submissions (user_id, quest_id, is_daily, title, icon, base_reward, bonus_reward, caption, thumb, post_to_profile, proof_gps, media_type, status)
           VALUES ($1, $2, false, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending') RETURNING *`,
          [user.id, questId, quest.title, quest.icon, quest.reward, bonus, caption, thumb, postToProfile, proofGps, mediaType]
        );
        submission = rows[0];
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      await finalizeSubmission(submission.id);

      return res.status(200).json({
        autoApproved: true,
        gps: {
          passed: true,
          distanceMeters,
          thresholdMeters: content.CITY_GPS_TOLERANCE_METERS,
          feedback: `Location match: ±${distanceMeters}m to ${quest.title} (within ±10m tolerance)`
        },
        ai: {
          passed: true,
          score: aiResult.score,
          threshold: aiResult.threshold,
          feedback: aiResult.feedback,
          aiModel: aiResult.aiModel,
          model: aiResult.aiModel
        },
        submission: {
          id: submission.id,
          questId: submission.quest_id,
          isDaily: false,
          isCity: true,
          title: submission.title,
          icon: submission.icon,
          reward: submission.base_reward + submission.bonus_reward,
          status: "approved",
          postToProfile,
          createdAt: submission.created_at
        }
      });
    }

    // Criteria not met -> Reject, but can be retried until finished
    return res.status(200).json({
      autoApproved: false,
      gps: {
        passed: gpsPassed,
        distanceMeters: distanceMeters !== null ? distanceMeters : "Unknown",
        thresholdMeters: content.CITY_GPS_TOLERANCE_METERS,
        feedback: gpsPassed
          ? `Location matched (within ±10m)`
          : `Location mismatch: ${distanceMeters !== null ? distanceMeters + "m away" : "invalid GPS"} (must be within ±10m)`
      },
      ai: {
        passed: aiPassed,
        score: aiResult.score,
        threshold: aiResult.threshold,
        feedback: aiResult.feedback,
        aiModel: aiResult.aiModel
      },
      error: !gpsPassed && !aiPassed
        ? "Neither GPS proximity (±10m) nor AI picture match criteria were met. Please move closer and take a clearer photo!"
        : !gpsPassed
        ? `Location not matched (distance: ${distanceMeters}m away; must be within ±10m).`
        : `AI picture detection did not match (~${aiResult.score}% fit, required 80-90%). Please capture ${quest.title} clearly!`,
      canRetry: true
    });
  }

  // RULE 2 - Cove Quest:
  // Moved to Cove for others in the community to approve or reject.
  const client = await pool.connect();
  let submission;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO submissions (user_id, quest_id, is_daily, title, icon, base_reward, bonus_reward, caption, thumb, post_to_profile, proof_gps, media_type, status, approvals)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', 1) RETURNING *`,
      [user.id, questId, isDaily, quest.title, quest.icon, quest.reward, bonus, caption, thumb, postToProfile, proofGps, mediaType]
    );
    submission = rows[0];
    // Add 1 bot pre-approval so a single community puffineer's approval in Cove completes the quest
    await addBotApprovals(client, submission.id);
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
      isDaily: false,
      title: submission.title,
      icon: submission.icon,
      reward: submission.base_reward + submission.bonus_reward,
      status: "pending",
      approvals: 1,
      approvalsNeeded: content.REVIEW_APPROVALS_NEEDED,
      postToProfile,
      createdAt: submission.created_at
    }
  });
});

module.exports = router;
