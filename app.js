const storageKey = "wxyy-2-thin-section-index";
const snapshotLimit = 6;

const state = JSON.parse(localStorage.getItem(storageKey) || '{"samples":[],"compare":[],"mergeLog":[]}');
state.samples ||= [];
state.compare ||= [];
state.mergeLog ||= [];

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const mergePane = document.querySelector("#mergePane");
const mergeHint = document.querySelector("#mergeHint");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");

// 合并草稿：{ masterId, sourceId, choices }。确认前只存在内存里，两份卡片都不改动。
let mergeDraft = null;

let pendingPhoto = "";

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function norm(value) {
  return (value || "").trim();
}

function escapeHtml(value) {
  return norm(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findSample(id) {
  return state.samples.find((sample) => sample.id === id);
}

// —— 照片与批注的合并格式 ——
// gallery: [photo, ...extraPhotos]，首张为卡片主图。
// comments: [{ who: 来源编号, text }]，两边各带出处标签，不丢任何一份批注。
function galleryOf(sample) {
  return [sample.photo, ...(sample.extraPhotos || [])].filter(Boolean);
}

function commentsOf(sample) {
  if (Array.isArray(sample.comments)) return sample.comments;
  return norm(sample.comment) ? [{ who: sample.code, text: sample.comment }] : [];
}

function filteredSamples() {
  const mineral = mineralFilter.value.trim();
  const polarization = polarFilter.value;
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || (sample.minerals || "").includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    return mineralMatch && polarMatch;
  });
}

function renderComments(sample) {
  const blocks = commentsOf(sample);
  if (!blocks.length) return "<p>未填写批注</p>";
  return blocks.map((block) => `
    <p class="comment-block"><span class="who">${escapeHtml(block.who)}</span>${escapeHtml(block.text)}</p>
  `).join("");
}

