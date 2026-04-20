const STORAGE_KEY = "curve-to-contrast-study-vault-v1";
const DEFAULT_EXAMPLE_IMAGE = "demo-km-example.png";
const DEFAULT_EXAMPLE_FORM = {
  leftArm: "Group 1 (low risk)",
  rightArm: "Group 2 (high risk)",
  studyLabel: "Demo Kaplan-Meier Example",
  timeUnit: "months",
  xAxisMax: "70",
  numbersAtRisk:
    "Times 0, 10, 20, 30, 40, 50, 60, 70. Group 1: 112, 95, 90, 85, 79, 56, 53, 50. Group 2: 103, 80, 63, 50, 23, 10, 7, 6.",
  studyContext:
    "Default example image shown on first load. Two-group Kaplan-Meier survival curve with a number-at-risk table.",
};

const state = {
  imageDataUrl: "",
  currentStudy: null,
  savedStudies: [],
  articleResults: { one: [], two: [] },
};

const elements = {
  extractForm: document.getElementById("extractForm"),
  protocolNotice: document.getElementById("protocolNotice"),
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  apiKey: document.getElementById("apiKey"),
  model: document.getElementById("model"),
  leftArm: document.getElementById("leftArm"),
  rightArm: document.getElementById("rightArm"),
  studyLabel: document.getElementById("studyLabel"),
  timeUnit: document.getElementById("timeUnit"),
  xAxisMax: document.getElementById("xAxisMax"),
  curveImage: document.getElementById("curveImage"),
  numbersAtRisk: document.getElementById("numbersAtRisk"),
  studyContext: document.getElementById("studyContext"),
  extractButton: document.getElementById("extractButton"),
  imagePreview: document.getElementById("imagePreview"),
  imagePlaceholder: document.getElementById("imagePlaceholder"),
  extractStatus: document.getElementById("extractStatus"),
  resultsSection: document.getElementById("resultsSection"),
  summaryCards: document.getElementById("summaryCards"),
  survivalChart: document.getElementById("survivalChart"),
  studySummary: document.getElementById("studySummary"),
  noteList: document.getElementById("noteList"),
  warningList: document.getElementById("warningList"),
  eventTableSplit: document.getElementById("eventTableSplit"),
  saveStudyButton: document.getElementById("saveStudyButton"),
  studyVault: document.getElementById("studyVault"),
  studyOneSelect: document.getElementById("studyOneSelect"),
  studyTwoSelect: document.getElementById("studyTwoSelect"),
  indirectButton: document.getElementById("indirectButton"),
  indirectResult: document.getElementById("indirectResult"),
  searchOneLeft: document.getElementById("searchOneLeft"),
  searchOneRight: document.getElementById("searchOneRight"),
  searchOneCondition: document.getElementById("searchOneCondition"),
  searchOneKeywords: document.getElementById("searchOneKeywords"),
  searchOneButton: document.getElementById("searchOneButton"),
  searchOneStatus: document.getElementById("searchOneStatus"),
  searchOneResults: document.getElementById("searchOneResults"),
  searchTwoLeft: document.getElementById("searchTwoLeft"),
  searchTwoRight: document.getElementById("searchTwoRight"),
  searchTwoCondition: document.getElementById("searchTwoCondition"),
  searchTwoKeywords: document.getElementById("searchTwoKeywords"),
  searchTwoButton: document.getElementById("searchTwoButton"),
  searchTwoStatus: document.getElementById("searchTwoStatus"),
  searchTwoResults: document.getElementById("searchTwoResults"),
  demoStudyButton: document.getElementById("demoStudyButton"),
};

function initialize() {
  renderProtocolNotice();
  hydrateVault();
  wireEvents();
  renderStudyVault();
  populateStudySelects();
  loadDemoStudy({ statusText: "Default demo study loaded" });
}

function renderProtocolNotice() {
  if (window.location.protocol !== "file:") {
    elements.protocolNotice.innerHTML = "";
    if (elements.extractButton) {
      elements.extractButton.disabled = false;
      elements.extractButton.textContent = "Extract Event Table";
    }
    return;
  }

  elements.protocolNotice.innerHTML = `
    <div class="protocol-notice">
      <strong>Static preview mode:</strong> this <code>file://</code> page cannot call the backend extractor.
      If you want real two-group extraction, open <code>http://127.0.0.1:8000</code> after starting <code>python3 server.py</code>.
    </div>
  `;
  state.currentStudy = null;
  elements.resultsSection.classList.add("hidden");
  elements.summaryCards.innerHTML = "";
  elements.studySummary.innerHTML = "";
  elements.noteList.innerHTML = "";
  elements.warningList.innerHTML = "";
  elements.eventTableSplit.innerHTML = "";
  elements.survivalChart.innerHTML = "";
  if (elements.extractButton) {
    elements.extractButton.disabled = true;
    elements.extractButton.textContent = "Extraction Needs Local Server";
  }
}

function wireEvents() {
  elements.curveImage.addEventListener("change", handleImageUpload);
  elements.extractForm.addEventListener("submit", handleExtraction);
  elements.saveStudyButton.addEventListener("click", saveCurrentStudy);
  elements.indirectButton.addEventListener("click", handleIndirectComparison);
  elements.searchOneButton.addEventListener("click", () => runArticleSearch("one"));
  elements.searchTwoButton.addEventListener("click", () => runArticleSearch("two"));
  elements.searchOneResults.addEventListener("click", handleArticleAction);
  elements.searchTwoResults.addEventListener("click", handleArticleAction);
  elements.studyVault.addEventListener("click", handleVaultAction);
  elements.demoStudyButton.addEventListener("click", loadDemoStudy);
}

function hydrateVault() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.savedStudies = [];
      return;
    }
    const parsed = JSON.parse(raw);
    state.savedStudies = Array.isArray(parsed) ? parsed.map(normalizeStudy) : [];
  } catch (error) {
    console.error("Could not hydrate local vault", error);
    state.savedStudies = [];
  }
}

function persistVault() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.savedStudies));
}

function handleImageUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    resetStudySetupForUploadedImage();
    state.imageDataUrl = String(reader.result || "");
    updatePreview(state.imageDataUrl);
    setStatus("idle", "Image ready for extraction");
  };
  reader.readAsDataURL(file);
}

function updatePreview(src) {
  if (!src) {
    elements.imagePreview.hidden = true;
    elements.imagePreview.removeAttribute("src");
    elements.imagePlaceholder.hidden = false;
    return;
  }
  elements.imagePreview.hidden = false;
  elements.imagePreview.src = src;
  elements.imagePlaceholder.hidden = true;
}

function loadDefaultExample() {
  elements.leftArm.value = DEFAULT_EXAMPLE_FORM.leftArm;
  elements.rightArm.value = DEFAULT_EXAMPLE_FORM.rightArm;
  elements.studyLabel.value = DEFAULT_EXAMPLE_FORM.studyLabel;
  elements.timeUnit.value = DEFAULT_EXAMPLE_FORM.timeUnit;
  elements.xAxisMax.value = DEFAULT_EXAMPLE_FORM.xAxisMax;
  elements.numbersAtRisk.value = DEFAULT_EXAMPLE_FORM.numbersAtRisk;
  elements.studyContext.value = DEFAULT_EXAMPLE_FORM.studyContext;
  state.imageDataUrl = DEFAULT_EXAMPLE_IMAGE;
  updatePreview(DEFAULT_EXAMPLE_IMAGE);
  setStatus("idle", "Demo example loaded");
}

