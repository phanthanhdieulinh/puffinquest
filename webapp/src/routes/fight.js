"use strict";

const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../auth");
const { refreshUser } = require("../gamestate");
const content = require("../content");

const router = express.Router();

const FIELD_MAP = {
  week: { keyField: "week_key", claimedField: "week_claimed" },
  month: { keyField: "month_key", claimedField: "month_claimed" },
  season: { keyField: "season_key", claimedField: "season_claimed" }
};

function periodKeyFor(defKey) {
  const today = content.todayStr();
  if (defKey === "week") return content.weekStartStr(today);
  if (defKey === "month") return today.slice(0, 7);
  return content.seasonKeyStr(today);
}

async function progressFor(defKey, user) {
  const today = content.todayStr();
  if (defKey === "week") {
    const weekStart = content.weekStartStr(today);
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM submissions
         WHERE user_id = $1 AND status = 'approved' AND approved_at >= $2::timestamptz`,
        [user.id, weekStart + "T00:00:00Z"]
      );
      return rows[0] ? rows[0].n : 0;
    } catch (e) {
      return 0;
    }
  }
  if (defKey === "month") {
    const monthKey = today.slice(0, 7);
    try {
      const { rows } = await pool.query(
        `SELECT COALESCE(SUM(base_reward + bonus_reward), 0)::int AS n FROM submissions
         WHERE user_id = $1 AND status = 'approved' AND approved_at >= $2::timestamptz`,
        [user.id, monthKey + "-01T00:00:00Z"]
      );
      return rows[0] ? rows[0].n : 0;
    } catch (e) {
      return 0;
    }
  }
  return user.best_streak || 0;
}

async function resetIfNewPeriod(user, def) {
  const { keyField, claimedField } = FIELD_MAP[def.key];
  const periodKey = periodKeyFor(def.key);
  if (user[keyField] === periodKey) return user;
  const { rows } = await pool.query(
    `UPDATE users SET ${keyField} = $2, ${claimedField} = false WHERE id = $1 RETURNING *`,
    [user.id, periodKey]
  );
  return rows[0];
}

/* ==========================================================================
   Timely Challenges (Weekly, Monthly, Seasonal)
   ========================================================================== */
router.get("/", requireAuth, async (req, res) => {
  let user = await refreshUser(req.user);
  const out = [];
  for (const def of content.FIGHT_DEFS) {
    user = await resetIfNewPeriod(user, def);
    const { claimedField } = FIELD_MAP[def.key];
    const progress = await progressFor(def.key, user);
    out.push({
      key: def.key,
      label: def.label,
      name: def.name,
      desc: def.desc,
      target: def.target,
      reward: def.reward,
      titleReward: def.titleReward || null,
      badgeReward: def.badgeReward || null,
      progress: Math.min(progress, def.target),
      claimed: user[claimedField],
      resetDate:
        def.key === "week" ? content.nextMondayFrom(content.todayStr())
        : def.key === "month" ? content.nextMonthStart(content.todayStr())
        : content.nextSeasonStart(content.todayStr())
    });
  }
  res.json({ fights: out });
});

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "string" || val === "{}") return [];
  if (val.startsWith("{") && val.endsWith("}")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  }
  return [];
}

router.post("/claim", requireAuth, async (req, res) => {
  const key = String((req.body && req.body.key) || "");
  const def = content.FIGHT_DEFS.find((f) => f.key === key);
  if (!def) return res.status(400).json({ error: "Unknown challenge." });

  let user = await refreshUser(req.user);
  user = await resetIfNewPeriod(user, def);
  const { claimedField } = FIELD_MAP[def.key];
  if (user[claimedField]) return res.status(409).json({ error: "Already claimed." });

  const progress = await progressFor(def.key, user);
  if (progress < def.target) return res.status(400).json({ error: "Not finished yet." });

  const titles = new Set(toArray(user.titles));
  if (def.titleReward) titles.add(def.titleReward);

  const badges = new Set(toArray(user.badges));
  if (def.badgeReward) badges.add(def.badgeReward.id);

  const { rows } = await pool.query(
    `UPDATE users SET balance = balance + $2, ${claimedField} = true, titles = $3, badges = $4 WHERE id = $1 RETURNING *`,
    [user.id, def.reward, [...titles], [...badges]]
  );
  res.json({
    ok: true,
    reward: def.reward,
    titleReward: def.titleReward || null,
    badgeReward: def.badgeReward || null,
    user: rows[0].balance
  });
});

/* ==========================================================================
   Fight Puffins (PvP Challenges: Rooms, Friend Challenges, Stakes)
   ========================================================================== */
router.get("/pvp", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const { rows: myFights } = await pool.query(
    `SELECT f.*,
            u1.username AS creator_username, u1.equipped_title AS creator_title,
            u2.username AS opponent_username, u2.equipped_title AS opponent_title,
            w.username AS winner_username
     FROM puffin_fights f
     JOIN users u1 ON f.creator_id = u1.id
     LEFT JOIN users u2 ON f.opponent_id = u2.id
     LEFT JOIN users w ON f.winner_id = w.id
     WHERE (f.creator_id = $1 OR f.opponent_id = $1)
     ORDER BY f.created_at DESC LIMIT 20`,
    [user.id]
  );

  const { rows: publicRooms } = await pool.query(
    `SELECT f.*, u1.username AS creator_username, u1.equipped_title AS creator_title
     FROM puffin_fights f
     JOIN users u1 ON f.creator_id = u1.id
     WHERE f.is_random = true AND f.opponent_id IS NULL AND f.status = 'pending' AND f.creator_id != $1
     ORDER BY f.created_at DESC LIMIT 10`,
    [user.id]
  );

  res.json({
    myFights,
    publicRooms,
    userBalance: user.balance,
    currentUserId: user.id
  });
});

router.post("/pvp/create", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const stake = Math.max(5, parseInt(req.body && req.body.stake, 10) || 10);
  const isRandom = Boolean(req.body && req.body.isRandom);
  const opponentUsername = String((req.body && req.body.opponentUsername) || "").trim();

  if (user.balance < stake) {
    return res.status(400).json({ error: `Not enough Puffins. You need at least ${stake} Puffins.` });
  }

  let opponentId = null;
  if (!isRandom) {
    if (!opponentUsername) {
      return res.status(400).json({ error: "Please enter a friend's username or select Random Opponent." });
    }
    const { rows: oppRows } = await pool.query(
      "SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)",
      [opponentUsername]
    );
    if (!oppRows.length) {
      return res.status(404).json({ error: `Player "${opponentUsername}" not found.` });
    }
    if (oppRows[0].id === user.id) {
      return res.status(400).json({ error: "You cannot challenge yourself!" });
    }
    opponentId = oppRows[0].id;
  }

  // Pick a quest for the fight race
  const quests = [...content.DAILY_POOL, ...content.FUN_POOL];
  const quest = quests[Math.floor(Math.random() * quests.length)];

  // Deduct stake from creator
  await pool.query("UPDATE users SET balance = balance - $2 WHERE id = $1", [user.id, stake]);

  const { rows } = await pool.query(
    `INSERT INTO puffin_fights (creator_id, opponent_id, is_random, stake, quest_id, quest_title, quest_icon, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [user.id, opponentId, isRandom, stake, quest.id, quest.title, quest.icon]
  );

  res.json({ ok: true, fight: rows[0] });
});

