const $ = (id) => document.getElementById(id);

let currentJobId = null;
let pollTimer = null;
let nounsCache = [];

function setStatus(text, progress) {
  $("statusText").textContent = text;
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  $("progressBar").style.width = `${pct}%`;
  $("progressPct").textContent = `${pct}%`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function highlight(sentence, noun) {
  const s = escapeHtml(sentence);
  const n = escapeHtml(noun);
  return s.split(n).join(`<mark>${n}</mark>`);
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) msg = j.detail;
    } catch (_) {}
    throw new Error(msg);
  }
  return await res.json();
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function pollStatus() {
  if (!currentJobId) return;
  try {
    const st = await api(`/api/jobs/${currentJobId}/status`);
    setStatus(st.message || st.state, st.progress ?? 0);

    if (st.state === "done") {
      stopPolling();
      await refreshNouns();
    }
    if (st.state === "error") {
      stopPolling();
    }
  } catch (e) {
    setStatus(`发生错误: ${e.message}`, 100);
    stopPolling();
  }
}

async function refreshNouns() {
  if (!currentJobId) return;
  const query = $("query").value.trim();
  const sort = $("sort").value;
  try {
    const nouns = await api(`/api/jobs/${currentJobId}/nouns?query=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`);
    nounsCache = nouns;
    renderNouns();
  } catch (e) {
    console.error("刷新列表失败:", e);
  }
}

function renderNouns() {
  const minLen = parseInt($("minLen").value, 10);
  const filtered = nounsCache.filter((x) => String(x.noun || "").length >= minLen);
  
  const metaEl = $("nounsMeta");
  if (nounsCache.length > 0) {
    metaEl.textContent = `找到 ${nounsCache.length} 个名词，已显示 ${filtered.length} 个`;
  } else {
    metaEl.textContent = "未提取到相关名词";
  }

  const el = $("nouns");
  el.innerHTML = "";
  
  if (filtered.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <i data-lucide="search"></i>
        <p>没有找到匹配的名词</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  for (const item of filtered) {
    const card = document.createElement("div");
    card.className = "noun-card";
    card.innerHTML = `
      <span class="noun-text">${escapeHtml(item.noun)}</span>
      <span class="noun-count">${escapeHtml(item.count)}</span>
    `;
    card.addEventListener("click", () => openDrawer(item.noun, item.count));
    el.appendChild(card);
  }
}

function openDrawer(noun, count) {
  $("drawerTitle").textContent = escapeHtml(noun);
  $("drawerSubtitle").textContent = `累计出现 ${count} 次`;
  $("occList").innerHTML = `
    <div style="text-align:center; padding: 40px; color: var(--muted)">
      <div class="spinner"></div>
      <p style="margin-top:10px">正在加载出现位置...</p>
    </div>
  `;
  $("drawerOverlay").classList.add("active");
  loadOccurrences(noun);
}

function closeDrawer() {
  $("drawerOverlay").classList.remove("active");
}

async function loadOccurrences(noun) {
  if (!currentJobId) return;
  try {
    const occ = await api(`/api/jobs/${currentJobId}/nouns/${encodeURIComponent(noun)}/occurrences`);
    const list = $("occList");
    list.innerHTML = "";
    
    if (!occ.length) {
      list.innerHTML = `<div class="empty-state"><p>没有记录</p></div>`;
      return;
    }
    
    for (const x of occ) {
      const item = document.createElement("div");
      item.className = "occ-item";
      item.innerHTML = `
        <div class="occ-loc">PAGE ${x.page} · LINE ${x.line}</div>
        <div class="occ-sentence">${highlight(x.sentence || "", noun)}</div>
      `;
      list.appendChild(item);
    }
  } catch (e) {
    $("occList").innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
  }
}

async function uploadFile() {
  const fileInput = $("file");
  const f = fileInput.files?.[0];
  if (!f) {
    alert("请先选择一个 .pdf 或 .docx 文件");
    return;
  }

  stopPolling();
  nounsCache = [];
  renderNouns();

  setStatus("准备上传...", 1);
  $("uploadBtn").disabled = true;
  
  try {
    const form = new FormData();
    form.append("file", f);
    const res = await api("/api/upload", { method: "POST", body: form });
    currentJobId = res.job_id;
    
    setStatus("上传成功，正在解析内容...", 5);
    pollTimer = setInterval(pollStatus, 1000);
  } catch (e) {
    setStatus(`上传失败: ${e.message}`, 100);
    $("uploadBtn").disabled = false;
  }
}

function wire() {
  $("uploadBtn").addEventListener("click", uploadFile);
  $("query").addEventListener("input", refreshNouns);
  $("sort").addEventListener("change", refreshNouns);
  $("minLen").addEventListener("change", renderNouns);

  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerOverlay").addEventListener("click", closeDrawer);
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

// Init
wire();
lucide.createIcons();
