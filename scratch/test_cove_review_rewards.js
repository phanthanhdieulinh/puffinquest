// scratch/test_cove_review_rewards.js
"use strict";

const BASE_URL = "http://localhost:3000";

async function run() {
  console.log("=== Testing Cove Review Rewards: Reject/Approve (1 Puffin) + Feedback/Encouragement (+1 Puffin) ===");

  const fakeThumb = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  // 1. Register Submitter and submit a Cove quest
  const submitterName = "sub_" + Date.now().toString().slice(-8);
  const subRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: submitterName, password: "password123" })
  }).then(r => r.json());

  const subQuestRes = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${subRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "donate-wear",
      thumb: fakeThumb,
      caption: "Clean clothes donation"
    })
  }).then(r => r.json());
  const submissionId = subQuestRes.submission.id;
  console.log("Cove quest submitted by", submitterName, "with ID:", submissionId);

  // 2. Case 1: Reviewer A REJECTS with NO feedback -> should get 1 Puffin
  const reviewerAName = "rev_a_" + Date.now().toString().slice(-8);
  const revARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: reviewerAName, password: "password123" })
  }).then(r => r.json());
  const initialBalanceA = revARes.user.balance;

  const reviewA = await fetch(`${BASE_URL}/api/cove/review`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${revARes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId,
      decision: "reject",
      comment: ""
    })
  }).then(r => r.json());
  console.log("Review A (Reject, No feedback):", reviewA);

  const profileA = await fetch(`${BASE_URL}/api/profile/me`, {
    headers: { "Authorization": `Bearer ${revARes.token}` }
  }).then(r => r.json());
  console.log("Reviewer A balance before:", initialBalanceA, "after:", profileA.user.balance);

  if (reviewA.reviewerReward !== 1 || reviewA.hasFeedback !== false || profileA.user.balance !== initialBalanceA + 1) {
    throw new Error("Failed Case 1: Reject without feedback should award exactly 1 Puffin");
  }
  console.log("✓ Case 1 Passed: Reject with no feedback awarded 1 Puffin!");

  // 3. Register another submission for testing feedback on reject
  const subQuestRes2 = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${subRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "recycle-battery",
      thumb: fakeThumb,
      caption: "Battery drop-off"
    })
  }).then(r => r.json());
  const submissionId2 = subQuestRes2.submission.id;

  // 4. Case 2: Reviewer B REJECTS WITH feedback -> should get 2 Puffins (1 base + 1 feedback)
  const reviewerBName = "rev_b_" + Date.now().toString().slice(-8);
  const revBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: reviewerBName, password: "password123" })
  }).then(r => r.json());
  const initialBalanceB = revBRes.user.balance;

  const reviewB = await fetch(`${BASE_URL}/api/cove/review`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${revBRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId: submissionId2,
      decision: "reject",
      comment: "Photo is a bit too blurry, please take a clearer shot!"
    })
  }).then(r => r.json());
  console.log("Review B (Reject, With feedback):", reviewB);

  const profileB = await fetch(`${BASE_URL}/api/profile/me`, {
    headers: { "Authorization": `Bearer ${revBRes.token}` }
  }).then(r => r.json());
  console.log("Reviewer B balance before:", initialBalanceB, "after:", profileB.user.balance);

  if (reviewB.reviewerReward !== 2 || reviewB.hasFeedback !== true || profileB.user.balance !== initialBalanceB + 2) {
    throw new Error("Failed Case 2: Reject with feedback should award exactly 2 Puffins (1 base + 1 feedback)");
  }
  console.log("✓ Case 2 Passed: Reject with feedback awarded 2 Puffins (1 base + 1 feedback)!");

  // 5. Register submission 3 for testing approve without encouragement
  const subQuestRes3 = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${subRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "museum-wanderer",
      thumb: fakeThumb,
      caption: "At the museum"
    })
  }).then(r => r.json());
  const submissionId3 = subQuestRes3.submission.id;

  // 6. Case 3: Reviewer C APPROVES with NO encouragement -> should get 1 Puffin
  const reviewerCName = "rev_c_" + Date.now().toString().slice(-8);
  const revCRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: reviewerCName, password: "password123" })
  }).then(r => r.json());
  const initialBalanceC = revCRes.user.balance;

  const reviewC = await fetch(`${BASE_URL}/api/cove/review`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${revCRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId: submissionId3,
      decision: "approve",
      comment: ""
    })
  }).then(r => r.json());
  console.log("Review C (Approve, No encouragement):", reviewC);

  const profileC = await fetch(`${BASE_URL}/api/profile/me`, {
    headers: { "Authorization": `Bearer ${revCRes.token}` }
  }).then(r => r.json());
  console.log("Reviewer C balance before:", initialBalanceC, "after:", profileC.user.balance);

  if (reviewC.reviewerReward !== 1 || reviewC.hasFeedback !== false || profileC.user.balance !== initialBalanceC + 1) {
    throw new Error("Failed Case 3: Approve without encouragement should award exactly 1 Puffin");
  }
  console.log("✓ Case 3 Passed: Approve with no encouragement awarded 1 Puffin!");

  // 7. Register submission 4 for testing approve with encouragement
  const subQuestRes4 = await fetch(`${BASE_URL}/api/quests/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${subRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      questId: "morning-pho",
      thumb: fakeThumb,
      caption: "Delicious morning pho"
    })
  }).then(r => r.json());
  const submissionId4 = subQuestRes4.submission.id;

  // 8. Case 4: Reviewer D APPROVES WITH encouragement -> should get 2 Puffins (1 base + 1 encouragement)
  const reviewerDName = "rev_d_" + Date.now().toString().slice(-8);
  const revDRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: reviewerDName, password: "password123" })
  }).then(r => r.json());
  const initialBalanceD = revDRes.user.balance;

  const reviewD = await fetch(`${BASE_URL}/api/cove/review`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${revDRes.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionId: submissionId4,
      decision: "approve",
      comment: "Such an inspiring cultural morning, keep it up! 🍜✨"
    })
  }).then(r => r.json());
  console.log("Review D (Approve, With encouragement):", reviewD);

  const profileD = await fetch(`${BASE_URL}/api/profile/me`, {
    headers: { "Authorization": `Bearer ${revDRes.token}` }
  }).then(r => r.json());
  console.log("Reviewer D balance before:", initialBalanceD, "after:", profileD.user.balance);

  if (reviewD.reviewerReward !== 2 || reviewD.hasFeedback !== true || profileD.user.balance !== initialBalanceD + 2) {
    throw new Error("Failed Case 4: Approve with encouragement should award exactly 2 Puffins (1 base + 1 encouragement)");
  }
  console.log("✓ Case 4 Passed: Approve with encouragement awarded 2 Puffins (1 base + 1 encouragement)!");

  console.log("\n=======================================================");
  console.log("ALL REVIEW REWARD & FEEDBACK BONUS TESTS PASSED! 🐧🎉");
  console.log("=======================================================");
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