function resetStudySetupForUploadedImage() {
  state.currentStudy = null;
  elements.leftArm.value = "Treatment A";
  elements.rightArm.value = "Treatment B";
  elements.studyLabel.value = "";
  elements.timeUnit.value = "months";
  elements.xAxisMax.value = "";
  elements.numbersAtRisk.value = "";
  elements.studyContext.value = "";
  elements.resultsSection.classList.add("hidden");
  elements.summaryCards.innerHTML = "";
  elements.studySummary.innerHTML = "";
  elements.noteList.innerHTML = "";
  elements.warningList.innerHTML = "";
  elements.eventTableSplit.innerHTML = "";
  elements.survivalChart.innerHTML = "";
}

async function ensureImageDataUrl(src) {
  if (!src) {
    return "";
  }
  if (src.startsWith("data:image/")) {
    return src;
  }
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error("Could not load the default demo image.");
  }
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(blob);
  });
}

async function handleExtraction(event) {
  event.preventDefault();
  if (window.location.protocol === "file:") {
    setStatus("error", "Extraction needs the local server. Open http://127.0.0.1:8000 instead of file://");
    return;
  }
  if (!state.imageDataUrl) {
    setStatus("error", "Upload a Kaplan-Meier image first");
    return;
  }
  if (!elements.apiKey.value.trim()) {
    setStatus("error", "Enter your own API key before extracting");
    elements.apiKey.focus();
    return;
  }
  state.imageDataUrl = await ensureImageDataUrl(state.imageDataUrl);

  const payload = {
    apiBaseUrl: elements.apiBaseUrl.value.trim(),
    apiKey: elements.apiKey.value.trim(),
    model: elements.model.value.trim(),
    leftArm: elements.leftArm.value.trim(),
    rightArm: elements.rightArm.value.trim(),
    studyLabel: elements.studyLabel.value.trim(),
    timeUnit: elements.timeUnit.value,
    xAxisMax: elements.xAxisMax.value.trim(),
    numbersAtRisk: elements.numbersAtRisk.value.trim(),
    studyContext: elements.studyContext.value.trim(),
    imageDataUrl: state.imageDataUrl,
  };

  setStatus("loading", "Calling the LLM and reconstructing events");

  try {
    const response = await postJson("/api/extract", payload);
    const study = normalizeStudy(response.study);
    syncArmInputsFromStudy(study);
    state.currentStudy = study;
    renderCurrentStudy();
    setStatus("success", "Extraction complete");
    elements.resultsSection.classList.remove("hidden");
    elements.resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    setStatus("error", error.message || "Extraction failed");
  }
}

async function runArticleSearch(slot) {
  if (window.location.protocol === "file:") {
    const statusElement = slot === "one" ? elements.searchOneStatus : elements.searchTwoStatus;
    statusElement.textContent = "PubMed search needs the local server. Open http://127.0.0.1:8000 instead of file://";
    return;
  }
  const values =
    slot === "one"
      ? {
          leftTreatment: elements.searchOneLeft.value.trim(),
          rightTreatment: elements.searchOneRight.value.trim(),
          condition: elements.searchOneCondition.value.trim(),
          extraKeywords: elements.searchOneKeywords.value.trim(),
        }
      : {
          leftTreatment: elements.searchTwoLeft.value.trim(),
          rightTreatment: elements.searchTwoRight.value.trim(),
          condition: elements.searchTwoCondition.value.trim(),
          extraKeywords: elements.searchTwoKeywords.value.trim(),
        };

  const statusElement = slot === "one" ? elements.searchOneStatus : elements.searchTwoStatus;
  const resultsElement = slot === "one" ? elements.searchOneResults : elements.searchTwoResults;
  statusElement.textContent = "Searching PubMed...";
  resultsElement.innerHTML = "";

  try {
    const response = await postJson("/api/pubmed/search", values);
    state.articleResults[slot] = response.articles || [];
    renderArticleResults(slot, response);
    statusElement.textContent = response.articles?.length
      ? `Query: ${response.query}`
      : `No articles found for query: ${response.query}`;
  } catch (error) {
    console.error(error);
    statusElement.textContent = error.message || "PubMed search failed";
  }
}

function renderArticleResults(slot, response) {
  const resultsElement = slot === "one" ? elements.searchOneResults : elements.searchTwoResults;
  const left = slot === "one" ? elements.searchOneLeft.value.trim() : elements.searchTwoLeft.value.trim();
  const right = slot === "one" ? elements.searchOneRight.value.trim() : elements.searchTwoRight.value.trim();

  if (!response.articles?.length) {
    resultsElement.innerHTML = `
      <div class="article-card animate-in">
        <h3>No matching articles</h3>
        <p>Try adjusting the condition or the extra keywords. Adding survival-related terms often helps.</p>
      </div>
    `;
    return;
  }

  resultsElement.innerHTML = response.articles
    .map(
      (article) => `
        <article class="article-card animate-in">
          <div class="meta-row">
            <span>${escapeHtml(article.pubdate || "No date")}</span>
            <span>${escapeHtml(article.journal || "Journal unavailable")}</span>
            <span>PMID ${escapeHtml(article.pmid)}</span>
          </div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(trimText(article.abstract || "No abstract returned from PubMed.", 340))}</p>
          <div class="button-row">
            <a href="${escapeHtml(article.pubmedUrl)}" target="_blank" rel="noreferrer noopener">Open PubMed</a>
            <button
              class="button secondary"
              type="button"
              data-action="apply-article"
              data-slot="${slot}"
              data-pmid="${escapeHtml(article.pmid)}"
              data-left="${escapeHtml(left)}"
              data-right="${escapeHtml(right)}"
            >
              Use In Extraction Form
            </button>
          </div>
        </article>
      `,
    )
    .join("");
}

function handleArticleAction(event) {
  const button = event.target.closest("button[data-action='apply-article']");
  if (!button) {
    return;
  }

  const { slot, pmid, left, right } = button.dataset;
  const article = state.articleResults[slot].find((item) => item.pmid === pmid);
  if (!article) {
    return;
  }

  elements.leftArm.value = left || "Treatment A";
  elements.rightArm.value = right || "Treatment B";
  elements.studyLabel.value = article.title;
  const citationBits = [article.journal, article.pubdate, `PMID ${article.pmid}`].filter(Boolean);
  elements.studyContext.value = `Imported citation context: ${citationBits.join(" | ")}.`;
  elements.extractForm.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("idle", "Article metadata copied into the extraction form");
}

function handleVaultAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const studyId = button.dataset.studyId;
  if (!studyId) {
    return;
  }

  if (button.dataset.action === "load") {
    const study = state.savedStudies.find((item) => item.id === studyId);
    if (!study) {
      return;
    }
    state.currentStudy = normalizeStudy(study);
    syncArmInputsFromStudy(state.currentStudy);
    renderCurrentStudy();
    elements.resultsSection.classList.remove("hidden");
    setStatus("success", "Loaded a saved study from the vault");
    return;
  }

  if (button.dataset.action === "delete") {
    state.savedStudies = state.savedStudies.filter((item) => item.id !== studyId);
    persistVault();
    renderStudyVault();
    populateStudySelects();
    renderIndirectResult(null);
  }
}

