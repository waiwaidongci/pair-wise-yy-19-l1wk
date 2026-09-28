const storageKey = "wxyy-2-thin-section-index";
const state = JSON.parse(localStorage.getItem(storageKey) || '{"samples":[],"compare":[],"mergeLog":[]}');
if (!state.samples) state.samples = [];
if (!state.compare) state.compare = [];
if (!state.mergeLog) state.mergeLog = [];

const form = document.querySelector("#sampleForm");
const photoInput = document.querySelector("#photoInput");
const sampleGrid = document.querySelector("#sampleGrid");
const comparePane = document.querySelector("#comparePane");
const mineralFilter = document.querySelector("#mineralFilter");
const polarFilter = document.querySelector("#polarFilter");

const openMergeBtn = document.querySelector("#openMergeBtn");
const mergeCompareBtn = document.querySelector("#mergeCompareBtn");
const mergeDialog = document.querySelector("#mergeDialog");
const mergeCloseBtn = document.querySelector("#mergeCloseBtn");
const mergeCancelBtn = document.querySelector("#mergeCancelBtn");
const mergeConfirmBtn = document.querySelector("#mergeConfirmBtn");
const selectA = document.querySelector("#mergeA");
const selectB = document.querySelector("#mergeB");
const masterACode = document.querySelector("#masterACode");
const masterBCode = document.querySelector("#masterBCode");
const mergeWarn = document.querySelector("#mergeWarn");
const mergeJudgment = document.querySelector("#mergeJudgment");
const mergeSummary = document.querySelector("#mergeSummary");

const historyBtn = document.querySelector("#historyBtn");
const historyDialog = document.querySelector("#historyDialog");
const historyCloseBtn = document.querySelector("#historyCloseBtn");
const historyList = document.querySelector("#historyList");

let pendingPhoto = "";

// 合并向导的临时工作状态：只存在于确认前，不写入 state，两份原档案因此保持不动
let mergeSession = null;

const fieldDefs = [
  { group: "采样信息", key: "location", label: "采样地点" },
  { group: "采样信息", key: "magnification", label: "放大倍数" },
  { group: "采样信息", key: "polarization", label: "偏光类型" },
  { group: "鉴定结果", key: "minerals", label: "主要矿物" },
  { group: "鉴定结果", key: "texture", label: "颗粒结构" },
  { group: "鉴定结果", key: "comment", label: "老师批注" }
];

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.readAsDataURL(file);
  });
}

function samplePhotos(sample) {
  if (sample && Array.isArray(sample.photos)) return sample.photos;
  return sample && sample.photo ? [sample.photo] : [];
}

function coverPhoto(sample) {
  return samplePhotos(sample)[0] || "";
}

function blankText(value) {
  return value && value.trim() ? value : "（未填写）";
}

