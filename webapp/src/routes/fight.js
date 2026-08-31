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
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM submissions
       WHERE user_id = $1 AND status = 'approved' AND approved_at >= $2::date AND approved_at < $2::date + INTERVAL '7 days'`,
      [user.id, weekStart]
    );
    return rows[0].n;
  }
  if (defKey === "month") {
    const monthKey = today.slice(0, 7);
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(base_reward + bonus_reward), 0)::int AS n FROM submissions
       WHERE user_id = $1 AND status = 'approved' AND to_char(approved_at, 'YYYY-MM') = $2`,
      [user.id, monthKey]
    );
    return rows[0].n;
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

  const titles = new Set(user.titles || []);
  if (def.titleReward) titles.add(def.titleReward);

  const { rows } = await pool.query(
    `UPDATE users SET balance = balance + $2, ${claimedField} = true, titles = $3 WHERE id = $1 RETURNING *`,
    [user.id, def.reward, [...titles]]
  );
  res.json({ ok: true, reward: def.reward, titleReward: def.titleReward || null, user: rows[0].balance });
});

module.exports = router;
