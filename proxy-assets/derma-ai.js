console.log("🔥 Derma AI Wizard Loaded");

/* ============================================================
   BASE CONFIG
============================================================ */
const BASE_URL = "https://dermatics-ai-production.up.railway.app";
const SESSION_START_URL = `${BASE_URL}/api/session/start`;
const FLOW_SUBMIT_URL = `${BASE_URL}/api/flow/submit`;
const IMAGE_UPLOAD_URL = `${BASE_URL}/api/flow/upload-image`;

let DERMA_SESSION_ID = null;
let CURRENT_STEP = null;
let ACTIVE_FLOW = "skin";
let IS_SUBMITTING = false;

/* ============================================================
   FLOW CONFIG
============================================================ */
const FLOW_CONFIG = {
  skin: {
    flowType: "skin_flow",
    title: "AI Skin Advisor",
    welcome: "👋 Hello! I'm your Dermatics AI Skincare Assistant.",
  },
  hair: {
    flowType: "hair_flow",
    title: "AI Hair Advisor",
    welcome: "👋 Hi! I'm your Dermatics AI Hair Assistant.",
  },
};

/* ============================================================
   CHAT STATE
============================================================ */
let CHAT_TIMELINE = [];

const escapeHtml = (str) =>
  str == null
    ? ""
    : String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

/* ============================================================
   CHAT RENDER
============================================================ */
function renderChatUI() {
  const screen = document.getElementById("derma-ai-screen");
  if (!screen) return;

  screen.innerHTML = CHAT_TIMELINE.map((m) => {
    if (m.type === "bot")
      return `<div class="chat-row bot"><div class="bubble bot-bubble">${m.text}</div></div>`;
    if (m.type === "user")
      return `<div class="chat-row user"><div class="bubble user-bubble">${m.text}</div></div>`;
    if (m.type === "ui") return `<div class="chat-ui-block">${m.html}</div>`;
    return "";
  }).join("");

  screen.scrollTop = screen.scrollHeight;
}

const addBot = (t) =>
  t && (CHAT_TIMELINE.push({ type: "bot", text: escapeHtml(t) }), renderChatUI());
const addUser = (t) =>
  (CHAT_TIMELINE.push({ type: "user", text: escapeHtml(t) }), renderChatUI());
const addUI = (h) =>
  (CHAT_TIMELINE.push({ type: "ui", html: h }), renderChatUI());

/* ============================================================
   DRAWER
============================================================ */
function createDrawer() {
  if (document.getElementById("derma-ai-drawer")) return;

  const d = document.createElement("div");
  d.id = "derma-ai-drawer";
  d.innerHTML = `
    <div class="derma-ai-drawer-header">
      <span>AI Skin & Hair Advisor</span>
      <span class="wizard-close">&times;</span>
    </div>
    <div id="derma-ai-screen" class="derma-ai-chat-screen"></div>
  `;
  document.body.appendChild(d);

  d.querySelector(".wizard-close").onclick = () =>
    d.classList.remove("open");
}

function openDrawer() {
  createDrawer();
  document.getElementById("derma-ai-drawer").classList.add("open");
}

/* ============================================================
   API
============================================================ */
async function postJSON(url, payload, multipart = false) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: multipart ? undefined : { "Content-Type": "application/json" },
      body: multipart ? payload : JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    console.error("❌ API ERROR", e);
    return { error: true };
  }
}

/* ============================================================
   START SESSION
============================================================ */
async function startSession() {
  ACTIVE_FLOW = "skin";
  CHAT_TIMELINE = [];
  renderChatUI();
  openDrawer();

  addBot("⏳ Preparing your personalized assessment...");

  const data = await postJSON(SESSION_START_URL, {
    platform: "web",
    flowType: FLOW_CONFIG.skin.flowType,
  });

  if (!data || data.error) {
    addBot("❌ Unable to start session.");
    return;
  }

  DERMA_SESSION_ID = data.session_id;
  document.querySelector(".derma-ai-drawer-header span").textContent =
    FLOW_CONFIG[ACTIVE_FLOW].title;

  addBot(FLOW_CONFIG[ACTIVE_FLOW].welcome);
  renderUI(data.ui);
}

