// Admin composer logic — only loaded by the secret admin-*.html page.
// Writes go directly to Supabase using the anon key + permissive RLS.
// The only thing protecting writes is the obscurity of this page's URL.

(function () {
  // ---------------- Tabs ----------------
  const panes = document.querySelectorAll("section[data-pane]");
  document.getElementById("admin-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    document.querySelectorAll("#admin-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    panes.forEach(s => {
      const show = s.dataset.pane === tab;
      s.hidden = !show;
      s.style.display = show ? "block" : "none";
    });

    if (tab === "log" && !logsLoaded) loadLogs();
    if (tab === "note" && !notesLoaded) {
      resetNoteForm(); loadNotes();
    }
    if (tab === "strategy" && !stratsLoaded) {
      resetStratForm(); loadStrats();
    }
  });

  // ---------------- DAILY LOG ----------------
  const logDate    = document.getElementById("log-date");
  const logTitle   = document.getElementById("log-title");
  const builder    = document.getElementById("blocks-builder");
  const addBar     = document.querySelector(".add-block-bar");
  const tagInputs  = document.querySelectorAll('input[name="log-tags"]');
  const sectionLists = {
    Setup: builder.querySelector('[data-section-list="Setup"]'),
    "Price review": builder.querySelector('[data-section-list="Price review"]'),
    Thesis: builder.querySelector('[data-section-list="Thesis"]'),
    Other: builder.querySelector('[data-section-list="Other"]'),
  };
  tagInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.closest(".tag-toggle");
      if (label) label.classList.toggle("selected", input.checked);
    });
  });
  let editingLogId = null;
  let logsLoaded = false, notesLoaded = false, stratsLoaded = false;

  // default to today
  logDate.value = new Date().toISOString().slice(0, 10);

  // Don't auto-populate on load - user clicks Reset to get defaults

  const HUBS = ["Amarillo", "Lubbock", "Midland", "Dallas", "Austin", "Houston", "Corpus Christi", "San Antonio"];
  const TIMES_PRICE_REVIEW = ["0400", "0700", "0900"];
  const TIMES_THESIS = ["1200", "1700", "2200", "0200"];

  function inferSection(label) {
    if (!label) return "Other";
    const normalized = label.trim().toLowerCase();
    if (["temperature", "cloud cover", "wind", "fuel mix", "demand"].includes(normalized)) return "Setup";
    if (["system lambda", "congestion pricing"].includes(normalized)) return "Price review";
    if (["predicted price action", "notes", "+1 prediction"].includes(normalized)) return "Thesis";
    return "Other";
  }

  function getTemplateKind(label, section) {
    const normalized = String(label || "").trim().toLowerCase();
    if (normalized === "system lambda" && section === "Price review") return "lambdaPriceReview";
    if (normalized === "system lambda" && section === "Thesis") return "lambdaThesis";
    if (normalized === "congestion pricing" && section === "Price review") return "congestionPriceReview";
    if (normalized === "congestion pricing" && section === "Thesis") return "congestionThesis";
    return null;
  }

  function defaultLambdaData(section) {
    const times = section === "Thesis" ? TIMES_THESIS : TIMES_PRICE_REVIEW;
    return {
      schema: "lambda-v1",
      section,
      timeslots: times.map(time => ({ time, customTime: "", price: "", note: "" })),
    };
  }

  function defaultCongestionData(section) {
    const times = section === "Thesis" ? TIMES_THESIS : TIMES_PRICE_REVIEW;
    const includeRating = section === "Thesis";
    return {
      schema: "congestion-v1",
      section,
      timeslots: times.map(time => ({
        time,
        customTime: "",
        hubs: HUBS.reduce((acc, hub) => {
          acc[hub] = includeRating ? { price: "", note: "", thesisRating: "accurate" } : { price: "", note: "" };
          return acc;
        }, {}),
      })),
    };
  }

  function parseStructuredValue(raw, fallback) {
    if (!raw) return fallback;
    if (typeof raw === "object") return raw;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function appendRow(row, section) {
    const target = sectionLists[section] || sectionLists.Other;
    if (target) target.appendChild(row);
    else builder.appendChild(row);
  }

  function makeBlockRow(b = { type: "text", label: "", value: "", caption: "", section: "Other" }) {
    if (!b || typeof b !== "object") b = { type: "text", label: "", value: "", caption: "", section: "Other" };
    const section = b.section || inferSection(b.label);
    const row = document.createElement("div");
    row.className = "block-row";
    row.dataset.type = b.type;
    row.dataset.section = section;
    row.draggable = true;
    row.innerHTML = `
      <div class="row-top">
        <input type="text" class="b-label" placeholder="Label (e.g. Summary, Weather, Prediction)" value="${UI.escapeHtml(b.label)}" />
        <span class="drag-handle" title="Drag to reorder">⠿</span>
      </div>
      <div class="b-content"></div>
      <div class="row-bottom">
        <select class="b-type">
          <option value="text"  ${b.type==="text"?"selected":""}>Text</option>
          <option value="image" ${b.type==="image"?"selected":""}>Image</option>
          <option value="link"  ${b.type==="link"?"selected":""}>Link</option>
        </select>
        <button type="button" class="remove">Remove</button>
      </div>
    `;
    appendRow(row, section);
    renderBlockContent(row, b);

    // Drag events
    row.addEventListener("dragstart", handleDragStart);
    row.addEventListener("dragover", handleDragOver);
    row.addEventListener("drop", handleDrop);
    row.addEventListener("dragend", handleDragEnd);

    row.querySelector(".remove").addEventListener("click", () => row.remove());
    row.querySelector(".b-type").addEventListener("change", (e) => {
      row.dataset.type = e.target.value;
      renderBlockContent(row, { type: e.target.value, label: row.querySelector(".b-label").value, value: "", caption: "" });
    });
    row.querySelector(".b-label").addEventListener("change", () => {
      renderBlockContent(row, {
        type: row.querySelector(".b-type").value,
        label: row.querySelector(".b-label").value,
        value: row.dataset.structuredJson || "",
      });
    });
  }

  // ---------- Drag & Drop ----------
  let dragSrcEl = null;

  function handleDragStart(e) {
    dragSrcEl = this;
    this.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    return false;
  }

  function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragSrcEl !== this) {
      const allRows = [...builder.querySelectorAll(".block-row")];
      const srcIdx = allRows.indexOf(dragSrcEl);
      const tgtIdx = allRows.indexOf(this);
      if (srcIdx < tgtIdx) {
        this.parentNode.insertBefore(dragSrcEl, this.nextSibling);
      } else {
        this.parentNode.insertBefore(dragSrcEl, this);
      }
    }
    return false;
  }

  function handleDragEnd() {
    this.classList.remove("dragging");
    builder.querySelectorAll(".block-row").forEach(r => r.classList.remove("dragging"));
  }

  function renderBlockContent(row, b) {
    const c = row.querySelector(".b-content");
    const label = row.querySelector(".b-label")?.value || b.label || "";
    const section = row.dataset.section || b.section || inferSection(label);
    const templateKind = getTemplateKind(label, section);
    if (b.type === "text" && templateKind) {
      const structured = templateKind.includes("lambda")
        ? parseStructuredValue(b.value, defaultLambdaData(section))
        : parseStructuredValue(b.value, defaultCongestionData(section));
      row.dataset.structured = "true";
      row.dataset.structuredKind = templateKind;
      row.dataset.structuredJson = JSON.stringify(structured);
      if (templateKind.includes("lambda")) {
        c.innerHTML = `
          <div class="b-hint" style="font-family:var(--mono);font-size:11px;color:var(--ink-dim);margin-bottom:8px">System Lambda · ${section} structured entry</div>
          ${(structured.timeslots || []).map((slot, idx) => `
            <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:8px;margin-bottom:8px">
              <input class="sl-time" data-idx="${idx}" value="${UI.escapeHtml(slot.time === "custom" ? (slot.customTime || "") : (slot.time || ""))}" ${slot.time !== "custom" ? "readonly" : ""} placeholder="${slot.time === "custom" ? "Custom time (e.g. 1530)" : ""}" />
              <input class="sl-price" data-idx="${idx}" placeholder="Price" value="${UI.escapeHtml(slot.price || "")}" />
              <input class="sl-note" data-idx="${idx}" placeholder="Notes" value="${UI.escapeHtml(slot.note || "")}" />
            </div>
          `).join("")}
          <button type="button" class="btn ghost sl-add-custom" style="margin-top:8px">+ Add custom time</button>
        `;
        c.querySelector(".sl-add-custom")?.addEventListener("click", () => {
          structured.timeslots = structured.timeslots || [];
          structured.timeslots.push({ time: "custom", customTime: "", price: "", note: "" });
          row.dataset.structuredJson = JSON.stringify(structured);
          renderBlockContent(row, { ...b, value: row.dataset.structuredJson });
        });
        const sync = () => {
          const next = {
            schema: "lambda-v1",
            section,
            timeslots: (structured.timeslots || []).map((slot, idx) => ({
              time: slot.time,
              customTime: slot.time === "custom" ? (c.querySelector(`.sl-time[data-idx="${idx}"]`)?.value.trim() || "") : "",
              price: c.querySelector(`.sl-price[data-idx="${idx}"]`)?.value.trim() || "",
              note: c.querySelector(`.sl-note[data-idx="${idx}"]`)?.value.trim() || "",
            })),
          };
          row.dataset.structuredJson = JSON.stringify(next);
        };
        c.querySelectorAll("input").forEach(input => input.addEventListener("input", sync));
      } else {
        const includeRating = section === "Thesis";
        c.innerHTML = `
          <div class="b-hint" style="font-family:var(--mono);font-size:11px;color:var(--ink-dim);margin-bottom:8px">Congestion Pricing · ${section} structured entry</div>
          ${(structured.timeslots || []).map((slot, idx) => `
            <div style="font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin:10px 0 6px">${UI.escapeHtml(slot.time === "custom" ? (slot.customTime || "custom") : slot.time)}</div>
            ${slot.time === "custom" ? `<input class="cp-custom" data-idx="${idx}" placeholder="Custom time (e.g. 1530)" value="${UI.escapeHtml(slot.customTime || "")}" style="margin-bottom:8px" />` : ""}
            ${HUBS.map(hub => {
              const rowValue = slot.hubs?.[hub] || {};
              return `
                <div style="display:grid;grid-template-columns:140px 120px 1fr ${includeRating ? "120px" : ""};gap:8px;margin-bottom:6px;align-items:center">
                  <span style="font-family:var(--mono);font-size:11px;color:var(--ink-dim)">${hub}</span>
                  <input class="cp-price" data-idx="${idx}" data-hub="${hub}" placeholder="Price" value="${UI.escapeHtml(rowValue.price || "")}" />
                  <input class="cp-note" data-idx="${idx}" data-hub="${hub}" placeholder="Note" value="${UI.escapeHtml(rowValue.note || "")}" />
                  ${includeRating ? `<select class="cp-rating" data-idx="${idx}" data-hub="${hub}"><option value="accurate" ${(rowValue.thesisRating||"accurate")==="accurate"?"selected":""}>accurate</option><option value="high_10" ${rowValue.thesisRating==="high_10"?"selected":""}>&gt;10% high</option><option value="low_10" ${rowValue.thesisRating==="low_10"?"selected":""}>&gt;10% low</option></select>` : ""}
                </div>
              `;
            }).join("")}
          `).join("")}
          <button type="button" class="btn ghost cp-add-custom" style="margin-top:8px">+ Add custom time</button>
        `;
        c.querySelector(".cp-add-custom")?.addEventListener("click", () => {
          structured.timeslots = structured.timeslots || [];
          structured.timeslots.push({
            time: "custom",
            customTime: "",
            hubs: HUBS.reduce((acc, hub) => {
              acc[hub] = includeRating ? { price: "", note: "", thesisRating: "accurate" } : { price: "", note: "" };
              return acc;
            }, {}),
          });
          row.dataset.structuredJson = JSON.stringify(structured);
          renderBlockContent(row, { ...b, value: row.dataset.structuredJson });
        });
        const sync = () => {
          const next = {
            schema: "congestion-v1",
            section,
            timeslots: (structured.timeslots || []).map((slot, idx) => ({
              time: slot.time,
              customTime: c.querySelector(`.cp-custom[data-idx="${idx}"]`)?.value.trim() || "",
              hubs: HUBS.reduce((acc, hub) => {
                const price = c.querySelector(`.cp-price[data-idx="${idx}"][data-hub="${hub}"]`)?.value.trim() || "";
                const note = c.querySelector(`.cp-note[data-idx="${idx}"][data-hub="${hub}"]`)?.value.trim() || "";
                if (includeRating) {
                  const thesisRating = c.querySelector(`.cp-rating[data-idx="${idx}"][data-hub="${hub}"]`)?.value || "accurate";
                  acc[hub] = { price, note, thesisRating };
                } else {
                  acc[hub] = { price, note };
                }
                return acc;
              }, {}),
            })),
          };
          row.dataset.structuredJson = JSON.stringify(next);
        };
        c.querySelectorAll("input,select").forEach(input => input.addEventListener("input", sync));
      }
      return;
    }

    row.dataset.structured = "";
    row.dataset.structuredKind = "";
    row.dataset.structuredJson = "";
    if (b.type === "text") {
      // Don't escape HTML — text blocks contain rich text from contenteditable
      const placeholder = UI.escapeHtml(b.placeholder || "Write…");
      c.innerHTML = `
        <div class="b-value" contenteditable="true" data-placeholder="${placeholder}" style="min-height:100px;background:var(--bg);color:var(--ink);border:1px solid var(--line);padding:12px;font-family:var(--serif);font-size:16px;line-height:1.6;outline:none">${b.value || ""}</div>
        <div class="b-hint" style="font-family:var(--mono);font-size:10px;color:var(--ink-faint);margin-top:4px">Cmd+B bold · Cmd+I italic · Cmd+U underline</div>
      `;
      const ed = c.querySelector(".b-value");
      // Handle paste for images
      ed.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            const status = document.createElement("span");
            status.style.cssText = "font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin-left:8px";
            status.textContent = "uploading…";
            ed.after(status);
            const ext = (file.name.split(".").pop() || "png").toLowerCase();
            const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
            const { error } = await sb.storage.from("log-images").upload(path, file, { contentType: file.type, upsert: false });
            if (error) { status.textContent = "upload failed"; UI.toast("Image upload failed", "error"); return; }
            const { data } = sb.storage.from("log-images").getPublicUrl(path);
            const img = document.createElement("img");
            img.src = data.publicUrl;
            img.style.maxWidth = "100%";
            img.style.display = "block";
            img.style.margin = "8px 0";
            const sel = window.getSelection();
            if (sel.rangeCount) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              range.insertNode(img);
              range.collapse(false);
            } else {
              ed.appendChild(img);
            }
            status.textContent = "uploaded ✓";
            setTimeout(() => status.remove(), 2000);
            return;
          }
        }
      });
      ed.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && "biu".includes(e.key.toLowerCase())) {
          e.preventDefault();
          document.execCommand(e.key.toLowerCase() === "b" ? "bold" : e.key.toLowerCase() === "i" ? "italic" : "underline", false, null);
        }
      });
    } else if (b.type === "link") {
      c.innerHTML = `<input type="url" class="b-value" placeholder="https://…" value="${UI.escapeHtml(b.value || "")}" />`;
    } else if (b.type === "image") {
      c.innerHTML = `
        <input type="url" class="b-value" placeholder="Image URL — or upload below" value="${UI.escapeHtml(b.value || "")}" />
        <input type="text" class="b-caption" placeholder="Caption (optional)" value="${UI.escapeHtml(b.caption || "")}" style="margin-top:8px;width:100%;background:var(--bg);color:var(--ink);border:1px solid var(--line);padding:8px 10px;font-family:var(--serif);font-size:14px" />
        <div style="margin-top:8px;display:flex;gap:10px;align-items:center">
          <input type="file" class="b-file" accept="image/*" />
          <span class="b-status" style="font-family:var(--mono);font-size:11px;color:var(--ink-faint)"></span>
        </div>
        ${b.value ? `<img src="${UI.escapeHtml(b.value)}" style="margin-top:10px;max-width:240px;border:1px solid var(--line);border-radius:4px" />` : ""}
      `;
      const fileInput = c.querySelector(".b-file");
      const status    = c.querySelector(".b-status");
      const urlInput  = c.querySelector(".b-value");
      fileInput.addEventListener("change", async () => {
        const f = fileInput.files[0]; if (!f) return;
        status.textContent = "uploading…";
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await sb.storage.from("log-images").upload(path, f, { contentType: f.type, upsert: false });
        if (error) { status.textContent = "failed: " + error.message; UI.toast("Upload failed", "error"); return; }
        const { data } = sb.storage.from("log-images").getPublicUrl(path);
        urlInput.value = data.publicUrl;
        status.textContent = "uploaded ✓";
        UI.toast("Image uploaded");
      });
    }
  }

  function readBlocks() {
    return [...builder.querySelectorAll(".block-row")].map(row => ({
      type:  row.querySelector(".b-type").value,
      label: row.querySelector(".b-label").value.trim(),
      section: row.dataset.section || inferSection(row.querySelector(".b-label").value.trim()),
      value: row.dataset.type === "text"
        ? (row.dataset.structuredJson || row.querySelector(".b-value")?.innerHTML?.trim() || "")
        : row.querySelector(".b-value").value.trim(),
      caption: row.querySelector(".b-caption")?.value.trim() || "",
    })).filter(b => b.value && b.value !== "<br>");
  }

  function readTags() {
    return [...tagInputs].filter(input => input.checked).map(input => input.value);
  }

  function setTags(tags = []) {
    [...tagInputs].forEach(input => {
      input.checked = tags.includes(input.value);
      const label = input.closest(".tag-toggle");
      if (label) label.classList.toggle("selected", input.checked);
    });
  }

  function isMissingTagsColumnError(error) {
    const msg = String(error?.message || "");
    return /column .*tags .*does not exist/i.test(msg) ||
      /could not find .*tags.*column.*daily_logs.*schema cache/i.test(msg);
  }

  function resetLogForm() {
    editingLogId = null;
    document.getElementById("log-form-title").textContent = "New daily log";
    logDate.value = new Date().toISOString().slice(0, 10);
    logTitle.value = "";
    Object.values(sectionLists).forEach(list => { if (list) list.innerHTML = ""; });
    setTags([]);
    makeBlockRow({ type: "text", label: "Temperature", section: "Setup", placeholder: "Temperature notes" });
    makeBlockRow({ type: "text", label: "Cloud Cover", section: "Setup", placeholder: "Cloud cover notes" });
    makeBlockRow({ type: "text", label: "Wind", section: "Setup", placeholder: "Wind notes" });
    makeBlockRow({ type: "text", label: "Fuel Mix", section: "Setup", placeholder: "Fuel mix notes" });
    makeBlockRow({ type: "text", label: "Demand", section: "Setup", placeholder: "Demand notes" });
    makeBlockRow({ type: "text", label: "System Lambda", section: "Price review", value: JSON.stringify(defaultLambdaData("Price review")) });
    makeBlockRow({ type: "text", label: "Congestion Pricing", section: "Price review", value: JSON.stringify(defaultCongestionData("Price review")) });
    makeBlockRow({ type: "text", label: "System Lambda", section: "Thesis", value: JSON.stringify(defaultLambdaData("Thesis")) });
    makeBlockRow({ type: "text", label: "Congestion Pricing", section: "Thesis", value: JSON.stringify(defaultCongestionData("Thesis")) });
    makeBlockRow({ type: "text", label: "Predicted Price Action", section: "Thesis", placeholder: "Predicted price action notes" });
    makeBlockRow({ type: "text", label: "Notes", section: "Thesis", placeholder: "Thesis notes" });
    makeBlockRow({ type: "text", label: "+1 Prediction", section: "Thesis", placeholder: "+1 prediction" });
  }

  addBar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-add]"); if (!b) return;
    makeBlockRow({ type: b.dataset.add, label: "", value: "" });
  });

  document.getElementById("log-reset").addEventListener("click", resetLogForm);

  document.getElementById("log-save").addEventListener("click", async () => {
    const title = logTitle.value.trim();
    if (!title) return UI.toast("Title required", "error");
    const payload = { entry_date: logDate.value, title, blocks: readBlocks() };
    const tags = readTags();
    if (tags.length) payload.tags = tags;

    let res;
    const insertOrUpdate = async () => {
      if (editingLogId) return await sb.from("daily_logs").update(payload).eq("id", editingLogId);
      return await sb.from("daily_logs").insert(payload);
    };

    res = await insertOrUpdate();
    if (res.error && isMissingTagsColumnError(res.error)) {
      delete payload.tags;
      res = await insertOrUpdate();
    }
    if (res.error) return UI.toast(res.error.message, "error");
    UI.toast(editingLogId ? "Log updated" : "Log saved");
    resetLogForm();
    loadLogs();
  });

  async function loadLogs() {
    const el = document.getElementById("logs-list");
    let query = sb.from("daily_logs").select("id,entry_date,title,tags").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    let { data, error } = await query;
    if (error && isMissingTagsColumnError(error)) {
      ({ data, error } = await sb.from("daily_logs").select("id,entry_date,title").order("entry_date", { ascending: false }).order("created_at", { ascending: false }));
    }
    if (error) return el.innerHTML = `<div class="empty">${UI.escapeHtml(error.message)}</div>`;
    if (!data.length) return el.innerHTML = `<div class="empty">No logs yet.</div>`;
    el.innerHTML = data.map(l => {
      const tagHtml = Array.isArray(l.tags) && l.tags.length ? `<div class="tag-list">${l.tags.map(t => `<span class="tag-pill">${UI.escapeHtml(t)}</span>`).join("")}</div>` : "";
      return `
      <div class="admin-row" data-id="${l.id}">
        <div class="meta"><strong>${UI.escapeHtml(l.title)}</strong><br/>${UI.fmtDateShort(l.entry_date)}${tagHtml}</div>
        <div class="actions">
          <button class="edit">Edit</button>
          <button class="del">Delete</button>
        </div>
      </div>
    `;
    }).join("");
    el.querySelectorAll(".del").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".admin-row").dataset.id;
      if (!confirm("Delete this log?")) return;
      const { error } = await sb.from("daily_logs").delete().eq("id", id);
      if (error) return UI.toast(error.message, "error");
      UI.toast("Deleted"); loadLogs();
    }));
    el.querySelectorAll(".edit").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".admin-row").dataset.id;
      const { data, error } = await sb.from("daily_logs").select("*").eq("id", id).single();
      if (error) return UI.toast(error.message, "error");
      editingLogId = data.id;
      document.getElementById("log-form-title").textContent = "Editing log";
      logDate.value = data.entry_date;
      logTitle.value = data.title;
      setTags(data.tags || []);
      Object.values(sectionLists).forEach(list => { if (list) list.innerHTML = ""; });
      const incomingBlocks = Array.isArray(data.blocks) ? data.blocks : [];
      const hydratedBlocks = incomingBlocks
        .filter(b => b && typeof b === "object")
        .map(b => ({ ...b, type: b.type || "text" }));
      if (hydratedBlocks.length) hydratedBlocks.forEach(makeBlockRow);
      else makeBlockRow({ type: "text", label: "", value: "", section: "Other" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    logsLoaded = true;
  }

  // ---------------- NOTES ----------------
  let editingNoteId = null;
  const noteTitle = document.getElementById("note-title");
  const noteBody  = document.getElementById("note-body");

  // Cmd+B/I/U for notes
  noteBody.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && "biu".includes(e.key.toLowerCase())) {
      e.preventDefault();
      document.execCommand(e.key.toLowerCase() === "b" ? "bold" : e.key.toLowerCase() === "i" ? "italic" : "underline", false, null);
    }
  });

  // Handle paste for images in notes
  noteBody.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const status = document.createElement("span");
        status.style.cssText = "font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin-left:8px";
        status.textContent = "uploading…";
        noteBody.after(status);
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await sb.storage.from("log-images").upload(path, file, { contentType: file.type, upsert: false });
        if (error) { status.textContent = "upload failed"; UI.toast("Image upload failed", "error"); return; }
        const { data } = sb.storage.from("log-images").getPublicUrl(path);
        const img = document.createElement("img");
        img.src = data.publicUrl;
        img.style.maxWidth = "100%";
        img.style.display = "block";
        img.style.margin = "8px 0";
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.collapse(false);
        } else {
          noteBody.appendChild(img);
        }
        status.textContent = "uploaded ✓";
        setTimeout(() => status.remove(), 2000);
        return;
      }
    }
  });

  function resetNoteForm() {
    editingNoteId = null;
    document.getElementById("note-form-title").textContent = "New note";
    noteTitle.value = ""; noteBody.innerHTML = "";
  }
  document.getElementById("note-reset").addEventListener("click", resetNoteForm);
  document.getElementById("note-save").addEventListener("click", async () => {
    const title = noteTitle.value.trim(); const body = noteBody.innerHTML.trim();
    if (!title || !body || body === "<br>") return UI.toast("Title and body required", "error");
    const payload = { title, body };
    let res;
    if (editingNoteId) res = await sb.from("notes").update(payload).eq("id", editingNoteId);
    else               res = await sb.from("notes").insert(payload);
    if (res.error) return UI.toast(res.error.message, "error");
    UI.toast(editingNoteId ? "Note updated" : "Note saved");
    resetNoteForm(); loadNotes();
  });
  async function loadNotes() {
    const { data, error } = await sb.from("notes").select("id,title,created_at").order("created_at", { ascending: false });
    const el = document.getElementById("notes-list");
    if (error) return el.innerHTML = `<div class="empty">${UI.escapeHtml(error.message)}</div>`;
    if (!data.length) return el.innerHTML = `<div class="empty">No notes yet.</div>`;
    el.innerHTML = data.map(n => `
      <div class="admin-row" data-id="${n.id}">
        <div class="meta"><strong>${UI.escapeHtml(n.title)}</strong><br/>${UI.fmtDateShort(n.created_at)}</div>
        <div class="actions"><button class="edit">Edit</button><button class="del">Delete</button></div>
      </div>
    `).join("");
    el.querySelectorAll(".del").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".admin-row").dataset.id;
      if (!confirm("Delete this note?")) return;
      const { error } = await sb.from("notes").delete().eq("id", id);
      if (error) return UI.toast(error.message, "error");
      UI.toast("Deleted"); loadNotes();
    }));
    el.querySelectorAll(".edit").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".admin-row").dataset.id;
      const { data, error } = await sb.from("notes").select("*").eq("id", id).single();
      if (error) return UI.toast(error.message, "error");
      editingNoteId = data.id;
      document.getElementById("note-form-title").textContent = "Editing note";
      noteTitle.value = data.title; noteBody.innerHTML = data.body;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    notesLoaded = true;
  }

  // ---------------- STRATEGIES ----------------
  let editingStratId = null;
  const stratKind  = document.getElementById("strat-kind");
  const stratTitle = document.getElementById("strat-title");
  const stratBody  = document.getElementById("strat-body");
  const stratStart = document.getElementById("strat-start");
  const stratEnd   = document.getElementById("strat-end");

  // Cmd+B/I/U for strategies
  stratBody.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && "biu".includes(e.key.toLowerCase())) {
      e.preventDefault();
      document.execCommand(e.key.toLowerCase() === "b" ? "bold" : e.key.toLowerCase() === "i" ? "italic" : "underline", false, null);
    }
  });

  // Handle paste for images in strategies
  stratBody.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const status = document.createElement("span");
        status.style.cssText = "font-family:var(--mono);font-size:11px;color:var(--ink-faint);margin-left:8px";
        status.textContent = "uploading…";
        stratBody.after(status);
        const ext = (file.name.split(".").pop() || "png").toLowerCase();
        const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error } = await sb.storage.from("log-images").upload(path, file, { contentType: file.type, upsert: false });
        if (error) { status.textContent = "upload failed"; UI.toast("Image upload failed", "error"); return; }
        const { data } = sb.storage.from("log-images").getPublicUrl(path);
        const img = document.createElement("img");
        img.src = data.publicUrl;
        img.style.maxWidth = "100%";
        img.style.display = "block";
        img.style.margin = "8px 0";
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.collapse(false);
        } else {
          stratBody.appendChild(img);
        }
        status.textContent = "uploaded ✓";
        setTimeout(() => status.remove(), 2000);
        return;
      }
    }
  });

  function resetStratForm() {
    editingStratId = null;
    document.getElementById("strat-form-title").textContent = "New strategy or snapshot";
    stratKind.value = "strategy";
    stratTitle.value = ""; stratBody.innerHTML = "";
    stratStart.value = ""; stratEnd.value = "";
  }
  document.getElementById("strat-reset").addEventListener("click", resetStratForm);

  document.getElementById("strat-save").addEventListener("click", async () => {
    const title = stratTitle.value.trim(); const body = stratBody.innerHTML.trim();
    if (!title || !body || body === "<br>") return UI.toast("Title and body required", "error");
    const payload = {
      kind: stratKind.value, title, body,
      period_start: stratStart.value || null,
      period_end:   stratEnd.value   || null,
    };
    let res;
    if (editingStratId) res = await sb.from("strategies").update(payload).eq("id", editingStratId);
    else                res = await sb.from("strategies").insert(payload);
    if (res.error) return UI.toast(res.error.message, "error");
    UI.toast(editingStratId ? "Updated" : "Saved");
    resetStratForm(); loadStrats();
  });

  document.getElementById("strat-seed").addEventListener("click", async () => {
    if (!stratStart.value || !stratEnd.value) return UI.toast("Set period dates first", "error");
    const { data, error } = await sb.from("daily_logs").select("*")
      .gte("entry_date", stratStart.value).lte("entry_date", stratEnd.value)
      .order("entry_date", { ascending: true });
    if (error) return UI.toast(error.message, "error");
    if (!data.length) return UI.toast("No logs in that period", "error");
    const seed = data.map(l => {
      const blocks = (l.blocks || []).map(b => `  - [${b.label || b.type}] ${b.type === "image" ? "(image)" : b.value}`).join("\n");
      return `### ${UI.fmtDateShort(l.entry_date)} — ${l.title}\n${blocks}`;
    }).join("\n\n");
    const existing = stratBody.innerHTML.trim();
    stratBody.innerHTML = existing ? existing + "<br><br>" + seed : seed;
    UI.toast(`Seeded ${data.length} log${data.length===1?"":"s"}`);
  });

  async function loadStrats() {
    const { data, error } = await sb.from("strategies").select("id,kind,title,period_start,period_end,created_at").order("created_at", { ascending: false });
    const el = document.getElementById("strat-list");
    if (error) return el.innerHTML = `<div class="empty">${UI.escapeHtml(error.message)}</div>`;
    if (!data.length) return el.innerHTML = `<div class="empty">No entries yet.</div>`;
    el.innerHTML = data.map(s => {
      const sub = s.period_start ? `${UI.fmtDateShort(s.period_start)} – ${UI.fmtDateShort(s.period_end)}` : UI.fmtDateShort(s.created_at);
      return `
        <div class="admin-row" data-id="${s.id}">
          <div class="meta"><strong>${UI.escapeHtml(s.title)}</strong><br/>${UI.escapeHtml(s.kind)} &middot; ${sub}</div>
          <div class="actions"><button class="edit">Edit</button><button class="del">Delete</button></div>
        </div>`;
    }).join("");
    el.querySelectorAll(".del").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".admin-row").dataset.id;
      if (!confirm("Delete this entry?")) return;
      const { error } = await sb.from("strategies").delete().eq("id", id);
      if (error) return UI.toast(error.message, "error");
      UI.toast("Deleted"); loadStrats();
    }));
    el.querySelectorAll(".edit").forEach(b => b.addEventListener("click", async (e) => {
      const id = e.target.closest(".admin-row").dataset.id;
      const { data, error } = await sb.from("strategies").select("*").eq("id", id).single();
      if (error) return UI.toast(error.message, "error");
      editingStratId = data.id;
      document.getElementById("strat-form-title").textContent = "Editing entry";
      stratKind.value = data.kind; stratTitle.value = data.title; stratBody.innerHTML = data.body;
      stratStart.value = data.period_start || ""; stratEnd.value = data.period_end || "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    stratsLoaded = true;
  }

  // ---------------- INIT ----------------
  resetLogForm();
  loadLogs();
})();
