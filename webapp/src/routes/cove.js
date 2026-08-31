"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser, finalizeSubmission } = require("../gamestate");
const content = require("../content");

const router = express.Router();
const MAX_COMMENT = 50;

router.get("/queue", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.quest_id, s.title, s.icon, s.caption, s.thumb, u.username, u.display_name,
       u.social_facebook, u.social_instagram, u.social_linkedin
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'pending' AND s.user_id != $1
       AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.submission_id = s.id AND r.reviewer_id = $1)
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
    approvedToday: (await refreshUser(req.user)).cove_approved_today
  });
});

router.post("/review", requireAuth, async (req, res) => {
  const submissionId = parseInt(req.body && req.body.submissionId, 10);
  const decision = String((req.body && req.body.decision) || "");
  const comment = String((req.body && req.body.comment) || "").trim().slice(0, MAX_COMMENT);

  if (!submissionId || !["approve", "skip"].includes(decision)) {
    return res.status(400).json({ error: "Invalid review." });
  }

  const subRes = await pool.query("SELECT * FROM submissions WHERE id = $1 AND status = 'pending'", [submissionId]);
  const submission = subRes.rows[0];
  if (!submission) return res.status(404).json({ error: "That submission is no longer waiting for review." });
  if (submission.user_id === req.user.id) return res.status(400).json({ error: "You can't review your own quest." });

  const client = await pool.connect();
  let inserted = false;
  let newApprovals = submission.approvals;
  try {
    await client.query("BEGIN");
    const insertRes = await client.query(
      `INSERT INTO reviews (submission_id, reviewer_id, decision, comment)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [submissionId, req.user.id, decision, decision === "approve" ? comment : ""]
    );
    inserted = !!insertRes.rows[0];
    if (inserted) {
      if (decision === "approve") {
        const upd = await client.query(
          "UPDATE submissions SET approvals = approvals + 1 WHERE id = $1 RETURNING approvals",
          [submissionId]
        );
        newApprovals = upd.rows[0].approvals;
        await client.query(
          "UPDATE users SET balance = balance + $2, cove_approved_today = cove_approved_today + 1 WHERE id = $1",
          [req.user.id, content.REVIEWER_REWARD]
        );
      } else {
        await client.query("UPDATE submissions SET skips = skips + 1 WHERE id = $1", [submissionId]);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  if (!inserted) return res.status(409).json({ error: "You already reviewed this one." });

  let finalized = false;
  if (decision === "approve" && newApprovals >= content.REVIEW_APPROVALS_NEEDED) {
    const result = await finalizeSubmission(submissionId);
    finalized = !!result;
  }

  res.json({
    ok: true,
    reviewerReward: decision === "approve" ? content.REVIEWER_REWARD : 0,
    finalized
  });
});

module.exports = router;
