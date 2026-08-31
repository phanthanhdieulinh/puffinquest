"use strict";

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { initSchema } = require("./db");

const authRoutes = require("./routes/auth");
const contentRoutes = require("./routes/content");
const questRoutes = require("./routes/quests");
const coveRoutes = require("./routes/cove");
const fightRoutes = require("./routes/fight");
const fishRoutes = require("./routes/fish");
const profileRoutes = require("./routes/profile");

const app = express();
app.set("trust proxy", 1);
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

app.use(express.static(path.join(__dirname, "..", "public")));
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

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log("Puffin Quest listening on port " + PORT));
  })
  .catch((err) => {
    console.error("Failed to initialize database schema:", err);
    process.exit(1);
  });
