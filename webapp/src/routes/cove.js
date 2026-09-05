"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser } = require("../gamestate");
const content = require("../content");

const router = express.Router();
const MAX_COMMENT = 50;

// The Networking Cove is purely social now: Fun/City quests are decided by
// bots alone at submission time (see routes/quests.js), so cheering or
// skipping here never changes whether a quest was rewarded. Cheering just
// gives the cheerer a small bonus and leaves an optional comment on the
// submitter's journal entry.

router.get("/queue", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.quest_id, s.title, s.icon, s.caption, s.thumb, u.username, u.display_name,
       u.social_facebook, u.social_instagram, u.social_linkedin
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'approved' AND s.is_daily = false AND s.user_id != $1
       AND NOT EXISTS (SELECT 1 FROM cheers c WHERE c.submission_id = s.id AND c.cheerer_id = $1)
     ORDER BY random()
     LIMIT 10`,
    [req.user.id]
  );
  res.json({
    queue: rows.map((r) => ({
      id: r.id,
      questId: r.quest_id,
      title: r.title,
      icon: r.icon,
      caption: r.caption || "",
      thumb: r.thumb || null,
      byName: r.display_name || r.username,
      socialLinks: content.buildSocialLinks(r.username, {
        facebook: r.social_facebook,
        instagram: r.social_instagram,
        linkedin: r.social_linkedin
      })
    })),
    cheeredToday: (await refreshUser(req.user)).cove_approved_today
  });
});

// Backs the "send this quest to a friend to cheer" feature: a direct link
// to one specific finished submission, instead of the shuffled general feed.
router.get("/submission/:id", requireAuth, async (req, res) => {
  const submissionId = parseInt(req.params.id, 10);
  if (!submissionId) return res.status(400).json({ error: "Invalid link." });

  const { rows } = await pool.query(
    `SELECT s.*, u.username, u.display_name, u.social_facebook, u.social_instagram, u.social_linkedin
     FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [submissionId]
  );
  const row = rows[0];
  if (!row) return res.json({ status: "not-found" });
  if (row.user_id === req.user.id) return res.json({ status: "own" });
  if (row.status !== "approved" || row.is_daily) return res.json({ status: "closed" });

  const already = await pool.query("SELECT id FROM cheers WHERE submission_id = $1 AND cheerer_id = $2", [
    submissionId,
    req.user.id
  ]);
  if (already.rows[0]) return res.json({ status: "already-cheered" });

  res.json({
    status: "ready",
    submission: {
      id: row.id,
      questId: row.quest_id,
      title: row.title,
      icon: row.icon,
      caption: row.caption || "",
      thumb: row.thumb || null,
      byName: row.display_name || row.username,
      socialLinks: content.buildSocialLinks(row.username, {
        facebook: row.social_facebook,
        instagram: row.social_instagram,
        linkedin: row.social_linkedin
      })
    }
  });
});

router.post("/review", requireAuth, async (req, res) => {
  const submissionId = parseInt(req.body && req.body.submissionId, 10);
  const decision = String((req.body && req.body.decision) || "");
  const comment = String((req.body && req.body.comment) || "").trim().slice(0, MAX_COMMENT);

  if (!submissionId || !["cheer", "skip"].includes(decision)) {
    return res.status(400).json({ error: "Invalid action." });
  }

  const subRes = await pool.query(
    "SELECT * FROM submissions WHERE id = $1 AND status = 'approved' AND is_daily = false",
    [submissionId]
  );
  const submission = subRes.rows[0];
  if (!submission) return res.status(404).json({ error: "That quest isn't available to cheer right now." });
  if (submission.user_id === req.user.id) return res.status(400).json({ error: "You can't cheer your own quest." });

  const client = await pool.connect();
  let inserted = false;
  try {
    await client.query("BEGIN");
    const insertRes = await client.query(
      `INSERT INTO cheers (submission_id, cheerer_id, decision, comment)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [submissionId, req.user.id, decision, decision === "cheer" ? comment : ""]
    );
    inserted = !!insertRes.rows[0];
    if (inserted && decision === "cheer") {
      await client.query(
        "UPDATE users SET balance = balance + $2, cove_approved_today = cove_approved_today + 1 WHERE id = $1",
        [req.user.id, content.CHEER_REWARD]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  if (!inserted) return res.status(409).json({ error: "You already cheered this one." });

  res.json({ ok: true, cheerReward: decision === "cheer" ? content.CHEER_REWARD : 0 });
});

module.exports = router;
