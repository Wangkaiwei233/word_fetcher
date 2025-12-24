const $ = (id) => document.getElementById(id);

let currentJobId = null;
let pollTimer = null;
let nounsCache = [];
let uploadingDict = false;
let drawerState = { noun: "", count: 0, inDict: false };
let marksCache = [];

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
      <div style="display:flex; flex-direction:column; gap:6px;">
        <span class="noun-text">${escapeHtml(item.noun)}</span>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${item.in_dict ? '<span class="badge success"><i data-lucide="check"></i> 词典</span>' : ""}
          ${item.maybe_wrong ? '<span class="badge danger"><i data-lucide="alert-triangle"></i> 可能有误</span>' : ""}
        </div>
      </div>
      <span class="noun-count">${escapeHtml(item.count)}</span>
    `;
    card.addEventListener("click", () => openDrawer(item.noun, item.count, item.in_dict, item.maybe_wrong));
    el.appendChild(card);
  }
  lucide.createIcons();
}

function openDrawer(noun, count, inDict, maybeWrong) {
  drawerState = { noun, count, inDict: !!inDict, maybeWrong: !!maybeWrong };
  $("drawerTitle").textContent = escapeHtml(noun);
  $("drawerSubtitle").textContent = `累计出现 ${count} 次`;
  updateDrawerDictStatus();
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
      const actions = document.createElement("div");
      actions.className = "occ-actions";
      const markBtn = document.createElement("button");
      markBtn.className = "btn";
      markBtn.textContent = isMarked(noun, x) ? "取消标记" : "标记";
      markBtn.addEventListener("click", () => markSentence(noun, x));
      actions.appendChild(markBtn);
      item.appendChild(actions);
      list.appendChild(item);
    }
  } catch (e) {
    $("occList").innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
  }
}

function updateDrawerDictStatus() {
  const status = $("drawerDictStatus");
  const addBtn = $("drawerAddDict");
  if (drawerState.inDict) {
    status.textContent = "词典状态：已收录";
    status.classList.add("success");
    status.classList.remove("danger");
    addBtn.style.display = "none";
  } else {
    status.textContent = drawerState.maybeWrong ? "词典状态：未收录（可能有误）" : "词典状态：未收录";
    status.classList.remove("success");
    if (drawerState.maybeWrong) {
      status.classList.add("danger");
    } else {
      status.classList.remove("danger");
    }
    addBtn.style.display = "inline-flex";
  }
}

async function addCurrentNounToDict() {
  const noun = drawerState.noun;
  if (!noun) return;
  try {
    const res = await api(`/api/dict/add?word=${encodeURIComponent(noun)}`, { method: "POST" });
    if (res?.added) {
      drawerState.inDict = true;
      updateDrawerDictStatus();
      // update cache marks
      nounsCache = nounsCache.map((x) => (x.noun === noun ? { ...x, in_dict: true } : x));
      renderNouns();
      alert("已添加到词典");
    } else {
      alert("词已存在词典");
    }
  } catch (e) {
    alert(`添加失败：${e.message}`);
  }
}

async function markSentence(noun, occ) {
  if (!currentJobId) return;
  try {
    await api(
      `/api/jobs/${currentJobId}/marks/toggle?noun=${encodeURIComponent(noun)}&page=${occ.page}&line=${occ.line}&sentence=${encodeURIComponent(occ.sentence || "")}`,
      { method: "POST" }
    );
    await refreshMarks();
    renderOccurrencesWithMarks(noun); // update buttons label
  } catch (e) {
    alert(`标记失败：${e.message}`);
  }
}

function isMarked(noun, occ) {
  const key = `${occ.page}:${occ.line}:${noun}:${occ.sentence || ""}`;
  return marksCache.some((m) => m.id === key);
}

function renderOccurrencesWithMarks(currentNoun) {
  // re-render the current occList buttons to reflect mark state
  const buttons = Array.from(document.querySelectorAll(".occ-item"));
  if (!buttons.length) return;
  marksCache = marksCache || [];
  const occDivs = buttons;
  occDivs.forEach((div) => {
    const locText = div.querySelector(".occ-loc")?.textContent || "";
    const match = /PAGE\\s+(\\d+)\\s+·\\s+LINE\\s+(\\d+)/.exec(locText);
    const sentenceEl = div.querySelector(".occ-sentence");
    const sentence = sentenceEl ? sentenceEl.textContent || "" : "";
    if (!match) return;
    const page = parseInt(match[1], 10);
    const line = parseInt(match[2], 10);
    const marked = isMarked(currentNoun, { page, line, sentence });
    const btn = div.querySelector(".occ-actions .btn");
    if (btn) {
      btn.textContent = marked ? "取消标记" : "标记";
    }
  });
}

async function refreshMarks() {
  if (!currentJobId) return;
  try {
    marksCache = await api(`/api/jobs/${currentJobId}/marks`);
    renderMarks();
    // also update current occurrence buttons state
    if (drawerState?.noun) {
      renderOccurrencesWithMarks(drawerState.noun);
    }
  } catch (e) {
    console.error("获取已标记失败", e);
  }
}

function renderMarks() {
  const grid = $("marksGrid");
  const empty = $("marksEmpty");
  grid.innerHTML = "";
  if (!marksCache || marksCache.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";
  for (const m of marksCache) {
    const card = document.createElement("div");
    card.className = "mark-card";
    card.innerHTML = `
      <div class="mark-meta">PAGE ${m.page} · LINE ${m.line} · ${escapeHtml(m.noun)}</div>
      <div class="occ-sentence">${escapeHtml(m.sentence || "")}</div>
    `;
    grid.appendChild(card);
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

async function downloadDict() {
  try {
    window.open("/api/dict", "_blank");
  } catch (e) {
    alert(`下载失败：${e.message}`);
  }
}

async function uploadDict() {
  if (uploadingDict) return;
  const file = $("dictFile").files?.[0];
  if (!file) {
    alert("请先选择一个 .txt 词典文件");
    return;
  }
  uploadingDict = true;
  $("dictUpload").disabled = true;
  $("dictUpload").textContent = "上传中...";
  try {
    const form = new FormData();
    form.append("file", file);
    await api("/api/dict", { method: "POST", body: form });
    alert("词典已更新，将应用于后续解析任务");
  } catch (e) {
    alert(`上传失败：${e.message}`);
  } finally {
    uploadingDict = false;
    $("dictUpload").disabled = false;
    $("dictUpload").textContent = "上传词典";
  }
}

function wire() {
  $("uploadBtn").addEventListener("click", uploadFile);
  $("query").addEventListener("input", refreshNouns);
  $("sort").addEventListener("change", refreshNouns);
  $("minLen").addEventListener("change", renderNouns);

  $("dictDownload").addEventListener("click", downloadDict);
  $("dictUpload").addEventListener("click", uploadDict);
  $("drawerAddDict").addEventListener("click", addCurrentNounToDict);
  $("marksRefresh").addEventListener("click", refreshMarks);

  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerOverlay").addEventListener("click", closeDrawer);
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });
}

// Init
wire();
lucide.createIcons();
