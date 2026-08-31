"use strict";
(function () {
  const TOKEN_KEY = "pq_token";
  let token = localStorage.getItem(TOKEN_KEY);

  let content = null;
  let user = null;
  let journal = [];
  let questsStatus = { dailyQuestIds: [], dailyDoneIds: [], funDoneIds: [] };
  let pendingSubmissions = [];
  let coveQueue = [];
  let fightList = [];
  let fishData = { titles: [], badges: [], equippedTitle: null, catchLog: [] };

  let activeQuestId = null;
  let activeIsDaily = false;
  let previewDataUrl = null;
  let previewThumb = null;
  let pollTimer = null;
  let pendingDirectReviewAfterAuth = null;

  const $ = (id) => document.getElementById(id);

  /* ================= API ================= */
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch("/api" + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
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
  function openLanding(pushUrl) {
    $("landing-overlay").classList.add("open");
    document.body.style.overflow = "hidden";
    landingScroll.scrollTop = 0;
    if (pushUrl !== false) history.pushState(null, "", "/intro");
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
  }

  /* ================= QUEST GRIDS ================= */
  function questStatusFor(id, isDaily) {
    const doneIds = isDaily ? questsStatus.dailyDoneIds : questsStatus.funDoneIds;
    if (doneIds.includes(id)) return "done";
    if (pendingSubmissions.some((p) => p.questId === id)) return "pending";
    return "new";
  }

  function makeQuestCard(q, isDaily) {
    const status = questStatusFor(q.id, isDaily);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "qcard glass glass-interactive" + (status === "done" ? " is-done" : "") + (status === "pending" ? " is-pending" : "");
    const chip =
      status === "done"
        ? '<span class="status-chip status-done">Done</span>'
        : status === "pending"
        ? '<span class="status-chip status-pending">Pending</span>'
        : '<span class="status-chip status-new">New</span>';
    card.innerHTML =
      '<div class="glass-sheen"></div>' +
      '<div class="icon-chip">' + q.icon + "</div>" +
      '<div class="qtitle">' + q.title + "</div>" +
      '<div class="qdesc">' + q.desc + "</div>" +
      '<div class="qcard-foot">' +
      '<span class="reward-chip"><svg viewBox="0 0 64 64"><use href="#i-puffin"/></svg>+' + q.reward + "</span>" +
      chip +
      "</div>";
    card.addEventListener("click", () => openModal(q.id, isDaily));
    return card;
  }

  function renderQuestGrids() {
    if (!content) return;
    const dailyGrid = $("daily-grid");
    dailyGrid.innerHTML = "";
    const todaysQuests = questsStatus.dailyQuestIds.map((id) => content.dailyPool.find((q) => q.id === id)).filter(Boolean);
    todaysQuests.forEach((q) => dailyGrid.appendChild(makeQuestCard(q, true)));
    const doneCount = todaysQuests.filter((q) => questsStatus.dailyDoneIds.includes(q.id)).length;
    $("daily-progress").textContent = doneCount + "/" + todaysQuests.length + " done";

    const funGrid = $("fun-grid");
    funGrid.innerHTML = "";
    content.funPool.forEach((q) => funGrid.appendChild(makeQuestCard(q, false)));
  }

  /* ================= QUEST MODAL ================= */
  const overlay = $("modal-overlay");

  function findQuest(id) {
    return content.dailyPool.concat(content.funPool).find((q) => q.id === id);
  }

  function showModalStage(stage) {
    $("modal-body-idle").style.display = stage === "idle" ? "" : "none";
    $("modal-body-pending").style.display = stage === "pending" ? "" : "none";
    $("modal-body-done").style.display = stage === "done" ? "" : "none";
  }

  function updateModalRewardDisplay() {
    const q = findQuest(activeQuestId);
    if (!q) return;
    const caption = $("caption-input").value.trim();
    const bonus = (previewDataUrl ? content.photoBonus : 0) + (caption ? content.captionBonus : 0);
    $("modal-reward-amt").textContent = "+" + (q.reward + bonus) + " Puffins";
  }

  function openModal(questId, isDaily) {
    const q = findQuest(questId);
    if (!q) return;
    activeQuestId = questId;
    activeIsDaily = isDaily;
    previewDataUrl = null;
    previewThumb = null;

    $("modal-icon").textContent = q.icon;
    $("modal-title").textContent = q.title;
    $("modal-desc").textContent = q.desc;
    $("preview-holder").innerHTML = "";
    $("file-input").value = "";
    $("caption-input").value = "";
    $("caption-count").textContent = "0/50";
    updateModalRewardDisplay();

    const status = questStatusFor(questId, isDaily);
    if (status === "done") {
      const entry = journal.find((e) => e.questId === questId);
      $("done-msg").textContent = "You earned +" + (entry ? entry.reward : q.reward) + " Puffins.";
      showModalStage("done");
    } else if (status === "pending") {
      const pending = pendingSubmissions.find((p) => p.questId === questId);
      $("pending-msg").textContent = pending
        ? "Waiting for real puffineers to review it (" + pending.approvals + "/" + pending.approvalsNeeded + " approvals so far)."
        : "Waiting for real puffineers to review it.";
      showModalStage("pending");
    } else {
      showModalStage("idle");
    }
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
  }
  $("modal-close").addEventListener("click", closeModal);
  $("pending-close-btn").addEventListener("click", closeModal);
  $("done-close-btn").addEventListener("click", closeModal);
  $("pending-share-btn").addEventListener("click", () => {
    const pending = pendingSubmissions.find((p) => p.questId === activeQuestId);
    if (!pending) return;
    const url = new URL(location.href);
    url.search = "";
    url.pathname = "/review/" + pending.id;
    copyToClipboard(url.toString(), "Review link copied — send it to a friend!");
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

  function handleFile(file) {
    if (!file.type || file.type.indexOf("image/") !== 0) {
      toast("Please choose an image file.", "⚠️");
      return;
    }
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
        $("preview-remove").addEventListener("click", (ev) => {
          ev.stopPropagation();
          previewDataUrl = null;
          previewThumb = null;
          $("preview-holder").innerHTML = "";
          updateModalRewardDisplay();
        });
      }, 640);
    };
    reader.readAsDataURL(file);
  }

  $("caption-input").addEventListener("input", function () {
    $("caption-count").textContent = this.value.length + "/50";
    updateModalRewardDisplay();
  });

  $("submit-btn").addEventListener("click", async () => {
    const questId = activeQuestId;
    const caption = $("caption-input").value.trim().slice(0, 50);
    const thumb = previewThumb;
    $("submit-btn").disabled = true;
    try {
      const { submission } = await api("/quests/submit", { method: "POST", body: { questId, caption, thumb } });
      pendingSubmissions.push(submission);
      renderQuestGrids();
      $("pending-msg").textContent = "Waiting for real puffineers to review it (0/" + submission.approvalsNeeded + " approvals so far).";
      showModalStage("pending");
      toast("Submitted! Waiting for the Cove to review it.", "📮");
    } catch (err) {
      toast(err.message, "⚠️");
      if (err.status === 409) {
        await refreshCore();
        renderHeader();
        renderQuestGrids();
        closeModal();
      }
    } finally {
      $("submit-btn").disabled = false;
    }
  });

  /* ================= REVIEW COVE ================= */
  function renderCoveProgress() {
    $("cove-progress").textContent = user.coveApprovedToday + " reviewed today";
  }

  async function fetchCoveQueue() {
    const { queue, approvedToday } = await api("/cove/queue");
    const existingIds = new Set(coveQueue.map((c) => c.id));
    queue.forEach((item) => {
      if (!existingIds.has(item.id)) coveQueue.push(item);
    });
    user.coveApprovedToday = approvedToday;
    renderCoveProgress();
    renderCoveStack();
  }

  function renderCoveStack() {
    const stack = $("cove-stack");
    stack.innerHTML = "";
    if (coveQueue.length === 0) {
      const empty = document.createElement("div");
      empty.className = "cove-empty";
      empty.textContent = "The cove is quiet right now — check back soon. 🌊";
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
      const photoInner = item.thumb ? '<img src="' + item.thumb + '" alt="" />' : item.icon;
      card.innerHTML =
        '<div class="stamp stamp-approve">Nice!</div>' +
        '<div class="stamp stamp-skip">Skip</div>' +
        '<div class="rcard-photo">' + photoInner + "</div>" +
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
    const skipStamp = cardEl.querySelector(".stamp-skip");

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
      approveStamp.style.opacity = String(Math.max(0, Math.min(1, dx / 80)));
      skipStamp.style.opacity = String(Math.max(0, Math.min(1, -dx / 80)));
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
        reviewCard(item.id, "skip");
      } else {
        cardEl.style.transform = "translate(0,0) rotate(0)";
        approveStamp.style.opacity = "0";
        skipStamp.style.opacity = "0";
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
    const comment = decision === "approve" ? $("cove-comment-input").value.trim().slice(0, 50) : "";
    coveQueue = coveQueue.filter((c) => c.id !== submissionId);
    $("cove-comment-input").value = "";
    $("cove-comment-count").textContent = "0/50";
    setTimeout(renderCoveStack, 280);
    try {
      const result = await api("/cove/review", { method: "POST", body: { submissionId, decision, comment } });
      if (result.reviewerReward) {
        user.balance += result.reviewerReward;
        user.coveApprovedToday += 1;
        renderHeader();
        renderCoveProgress();
        pulseCoin();
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
    reviewCard(top.id, "skip");
  });
  $("cove-comment-input").addEventListener("input", function () {
    $("cove-comment-count").textContent = this.value.length + "/50";
  });

  /* ================= FIGHT ================= */
  function renderFightList() {
    const list = $("fight-list");
    list.innerHTML = "";
    fightList.forEach((f) => {
      const pct = Math.round((f.progress / f.target) * 100);
      const card = document.createElement("div");
      card.className = "fight-card glass";
      const resetLabel = new Date(f.resetDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      card.innerHTML =
        '<div class="fight-head"><span class="fight-tag">' + f.label + '</span><span class="fight-reset">Resets ' + resetLabel + "</span></div>" +
        '<h3 class="fight-name">' + f.name + '</h3><p class="fight-desc">' + f.desc + "</p>" +
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
      renderHeader();
      pulseCoin();
      burstConfetti();
      toast("Challenge claimed! +" + result.reward + " Puffins" + (result.titleReward ? " and the title \"" + result.titleReward + "\"" : ""), "🏆");
      const { fights } = await api("/fight");
      fightList = fights;
      renderFightList();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  /* ================= FISH ================= */
  function renderFishPanels() {
    $("fish-cost-label").textContent = "Costs " + content.fishCost + " Puffins per cast";
    const titleList = $("title-list");
    titleList.innerHTML = "";
    if (!fishData.titles.length) {
      titleList.innerHTML = '<div class="fish-empty">No titles yet — go fish!</div>';
    } else {
      fishData.titles.forEach((t) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "title-chip" + (fishData.equippedTitle === t ? " equipped" : "");
        chip.textContent = t;
        chip.addEventListener("click", () => equipTitle(fishData.equippedTitle === t ? null : t));
        titleList.appendChild(chip);
      });
    }
    const badgeCase = $("badge-case");
    badgeCase.innerHTML = "";
    if (!fishData.badges.length) {
      badgeCase.innerHTML = '<div class="fish-empty">No badges yet — go fish!</div>';
    } else {
      fishData.badges.forEach((id) => {
        const loot = content.lootTable.find((l) => l.id === id);
        const chip = document.createElement("div");
        chip.className = "badge-chip";
        chip.title = loot ? loot.label : id;
        chip.textContent = loot ? loot.icon : "🏅";
        badgeCase.appendChild(chip);
      });
    }
    const log = $("catch-log");
    log.innerHTML = "";
    if (!fishData.catchLog.length) {
      log.innerHTML = '<div class="fish-empty">Your catches will show up here.</div>';
    } else {
      fishData.catchLog.forEach((c) => {
        const row = document.createElement("div");
        row.className = "catch-log-row";
        row.innerHTML = '<span class="icon">' + c.icon + '</span><span>' + c.label + '</span><span class="detail">' + c.detail + "</span>";
        log.appendChild(row);
      });
    }
  }

  async function equipTitle(title) {
    try {
      await api("/fish/equip", { method: "POST", body: { title } });
      fishData.equippedTitle = title;
      renderFishPanels();
      if (document.querySelector('.page[data-page="bird"]').classList.contains("active")) renderBirdTab();
    } catch (err) {
      toast(err.message, "⚠️");
    }
  }

  async function castLine() {
    const stage = $("fish-stage");
    const startBtn = $("fish-cast-btn");
    if (startBtn) startBtn.disabled = true;
    stage.innerHTML = '<div class="fish-waiting">🎣 Casting…</div>';
    try {
      const result = await api("/fish/cast", { method: "POST" });
      user.balance = result.balance;
      renderHeader();
      pulseCoin();
      const c = result.catch;
      stage.innerHTML =
        '<div class="catch-card rarity-' + c.rarity + '">' +
        '<div class="catch-icon">' + c.icon + "</div>" +
        '<div class="catch-label">' + c.label + "</div>" +
        '<div class="catch-detail">' + c.detail + "</div></div>";
      if (c.rarity === "legendary") burstConfetti();
      const fresh = await api("/fish");
      fishData = fresh;
      renderFishPanels();
    } catch (err) {
      toast(err.message, "⚠️");
    } finally {
      setTimeout(() => {
        stage.innerHTML = '<button class="btn btn-primary fish-cast-btn" id="fish-cast-btn" type="button">🎣 Cast Line</button>';
      }, 1800);
    }
  }
  // Event delegation: the cast button is replaced with fresh markup after
  // each cast (to swap in the catch-result card), so bind on the stable
  // parent instead of the button itself.
  $("fish-stage").addEventListener("click", (e) => {
    if (e.target.closest("#fish-cast-btn")) castLine();
  });

  /* ================= BIRD / PROFILE ================= */
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
      body.appendChild(titleRow);
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
    renderJournalList($("bird-journal-list"), journal, { showThumb: true, truncated: false });
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
        body.innerHTML = '<p class="qdesc-full">This is your own quest — share the link with someone else to get it reviewed!</p>';
        return;
      }
      if (data.status === "closed") {
        body.innerHTML = '<p class="qdesc-full">This quest has already finished being reviewed. Thanks for checking!</p>';
        return;
      }
      if (data.status === "already-reviewed") {
        body.innerHTML = '<p class="qdesc-full">You already reviewed this one. Thanks for helping out! 🐧</p>';
        return;
      }
      if (data.status === "not-found") {
        body.innerHTML = '<p class="qdesc-full">Couldn\'t find that quest — the link may be wrong.</p>';
        return;
      }
      const item = data.submission;
      $("direct-review-icon").textContent = item.icon;
      $("direct-review-title").textContent = item.title;
      const photoInner = item.thumb ? '<img src="' + item.thumb + '" alt="" />' : item.icon;
      body.innerHTML =
        '<div class="rcard-photo">' + photoInner + "</div>" +
        '<div class="rcard-meta" style="justify-content:center;"><span>' + item.byName + '</span><span class="social-icons"></span></div>' +
        (item.caption ? '<div class="rcard-caption">"' + item.caption + '"</div>' : "") +
        '<div class="caption-row"><input type="text" id="direct-review-comment" class="glass-input" maxlength="50" placeholder="Cheer them on (optional)" /></div>' +
        '<div class="direct-review-actions"><button class="rbtn rbtn-skip" id="direct-review-skip-btn" type="button">✕ Skip</button><button class="rbtn rbtn-approve" id="direct-review-approve-btn" type="button">👍 Approve</button></div>';
      renderSocialIcons(body.querySelector(".social-icons"), item.socialLinks);
      body.querySelector("#direct-review-approve-btn").addEventListener("click", () => submitDirectReview("approve"));
      body.querySelector("#direct-review-skip-btn").addEventListener("click", () => submitDirectReview("skip"));
    } catch (err) {
      body.innerHTML = '<p class="qdesc-full">' + err.message + "</p>";
    }
  }

  async function submitDirectReview(decision) {
    const commentEl = $("direct-review-comment");
    const comment = decision === "approve" && commentEl ? commentEl.value.trim().slice(0, 50) : "";
    const body = $("direct-review-body");
    try {
      const result = await api("/cove/review", { method: "POST", body: { submissionId: directReviewSubmissionId, decision, comment } });
      if (result.reviewerReward) {
        toast("Thanks for reviewing! +" + result.reviewerReward + " Puffin", "🐧");
      }
      body.innerHTML = '<p class="qdesc-full">Thanks for helping out! 🎉 Want to start your own Puffin Quest journey?</p>';
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
  }
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setActivePage(btn.dataset.page));
  });

  /* ================= POLLING ================= */
  async function refreshCore() {
    const [me, quests, pendingRes] = await Promise.all([api("/profile/me"), api("/quests"), api("/quests/pending")]);
    user = me.user;
    journal = me.journal;
    questsStatus = quests;
    pendingSubmissions = pendingRes.pending;
  }

  async function pollUpdates() {
    if (!token) return;
    try {
      const [pendingRes, me, quests] = await Promise.all([api("/quests/pending"), api("/profile/me"), api("/quests")]);
      const stillPendingIds = new Set(pendingRes.pending.map((p) => p.id));
      const newlyApproved = pendingSubmissions.filter((p) => !stillPendingIds.has(p.id));
      pendingSubmissions = pendingRes.pending;
      user = me.user;
      journal = me.journal;
      questsStatus = quests;
      renderHeader();
      renderQuestGrids();
      if (document.querySelector('.page[data-page="bird"]').classList.contains("active")) renderBirdTab();

      if (newlyApproved.length) {
        newlyApproved.forEach((p) => {
          const entry = journal.find((e) => e.questId === p.questId);
          toast('"' + p.title + '" approved! +' + (entry ? entry.reward : p.reward) + " Puffins", "🎉");
        });
        burstConfetti();
        pulseCoin();
        if (activeQuestId && overlay.classList.contains("open") && newlyApproved.some((p) => p.questId === activeQuestId)) {
          const entry = journal.find((e) => e.questId === activeQuestId);
          $("done-msg").textContent = "You earned +" + (entry ? entry.reward : 0) + " Puffins.";
          showModalStage("done");
        }
      }
    } catch (e) {
      // silent — offline or session expired mid-poll; next tick or an explicit action will surface it
    }
  }

  /* ================= BOOT ================= */
  async function bootApp() {
    try {
      content = await api("/content");
      await refreshCore();
      const [{ fights }, fresh] = await Promise.all([api("/fight"), api("/fish")]);
      fightList = fights;
      fishData = fresh;

      showApp();
      renderHeader();
      renderQuestGrids();
      renderFightList();
      renderFishPanels();
      renderCoveProgress();

      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(pollUpdates, 7000);
    } catch (err) {
      setToken(null);
      showAuth(err.status === 401 ? null : "Couldn't connect — please try again.");
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
