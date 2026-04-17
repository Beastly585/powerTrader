// Shared UI helpers: nav highlight, header, footer, banner, image upload, formatting.
import { supabase, isAdmin, IMAGE_BUCKET, ADMIN_EMAIL } from "./supabase.js";

export function mountChrome(activePage) {
  const header = document.createElement("header");
  header.className = "site";
  header.innerHTML = `
    <a class="brand" href="index.html">SIGNAL<span class="dot">.</span>LOG<span class="cursor"></span></a>
    <nav class="site">
      <a href="index.html"      data-p="logs">Logs</a>
      <a href="notes.html"      data-p="notes">Notes</a>
      <a href="strategies.html" data-p="strategies">Strategies</a>
    </nav>`;
  document.body.prepend(header);
  header.querySelectorAll("nav.site a").forEach(a => {
    if (a.dataset.p === activePage) a.classList.add("active");
  });

  const footer = document.createElement("footer");
  footer.className = "site";
  footer.innerHTML = `
    <span>// signal.log — market research journal</span>
    <span id="auth-slot"><a href="login.html">Admin login</a></span>`;
  document.body.appendChild(footer);

  refreshAuthSlot();
  supabase.auth.onAuthStateChange(() => refreshAuthSlot());
}

async function refreshAuthSlot() {
  const slot = document.getElementById("auth-slot");
  if (!slot) return;
  const admin = await isAdmin();
  if (admin) {
    slot.innerHTML = `<span>${ADMIN_EMAIL}</span> · <a href="#" id="logout-link">Sign out</a>`;
    document.getElementById("logout-link")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      location.reload();
    });
  } else {
    slot.innerHTML = `<a href="login.html">Admin login</a>`;
  }
}

export function banner(parent, text, kind="ok") {
  const div = document.createElement("div");
  div.className = `notice ${kind}`;
  div.textContent = text;
  parent.prepend(div);
  setTimeout(() => div.remove(), 4500);
}

export function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
}
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

export function escapeHtml(s) {
  return (s ?? "").toString()
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// Upload one file to storage, return public URL.
export async function uploadImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false, contentType: file.type || undefined
  });
  if (error) throw error;
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Wires a file input + preview row. Mutates `urls` array (in/out).
export function bindImagePicker(fileInput, thumbRow, urls, onChange) {
  function render() {
    thumbRow.innerHTML = "";
    urls.forEach((u, i) => {
      const t = document.createElement("div");
      t.className = "thumb";
      t.innerHTML = `<img src="${escapeHtml(u)}" alt=""><button type="button" title="Remove">×</button>`;
      t.querySelector("button").addEventListener("click", () => {
        urls.splice(i,1); render(); onChange?.();
      });
      thumbRow.appendChild(t);
    });
  }
  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      try {
        const url = await uploadImage(f);
        urls.push(url);
        render(); onChange?.();
      } catch (err) {
        alert("Upload failed: " + err.message);
      }
    }
    fileInput.value = "";
  });
  render();
}
