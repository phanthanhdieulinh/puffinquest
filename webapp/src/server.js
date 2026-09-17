const path = require("path");

// Automatically load local .env file if available in Node 20.6+
if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../.env"));
  } catch (e) {
    try {
      process.loadEnvFile();
    } catch (_) {
      // .env file is optional in cloud environments like Render
    }
  }
}
const express = require("express");
const cookieParser = require("cookie-parser");
const { pool, initSchema } = require("./db");
const { ensureBotUsers } = require("./bots");
const { finalizeSubmission } = require("./gamestate");

const authRoutes = require("./routes/auth");
const contentRoutes = require("./routes/content");
const questRoutes = require("./routes/quests");
const coveRoutes = require("./routes/cove");
const fightRoutes = require("./routes/fight");
const fishRoutes = require("./routes/fish");
const profileRoutes = require("./routes/profile");
const cityRoutes = require("./routes/city");

const app = express();
app.set("trust proxy", 1);
app.set("etag", false);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  }
  next();
});
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/quests", questRoutes);
app.use("/api/cove", coveRoutes);
app.use("/api/fight", fightRoutes);
app.use("/api/fish", fishRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/city", cityRoutes);

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/privacy", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "privacy.html")));
app.get("/terms", (req, res) => res.sendFile(path.join(__dirname, "..", "public", "terms.html")));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end. Please try again." });
});

const PORT = process.env.PORT || 3000;

// A serverless database (Neon) may be suspended when the app boots, and the
// first connection has to wait for its compute to wake up. Retry a few times
// before giving up so a cold start is not mistaken for a broken database.
async function withRetry(label, fn, attempts = 5) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      const waitMs = 1000 * i;
      console.warn(label + " failed (attempt " + i + "/" + attempts + "): " + err.message + ". Retrying in " + waitMs + "ms.");
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

withRetry("Database connection", () => initSchema())
  .then(() => ensureBotUsers())
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => console.log("Puffin Quest listening on http://localhost:" + PORT));
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