function saveCurrentStudy() {
  if (!state.currentStudy) {
    setStatus("error", "Run or load a study before saving");
    return;
  }

  const existingIndex = state.savedStudies.findIndex((study) => study.id === state.currentStudy.id);
  const payload = { ...state.currentStudy, savedAt: new Date().toISOString() };
  if (existingIndex >= 0) {
    state.savedStudies[existingIndex] = payload;
  } else {
    state.savedStudies.unshift(payload);
  }
  persistVault();
  renderStudyVault();
  populateStudySelects();
  setStatus("success", "Study saved to the local vault");
}

function handleIndirectComparison() {
  const studyOneId = elements.studyOneSelect.value;
  const studyTwoId = elements.studyTwoSelect.value;
  const studyOne = state.savedStudies.find((item) => item.id === studyOneId);
  const studyTwo = state.savedStudies.find((item) => item.id === studyTwoId);
  const result = computeIndirectComparison(studyOne, studyTwo);
  renderIndirectResult(result);
}

function renderIndirectResult(result) {
  if (!result) {
    elements.indirectResult.innerHTML = `
      <h3>No indirect comparison yet</h3>
      <p>Select two saved studies to estimate the indirect A vs C contrast.</p>
    `;
    return;
  }

  if (result.error) {
    elements.indirectResult.innerHTML = `
      <h3>Could not compute the indirect contrast</h3>
      <p>${escapeHtml(result.error)}</p>
    `;
    return;
  }

  elements.indirectResult.innerHTML = `
    <div class="meta-row">
      <span>Common comparator: ${escapeHtml(result.commonComparator)}</span>
      <span>${escapeHtml(result.studyLabels.join(" + "))}</span>
    </div>
    <h3>${escapeHtml(result.treatmentA)} vs ${escapeHtml(result.treatmentC)}</h3>
    <p>
      Indirect hazard ratio:
      <strong>${formatFixed(result.hr, 3)}</strong>
      with 95% CI
      <strong>${formatFixed(result.ciLow, 3)} to ${formatFixed(result.ciHigh, 3)}</strong>.
    </p>
    <p>
      z = <strong>${formatFixed(result.z, 3)}</strong>,
      p = <strong>${formatPValue(result.pValue)}</strong>,
      log(HR) = <strong>${formatFixed(result.logHR, 3)}</strong>.
    </p>
    <p class="field-hint">
      This uses the Bucher-style shared-comparator combination on the two saved study estimates.
    </p>
  `;
}

function renderCurrentStudy() {
  const study = state.currentStudy;
  if (!study) {
    return;
  }

  const summaryItems = [
    summaryCard("Log-rank p", formatPValue(study.metrics.pValue)),
    summaryCard("Chi-square", formatFixed(study.metrics.chiSquare, 3)),
    summaryCard(
      `Approx HR ${study.arms[0].label} vs ${study.arms[1].label}`,
      Number.isFinite(study.metrics.hr) ? formatFixed(study.metrics.hr, 3) : "NA",
    ),
    summaryCard("Pseudo-records", String(study.records.length)),
  ];
  if (Number.isFinite(study.reportedLogrank?.pValue)) {
    summaryItems.splice(1, 0, summaryCard("Figure-reported p", formatPValue(study.reportedLogrank.pValue)));
  }
  elements.summaryCards.innerHTML = summaryItems.join("");

  const armSummaryRows = study.arms
    .map(
      (arm) =>
        `<p><strong>${escapeHtml(arm.label)}</strong>: n≈${arm.estimated_n}, events≈${arm.estimated_events}, median≈${formatMaybe(
          study.metrics.medians[arm.label],
          study.timeUnit,
        )}</p>`,
    )
    .join("");

  elements.studySummary.innerHTML = `
    <div class="meta-row">
      <span>${escapeHtml(study.studyLabel)}</span>
      <span>${escapeHtml(study.timeUnit)}</span>
      <span>${escapeHtml(study.source?.model || "demo data")}</span>
    </div>
    <p class="field-hint">Two-arm log-rank test.</p>
    ${armSummaryRows}
    ${
      Number.isFinite(study.metrics.hr)
        ? `<p class="field-hint">Approximate hazard ratio for ${escapeHtml(study.arms[0].label)} vs ${escapeHtml(
            study.arms[1].label,
          )}: ${formatFixed(study.metrics.hr, 3)}.</p>`
        : ``
    }
    ${
      study.numbersAtRisk?.length
        ? `<p class="field-hint">Numbers at risk captured at ${study.numbersAtRisk.length} time points.</p>`
        : `<p class="field-hint">No numbers-at-risk rows were returned for this study.</p>`
    }
    ${
      Number.isFinite(study.reportedLogrank?.pValue)
        ? `<p class="field-hint">Figure-reported log-rank p: ${formatPValue(study.reportedLogrank.pValue)}${
            Number.isFinite(study.reportedLogrank?.chiSquare)
              ? `; chi-square ${formatFixed(study.reportedLogrank.chiSquare, 3)}`
              : ""
          }${
            Number.isFinite(study.reportedLogrank?.degreesFreedom)
              ? `; df ${study.reportedLogrank.degreesFreedom}`
              : ""
          }.</p>`
        : ``
    }
  `;

  renderList(elements.noteList, study.notes, "The model did not add any extraction notes.");
  renderList(elements.warningList, study.warnings, "No explicit warnings were returned.");
  renderEventTables(study);
  renderChart(study);
}

function renderEventTables(study) {
  elements.eventTableSplit.innerHTML = study.arms
    .map(
      (arm) => `
        <section class="arm-table">
          <h4>${escapeHtml(arm.label)}</h4>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Events</th>
                  <th>Censors</th>
                  <th>Survival</th>
                </tr>
              </thead>
              <tbody>
                ${renderEventTableBodyMarkup(study.eventTable.filter((row) => row.arm === arm.label))}
              </tbody>
            </table>
          </div>
        </section>
      `,
    )
    .join("");
}

