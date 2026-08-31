"use strict";

const { pool } = require("./db");
const content = require("./content");

/* Applies daily-quest rollover, cove-approval-count rollover, and streak
   decay to a user row, persisting any change. Called at the top of most
   authenticated routes so state is always fresh regardless of when the
   user last opened the app. Returns the (possibly updated) user row. */
async function refreshUser(user) {
  const today = content.todayStr();
  let dirty = false;
  const patch = {};

  if (user.daily_date !== today) {
    patch.daily_date = today;
    patch.daily_quest_ids = content.dailyQuestIdsFor(today);
    patch.daily_done_ids = [];
    dirty = true;
  }
  if (user.cove_date !== today) {
    patch.cove_date = today;
    patch.cove_approved_today = 0;
    dirty = true;
  }
  if (user.last_completion_date) {
    const last = new Date(user.last_completion_date);
    const lastStr = last.toISOString().slice(0, 10);
    const diffDays = Math.round((new Date(today + "T00:00:00") - new Date(lastStr + "T00:00:00")) / 86400000);
    if (diffDays > 1 && user.streak !== 0) {
      patch.streak = 0;
      dirty = true;
    }
  }

  if (!dirty) return user;

  const fields = Object.keys(patch);
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
  const values = fields.map((f) => patch[f]);
  const { rows } = await pool.query(
    `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
    [user.id, ...values]
  );
  return rows[0];
}

async function fetchJournal(userId, limit) {
  const { rows } = await pool.query(
    `SELECT s.*,
       COALESCE(json_agg(json_build_object('reviewerId', r.reviewer_id, 'comment', r.comment) ORDER BY r.created_at)
         FILTER (WHERE r.decision = 'approve' AND r.comment <> ''), '[]') AS reactions
     FROM submissions s
     LEFT JOIN reviews r ON r.submission_id = s.id
     WHERE s.user_id = $1 AND s.status = 'approved'
     GROUP BY s.id
     ORDER BY s.approved_at DESC
     LIMIT $2`,
    [userId, limit || 120]
  );
  return rows.map(serializeSubmission);
}

function serializeSubmission(row) {
  return {
    id: row.id,
    questId: row.quest_id,
    isDaily: row.is_daily,
    title: row.title,
    icon: row.icon,
    reward: row.base_reward + row.bonus_reward,
    caption: row.caption || "",
    thumb: row.thumb || null,
    date: (row.approved_at || row.created_at).toISOString().slice(0, 10),
    time: (row.approved_at || row.created_at).toISOString().slice(11, 16),
    reactions: (row.reactions || []).map((r) => ({ comment: r.comment }))
  };
}

function socialFlagsOf(user) {
  return { facebook: user.social_facebook, instagram: user.social_instagram, linkedin: user.social_linkedin };
}

function serializeUserPrivate(user) {
  return {
    username: user.username,
    displayName: user.display_name || user.username,
    avatarPhoto: user.avatar_photo,
    coverPhoto: user.cover_photo,
    balance: user.balance,
    streak: user.streak,
    bestStreak: user.best_streak,
    totalQuestsDone: user.total_quests_done,
    firstActiveDate: user.first_active_date,
    equippedTitle: user.equipped_title,
    titles: user.titles || [],
    badges: user.badges || [],
    dailyQuestIds: user.daily_quest_ids || [],
    dailyDoneIds: user.daily_done_ids || [],
    funDoneIds: user.fun_done_ids || [],
    coveApprovedToday: user.cove_approved_today,
    socialFlags: socialFlagsOf(user),
    socialLinks: content.buildSocialLinks(user.username, socialFlagsOf(user))
  };
}

function serializeUserPublic(user, journal) {
  return {
    username: user.username,
    displayName: user.display_name || user.username,
    avatarPhoto: user.avatar_photo,
    equippedTitle: user.equipped_title,
    balance: user.balance,
    streak: user.streak,
    bestStreak: user.best_streak,
    firstActiveDate: user.first_active_date,
    questsDone: user.total_quests_done,
    socialLinks: content.buildSocialLinks(user.username, socialFlagsOf(user)),
    journal: journal || []
  };
}

/* Runs when a submission crosses the approval threshold: credits the
   submitter's balance/streak/journal in one transaction. Returns the
   updated owner row, or null if the submission was already finalized by a
   concurrent request (approvals race). */
async function finalizeSubmission(submissionId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const subRes = await client.query("SELECT * FROM submissions WHERE id = $1 FOR UPDATE", [submissionId]);
    const submission = subRes.rows[0];
    if (!submission || submission.status !== "pending") {
      await client.query("ROLLBACK");
      return null;
    }
    const ownerRes = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [submission.user_id]);
    const owner = ownerRes.rows[0];
    const today = content.todayStr();
    const totalReward = submission.base_reward + submission.bonus_reward;

    let streak = owner.streak;
    let lastCompletionDate = owner.last_completion_date;
    const lastStr = lastCompletionDate ? new Date(lastCompletionDate).toISOString().slice(0, 10) : null;
    if (lastStr !== today) {
      streak = lastStr === content.yesterdayStr(today) ? streak + 1 : 1;
      lastCompletionDate = today;
    }
    const bestStreak = Math.max(owner.best_streak || 0, streak);

    const dailyDone = new Set(owner.daily_done_ids || []);
    const funDone = new Set(owner.fun_done_ids || []);
    if (submission.is_daily) dailyDone.add(submission.quest_id);
    else funDone.add(submission.quest_id);

    await client.query(
      `UPDATE users SET balance = balance + $2, streak = $3, best_streak = $4,
         last_completion_date = $5, daily_done_ids = $6, fun_done_ids = $7,
         total_quests_done = total_quests_done + 1
       WHERE id = $1`,
      [owner.id, totalReward, streak, bestStreak, lastCompletionDate, [...dailyDone], [...funDone]]
    );
    await client.query(
      `UPDATE submissions SET status = 'approved', approved_at = now() WHERE id = $1`,
      [submissionId]
    );
    await client.query("COMMIT");
    return { ownerId: owner.id, totalReward, streakIncreased: lastStr !== today };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { refreshUser, fetchJournal, finalizeSubmission, serializeSubmission, serializeUserPrivate, serializeUserPublic };
