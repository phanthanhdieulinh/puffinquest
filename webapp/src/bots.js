"use strict";

const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const content = require("./content");

let botIdsCache = null;

/* Creates the 2 permanent bot reviewer accounts on first boot if they don't
   already exist. They never log in (random unusable password hash) and are
   excluded from the Cove queue since they never submit quests themselves. */
async function ensureBotUsers() {
  const ids = [];
  for (const bot of content.BOT_REVIEWERS) {
    const usernameLower = bot.username.toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE username_lower = $1", [usernameLower]);
    if (existing.rows[0]) {
      ids.push(existing.rows[0].id);
      continue;
    }
    const hash = await bcrypt.hash("bot-account-" + Math.random().toString(36).slice(2), 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, username_lower, password_hash, display_name, is_bot)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [bot.username, usernameLower, hash, bot.displayName]
    );
    ids.push(rows[0].id);
  }
  botIdsCache = ids;
  return ids;
}

function getBotIds() {
  if (!botIdsCache) throw new Error("Bot users not initialized — call ensureBotUsers() at boot.");
  return botIdsCache;
}

function randomBotComment() {
  return content.BOT_COMMENTS[Math.floor(Math.random() * content.BOT_COMMENTS.length)];
}

/* Inserts the 2 bot approvals for a freshly created submission and returns
   the resulting approval count (always 2, since bots never skip). */
async function addBotApprovals(client, submissionId) {
  const botIds = getBotIds();
  for (const botId of botIds) {
    await client.query(
      `INSERT INTO reviews (submission_id, reviewer_id, decision, comment) VALUES ($1, $2, 'approve', $3)`,
      [submissionId, botId, randomBotComment()]
    );
  }
  await client.query("UPDATE submissions SET approvals = approvals + $2 WHERE id = $1", [submissionId, botIds.length]);
  return botIds.length;
}

module.exports = { ensureBotUsers, getBotIds, addBotApprovals };
