const $ = (id) => document.getElementById(id);

let currentJobId = null;
let pollTimer = null;
let nounsCache = [];
let uploadingDict = false;
let drawerState = { noun: "", count: 0, inDict: false };
let marksCache = [];
let dictWordsCache = [];

// Pagination state
let currentPage = 1;
const pageSize = 200; // Increase page size for horizontal scroll layout

function setStatus(text, progress) {
  const statusText = $("statusText");
  const progressBar = $("progressBar");
  const progressPct = $("progressPct");

  if (statusText) statusText.textContent = text;
  
  const pct = Math.max(0, Math.min(100, progress ?? 0));
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressPct) progressPct.textContent = `${pct}%`;
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
      $("uploadBtn").disabled = false;
      await refreshNouns();
    }
    if (st.state === "error") {
      stopPolling();
      $("uploadBtn").disabled = false;
    }
  } catch (e) {
    setStatus(`发生错误: ${e.message}`, 100);
    $("uploadBtn").disabled = false;
    stopPolling();
  }
}

async function refreshNouns() {
  if (!currentJobId) return;
  currentPage = 1; // Reset to first page on refresh/filter
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
    metaEl.textContent = "未解析或未提取到相关名词";
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
    $("pagination").style.display = "none";
    lucide.createIcons();
    return;
  }

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (currentPage > totalPages) currentPage = Math.max(1, totalPages);
  
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = filtered.slice(start, end);

  for (const item of pageItems) {
    const card = document.createElement("div");
    card.className = "noun-card";
    card.innerHTML = `
      <div class="noun-header">
        <span class="noun-word">${escapeHtml(item.noun)}</span>
        <span class="noun-count">${escapeHtml(item.count)}</span>
      </div>
      <div class="noun-badges">
        ${item.in_dict ? '<span class="badge badge-dict"><i data-lucide="check" style="width:12px"></i> 已收录</span>' : ""}
        ${item.maybe_wrong ? '<span class="badge badge-error"><i data-lucide="alert-triangle" style="width:12px"></i> 有误</span>' : ""}
      </div>
    `;
    card.addEventListener("click", () => openDrawer(item.noun, item.count, item.in_dict, item.maybe_wrong));
    el.appendChild(card);
  }

  renderPagination(totalPages);
  lucide.createIcons();
}

function renderPagination(totalPages) {
  const container = $("pagination");
  if (totalPages <= 1) {
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";
  container.innerHTML = "";

  const createBtn = (page, text, active = false, disabled = false) => {
    const btn = document.createElement("button");
    btn.className = `page-btn ${active ? "active" : ""}`;
    btn.innerHTML = text;
    btn.disabled = disabled;
    if (!disabled && !active) {
      btn.addEventListener("click", () => {
        currentPage = page;
        renderNouns();
        window.scrollTo({ top: $("nouns").offsetTop - 100, behavior: "smooth" });
      });
    }
    return btn;
  };

  // Prev
  container.appendChild(createBtn(currentPage - 1, '<i data-lucide="chevron-left" style="width:16px"></i>', false, currentPage === 1));

  // Page Numbers (Smart pagination: [1] ... [current-1] [current] [current+1] ... [last])
  let pages = [];
  if (totalPages <= 7) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    if (currentPage <= 4) {
      pages = [1, 2, 3, 4, 5, "...", totalPages];
    } else if (currentPage >= totalPages - 3) {
      pages = [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      pages = [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
    }
  }

  pages.forEach((p) => {
    if (p === "...") {
      const dots = document.createElement("span");
      dots.className = "page-dots";
      dots.textContent = "...";
      container.appendChild(dots);
    } else {
      container.appendChild(createBtn(p, p, p === currentPage));
    }
  });

  // Next
  container.appendChild(createBtn(currentPage + 1, '<i data-lucide="chevron-right" style="width:16px"></i>', false, currentPage === totalPages));
  
  // Update icons for the new buttons
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
      item.className = "occ-card";
      item.innerHTML = `
        <div class="occ-meta">
          <span>PAGE ${x.page} · LINE ${x.line}</span>
        </div>
        <div class="occ-text">${highlight(x.sentence || "", noun)}</div>
        <div class="occ-actions" style="margin-top: 12px; display: flex; justify-content: flex-end;"></div>
      `;
      const actions = item.querySelector(".occ-actions");
      const markBtn = document.createElement("button");
      markBtn.className = "btn btn-sm";
      markBtn.innerHTML = isMarked(noun, x) ? '<i data-lucide="bookmark-minus" style="width:14px"></i> 取消标记' : '<i data-lucide="bookmark-plus" style="width:14px"></i> 标记句子';
      markBtn.addEventListener("click", () => markSentence(noun, x));
      actions.appendChild(markBtn);
      list.appendChild(item);
    }
    lucide.createIcons();
  } catch (e) {
    $("occList").innerHTML = `<div class="empty-state"><p>加载失败: ${e.message}</p></div>`;
  }
}