router.post("/pvp/respond", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const fightId = parseInt(req.body && req.body.fightId, 10);
  const action = String((req.body && req.body.action) || "").toLowerCase();

  const { rows } = await pool.query("SELECT * FROM puffin_fights WHERE id = $1", [fightId]);
  if (!rows.length) return res.status(404).json({ error: "Fight room not found." });
  const fight = rows[0];

  if (fight.status !== "pending") {
    return res.status(400).json({ error: "This fight is no longer pending." });
  }

  // Verify permission
  if (fight.opponent_id && fight.opponent_id !== user.id) {
    return res.status(403).json({ error: "You are not the challenged player." });
  }

  if (action === "accept" || action === "join") {
    if (user.balance < fight.stake) {
      return res.status(400).json({ error: `Not enough Puffins to accept. Need ${fight.stake} Puffins.` });
    }
    // Deduct stake from opponent
    await pool.query("UPDATE users SET balance = balance - $2 WHERE id = $1", [user.id, fight.stake]);
    const { rows: updated } = await pool.query(
      "UPDATE puffin_fights SET opponent_id = $2, status = 'active' WHERE id = $1 RETURNING *",
      [fight.id, user.id]
    );
    return res.json({ ok: true, fight: updated[0] });
  } else if (action === "reject") {
    if (fight.opponent_id !== user.id) {
      return res.status(403).json({ error: "Only the invited opponent can decline." });
    }
    // Refund creator
    await pool.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [fight.creator_id, fight.stake]);
    const { rows: updated } = await pool.query(
      "UPDATE puffin_fights SET status = 'rejected' WHERE id = $1 RETURNING *",
      [fight.id]
    );
    return res.json({ ok: true, fight: updated[0] });
  }

  res.status(400).json({ error: "Invalid action." });
});

router.post("/pvp/complete", requireAuth, async (req, res) => {
  const user = await refreshUser(req.user);
  const fightId = parseInt(req.body && req.body.fightId, 10);
  const { rows } = await pool.query("SELECT * FROM puffin_fights WHERE id = $1", [fightId]);
  if (!rows.length) return res.status(404).json({ error: "Fight not found." });
  const fight = rows[0];

  if (fight.status !== "active") {
    return res.status(400).json({ error: "This fight is not currently active." });
  }

  const isCreator = fight.creator_id === user.id;
  const isOpponent = fight.opponent_id === user.id;
  if (!isCreator && !isOpponent) {
    return res.status(403).json({ error: "You are not a participant in this fight." });
  }

  const totalPot = fight.stake * 2;

  if (fight.winner_id) {
    return res.json({
      ok: true,
      winner: false,
      winnerId: fight.winner_id,
      pot: totalPot,
      message: "Your opponent finished the quest first!"
    });
  }

  // First to finish wins the pot!
  const now = new Date();
  const doneCol = isCreator ? "creator_done = true, creator_done_at = $2" : "opponent_done = true, opponent_done_at = $2";
  const { rows: won } = await pool.query(
    `UPDATE puffin_fights
     SET ${doneCol}, status = 'completed', winner_id = $3
     WHERE id = $1 RETURNING *`,
    [fight.id, now, user.id]
  );

  // Award the entire pot to the winner
  await pool.query("UPDATE users SET balance = balance + $2 WHERE id = $1", [user.id, totalPot]);

  res.json({
    ok: true,
    winner: true,
    winnerId: user.id,
    pot: totalPot,
    fight: won[0]
  });
});

module.exports = router;
