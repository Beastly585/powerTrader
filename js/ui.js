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
  return `<div class="blocks">${blocks.map(renderBlock).join("")}</div>`;
}
function renderBlock(b) {
  const label = escapeHtml(b.label || "");
  if (b.type === "image") {
    const url = escapeHtml(b.value || "");
    if (!url) return "";
    const caption = b.caption ? `<div class="caption">${escapeHtml(b.caption)}</div>` : "";
    return `<div class="block image">
      <div class="label">${label}</div>
      <div class="value"><img src="${url}" alt="${label}" loading="lazy" />${caption}</div>
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