function renderEventTableBodyMarkup(rows) {
  return rows
    .slice(0, 30)
    .map(
      (row) => `
        <tr>
          <td>${formatRoundedTime(row.time)}</td>
          <td>${row.event_count}</td>
          <td>${row.censor_count}</td>
          <td>${formatPercent(row.survival_after_time)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderList(target, items, fallbackText) {
  const safeItems = Array.isArray(items) && items.length ? items : [fallbackText];
  target.innerHTML = safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderStudyVault() {
  if (!state.savedStudies.length) {
    elements.studyVault.innerHTML = `
      <div class="vault-card animate-in">
        <h3>No saved studies yet</h3>
        <p>Extract a curve, load the demo study, and save it here so it can be reused for indirect comparisons.</p>
      </div>
    `;
    return;
  }

  elements.studyVault.innerHTML = state.savedStudies
    .map(
      (study) => `
        <article class="vault-card animate-in">
          <div class="meta-row">
            <span>${escapeHtml(study.timeUnit)}</span>
            <span>${escapeHtml(study.source?.model || "demo data")}</span>
          </div>
          <h3>${escapeHtml(study.studyLabel)}</h3>
          <p>${escapeHtml(`${study.arms[0].label} vs ${study.arms[1].label}`)}</p>
          <div class="meta-row">
            <span>p ${formatPValue(study.metrics.pValue)}</span>
            <span>Two-arm</span>
            <span>HR ${formatFixed(study.metrics.hr, 3)}</span>
          </div>
          <div class="button-row">
            <button class="button secondary" type="button" data-action="load" data-study-id="${escapeHtml(study.id)}">Load</button>
            <button class="button secondary" type="button" data-action="delete" data-study-id="${escapeHtml(study.id)}">Delete</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function populateStudySelects() {
  const placeholder = `<option value="">Select a saved study</option>`;
  const options = state.savedStudies
    .filter((study) => study.arms.length === 2)
    .map(
      (study) =>
        `<option value="${escapeHtml(study.id)}">${escapeHtml(study.studyLabel)} (${escapeHtml(
          `${study.arms[0].label} vs ${study.arms[1].label}`,
        )})</option>`,
    )
    .join("");

  elements.studyOneSelect.innerHTML = placeholder + options;
  elements.studyTwoSelect.innerHTML = placeholder + options;
}

function normalizeStudy(study) {
  const rawArms = Array.isArray(study.arms) && study.arms.length >= 2 ? study.arms : defaultArms(study);
  const arms = rawArms.slice(0, 2).map((arm, index) => ({
    label: String(arm.label || `Treatment ${String.fromCharCode(65 + index)}`).trim() || `Treatment ${String.fromCharCode(65 + index)}`,
    estimated_n: Number(arm.estimated_n || arm.estimatedN || 0),
    estimated_events: Number(arm.estimated_events || arm.estimatedEvents || 0),
  }));
  const allowed = new Set(arms.map((arm) => arm.label));
  const eventTable = Array.isArray(study.eventTable)
    ? study.eventTable.filter((row) => allowed.has(String(row.arm || "").trim()))
    : [];
  const records =
    Array.isArray(study.records) && study.records.length
      ? study.records.filter((row) => allowed.has(String(row.arm || "").trim()))
      : expandRecords(eventTable);
  const recordCounts = Object.fromEntries(arms.map((arm) => [arm.label, 0]));
  const eventCounts = Object.fromEntries(arms.map((arm) => [arm.label, 0]));

  for (const row of records) {
    if (!(row.arm in recordCounts)) {
      recordCounts[row.arm] = 0;
      eventCounts[row.arm] = 0;
    }
    recordCounts[row.arm] += 1;
    if (Number(row.event || 0) === 1) {
      eventCounts[row.arm] += 1;
    }
  }

  const normalized = {
    id: study.id || createId(),
    studyLabel: study.studyLabel || arms.map((arm) => arm.label).join(" vs "),
    arms: arms.map((arm) => ({
      label: arm.label,
      estimated_n: Math.max(Number(arm.estimated_n || arm.estimatedN || 0), recordCounts[arm.label] || 0),
      estimated_events: Math.max(
        Number(arm.estimated_events || arm.estimatedEvents || 0),
        eventCounts[arm.label] || 0,
      ),
    })),
    eventTable,
    records,
    numbersAtRisk: Array.isArray(study.numbersAtRisk)
      ? study.numbersAtRisk
          .map((row) => ({
            time: Number(row.time || 0),
            arm_counts: Array.isArray(row.arm_counts) ? row.arm_counts.slice(0, arms.length) : [],
          }))
          .filter((row) => row.arm_counts.length === arms.length)
      : [],
    reportedLogrank: study.reportedLogrank || null,
    notes: Array.isArray(study.notes) ? study.notes : [],
    warnings: Array.isArray(study.warnings) ? study.warnings : [],
    timeUnit: study.timeUnit || "months",
    source: study.source || { model: "demo data" },
  };

  const baselineCounts = normalized.numbersAtRisk[0]?.arm_counts || [];
  normalized.arms = normalized.arms.map((arm, index) => ({
    ...arm,
    estimated_n: Math.max(arm.estimated_n, Number(baselineCounts[index] || 0)),
  }));

  if (Array.isArray(study.arms) && study.arms.length > 2) {
    normalized.warnings = [
      "This version keeps only the first two arms and ignores any additional groups.",
      ...normalized.warnings,
    ];
  }

  const metrics = computeStudyMetrics(normalized);
  return { ...normalized, metrics };
}

function defaultArms(study) {
  const labels = [
    ...new Set([...(study.records || []).map((row) => row.arm), ...(study.eventTable || []).map((row) => row.arm)].filter(Boolean)),
  ];
  const finalLabels = [labels[0] || "Treatment A", labels[1] || "Treatment B"];
  return finalLabels.map((label) => ({ label, estimated_n: 0, estimated_events: 0 }));
}

function computeStudyMetrics(study) {
  const logRank = computeLogRank(study);
  const curves = buildDisplayCurves(study);
  const medians = Object.fromEntries(study.arms.map((arm) => [arm.label, estimateMedian(curves[arm.label])]));

  return {
    ...logRank,
    curves,
    medians,
    maxTime: Math.max(
      0,
      ...study.records.map((row) => Number(row.time || 0)),
      ...study.eventTable.map((row) => Number(row.time || 0)),
      ...study.numbersAtRisk.map((row) => Number(row.time || 0)),
    ),
  };
}

function buildDisplayCurves(study) {
  const byEventTable = buildCurvesFromEventTable(study.eventTable, study.arms);
  if (byEventTable) {
    return byEventTable;
  }
  return {
    [study.arms[0].label]: buildKaplanMeierCurve(study.records, study.arms[0].label),
    [study.arms[1].label]: buildKaplanMeierCurve(study.records, study.arms[1].label),
  };
}

function buildCurvesFromEventTable(eventTable, arms) {
  if (!Array.isArray(eventTable) || !eventTable.length) {
    return null;
  }

  const curves = {};
  for (const arm of arms) {
    const rows = eventTable
      .filter((row) => row.arm === arm.label)
      .map((row) => ({
        time: Number(row.time || 0),
        survival: Number(row.survival_after_time),
        censors: Number(row.censor_count || 0),
      }))
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.survival))
      .sort((a, b) => a.time - b.time);

    if (!rows.length) {
      return null;
    }

    const points = [{ time: 0, survival: 1 }];
    const censors = [];
    let previousSurvival = 1;

    for (const row of rows) {
      points.push({ time: row.time, survival: previousSurvival });
      points.push({ time: row.time, survival: clampProbability(row.survival) });
      previousSurvival = clampProbability(row.survival);

      for (let index = 0; index < row.censors; index += 1) {
        censors.push({ time: row.time, survival: previousSurvival });
      }
    }

    curves[arm.label] = { points, censors };
  }

  return curves;
}