function filteredSamples() {
  const mineral = mineralFilter.value.trim();
  const polarization = polarFilter.value;
  return state.samples.filter((sample) => {
    const mineralMatch = !mineral || sample.minerals.includes(mineral);
    const polarMatch = !polarization || sample.polarization === polarization;
    return mineralMatch && polarMatch;
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function render() {
  const rows = filteredSamples();
  sampleGrid.innerHTML = rows.length ? rows.map((sample) => {
    const photos = samplePhotos(sample);
    const cover = photos[0];
    const mergedCount = (sample.history || []).length;
    return `
    <article class="sample-card">
      ${cover ? `<img src="${cover}" alt="${sample.code}显微照片">` : "<div class=\"photo-placeholder\"></div>"}
      <div class="sample-body">
        <h3>${sample.code}</h3>
        <p>${sample.location || "未记录地点"} · ${sample.magnification || "未记录倍数"} · ${sample.polarization}</p>
        <p>矿物：${sample.minerals || "未记录"}</p>
        <p>结构：${sample.texture || "未记录"}</p>
        <p>${sample.comment || "未填写批注"}</p>
        ${photos.length > 1 ? `<p class="photo-count">相册 ${photos.length} 张照片</p>` : ""}
        ${mergedCount ? `<p class="history-line">已并档 ×${mergedCount}：${sample.history.map((item) => item.absorbed.code).join("、")}</p>` : ""}
        <div class="card-actions">
          <label><input type="checkbox" data-compare="${sample.id}" ${state.compare.includes(sample.id) ? "checked" : ""}>对比</label>
          <button type="button" data-delete="${sample.id}">删除</button>
        </div>
      </div>
    </article>`;
  }).join("") : "<p>还没有样本，先从左侧录入一张薄片照片。</p>";

  const compareSamples = state.compare
    .map((id) => state.samples.find((sample) => sample.id === id))
    .filter(Boolean)
    .slice(0, 2);

  comparePane.innerHTML = compareSamples.length ? compareSamples.map((sample) => `
    <article class="compare-item">
      ${coverPhoto(sample) ? `<img src="${coverPhoto(sample)}" alt="${sample.code}对比图">` : ""}
      <h3>${sample.code}</h3>
      <p>${sample.polarization} · ${sample.minerals || "未记录矿物"}</p>
      <p>${sample.texture || "未记录结构"}</p>
    </article>
  `).join("") : "<p>勾选两张样本卡片后可并排对比。</p>";

  mergeCompareBtn.hidden = compareSamples.length !== 2;
  openMergeBtn.disabled = state.samples.length < 2;
}

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
    photos: pendingPhoto ? [pendingPhoto] : [],
    code: data.get("code").trim(),
    location: data.get("location").trim(),
    magnification: data.get("magnification").trim(),
    polarization: data.get("polarization"),
    minerals: data.get("minerals").trim(),
    texture: data.get("texture").trim(),
    comment: data.get("comment").trim(),
    history: [],
    createdAt: new Date().toISOString()
  });
  pendingPhoto = "";
  photoInput.value = "";
  form.reset();
  save();
  render();
});

