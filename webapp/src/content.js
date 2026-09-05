"use strict";

/* ================= STATIC GAME DATA ================= */
/* Ported from the original client-only prototype. Kept as plain data so both
   the server (for validation / deterministic daily picks) and the frontend
   (for rendering) share one source of truth via GET /api/content. */

const PHOTO_BONUS = 2;
const CAPTION_BONUS = 1;
const CHEER_REWARD = 1;
const COVE_DAILY_CAP = 200; // sanity cap, not a real gameplay limit

// Fun (and City Challenge) quests are decided by the 2 always-on bot
// puffineers alone — no real-user approval is required anymore. Real users
// can still swipe through the Networking Cove afterward, but that's now a
// purely social cheer/skip, decoupled from whether the quest was rewarded.
const BOT_REVIEWERS = [
  { username: "cove_bot_breezy", displayName: "Breezy Puffin" },
  { username: "cove_bot_tidal", displayName: "Tidal Puffin" }
];
const BOT_COMMENTS = ["Nice job! 🎉", "Love this!", "You've got this 🔥", "So wholesome", "Way to go!", "Great find!", "Keep it up!"];

// Daily quests are instant — no Cove review needed, so rewards stay small
// (+1 to +5) and the pool leans toward quick, varied, everyday-good habits.
const DAILY_POOL = [
  { id: "veggie", icon: "🥦", title: "Grocery Grab", desc: "Get one veggie at the store. Snap it in your bag, or the receipt line that proves it.", reward: 3 },
  { id: "bird", icon: "🐦", title: "Bird Watch", desc: "Find a bird — any bird — and get a photo of it before it flies off.", reward: 3 },
  { id: "water", icon: "💧", title: "Hydration Check", desc: "Photograph your water bottle or glass, ideally mid-sip.", reward: 1 },
  { id: "stretch", icon: "🧘", title: "Stretch Break", desc: "Take 60 seconds to stretch. A photo of you mid-stretch counts.", reward: 2 },
  { id: "exercise", icon: "🏃", title: "Move Your Body", desc: "10 minutes of any exercise — a run, a workout, a walk that gets your heart going.", reward: 5 },
  { id: "steps", icon: "🚶", title: "Take a Walk", desc: "Step out for a short walk, anywhere. Photo of the route or your shoes on the move.", reward: 3 },
  { id: "book", icon: "📚", title: "Page Turner", desc: "Photo of whatever you're currently reading, open to today's page.", reward: 2 },
  { id: "sky", icon: "🌅", title: "Sky Right Now", desc: "Step outside and photograph the sky exactly as it looks this minute.", reward: 1 },
  { id: "tidy", icon: "🧹", title: "Tidy Corner", desc: "Pick one small messy spot and photograph it looking tidier.", reward: 3 },
  { id: "kind-note", icon: "💌", title: "Kind Word", desc: "Leave a short kind note for someone. Photograph it before you give it away.", reward: 4 },
  { id: "plant", icon: "🌱", title: "Plant Check-in", desc: "Water or check on a plant, then snap a photo of it looking loved.", reward: 2 },
  { id: "litter", icon: "🚮", title: "Litter Pick", desc: "Pick up one piece of litter you spot outside. Photo of it in the bin.", reward: 3 },
  { id: "outside", icon: "🚪", title: "Step Outside", desc: "Photograph the view from just outside your front door.", reward: 1 },
  { id: "fruit", icon: "🍎", title: "Fruit Find", desc: "Photograph a piece of fruit — bonus points if you actually eat it.", reward: 1 },
  { id: "doodle", icon: "🎨", title: "Doodle Break", desc: "Doodle anything for two minutes, then photograph your masterpiece.", reward: 2 },
  { id: "laundry", icon: "🧺", title: "Laundry Day", desc: "Fold one small pile of laundry, photo of the neat result.", reward: 2 },
  { id: "sleep", icon: "😴", title: "Early Lights Out", desc: "Get to bed at a decent hour tonight. Photo of the clock, or good morning tomorrow.", reward: 4 },
  { id: "breathe", icon: "🌬️", title: "Breathing Break", desc: "60 seconds of slow, deep breaths. A photo of your calm spot counts.", reward: 1 }
];

