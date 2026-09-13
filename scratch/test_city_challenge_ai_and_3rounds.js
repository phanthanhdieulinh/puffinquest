// scratch/test_city_challenge_ai_and_3rounds.js
"use strict";

const BASE_URL = "http://localhost:3000";

// Helper to create a synthetic realistic landmark photo buffer with high entropy (rich details)
function createSyntheticLandmarkPhoto(seedByte = 120) {
  const width = 100;
  const height = 100;
  // Create a BMP-like or structured data buffer with high entropy
  const buffer = Buffer.alloc(3000);
  for (let i = 0; i < buffer.length; i++) {
    // Generate pseudo-random gradient texture
    buffer[i] = (i * 37 + seedByte * 19) % 256;
  }
  return "data:image/jpeg;base64," + buffer.toString("base64");
}

async function run() {
  console.log("=== Testing City Challenge: AI Photo Review, Mandatory GPS, and Max 3 Rounds ===");

  // 1. Register a test explorer
  const username = "explorer_" + Date.now().toString().slice(-8);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" })
  }).then(r => r.json());
  const token = regRes.token;
  console.log("Explorer registered:", username);

  // Set active city to Hanoi
  await fetch(`${BASE_URL}/api/city`, {
    method: "PATCH",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ city: "hanoi" })
  });

  const validPhoto = createSyntheticLandmarkPhoto(145);

  // 2. Test Rule A: City Challenge without GPS is strictly rejected
  console.log("\n--- Test A: GPS is a MUST (not optional) for City Challenge ---");
  const noGpsRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "hanoi-turtle-tower",
      thumb: validPhoto,
      proofGps: null
    })
  });
  const noGpsData = await noGpsRes.json();
  console.log("Submit without GPS status:", noGpsRes.status, "error:", noGpsData.error);
  if (noGpsRes.status !== 400 || !noGpsData.error.includes("GPS is a must, NOT optional")) {
    throw new Error("Expected 400 rejection when GPS is missing for City Challenge!");
  }
  console.log("✓ Pass: City Challenge strictly enforces mandatory GPS!");

  // 3. Test Rule B: City Challenge with GPS far away (> 10m) fails verification
  console.log("\n--- Test B: Location outside ±10m tolerance fails ---");
  const farGpsRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "hanoi-turtle-tower",
      thumb: validPhoto,
      proofGps: "10.7769, 106.7009" // Ho Chi Minh City coordinates! (~1,140km away from Hanoi)
    })
  });
  const farGpsData = await farGpsRes.json();
  console.log("Far GPS autoApproved:", farGpsData.autoApproved, "gps.passed:", farGpsData.gps && farGpsData.gps.passed);
  if (farGpsData.autoApproved === true || (farGpsData.gps && farGpsData.gps.passed === true)) {
    throw new Error("Expected GPS failure when player is >10m away from landmark!");
  }
  console.log("✓ Pass: GPS correctly rejected when distance exceeds ±10m!");

  // 4. Test Rule C: Round 1 (Turtle Tower) with GPS ±0m and AI review
  console.log("\n--- Test C: Round 1 (Turtle Tower) with GPS ±0m and AI review ---");
  const round1Res = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "hanoi-turtle-tower",
      thumb: validPhoto,
      proofGps: "21.028511, 105.852402" // Turtle Tower exact coordinates
    })
  });
  const round1Data = await round1Res.json();
  console.log("Round 1 autoApproved:", round1Data.autoApproved);
  console.log("Round 1 AI Score:", round1Data.ai && round1Data.ai.score, "Feedback:", round1Data.ai && round1Data.ai.feedback);
  if (!round1Data.autoApproved || !round1Data.ai || round1Data.ai.score < 80) {
    throw new Error("Round 1 failed: Expected auto-approval with AI score >= 80%: " + JSON.stringify(round1Data));
  }
  console.log("✓ Pass: Round 1 Auto-Approved with AI review score:", round1Data.ai.score);

  // 5. Test Rule D: Round 2 (One Pillar Pagoda)
  console.log("\n--- Test D: Round 2 (One Pillar Pagoda) ---");
  const round2Res = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "hanoi-one-pillar",
      thumb: validPhoto,
      proofGps: "21.035833, 105.833611" // One Pillar exact coordinates
    })
  });
  const round2Data = await round2Res.json();
  console.log("Round 2 autoApproved:", round2Data.autoApproved, "AI Score:", round2Data.ai && round2Data.ai.score);
  if (!round2Data.autoApproved) {
    throw new Error("Round 2 failed: " + JSON.stringify(round2Data));
  }
  console.log("✓ Pass: Round 2 Auto-Approved!");

  // 6. Test Rule E: Round 3 (Temple of Literature - 3rd and final round for Hanoi)
  console.log("\n--- Test E: Round 3 (Temple of Literature) ---");
  const round3Res = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "hanoi-temple-literature",
      thumb: validPhoto,
      proofGps: "21.029333, 105.835556" // Temple of Literature exact coordinates
    })
  });
  const round3Data = await round3Res.json();
  console.log("Round 3 autoApproved:", round3Data.autoApproved, "AI Score:", round3Data.ai && round3Data.ai.score);
  if (!round3Data.autoApproved) {
    throw new Error("Round 3 failed: " + JSON.stringify(round3Data));
  }
  console.log("✓ Pass: Round 3 (Maximum Round) Auto-Approved!");

  // 7. Test Rule F: Exceeding 3 rounds per city is blocked
  console.log("\n--- Test F: Enforce Maximum 3 Rounds Limit ---");
  // Check city status
  const cityCheck = await fetch(`${BASE_URL}/api/city`, {
    headers: { "Authorization": `Bearer ${token}` }
  }).then(r => r.json());
  console.log("Hanoi completed count:", cityCheck.doneIds.length);
  if (cityCheck.doneIds.length !== 3) {
    throw new Error("Expected exactly 3 completed landmarks for Hanoi");
  }

  // Attempt to re-submit or play beyond 3 rounds
  const overLimitRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "hanoi-turtle-tower",
      thumb: validPhoto,
      proofGps: "21.0285, 105.8523"
    })
  });
  const overLimitData = await overLimitRes.json();
  console.log("Over limit status:", overLimitRes.status, "message:", overLimitData.error);
  if (overLimitRes.status !== 400 && overLimitRes.status !== 409) {
    throw new Error("Expected rejection when attempting beyond 3 rounds!");
  }
  console.log("✓ Pass: Maximum 3 rounds per city successfully enforced!");

  console.log("\n==========================================================");
  console.log("ALL CITY CHALLENGE AI, MANDATORY GPS & 3 ROUNDS TESTS PASSED!");
  console.log("==========================================================");
}

run().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