sampleGrid.addEventListener("click", (event) => {
  const deleteId = event.target.dataset.delete;
  if (deleteId) {
    state.samples = state.samples.filter((sample) => sample.id !== deleteId);
    state.compare = state.compare.filter((id) => id !== deleteId);
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

[mineralFilter, polarFilter].forEach((field) => field.addEventListener("input", render));

document.querySelector("#exportBtn").addEventListener("click", () => {
  const checklist = state.samples.map((sample) => ({
    样本编号: sample.code,
    采样地点: sample.location,
    放大倍数: sample.magnification,
    偏光类型: sample.polarization,
    主要矿物: sample.minerals,
    颗粒结构: sample.texture,
    老师批注: sample.comment,
    照片数量: samplePhotos(sample).length
  }));
  const blob = new Blob([JSON.stringify(checklist, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "thin-section-checklist.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

/* ---------------- 档案合并：第 1 部分 · 录入（选档案、选主档） ---------------- */

function getMergePair() {
  if (!mergeSession) return null;
  const a = state.samples.find((sample) => sample.id === mergeSession.aId);
  const b = state.samples.find((sample) => sample.id === mergeSession.bId);
  if (!a || !b || a.id === b.id) return null;
  const master = mergeSession.master === "b" ? b : a;
  const absorbed = mergeSession.master === "b" ? a : b;
  return { a, b, master, absorbed };
}

function fillSelect(select, selectedId, otherId) {
  select.innerHTML = state.samples.map((sample) =>
    `<option value="${sample.id}"${sample.id === otherId ? " disabled" : ""}>${sample.code}</option>`
  ).join("");
  select.value = selectedId || "";
}

function renderMergeEntry() {
  if (!mergeSession) return;
  fillSelect(selectA, mergeSession.aId, mergeSession.bId);
  fillSelect(selectB, mergeSession.bId, mergeSession.aId);
  const pair = getMergePair();
  masterACode.textContent = pair ? pair.a.code : "";
  masterBCode.textContent = pair ? pair.b.code : "";
  document.querySelectorAll("input[name='mergeMaster']").forEach((radio) => {
    radio.checked = radio.value === mergeSession.master;
    radio.disabled = !pair;
  });
  mergeWarn.hidden = Boolean(pair);
}

/* ---------------- 档案合并：第 2 部分 · 判断（逐项选保留哪边） ---------------- */

function defaultChoices(master, absorbed) {
  const choices = {};
  fieldDefs.forEach(({ key }) => {
    const masterValue = master[key] || "";
    const absorbedValue = absorbed[key] || "";
    // 相同或主档已有内容时默认主档；主档为空、被并档有内容时默认被并档
    choices[key] = masterValue || !absorbedValue ? "master" : "absorbed";
  });
  choices.photo = coverPhoto(absorbed) && !coverPhoto(master) ? "absorbed" : "master";
  return choices;
}

function startMerge(aId = "", bId = "") {
  mergeSession = { aId, bId, master: "a", choices: {} };
  renderMergeEntry();
  ensureChoices();
  renderMergeJudgment();
  mergeDialog.showModal();
}

function ensureChoices() {
  const pair = getMergePair();
  if (!pair) {
    mergeJudgment.innerHTML = "<p class=\"muted-tip\">请先在上方选择两张不同的档案。</p>";
    mergeSummary.innerHTML = "";
    mergeConfirmBtn.disabled = true;
    return null;
  }
  const expected = `${pair.master.id}/${pair.absorbed.id}`;
  if (!mergeSession.choices || mergeSession.choices._pair !== expected) {
    mergeSession.choices = { _pair: expected, ...defaultChoices(pair.master, pair.absorbed) };
  }
  mergeConfirmBtn.disabled = false;
  return pair;
}

function choiceCell(pair, fieldKey, masterValue, absorbedValue, same) {
  if (same) return "<div class=\"choice-cell\"><span class=\"same-tag\">一致</span></div>";
  const choices = mergeSession.choices;
  return `
    <div class="choice-cell">
      <label><input type="radio" name="cf_${fieldKey}" data-choice="${fieldKey}" value="master" ${choices[fieldKey] === "master" ? "checked" : ""}> 主档</label>
      <label><input type="radio" name="cf_${fieldKey}" data-choice="${fieldKey}" value="absorbed" ${choices[fieldKey] === "absorbed" ? "checked" : ""}> 被并档（${pair.absorbed.code}）</label>
    </div>`;
}

function renderMergeJudgment() {
  const pair = ensureChoices();
  if (!pair) return;
  const { master, absorbed } = pair;

  let html = "";
  for (const group of ["采样信息", "鉴定结果"]) {
    html += `<h4 class="judge-group">${group}</h4>`;
    for (const def of fieldDefs.filter((item) => item.group === group)) {
      const masterValue = master[def.key] || "";
      const absorbedValue = absorbed[def.key] || "";
      const same = masterValue === absorbedValue;
      html += `
        <div class="judge-row ${same ? "" : "diff"}">
          <span class="judge-label">${def.label}</span>
          <span class="${same ? "judge-val same" : "judge-val master-val"}">${blankText(masterValue)}</span>
          <span class="judge-val absorbed-val">${blankText(absorbedValue)}</span>
          ${choiceCell(pair, def.key, masterValue, absorbedValue, same)}
        </div>`;
    }
  }

  const masterPhotos = samplePhotos(master);
  const absorbedPhotos = samplePhotos(absorbed);
  const coverSame = coverPhoto(master) === coverPhoto(absorbed);
  html += `<h4 class="judge-group">照片（双方全部照片都进合并后相册，封面选保留哪边）</h4>
    <div class="judge-row photo-row ${coverSame ? "" : "diff"}">
      <span class="judge-label">照片相册</span>
      <span class="judge-val">
        <span class="${mergeSession.choices.photo === "master" ? "cover-picked" : ""}">主档 ${masterPhotos.length} 张</span>
        <div class="thumb-strip">${masterPhotos.map((src) => `<img src="${src}" alt="主档照片">`).join("") || "（无）"}</div>
      </span>
      <span class="judge-val">
        <span class="${mergeSession.choices.photo === "absorbed" ? "cover-picked" : ""}">被并档 ${absorbedPhotos.length} 张</span>
        <div class="thumb-strip">${absorbedPhotos.map((src) => `<img src="${src}" alt="被并档照片">`).join("") || "（无）"}</div>
      </span>
      <div class="choice-cell">
        ${coverSame ? "<span class=\"same-tag\">一致</span>" : `
        <label><input type="radio" name="cf_photo" data-choice="photo" value="master" ${mergeSession.choices.photo === "master" ? "checked" : ""}> 主档封面</label>
        <label><input type="radio" name="cf_photo" data-choice="photo" value="absorbed" ${mergeSession.choices.photo === "absorbed" ? "checked" : ""}> 被并档封面</label>`}
      </div>
    </div>`;

  mergeJudgment.innerHTML = html;
  renderMergeSummary(pair);
}

/* ---------------- 档案合并：第 3 部分 · 卡片操作（确认 / 快照） ---------------- */

function renderMergeSummary(pairArg) {
  const pair = pairArg || getMergePair();
  if (!pair) return;
  const { master, absorbed } = pair;
  const diffs = fieldDefs
    .filter(({ key }) => (master[key] || "") !== (absorbed[key] || ""))
    .map(({ key, label }) => `${label}取${mergeSession.choices[key] === "master" ? "主档" : "被并档"}`);
  const keptFromAbsorbed = fieldDefs
    .filter(({ key }) => mergeSession.choices[key] === "absorbed" && (absorbed[key] || ""))
    .map(({ label }) => label);

  mergeSummary.innerHTML = `
    <p>主档：<strong>${master.code}</strong>，被并编号 <strong>${absorbed.code}</strong> 合并后只保留在主档履历中。</p>
    <p class="muted-tip">不一致项：${diffs.length ? diffs.join("；") : "无"}。</p>
    <p class="muted-tip">${keptFromAbsorbed.length ? `从被并档采用：${keptFromAbsorbed.join("、")}；` : ""}双方照片全部保留到主档相册，封面取${mergeSession.choices.photo === "master" ? "主档" : "被并档"}。</p>
    <p class="muted-tip">确认时会保存双方合并前快照，误合可在「合并记录」里按快照拆回。</p>`;
}

function confirmMerge() {
  const pair = ensureChoices();
  if (!pair) return;
  const { master, absorbed } = pair;

  // 合并前最后拍一次快照（快照不共享引用），确认前两份档案一直未被修改
  const masterSnapshot = clone(master);
  const absorbedSnapshot = clone(absorbed);

  const merged = clone(master);
  fieldDefs.forEach(({ key }) => {
    if (mergeSession.choices[key] === "absorbed") {
      merged[key] = absorbed[key];
    }
  });

  let photos = [];
  const pushPhotos = (list) => list.forEach((src) => {
    if (src && !photos.includes(src)) photos.push(src);
  });
  if (mergeSession.choices.photo === "absorbed") {
    pushPhotos(samplePhotos(absorbed));
    pushPhotos(samplePhotos(master));
  } else {
    pushPhotos(samplePhotos(master));
    pushPhotos(samplePhotos(absorbed));
  }
  merged.photos = photos;
  delete merged.photo;
  merged.history = merged.history || [];
  merged.mergedAt = new Date().toISOString();

  const record = {
    id: crypto.randomUUID(),
    at: merged.mergedAt,
    masterId: master.id,
    absorbedId: absorbed.id,
    master: masterSnapshot,
    absorbed: absorbedSnapshot,
    choices: clone(mergeSession.choices)
  };
  merged.history.push({ at: record.at, recordId: record.id, absorbed: { id: absorbed.id, code: absorbed.code } });

  state.samples = state.samples.map((sample) =>
    sample.id === master.id ? merged : sample
  ).filter((sample) => sample.id !== absorbed.id);
  state.mergeLog.unshift(record);

  // 被并档若正参与对比，对比位置移交给主档，避免散落引用
  state.compare = state.compare
    .map((id) => (id === absorbed.id ? master.id : id))
    .filter((id, index, list) => id && list.indexOf(id) === index)
    .slice(0, 2);

  save();
  mergeDialog.close();
  mergeSession = null;
  render();
}

openMergeBtn.addEventListener("click", () => {
  if (state.samples.length < 2) return;
  startMerge(state.samples[0]?.id || "", state.samples[1]?.id || "");
});

mergeCompareBtn.addEventListener("click", () => {
  const pairIds = state.compare.slice(0, 2);
  if (pairIds.length === 2) startMerge(pairIds[0], pairIds[1]);
});

[selectA, selectB].forEach((select) => select.addEventListener("change", () => {
  mergeSession.aId = selectA.value;
  mergeSession.bId = selectB.value;
  renderMergeEntry();
  ensureChoices();
  renderMergeJudgment();
}));

mergeDialog.addEventListener("change", (event) => {
  if (event.target.name === "mergeMaster") {
    mergeSession.master = event.target.value;
    // 主档对调后重新生成默认判断，避免旧选择对错边
    mergeSession.choices = {};
    renderMergeEntry();
    ensureChoices();
    renderMergeJudgment();
    return;
  }
  const fieldKey = event.target.dataset.choice;
  if (fieldKey) {
    mergeSession.choices[fieldKey] = event.target.value;
    renderMergeSummary();
  }
});

mergeConfirmBtn.addEventListener("click", confirmMerge);
[mergeCloseBtn, mergeCancelBtn].forEach((btn) => btn.addEventListener("click", () => {
  mergeDialog.close();
  mergeSession = null;
}));
mergeDialog.addEventListener("close", () => {
  mergeSession = null;
});

/* ---------------- 合并履历 · 按快照拆回 ---------------- */

// 只有「最新一次、且主档此后未再被合并/删除」的记录才能原样拆回
function canSplit(record) {
  const currentMaster = state.samples.find((sample) => sample.id === record.masterId);
  if (!currentMaster) return false;
  const currentIndex = state.mergeLog.findIndex((item) => item.id === record.id);
  if (currentIndex !== 0) return false;
  return true;
}

function splitMerge(record) {
  if (!canSplit(record)) return;
  const restoredMaster = clone(record.master);
  const restoredAbsorbed = clone(record.absorbed);

  state.samples = state.samples.filter((sample) => sample.id !== record.masterId);
  const masterIndex = state.samples.findIndex((sample) => sample.id === record.absorbedId);
  if (masterIndex >= 0) {
    state.samples.splice(masterIndex, 0, restoredMaster, restoredAbsorbed);
  } else {
    state.samples.unshift(restoredAbsorbed, restoredMaster);
  }
  state.mergeLog = state.mergeLog.filter((item) => item.id !== record.id);
  state.compare = state.compare.filter((id) =>
    id !== record.masterId && id !== record.absorbedId
  );

  save();
  renderHistory();
  render();
}

function renderHistory() {
  if (!state.mergeLog.length) {
    historyList.innerHTML = "<p class=\"muted-tip\">还没有合并记录。</p>";
    return;
  }
  historyList.innerHTML = state.mergeLog.map((record) => {
    const reversible = canSplit(record);
    const sideName = (who) => who === "master" ? "主档" : "被并档";
    const choices = record.choices || {};
    const diffText = fieldDefs
      .filter(({ key }) => (record.master[key] || "") !== (record.absorbed[key] || ""))
      .map(({ key, label }) => `${label}取${sideName(choices[key])}`)
      .join("；");
    return `
      <article class="history-item ${reversible ? "" : "locked"}">
        <header>
          <strong>${record.master.code}</strong>
          <span>＋ 并入 ${record.absorbed.code}</span>
          <time>${formatTime(record.at)}</time>
        </header>
        <p class="muted-tip">${diffText ? diffText : "字段一致，仅合并照片与卡片"}；照片全部保留。</p>
        <div class="history-item-actions">
          ${reversible
            ? `<button type="button" data-split="${record.id}">按快照拆回</button>`
            : "<span class=\"locked-tip\">主档此后又有变动，已不能自动拆回</span>"}
        </div>
      </article>`;
  }).join("");
}

historyList.addEventListener("click", (event) => {
  const recordId = event.target.dataset.split;
  if (!recordId) return;
  const record = state.mergeLog.find((item) => item.id === recordId);
  if (record && canSplit(record) &&
      confirm(`按快照拆回「${record.master.code} ＋ ${record.absorbed.code}」？两份档案将恢复到合并前。`)) {
    splitMerge(record);
  }
});

historyBtn.addEventListener("click", () => {
  renderHistory();
  historyDialog.showModal();
});
historyCloseBtn.addEventListener("click", () => historyDialog.close());

render();