function render() {
  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => `
    <article class="sample-card ${mergeDraft?.masterId === sample.id ? "is-master" : ""} ${mergeDraft?.sourceId === sample.id ? "is-source" : ""}">
      ${sample.photo ? `<img src="${sample.photo}" alt="${escapeHtml(sample.code)}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      ${galleryOf(sample).length > 1 ? `<div class="gallery">${galleryOf(sample).map((photo) => `<img src="${photo}" alt="">`).join("")}</div>` : ""}
      <div class="sample-body">
        <h3>${escapeHtml(sample.code)}</h3>
        <p>${escapeHtml(sample.location) || "未记录地点"} · ${escapeHtml(sample.magnification) || "未记录倍数"} · ${escapeHtml(sample.polarization)}</p>
        <p>矿物：${escapeHtml(sample.minerals) || "未记录"}</p>
        <p>结构：${escapeHtml(sample.texture) || "未记录"}</p>
        ${renderComments(sample)}
        ${(sample.aliases || []).length ? `<p class="history-line">并入编号：${sample.aliases.map(escapeHtml).join("、")}（只留履历）</p>` : ""}
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <button type="button" class="is-merge" data-merge="${sample.id}">
            ${mergeDraft?.masterId === sample.id ? "取消主档" : mergeDraft?.sourceId === sample.id ? "取消被并" : mergeDraft?.masterId && !mergeDraft.sourceId ? "并档到此" : "合并"}
          </button>
          <button type="button" data-delete="${sample.id}">删除</button>
        </div>
      </div>
    </article>
  `).join("") : "<p>还没有样本，先从左侧录入一张薄片照片。</p>";

  const compareSamples = state.compare
    .map((id) => findSample(id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => `
    <article class="compare-item">
      ${sample.photo ? `<img src="${sample.photo}" alt="${escapeHtml(sample.code)}对比图">` : ""}
      <h3>${escapeHtml(sample.code)}</h3>
      <p>${escapeHtml(sample.polarization)} · ${escapeHtml(sample.minerals) || "未记录矿物"}</p>
      <p>${escapeHtml(sample.texture) || "未记录结构"}</p>
    </article>
  `).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";

  renderMergeHint();
  renderMerge();
}

function renderMergeHint() {
  if (!mergeDraft) {
    mergeHint.hidden = true;
    mergeHint.textContent = "";
    return;
  }
  mergeHint.hidden = false;
  const master = findSample(mergeDraft.masterId);
  if (!master) {
    mergeHint.textContent = "";
    mergeHint.hidden = true;
    return;
  }
  mergeHint.textContent = mergeDraft.sourceId
    ? `主档 ${master.code} → 对照后确认合并`
    : `已选主档 ${master.code}，再点一张卡片作为被并档`;
}

// —— 合并判断区 ——

// 四个对照项：地点、倍数、偏光、鉴定结果（矿物 / 结构 / 批注）
const scalarFields = [
  { key: "location", label: "采样地点" },
  { key: "magnification", label: "放大倍数" },
  { key: "polarization", label: "偏光类型" },
  { key: "minerals", label: "鉴定结果 · 主要矿物" },
  { key: "texture", label: "鉴定结果 · 颗粒结构" }
];

function initialChoices(master, source) {
  const choices = {};
  scalarFields.forEach(({ key }) => {
    // 不同的先选保留哪边：默认留主档
    choices[key] = "master";
  });
  choices.photo = "master";
  choices.comment = "both";
  return choices;
}

function renderRole(sample, role) {
  if (!sample) {
    return `<div class="merge-role is-${role}"><strong>${role === "master" ? "主档" : "被并档"}</strong>未选择</div>`;
  }
  return `
    <div class="merge-role is-${role}">
      <strong>${role === "master" ? "主档（保留编号）" : "被并档（只留履历）"}</strong>
      ${escapeHtml(sample.code)} · ${escapeHtml(sample.location) || "未记录地点"}
    </div>`;
}

function scalarRow(field, master, source, choices) {
  const masterValue = norm(master[field.key]) || "未记录";
  const sourceValue = norm(source[field.key]) || "未记录";
  const same = norm(master[field.key]) === norm(source[field.key]);
  if (same) {
    return `
      <div class="merge-field">
        <div class="merge-field-title">${field.label}</div>
        <div class="merge-value">${escapeHtml(masterValue)}</div>
      </div>`;
  }
  return `
    <div class="merge-field conflict">
      <div class="merge-field-title">${field.label}<span class="tag">不同，选保留哪边</span></div>
      <div class="merge-options">
        <label><input type="radio" name="mf-${field.key}" data-choice="${field.key}" value="master" ${choices[field.key] === "master" ? "checked" : ""}>主档：${escapeHtml(masterValue)}</label>
        <label><input type="radio" name="mf-${field.key}" data-choice="${field.key}" value="source" ${choices[field.key] === "source" ? "checked" : ""}>被并：${escapeHtml(sourceValue)}</label>
      </div>
    </div>`;
}

function photoRow(master, source, choices) {
  const masterPhoto = master.photo || "";
  const sourcePhoto = source.photo || "";
  const masterCount = galleryOf(master).length;
  const sourceCount = galleryOf(source).length;
  const same = masterPhoto === sourcePhoto || (!masterPhoto && !sourcePhoto);
  const options = same ? "" : `
    <div class="merge-options">
      <label><input type="radio" name="mf-photo" data-choice="photo" value="master" ${choices.photo === "master" ? "checked" : ""}>主图用主档照片</label>
      <label><input type="radio" name="mf-photo" data-choice="photo" value="source" ${choices.photo === "source" ? "checked" : ""}>主图用被并档照片</label>
    </div>`;
  return `
    <div class="merge-field ${same ? "" : "conflict"}">
      <div class="merge-field-title">显微照片<span class="tag">所有照片都保留，主图${masterCount + sourceCount > 1 ? "之外的进照片册" : "二选一"}</span></div>
      <div class="merge-thumbs">
        <figure>${masterPhoto ? `<img src="${masterPhoto}" alt="主档照片">` : '<div class="photo-placeholder"></div>'}<figcaption>主档 · ${masterCount} 张</figcaption></figure>
        <figure>${sourcePhoto ? `<img src="${sourcePhoto}" alt="被并档照片">` : '<div class="photo-placeholder"></div>'}<figcaption>被并 · ${sourceCount} 张</figcaption></figure>
      </div>
      ${options}
    </div>`;
}

function commentRow(master, source, choices) {
  const masterBlocks = commentsOf(master);
  const sourceBlocks = commentsOf(source);
  return `
    <div class="merge-field conflict">
      <div class="merge-field-title">老师批注<span class="tag">两边都留，带出处</span></div>
      <div class="merge-options">
        <label><input type="radio" name="mf-comment" data-choice="comment" value="both" ${choices.comment === "both" ? "checked" : ""}>两份都保留（注明来源编号）</label>
        <label><input type="radio" name="mf-comment" data-choice="comment" value="master" ${choices.comment === "master" ? "checked" : ""}>只留主档批注（${masterBlocks.length} 条）</label>
        <label><input type="radio" name="mf-comment" data-choice="comment" value="source" ${choices.comment === "source" ? "checked" : ""}>只留被并档批注（${sourceBlocks.length} 条）</label>
      </div>
    </div>`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function renderMergeLog() {
  if (!state.mergeLog.length) return "";
  return `
    <div class="merge-log">
      <h3>合并履历（误合可按快照拆回）</h3>
      ${state.mergeLog.map((entry) => `
        <div class="merge-log-item">
          ${formatTime(entry.at)}：<code>${escapeHtml(entry.masterCode)}</code> 并入 <code>${escapeHtml(entry.sourceCode)}</code>
          <br><button type="button" data-undo="${entry.id}">按快照拆回</button>
        </div>`).join("")}
    </div>`;
}

function renderMerge() {
  if (!mergeDraft) {
    mergePane.innerHTML = `
      <p class="merge-empty">还没有合并任务。两位老师给同一张薄片各建了卡片时：<br>
      ① 先点卡片上的「合并」选定主档；② 再点另一张作为被并档；③ 在此对照采样地点、倍数、偏光和鉴定结果，不同的选定保留哪边。确认前两份卡片都不会被改动。</p>
      ${renderMergeLog()}`;
    return;
  }

  const master = findSample(mergeDraft.masterId);
  if (!master) {
    mergeDraft = null;
    mergePane.innerHTML = "";
    return;
  }
  const source = findSample(mergeDraft.sourceId);

  if (!source) {
    mergePane.innerHTML = `
      <div class="merge-roles">
        ${renderRole(master, "master")}
        ${renderRole(null, "source")}
      </div>
      <p class="merge-empty">主档已选定。请到中间卡片区点另一张卡片的「并档到此」作为被并档；再点主档上的「取消主档」可放弃本次合并。</p>
      ${renderMergeLog()}`;
    return;
  }

  const choices = mergeDraft.choices;
  mergePane.innerHTML = `
    <div class="merge-roles">
      ${renderRole(master, "master")}
      ${renderRole(source, "source")}
    </div>
    ${scalarFields.map((field) => scalarRow(field, master, source, choices)).join("")}
    ${photoRow(master, source, choices)}
    ${commentRow(master, source, choices)}
    <div class="merge-bar">
      <button type="button" id="confirmMergeBtn">确认合并</button>
      <button type="button" class="ghost" id="cancelMergeBtn">取消</button>
    </div>
    ${renderMergeLog()}`;
}

// —— 选档 / 改判断 ——

function startMerge(masterId) {
  mergeDraft = { masterId, sourceId: null, choices: null };
  render();
}

function pickSource(sourceId) {
  if (sourceId === mergeDraft.masterId) {
    // 再点主档 = 取消
    mergeDraft = null;
    render();
    return;
  }
  const master = findSample(mergeDraft.masterId);
  const source = findSample(sourceId);
  mergeDraft.sourceId = sourceId;
  mergeDraft.choices = initialChoices(master, source);
  render();
}

function handleMergeClick(id) {
  if (!mergeDraft) {
    startMerge(id);
    return;
  }
  if (id === mergeDraft.masterId) {
    mergeDraft = null;
    render();
    return;
  }
  if (id === mergeDraft.sourceId) {
    mergeDraft.sourceId = null;
    mergeDraft.choices = null;
    render();
    return;
  }
  if (!mergeDraft.sourceId) {
    pickSource(id);
    return;
  }
  // 两档都已选定时点其他卡片：改作被并档
  pickSource(id);
}

// —— 执行合并 ——

function pick(master, source, key) {
  return mergeDraft.choices[key] === "source" ? source[key] : master[key];
}

function resolveComments(master, source) {
  const mode = mergeDraft.choices.comment;
  const masterBlocks = commentsOf(master);
  const sourceBlocks = commentsOf(source);
  if (mode === "master") return masterBlocks;
  if (mode === "source") return sourceBlocks;
  // both：各自保留，带来源编号；去掉完全重复的条目
  const seen = new Set();
  return [...masterBlocks, ...sourceBlocks].filter((block) => {
    const signature = `${block.who} ${block.text}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function resolveGallery(master, source) {
  const prefer = mergeDraft.choices.photo;
  const masterPhotos = galleryOf(master);
  const sourcePhotos = galleryOf(source);
  let ordered;
  if (prefer === "source" && sourcePhotos.length) {
    ordered = [...sourcePhotos, ...masterPhotos];
  } else if (masterPhotos.length) {
    ordered = [...masterPhotos, ...sourcePhotos];
  } else {
    ordered = [...sourcePhotos];
  }
  // 去重（同一 dataURL 只留一份）
  return [...new Set(ordered)];
}

function confirmMerge() {
  const master = findSample(mergeDraft.masterId);
  const source = findSample(mergeDraft.sourceId);
  if (!master || !source) return;

  // 合并前存整库快照（不含履历链本身，避免嵌套膨胀）
  pushSnapshot(master, source);

  const mergedComments = resolveComments(master, source);
  const photos = resolveGallery(master, source);
  const [primaryPhoto, ...extraPhotos] = photos;

  // 被并编号只留履历：吸收它已有的并入编号，串成履历链
  const aliases = [...new Set([
    ...(master.aliases || []),
    source.code,
    ...(source.aliases || [])
  ])];

  const mergedAt = new Date().toISOString();
  const historyEntry = {
    code: source.code,
    at: mergedAt,
    note: "档案合并，被并编号只留履历"
  };

  const mergedSample = {
    ...master,
    location: pick(master, source, "location"),
    magnification: pick(master, source, "magnification"),
    polarization: pick(master, source, "polarization"),
    minerals: pick(master, source, "minerals"),
    texture: pick(master, source, "texture"),
    photo: primaryPhoto || "",
    extraPhotos,
    comments: mergedComments,
    comment: "",
    aliases,
    history: [...(master.history || []), ...(source.history || []), historyEntry],
    mergedAt
  };

  // 被并档占用的对比位置自动让给主档，对比记录不丢
  state.compare = state.compare.map((id) => (id === source.id ? master.id : id));
  state.compare = [...new Set(state.compare)].slice(0, 2);

  state.samples = state.samples
    .filter((sample) => sample.id !== source.id)
    .map((sample) => (sample.id === master.id ? mergedSample : sample));

  mergeDraft = null;
  save();
  render();
}

// —— 快照与拆回 ——

function pushSnapshot(master, source) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    masterId: master.id,
    sourceId: source.id,
    masterCode: master.code,
    sourceCode: source.code,
    snapshot: {
      samples: structuredCloneSafe(state.samples),
      compare: [...state.compare]
    }
  };
  state.mergeLog.unshift(entry);
  state.mergeLog = state.mergeLog.slice(0, snapshotLimit);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function undoMerge(logId) {
  const index = state.mergeLog.findIndex((entry) => entry.id === logId);
  if (index < 0) return;
  const entry = state.mergeLog[index];
  if (!window.confirm(`按快照拆回：恢复「${entry.masterCode}」与「${entry.sourceCode}」合并前的状态？该次之后的合并记录也会一并撤回。`)) {
    return;
  }
  // 快照是整库的，直接还原；履历链上比它新的记录一并撤回
  state.samples = entry.snapshot.samples;
  state.compare = entry.snapshot.compare;
  state.mergeLog = state.mergeLog.slice(index + 1);
  if (mergeDraft) {
    mergeDraft = null;
  }
  save();
  render();
}