const FUN_POOL = [
  { id: "rainbow", icon: "🌈", title: "Chase a Rainbow", desc: "Spot a rainbow, or make one with a hose or prism — capture it.", reward: 26 },
  { id: "grass", icon: "🌿", title: "Toes in the Grass", desc: "Kick off your shoes and stand in grass or sand for a minute. Snap your feet.", reward: 20 },
  { id: "kindness", icon: "🎈", title: "Random Act of Kindness", desc: "Do something small and kind for a stranger or friend. Photo of the moment or the aftermath.", reward: 30 },
  { id: "newroute", icon: "🗺️", title: "New Route Explorer", desc: "Walk or bike a route you've never taken before. Photo of somewhere new.", reward: 24 },
  { id: "stargaze", icon: "🌙", title: "Stargaze", desc: "Spend 10 minutes looking at the night sky. Photo of the sky, moon, or you looking up.", reward: 22 },
  { id: "cook", icon: "🍳", title: "Cook Something New", desc: "Make a dish or snack you've never made before. Photo of your creation.", reward: 28 },
  { id: "sunset", icon: "🌇", title: "Sunset Chaser", desc: "Catch today's sunset. However you can see it, photograph it.", reward: 20 },
  { id: "puzzle", icon: "🧩", title: "Finish a Puzzle", desc: "Complete a puzzle, crossword, or brain-teaser. Photo of the finished thing.", reward: 18 },
  { id: "cozy", icon: "🕯️", title: "Cozy Night In", desc: "Set up a cozy little scene for yourself tonight — blanket, drink, whatever cozy means to you.", reward: 16 },
  { id: "bike", icon: "🚲", title: "Somewhere New by Bike", desc: "Ride, scoot, or walk somewhere in your area you've genuinely never been.", reward: 24 }
];

const FIGHT_DEFS = [
  { key: "week", label: "Weekly", name: "Waddle Sprint", desc: "Complete 5 quests this week", target: 5, reward: 40 },
  { key: "month", label: "Monthly", name: "Puffin Tide", desc: "Earn 150 Puffins this month", target: 150, reward: 80 },
  { key: "season", label: "Seasonal", name: "The Long Migration", desc: "Reach a 14-day streak this season", target: 14, reward: 200, titleReward: "Migration Champion" }
];

const FISH_COST = 15;
const LOOT_TABLE = [
  { id: "sprat", label: "Tiny Sprat", icon: "🐟", rarity: "common", weight: 30, type: "coins", min: 3, max: 7 },
  { id: "herring", label: "Silver Herring", icon: "🐠", rarity: "common", weight: 25, type: "coins", min: 6, max: 12 },
  { id: "shell", label: "Sea Shell", icon: "🐚", rarity: "uncommon", weight: 14, type: "badge" },
  { id: "star", label: "Starfish", icon: "⭐", rarity: "uncommon", weight: 11, type: "badge" },
  { id: "tide-title", label: "Tide Watcher", icon: "🌊", rarity: "uncommon", weight: 7, type: "title" },
  { id: "early-title", label: "Early Bird", icon: "🌅", rarity: "uncommon", weight: 5, type: "title" },
  { id: "wave", label: "Big Wave", icon: "🌀", rarity: "rare", weight: 4, type: "badge" },
  { id: "golden", label: "Golden Puffin", icon: "🐧", rarity: "legendary", weight: 1, type: "jackpot", min: 80, max: 120 }
];

const NAME_ADJ = ["Misty", "Salty", "Windy", "Foamy", "Pebble", "Chilly", "Reedy", "Driftwood", "Cloudy", "Tidepool", "Brisk", "Harbor", "Foggy", "Rocky", "Breezy", "Marsh"];

// City Challenge: pick a city, get one blurred/zoomed "mystery landmark" at a
// time to go find and photograph in person. Rendered as a stylized emoji
// mystery card (heavily blurred + zoomed via CSS) rather than a real scraped
// photo, so there's no landmark-photo licensing to worry about.
const ALLOWED_CITIES = ["hanoi", "hcmc", "singapore"];
const CITY_CHALLENGES = {
  hanoi: {
    name: "Hà Nội",
    landmarks: [
      { id: "hanoi-turtle-tower", icon: "🐢", title: "Turtle Tower", desc: "A little tower on an island in the Old Quarter's favorite lake.", reward: 40 },
      { id: "hanoi-one-pillar", icon: "🏯", title: "One Pillar Pagoda", desc: "A tiny pagoda that looks like it's floating on a single stone leg.", reward: 40 },
      { id: "hanoi-temple-literature", icon: "⛩️", title: "Temple of Literature", desc: "Vietnam's first university, guarded by stone turtles and old exam steles.", reward: 40 }
    ]
  },
  hcmc: {
    name: "Ho Chi Minh City",
    landmarks: [
      { id: "hcmc-notre-dame", icon: "⛪", title: "Notre-Dame Cathedral Basilica", desc: "Red-brick towers, imported brick by brick from France.", reward: 40 },
      { id: "hcmc-ben-thanh", icon: "🏛️", title: "Bến Thành Market", desc: "A clock tower marks the entrance to this century-old market.", reward: 40 },
      { id: "hcmc-independence-palace", icon: "🏢", title: "Independence Palace", desc: "A 1960s government palace with a helicopter still parked on the roof.", reward: 40 }
    ]
  },
  singapore: {
    name: "Singapore",
    landmarks: [
      { id: "sg-merlion", icon: "🦁", title: "Merlion", desc: "Half lion, half fish, all waterspout.", reward: 40 },
      { id: "sg-marina-bay-sands", icon: "🏨", title: "Marina Bay Sands", desc: "Three towers holding up a boat-shaped rooftop pool.", reward: 40 },
      { id: "sg-gardens-by-the-bay", icon: "🌳", title: "Gardens by the Bay", desc: "Metal supertrees that light up after dark.", reward: 40 }
    ]
  }
};
function cityLandmarksFlat() {
  const out = [];
  for (const key of Object.keys(CITY_CHALLENGES)) {
    for (const l of CITY_CHALLENGES[key].landmarks) out.push({ ...l, cityKey: key, requiresPhoto: true });
  }
  return out;
}

