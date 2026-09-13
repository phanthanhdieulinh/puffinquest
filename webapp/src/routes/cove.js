"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser, finalizeSubmission } = require("../gamestate");
const content = require("../content");

const router = express.Router();
const MAX_COMMENT = 50;

// Cove Quests require real-world proof (photo, video, GPS) and are moved to
// Cove for fellow puffineers to approve or reject. Approving authentic proof
// earns the reviewer a Puffin bonus, and completes the quest for the creator.

router.get("/queue", requireAuth, async (req, res) => {
  // Find submissions the user has already reviewed
  const { rows: reviewedRows } = await pool.query(
    "SELECT submission_id FROM reviews WHERE reviewer_id = $1",
    [req.user.id]
  ).catch(() => ({ rows: [] }));
  const reviewedIds = reviewedRows.map((r) => r.submission_id);

  const excludeClause = reviewedIds.length > 0 ? ` AND s.id NOT IN (${reviewedIds.join(",")})` : "";

  // First get pending Cove Quests waiting for community approval
  const { rows: pendingRows } = await pool.query(
    `SELECT s.id, s.quest_id, s.title, s.icon, s.caption, s.thumb, s.proof_gps, s.media_type, s.status,
       u.username, u.display_name, u.social_facebook, u.social_instagram, u.social_linkedin
     FROM submissions s
     JOIN users u ON u.id = s.user_id
     WHERE s.status = 'pending' AND s.is_daily = false AND s.user_id != $1${excludeClause}
     ORDER BY s.created_at ASC
     LIMIT 10`,
    [req.user.id]
  );

  let rows = pendingRows;
  // If there are few pending, supplement with approved submissions for community appreciation
  if (rows.length < 5) {
    const needed = 10 - rows.length;
    const existingIds = rows.map((r) => r.id);
    const allExclude = [...reviewedIds, ...existingIds];
    const excludeAllClause = allExclude.length > 0 ? ` AND s.id NOT IN (${allExclude.join(",")})` : "";
    const { rows: approvedRows } = await pool.query(
      `SELECT s.id, s.quest_id, s.title, s.icon, s.caption, s.thumb, s.proof_gps, s.media_type, s.status,
         u.username, u.display_name, u.social_facebook, u.social_instagram, u.social_linkedin
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'approved' AND s.is_daily = false AND s.user_id != $1${excludeAllClause}
       LIMIT $2`,
      [req.user.id, needed]
    ).catch(() => ({ rows: [] }));
    rows = rows.concat(approvedRows);
  }

  res.json({
    queue: rows.map((r) => ({
      id: r.id,
      questId: r.quest_id,
      title: r.title,
      icon: r.icon,
      caption: r.caption || "",
      thumb: r.thumb || null,
      proofGps: r.proof_gps || null,
      mediaType: r.media_type || "image",
      isPending: r.status === "pending",
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

// Backs the "send this quest to a friend to approve" feature
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
  if (row.is_daily) return res.json({ status: "closed" });

  const already = await pool.query(
    "SELECT id FROM reviews WHERE submission_id = $1 AND reviewer_id = $2",
    [submissionId, req.user.id]
  );
  if (already.rows[0]) return res.json({ status: "already-reviewed" });

  res.json({
    status: "ready",
    submission: {
      id: row.id,
      questId: row.quest_id,
      title: row.title,
      icon: row.icon,
      caption: row.caption || "",
      thumb: row.thumb || null,
      proofGps: row.proof_gps || null,
      mediaType: row.media_type || "image",
      isPending: row.status === "pending",
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
  let decision = String((req.body && req.body.decision) || "").toLowerCase();
  const comment = String((req.body && req.body.comment) || "").trim().slice(0, MAX_COMMENT);

  // Normalize actions: 'cheer' -> 'approve', 'skip' -> 'reject'
  if (decision === "cheer") decision = "approve";
  if (decision === "skip") decision = "reject";

  if (!submissionId || !["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "Invalid action." });
  }

  const subRes = await pool.query(
    "SELECT * FROM submissions WHERE id = $1 AND is_daily = false",
    [submissionId]
  );
  const submission = subRes.rows[0];
  if (!submission) return res.status(404).json({ error: "That quest isn't available to review right now." });
  if (submission.user_id === req.user.id) return res.status(400).json({ error: "You can't review your own quest." });

  const hasFeedback = Boolean(comment && comment.length > 0);
  const reviewerReward = (content.REVIEWER_REWARD || 1) + (hasFeedback ? (content.REVIEWER_FEEDBACK_BONUS || 1) : 0);

  const client = await pool.connect();
  let inserted = false;
  let newApprovals = submission.approvals;
  let newSkips = submission.skips;
  try {
    await client.query("BEGIN");
    const insertRes = await client.query(
      `INSERT INTO reviews (submission_id, reviewer_id, decision, comment)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [submissionId, req.user.id, decision, comment || ""]
    );
    inserted = !!insertRes.rows[0];
    if (inserted) {
      // Regardless of approve or reject: 1 Puffin base + 1 Puffin for feedback/encouragement
      await client.query(
        "UPDATE users SET balance = balance + $2, cove_approved_today = cove_approved_today + 1 WHERE id = $1",
        [req.user.id, reviewerReward]
      );

      if (decision === "approve") {
        const upd = await client.query(
          "UPDATE submissions SET approvals = approvals + 1 WHERE id = $1 RETURNING approvals",
          [submissionId]
        );
        newApprovals = upd.rows[0].approvals;
      } else {
        const upd = await client.query(
          "UPDATE submissions SET skips = skips + 1 WHERE id = $1 RETURNING skips",
          [submissionId]
        );
        newSkips = upd.rows[0].skips;
        if (newSkips >= 2 && submission.status === "pending") {
          await client.query("UPDATE submissions SET status = 'rejected' WHERE id = $1", [submissionId]);
        }
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
  if (decision === "approve" && submission.status === "pending" && newApprovals >= (content.REVIEW_APPROVALS_NEEDED || 2)) {
    const result = await finalizeSubmission(submissionId);
    finalized = !!result;
  }

  res.json({
    ok: true,
    reviewerReward,
    hasFeedback,
    decision,
    finalized
  });
});

module.exports = router;