// —— 事件 ——

photoInput.addEventListener("change", async () => {
  pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  if (!pendingPhoto && photoInput.files[0]) {
    pendingPhoto = await readFileAsDataUrl(photoInput.files[0]);
  }
  state.samples.unshift({
    id: crypto.randomUUID(),
    photo: pendingPhoto,
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim(),
    createdAt: new Date().toISOString()
  });
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  save();
  render();
});

sampleGrid.addEventListener("click", (event) => {
  const mergeId = event.target.dataset.merge;
  if (mergeId) {
    handleMergeClick(mergeId);
    return;
  }
  const deleteId = event.target.dataset.delete;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
    if (mergeDraft && (mergeDraft.masterId === deleteId || mergeDraft.sourceId === deleteId)) {
      mergeDraft = mergeDraft.masterId === deleteId
        ? null
        : { ...mergeDraft, sourceId: null, choices: null };
    }
    save();
    render();
  }
});

sampleGrid.addEventListener("change", (event) => {
  const id = event.target.dataset.compare;
  if (!id) return;
  if (event.target.checked) {
    state.compare = [id, ...state.compare.filter((item) => item !== id)].slice(0, 2);
  } else {
    state.compare = state.compare.filter((item) => item !== id);
  }
  save();
  render();
});

mergePane.addEventListener("change", (event) => {
  const key = event.target.dataset.choice;
  if (!key || !mergeDraft?.choices) return;
  mergeDraft.choices[key] = event.target.value;
});

mergePane.addEventListener("click", (event) => {
  if (event.target.id === "confirmMergeBtn") {
    confirmMerge();
    return;
  }
  if (event.target.id === "cancelMergeBtn") {
    mergeDraft = null;
    render();
    return;
  }
  const undoId = event.target.dataset.undo;
  if (undoId) undoMerge(undoId);
});

[mineralFilter, polarFilter].forEach((field) => field.addEventListener("input", render));

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = state.samples.map((sample) => ({
    样本编号: sample.code,
    采样地点: sample.location,
    放大倍数: sample.magnification,
    偏光类型: sample.polarization,
    主要矿物: sample.minerals,
    颗粒结构: sample.texture,
    老师批注: Array.isArray(sample.comments)
      ? sample.comments.map((block) => `【${block.who}】${block.text}`).join("\n")
      : sample.comment,
    并入编号: (sample.aliases || []).join("、")
  }));
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

render();