/* ============================================================
   UI CONTROLLER
============================================================ */
function renderUI(ui) {
  if (!ui) return;

  CURRENT_STEP = ui.step_id;

  // ✅ IMPORTANT: Prevent duplicate headings/messages for AI report
  if (ui.ui_type !== "ai_report") {
    if (ui.heading) addBot(ui.heading);
    if (ui.message) addBot(ui.message);
  }

  const map = {
    card_select: renderCardSelect,
    pill_list: renderPillList,
    button_list: renderButtonList,
    multi_select: renderMultiSelect,
    image_upload: renderImageUpload,
    analysis_cards: renderAnalysisCards,
    product_routine: renderRoutine,
    hair_product_routine: renderRoutine,
    ai_report: renderAIReport,
    final_actions: renderFinalActions,
    action_button: renderActionButton,
  };

  const fn = map[ui.ui_type];
  if (!fn) {
    console.warn("⚠ Unsupported UI:", ui.ui_type, ui);
    return;
  }

  fn(ui);
}

/* ============================================================
   CARD SELECT
============================================================ */
function renderCardSelect(ui) {
  addUI(`
    <div class="card-select-grid">
      ${(ui.options || [])
        .map(
          (o) => `
        <div class="card-select-item" data-id="${escapeHtml(o.id)}">
          ${o.image ? `<img src="${escapeHtml(o.image)}" />` : ""}
          <div class="title">${escapeHtml(o.label)}</div>
        </div>`
        )
        .join("")}
    </div>
  `);

  document.querySelectorAll(".card-select-item").forEach((el) => {
    el.onclick = () => {
      addUser(el.querySelector(".title").textContent);

      if (ui.step_id === "choose_concern") {
        ACTIVE_FLOW = el.dataset.id === "hair_assessment" ? "hair" : "skin";
        document.querySelector(".derma-ai-drawer-header span").textContent =
          FLOW_CONFIG[ACTIVE_FLOW].title;
      }

      submitStep(ui.step_id, el.dataset.id);
    };
  });
}

/* ============================================================
   PILL LIST
============================================================ */
function renderPillList(ui) {
  addUI(`
    <div class="pill-list">
      ${(ui.options || [])
        .map((o) => `<div class="pill-item">${escapeHtml(o)}</div>`)
        .join("")}
    </div>
  `);

  document.querySelectorAll(".pill-item").forEach((el) => {
    el.onclick = () => {
      addUser(el.textContent);
      submitStep(ui.step_id, el.textContent);
    };
  });
}

/* ============================================================
   BUTTON LIST
============================================================ */
function renderButtonList(ui) {
  addUI(`
    <div class="btn-list">
      ${(ui.options || [])
        .map((o) => `<button class="figma-btn">${escapeHtml(o)}</button>`)
        .join("")}
    </div>
  `);

  document.querySelectorAll(".btn-list .figma-btn").forEach((btn) => {
    btn.onclick = () => {
      addUser(btn.textContent);
      submitStep(ui.step_id, btn.textContent);
    };
  });
}

/* ============================================================
   MULTI SELECT
============================================================ */
function renderMultiSelect(ui) {
  const selected = new Set();
  const btnId = `multi-${ui.step_id}`;

  addUI(`
    <div class="goal-grid">
      ${(ui.options || [])
        .map(
          (o) => `
        <div class="goal-item" data-id="${escapeHtml(o.id)}">${escapeHtml(
            o.label
          )}</div>
      `
        )
        .join("")}
    </div>
    <button class="figma-btn primary" id="${btnId}">Continue</button>
  `);

  document.querySelectorAll(".goal-item").forEach((el) => {
    el.onclick = () => {
      el.classList.toggle("active");
      selected.has(el.dataset.id)
        ? selected.delete(el.dataset.id)
        : selected.add(el.dataset.id);
    };
  });

  document.getElementById(btnId).onclick = () => {
    if (!selected.size) {
      addBot("⚠ Please select at least one option.");
      return;
    }
    const payload = [...selected];
    addUser(payload.join(", "));
    addBot("⏳ Generating your personalized routine...");
    submitStep(ui.step_id, payload);
  };
}

