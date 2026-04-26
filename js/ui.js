// Shared UI helpers used by all public pages.

// ---------- Date / format ----------
function fmtDate(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
function fmtDateShort(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ---------- Block rendering ----------
function renderBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return `<div class="blocks">${renderSectionedBlocks(blocks)}</div>`;
}
function renderSectionedBlocks(blocks) {
  const sections = {
    Setup: [],
    "Price review": [],
    Thesis: [],
    Other: [],
  };
  const sectionMap = {
    Setup: ["Temperature", "Cloud Cover", "Wind", "Fuel Mix", "Demand"],
    "Price review": ["System Lambda", "Congestion Pricing"],
    Thesis: ["Predicted Price Action", "Notes", "+1 Prediction"],
  };
  function inferSectionFromLabel(label) {
    return Object.entries(sectionMap).find(([_, labels]) => labels.includes(label))?.[0] || "Other";
  }
  blocks.forEach((block) => {
    const label = String(block.label || "").trim();
    const section = block.section || inferSectionFromLabel(label);
    sections[section].push(block);
  });
  return Object.entries(sections).map(([section, items]) => {
    if (!items.length) return "";
    const rendered = items.map(renderBlock).filter(Boolean);
    if (!rendered.length) return "";
    return `<div class="entry-section">
      <div class="entry-section-heading">${escapeHtml(section)}</div>
      <div class="entry-section-grid">
        ${rendered.join("")}
      </div>
    </div>`;
  }).join("");
}
function renderBlock(b) {
  if (!b || typeof b !== "object") return "";
  const label = escapeHtml(b.label || "");
  const normalized = String(b.label || "").trim().toLowerCase();
  const section = b.section || "";
  const hasText = (v) => String(v || "").trim().length > 0;
  if (b.type === "image") {
    const url = escapeHtml(b.value || "");
    if (!url) return "";
    const caption = b.caption ? `<div class="caption">${escapeHtml(b.caption)}</div>` : "";
    return `<div class="block image">
      <div class="label">${label}</div>
      <div class="value"><img src="${url}" alt="${label}" loading="lazy" class="zoomable-image" data-full-src="${url}" data-caption="${escapeHtml(b.caption || "")}" data-label="${label}" />${caption}</div>
    </div>`;
  }
  if (b.type === "link") {
    const url = escapeHtml(b.value || "");
    if (!url) return "";
    let display = url;
    try { display = new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname; } catch {}
    return `<div class="block link">
      <div class="label">${label}</div>
      <div class="value"><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)} &nearr;</a></div>
    </div>`;
  }
  // text block — render HTML (bold/italic/underline from contenteditable)
  const maybeStructured = (() => {
    if (!["system lambda", "congestion pricing"].includes(normalized)) return null;
    try {
      return typeof b.value === "string" ? JSON.parse(b.value) : b.value;
    } catch {
      return null;
    }
  })();
  if (maybeStructured && typeof maybeStructured === "object") {
    if (normalized === "system lambda" && Array.isArray(maybeStructured.timeslots)) {
      const visibleSlots = maybeStructured.timeslots.filter((slot) =>
        hasText(slot?.price) || hasText(slot?.note) || (slot?.time === "custom" && hasText(slot?.customTime))
      );
      if (!visibleSlots.length) return "";
      return `<div class="block text structured-block">
        <div class="label">${label}</div>
        <div class="value">
          <div class="structured-header">
            <span>Time-slot</span>
            <span>$/MWh</span>
            <span>Notes</span>
          </div>
          ${visibleSlots.map((slot, idx) => `
            <button type="button" class="structured-row lambda-slot-btn ${idx === 0 ? "active" : ""}" data-slot-key="${escapeHtml(slot.time === "custom" ? (slot.customTime || "custom") : slot.time)}">
              <strong>${escapeHtml(slot.time === "custom" ? (slot.customTime || "custom") : slot.time)}</strong>
              <span>${escapeHtml(slot.price || "-")}</span>
              <span>${escapeHtml(slot.note || "")}</span>
            </button>
          `).join("")}
        </div>
      </div>`;
    }
    if (normalized === "congestion pricing" && Array.isArray(maybeStructured.timeslots)) {
      const visibleSlots = maybeStructured.timeslots.map((slot) => {
        const visibleHubs = Object.entries(slot.hubs || {}).filter(([_, data]) =>
          hasText(data?.price) || hasText(data?.note) || (section === "Thesis" && hasText(data?.thesisRating) && data.thesisRating !== "accurate")
        );
        return { slot, visibleHubs };
      }).filter((entry) => entry.visibleHubs.length > 0);
      if (!visibleSlots.length) return "";
      return `<div class="block text structured-block">
        <div class="label">${label}</div>
        <div class="value">
          ${visibleSlots.map(({ slot, visibleHubs }, idx) => `
            <div class="structured-group ${idx === 0 ? "active" : ""}" data-slot-key="${escapeHtml(slot.time === "custom" ? (slot.customTime || "custom") : slot.time)}">
              <div class="structured-group-title">Time slot: ${escapeHtml(slot.time === "custom" ? (slot.customTime || "custom") : slot.time)}</div>
              <div class="structured-header">
                <span>Hub</span>
                <span>$/MWh</span>
                <span>Notes</span>
                ${section === "Thesis" ? "<span>Status</span>" : ""}
              </div>
              ${visibleHubs.map(([hub, data]) => `
                <div class="structured-row">
                  <strong>${escapeHtml(hub)}</strong>
                  <span>${escapeHtml(data?.price || "-")}</span>
                  <span>${escapeHtml(data?.note || "")}</span>
                  ${section === "Thesis" && data?.thesisRating ? `<span class="rating ${data.thesisRating === "accurate" ? "rating-accurate" : "rating-alert"}">${escapeHtml(data.thesisRating === "high_10" ? ">10% high" : data.thesisRating === "low_10" ? ">10% low" : "accurate")}</span>` : ""}
                </div>
              `).join("")}
            </div>
          `).join("")}
        </div>
      </div>`;
    }
  }
  const value = b.value || "";
  return `<div class="block text">
    <div class="label">${label}</div>
    <div class="value">${value}</div>
  </div>`;
}

// ---------- Toast ----------
function toast(msg, kind) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.className = "toast" + (kind === "error" ? " error" : "");
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.remove("show"), 2600);
}

window.UI = { fmtDate, fmtDateShort, escapeHtml, renderBlocks, renderBlock, toast };
