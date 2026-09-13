// scratch/test_cove_picture_and_gps.js
"use strict";

const BASE_URL = "http://localhost:3000";

async function run() {
  console.log("=== Testing Cove Quest: Picture Required & GPS Optional ===");

  // 1. Register a test user
  const username = "cove_u_" + Date.now().toString().slice(-8);
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "password123" })
  }).then(r => r.json());

  const token = regRes.token;
  console.log("User registered:", username, "Token present:", !!token);

  // 2. Submit Cove quest with GPS ONLY (no thumb/picture)
  const gpsOnlyRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "donate-wear",
      thumb: null,
      proofGps: "10.7769, 106.7009",
      caption: "Arrived at location!"
    })
  });
  const gpsOnlyData = await gpsOnlyRes.json();
  console.log("Submit with GPS only status:", gpsOnlyRes.status);
  console.log("Submit with GPS only error:", gpsOnlyData.error);

  if (gpsOnlyRes.status === 400 && gpsOnlyData.error === "To go to the community, you must take a picture. GPS is optional.") {
    console.log("✓ SUCCESS: Rejected GPS-only submission with exact message: 'To go to the community, you must take a picture. GPS is optional.'");
  } else {
    throw new Error("Failed to reject GPS-only Cove submission properly: " + JSON.stringify(gpsOnlyData));
  }

  // 3. Submit Cove quest with PICTURE ONLY (thumb present, no GPS)
  const fakeThumb = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const photoOnlyRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "donate-wear",
      thumb: fakeThumb,
      proofGps: null,
      caption: "Photo proof for donation"
    })
  });
  const photoOnlyData = await photoOnlyRes.json();
  console.log("Submit with photo only status:", photoOnlyRes.status);
  console.log("Submit with photo only submission status:", photoOnlyData.submission && photoOnlyData.submission.status);

  if (photoOnlyRes.status === 201 && photoOnlyData.submission && photoOnlyData.submission.status === "pending") {
    console.log("✓ SUCCESS: Accepted photo-only submission into Cove community review!");
  } else {
    throw new Error("Failed photo-only submission: " + JSON.stringify(photoOnlyData));
  }

  // 4. Register another user to test picture + GPS (bonus Puffins)
  const username2 = "bonus_u_" + Date.now().toString().slice(-8);
  const regRes2 = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username2, password: "password123" })
  }).then(r => r.json());
  const token2 = regRes2.token;

  const photoAndGpsRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "museum-wanderer",
      thumb: fakeThumb,
      proofGps: "10.7769, 106.7009",
      caption: "Photo and GPS bonus!"
    })
  });
  const photoAndGpsData = await photoAndGpsRes.json();
  console.log("Submit with photo + GPS status:", photoAndGpsRes.status);
  console.log("Submit with photo + GPS total reward:", photoAndGpsData.submission && photoAndGpsData.submission.reward);

  if (photoAndGpsRes.status === 201 && photoAndGpsData.submission && photoAndGpsData.submission.reward >= 38) {
    console.log("✓ SUCCESS: Accepted photo + GPS submission with extra GPS bonus reward (+1) (total reward: " + photoAndGpsData.submission.reward + ")!");
  } else {
    throw new Error("Failed photo + GPS submission: " + JSON.stringify(photoAndGpsData));
  }

  console.log("\n==========================================");
  console.log("ALL BACKEND PROOF VALIDATION TESTS PASSED!");
  console.log("==========================================");
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