/* ============================================================
   ACTION BUTTON
============================================================ */
function renderActionButton(ui) {
  addUI(`
    <div class="action-button-wrapper">
      <button class="figma-btn primary" id="action-${ui.step_id}">
        ${escapeHtml(ui.label || "Continue")}
      </button>
    </div>
  `);

  document.getElementById(`action-${ui.step_id}`).onclick = () => {
    addUser(ui.label || "Continue");
    submitStep(ui.step_id, ui.value || "continue");
  };
}

/* ============================================================
   IMAGE UPLOAD
============================================================ */
function renderImageUpload() {
  addUI(`<input type="file" id="img-upload" accept="image/*" />`);

  document.getElementById("img-upload").onchange = async (e) => {
    const fd = new FormData();
    fd.append("session_id", DERMA_SESSION_ID);
    fd.append("image", e.target.files[0]);
    fd.append("analysis_type", ACTIVE_FLOW);

    addUser("📸 Photo uploaded");
    addBot("⏳ Analyzing image...");

    const res = await postJSON(IMAGE_UPLOAD_URL, fd, true);
    if (res?.ui) renderUI(res.ui);
  };
}

/* ============================================================
   ANALYSIS
============================================================ */
function renderAnalysisCards(ui) {
  addUI(`
    <div class="analysis-grid">
      ${Object.entries(ui.results || {})
        .map(
          ([k, v]) =>
            `<div class="analysis-card"><b>${escapeHtml(
              k
            )}</b><div>${v}%</div></div>`
        )
        .join("")}
    </div>
    <button class="figma-btn primary" id="analysis-continue">Continue</button>
  `);

  document.getElementById("analysis-continue").onclick = () => {
    addUser("Continue");
    submitStep(ui.step_id, "continue");
  };
}

