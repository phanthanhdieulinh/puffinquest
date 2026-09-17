"use strict";
(function () {
  const TOKEN_KEY = "pq_token";
  let token = localStorage.getItem(TOKEN_KEY);

  let content = null;
  let user = null;
  let journal = [];
  let questsStatus = { dailyQuestIds: [], dailyDoneIds: [], funDoneIds: [], covePendingIds: [] };
  let coveQueue = [];
  let fightList = [];
  let fishData = { titles: [], badges: [], equippedTitle: null, catchLog: [] };
  let cityData = { city: null, catalog: {}, doneIds: [] };

  let activeQuestId = null;
  let activeIsDaily = false;
  let activeProofGps = null;
  let activeMediaType = "image";
  let previewDataUrl = null;
  let previewThumb = null;
  let pollTimer = null;
  let pendingDirectReviewAfterAuth = null;

  const $ = (id) => document.getElementById(id);
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ================= API ================= */
  async function api(path, opts) {
    opts = opts || {};
    const localDate = new Date().toLocaleDateString("en-CA");
    const headers = Object.assign({ "Content-Type": "application/json", "x-client-date": localDate }, opts.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch("/api" + path, {
      method: opts.method || "GET",
      headers,
      cache: "no-store",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok || data === null) {
      const err = new Error((data && data.error) || "Something went wrong. Please try again.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /* ================= TOASTS + FX ================= */
  function toast(msg, icon) {
    const root = $("toast-root");
    const el = document.createElement("div");
    el.className = "toast";
    const iconSpan = document.createElement("span");
    iconSpan.textContent = icon || "🐧";
    const msgSpan = document.createElement("span");
    msgSpan.textContent = msg;
    el.appendChild(iconSpan);
    el.appendChild(msgSpan);
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 400);
    }, 3200);
  }

  function burstConfetti() {
    const canvas = $("confetti-canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ["#FF6B4A", "#FFC94D", "#1B6B63", "#9FE0D4", "#FFB199"];
    const pieces = Array.from({ length: 60 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.35,
      vx: (Math.random() - 0.5) * 10,
      vy: -Math.random() * 9 - 4,
      size: 5 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3
    }));
    let frame = 0;
    function tick() {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });
      if (frame < 70) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    tick();
  }

  function pulseCoin() {
    const pill = $("coin-pill");
    pill.classList.remove("pulse");
    void pill.offsetWidth;
    pill.classList.add("pulse");
  }

  function celebrateStreak(newStreak) {
    const pill = $("streak-pill");
    pill.classList.remove("grow");
    void pill.offsetWidth;
    pill.classList.add("grow");
    const float = document.createElement("span");
    float.className = "streak-float";
    float.textContent = "🔥 " + newStreak + "!";
    pill.appendChild(float);
    setTimeout(() => float.remove(), 1300);
  }

  /* ================= SOCIAL ICONS ================= */
  const SOCIAL_META = {
    facebook: { symbol: "i-facebook", label: "Facebook" },
    instagram: { symbol: "i-instagram", label: "Instagram" },
    linkedin: { symbol: "i-linkedin", label: "LinkedIn" }
  };

  function renderSocialIcons(container, socialLinks) {
    container.innerHTML = "";
    if (!socialLinks) return;
    Object.keys(SOCIAL_META).forEach((key) => {
      const url = socialLinks[key];
      if (!url) return;
      const span = document.createElement("span");
      span.className = "social-icon-link";
      span.innerHTML = '<svg viewBox="0 0 40 40"><use href="#' + SOCIAL_META[key].symbol + '"/></svg>';
      span.title = SOCIAL_META[key].label;
      span.setAttribute("role", "link");
      span.setAttribute("tabindex", "0");
      span.addEventListener("pointerdown", (e) => e.stopPropagation());
      span.addEventListener("click", (e) => {
        e.stopPropagation();
        window.open(url, "_blank", "noopener,noreferrer");
      });
      container.appendChild(span);
    });
  }

  /* ================= AUTH ================= */
  function showApp() {
    $("auth-overlay").classList.remove("open");
    $("app-shell").style.display = "";
  }
  function showAuth(message) {
    $("app-shell").style.display = "none";
    $("auth-overlay").classList.add("open");
    if (message) showAuthError(message);
  }
  function showAuthError(msg) {
    const el = $("auth-error");
    el.textContent = msg;
    el.style.display = msg ? "" : "none";
  }
  function setToken(t) {
    token = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  $("show-register-btn").addEventListener("click", () => {
    $("auth-form-login").style.display = "none";
    $("auth-form-register").style.display = "flex";
    $("auth-switch-to-register").style.display = "none";
    $("auth-switch-to-login").style.display = "";
    showAuthError(null);
  });
  $("show-login-btn").addEventListener("click", () => {
    $("auth-form-register").style.display = "none";
    $("auth-form-login").style.display = "flex";
    $("auth-switch-to-login").style.display = "none";
    $("auth-switch-to-register").style.display = "";
    showAuthError(null);
  });
  $("social-confirm-checkbox").addEventListener("change", function () {
    $("social-choice-row").style.display = this.checked ? "flex" : "none";
  });

  $("auth-form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    showAuthError(null);
    const username = $("login-username").value.trim();
    const password = $("login-password").value;
    try {
      const { token: t } = await api("/auth/login", { method: "POST", body: { username, password } });
      setToken(t);
      await afterAuthSuccess();
    } catch (err) {
      showAuthError(err.message);
    }
  });

  $("auth-form-register").addEventListener("submit", async (e) => {
    e.preventDefault();
    showAuthError(null);
    const username = $("register-username").value.trim();
    const password = $("register-password").value;
    const socialLinks = {};
    if ($("social-confirm-checkbox").checked) {
      document.querySelectorAll("#social-choice-row input[data-platform]").forEach((cb) => {
        socialLinks[cb.dataset.platform] = cb.checked;
      });
    }
    try {
      const { token: t } = await api("/auth/register", { method: "POST", body: { username, password, socialLinks } });
      setToken(t);
      await afterAuthSuccess();
    } catch (err) {
      showAuthError(err.message);
    }
  });

  async function afterAuthSuccess() {
    await bootApp();
    if (pendingDirectReviewAfterAuth) {
      const id = pendingDirectReviewAfterAuth;
      pendingDirectReviewAfterAuth = null;
      openDirectReview(id);
    }
  }

  $("logout-btn").addEventListener("click", async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (e) {}
    setToken(null);
    if (pollTimer) clearInterval(pollTimer);
    location.reload();
  });

  $("brand-btn").addEventListener("click", () => openLanding());

  /* ================= LANDING PAGE (always reachable at /intro) ================= */
  const landingScroll = $("landing-scroll");
  let landingRevealObserver = null;

  async function renderTrueQuestCampaign() {
    try {
      if (!content) content = await api("/content");
    } catch (e) {}
    if (!content || !content.greenQuestCampaign) return;
    const camp = content.greenQuestCampaign;
    const target = camp.target || 500;
    const completed = camp.completed || 0;
    const fillEl = $("true-quest-fill");
    const countEl = $("true-quest-count");
    const statusEl = $("true-quest-status");
    const badgeEl = $("true-quest-badge");

    const treesPlanted = Math.floor(completed / target);
    const inCycle = completed % target;
    const nextTreeNum = treesPlanted + 1;
    const pct = Math.round((inCycle / target) * 100);

    if (fillEl) fillEl.style.width = pct + "%";
    if (countEl) {
      countEl.textContent = `${inCycle} / ${target} green quests`;
    }
    if (statusEl) {
      let achievedBadge = treesPlanted > 0 ? ` · <span class="trees-achieved-tag">🌳 ${treesPlanted} planted</span>` : "";
      statusEl.innerHTML = `${pct}% towards Tree <strong class="tree-badge-highlight">#${nextTreeNum}</strong>${achievedBadge}`;
    }
    if (badgeEl && treesPlanted > 0) {
      badgeEl.innerHTML = `🌱 True Quest · <span class="trees-achieved-tag" style="margin-left:0;">🌳 ${treesPlanted} tree${treesPlanted > 1 ? "s" : ""} achieved!</span>`;
    }
  }

  function openLanding(pushUrl) {
    $("landing-overlay").classList.add("open");
    document.body.style.overflow = "hidden";
    landingScroll.scrollTop = 0;
    if (pushUrl !== false) history.pushState(null, "", "/intro");
    renderTrueQuestCampaign().catch(() => {});
    if (!landingRevealObserver && "IntersectionObserver" in window) {
      landingRevealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("in-view");
              landingRevealObserver.unobserve(entry.target);
            }
          });
        },
        { root: landingScroll, threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
      );
    }
    if (landingRevealObserver) {
      document.querySelectorAll(".landing-reveal:not(.in-view)").forEach((el) => landingRevealObserver.observe(el));
    } else {
      document.querySelectorAll(".landing-reveal").forEach((el) => el.classList.add("in-view"));
    }
  }
  function closeLanding() {
    $("landing-overlay").classList.remove("open");
    document.body.style.overflow = "";
    if (location.pathname === "/intro") history.pushState(null, "", "/");
  }
  $("landing-close").addEventListener("click", closeLanding);
  $("landing-start-btn").addEventListener("click", closeLanding);
  $("landing-overlay").addEventListener("click", (e) => {
    if (e.target === $("landing-overlay")) closeLanding();
  });

  function wirePuffinGreet(mascotId, speechId, kidsContainerId) {
    const mascot = $(mascotId);
    const speech = $(speechId);
    const kids = document.querySelectorAll("#" + kidsContainerId + " .puffin-kid");
    let timer = null;
    mascot.addEventListener("click", () => {
      clearTimeout(timer);
      speech.classList.remove("show");
      kids.forEach((k) => k.classList.remove("show"));
      void mascot.offsetWidth;
      speech.classList.add("show");
      kids.forEach((k) => k.classList.add("show"));
      timer = setTimeout(() => {
        speech.classList.remove("show");
        kids.forEach((k) => k.classList.remove("show"));
      }, 2200);
    });
  }
  wirePuffinGreet("landing-mascot", "puffin-speech", "puffin-kids");
  wirePuffinGreet("quest-mascot", "quest-puffin-speech", "quest-puffin-kids");

  const landingCarousel = $("landing-carousel");
  landingCarousel.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      landingCarousel.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false }
  );

  /* ================= HEADER / DASHBOARD ================= */
  function renderHeader() {
    $("coin-amt").textContent = user.balance;
    $("streak-val").textContent = user.streak;
    $("player-name").textContent = user.displayName;
    $("today-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    // Freeze badge
    const freezeBadge = $("freeze-badge");
    const freezeCount = $("freeze-count");
    if (freezeBadge && freezeCount) {
      const count = user.streakFreezes || 0;
      freezeCount.textContent = count;
      freezeBadge.classList.toggle("has-freezes", count > 0);
    }
  }

  /* ================= QUEST GRIDS ================= */
  function questStatusFor(id, isDaily) {
    const doneIds = isDaily ? questsStatus.dailyDoneIds : questsStatus.funDoneIds;
    return doneIds.includes(id) ? "done" : "new";
  }

  function makeQuestCard(q, isDaily, isDone = false) {
    const card = document.createElement("button");
    card.type = "button";
    const isPending = !isDaily && questsStatus.covePendingIds && questsStatus.covePendingIds.includes(q.id);
    card.className = "qcard glass" + (isDone ? " is-done" : " glass-interactive") + (isPending ? " is-pending" : "");
    let chipHtml = "";
    if (isDone) {
      chipHtml = '<span class="status-chip status-done">✅ Finished</span>';
    } else if (isPending) {
      chipHtml = '<span class="status-chip status-pending">In Cove ⏳</span>';
    } else if (isDaily) {
      chipHtml = '<span class="status-chip status-new">Today\'s</span>';
    } else {
      chipHtml = '<span class="status-chip status-new">Cove Quest</span>';
    }
    card.innerHTML =
      '<div class="glass-sheen"></div>' +
      '<div class="icon-chip">' + q.icon + "</div>" +
      '<div class="qtitle">' + q.title + "</div>" +
      '<div class="qdesc">' + q.desc + "</div>" +
      '<div class="qcard-foot">' +
      '<span class="reward-chip"><svg viewBox="0 0 64 64"><use href="#i-puffin"/></svg>+' + q.reward + "</span>" +
      chipHtml +
      "</div>";
    if (isDone) {
      card.addEventListener("click", () => toast("Quest already finished today! ✅", "🐧"));
    } else {
      card.addEventListener("click", () => openModal(q.id, isDaily));
    }
    return card;
  }

  let currentCovePanel = 0;
  function switchCovePanel(idx) {
    currentCovePanel = idx;
    const track = $("cove-carousel-track");
    const indicator = $("cove-seg-indicator");
    const btns = [$("btn-cove-green"), $("btn-cove-culture"), $("btn-cove-random")];
    if (track) track.style.transform = "translateX(-" + (idx * 33.333333) + "%)";
    if (indicator) indicator.style.transform = "translateX(" + (idx * 100) + "%)";
    btns.forEach((b, i) => { if (b) b.classList.toggle("active", i === idx); });
  }
  if ($("btn-cove-green")) $("btn-cove-green").addEventListener("click", () => switchCovePanel(0));
  if ($("btn-cove-culture")) $("btn-cove-culture").addEventListener("click", () => switchCovePanel(1));
  if ($("btn-cove-random")) $("btn-cove-random").addEventListener("click", () => switchCovePanel(2));

  // Today's Quest: All 4 displayed. Completed ones stay in place with a line through them.
  // Randomizing (reroll) only randomizes the outstanding ones.
  function renderQuestGrids() {
    if (!content) return;
    const dailyGrid = $("daily-grid");
    dailyGrid.innerHTML = "";
    const doneIds = questsStatus.dailyDoneIds || [];
    const todaysQuests = (questsStatus.dailyQuestIds || []).map((id) => (content.dailyPool || []).find((q) => q.id === id)).filter(Boolean);

    if (todaysQuests.length) {
      todaysQuests.forEach((q) => {
        const isDone = doneIds.includes(q.id);
        dailyGrid.appendChild(makeQuestCard(q, true, isDone));
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "fish-empty";
      empty.textContent = "All done for today — nice! New quests refresh at 23:59 tonight.";
      dailyGrid.appendChild(empty);
    }
    const doneCount = Math.min(4, todaysQuests.filter((q) => doneIds.includes(q.id)).length);
    $("daily-progress").textContent = doneCount + "/4 done";

    const rerollBtn = $("daily-reroll-btn");
    if (rerollBtn) {
      if (doneCount >= 4) {
        rerollBtn.disabled = true;
        rerollBtn.style.opacity = "0.35";
        rerollBtn.style.cursor = "not-allowed";
        rerollBtn.title = "All 4 Daily Quests completed! Refreshes at 23:59 tonight.";
      } else {
        rerollBtn.disabled = false;
        rerollBtn.style.opacity = "1";
        rerollBtn.style.cursor = "pointer";
        const outstanding = 4 - doneCount;
        rerollBtn.title = `Randomize remaining ${outstanding} quest(s)`;
      }
    }

    // Panel 0: Green Quests
    const greenGrid = $("green-grid");
    if (greenGrid) {
      greenGrid.innerHTML = "";
      const remainingGreen = (content.greenPool || []).filter((q) => !questsStatus.funDoneIds.includes(q.id));
      if (remainingGreen.length) {
        remainingGreen.forEach((q) => greenGrid.appendChild(makeQuestCard(q, false)));
      } else {
        const empty = document.createElement("div");
        empty.className = "fish-empty";
        empty.textContent = "You've waddled through all Green quests! 🌿";
        greenGrid.appendChild(empty);
      }
    }

    // Panel 1: Culture Quests (Museums, Traditional Morning Pho, Historic sanctuaries)
    const cultureGrid = $("culture-grid");
    if (cultureGrid) {
      cultureGrid.innerHTML = "";
      const remainingCulture = (content.culturePool || []).filter((q) => !questsStatus.funDoneIds.includes(q.id));
      if (remainingCulture.length) {
        remainingCulture.forEach((q) => cultureGrid.appendChild(makeQuestCard(q, false)));
      } else {
        const empty = document.createElement("div");
        empty.className = "fish-empty";
        empty.textContent = "You've completed all Culture journeys! 🏛️";
        cultureGrid.appendChild(empty);
      }
    }

    // Panel 2: Random Fun Quests (Sunset, Reading/Learning, Kindness, Nature)
    const funGrid = $("fun-grid");
    if (funGrid) {
      funGrid.innerHTML = "";
      const remainingFun = (content.funPool || []).filter((q) => !questsStatus.funDoneIds.includes(q.id));
      if (remainingFun.length) {
        remainingFun.forEach((q) => funGrid.appendChild(makeQuestCard(q, false)));
      } else {
        const empty = document.createElement("div");
        empty.className = "fish-empty";
        empty.textContent = "All Random adventures completed! 🎲";
        funGrid.appendChild(empty);
      }
    }
  }

  $("daily-reroll-btn").addEventListener("click", async () => {
    try {
      const { dailyQuestIds } = await api("/quests/reroll", { method: "POST" });
      questsStatus.dailyQuestIds = dailyQuestIds;
      renderQuestGrids();
      toast("Fresh quests waddled in!", "🔀");
    } catch (err) {
      toast(err.message, "⚠️");
    }
  });

  /* ================= QUEST MODAL ================= */
  const overlay = $("modal-overlay");

  function cityLandmarksFlat() {
    if (!content || !content.cityChallenges) return [];
    const out = [];
    for (const key of Object.keys(content.cityChallenges)) {
      for (const l of content.cityChallenges[key].landmarks) {
        out.push({
          ...l,
          cityKey: key,
          requiresPhoto: true,
          requiresGps: true,
          targetGps: l.lat + ", " + l.lng
        });
      }
    }
    return out;
  }

  function findQuest(id) {
    return (content.dailyPool || [])
      .concat(content.greenPool || [])
      .concat(content.funPool || [])
      .concat(cityLandmarksFlat())
      .find((q) => q.id === id);
  }

  function showModalStage(stage) {
    $("modal-body-idle").style.display = stage === "idle" ? "" : "none";
    const cityVerify = $("modal-body-city-verify");
    if (cityVerify) cityVerify.style.display = stage === "city-verify" ? "" : "none";
    $("modal-body-done").style.display = stage === "done" ? "" : "none";
  }

  function updateModalRewardDisplay() {
    const q = findQuest(activeQuestId);
    if (!q) return;
    const caption = $("caption-input").value.trim();
    const bonus = (previewDataUrl ? content.photoBonus : 0) + (caption ? content.captionBonus : 0) + (activeProofGps ? 1 : 0);
    $("modal-reward-amt").textContent = "+" + (q.reward + bonus) + " Puffins";
  }

  function checkProofRequirement() {
    const q = findQuest(activeQuestId);
    if (!q) return;
    const isCity = !!q.cityKey;
    const submitBtn = $("submit-btn");
    if (!submitBtn) return;
    if (isCity) {
      // Challenge requires BOTH photo and GPS location
      const attempts = (cityData && cityData.attempts && cityData.attempts[q.id]) || 0;
      if (attempts >= 3) {
        submitBtn.disabled = true;
        submitBtn.textContent = "🔒 Locked (3/3 Attempts Used)";
        return;
      }
      const attemptNum = attempts + 1;
      const hasPhoto = !!previewThumb;
      const hasGps = !!activeProofGps;
      submitBtn.disabled = !(hasPhoto && hasGps);
      if (!hasPhoto && !hasGps) {
        submitBtn.textContent = `📸 Snap photo & 🛰️ Acquire GPS (Attempt ${attemptNum}/3)`;
      } else if (!hasPhoto) {
        submitBtn.textContent = `📸 Snap photo matching view (Attempt ${attemptNum}/3)`;
      } else if (!hasGps) {
        submitBtn.textContent = `🛰️ Acquire GPS to verify (Attempt ${attemptNum}/3)`;
      } else {
        submitBtn.textContent = `Verify & Auto-Approve (Attempt ${attemptNum}/3)`;
      }
    } else if (activeIsDaily) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Complete Quest";
    } else {
      // Cove Quest: to go to the community, you must take a picture. GPS is optional.
      const hasPhoto = !!previewThumb;
      submitBtn.disabled = !hasPhoto;
      submitBtn.textContent = hasPhoto ? "Submit to Cove" : "Take or upload a picture (required)";
    }
  }

  let greenMapInstance = null;
  let greenMapMarkers = [];
  let userCurrentLocation = null;
  let activeGreenQuestSpots = [];
  let currentCityFilter = "all";

  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatDistance(km) {
    if (km < 1) return Math.round(km * 1000) + "m away";
    return km.toFixed(1) + "km away";
  }

  function setupGreenPanel(quest) {
    const panel = $("green-quest-panel");
    if (!panel) return;
    if (!quest.spots || !quest.spots.length) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "block";
    activeGreenQuestSpots = quest.spots;
    currentCityFilter = "all";

    document.querySelectorAll(".city-filter-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.city === "all");
    });

    const guideBox = $("green-guide-box");
    const guideSteps = $("green-guide-steps");
    if (guideBox && guideSteps) {
      if (quest.guide && quest.guide.length) {
        guideBox.style.display = "block";
        guideSteps.innerHTML = quest.guide.map((s) => `<div class="green-guide-step">${s}</div>`).join("");
      } else {
        guideBox.style.display = "none";
      }
    }

    const bonusBox = $("green-bonus-box");
    const bonusText = $("green-bonus-text");
    if (bonusBox && bonusText) {
      if (quest.bonusNote) {
        bonusBox.style.display = "block";
        bonusText.textContent = quest.bonusNote;
      } else {
        bonusBox.style.display = "none";
      }
    }

    $("nearest-spot-name").textContent = 'Tap "Find Nearest" or pick a spot on the map';
    $("nearest-spot-addr").textContent = 'Browse pinned drop-offs in Vietnam & Singapore below';
    $("nearest-spot-dist").textContent = '';
    $("nearest-actions").style.display = 'none';

    renderGreenSpotsList(quest.spots);
    initOrUpdateGreenMap(quest.spots);
  }

  function initOrUpdateGreenMap(spots) {
    const mapContainer = $("green-interactive-map");
    if (!mapContainer) return;

    if (!window.L) {
      mapContainer.innerHTML = '<div style="padding:20px;text-align:center;font-size:12px;color:var(--ink-soft);">Map library loading...</div>';
      return;
    }

    if (!greenMapInstance) {
      greenMapInstance = L.map(mapContainer, { zoomControl: true, attributionControl: false }).setView([16.0, 107.0], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19
      }).addTo(greenMapInstance);
    }

    greenMapMarkers.forEach((m) => {
      try { greenMapInstance.removeLayer(m); } catch (e) {}
    });
    greenMapMarkers = [];

    const bounds = [];
    spots.forEach((spot) => {
      if (!spot.lat || !spot.lng) return;
      const marker = L.marker([spot.lat, spot.lng], {
        title: spot.name
      }).addTo(greenMapInstance);

      const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + ' ' + spot.address)}`;
      const popupHtml = `
        <div style="font-family:sans-serif;font-size:12px;min-width:160px;">
          <strong style="color:#1B6B63;font-size:13px;display:block;margin-bottom:3px;">${spot.name}</strong>
          <div style="color:#4C6C6E;margin-bottom:6px;line-height:1.3;">${spot.address}</div>
          <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:4px 10px;background:#4285F4;color:#fff;border-radius:10px;text-decoration:none;font-size:11px;font-weight:bold;">
            🗺️ Google Maps ↗️
          </a>
        </div>
      `;
      marker.bindPopup(popupHtml);
      marker.on("click", () => selectSpot(spot));
      greenMapMarkers.push(marker);
      bounds.push([spot.lat, spot.lng]);
    });

    setTimeout(() => {
      if (greenMapInstance) {
        greenMapInstance.invalidateSize();
        if (bounds.length) {
          greenMapInstance.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
        }
      }
    }, 250);
  }

  function selectSpot(spot) {
    $("nearest-spot-name").textContent = spot.name;
    $("nearest-spot-addr").textContent = spot.address;
    const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + ' ' + spot.address)}`;
    $("nearest-gmap-btn").href = gmapUrl;
    $("nearest-actions").style.display = "flex";

    if (userCurrentLocation) {
      const dist = distanceKm(userCurrentLocation.lat, userCurrentLocation.lng, spot.lat, spot.lng);
      $("nearest-spot-dist").textContent = `📍 ${formatDistance(dist)} from your location`;
    } else {
      $("nearest-spot-dist").textContent = `📍 City: ${spot.city}`;
    }

    $("nearest-checkin-btn").onclick = () => {
      activeProofGps = `${spot.lat.toFixed(5)}, ${spot.lng.toFixed(5)}`;
      const badge = $("gps-badge");
      if (badge) {
        badge.style.display = "inline-flex";
        $("gps-coords-text").textContent = `📍 Checked in at ${spot.name}`;
      }
      checkProofRequirement();
      updateModalRewardDisplay();
      toast(`Checked in at ${spot.name}! 📍`, "✓");
    };

    if (greenMapInstance && spot.lat && spot.lng) {
      greenMapInstance.flyTo([spot.lat, spot.lng], 15, { animate: true, duration: 0.8 });
    }
  }

  function renderGreenSpotsList(spots) {
    const list = $("green-spots-list");
    if (!list) return;
    list.innerHTML = "";
    $("green-spot-count").textContent = spots.length + " spots";

    spots.forEach((spot) => {
      const row = document.createElement("div");
      row.className = "green-spot-row";
      const gmapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + ' ' + spot.address)}`;
      let distText = "";
      if (userCurrentLocation) {
        const d = distanceKm(userCurrentLocation.lat, userCurrentLocation.lng, spot.lat, spot.lng);
        distText = ` · <span style="color:var(--coral-dark);font-weight:700;">${formatDistance(d)}</span>`;
      }
      row.innerHTML = `
        <div class="green-spot-row-info">
          <div class="green-spot-row-name">${spot.name}</div>
          <div class="green-spot-row-addr">${spot.address}${distText}</div>
        </div>
        <a href="${gmapUrl}" target="_blank" rel="noopener noreferrer" class="green-spot-row-action" title="Open in Google Maps">
          Google Maps ↗️
        </a>
      `;
      row.addEventListener("click", (e) => {
        if (e.target.tagName === "A") return;
        selectSpot(spot);
      });
      list.appendChild(row);
    });
  }

  document.querySelectorAll(".city-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".city-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const city = btn.dataset.city;
      currentCityFilter = city;
      let filtered = activeGreenQuestSpots;
      if (city !== "all") {
        filtered = activeGreenQuestSpots.filter((s) => s.city.toLowerCase().includes(city.toLowerCase()));
      }
      initOrUpdateGreenMap(filtered);
      renderGreenSpotsList(filtered);
    });
  });

  if ($("btn-find-nearest")) {
    $("btn-find-nearest").addEventListener("click", () => {
      if (!navigator.geolocation) {
        toast("Geolocation is not supported by your browser.", "⚠️");
        return;
      }
      $("btn-find-nearest").disabled = true;
      $("btn-find-nearest").textContent = "Locating...";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          $("btn-find-nearest").disabled = false;
          $("btn-find-nearest").textContent = "📍 Find Nearest";
          userCurrentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };

          const sorted = [...activeGreenQuestSpots].sort((a, b) => {
            const da = distanceKm(userCurrentLocation.lat, userCurrentLocation.lng, a.lat, a.lng);
            const db = distanceKm(userCurrentLocation.lat, userCurrentLocation.lng, b.lat, b.lng);
            return da - db;
          });

          if (sorted.length) {
            selectSpot(sorted[0]);
            renderGreenSpotsList(sorted);
            toast(`Found nearest spot: ${sorted[0].name}!`, "🎯");
          }
        },
        (err) => {
          $("btn-find-nearest").disabled = false;
          $("btn-find-nearest").textContent = "📍 Find Nearest";
          toast("Couldn't retrieve GPS location. Please allow location permissions.", "⚠️");
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  let lastCompletedSubmission = null;

  function openModal(questId, isDaily) {
    const q = findQuest(questId);
    if (!q) return;
    activeQuestId = questId;
    activeIsDaily = isDaily;
    previewDataUrl = null;
    previewThumb = null;
    activeProofGps = null;
    userCurrentLocation = null;
    activeMediaType = "image";

    setupGreenPanel(q);

    const isCity = !!q.cityKey;

    if (isCity) {
      $("modal-icon").textContent = q.icon || "🏛️";
      $("modal-icon").style.filter = "blur(3px) saturate(1.2)";
      $("modal-icon").style.opacity = "0.75";
      $("modal-title").textContent = "Mystery Landmark";
    } else {
      $("modal-icon").textContent = q.icon;
      $("modal-icon").style.filter = "";
      $("modal-icon").style.opacity = "";
      $("modal-title").textContent = q.title;
    }
    $("modal-desc").textContent = q.desc;
    $("preview-holder").innerHTML = "";
    $("file-input").value = "";
    $("caption-input").value = "";
    $("caption-count").textContent = "0/50";

    const refBox = $("city-ref-photo-box");
    const refImg = $("city-ref-img");
    if (refBox && refImg) {
      if (isCity && q.refPhoto) {
        refImg.src = q.refPhoto;
        refBox.style.display = "block";
      } else {
        refBox.style.display = "none";
        refImg.src = "";
      }
    }

    const gpsBadge = $("gps-badge");
    const gpsBtn = $("gps-btn");
    if (gpsBadge) gpsBadge.style.display = "none";
    if (gpsBtn) {
      gpsBtn.style.display = "";
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = isCity ? "<span>📍 Acquire GPS (Required)</span>" : "<span>📍 Share GPS (optional)</span>";
    }

    const proofNote = $("proof-note");
    const proofNoteText = $("proof-note-text");
    if (proofNote && proofNoteText) {
      if (isCity) {
        proofNoteText.innerHTML = "🏙️ <strong>GPS required (±10m)</strong> · 📸 <strong>AI photo review</strong> · Match reference angle";
        proofNote.style.display = "flex";
      } else if (isDaily) {
        proofNoteText.innerHTML = "🌤️ <strong>Instant reward</strong> · Photo & GPS are optional bonuses!";
        proofNote.style.display = "flex";
      } else {
        proofNote.style.display = "none";
      }
    }

    // Toggle button: remembers user's saved preference until they click it again
    const profileToggle = $("post-to-profile-toggle");
    const profileRow = profileToggle ? profileToggle.closest(".post-to-profile-row") : null;
    if (profileToggle) {
      // Hide auto-post toggle for City Challenge (AI auto-approves, not community)
      if (profileRow) profileRow.style.display = isCity ? "none" : "";
      const savedPref = localStorage.getItem("pq_auto_post_profile");
      profileToggle.checked = savedPref !== "false";
      if (!profileToggle._wiredPref) {
        profileToggle._wiredPref = true;
        profileToggle.addEventListener("change", () => {
          localStorage.setItem("pq_auto_post_profile", String(profileToggle.checked));
        });
      }
    }

    const typePill = $("modal-quest-type-pill");
    if (typePill) {
      if (isCity) {
        typePill.textContent = "🏙️ Challenge · Mystery Landmark";
        typePill.className = "modal-quest-type-pill is-city";
      } else if (isDaily) {
        typePill.textContent = "🌤️ Today's Quest · Instant Reward";
        typePill.className = "modal-quest-type-pill is-daily";
      } else {
        typePill.textContent = "🫧 Cove Quest · Community Approved";
        typePill.className = "modal-quest-type-pill is-cove";
      }
    }

    const isDev =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname.startsWith("192.168.") ||
      location.hostname.startsWith("10.") ||
      location.hostname.startsWith("172.") ||
      location.hostname.endsWith(".local");
    const devGpsBtn = $("gps-dev-btn");
    if (devGpsBtn) {
      devGpsBtn.style.display = (isCity && isDev) ? "" : "none";
    }

    if (isCity) {
      const attempts = (cityData && cityData.attempts && cityData.attempts[questId]) || 0;
      $("dropzone-label").textContent = "📸 Snap photo matching the reference (required)";
      $("dropzone-sub").textContent = attempts >= 3
        ? "🔒 Maximum 3 attempts reached today. Refreshes at 23:59 PM."
        : `GPS + AI Detective will verify location & view · Attempt ${attempts + 1} of 3`;
      checkProofRequirement();
    } else if (isDaily) {
      $("submit-btn").textContent = "Complete Quest";
      $("dropzone-label").textContent = "Tap to snap or upload a photo or video (optional)";
      $("dropzone-sub").textContent = "Finish today for instant reward! Photo/video/GPS gives bonus";
      $("submit-btn").disabled = false;
    } else {
      $("submit-btn").textContent = "Submit to Cove";
      $("dropzone-label").textContent = "Take or upload a picture (required)";
      $("dropzone-sub").textContent = "Photo is needed for community review";
      checkProofRequirement();
    }

    const isPending = !isDaily && questsStatus.covePendingIds && questsStatus.covePendingIds.includes(questId);
    const status = questStatusFor(questId, isDaily);
    if (isPending) {
      $("done-title").textContent = "In Cove Review ⏳";
      $("done-msg").textContent = "Your proof is currently in Cove waiting for community approval. You'll receive your Puffins once approved!";
      $("done-share-row").style.display = "";
      const entry = journal.find((e) => e.questId === questId);
      lastCompletedSubmission = entry ? { id: entry.id } : null;
      showModalStage("done");
    } else if (status === "done") {
      const entry = journal.find((e) => e.questId === questId);
      $("done-title").textContent = "Quest Complete!";
      $("done-msg").textContent = "You earned +" + (entry ? entry.reward : q.reward) + " Puffins.";
      $("done-share-row").style.display = !isDaily && entry ? "" : "none";
      lastCompletedSubmission = !isDaily && entry ? { id: entry.id } : null;
      showModalStage("done");
    } else {
      showModalStage("idle");
    }
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    if ($("green-quest-panel")) $("green-quest-panel").style.display = "none";
    if ($("city-ref-photo-box")) $("city-ref-photo-box").style.display = "none";
    if ($("city-ref-img")) $("city-ref-img").src = "";
    if ($("modal-icon")) {
      $("modal-icon").style.filter = "";
      $("modal-icon").style.opacity = "";
    }
    activeProofGps = null;
    userCurrentLocation = null;
    previewDataUrl = null;
    previewThumb = null;
    activeMediaType = "image";
    if ($("gps-badge")) $("gps-badge").style.display = "none";
    if ($("gps-btn")) {
      $("gps-btn").style.display = "";
      $("gps-btn").disabled = false;
    }
  }
  $("modal-close").addEventListener("click", closeModal);
  $("done-close-btn").addEventListener("click", closeModal);
  $("done-share-btn").addEventListener("click", () => {
    if (!lastCompletedSubmission) return;
    const url = new URL(location.href);
    url.search = "";
    url.pathname = "/review/" + lastCompletedSubmission.id;
    copyToClipboard(url.toString(), "Link copied — send it to a friend to approve!");
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (overlay.classList.contains("open")) closeModal();
    else if ($("shared-profile-overlay").classList.contains("open")) closeSharedProfile();
    else if ($("landing-overlay").classList.contains("open")) closeLanding();
    else if ($("direct-review-overlay").classList.contains("open")) closeDirectReview();
  });

  function makeThumbnail(dataUrl, cb, maxSize) {
    maxSize = maxSize || 160;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const cctx = c.getContext("2d");
      cctx.drawImage(img, 0, 0, w, h);
      try {
        cb(c.toDataURL("image/jpeg", 0.6));
      } catch (e) {
        cb(null);
      }
    };
    img.onerror = () => cb(null);
    img.src = dataUrl;
  }

  const dropzone = $("dropzone");
  const fileInput = $("file-input");
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  ["dragover", "dragenter"].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  // GPS Proof Handling
  const gpsBtn = $("gps-btn");

  if (gpsBtn) {
    gpsBtn.addEventListener("click", () => {
      if (!navigator.geolocation) {
        toast("GPS is not supported on this browser.", "⚠️");
        return;
      }
      gpsBtn.disabled = true;
      gpsBtn.innerHTML = "<span>Acquiring GPS... 🛰️</span>";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          activeProofGps = lat + ", " + lng;
          $("gps-coords-text").textContent = "📍 GPS Verified (" + activeProofGps + ")";
          $("gps-badge").style.display = "inline-flex";
          gpsBtn.style.display = "none";
          const devBtn = $("gps-dev-btn");
          if (devBtn) devBtn.style.display = "none";
          gpsBtn.disabled = false;
          const qNow = findQuest(activeQuestId);
          gpsBtn.innerHTML = (qNow && qNow.cityKey) ? "<span>📍 Acquire GPS (Required)</span>" : "<span>📍 Share GPS (optional)</span>";
          updateModalRewardDisplay();
          checkProofRequirement();
          toast("Location verified via GPS!", "📍");
        },
        (err) => {
          gpsBtn.disabled = false;
          const qNow = findQuest(activeQuestId);
          gpsBtn.innerHTML = (qNow && qNow.cityKey) ? "<span>📍 Acquire GPS (Required)</span>" : "<span>📍 Share GPS (optional)</span>";
          toast("GPS could not be read: " + (err.message || "Permission denied"), "⚠️");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  const gpsDevBtn = $("gps-dev-btn");
  if (gpsDevBtn) {
    gpsDevBtn.addEventListener("click", () => {
      const qNow = findQuest(activeQuestId);
      if (qNow && qNow.lat && qNow.lng) {
        activeProofGps = qNow.lat.toFixed(6) + ", " + qNow.lng.toFixed(6);
        $("gps-coords-text").textContent = "📍 GPS Simulated (±0m to " + qNow.title + ")";
        $("gps-badge").style.display = "inline-flex";
        if (gpsBtn) gpsBtn.style.display = "none";
        gpsDevBtn.style.display = "none";
        updateModalRewardDisplay();
        checkProofRequirement();
        toast("Simulated on-site GPS (±0m) for testing!", "🧪");
      }
    });
  }

  const gpsRemoveBtn = $("gps-remove-btn");
  if (gpsRemoveBtn) {
    gpsRemoveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      activeProofGps = null;
      $("gps-badge").style.display = "none";
      if (gpsBtn) gpsBtn.style.display = "";
      const qNow = findQuest(activeQuestId);
      const isCityNow = qNow && qNow.cityKey;
      const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1";
      if (gpsDevBtn) gpsDevBtn.style.display = (isCityNow && isDev) ? "" : "none";
      updateModalRewardDisplay();
      checkProofRequirement();
    });
  }

  function handleFile(file) {
    if (!file.type || (!file.type.startsWith("image/") && !file.type.startsWith("video/"))) {
      toast("Please choose an image or video file.", "⚠️");
      return;
    }

    if (file.type.startsWith("video/")) {
      activeMediaType = "video";
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = e.target.result;
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.src = raw;
        v.onloadeddata = () => {
          v.currentTime = Math.min(1, (v.duration || 1) / 2);
        };
        v.onseeked = () => {
          const c = document.createElement("canvas");
          const scale = Math.min(1, 320 / Math.max(v.videoWidth || 320, v.videoHeight || 240));
          c.width = Math.max(1, Math.round((v.videoWidth || 320) * scale));
          c.height = Math.max(1, Math.round((v.videoHeight || 240) * scale));
          const ctx = c.getContext("2d");
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const t = c.toDataURL("image/jpeg", 0.6);
          previewDataUrl = t;
          previewThumb = t;
          $("preview-holder").innerHTML =
            '<div class="preview-wrap"><img src="' + t + '" alt="Video proof thumbnail"/><span class="video-play-indicator" style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,0.65);padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;">▶ Video Proof</span>' +
            '<button class="preview-remove" id="preview-remove" type="button" aria-label="Remove video">✕</button></div>';
          updateModalRewardDisplay();
          checkProofRequirement();
          $("preview-remove").addEventListener("click", (ev) => {
            ev.stopPropagation();
            previewDataUrl = null;
            previewThumb = null;
            $("preview-holder").innerHTML = "";
            updateModalRewardDisplay();
            checkProofRequirement();
          });
        };
        v.onerror = () => {
          toast("Couldn't process that video file.", "⚠️");
        };
      };
      reader.readAsDataURL(file);
      return;
    }

    activeMediaType = "image";
    const reader = new FileReader();
    reader.onload = (e) => {
      const raw = e.target.result;
      makeThumbnail(raw, (t) => {
        if (!t) {
          toast("Couldn't load that image.", "⚠️");
          return;
        }
        previewDataUrl = t;
        previewThumb = t;
        $("preview-holder").innerHTML =
          '<div class="preview-wrap"><img src="' + t + '" alt="Your quest proof photo"/>' +
          '<button class="preview-remove" id="preview-remove" type="button" aria-label="Remove photo">✕</button></div>';
        updateModalRewardDisplay();
        checkProofRequirement();
        $("preview-remove").addEventListener("click", (ev) => {
          ev.stopPropagation();
          previewDataUrl = null;
          previewThumb = null;
          $("preview-holder").innerHTML = "";
          updateModalRewardDisplay();
          checkProofRequirement();
        });
      }, 640);
    };
    reader.readAsDataURL(file);
  }

  $("caption-input").addEventListener("input", function () {
    $("caption-count").textContent = this.value.length + "/50";
    updateModalRewardDisplay();
  });

  async function handleCityChallengeSubmission({ questId, q, caption, thumb, proofGps, mediaType, postToProfile }) {
    showModalStage("city-verify");

    const p1Card = $("trio-puffin-1");
    const p1Status = $("puffin-1-status");
    const p1Detail = $("puffin-1-detail");

    const p2Card = $("trio-puffin-2");
    const p2Status = $("puffin-2-status");
    const p2Detail = $("puffin-2-detail");

    const p3Card = $("trio-puffin-3");
    const p3Status = $("puffin-3-status");
    const p3Detail = $("puffin-3-detail");

    const doneBtn = $("city-verify-done-btn");
    const retryBtn = $("city-verify-retry-btn");
    const cancelBtn = $("city-verify-cancel-btn");

    // Reset initial inspection states
    [p1Card, p2Card, p3Card].forEach((c) => {
      if (c) c.className = "puffin-trio-card";
    });
    if (p1Status) {
      p1Status.className = "puffin-trio-status status-checking";
      p1Status.textContent = "Checking GPS 🛰️...";
    }
    if (p1Detail) p1Detail.textContent = "Checking within ±10m tolerance...";
    if (p1Card) p1Card.classList.add("is-active");

    if (p2Status) {
      p2Status.className = "puffin-trio-status status-waiting";
      p2Status.textContent = "Waiting...";
    }
    if (p2Detail) p2Detail.textContent = "Pending GPS check";

    if (p3Status) {
      p3Status.className = "puffin-trio-status status-waiting";
      p3Status.textContent = "Waiting...";
    }
    if (p3Detail) p3Detail.textContent = "Pending verification";

    if (doneBtn) doneBtn.style.display = "none";
    if (retryBtn) retryBtn.style.display = "none";
    if (cancelBtn) cancelBtn.style.display = "none";

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      const resPromise = api("/quests/submit", {
        method: "POST",
        body: { questId, caption, thumb, proofGps, mediaType, postToProfile }
      });

      // Puffin 1: GPS inspection
      await sleep(750);
      let res;
      try {
        res = await resPromise;
      } catch (apiErr) {
        if (p1Card) {
          p1Card.classList.remove("is-active");
          p1Card.classList.add("is-failed");
        }
        if (p1Status) {
          p1Status.className = "puffin-trio-status status-failed";
          p1Status.textContent = "✕ Error";
        }
        if (p1Detail) p1Detail.textContent = apiErr.message || "Failed to reach server.";
        if (retryBtn) {
          retryBtn.style.display = "";
          retryBtn.onclick = () => showModalStage("idle");
        }
        if (cancelBtn) {
          cancelBtn.style.display = "";
          cancelBtn.onclick = () => closeModal();
        }
        return;
      }

      if (p1Card) p1Card.classList.remove("is-active");
      const gpsPassed = res.gps && res.gps.passed;
      if (gpsPassed) {
        if (p1Card) p1Card.classList.add("is-passed");
        if (p1Status) {
          p1Status.className = "puffin-trio-status status-passed";
          p1Status.textContent = "✓ Within ±10m";
        }
        const dist = typeof res.gps.distanceMeters === "number" ? Math.round(res.gps.distanceMeters) : 0;
        if (p1Detail) p1Detail.textContent = isCity ? ("Matched! ±" + dist + "m to landmark") : ("Matched! ±" + dist + "m to " + q.title);
      } else {
        if (p1Card) p1Card.classList.add("is-failed");
        if (p1Status) {
          p1Status.className = "puffin-trio-status status-failed";
          const distStr = typeof res.gps.distanceMeters === "number" ? Math.round(res.gps.distanceMeters) + "m away" : "Location mismatch";
          p1Status.textContent = "⚠️ " + distStr;
        }
        if (p1Detail) p1Detail.textContent = "Must be within ±10m of landmark";
      }

      // "if not dont fit, move to puffin 2; puffin 2 is checked the AI detect"
      await sleep(400);

      // Puffin 2: AI Photo Detection (~80-90%)
      if (p2Card) p2Card.classList.add("is-active");
      if (p2Status) {
        p2Status.className = "puffin-trio-status status-checking";
        p2Status.textContent = "Scanning Photo 🔬...";
      }
      if (p2Detail) p2Detail.textContent = "Matching landmark features (~80-90%)...";

      await sleep(900);
      if (p2Card) p2Card.classList.remove("is-active");

      const aiPassed = res.ai && res.ai.passed;
      const aiScore = res.ai ? res.ai.score : 0;
      if (aiPassed) {
        if (p2Card) p2Card.classList.add("is-passed");
        if (p2Status) {
          p2Status.className = "puffin-trio-status status-passed";
          p2Status.textContent = "✓ ~" + aiScore + "% Match";
        }
        if (p2Detail) p2Detail.textContent = (res.ai && res.ai.feedback) || (isCity ? "Landmark angle & features recognized!" : (q.title + " recognized!"));
      } else {
        if (p2Card) p2Card.classList.add("is-failed");
        if (p2Status) {
          p2Status.className = "puffin-trio-status status-failed";
          p2Status.textContent = "✕ " + aiScore + "% Match";
        }
        if (p2Detail) p2Detail.textContent = (res.ai && res.ai.feedback) || "Photo doesn't match well enough. Try a clearer shot!";
      }

      await sleep(450);

      // Puffin 3: Final verdict
      if (p3Card) p3Card.classList.add("is-active");
      if (p3Status) {
        p3Status.className = "puffin-trio-status status-checking";
        p3Status.textContent = "Evaluating...";
      }
      if (p3Detail) p3Detail.textContent = "Checking criteria approvals...";

      await sleep(650);
      if (p3Card) p3Card.classList.remove("is-active");

      if (res.autoApproved) {
        if (p3Card) p3Card.classList.add("is-passed");
        if (p3Status) {
          p3Status.className = "puffin-trio-status status-passed";
          p3Status.textContent = "✓ AUTO-APPROVED!";
        }
        if (p3Detail) p3Detail.textContent = "GPS + AI match! Finished!";

        if (doneBtn) {
          doneBtn.textContent = "🎉 Awesome! Claim +" + res.submission.reward + " Puffins & Finish";
          doneBtn.style.display = "";
          doneBtn.onclick = async () => {
            await refreshCore();
            renderHeader();
            renderQuestGrids();
            await refreshCityData();
            closeModal();
            toast("Challenge complete! +" + res.submission.reward + " Puffins", "🏙️");
            if (res.streakIncreased) {
              celebrateStreak(res.streak || user.streak);
              toast("🔥 Streak +1! You're on a " + (res.streak || user.streak) + "-day streak!", "🔥");
            }
          };
        }

        burstConfetti();
        pulseCoin();
        toast("Challenge Auto-Approved! 🌟", "🎉");
        if (res.streakIncreased) {
          celebrateStreak(res.streak || user.streak);
        }
      } else {
        if (p3Card) p3Card.classList.add("is-failed");
        if (p3Status) {
          p3Status.className = "puffin-trio-status status-failed";
          p3Status.textContent = res.locked ? "🔒 Locked (3/3 Used)" : "✕ Attempt " + (res.attempts || 1) + "/3 Failed";
        }
        if (p3Detail) {
          p3Detail.textContent = res.locked
            ? "3/3 photo attempts used today. Landmark is locked until 23:59 PM."
            : (res.error || ("Criteria not met. " + (3 - (res.attempts || 1)) + " attempt(s) remaining today."));
        }

        if (res.locked) {
          if (retryBtn) retryBtn.style.display = "none";
          if (cancelBtn) {
            cancelBtn.textContent = "Close (Locked)";
            cancelBtn.style.display = "";
            cancelBtn.onclick = async () => {
              await refreshCityData();
              closeModal();
            };
          }
          toast("🔒 Landmark locked! 3/3 attempts used today.", "⚠️");
        } else {
          const left = 3 - (res.attempts || 1);
          if (retryBtn) {
            retryBtn.textContent = "🔄 Try Again (" + left + " left)";
            retryBtn.style.display = "";
            retryBtn.onclick = async () => {
              await refreshCityData();
              showModalStage("idle");
              checkProofRequirement();
            };
          }
          if (cancelBtn) {
            cancelBtn.style.display = "";
            cancelBtn.onclick = async () => {
              await refreshCityData();
              closeModal();
            };
          }
          toast(res.error || ("Criteria not met. " + left + " attempt(s) remaining today."), "⚠️");
        }
      }
    } catch (err) {
      if (p1Card) p1Card.classList.remove("is-active");
      if (p2Card) p2Card.classList.remove("is-active");
      if (p3Card) {
        p3Card.classList.remove("is-active");
        p3Card.classList.add("is-failed");
      }
      if (p3Status) {
        p3Status.className = "puffin-trio-status status-failed";
        p3Status.textContent = "✕ Error";
      }
      if (p3Detail) p3Detail.textContent = err.message || "Failed to submit.";
      if (retryBtn) {
        retryBtn.style.display = "";
        retryBtn.onclick = () => showModalStage("idle");
      }
      if (cancelBtn) {
        cancelBtn.style.display = "";
        cancelBtn.onclick = () => closeModal();
      }
      toast(err.message, "⚠️");
    } finally {
      $("submit-btn").disabled = false;
    }
  }

  $("submit-btn").addEventListener("click", async () => {
    const questId = activeQuestId;
    const q = findQuest(questId);
    const isCity = !!(q && q.cityKey);
    const isDaily = activeIsDaily;
    const caption = $("caption-input").value.trim().slice(0, 50);
    const thumb = previewThumb;
    const proofGps = activeProofGps;
    const mediaType = activeMediaType;
    const postToProfile = $("post-to-profile-toggle") ? $("post-to-profile-toggle").checked : true;

    $("submit-btn").disabled = true;

    if (isCity) {
      await handleCityChallengeSubmission({ questId, q, caption, thumb, proofGps, mediaType, postToProfile });
      return;
    }

    try {
      const submitRes = await api("/quests/submit", {
        method: "POST",
        body: { questId, caption, thumb, proofGps, mediaType, postToProfile }
      });
      const { submission, streakIncreased, streak } = submitRes;
      await refreshCore();
      renderHeader();
      renderQuestGrids();

      if (submission.status === "approved") {
        // Today's Quest: Instant reward without check!
        $("done-title").textContent = "Quest Complete!";
        $("done-msg").textContent = "You earned +" + submission.reward + " Puffins.";
        $("done-share-row").style.display = "none";
        toast("+" + submission.reward + " Puffins earned!", "🐧");
        burstConfetti();
        pulseCoin();
        if (streakIncreased) {
          celebrateStreak(streak || user.streak);
          toast("🔥 Streak +1! You're on a " + (streak || user.streak) + "-day streak!", "🔥");
        }
      } else {
        // Cove Quest: Moved to Cove for community approval!
        $("done-title").textContent = "Moved to Cove! 🫧";
        $("done-msg").textContent = "Your quest has been moved to Cove for community review. Once approved by the community, you will receive +" + submission.reward + " Puffins!";
        $("done-share-row").style.display = "";
        lastCompletedSubmission = { id: submission.id };
        toast("Quest moved to Cove for review! 🫧", "🌊");
        pulseCoin();
      }
      showModalStage("done");
      if (findQuest(questId) && findQuest(questId).cityKey) refreshCityData().catch(() => {});
    } catch (err) {
      toast(err.message, "⚠️");
      if (err.status === 409) {
        await refreshCore();
        renderHeader();
        renderQuestGrids();
        closeModal();
      }
    } finally {
      checkProofRequirement();
    }
  });

  /* ================= COMMUNITY REVIEW COVE ================= */
  function renderCoveProgress() {
    $("cove-progress").textContent = (user.cheeredToday || 0) + " reviewed today";
  }

  async function fetchCoveQueue() {
    const { queue, approvedToday } = await api("/cove/queue");
    const existingIds = new Set(coveQueue.map((c) => c.id));
    queue.forEach((item) => {
      if (!existingIds.has(item.id)) coveQueue.push(item);
    });
    if (approvedToday !== undefined) user.cheeredToday = approvedToday;
    renderCoveProgress();
    renderCoveStack();
  }

  function renderCoveStack() {
    const stack = $("cove-stack");
    stack.innerHTML = "";
    if (coveQueue.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cove-empty";
      empty.textContent = "The cove is quiet right now — all caught up! 🌊";
      stack.appendChild(empty);
      return;
    }
    const visible = coveQueue.slice(0, 3);
    visible.forEach((item, i) => {
      const card = document.createElement("div");
      card.className = "stack-card glass";
      card.style.zIndex = String(10 - i);
      card.style.transform = "translateY(" + i * 8 + "px) scale(" + (1 - i * 0.04) + ")";
      card.style.opacity = String(1 - i * 0.15);
      let photoInner = item.icon;
      if (item.thumb) {
        photoInner = '<img src="' + item.thumb + '" alt="Proof thumbnail" />' +
          (item.mediaType === "video" ? '<span class="video-play-indicator" style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,0.65);padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;">▶ Video</span>' : "");
      }
      const gpsHtml = item.proofGps
        ? '<div class="rcard-gps"><a href="https://www.google.com/maps?q=' + encodeURIComponent(item.proofGps) + '" target="_blank" rel="noopener noreferrer" class="rcard-gps-link">📍 View on Google Maps (' + item.proofGps + ') ↗️</a></div>'
        : "";
      card.innerHTML =
        '<div class="stamp stamp-approve">Approved!</div>' +
        '<div class="stamp stamp-reject">Reject</div>' +
        '<div class="rcard-photo">' + photoInner + "</div>" +
        gpsHtml +
        '<div><div class="rcard-quest">' + item.title + '</div><div class="rcard-meta"><span>' + item.byName + '</span><span class="social-icons"></span></div></div>' +
        (item.caption ? '<div class="rcard-caption">"' + item.caption + '"</div>' : "");
      stack.appendChild(card);
      renderSocialIcons(card.querySelector(".social-icons"), item.socialLinks);
      if (i === 0) {
        card.setAttribute("data-top", "1");
        attachDrag(card, item);
      } else {
        card.style.pointerEvents = "none";
      }
    });
  }

  function attachDrag(cardEl, item) {
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
    cardEl.style.touchAction = "pan-y";
    const approveStamp = cardEl.querySelector(".stamp-approve");
    const rejectStamp = cardEl.querySelector(".stamp-reject") || cardEl.querySelector(".stamp-skip");

    cardEl.addEventListener("pointerdown", (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dy = 0;
      try { cardEl.setPointerCapture(e.pointerId); } catch (err) {}
      cardEl.style.transition = "none";
    });
    cardEl.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      cardEl.style.transform = "translate(" + dx + "px," + dy + "px) rotate(" + dx / 18 + "deg)";
      if (approveStamp) approveStamp.style.opacity = String(Math.max(0, Math.min(1, dx / 80)));
      if (rejectStamp) rejectStamp.style.opacity = String(Math.max(0, Math.min(1, -dx / 80)));
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      cardEl.style.transition = "transform .35s cubic-bezier(.22,1,.36,1)";
      const threshold = 90;
      if (dx > threshold) {
        flingOut(1);
        reviewCard(item.id, "approve");
      } else if (dx < -threshold) {
        flingOut(-1);
        reviewCard(item.id, "reject");
      } else {
        cardEl.style.transform = "translate(0,0) rotate(0)";
        if (approveStamp) approveStamp.style.opacity = "0";
        if (rejectStamp) rejectStamp.style.opacity = "0";
      }
    }
    function flingOut(dir) {
      cardEl.style.transform = "translate(" + dir * 600 + "px," + dy + "px) rotate(" + dir * 30 + "deg)";
      cardEl.style.opacity = "0";
    }
    cardEl.addEventListener("pointerup", endDrag);
    cardEl.addEventListener("pointercancel", endDrag);
  }

  async function reviewCard(submissionId, decision) {
    const comment = $("cove-comment-input").value.trim().slice(0, 50);
    coveQueue = coveQueue.filter((c) => c.id !== submissionId);
    $("cove-comment-input").value = "";
    $("cove-comment-count").textContent = "0/50";
    setTimeout(renderCoveStack, 280);
    try {
      const result = await api("/cove/review", { method: "POST", body: { submissionId, decision, comment } });
      if (result.reviewerReward) {
        user.balance += result.reviewerReward;
        user.cheeredToday = (user.cheeredToday || 0) + 1;
        renderHeader();
        renderCoveProgress();
        pulseCoin();
        const actionText = decision === "approve" ? "Quest approved!" : "Proof reviewed.";
        const feedbackBonusText = result.hasFeedback ? " (includes +1 feedback bonus! ✨)" : "";
        const puffinUnit = result.reviewerReward > 1 ? "Puffins" : "Puffin";
        const icon = decision === "approve" ? "🎉" : "🐧";
        toast(`${actionText} +${result.reviewerReward} ${puffinUnit}${feedbackBonusText}`, icon);
      }
    } catch (err) {
      toast(err.message, "⚠️");
    }
    if (coveQueue.length < 3) fetchCoveQueue().catch(() => {});
  }

  $("cove-approve-btn").addEventListener("click", () => {
    const top = coveQueue[0];
    if (!top) return;
    reviewCard(top.id, "approve");
  });
  $("cove-skip-btn").addEventListener("click", () => {
    const top = coveQueue[0];
    if (!top) return;
    reviewCard(top.id, "reject");
  });
  $("cove-comment-input").addEventListener("input", function () {
    $("cove-comment-count").textContent = this.value.length + "/50";
  });

  /* ================= FIGHT (3-WAY SLIDER: TIMELY, CITY, FIGHT PUFFINS) ================= */
  let activeFightPanel = 0;
  let pvpData = { myFights: [], publicRooms: [], userBalance: 0, currentUserId: null };
  let selectedPvPStake = 10;
  let pvpMode = "friend";

  function switchFightPanel(idx) {
    activeFightPanel = idx;
    const indicator = $("fight-seg-indicator");
    const track = $("fight-carousel-track");
    if (indicator) indicator.style.transform = "translateX(" + (idx * 100) + "%)";
    if (track) track.style.transform = "translateX(-" + (idx * 33.333333) + "%)";
    const buttons = [ $("btn-fight-timely"), $("btn-fight-city"), $("btn-fight-pvp") ];
    buttons.forEach((b, i) => {
      if (b) b.classList.toggle("active", i === idx);
    });
    if (idx === 1) refreshCityData().catch(() => {});
    if (idx === 2) refreshPvPData().catch(() => {});
  }

  function renderFightList() {
    const list = $("fight-list");
    if (!list) return;
    list.innerHTML = "";
    fightList.forEach((f) => {
      const pct = Math.round((f.progress / f.target) * 100);
      const card = document.createElement("div");
      card.className = "fight-card glass";
      const resetLabel = new Date(f.resetDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const badgeHtml = f.badgeReward
        ? '<div class="fight-award-row"><span class="fight-badge-chip"><span>' + f.badgeReward.icon + '</span><span>' + f.badgeReward.name + '</span></span>' +
          (f.titleReward ? '<span class="fight-badge-chip" style="color:var(--coral-dark);background:rgba(255,107,74,.18);border-color:rgba(255,107,74,.35);"><span>🪶</span><span>' + f.titleReward + '</span></span>' : '') +
          '</div>'
        : '';
      card.innerHTML =
        '<div class="fight-head"><span class="fight-tag">' + f.label + '</span><span class="fight-reset">Resets ' + resetLabel + "</span></div>" +
        '<h3 class="fight-name">' + f.name + '</h3><p class="fight-desc">' + f.desc + "</p>" +
        badgeHtml +
        '<div class="fight-bar-track"><div class="fight-bar-fill" style="width:' + Math.min(100, pct) + '%"></div></div>' +
        '<div class="fight-foot"><span class="fight-count">' + f.progress + " / " + f.target + "</span>" +
        '<span class="reward-chip"><svg viewBox="0 0 64 64"><use href="#i-puffin"/></svg>+' + f.reward + "</span></div>" +
        (f.claimed
          ? '<button class="btn btn-ghost fight-claim" disabled>Claimed</button>'
          : f.progress >= f.target
          ? '<button class="btn btn-primary fight-claim" data-key="' + f.key + '">Claim reward</button>'
          : "");
      list.appendChild(card);
    });
    list.querySelectorAll(".fight-claim[data-key]").forEach((btn) => {
      btn.addEventListener("click", () => claimFight(btn.dataset.key));
    });
  }

  async function claimFight(key) {
    try {
      const result = await api("/fight/claim", { method: "POST", body: { key } });
      user.balance += result.reward;
      if (result.badgeReward && user.badges) {
        if (!user.badges.includes(result.badgeReward.id)) user.badges.push(result.badgeReward.id);
      }
      if (result.titleReward && user.titles) {
        if (!user.titles.includes(result.titleReward)) user.titles.push(result.titleReward);
      }
      renderHeader();
      pulseCoin();
      burstConfetti();
      let awardMsg = "Challenge claimed! +" + result.reward + " Puffins";
      if (result.badgeReward) awardMsg += " + Badge \"" + result.badgeReward.name + "\"";
      if (result.titleReward) awardMsg += " + Title \"" + result.titleReward + "\"";
      toast(awardMsg, "🏆");
      const { fights } = await api("/fight");
      fightList = fights;
      renderFightList();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  /* ================= PVP FIGHT PUFFINS ================= */
  async function refreshPvPData() {
    try {
      pvpData = await api("/fight/pvp");
      renderPvP();
    } catch (err) {
      console.warn("PvP refresh failed:", err);
    }
  }

  function renderPvP() {
    const invitesList = $("pvp-invites-list");
    const activeList = $("pvp-active-list");
    const publicList = $("pvp-public-list");
    if (!invitesList || !activeList || !publicList) return;

    // 1. Invitations (pending fights where user is opponent)
    const invites = (pvpData.myFights || []).filter(f => f.status === "pending" && f.opponent_id === pvpData.currentUserId);
    invitesList.innerHTML = "";
    if (!invites.length) {
      invitesList.innerHTML = '<div class="cove-empty" style="padding:14px;">No pending invitations right now. 📨</div>';
    } else {
      invites.forEach(f => {
        const card = document.createElement("div");
        card.className = "pvp-card";
        card.innerHTML = `
          <div class="pvp-card-head">
            <div class="pvp-versus">
              <span>⚔️ Challenge from <strong>${f.creator_username}</strong></span>
            </div>
            <span class="pvp-pot-chip">💰 Pot: ${f.stake * 2} 🐧</span>
          </div>
          <div class="pvp-quest-badge">
            <span style="font-size:20px;">${f.quest_icon}</span>
            <div><strong>${f.quest_title}</strong><div style="font-size:11.5px;color:var(--ink-faint);">Stake: ${f.stake} Puffins</div></div>
          </div>
          <div class="pvp-card-actions">
            <button class="btn btn-primary btn-sm pvp-accept-btn" style="flex:1;">✓ Accept (${f.stake} 🐧)</button>
            <button class="btn btn-ghost btn-sm pvp-decline-btn" style="flex:1;">✕ Decline</button>
          </div>
        `;
        card.querySelector(".pvp-accept-btn").addEventListener("click", () => respondPvP(f.id, "accept"));
        card.querySelector(".pvp-decline-btn").addEventListener("click", () => respondPvP(f.id, "reject"));
        invitesList.appendChild(card);
      });
    }

    // 2. Active Duels
    const activeFights = (pvpData.myFights || []).filter(f => f.status === "active" || (f.status === "completed" && isRecent(f.created_at)));
    activeList.innerHTML = "";
    if (!activeFights.length) {
      activeList.innerHTML = '<div class="cove-empty" style="padding:14px;">No active battles. Start one above! ⚡</div>';
    } else {
      activeFights.forEach(f => {
        const isCreator = f.creator_id === pvpData.currentUserId;
        const oppName = isCreator ? (f.opponent_username || "Waiting for opponent") : f.creator_username;
        const myDone = isCreator ? f.creator_done : f.opponent_done;
        const isCompleted = f.status === "completed";
        const amWinner = f.winner_id === pvpData.currentUserId;

        const card = document.createElement("div");
        card.className = "pvp-card";
        let statusBadge = `<span class="pvp-status-pill pvp-status-active">Racing 🔥</span>`;
        if (isCompleted) {
          statusBadge = amWinner
            ? `<span class="pvp-status-pill pvp-status-completed">🏆 Victory! (+${f.stake * 2} 🐧)</span>`
            : `<span class="pvp-status-pill pvp-status-pending">Defeat ✕</span>`;
        }

        let actionBtn = "";
        if (!isCompleted && !myDone) {
          actionBtn = `<button class="btn btn-primary btn-sm pvp-finish-btn" style="width:100%;margin-top:4px;">🏁 I Finished This Quest!</button>`;
        } else if (!isCompleted && myDone) {
          actionBtn = `<div style="font-size:12px;color:var(--kelp);font-weight:700;text-align:center;">✓ You completed this! Waiting for check...</div>`;
        }

        card.innerHTML = `
          <div class="pvp-card-head">
            <div class="pvp-versus">
              <span class="pvp-player">⚔️ vs. <strong>${oppName}</strong></span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="pvp-pot-chip">💰 Pot: ${f.stake * 2} 🐧</span>
              ${statusBadge}
            </div>
          </div>
          <div class="pvp-quest-badge">
            <span style="font-size:22px;">${f.quest_icon}</span>
            <div>
              <strong>${f.quest_title}</strong>
              <div style="font-size:11.5px;color:var(--ink-soft);">First one to finish wins ${f.stake * 2} Puffins!</div>
            </div>
          </div>
          ${actionBtn}
        `;
        const finishBtn = card.querySelector(".pvp-finish-btn");
        if (finishBtn) {
          finishBtn.addEventListener("click", () => completePvP(f.id));
        }
        activeList.appendChild(card);
      });
    }

    // 3. Public Rooms (random matches waiting for an opponent)
    const publicRooms = pvpData.publicRooms || [];
    publicList.innerHTML = "";
    if (!publicRooms.length) {
      publicList.innerHTML = '<div class="cove-empty" style="padding:14px;">No open public matchmaking rooms. Create one! 🎲</div>';
    } else {
      publicRooms.forEach(f => {
        const card = document.createElement("div");
        card.className = "pvp-card";
        card.innerHTML = `
          <div class="pvp-card-head">
            <div class="pvp-versus">
              <span>🎲 Challenge by <strong>${f.creator_username}</strong></span>
            </div>
            <span class="pvp-pot-chip">💰 Pot: ${f.stake * 2} 🐧</span>
          </div>
          <div class="pvp-quest-badge">
            <span style="font-size:20px;">${f.quest_icon}</span>
            <div><strong>${f.quest_title}</strong><div style="font-size:11.5px;color:var(--ink-faint);">Stake: ${f.stake} Puffins</div></div>
          </div>
          <button class="btn btn-primary btn-sm pvp-join-btn" style="width:100%;margin-top:4px;">
            ⚡ Join Battle (${f.stake} 🐧)
          </button>
        `;
        card.querySelector(".pvp-join-btn").addEventListener("click", () => respondPvP(f.id, "accept"));
        publicList.appendChild(card);
      });
    }
  }

  function isRecent(ts) {
    if (!ts) return false;
    const diff = Date.now() - new Date(ts).getTime();
    return diff < 24 * 3600 * 1000;
  }

  async function respondPvP(fightId, action) {
    try {
      await api("/fight/pvp/respond", { method: "POST", body: { fightId, action } });
      await refreshCore();
      renderHeader();
      pulseCoin();
      toast(action === "accept" ? "Challenge accepted! Game on! ⚔️" : "Challenge declined.", "⚔️");
      await refreshPvPData();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  async function completePvP(fightId) {
    try {
      const res = await api("/fight/pvp/complete", { method: "POST", body: { fightId } });
      await refreshCore();
      renderHeader();
      if (res.winner) {
        burstConfetti();
        pulseCoin();
        toast("🏆 VICTORY! You finished first and won " + res.pot + " Puffins!", "🎉");
      } else {
        toast("Your opponent finished first! Better luck next time.", "🏁");
      }
      await refreshPvPData();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  // Bind PvP Controls
  if ($("btn-fight-timely")) $("btn-fight-timely").addEventListener("click", () => switchFightPanel(0));
  if ($("btn-fight-city")) $("btn-fight-city").addEventListener("click", () => switchFightPanel(1));
  if ($("btn-fight-pvp")) $("btn-fight-pvp").addEventListener("click", () => switchFightPanel(2));

  if ($("pvp-mode-friend")) {
    $("pvp-mode-friend").addEventListener("click", () => {
      pvpMode = "friend";
      $("pvp-mode-friend").classList.add("active");
      $("pvp-mode-random").classList.remove("active");
      $("pvp-friend-input-wrap").style.display = "";
    });
  }
  if ($("pvp-mode-random")) {
    $("pvp-mode-random").addEventListener("click", () => {
      pvpMode = "random";
      $("pvp-mode-random").classList.add("active");
      $("pvp-mode-friend").classList.remove("active");
      $("pvp-friend-input-wrap").style.display = "none";
    });
  }

  document.querySelectorAll(".pvp-stake-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pvp-stake-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedPvPStake = parseInt(btn.dataset.stake, 10) || 10;
      if ($("pvp-stake-label")) $("pvp-stake-label").textContent = selectedPvPStake;
    });
  });

  if ($("pvp-create-btn")) {
    $("pvp-create-btn").addEventListener("click", async () => {
      const oppUsername = pvpMode === "friend" ? $("pvp-opponent-username").value.trim() : "";
      if (pvpMode === "friend" && !oppUsername) {
        toast("Please enter your friend's username.", "⚠️");
        return;
      }
      try {
        await api("/fight/pvp/create", {
          method: "POST",
          body: { stake: selectedPvPStake, isRandom: pvpMode === "random", opponentUsername: oppUsername }
        });
        await refreshCore();
        renderHeader();
        pulseCoin();
        toast("Battle challenge created! ⚔️", "🎉");
        if ($("pvp-opponent-username")) $("pvp-opponent-username").value = "";
        await refreshPvPData();
      } catch (err) {
        toast(err.message, "⚠️");
      }
    });
  }

  /* ================= CITY CHALLENGE ================= */
  const CITY_LABELS = { hanoi: "🇻🇳 Hanoi", hcmc: "🇻🇳 Ho Chi Minh City", singapore: "🇸🇬 Singapore" };

  async function refreshCityData() {
    cityData = await api("/city");
    renderCityChallenge();
  }

  async function chooseCity(city) {
    try {
      await api("/city", { method: "PATCH", body: { city } });
      await refreshCityData();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  function renderCityChallenge() {
    const root = $("city-challenge-body");
    if (!root) return;
    root.innerHTML = "";
    if (!cityData.city) {
      const banner = document.createElement("div");
      banner.className = "challenge-picker-intro";
      banner.style.cssText = "margin-bottom:14px;padding:12px 14px;background:rgba(255,255,255,.45);border-radius:var(--radius-md);border:1px solid var(--border-glass);color:var(--ink);font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;";
      banner.innerHTML = '<span>🎯</span><span>Choose challenge! Earn more puffin coins! GPS + AI verified automatically!</span>';
      root.appendChild(banner);

      const picker = document.createElement("div");
      picker.className = "city-picker";
      Object.keys(CITY_LABELS).forEach((key) => {
        const cityLandmarks = (cityData.catalog && cityData.catalog[key] && cityData.catalog[key].landmarks) || [];
        const doneInCity = cityLandmarks.filter((l) => (cityData.doneIds || []).includes(l.id)).length;
        const total = cityLandmarks.length;
        const card = document.createElement("button");
        card.type = "button";
        card.className = "city-choice-card glass glass-interactive";
        card.innerHTML =
          '<div class="glass-sheen"></div><div class="icon-chip">🏙️</div>' +
          '<h3>' + CITY_LABELS[key] + "</h3>" +
          '<div style="font-size:12px;color:var(--ink-soft);margin-top:4px;font-weight:600;">' +
            (doneInCity >= total ? "🏆 All " + total + " landmarks found!" : doneInCity + "/" + total + " landmarks found") +
          "</div>";
        card.addEventListener("click", () => chooseCity(key));
        picker.appendChild(card);
      });
      root.appendChild(picker);
      return;
    }

    const landmarks = (cityData.catalog[cityData.city] && cityData.catalog[cityData.city].landmarks) || [];
    const doneIds = cityData.doneIds || [];
    const completedCount = landmarks.filter((l) => doneIds.includes(l.id)).length;
    const total = landmarks.length;

    // City header with progress and change button
    const header = document.createElement("div");
    header.className = "city-card-head";
    header.style.marginBottom = "12px";
    header.innerHTML =
      '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
        '<span class="fight-tag">' + CITY_LABELS[cityData.city] + '</span>' +
        '<span class="fight-tag" style="background:rgba(79,209,192,.18);color:var(--kelp);border:1px solid rgba(79,209,192,.35);">' + completedCount + '/' + total + ' Found</span>' +
      '</div>' +
      '<button class="city-change-btn" id="city-change-btn" type="button">Change challenge</button>';
    root.appendChild(header);

    if (completedCount >= total) {
      const done = document.createElement("div");
      done.className = "city-all-done";
      done.textContent = "🏆 All " + total + " mystery landmarks found! Pick another challenge to explore.";
      root.appendChild(done);
    }

    // Landmark card grid (like Cove quest cards)
    const grid = document.createElement("div");
    grid.className = "quest-grid";
    landmarks.forEach((l) => {
      const isDone = doneIds.includes(l.id);
      const attempts = (cityData.attempts && cityData.attempts[l.id]) || 0;
      const isLocked = !isDone && attempts >= 3;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "qcard glass glass-interactive" + (isDone ? " is-done" : "") + (isLocked ? " is-locked" : "");
      let statusChip = "";
      if (isDone) {
        statusChip = '<span class="status-chip status-done">✅ Found</span>';
      } else if (isLocked) {
        statusChip = '<span class="status-chip" style="background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.35);">🔒 Locked (3/3)</span>';
      } else if (attempts > 0) {
        statusChip = '<span class="status-chip status-new">Mystery (' + attempts + '/3)</span>';
      } else {
        statusChip = '<span class="status-chip status-new">Mystery</span>';
      }
      card.innerHTML =
        '<div class="glass-sheen"></div>' +
        '<div class="icon-chip" style="filter:blur(3px) saturate(1.2);opacity:.7;">' + (l.icon || "🏛️") + "</div>" +
        '<div class="qtitle">Mystery Landmark</div>' +
        '<div class="qdesc">' + l.desc + "</div>" +
        '<div class="qcard-foot">' +
          '<span class="reward-chip"><svg viewBox="0 0 64 64"><use href="#i-puffin"/></svg>+' + l.reward + "</span>" +
          statusChip +
        "</div>";
      if (!isDone && !isLocked) {
        card.addEventListener("click", () => openModal(l.id, false));
      } else if (isLocked) {
        card.addEventListener("click", () => {
          toast("🔒 Landmark locked! 3/3 attempts used today. Refreshes at 23:59 PM.", "⚠️");
        });
      } else {
        card.style.opacity = "0.55";
        card.style.pointerEvents = "none";
      }
      grid.appendChild(card);
    });
    root.appendChild(grid);

    const changeBtn = $("city-change-btn");
    if (changeBtn) changeBtn.addEventListener("click", () => chooseCity(null));
  }

  /* ================= FISH (CENTRAL PUFFIN MASCOT, GROWTH & WARDROBE) ================= */
  let activeWardrobeCategory = "hat";

  function renderFishPanels() {
    const tier = fishData.puffinGrowthTier || { level: 1, name: "Tiny Fledge", icon: "🐣", scale: 1.0, minFeed: 0, nextThreshold: 4 };
    const growthPts = fishData.puffinGrowth || 0;

    // 1. Growth Header & Bar
    if ($("fish-tier-icon")) $("fish-tier-icon").textContent = tier.icon || "🐣";
    if ($("fish-tier-name")) $("fish-tier-name").textContent = (tier.name || "Tiny Fledge") + " · Lv. " + (tier.level || 1);
    const nextThresh = tier.nextThreshold || 4;
    const curBase = tier.minFeed || 0;
    const progressInTier = Math.max(0, growthPts - curBase);
    const span = Math.max(1, nextThresh - curBase);
    const pct = tier.isMax ? 100 : Math.min(100, Math.round((progressInTier / span) * 100));
    if ($("fish-growth-bar")) $("fish-growth-bar").style.width = pct + "%";
    if ($("fish-growth-count")) $("fish-growth-count").textContent = growthPts + " feed points";
    if ($("fish-growth-next")) $("fish-growth-next").textContent = tier.isMax ? "Max Chonk reached! 🌟" : "Next: " + nextThresh + " points";

    // 2. Mascot Scale & Wardrobe Layers
    const scaleWrapper = $("doll-scale-wrapper");
    if (scaleWrapper) {
      scaleWrapper.style.transform = "scale(" + (tier.scale || 1.0) + ")";
    }

    const catalog = fishData.wardrobeCatalog || (content && content.wardrobeItems) || {};
    const hatItem = fishData.equippedHat && catalog[fishData.equippedHat];
    const clothesItem = fishData.equippedClothes && catalog[fishData.equippedClothes];
    const shoesItem = fishData.equippedShoes && catalog[fishData.equippedShoes];

    if ($("doll-hat-display")) $("doll-hat-display").textContent = hatItem ? (hatItem.visual || hatItem.icon) : "";
    if ($("doll-clothes-display")) $("doll-clothes-display").textContent = clothesItem ? (clothesItem.visual || clothesItem.icon) : "";
    if ($("doll-shoes-display")) $("doll-shoes-display").textContent = shoesItem ? (shoesItem.visual || shoesItem.icon) : "";

    // 3. Wardrobe Grid
    const grid = $("wardrobe-grid");
    if (grid) {
      grid.innerHTML = "";
      const catItems = Object.values(catalog).filter(item => item.category === activeWardrobeCategory);
      const ownedIds = fishData.puffinItems || [];
      const equippedId = activeWardrobeCategory === "hat" ? fishData.equippedHat
                       : activeWardrobeCategory === "clothes" ? fishData.equippedClothes
                       : fishData.equippedShoes;

      catItems.forEach(item => {
        const isOwned = ownedIds.includes(item.id);
        const isEquipped = isOwned && equippedId === item.id;
        const card = document.createElement("div");
        card.className = "wardrobe-item-card" + (isEquipped ? " is-equipped" : "") + (!isOwned ? " wardrobe-item-locked" : "");
        card.innerHTML = `
          <div class="wardrobe-item-icon">${item.icon}</div>
          <div class="wardrobe-item-name">${item.name}</div>
          <div class="wardrobe-item-status">${isEquipped ? "Equipped ✓" : isOwned ? "Wear" : "Locked 🔒"}</div>
        `;
        if (isOwned) {
          card.addEventListener("click", () => wearAccessory(activeWardrobeCategory, isEquipped ? null : item.id));
        } else {
          card.addEventListener("click", () => toast("Reel in this " + item.name + " from the fishing pond! 🎣", "🔒"));
        }
        grid.appendChild(card);
      });
    }

    // 4. Catches Log (fish & wardrobe only; no badges/titles!)
    const log = $("catch-log");
    if (log) {
      log.innerHTML = "";
      const catchLog = Array.isArray(fishData && fishData.catchLog) ? fishData.catchLog : [];
      if (!catchLog.length) {
        log.innerHTML = '<div class="cove-empty" style="padding:12px;">Cast a line to feed your puffin and catch outfits! 🎣</div>';
      } else {
        catchLog.forEach((c) => {
          const row = document.createElement("div");
          row.className = "catch-log-row";
          row.innerHTML = '<span class="icon">' + c.icon + '</span><span>' + c.label + '</span><span class="detail">' + c.detail + "</span>";
          log.appendChild(row);
        });
      }
    }
  }

  async function wearAccessory(category, itemId) {
    try {
      const res = await api("/fish/wear", { method: "POST", body: { category, itemId } });
      fishData.equippedHat = res.equippedHat;
      fishData.equippedClothes = res.equippedClothes;
      fishData.equippedShoes = res.equippedShoes;
      renderFishPanels();
      toast(itemId ? "Puffin dressed up! ✨" : "Accessory removed", "🎀");
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  // Wardrobe category tabs
  document.querySelectorAll(".wardrobe-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".wardrobe-tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeWardrobeCategory = btn.dataset.cat || "hat";
      renderFishPanels();
    });
  });

  async function castLine() {
    const stage = $("fish-stage");
    const btn = $("fish-cast-btn");
    if (btn) btn.disabled = true;
    if (stage) stage.innerHTML = '<div class="fish-waiting">🎣 Casting line into the pond…</div>';
    try {
      const result = await api("/fish/cast", { method: "POST" });
      user.balance = result.balance;
      if (result.streakFreezes != null) user.streakFreezes = result.streakFreezes;
      renderHeader();
      pulseCoin();
      const c = result.catch;
      if (stage) {
        stage.innerHTML =
          '<div class="catch-card rarity-' + c.rarity + '">' +
          '<div class="catch-icon">' + c.icon + '</div>' +
          '<div class="catch-label">' + c.label + '</div>' +
          '<div class="catch-detail">' + c.detail + '</div></div>';
      }
      if (c.rarity === "legendary" || c.type === "wardrobe" || c.type === "streak-freeze") burstConfetti();
      if (c.type === "fish") {
        toast("Fed your puffin! +" + (c.feedPoints || 1) + " Growth", "🐟");
      } else if (c.type === "wardrobe") {
        toast("New wardrobe unlock: " + c.label + "! ✨", "🎀");
      } else if (c.type === "streak-freeze") {
        toast("🧊 Streak Freeze caught! You now have " + (user.streakFreezes || 1), "❄️");
      }
      const fresh = await api("/fish");
      fishData = fresh;
      renderFishPanels();
    } catch (err) {
      toast(err.message, "⚠️");
    } finally {
      setTimeout(() => {
        if (stage) stage.innerHTML = "";
        if (btn) btn.disabled = false;
      }, 2200);
    }
  }

  const fishCastBtn = $("fish-cast-btn");
  if (fishCastBtn) fishCastBtn.addEventListener("click", castLine);

  async function equipTitle(title) {
    try {
      await api("/fish/equip", { method: "POST", body: { title } });
      if (user) user.equipped_title = title;
      if (fishData) fishData.equippedTitle = title;
      toast(title ? "Equipped title: \"" + title + "\"" : "Title unequipped", "🪶");
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  /* ================= BIRD / PROFILE & AWARDS SHELF ================= */
  const FIGHT_BADGES = {
    "waddle-star": { id: "waddle-star", name: "Waddle Star", icon: "🌟", desc: "Won a Weekly Fight challenge" },
    "tide-champion": { id: "tide-champion", name: "Tide Champion", icon: "🌊", desc: "Won a Monthly Fight challenge" },
    "golden-plume": { id: "golden-plume", name: "Golden Plume", icon: "🪶", desc: "Won a Seasonal Fight challenge" }
  };

  function renderProfileAwards(root, profile, isPrivate) {
    const badgesGrid = root.querySelector("#bird-badges-grid") || root.querySelector("#shared-badges-grid");
    const titlesList = root.querySelector("#bird-titles-list") || root.querySelector("#shared-titles-list");

    if (badgesGrid) {
      badgesGrid.innerHTML = "";
      const userBadges = Array.isArray(profile.badges) ? profile.badges : [];
      // Always show all 3 badge slots
      const allBadgeIds = ["waddle-star", "tide-champion", "golden-plume"];
      allBadgeIds.forEach(bId => {
        const bDef = FIGHT_BADGES[bId] || { id: bId, name: bId, icon: "🏅", desc: "" };
        const isEarned = userBadges.includes(bId);
        const card = document.createElement("div");
        card.className = "award-badge-card" + (isEarned ? " is-earned" : "");
        card.title = isEarned ? bDef.desc : "Win a " + bDef.desc.replace("Won a ", "") + " to unlock!";
        card.innerHTML =
          '<div class="award-badge-icon">' + bDef.icon + '</div>' +
          '<span class="award-badge-name">' + bDef.name + '</span>' +
          (isEarned ? '' : '<span class="award-badge-lock">🔒</span>');
        badgesGrid.appendChild(card);
      });
    }

    if (titlesList) {
      titlesList.innerHTML = "";
      const userTitles = Array.isArray(profile.titles) ? profile.titles : [];
      if (!userTitles.length) {
        titlesList.innerHTML = '<div class="awards-empty-hint">Complete Fight challenges to earn titles! 🪶</div>';
      } else {
        userTitles.forEach(t => {
          const chip = document.createElement("button");
          chip.type = "button";
          const isEquipped = profile.equippedTitle === t;
          chip.className = "awards-title-chip" + (isEquipped ? " equipped" : "");
          chip.textContent = t;
          if (isPrivate) {
            chip.addEventListener("click", async () => {
              const newTitle = isEquipped ? null : t;
              await equipTitle(newTitle);
              profile.equippedTitle = newTitle;
              const chipEl = root.querySelector(".profile-title-chip");
              if (chipEl) chipEl.textContent = newTitle || "";
              renderProfileAwards(root, profile, true);
            });
          }
          titlesList.appendChild(chip);
        });
      }
    }
  }

  function fillProfileHead(root, profile, opts) {
    opts = opts || {};
    const cover = root.querySelector(".profile-cover");
    if (opts.coverPhoto) {
      cover.style.backgroundImage = "url('" + opts.coverPhoto + "')";
      cover.classList.remove("no-photo");
    } else {
      cover.style.backgroundImage = "";
      cover.classList.add("no-photo");
    }
    const avatarWrap = root.querySelector(".cover-avatar-wrap");
    avatarWrap.innerHTML = opts.avatarPhoto
      ? '<img src="' + opts.avatarPhoto + '" alt="">'
      : '<svg viewBox="0 0 64 64"><use href="#i-puffin"/></svg>';
    root.querySelector(".profile-username").textContent = profile.displayName || profile.username;
    root.querySelector(".profile-title-chip").textContent = profile.equippedTitle || "";
    root.querySelector(".profile-since").textContent = "Puffineer since " + formatLongDate(profile.firstActiveDate);
    root.querySelector(".stat-balance").textContent = profile.balance || 0;
    root.querySelector(".stat-streak").textContent = profile.streak || 0;
    root.querySelector(".stat-best").textContent = profile.bestStreak || 0;
    root.querySelector(".stat-count").textContent = profile.totalQuestsDone != null ? profile.totalQuestsDone : (profile.questsDone || 0);
    const socialEl = root.querySelector(".social-icons");
    if (socialEl) renderSocialIcons(socialEl, profile.socialLinks);

    // Render Trophies & Badges Awards Shelf directly below the 4 stat counters
    const isPrivate = root.id === "page-bird";
    renderProfileAwards(root, profile, isPrivate);
  }

  function formatLongDate(dt) {
    let d = dt ? new Date(dt) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function formatTimeLabel(tm) {
    if (!tm || tm.indexOf(":") < 0) return null;
    const [h, m] = tm.split(":").map((x) => parseInt(x, 10));
    if (isNaN(h) || isNaN(m)) return null;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function renderJournalList(root, entries, opts) {
    opts = opts || {};
    root.innerHTML = "";
    if (!entries || entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cove-empty";
      empty.style.padding = "24px 10px";
      empty.textContent = "Your journey starts with your first quest! 🐣";
      root.appendChild(empty);
      return;
    }
    entries.forEach((e) => {
      const row = document.createElement("div");
      row.className = "journal-row";

      const dateCol = document.createElement("div");
      dateCol.className = "jr-date";
      const d = e.date ? new Date(e.date + "T00:00:00") : null;
      const validDate = d && !isNaN(d.getTime());
      const dayNum = document.createElement("div");
      dayNum.className = "jr-day";
      dayNum.textContent = validDate ? d.getDate() : "–";
      const monthAbbr = document.createElement("div");
      monthAbbr.className = "jr-month";
      monthAbbr.textContent = validDate ? d.toLocaleDateString(undefined, { month: "short" }) : "";
      const meta = document.createElement("div");
      meta.className = "jr-meta";
      const metaBits = [e.isDaily ? "Daily Quest" : "Fun Quest"];
      const timeLabel = formatTimeLabel(e.time);
      if (timeLabel) metaBits.push(timeLabel);
      meta.textContent = metaBits.join(" · ");
      dateCol.appendChild(dayNum);
      dateCol.appendChild(monthAbbr);
      dateCol.appendChild(meta);

      const photo = document.createElement("div");
      photo.className = "jr-photo";
      if (opts.showThumb && e.thumb) {
        const img = document.createElement("img");
        img.src = e.thumb;
        img.alt = "";
        photo.appendChild(img);
      } else {
        photo.textContent = e.icon || "🐧";
      }

      const body = document.createElement("div");
      body.className = "jr-body";
      const titleRow = document.createElement("div");
      titleRow.className = "jr-title";
      const titleText = document.createElement("span");
      titleText.textContent = e.title || "Quest";
      const rewardSpan = document.createElement("span");
      rewardSpan.className = "jr-reward";
      rewardSpan.textContent = "+" + (e.reward != null ? e.reward : 0);
      titleRow.appendChild(titleText);
      titleRow.appendChild(rewardSpan);

      if (opts.canDelete && e.id) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "jr-delete-btn";
        delBtn.title = "Delete this quest entry";
        delBtn.setAttribute("aria-label", "Delete quest entry");
        let confirmTimer = null;
        delBtn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          if (!delBtn.classList.contains("confirming")) {
            delBtn.classList.add("confirming");
            delBtn.innerHTML = "Delete? 🗑️";
            delBtn.title = "Tap again to permanently delete";
            clearTimeout(confirmTimer);
            confirmTimer = setTimeout(() => {
              delBtn.classList.remove("confirming");
              delBtn.innerHTML = "🗑️";
              delBtn.title = "Delete this quest entry";
            }, 4000);
            return;
          }
          clearTimeout(confirmTimer);
          try {
            delBtn.disabled = true;
            delBtn.style.opacity = "0.3";
            const res = await api("/profile/journal/" + e.id, { method: "DELETE" });
            if (res && res.user) {
              user = res.user;
              journal = res.journal || [];
              renderBirdTab();
              renderHeader();
              toast("Journal entry deleted 🗑️", "✓");
            }
          } catch (err) {
            delBtn.disabled = false;
            delBtn.style.opacity = "1";
            toast(err.message, "⚠️");
          }
        });
        titleRow.appendChild(delBtn);
      }

      body.appendChild(titleRow);

      if (e.proofGps) {
        const gpsBadge = document.createElement("a");
        gpsBadge.className = "jr-gps-badge";
        gpsBadge.href = "https://www.google.com/maps?q=" + encodeURIComponent(e.proofGps);
        gpsBadge.target = "_blank";
        gpsBadge.rel = "noopener noreferrer";
        gpsBadge.innerHTML = "📍 View on Google Maps ↗️";
        body.appendChild(gpsBadge);
      }
      if (e.caption) {
        const capDiv = document.createElement("div");
        capDiv.className = "jr-caption";
        capDiv.textContent = "“" + e.caption + "”";
        body.appendChild(capDiv);
      }
      const reactions = (e.reactions || []).filter((r) => r.comment);
      if (reactions.length) {
        const reactionsEl = document.createElement("div");
        reactionsEl.className = "jr-reactions";
        reactions.forEach((r) => {
          const rrow = document.createElement("div");
          rrow.className = "jr-reaction";
          const cm = document.createElement("span");
          cm.className = "jr-reaction-comment";
          cm.textContent = "🐧 “" + r.comment + "”";
          rrow.appendChild(cm);
          reactionsEl.appendChild(rrow);
        });
        body.appendChild(reactionsEl);
      }

      row.appendChild(dateCol);
      row.appendChild(photo);
      row.appendChild(body);
      root.appendChild(row);
    });
    if (opts.truncated) {
      const note = document.createElement("div");
      note.className = "journal-truncated-note";
      note.textContent = "Showing the most recent quests from this shared snapshot.";
      root.appendChild(note);
    }
  }

  function renderBirdTab() {
    const root = $("page-bird");
    fillProfileHead(root, user, { coverPhoto: user.coverPhoto, avatarPhoto: user.avatarPhoto });
    renderJournalList($("bird-journal-list"), journal, { showThumb: true, truncated: false, canDelete: true });
  }

  const birdEditRow = $("bird-edit-row");
  function updateEditPhotoPreviews() {
    $("avatar-edit-preview").innerHTML = user.avatarPhoto
      ? '<img src="' + user.avatarPhoto + '" alt="">'
      : '<svg viewBox="0 0 64 64"><use href="#i-puffin"/></svg>';
    $("cover-edit-preview").style.backgroundImage = user.coverPhoto ? "url('" + user.coverPhoto + "')" : "";
    $("avatar-remove-btn").style.display = user.avatarPhoto ? "" : "none";
    $("cover-remove-btn").style.display = user.coverPhoto ? "" : "none";
    $("edit-social-facebook").checked = !!user.socialFlags.facebook;
    $("edit-social-instagram").checked = !!user.socialFlags.instagram;
    $("edit-social-linkedin").checked = !!user.socialFlags.linkedin;
  }

  document.querySelector("#page-bird .profile-edit-btn").addEventListener("click", () => {
    const isOpen = birdEditRow.style.display === "flex";
    if (isOpen) {
      birdEditRow.style.display = "none";
      return;
    }
    birdEditRow.querySelector(".profile-name-input").value = user.displayName || "";
    updateEditPhotoPreviews();
    birdEditRow.style.display = "flex";
    birdEditRow.querySelector(".profile-name-input").focus();
  });

  async function saveBirdName() {
    const displayName = birdEditRow.querySelector(".profile-name-input").value;
    try {
      await api("/profile/name", { method: "PATCH", body: { displayName } });
      user.displayName = displayName.trim().slice(0, 24);
      birdEditRow.style.display = "none";
      renderBirdTab();
      renderHeader();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }
  birdEditRow.querySelector(".profile-name-save").addEventListener("click", saveBirdName);
  birdEditRow.querySelector(".profile-name-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBirdName();
    }
  });

  async function saveSocialFlags() {
    const socialLinks = {
      facebook: $("edit-social-facebook").checked,
      instagram: $("edit-social-instagram").checked,
      linkedin: $("edit-social-linkedin").checked
    };
    try {
      await api("/profile/social", { method: "PATCH", body: { socialLinks } });
      user.socialFlags = socialLinks;
      const me = await api("/profile/me");
      user = me.user;
      journal = me.journal;
      renderBirdTab();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }
  ["edit-social-facebook", "edit-social-instagram", "edit-social-linkedin"].forEach((id) => {
    $(id).addEventListener("change", saveSocialFlags);
  });

  async function handleProfilePhoto(file, maxSize, field) {
    if (!file) return;
    if (!file.type || file.type.indexOf("image/") !== 0) {
      toast("Please choose an image file.", "⚠️");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      makeThumbnail(e.target.result, async (t) => {
        if (!t) {
          toast("Couldn't load that image.", "⚠️");
          return;
        }
        try {
          const body = {};
          body[field] = t;
          await api("/profile/photo", { method: "PATCH", body });
          if (field === "avatarPhoto") user.avatarPhoto = t;
          else user.coverPhoto = t;
          renderBirdTab();
          updateEditPhotoPreviews();
        } catch (err) {
          toast(err.message, "⚠️");
        }
      }, maxSize);
    };
    reader.readAsDataURL(file);
  }
  $("avatar-pick-btn").addEventListener("click", () => $("avatar-file-input").click());
  $("avatar-file-input").addEventListener("change", function () {
    handleProfilePhoto(this.files && this.files[0], 220, "avatarPhoto");
    this.value = "";
  });
  $("avatar-remove-btn").addEventListener("click", async () => {
    try {
      await api("/profile/photo", { method: "PATCH", body: { avatarPhoto: null } });
      user.avatarPhoto = null;
      renderBirdTab();
      updateEditPhotoPreviews();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  });
  $("cover-pick-btn").addEventListener("click", () => $("cover-file-input").click());
  $("cover-file-input").addEventListener("change", function () {
    handleProfilePhoto(this.files && this.files[0], 640, "coverPhoto");
    this.value = "";
  });
  $("cover-remove-btn").addEventListener("click", async () => {
    try {
      await api("/profile/photo", { method: "PATCH", body: { coverPhoto: null } });
      user.coverPhoto = null;
      renderBirdTab();
      updateEditPhotoPreviews();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  });

  document.querySelector("#page-bird .cover-share-btn").addEventListener("click", () => {
    const url = new URL(location.href);
    url.search = "";
    url.pathname = "/bird/" + encodeURIComponent(user.username);
    copyToClipboard(url.toString(), "Profile link copied!");
  });

  function copyToClipboard(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(msg, "🔗")).catch(() => fallbackCopy(text, msg));
    } else {
      fallbackCopy(text, msg);
    }
  }
  function fallbackCopy(text, msg) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      toast(msg, "🔗");
    } catch (e) {
      toast("Couldn't copy — here's the link: " + text, "🔗");
    }
    ta.remove();
  }

  /* ================= SHARED PROFILE (?u=username) ================= */
  async function openSharedProfile(username) {
    try {
      const { profile } = await api("/profile/by/" + encodeURIComponent(username));
      const root = $("shared-profile-modal");
      fillProfileHead(root, profile, {});
      root.querySelector(".profile-shared-text").textContent = "You're viewing " + (profile.displayName || "a puffineer") + "'s Puffin Quest journey.";
      const truncated = false;
      renderJournalList($("shared-journal-list"), profile.journal || [], { showThumb: false, truncated });
      $("shared-profile-overlay").classList.add("open");
      document.body.style.overflow = "hidden";
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }
  function closeSharedProfile() {
    $("shared-profile-overlay").classList.remove("open");
    document.body.style.overflow = "";
    if (/^\/bird\//.test(location.pathname)) history.pushState(null, "", "/");
    if (!token) showAuth();
  }
  $("shared-profile-close").addEventListener("click", closeSharedProfile);
  $("shared-start-own-btn").addEventListener("click", closeSharedProfile);
  $("shared-profile-overlay").addEventListener("click", (e) => {
    if (e.target === $("shared-profile-overlay")) closeSharedProfile();
  });

  /* ================= DIRECT REVIEW (link a friend sends you) ================= */
  let directReviewSubmissionId = null;

  async function openDirectReview(submissionId) {
    directReviewSubmissionId = submissionId;
    $("direct-review-overlay").classList.add("open");
    document.body.style.overflow = "hidden";
    const body = $("direct-review-body");
    body.innerHTML = '<p class="qdesc-full">Loading…</p>';
    try {
      const data = await api("/cove/submission/" + submissionId);
      if (data.status === "own") {
        body.innerHTML = '<p class="qdesc-full">This is your own quest — share the link with someone else to review it!</p>';
        return;
      }
      if (data.status === "closed") {
        body.innerHTML = '<p class="qdesc-full">This quest has already been reviewed. Thanks for checking!</p>';
        return;
      }
      if (data.status === "already-reviewed") {
        body.innerHTML = '<p class="qdesc-full">You already reviewed this one. Thanks for helping the community! 🐧</p>';
        return;
      }
      if (data.status === "not-found") {
        body.innerHTML = '<p class="qdesc-full">Couldn\'t find that quest — the link may be wrong.</p>';
        return;
      }
      const item = data.submission;
      $("direct-review-icon").textContent = item.icon;
      $("direct-review-title").textContent = item.title;
      let photoInner = item.icon;
      if (item.thumb) {
        photoInner = '<img src="' + item.thumb + '" alt="Proof thumbnail" />' +
          (item.mediaType === "video" ? '<span class="video-play-indicator" style="position:absolute;bottom:6px;left:8px;background:rgba(0,0,0,0.65);padding:2px 8px;border-radius:10px;font-size:11px;color:#fff;">▶ Video</span>' : "");
      }
      const gpsHtml = item.proofGps ? '<div class="rcard-gps" style="margin:6px auto;display:inline-flex;">📍 GPS: ' + item.proofGps + '</div>' : "";
      body.innerHTML =
        '<div class="rcard-photo">' + photoInner + "</div>" +
        gpsHtml +
        '<div class="rcard-meta" style="justify-content:center;"><span>' + item.byName + '</span><span class="social-icons"></span></div>' +
        (item.caption ? '<div class="rcard-caption">"' + item.caption + '"</div>' : "") +
        '<div class="caption-row"><input type="text" id="direct-review-comment" class="glass-input" maxlength="50" placeholder="Feedback or note (optional)" /></div>' +
        '<div class="direct-review-actions"><button class="rbtn rbtn-skip rbtn-reject" id="direct-review-skip-btn" type="button">✕ Reject</button><button class="rbtn rbtn-approve" id="direct-review-approve-btn" type="button">✓ Approve</button></div>';
      renderSocialIcons(body.querySelector(".social-icons"), item.socialLinks);
      body.querySelector("#direct-review-approve-btn").addEventListener("click", () => submitDirectReview("approve"));
      body.querySelector("#direct-review-skip-btn").addEventListener("click", () => submitDirectReview("reject"));
    } catch (err) {
      body.innerHTML = '<p class="qdesc-full">' + err.message + "</p>";
    }
  }

  async function submitDirectReview(decision) {
    const commentEl = $("direct-review-comment");
    const comment = commentEl ? commentEl.value.trim().slice(0, 50) : "";
    const body = $("direct-review-body");
    try {
      const result = await api("/cove/review", { method: "POST", body: { submissionId: directReviewSubmissionId, decision, comment } });
      if (result.reviewerReward) {
        user.balance += result.reviewerReward;
        user.cheeredToday = (user.cheeredToday || 0) + 1;
        renderHeader();
        pulseCoin();
        const feedbackMsg = result.hasFeedback ? " (includes +1 feedback bonus! ✨)" : "";
        const puffinNoun = result.reviewerReward > 1 ? "Puffins" : "Puffin";
        toast("Thanks for reviewing! +" + result.reviewerReward + " " + puffinNoun + feedbackMsg, "🎉");
      }
      body.innerHTML = '<p class="qdesc-full">' + (decision === "approve" ? "Thanks for approving this quest! 🎉" : "Review submitted. Thanks for keeping Cove honest!") + ' Want to start your own Puffin Quest journey?</p>';
    } catch (err) {
      body.innerHTML = '<p class="qdesc-full">' + err.message + "</p>";
    }
  }

  function closeDirectReview() {
    $("direct-review-overlay").classList.remove("open");
    document.body.style.overflow = "";
    if (/^\/review\//.test(location.pathname)) history.pushState(null, "", "/");
  }
  $("direct-review-close").addEventListener("click", closeDirectReview);
  $("direct-review-overlay").addEventListener("click", (e) => {
    if (e.target === $("direct-review-overlay")) closeDirectReview();
  });

  /* ================= NAVIGATION ================= */
  function setActivePage(name) {
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.dataset.page === name));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
    if (name === "cove" && coveQueue.length < 3) fetchCoveQueue().catch(() => {});
    if (name === "bird") renderBirdTab();
    if (name === "fight") {
      if (activeFightPanel === 0) {
        api("/fight").then(({ fights }) => { fightList = fights; renderFightList(); }).catch(() => {});
      } else if (activeFightPanel === 1) {
        refreshCityData().catch(() => {});
      } else if (activeFightPanel === 2) {
        refreshPvPData().catch(() => {});
      }
    }
    if (name === "fish") {
      api("/fish").then(fresh => { fishData = fresh; renderFishPanels(); }).catch(() => {});
    }
  }
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActivePage(btn.dataset.page));
  });

  /* ================= POLLING ================= */
  async function refreshCore() {
    const [me, quests] = await Promise.all([api("/profile/me"), api("/quests")]);
    user = me.user;
    journal = me.journal;
    questsStatus = quests;
  }

  // Every quest finalizes instantly now, so this just keeps balance/streak
  // and the grids in sync if the user has multiple tabs or devices open —
  // there's no more "waiting on approval" state to detect.
  async function pollUpdates() {
    if (!token) return;
    try {
      await refreshCore();
      renderHeader();
      renderQuestGrids();
      if (document.querySelector('.page[data-page="bird"]').classList.contains("active")) renderBirdTab();
    } catch (e) {
      // silent — offline or session expired mid-poll; next tick or an explicit action will surface it
    }
  }

  /* ================= BOOT ================= */
  async function bootApp() {
    try {
      content = await api("/content");
      await refreshCore();
      const [{ fights }, fresh, freshCity, pvp] = await Promise.all([
        api("/fight"),
        api("/fish"),
        api("/city"),
        api("/fight/pvp").catch(() => ({ myFights: [], publicRooms: [], currentUserId: null }))
      ]);
      fightList = fights;
      fishData = fresh;
      cityData = freshCity;
      pvpData = pvp;

      showApp();
      renderHeader();
      renderQuestGrids();
      renderFightList();
      renderPvP();
      renderFishPanels();
      renderCoveProgress();
      renderCityChallenge();
      renderTrueQuestCampaign().catch(() => {});

      // Show toast if a streak freeze was consumed to protect the streak
      if (user.freezeUsed) {
        toast("🧊 Streak Freeze used! Your streak is safe.", "❄️");
      }

      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(pollUpdates, 7000);
    } catch (err) {
      console.error("bootApp failed:", err);
      if (err.status === 401) {
        setToken(null);
        showAuth(null);
      } else {
        showAuth(err.message || "Couldn't connect — please try again.");
      }
    }
  }

  /* ================= ROUTING (works even before/without sign-in) ================= */
  const initialPath = location.pathname;
  const birdMatch = initialPath.match(/^\/bird\/([^/]+)\/?$/);
  const reviewMatch = initialPath.match(/^\/review\/(\d+)\/?$/);

  if (birdMatch) openSharedProfile(decodeURIComponent(birdMatch[1]));

  if (token) {
    if (reviewMatch) {
      bootApp().then(() => openDirectReview(parseInt(reviewMatch[1], 10)));
    } else {
      bootApp();
    }
  } else if (birdMatch) {
    // A shared profile link is a public page — don't stack the sign-in
    // wall behind it. It appears once the visitor closes the profile.
    $("auth-overlay").classList.remove("open");
  } else if (reviewMatch) {
    // A review link needs an account right away, so go straight to sign-in.
    showAuth();
    pendingDirectReviewAfterAuth = parseInt(reviewMatch[1], 10);
  } else {
    // Everyone else (root "/", "/intro", or anything unrecognized) meets
    // the landing page first instead of a login wall.
    openLanding(false);
  }
})();