function clampProbability(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function computeLogRank(study) {
  if (!Array.isArray(study.arms) || study.arms.length < 2) {
    return {
      chiSquare: NaN,
      pValue: NaN,
      degreesFreedom: NaN,
      hr: NaN,
      logHR: NaN,
      ciLow: NaN,
      ciHigh: NaN,
      z: NaN,
      variance: NaN,
      varLogHR: NaN,
    };
  }
  if (Array.isArray(study.eventTable) && study.eventTable.length) {
    if (Array.isArray(study.numbersAtRisk) && study.numbersAtRisk.length) {
      return computeLogRankFromCalibratedEventTable(study);
    }
    return computeLogRankFromEventTable(study.eventTable, study.arms);
  }
  return computeLogRankFromRecords(study.records, study.arms);
}

function computeLogRankFromCalibratedEventTable(study) {
  const labels = study.arms.map((arm) => arm.label);
  const slots = buildEventSlots(study.eventTable, study.arms).filter((slot) => sumArray(slot.events) > 0);
  const calibrations = study.arms.map((_, index) => buildRiskCalibration(study, index));

  const calibratedSlots = slots.map((slot) => ({
    ...slot,
    atRisk: slot.events.map((eventsAtTime, index) =>
      estimateAtRiskAtTime(calibrations[index], slot.time, eventsAtTime),
    ),
  }));

  return finalizeLogRankWithEstimatedRisk(calibratedSlots, labels);
}

function computeLogRankFromEventTable(eventTable, arms) {
  return finalizeLogRank(
    buildEventSlots(eventTable, arms),
    arms.map((arm) => Number(arm.estimated_n || 0)),
    arms.map((arm) => arm.label),
  );
}

function buildEventSlots(eventTable, arms) {
  const labels = arms.map((arm) => arm.label);
  const labelIndex = Object.fromEntries(labels.map((label, index) => [label, index]));
  const grouped = new Map();

  for (const row of eventTable) {
    if (!(row.arm in labelIndex)) {
      continue;
    }
    const key = Number(row.time || 0).toFixed(4);
    if (!grouped.has(key)) {
      grouped.set(key, {
        time: Number(row.time || 0),
        events: Array(labels.length).fill(0),
        censors: Array(labels.length).fill(0),
      });
    }
    const slot = grouped.get(key);
    const index = labelIndex[row.arm];
    slot.events[index] += Number(row.event_count || 0);
    slot.censors[index] += Number(row.censor_count || 0);
  }

  return [...grouped.values()].sort((a, b) => a.time - b.time);
}

function computeLogRankFromRecords(records, arms) {
  const labels = arms.map((arm) => arm.label);
  const labelIndex = Object.fromEntries(labels.map((label, index) => [label, index]));
  const filtered = records
    .filter((row) => row.arm in labelIndex)
    .map((row) => ({
      armIndex: labelIndex[row.arm],
      time: Number(row.time || 0),
      event: Number(row.event || 0),
    }))
    .sort((a, b) => a.time - b.time || b.event - a.event);

  const initialAtRisk = Array(labels.length).fill(0);
  for (const row of filtered) {
    initialAtRisk[row.armIndex] += 1;
  }

  const grouped = new Map();
  for (const row of filtered) {
    const key = row.time.toFixed(4);
    if (!grouped.has(key)) {
      grouped.set(key, {
        time: row.time,
        events: Array(labels.length).fill(0),
        censors: Array(labels.length).fill(0),
      });
    }
    const slot = grouped.get(key);
    if (row.event) {
      slot.events[row.armIndex] += 1;
    } else {
      slot.censors[row.armIndex] += 1;
    }
  }

  return finalizeLogRank([...grouped.values()].sort((a, b) => a.time - b.time), initialAtRisk, labels);
}

function finalizeLogRank(slots, initialAtRisk, labels) {
  const groupCount = labels.length;
  let atRisk = [...initialAtRisk];
  const observed = Array(groupCount).fill(0);
  const expected = Array(groupCount).fill(0);
  const covariance = Array.from({ length: groupCount }, () => Array(groupCount).fill(0));

  for (const slot of slots) {
    const totalAtRisk = sumArray(atRisk);
    const totalEvents = sumArray(slot.events);

    if (totalEvents > 0 && totalAtRisk > 1) {
      const factor = (totalEvents * (totalAtRisk - totalEvents)) / (totalAtRisk * totalAtRisk * (totalAtRisk - 1));

      for (let index = 0; index < groupCount; index += 1) {
        observed[index] += slot.events[index];
        expected[index] += (totalEvents * atRisk[index]) / totalAtRisk;
      }

      for (let rowIndex = 0; rowIndex < groupCount; rowIndex += 1) {
        for (let colIndex = 0; colIndex < groupCount; colIndex += 1) {
          const increment =
            rowIndex === colIndex
              ? factor * atRisk[rowIndex] * (totalAtRisk - atRisk[rowIndex])
              : -factor * atRisk[rowIndex] * atRisk[colIndex];
          covariance[rowIndex][colIndex] += Number.isFinite(increment) ? increment : 0;
        }
      }
    }

    atRisk = atRisk.map((value, index) => value - slot.events[index] - slot.censors[index]);
  }

  return summarizeLogRank(labels, observed, expected, covariance);
}

function finalizeLogRankWithEstimatedRisk(slots, labels) {
  const groupCount = labels.length;
  const observed = Array(groupCount).fill(0);
  const expected = Array(groupCount).fill(0);
  const covariance = Array.from({ length: groupCount }, () => Array(groupCount).fill(0));

  for (const slot of slots) {
    const atRisk = slot.atRisk.map((value, index) => Math.max(Number(value || 0), Number(slot.events[index] || 0)));
    const totalAtRisk = sumArray(atRisk);
    const totalEvents = sumArray(slot.events);

    if (totalEvents > 0 && totalAtRisk > 1) {
      const factor = (totalEvents * (totalAtRisk - totalEvents)) / (totalAtRisk * totalAtRisk * (totalAtRisk - 1));

      for (let index = 0; index < groupCount; index += 1) {
        observed[index] += slot.events[index];
        expected[index] += (totalEvents * atRisk[index]) / totalAtRisk;
      }

      for (let rowIndex = 0; rowIndex < groupCount; rowIndex += 1) {
        for (let colIndex = 0; colIndex < groupCount; colIndex += 1) {
          const increment =
            rowIndex === colIndex
              ? factor * atRisk[rowIndex] * (totalAtRisk - atRisk[rowIndex])
              : -factor * atRisk[rowIndex] * atRisk[colIndex];
          covariance[rowIndex][colIndex] += Number.isFinite(increment) ? increment : 0;
        }
      }
    }
  }

  return summarizeLogRank(labels, observed, expected, covariance);
}

function summarizeLogRank(labels, observed, expected, covariance) {
  const groupCount = labels.length;
  const oe = observed.map((value, index) => value - expected[index]);
  const degreesFreedom = Math.max(groupCount - 1, 1);
  const reducedVector = oe.slice(0, degreesFreedom);
  const reducedCovariance = covariance
    .slice(0, degreesFreedom)
    .map((row) => row.slice(0, degreesFreedom));
  const inverseCovariance = invertMatrix(reducedCovariance);
  const chiSquare = inverseCovariance ? quadForm(reducedVector, inverseCovariance) : NaN;
  const pValue = chiSquarePValue(chiSquare, degreesFreedom);

  let logHR = NaN;
  let variance = NaN;
  let se = NaN;
  let z = NaN;
  let hr = NaN;
  let ciLow = NaN;
  let ciHigh = NaN;
  let varLogHR = NaN;

  if (groupCount === 2) {
    variance = covariance[0][0];
    logHR = variance > 0 ? oe[0] / variance : NaN;
    se = variance > 0 ? 1 / Math.sqrt(variance) : NaN;
    z = variance > 0 ? logHR / se : NaN;
    hr = Number.isFinite(logHR) ? Math.exp(logHR) : NaN;
    ciLow = Number.isFinite(logHR) ? Math.exp(logHR - 1.96 * se) : NaN;
    ciHigh = Number.isFinite(logHR) ? Math.exp(logHR + 1.96 * se) : NaN;
    varLogHR = variance > 0 ? 1 / variance : NaN;
  }

  return {
    observedMinusExpected: Object.fromEntries(labels.map((label, index) => [label, oe[index]])),
    variance,
    logHR,
    varLogHR,
    hr,
    ciLow,
    ciHigh,
    chiSquare,
    pValue,
    z,
    degreesFreedom,
  };
}

function buildRiskCalibration(study, armIndex) {
  const label = study.arms[armIndex].label;
  const rows = study.eventTable
    .filter((row) => row.arm === label)
    .map((row) => ({
      time: Number(row.time || 0),
      event_count: Number(row.event_count || 0),
      censor_count: Number(row.censor_count || 0),
    }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => a.time - b.time);

  const baselineEstimate = Math.max(
    Number(study.arms[armIndex].estimated_n || 0),
    rows.reduce((total, row) => total + row.event_count + row.censor_count, 0),
  );

  const rawAnchors = (study.numbersAtRisk || [])
    .map((row) => ({
      time: Number(row.time || 0),
      count: Number((row.arm_counts || [])[armIndex]),
    }))
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.count))
    .sort((a, b) => a.time - b.time);

  const dedupedAnchors = [];
  for (const anchor of rawAnchors) {
    const normalized = { time: anchor.time, count: Math.max(0, Math.round(anchor.count)) };
    const last = dedupedAnchors[dedupedAnchors.length - 1];
    if (last && Math.abs(last.time - normalized.time) < 1e-9) {
      last.count = normalized.count;
    } else {
      dedupedAnchors.push(normalized);
    }
  }

  if (!dedupedAnchors.length || dedupedAnchors[0].time > 0) {
    dedupedAnchors.unshift({ time: 0, count: baselineEstimate });
  } else {
    dedupedAnchors[0].count = Math.max(dedupedAnchors[0].count, baselineEstimate);
  }

  const anchors = [];
  let runningCount = Number.POSITIVE_INFINITY;
  for (const anchor of dedupedAnchors) {
    runningCount = Math.min(runningCount, anchor.count);
    anchors.push({ time: anchor.time, count: runningCount });
  }

  return { rows, anchors };
}