/* ============================================================
   PRODUCT ROUTINE ✅ UPDATED
   - ADD button shown even if single product
============================================================ */
function renderRoutine(ui) {
  const routine = ui.routine || {};
  const nextBtnId = `next-ai-report-${ui.step_id}`;

  addUI(`
    <div class="routine-wrapper">
      <h3>Your Personalized <span>Routine</span></h3>

      ${Object.entries(routine)
        .map(
          ([step, products]) => `
        <div class="routine-step">
          <h4>${escapeHtml(step)}</h4>
          <div class="product-grid">
            ${products
              .map(
                (p) => `
              <div class="product-card">
                <div class="badge ${p.recommended ? "rec" : "alt"}">
                  ${p.recommended ? "Recommended" : "Alternative"}
                </div>

                <img src="${escapeHtml(p.image)}" />

                <div class="product-title">${escapeHtml(p.title)}</div>

                <div class="price">
                  ₹${escapeHtml(p.price)} ${
                  p.mrp ? `<span>₹${escapeHtml(p.mrp)}</span>` : ""
                }
                </div>

                <!-- ✅ ALWAYS SHOW ADD BUTTON -->
                <button class="add-btn" data-variant="${escapeHtml(
                  p.variant_id || ""
                )}"
                  ${p.variant_id ? `onclick="addToCart('${escapeHtml(p.variant_id)}')"` : ""}>
                  ADD
                </button>

              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `
        )
        .join("")}

      <button class="figma-btn primary add-all" onclick="addAllToCart()">
        Add All to Cart
      </button>

      <button class="figma-btn primary" id="${nextBtnId}" style="margin-top:14px;">
        Next AI Doctor’s Report
      </button>
    </div>
  `);

  document.getElementById(nextBtnId).onclick = () => {
    addUser("Next AI Doctor’s Report");
    submitStep(ui.step_id, "continue");
  };
}

/* ============================================================
   AI REPORT — FINAL FIX (DOWNLOAD + PROPER DESIGN)
============================================================ */
function renderAIReport(ui) {
  addUI(`
    <div class="ai-report-wrapper">
      <span class="step">Step 5: AI Doctor's Report</span>
      <p>Here is a summary of your analysis and personalized plan.</p>

      <div class="ai-report-card-main">
        <div class="ai-report-card-top">
          <div class="icon">🧑‍⚕️</div>
          <div class="text">
            <h4>AI Doctor's Report</h4>
            <p><b>Personalized Skincare Plan</b></p>
            <p class="date">Generated on: ${new Date().toLocaleDateString("en-IN")}</p>
          </div>
        </div>

        <!-- ✅ Download button ALWAYS visible -->
        <button
          class="ai-report-download-btn"
          onclick="${
            ui.pdf_url
              ? `window.open('${escapeHtml(ui.pdf_url)}','_blank')`
              : `alert('Report is still generating. Please try again in a moment.')`
          }"
        >
          ⬇ Download Report
        </button>
      </div>

      <div class="ai-report-actions">
        <button class="figma-btn" onclick="handleFinalAction('start-over')">
          Start Over
        </button>
        <button class="figma-btn primary" onclick="handleFinalAction('ai_assistant')">
          AI Assistant
        </button>
      </div>
    </div>
  `);
}



/* ============================================================
   FINAL ACTION HANDLER — FIXED
============================================================ */
function handleFinalAction(id) {
  if (id === "start-over") {
    startSession();
    return;
  }

  if (id === "ai_assistant") {
    addUser("AI Assistant");
    addBot(
      "Hello! I'm your Dermatics AI Skincare Assistant. How can I help you with your routine or skin analysis?"
    );
  }
}


/* ============================================================
   FINAL ACTIONS
============================================================ */
function renderFinalActions(ui) {
  addUI(`
    <div class="final-actions">
      ${(ui.actions || [])
        .map(
          (a) =>
            `<button class="figma-btn" onclick="handleFinalAction('${escapeHtml(
              a.id
            )}')">${escapeHtml(a.label)}</button>`
        )
        .join("")}
    </div>
  `);
}

function handleFinalAction(id) {
  if (id === "start-over") startSession();
  if (id === "ai_assistant") {
    addBot("👋 I’m here to help. Ask me anything about your routine!");
  }
}

/* ============================================================
   SUBMIT STEP
============================================================ */
async function submitStep(step_id, responseValue) {
  if (!DERMA_SESSION_ID || IS_SUBMITTING) return;

  IS_SUBMITTING = true;

  const res = await postJSON(FLOW_SUBMIT_URL, {
    session_id: DERMA_SESSION_ID,
    step_id,
    response: responseValue,
    flowType: FLOW_CONFIG[ACTIVE_FLOW].flowType,
  });

  IS_SUBMITTING = false;
  if (res?.ui) renderUI(res.ui);
}

/* ============================================================
   CART (SHOPIFY)
============================================================ */
function addToCart(variantId) {
  if (!variantId) {
    alert("Product variant missing");
    return;
  }

  fetch("/cart/add.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: Number(variantId), quantity: 1 }),
  });
}

function addAllToCart() {
  const items = [];

  document.querySelectorAll(".add-btn").forEach((btn) => {
    const v = btn.dataset.variant;
    if (v) items.push({ id: Number(v), quantity: 1 });
  });

  if (!items.length) {
    alert("No products available to add");
    return;
  }

  fetch("/cart/add.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

/* ============================================================
   LAUNCHER
============================================================ */
(function initLauncher() {
  const btn = document.createElement("div");
  btn.id = "derma-ai-launcher";
  btn.textContent = "AI Skin & Hair Analysis";
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;background:#2563EB;color:#fff;padding:14px 22px;border-radius:50px;cursor:pointer;z-index:999999;";
  btn.onclick = startSession;
  document.body.appendChild(btn);
})();



/* ============================================================
   HEADER ICON BINDING
============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const headerIcon =
    document.getElementById("derma-ai-header-icon") ||
    document.querySelector(".derma-ai-header-icon");

  if (!headerIcon) {
    console.warn("❌ Derma AI header icon not found");
    return;
  }

  headerIcon.addEventListener("click", (e) => {
    e.preventDefault();
    startSession(); // ✅ SAME FLOW
  });

  console.log("✅ Derma AI header icon connected");
});
