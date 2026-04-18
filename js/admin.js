// Admin composer logic — only loaded by the secret admin-*.html page.
// Writes go directly to Supabase using the anon key + permissive RLS.
// The only thing protecting writes is the obscurity of this page's URL.

(function () {
  // ---------------- Tabs ----------------
  document.getElementById("admin-tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button"); if (!btn) return;
    document.querySelectorAll("#admin-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll("section[data-pane]").forEach(s => {
      s.hidden = s.dataset.pane !== tab;
    });
  });

  // ---------------- DAILY LOG ----------------
  const logDate    = document.getElementById("log-date");
  const logTitle   = document.getElementById("log-title");
  const builder    = document.getElementById("blocks-builder");
  const addBar     = document.querySelector(".add-block-bar");
  let editingLogId = null;

  // default to today
  logDate.value = new Date().toISOString().slice(0, 10);

  function makeBlockRow(b = { type: "text", label: "", value: "" }) {
    const row = document.createElement("div");
    row.className = "block-row";
    row.dataset.type = b.type;
    row.innerHTML = `
      <div class="row-top">
        <select class="b-type">
          <option value="text"  ${b.type==="text"?"selected":""}>Text</option>
          <option value="image" ${b.type==="image"?"selected":""}>Image</option>
          <option value="link"  ${b.type==="link"?"selected":""}>Link</option>
        </select>
        <input type="text" class="b-label" placeholder="Label (e.g. BTC price, source, screenshot)" value="${UI.escapeHtml(b.label)}" />
        <button type="button" class="remove">Remove</button>
      </div>
      <div class="b-content"></div>
    `;
    builder.appendChild(row);
    renderBlockContent(row, b);

    row.querySelector(".remove").addEventListener("click", () => row.remove());
    row.querySelector(".b-type").addEventListener("change", (e) => {
      row.dataset.type = e.target.value;
      renderBlockContent(row, { type: e.target.value, label: row.querySelector(".b-label").value, value: "" });
    });
  }

  function renderBlockContent(row, b) {
    const c = row.querySelector(".b-content");
    if (b.type === "text") {
      c.innerHTML = `<textarea class="b-value" rows="4" placeholder="Write…">${UI.escapeHtml(b.value || "")}</textarea>`;
    } else if (b.type === "link") {
      c.innerHTML = `<input type="url" class="b-value" placeholder="https://…" value="${UI.escapeHtml(b.value || "")}" />`;
    } else if (b.type === "image") {
      c.innerHTML = `
        <input type="url" class="b-value" placeholder="Image URL — or upload below" value="${UI.escapeHtml(b.value || "")}" />
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
      value: row.querySelector(".b-value").value.trim(),
    })).filter(b => b.value);
  }

  function resetLogForm() {
    editingLogId = null;
    document.getElementById("log-form-title").textContent = "New daily log";
    logDate.value = new Date().toISOString().slice(0, 10);
    logTitle.value = "";
    builder.innerHTML = "";
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
    let res;
    if (editingLogId) res = await sb.from("daily_logs").update(payload).eq("id", editingLogId);
    else              res = await sb.from("daily_logs").insert(payload);
    if (res.error) return UI.toast(res.error.message, "error");
    UI.toast(editingLogId ? "Log updated" : "Log saved");
    resetLogForm();
    loadLogs();
  });

  async function loadLogs() {
    const { data, error } = await sb.from("daily_logs").select("id,entry_date,title").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    const el = document.getElementById("logs-list");
    if (error) return el.innerHTML = `<div class="empty">${UI.escapeHtml(error.message)}</div>`;
    if (!data.length) return el.innerHTML = `<div class="empty">No logs yet.</div>`;
    el.innerHTML = data.map(l => `
      <div class="admin-row" data-id="${l.id}">
        <div class="meta"><strong>${UI.escapeHtml(l.title)}</strong><br/>${UI.fmtDateShort(l.entry_date)}</div>
        <div class="actions">
          <button class="edit">Edit</button>
          <button class="del">Delete</button>
        </div>
      </div>
    `).join("");
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
      builder.innerHTML = "";
      (data.blocks || []).forEach(makeBlockRow);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  // ---------------- NOTES ----------------
  let editingNoteId = null;
  const noteTitle = document.getElementById("note-title");
  const noteBody  = document.getElementById("note-body");

  function resetNoteForm() {
    editingNoteId = null;
    document.getElementById("note-form-title").textContent = "New note";
    noteTitle.value = ""; noteBody.value = "";
  }
  document.getElementById("note-reset").addEventListener("click", resetNoteForm);
  document.getElementById("note-save").addEventListener("click", async () => {
    const title = noteTitle.value.trim(); const body = noteBody.value.trim();
    if (!title || !body) return UI.toast("Title and body required", "error");
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
      noteTitle.value = data.title; noteBody.value = data.body;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  // ---------------- STRATEGIES ----------------
  let editingStratId = null;
  const stratKind  = document.getElementById("strat-kind");
  const stratTitle = document.getElementById("strat-title");
  const stratBody  = document.getElementById("strat-body");
  const stratStart = document.getElementById("strat-start");
  const stratEnd   = document.getElementById("strat-end");

  function resetStratForm() {
    editingStratId = null;
    document.getElementById("strat-form-title").textContent = "New strategy or snapshot";
    stratKind.value = "strategy";
    stratTitle.value = ""; stratBody.value = "";
    stratStart.value = ""; stratEnd.value = "";
  }
  document.getElementById("strat-reset").addEventListener("click", resetStratForm);

  document.getElementById("strat-save").addEventListener("click", async () => {
    const title = stratTitle.value.trim(); const body = stratBody.value.trim();
    if (!title || !body) return UI.toast("Title and body required", "error");
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
    stratBody.value = (stratBody.value ? stratBody.value + "\n\n" : "") + seed;
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
      stratKind.value = data.kind; stratTitle.value = data.title; stratBody.value = data.body;
      stratStart.value = data.period_start || ""; stratEnd.value = data.period_end || "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  // ---------------- INIT ----------------
  makeBlockRow({ type: "text", label: "Summary", value: "" });
  loadLogs(); loadNotes(); loadStrats();
})();