function updateDrawerDictStatus() {
  const status = $("drawerDictStatus");
  const addBtn = $("drawerAddDict");
  status.className = "badge"; // reset
  if (drawerState.inDict) {
    status.textContent = "已收录至词典";
    status.classList.add("badge-dict");
    addBtn.style.display = "none";
  } else {
    status.textContent = drawerState.maybeWrong ? "未收录（可能有误）" : "尚未收录";
    if (drawerState.maybeWrong) {
      status.classList.add("badge-error");
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
  const cards = Array.from(document.querySelectorAll(".occ-card"));
  if (!cards.length) return;
  marksCache = marksCache || [];
  cards.forEach((div) => {
    const locText = div.querySelector(".occ-meta")?.textContent || "";
    const match = /PAGE\s+(\d+)\s+·\s+LINE\s+(\d+)/.exec(locText);
    const sentenceEl = div.querySelector(".occ-text");
    const sentence = sentenceEl ? sentenceEl.textContent || "" : "";
    if (!match) return;
    const page = parseInt(match[1], 10);
    const line = parseInt(match[2], 10);
    const marked = isMarked(currentNoun, { page, line, sentence });
    const btn = div.querySelector(".occ-actions .btn");
    if (btn) {
      btn.innerHTML = marked ? '<i data-lucide="bookmark-minus" style="width:14px"></i> 取消标记' : '<i data-lucide="bookmark-plus" style="width:14px"></i> 标记句子';
    }
  });
  lucide.createIcons();
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
      <div class="mark-meta">P${m.page} L${m.line} · ${escapeHtml(m.noun)}</div>
      <div class="mark-text">${highlight(m.sentence || "", m.noun)}</div>
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

  closeUploadModal(); // Auto close on start
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
    await loadDictWords();
  } catch (e) {
    alert(`上传失败：${e.message}`);
  } finally {
    uploadingDict = false;
    $("dictUpload").disabled = false;
    $("dictUpload").textContent = "上传词典";
  }
}

async function loadDictWords() {
  try {
    const res = await api("/api/dict/words");
    dictWordsCache = res?.words || [];
    renderDictWords();
  } catch (e) {
    console.error("加载词典失败", e);
    alert(`加载词典失败：${e.message}`);
  }
}

function renderDictWords() {
  const listEl = $("dictWords");
  const emptyEl = $("dictWordsEmpty");
  listEl.innerHTML = "";
  if (!dictWordsCache.length) {
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  for (const w of dictWordsCache) {
    const card = document.createElement("div");
    card.className = "mark-card";
    card.style.cursor = "pointer";
    card.innerHTML = `
      <div class="mark-meta">${escapeHtml(w)}</div>
      <div class="mark-text" style="display:flex; justify-content:flex-end; gap:8px;">
        <span class="badge badge-error" style="cursor:pointer;">移出词典</span>
      </div>
    `;
    card.addEventListener("click", () => removeDictWord(w));
    listEl.appendChild(card);
  }
}

async function removeDictWord(word) {
  if (!word) return;
  const ok = confirm(`确定移除「${word}」吗？`);
  if (!ok) return;
  try {
    await api(`/api/dict/words?word=${encodeURIComponent(word)}`, { method: "DELETE" });
    dictWordsCache = dictWordsCache.filter((w) => w !== word);
    renderDictWords();
    alert("已移出词典");
  } catch (e) {
    alert(`移除失败：${e.message}`);
  }
}

function openUploadModal() {
  $("uploadOverlay").classList.add("active");
  $("uploadModal").classList.add("active");
}

function closeUploadModal() {
  $("uploadOverlay").classList.remove("active");
  $("uploadModal").classList.remove("active");
}

function openMarksModal() {
  $("marksOverlay").classList.add("active");
  $("marksModal").classList.add("active");
  refreshMarks();
}

function closeMarksModal() {
  $("marksOverlay").classList.remove("active");
  $("marksModal").classList.remove("active");
}

function openDictModal() {
  $("dictOverlay").classList.add("active");
  $("dictModal").classList.add("active");
  loadDictWords();
}

function closeDictModal() {
  $("dictOverlay").classList.remove("active");
  $("dictModal").classList.remove("active");
}

function wire() {
  $("file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const uploadArea = document.querySelector(".upload-area");
    const uploadText = uploadArea.querySelector(".upload-text");
    const uploadHint = uploadArea.querySelector(".upload-hint");
    if (file) {
      uploadText.textContent = file.name;
      uploadText.style.color = "var(--primary)";
      uploadHint.textContent = `文件大小: ${(file.size / 1024).toFixed(1)} KB`;
      uploadArea.style.borderColor = "var(--primary)";
      uploadArea.style.background = "#eff6ff";
    } else {
      uploadText.textContent = "选择或拖拽文件";
      uploadText.style.color = "";
      uploadHint.textContent = "支持 .pdf, .docx 格式";
      uploadArea.style.borderColor = "";
      uploadArea.style.background = "";
    }
  });

  $("uploadBtn").addEventListener("click", uploadFile);
  $("query").addEventListener("input", refreshNouns);
  $("sort").addEventListener("change", refreshNouns);
  $("minLen").addEventListener("change", () => {
    currentPage = 1;
    renderNouns();
  });

  $("dictDownload").addEventListener("click", downloadDict);
  $("dictUpload").addEventListener("click", uploadDict);
  $("dictRefresh").addEventListener("click", loadDictWords);
  $("drawerAddDict").addEventListener("click", addCurrentNounToDict);
  $("marksRefresh").addEventListener("click", refreshMarks);

  $("openUploadBtn").addEventListener("click", openUploadModal);
  $("closeUploadBtn").addEventListener("click", closeUploadModal);
  $("openMarksBtn").addEventListener("click", openMarksModal);
  $("closeMarksBtn").addEventListener("click", closeMarksModal);
  $("openDictBtn").addEventListener("click", openDictModal);
  $("closeDictBtn").addEventListener("click", closeDictModal);

  $("uploadOverlay").addEventListener("click", closeUploadModal);
  $("marksOverlay").addEventListener("click", closeMarksModal);
  $("dictOverlay").addEventListener("click", closeDictModal);
  
  $("drawerClose").addEventListener("click", closeDrawer);
  $("drawerOverlay").addEventListener("click", closeDrawer);
  
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeUploadModal();
      closeMarksModal();
      closeDictModal();
      closeDrawer();
    }
  });
}

// Init
wire();
lucide.createIcons();