function estimateAtRiskAtTime(calibration, time, eventsAtTime) {
  const { rows, anchors } = calibration;
  let startIndex = 0;
  for (let index = 0; index < anchors.length; index += 1) {
    if (anchors[index].time <= time) {
      startIndex = index;
    } else {
      break;
    }
  }

  const start = anchors[startIndex];
  const end = anchors[startIndex + 1] || null;
  const exactEventsBefore = rows
    .filter((row) => row.time >= start.time && row.time < time)
    .reduce((total, row) => total + row.event_count, 0);
  const exactCensorsBefore = rows
    .filter((row) => row.time >= start.time && row.time < time)
    .reduce((total, row) => total + row.censor_count, 0);

  let uniformExtraCensorsBefore = 0;
  if (end && end.time > start.time) {
    const intervalRows = rows.filter((row) => row.time >= start.time && row.time < end.time);
    const intervalEvents = intervalRows.reduce((total, row) => total + row.event_count, 0);
    const intervalCensors = intervalRows.reduce((total, row) => total + row.censor_count, 0);
    const targetRemovals = Math.max(0, start.count - end.count);
    const extraCensors = Math.max(0, targetRemovals - intervalEvents - intervalCensors);
    const position = (time - start.time) / (end.time - start.time);
    uniformExtraCensorsBefore = extraCensors * Math.max(0, Math.min(1, position));
  }

  const atRisk = start.count - exactEventsBefore - exactCensorsBefore - uniformExtraCensorsBefore;
  return Math.max(Number(eventsAtTime || 0), atRisk);
}

function buildKaplanMeierCurve(records, arm) {
  const series = records
    .filter((row) => row.arm === arm)
    .map((row) => ({ time: Number(row.time || 0), event: Number(row.event || 0) }))
    .sort((a, b) => a.time - b.time || b.event - a.event);

  const grouped = groupByTime(series);
  let atRisk = series.length;
  let survival = 1;
  const points = [{ time: 0, survival: 1 }];
  const censors = [];

  for (const slot of grouped) {
    if (slot.events > 0 && atRisk > 0) {
      points.push({ time: slot.time, survival });
      survival *= 1 - slot.events / atRisk;
      points.push({ time: slot.time, survival });
    }

    for (let index = 0; index < slot.censors; index += 1) {
      censors.push({ time: slot.time, survival });
    }

    atRisk -= slot.events + slot.censors;
  }

  const lastTime = grouped.length ? grouped[grouped.length - 1].time : 0;
  points.push({ time: lastTime, survival });
  return { points, censors };
}