function findQuest(id) {
  return DAILY_POOL.concat(FUN_POOL).concat(cityLandmarksFlat()).find((q) => q.id === id);
}

/* ================= DETERMINISTIC HELPERS ================= */
/* Same seeded-shuffle approach as the original client, so "today's 3 quests"
   are identical for everyone (server is now the single source of truth). */
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seedFn) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(seedFn() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr(from) {
  const y = new Date((from || todayStr()) + "T00:00:00");
  y.setDate(y.getDate() - 1);
  return y.toISOString().slice(0, 10);
}
function dailyQuestIdsFor(dateStr) {
  const rng = hashStr("daily-" + dateStr);
  return seededShuffle(DAILY_POOL, rng).slice(0, 3).map((q) => q.id);
}
function weekStartStr(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const dayNr = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNr);
  return d.toISOString().slice(0, 10);
}
function seasonKeyStr(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const q = Math.floor(d.getMonth() / 3) + 1;
  return d.getFullYear() + "-Q" + q;
}
function nextMondayFrom(dateStr) {
  const wk = new Date(weekStartStr(dateStr) + "T00:00:00");
  wk.setDate(wk.getDate() + 7);
  return wk.toISOString();
}
function nextMonthStart(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
}
function nextSeasonStart(dateStr) {
  const d = new Date((dateStr || todayStr()) + "T00:00:00");
  const q = Math.floor(d.getMonth() / 3);
  const nextQMonth = (q + 1) * 3;
  const year = d.getFullYear() + (nextQMonth >= 12 ? 1 : 0);
  return new Date(year, nextQMonth % 12, 1).toISOString();
}
function questBonus(hasPhoto, hasCaption) {
  return (hasPhoto ? PHOTO_BONUS : 0) + (hasCaption ? CAPTION_BONUS : 0);
}
function pickWeightedLoot() {
  const total = LOOT_TABLE.reduce((s, l) => s + l.weight, 0);
  let r = Math.random() * total;
  for (const loot of LOOT_TABLE) {
    r -= loot.weight;
    if (r <= 0) return loot;
  }
  return LOOT_TABLE[0];
}
const SOCIAL_PLATFORMS = {
  facebook: { label: "Facebook", icon: "📘", urlFor: (u) => `https://www.facebook.com/${u}` },
  instagram: { label: "Instagram", icon: "📸", urlFor: (u) => `https://www.instagram.com/${u}` },
  linkedin: { label: "LinkedIn", icon: "💼", urlFor: (u) => `https://www.linkedin.com/in/${u}` }
};

function buildSocialLinks(username, flags) {
  const out = {};
  for (const key of Object.keys(SOCIAL_PLATFORMS)) {
    out[key] = flags && flags[key] ? SOCIAL_PLATFORMS[key].urlFor(encodeURIComponent(username)) : null;
  }
  return out;
}

function generateRandomName() {
  const idx = Math.floor(Math.random() * NAME_ADJ.length);
  const num = 100 + Math.floor(Math.random() * 900);
  return NAME_ADJ[idx] + " Puffin #" + num;
}

module.exports = {
  PHOTO_BONUS,
  CAPTION_BONUS,
  CHEER_REWARD,
  COVE_DAILY_CAP,
  BOT_REVIEWERS,
  BOT_COMMENTS,
  DAILY_POOL,
  FUN_POOL,
  FIGHT_DEFS,
  FISH_COST,
  LOOT_TABLE,
  SOCIAL_PLATFORMS,
  ALLOWED_CITIES,
  CITY_CHALLENGES,
  cityLandmarksFlat,
  buildSocialLinks,
  findQuest,
  hashStr,
  seededShuffle,
  todayStr,
  yesterdayStr,
  dailyQuestIdsFor,
  weekStartStr,
  seasonKeyStr,
  nextMondayFrom,
  nextMonthStart,
  nextSeasonStart,
  questBonus,
  pickWeightedLoot,
  generateRandomName
};
