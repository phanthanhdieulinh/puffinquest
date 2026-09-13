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
  } else if (toArray(user.daily_quest_ids).length < 4) {
    patch.daily_quest_ids = content.dailyQuestIdsFor(today);
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
    if (diffDays === 2 && user.streak > 0 && (user.streak_freezes || 0) > 0) {
      // Missed exactly 1 day — consume a streak freeze to preserve streak
      patch.streak_freezes = (user.streak_freezes || 0) - 1;
      patch._freeze_used = true; // internal flag, not a real column
      dirty = true;
    } else if (diffDays > 1 && user.streak !== 0) {
      patch.streak = 0;
      dirty = true;
    }
  }

  if (!dirty) return user;

  // Remove internal flag before building SQL
  const freezeUsed = !!patch._freeze_used;
  delete patch._freeze_used;

  const fields = Object.keys(patch);
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(", ");
  const values = fields.map((f) => patch[f]);
  const { rows } = await pool.query(
    `UPDATE users SET ${setClause} WHERE id = $1 RETURNING *`,
    [user.id, ...values]
  );
  const updated = rows[0];
  if (freezeUsed) updated._freeze_used = true;
  return updated;
}

async function fetchJournal(userId, limit, isPublic = false) {
  const { rows } = await pool.query(
    `SELECT * FROM submissions
     WHERE user_id = $1 AND status = 'approved' AND (post_to_profile IS TRUE OR post_to_profile IS NULL)
     ORDER BY approved_at DESC, created_at DESC
     LIMIT $2`,
    [userId, limit || 120]
  );
  if (!rows.length) return [];

  // Exclude City Challenge from Bird profile journal because it is a challenge
  const cityIds = new Set(content.cityLandmarksFlat().map((l) => l.id));
  const filteredRows = rows.filter((r) => !cityIds.has(r.quest_id));
  if (!filteredRows.length) return [];

  const subIds = filteredRows.map((r) => r.id);
  const inList = subIds.join(",");
  const reviewsRes = await pool.query(
    `SELECT submission_id, comment, created_at FROM reviews WHERE submission_id IN (${inList}) AND decision = 'approve' AND comment <> ''`
  ).catch(() => ({ rows: [] }));
  const cheersRes = await pool.query(
    `SELECT submission_id, comment, created_at FROM cheers WHERE submission_id IN (${inList}) AND decision = 'cheer' AND comment <> ''`
  ).catch(() => ({ rows: [] }));

  const reactionsMap = {};
  for (const r of [...reviewsRes.rows, ...cheersRes.rows]) {
    if (!reactionsMap[r.submission_id]) reactionsMap[r.submission_id] = [];
    reactionsMap[r.submission_id].push({ comment: r.comment, createdAt: r.created_at });
  }

  for (const row of filteredRows) {
    row.reactions = reactionsMap[row.id] || [];
  }
  return filteredRows.map(serializeSubmission);
}

function serializeSubmission(row) {
  const ts = new Date(row.approved_at || row.created_at || Date.now());
  const dateStr = !isNaN(ts.getTime()) ? ts.toISOString().slice(0, 10) : "";
  const timeStr = !isNaN(ts.getTime()) ? ts.toISOString().slice(11, 16) : "";
  const rawReactions = Array.isArray(row.reactions)
    ? row.reactions
    : typeof row.reactions === "string"
    ? JSON.parse(row.reactions)
    : [];

  return {
    id: row.id,
    questId: row.quest_id,
    isDaily: row.is_daily,
    title: row.title,
    icon: row.icon,
    reward: row.base_reward + row.bonus_reward,
    caption: row.caption || "",
    thumb: row.thumb || null,
    proofGps: row.proof_gps || null,
    mediaType: row.media_type || "image",
    postToProfile: row.post_to_profile !== false,
    date: dateStr,
    time: timeStr,
    reactions: rawReactions.map((r) => ({ comment: r.comment }))
  };
}

function socialFlagsOf(user) {
  return { facebook: user.social_facebook, instagram: user.social_instagram, linkedin: user.social_linkedin };
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string" || val === "{}") return [];
  if (val.startsWith("{") && val.endsWith("}")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
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
    titles: toArray(user.titles),
    badges: toArray(user.badges),
    dailyQuestIds: toArray(user.daily_quest_ids),
    dailyDoneIds: toArray(user.daily_done_ids),
    funDoneIds: toArray(user.fun_done_ids),
    cheeredToday: user.cove_approved_today,
    city: user.city || null,
    puffinGrowth: user.puffin_growth || 0,
    puffinGrowthTier: content.getPuffinGrowthTier(user.puffin_growth || 0),
    puffinItems: toArray(user.puffin_items),
    equippedHat: user.equipped_hat || null,
    equippedClothes: user.equipped_clothes || null,
    equippedShoes: user.equipped_shoes || null,
    socialFlags: socialFlagsOf(user),
    socialLinks: content.buildSocialLinks(user.username, socialFlagsOf(user)),
    streakFreezes: user.streak_freezes || 0,
    freezeUsed: !!user._freeze_used
  };
}

function serializeUserPublic(user, journal) {
  return {
    username: user.username,
    displayName: user.display_name || user.username,
    avatarPhoto: user.avatar_photo,
    equippedTitle: user.equipped_title,
    titles: toArray(user.titles),
    badges: toArray(user.badges),
    balance: user.balance,
    streak: user.streak,
    bestStreak: user.best_streak,
    firstActiveDate: user.first_active_date,
    questsDone: user.total_quests_done,
    puffinGrowth: user.puffin_growth || 0,
    puffinGrowthTier: content.getPuffinGrowthTier(user.puffin_growth || 0),
    equippedHat: user.equipped_hat || null,
    equippedClothes: user.equipped_clothes || null,
    equippedShoes: user.equipped_shoes || null,
    socialLinks: content.buildSocialLinks(user.username, socialFlagsOf(user)),
    journal: journal || [],
    streakFreezes: user.streak_freezes || 0
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

    const dailyDone = new Set(toArray(owner.daily_done_ids));
    const funDone = new Set(toArray(owner.fun_done_ids));
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