function groupByTime(records) {
  const map = new Map();
  for (const row of records) {
    const key = row.time.toFixed(4);
    if (!map.has(key)) {
      map.set(key, { time: row.time, events: 0, censors: 0 });
    }
    const slot = map.get(key);
    if (row.event) {
      slot.events += 1;
    } else {
      slot.censors += 1;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

function estimateMedian(curve) {
  for (const point of curve.points) {
    if (point.survival <= 0.5) {
      return point.time;
    }
  }
  return NaN;
}

function renderChart(study) {
  const svg = elements.survivalChart;
  const width = 760;
  const height = 420;
  const margin = { top: 26, right: 26, bottom: 52, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxTime = Math.max(study.metrics.maxTime, 1);
  const palette = getCurvePalette(study.arms.length);
  const curves = study.arms.map((arm, index) => ({
    label: arm.label,
    color: palette[index % palette.length],
    curve: extendCurve(study.metrics.curves[arm.label], maxTime),
  }));

  const x = (time) => margin.left + (time / maxTime) * plotWidth;
  const y = (survival) => margin.top + (1 - survival) * plotHeight;

  const horizontalGrid = Array.from({ length: 6 }, (_, index) => index / 5);
  const verticalGrid = Array.from({ length: 6 }, (_, index) => (maxTime * index) / 5);
  const legendWidth = 190;
  const legendHeight = 16 + curves.length * 24;
  const legendX = margin.left + plotWidth - legendWidth - 12;
  const legendY = margin.top + 18;

  svg.innerHTML = `
    <rect class="chart-frame" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" rx="20"></rect>
    ${horizontalGrid
      .map(
        (tick) => `
          <line class="chart-grid" x1="${margin.left}" x2="${margin.left + plotWidth}" y1="${y(tick)}" y2="${y(tick)}"></line>
          <text class="chart-axis" x="${margin.left - 12}" y="${y(tick) + 5}" text-anchor="end">${Math.round(
            tick * 100,
          )}</text>
        `,
      )
      .join("")}
    ${verticalGrid
      .map(
        (tick) => `
          <line class="chart-grid" y1="${margin.top}" y2="${margin.top + plotHeight}" x1="${x(tick)}" x2="${x(tick)}"></line>
          <text class="chart-axis" x="${x(tick)}" y="${margin.top + plotHeight + 24}" text-anchor="middle">${formatFixed(tick, 1)}</text>
        `,
      )
      .join("")}
    <rect x="${legendX - 12}" y="${legendY - 14}" width="${legendWidth}" height="${legendHeight}" rx="18" fill="rgba(255, 252, 247, 0.92)" stroke="rgba(29, 26, 23, 0.1)"></rect>
    ${curves
      .map(
        ({ label, color, curve }, index) => `
          <path d="${toSvgPath(curve.points, x, y)}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></path>
          ${renderCensors(curve.censors, x, y, color)}
          <line x1="${legendX}" x2="${legendX + 42}" y1="${legendY + index * 24}" y2="${legendY + index * 24}" stroke="${color}" stroke-width="4" stroke-linecap="round"></line>
          <text class="legend-chip" x="${legendX + 52}" y="${legendY + 5 + index * 24}">${escapeHtml(label)}</text>
        `,
      )
      .join("")}
    <text class="chart-axis" x="${margin.left + plotWidth / 2}" y="${height - 10}" text-anchor="middle">Time (${escapeHtml(study.timeUnit)})</text>
    <text class="chart-axis" x="18" y="${margin.top + plotHeight / 2}" text-anchor="middle" transform="rotate(-90 18 ${margin.top + plotHeight / 2})">Survival rate (%)</text>
  `;
}

function extendCurve(curve, maxTime) {
  const points = [...curve.points];
  const lastPoint = points[points.length - 1] || { time: 0, survival: 1 };
  if (lastPoint.time < maxTime) {
    points.push({ time: maxTime, survival: lastPoint.survival });
  }
  return { ...curve, points };
}

function renderCensors(censors, x, y, color) {
  return censors
    .map((mark) => {
      const cx = x(mark.time);
      const cy = y(mark.survival);
      return `
        <line x1="${cx - 5}" y1="${cy - 5}" x2="${cx + 5}" y2="${cy + 5}" stroke="${color}" stroke-width="2.5"></line>
        <line x1="${cx - 5}" y1="${cy + 5}" x2="${cx + 5}" y2="${cy - 5}" stroke="${color}" stroke-width="2.5"></line>
      `;
    })
    .join("");
}

function getCurvePalette(count) {
  const palette = ["#b1442d", "#135c66", "#c1892f", "#3e6fb4", "#7e4ca5", "#2f7d4f"];
  return palette.slice(0, Math.max(count, 2));
}

function toSvgPath(points, x, y) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.time).toFixed(2)} ${y(point.survival).toFixed(2)}`)
    .join(" ");
}

function expandRecords(eventTable) {
  const records = [];
  for (const row of eventTable || []) {
    for (let index = 0; index < Number(row.event_count || 0); index += 1) {
      records.push({ arm: row.arm, time: Number(row.time || 0), event: 1 });
    }
    for (let index = 0; index < Number(row.censor_count || 0); index += 1) {
      records.push({ arm: row.arm, time: Number(row.time || 0), event: 0 });
    }
  }
  return records.sort((a, b) => a.time - b.time || b.event - a.event);
}

function computeIndirectComparison(studyOne, studyTwo) {
  if (!studyOne || !studyTwo) {
    return { error: "Choose two saved studies first." };
  }
  if (studyOne.id === studyTwo.id) {
    return { error: "Pick two different studies for the indirect comparison." };
  }

  const labelsOne = studyOne.arms.map((arm) => arm.label);
  const labelsTwo = studyTwo.arms.map((arm) => arm.label);
  const shared = uniqueByNormalized(labelsOne.filter((label) => labelsTwo.some((other) => sameTerm(label, other))));

  if (shared.length !== 1) {
    return { error: "The selected studies must share exactly one treatment name." };
  }

  const commonComparator = shared[0];
  const treatmentA = labelsOne.find((label) => !sameTerm(label, commonComparator));
  const treatmentC = labelsTwo.find((label) => !sameTerm(label, commonComparator));

  if (!treatmentA || !treatmentC) {
    return { error: "Could not determine the outer treatments from the saved studies." };
  }

  const logHRAB = orientLogHr(studyOne, treatmentA, commonComparator);
  const logHRBC = orientLogHr(studyTwo, commonComparator, treatmentC);
  const varAB = studyOne.metrics.varLogHR;
  const varBC = studyTwo.metrics.varLogHR;

  if (![logHRAB, logHRBC, varAB, varBC].every(Number.isFinite)) {
    return { error: "One of the saved studies does not have a usable hazard-ratio estimate." };
  }

  const logHR = logHRAB + logHRBC;
  const variance = varAB + varBC;
  const se = Math.sqrt(variance);
  const z = logHR / se;
  const pValue = erfc(Math.abs(z) / Math.SQRT2);

  return {
    studyLabels: [studyOne.studyLabel, studyTwo.studyLabel],
    commonComparator,
    treatmentA,
    treatmentC,
    logHR,
    hr: Math.exp(logHR),
    ciLow: Math.exp(logHR - 1.96 * se),
    ciHigh: Math.exp(logHR + 1.96 * se),
    z,
    pValue,
  };
}

function orientLogHr(study, numerator, denominator) {
  const [armA, armB] = study.arms.map((arm) => arm.label);
  if (sameTerm(armA, numerator) && sameTerm(armB, denominator)) {
    return study.metrics.logHR;
  }
  if (sameTerm(armA, denominator) && sameTerm(armB, numerator)) {
    return -study.metrics.logHR;
  }
  return NaN;
}

function sameTerm(left, right) {
  return normalizeTerm(left) === normalizeTerm(right);
}

function normalizeTerm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function uniqueByNormalized(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = normalizeTerm(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}

function setStatus(type, text) {
  elements.extractStatus.className = `status-pill ${type}`;
  elements.extractStatus.textContent = text;
}

async function postJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (window.location.protocol === "file:") {
      throw new Error("This page is opened with file://, so backend API calls cannot work. Start server.py and use http://127.0.0.1:8000");
    }
    throw new Error("Could not reach the backend API. Make sure server.py is running.");
  }

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    throw new Error("The backend returned an unreadable response.");
  }
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function summaryCard(label, value) {
  return `
    <div class="summary-card animate-in">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
    </div>
  `;
}

function formatFixed(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "NA";
}

function formatRoundedTime(value) {
  return Number.isFinite(value) ? String(Math.round(Number(value))) : "NA";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${(Number(value) * 100).toFixed(1)}%` : "NA";
}

function formatMaybe(value, unit) {
  if (!Number.isFinite(value)) {
    return "not reached";
  }
  return `${Number(value).toFixed(1)} ${unit}`;
}

function formatPValue(value) {
  if (!Number.isFinite(value)) {
    return "NA";
  }
  if (value < 0.001) {
    return "<0.001";
  }
  return value.toFixed(3);
}

function trimText(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 1)}…`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createId() {
  return `study-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function erf(value) {
  const sign = value >= 0 ? 1 : -1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return sign * y;
}

function erfc(value) {
  return 1 - erf(value);
}

function sumArray(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function quadForm(vector, matrix) {
  let total = 0;
  for (let row = 0; row < vector.length; row += 1) {
    for (let col = 0; col < vector.length; col += 1) {
      total += vector[row] * matrix[row][col] * vector[col];
    }
  }
  return total;
}

function invertMatrix(matrix) {
  const size = matrix.length;
  if (!size) {
    return null;
  }

  const augmented = matrix.map((row, rowIndex) => [
    ...row.map((value) => Number(value || 0)),
    ...Array.from({ length: size }, (_, colIndex) => (rowIndex === colIndex ? 1 : 0)),
  ]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow][pivot]) < 1e-10) {
      return null;
    }

    if (maxRow !== pivot) {
      [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    }

    const divisor = augmented[pivot][pivot];
    for (let col = 0; col < size * 2; col += 1) {
      augmented[pivot][col] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = augmented[row][pivot];
      for (let col = 0; col < size * 2; col += 1) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row.slice(size));
}

function chiSquarePValue(chiSquare, degreesFreedom) {
  if (!Number.isFinite(chiSquare) || !Number.isFinite(degreesFreedom) || degreesFreedom <= 0) {
    return NaN;
  }
  return regularizedGammaQ(degreesFreedom / 2, chiSquare / 2);
}

function regularizedGammaQ(a, x) {
  if (x < 0 || a <= 0) {
    return NaN;
  }
  if (x === 0) {
    return 1;
  }
  if (x < a + 1) {
    return 1 - regularizedGammaPSeries(a, x);
  }
  return regularizedGammaQContinuedFraction(a, x);
}

function regularizedGammaPSeries(a, x) {
  const gln = gammaLn(a);
  let sum = 1 / a;
  let delta = sum;
  let ap = a;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    ap += 1;
    delta *= x / ap;
    sum += delta;
    if (Math.abs(delta) < Math.abs(sum) * 1e-12) {
      break;
    }
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

function regularizedGammaQContinuedFraction(a, x) {
  const gln = gammaLn(a);
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;

  for (let iteration = 1; iteration <= 100; iteration += 1) {
    const an = -iteration * (iteration - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) {
      d = 1e-30;
    }
    c = b + an / c;
    if (Math.abs(c) < 1e-30) {
      c = 1e-30;
    }
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) {
      break;
    }
  }

  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

function gammaLn(value) {
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ];
  let x = value;
  let y = value;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const coefficient of cof) {
    y += 1;
    ser += coefficient / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function loadDemoStudy(options = {}) {
  const { statusText = "Demo study loaded" } = options;
  const [demoStudy] = buildDemoStudies();
  state.currentStudy = demoStudy;
  syncArmInputsFromStudy(demoStudy);
  elements.studyLabel.value = demoStudy.studyLabel;
  elements.timeUnit.value = demoStudy.timeUnit;
  elements.xAxisMax.value = String(Math.ceil(demoStudy.metrics.maxTime));
  elements.numbersAtRisk.value = DEFAULT_EXAMPLE_FORM.numbersAtRisk;
  elements.studyContext.value = DEFAULT_EXAMPLE_FORM.studyContext;
  elements.curveImage.value = "";
  state.imageDataUrl = DEFAULT_EXAMPLE_IMAGE;
  updatePreview(DEFAULT_EXAMPLE_IMAGE);
  renderCurrentStudy();
  elements.resultsSection.classList.remove("hidden");
  setStatus("success", statusText);
}

function buildDemoStudies() {
  const studyOne = normalizeStudy({
    studyLabel: "Demo Kaplan-Meier Example",
    arms: [
      { label: "Group 1 (low risk)", estimated_n: 112, estimated_events: 37 },
      { label: "Group 2 (high risk)", estimated_n: 103, estimated_events: 64 },
    ],
    eventTable: [
      { arm: "Group 1 (low risk)", time: 5, event_count: 4, censor_count: 0, survival_after_time: 0.96 },
      { arm: "Group 2 (high risk)", time: 4, event_count: 15, censor_count: 0, survival_after_time: 0.85 },
      { arm: "Group 1 (low risk)", time: 12, event_count: 2, censor_count: 0, survival_after_time: 0.94 },
      { arm: "Group 2 (high risk)", time: 9, event_count: 7, censor_count: 0, survival_after_time: 0.79 },
      { arm: "Group 1 (low risk)", time: 19, event_count: 3, censor_count: 0, survival_after_time: 0.91 },
      { arm: "Group 2 (high risk)", time: 13, event_count: 9, censor_count: 0, survival_after_time: 0.71 },
      { arm: "Group 1 (low risk)", time: 26, event_count: 3, censor_count: 0, survival_after_time: 0.88 },
      { arm: "Group 2 (high risk)", time: 19, event_count: 8, censor_count: 0, survival_after_time: 0.63 },
      { arm: "Group 1 (low risk)", time: 36, event_count: 8, censor_count: 0, survival_after_time: 0.80 },
      { arm: "Group 2 (high risk)", time: 25, event_count: 10, censor_count: 0, survival_after_time: 0.54 },
      { arm: "Group 1 (low risk)", time: 40, event_count: 7, censor_count: 0, survival_after_time: 0.72 },
      { arm: "Group 2 (high risk)", time: 31, event_count: 9, censor_count: 0, survival_after_time: 0.43 },
      { arm: "Group 1 (low risk)", time: 47, event_count: 6, censor_count: 0, survival_after_time: 0.66 },
      { arm: "Group 2 (high risk)", time: 35, event_count: 6, censor_count: 0, survival_after_time: 0.33 },
      { arm: "Group 1 (low risk)", time: 50, event_count: 5, censor_count: 0, survival_after_time: 0.59 },
      { arm: "Group 2 (high risk)", time: 38, event_count: 5, censor_count: 0, survival_after_time: 0.23 },
      { arm: "Group 1 (low risk)", time: 59, event_count: 3, censor_count: 0, survival_after_time: 0.55 },
      { arm: "Group 2 (high risk)", time: 44, event_count: 3, censor_count: 0, survival_after_time: 0.14 },
      { arm: "Group 1 (low risk)", time: 62, event_count: 2, censor_count: 0, survival_after_time: 0.50 },
      { arm: "Group 2 (high risk)", time: 50, event_count: 2, censor_count: 0, survival_after_time: 0.10 },
    ],
    numbersAtRisk: [
      { time: 0, arm_counts: [112, 103] },
      { time: 10, arm_counts: [95, 80] },
      { time: 20, arm_counts: [90, 63] },
      { time: 30, arm_counts: [85, 50] },
      { time: 40, arm_counts: [79, 23] },
      { time: 50, arm_counts: [56, 10] },
      { time: 60, arm_counts: [53, 7] },
      { time: 70, arm_counts: [50, 6] },
    ],
    notes: [
      "This built-in demo study matches the default Kaplan-Meier example shown on the homepage.",
      "Group 1 stays above Group 2 throughout follow-up and retains a higher survival probability.",
    ],
    warnings: ["This example is preloaded for demonstration and remains editable if the user uploads a new figure."],
    timeUnit: "months",
    source: { model: "demo generator" },
  });

  return [studyOne];
}

function syncArmInputsFromStudy(study) {
  if (!study || !Array.isArray(study.arms) || study.arms.length < 2) {
    return;
  }
  elements.leftArm.value = study.arms[0].label;
  elements.rightArm.value = study.arms[1].label;
}

initialize();
