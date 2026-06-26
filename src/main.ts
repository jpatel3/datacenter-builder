import {
  catalog, evaluateBuild, evaluateAgainstWorkload, PRICING_DISCLAIMER, LAST_UPDATED,
} from "./sim";
import type { Build, Category, Metrics, Modality, Workload } from "./sim";
import {
  course, checkSuccess, currentBlock, unlockedComponents, completeBlock, courseProgressPct, locateBlock, flattenBlocks,
} from "./curriculum";
import type { Block, Progress } from "./curriculum";
import { iconFor, iconForCategory } from "./ui/icons";
import { buildFlowModel } from "./ui/flow";
import type { FlowModel, FlowNodeId } from "./ui/flow";

// ---- state ----
const build: Build = { components: [], connections: [] };
let counter = 0;
let mode: "learn" | "sandbox" = (localStorage.getItem("dcb-mode") as "learn" | "sandbox") || "learn";
let progress: Progress = loadProgress();
let viewIndex = 0;
const answeredCorrect = new Set<string>();

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem("dcb-progress");
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* ignore */
  }
  return { completedBlockIds: [] };
}
function saveProgress() { localStorage.setItem("dcb-progress", JSON.stringify(progress)); }
function saveMode() { localStorage.setItem("dcb-mode", mode); }

// ---- sandbox scenarios ----
interface Scenario { id: string; label: string; modality: Modality; workload: Workload | null; }
const SCENARIOS: Scenario[] = [
  { id: "free-text", label: "Free build — text workload", modality: "text", workload: null },
  { id: "free-image", label: "Free build — image workload", modality: "image", workload: null },
  { id: "chatgpt", label: "Serve ChatGPT — text inference, 5,000 q/s", modality: "text",
    workload: { type: "inference", modality: "text", model: "ChatGPT", qpsTarget: 5000 } },
  { id: "midjourney", label: "Serve Midjourney — image, 50 img/s", modality: "image",
    workload: { type: "inference", modality: "image", model: "Midjourney", qpsTarget: 50 } },
  { id: "train", label: "Train a Llama-ish model", modality: "text",
    workload: { type: "training", modality: "text", modelSizeB: 8, targetThroughput: 2500 } },
];
let scenarioId = SCENARIOS[0].id;
let lastHint = "";

// ---- helpers ----
const CATEGORY_ORDER: Category[] = ["accelerator", "cpu", "server", "rack", "power", "cooling", "network", "space"];
const CATEGORY_LABEL: Record<Category, string> = {
  accelerator: "Chips (accelerators)", cpu: "CPUs", server: "Servers", rack: "Racks",
  power: "Power", cooling: "Cooling", network: "Networking", space: "Space / land",
};
const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number, d = 0) => (!Number.isFinite(n) ? "∞" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
const money = (n: number) => (!Number.isFinite(n) ? "∞" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }));
const typeOf = (id: string) => catalog.find((c) => c.id === id);

const allBlocks = () => flattenBlocks(course);
function frontierIndex(): number {
  const cur = currentBlock(course, progress);
  const all = allBlocks();
  return cur ? all.findIndex((b) => b.id === cur.id) : all.length;
}
function clampView() {
  const f = frontierIndex();
  if (viewIndex > f) viewIndex = f;
  if (viewIndex < 0) viewIndex = 0;
}
function satisfied(block: Block): boolean {
  if (block.type === "teach") return true;
  if (block.type === "reflect") return answeredCorrect.has(block.id) || progress.completedBlockIds.includes(block.id);
  if (block.successCheck) return checkSuccess(block.successCheck, build, block);
  return true;
}

function rewirePower() {
  const firstPower = build.components.find((c) => typeOf(c.typeId)?.category === "power");
  build.connections = [];
  if (!firstPower) return;
  for (const c of build.components) {
    const cat = typeOf(c.typeId)?.category;
    if (cat === "accelerator" || cat === "server") {
      build.connections.push({ from: c.instanceId, to: firstPower.instanceId, kind: "power" });
    }
  }
}
function addComponent(typeId: string) {
  build.components.push({ instanceId: `i${counter++}`, typeId, position: { x: 0, y: 0 } });
  rewirePower(); lastHint = ""; render();
}
function removeComponent(instanceId: string) {
  build.components = build.components.filter((c) => c.instanceId !== instanceId);
  rewirePower(); render();
}

// ---- shelf ----
function renderShelf() {
  const el = $("shelf"); el.innerHTML = "";
  const allowed = mode === "learn" ? unlockedComponents(course, progress) : null;
  for (const cat of CATEGORY_ORDER) {
    const parts = catalog.filter((c) => c.category === cat && (!allowed || allowed.has(c.id)));
    if (!parts.length) continue;
    const wrap = document.createElement("div"); wrap.className = "cat";
    wrap.innerHTML = `<h3>${CATEGORY_LABEL[cat]}</h3>`;
    for (const p of parts) {
      const rowD = document.createElement("div"); rowD.className = "shelf-row";
      const b = document.createElement("button"); b.className = "add";
      const watt = p.powerDraw ? `${fmt(p.powerDraw)}W · ` : "";
      b.innerHTML = `<span class="ico">${iconFor(p)}</span><span class="nm">${p.name}</span><small>${watt}${money(p.capex)}</small>`;
      b.onclick = () => addComponent(p.id);
      const info = document.createElement("button"); info.className = "info"; info.textContent = "ⓘ"; info.title = "Details";
      info.onclick = () => openDetail(p.id);
      rowD.appendChild(b); rowD.appendChild(info);
      wrap.appendChild(rowD);
    }
    el.appendChild(wrap);
  }
  if (allowed && !allowed.size) el.innerHTML = `<div class="empty">Parts unlock as you progress.</div>`;
}

// ---- build list ----
function renderBuild() {
  const el = $("build");
  if (!build.components.length) { el.innerHTML = `<div class="empty">Empty — add some parts.</div>`; return; }
  el.innerHTML = "";
  for (const c of build.components) {
    const t = typeOf(c.typeId);
    const row = document.createElement("div"); row.className = "row";
    const ico = t ? `<span class="ico">${iconFor(t)}</span>` : "";
    row.innerHTML = `<span class="label">${ico}${t?.name ?? c.typeId}</span>`;
    const btn = document.createElement("button"); btn.textContent = "✕"; btn.title = "Remove";
    btn.onclick = () => removeComponent(c.instanceId);
    row.appendChild(btn); el.appendChild(row);
  }
}

// ---- middle ----
function renderMiddle() {
  const scenarioWrap = $("scenario-wrap");
  const lessonWrap = $("lesson");
  if (mode === "sandbox") {
    scenarioWrap.style.display = ""; lessonWrap.style.display = "none";
    renderScenarioSelect();
  } else {
    scenarioWrap.style.display = "none"; lessonWrap.style.display = "";
    renderLesson();
  }
}

function renderScenarioSelect() {
  const el = $("scenario") as HTMLSelectElement;
  if (!el.options.length) {
    for (const s of SCENARIOS) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.label; el.appendChild(o); }
    el.onchange = () => { scenarioId = el.value; render(); };
  }
  el.value = scenarioId;
}

function renderLesson() {
  const el = $("lesson");
  const all = allBlocks();
  const f = frontierIndex();
  clampView();
  if (f >= all.length) {
    el.innerHTML = `<div class="kind">Course complete</div><h3>🎉 You finished the foundations!</h3>
      <p class="sub">You've covered chips, power, cooling, and why training needs a network. Jump into Sandbox to build freely.</p>
      <div class="navfoot"><button id="to-sandbox">Open Sandbox</button></div>`;
    ($("to-sandbox") as HTMLButtonElement).onclick = () => setMode("sandbox");
    return;
  }
  const block = all[viewIndex];
  const pos = locateBlock(course, block.id)!;
  const reviewing = viewIndex < f;
  const fillPct = ((pos.stepIndex + 1) / pos.stepCount) * 100;

  let html = `<div class="crumb">${pos.moduleTitle} › ${pos.lessonTitle}</div>`;
  html += `<div class="step">Step ${pos.stepIndex + 1} of ${pos.stepCount}${reviewing ? " · review" : ""}</div>`;
  html += `<div class="bar"><div class="fill" style="width:${fillPct}%"></div></div>`;
  html += `<div class="kind">${block.type}</div><h3>${block.title}</h3><p>${block.body}</p>`;

  if (block.unlocks?.length) {
    const cards = block.unlocks
      .map((id) => typeOf(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => `<div class="u"><span class="ico">${iconFor(t)}</span>${t.name}</div>`)
      .join("");
    if (cards) html += `<div class="unlocked-row">${cards}</div>`;
  }

  if (block.type === "reflect" && block.quiz) {
    const answered = satisfied(block);
    html += `<div class="quiz">` + block.quiz.options.map((o, i) => {
      const correct = i === block.quiz!.answerIndex;
      const mark = answered && correct ? " ✓" : "";
      return `<button data-i="${i}"${answered ? " disabled" : ""}>${o}${mark}</button>`;
    }).join("") + `</div>`;
  }

  if ((block.type === "task" || block.type === "challenge") && !reviewing && satisfied(block)) {
    html += `<div class="done">✓ requirement met</div>`;
  }
  if (lastHint) html += `<div class="hint">💡 ${lastHint}</div>`;

  const nextEnabled = reviewing || satisfied(block);
  const showHint = (block.type === "task" || block.type === "challenge") && !reviewing;
  html += `<div class="navfoot">
    <button class="ghost" id="nav-prev"${viewIndex === 0 ? " disabled" : ""}>← Previous</button>
    <span style="flex:1"></span>
    ${showHint ? `<button class="ghost" id="nav-hint">Hint</button>` : ""}
    <button id="nav-next"${nextEnabled ? "" : " disabled"}>Next →</button>
  </div>`;
  el.innerHTML = html;

  if (block.type === "reflect" && block.quiz) {
    el.querySelectorAll<HTMLButtonElement>(".quiz button").forEach((qb) => {
      qb.onclick = () => {
        const i = Number(qb.dataset.i);
        if (i === block.quiz!.answerIndex) { answeredCorrect.add(block.id); lastHint = ""; }
        else lastHint = "Not quite — try again.";
        render();
      };
    });
  }
  const prev = document.getElementById("nav-prev");
  if (prev) prev.onclick = () => { viewIndex = Math.max(0, viewIndex - 1); lastHint = ""; render(); };
  const hintBtn = document.getElementById("nav-hint");
  if (hintBtn) hintBtn.onclick = () => { lastHint = computeHint(block); render(); };
  const next = document.getElementById("nav-next");
  if (next) next.onclick = () => {
    if (viewIndex < f) { viewIndex++; lastHint = ""; render(); }
    else { progress = completeBlock(progress, block.id); saveProgress(); viewIndex = frontierIndex(); lastHint = ""; render(); }
  };
}

function computeHint(block: Block): string {
  if (!block.hints?.length) return "Check the requirement in the task description.";
  if (block.workload) {
    const r = evaluateAgainstWorkload(build, block.workload);
    const keyed = block.hints.find((h) => h.when && h.when === r.bottleneck);
    if (keyed) return keyed.text;
  }
  const m = evaluateBuild(build);
  const err = m.violations.find((v) => v.severity === "error");
  if (err) {
    const map: Record<string, string> = {
      "power-deficit": "power", "unpowered-component": "power", "overheating": "cooling",
    };
    const bn = map[err.code];
    const keyed = block.hints.find((h) => h.when === bn);
    if (keyed) return keyed.text;
  }
  return block.hints[0].text;
}

// ---- readout ----
function activeWorkload(): { workload: Workload | null; modality: Modality } {
  if (mode === "sandbox") {
    const s = SCENARIOS.find((x) => x.id === scenarioId)!;
    return { workload: s.workload, modality: s.modality };
  }
  const block = currentBlock(course, progress);
  if (block?.workload) return { workload: block.workload, modality: block.workload.modality };
  return { workload: null, modality: "text" };
}

function metricsForActive(): Metrics {
  const { workload, modality } = activeWorkload();
  return workload ? evaluateAgainstWorkload(build, workload).metrics : evaluateBuild(build, { modality });
}

function renderReadout() {
  const { workload, modality } = activeWorkload();
  let metrics: Metrics; const resultEl = $("result");
  if (workload) {
    const r = evaluateAgainstWorkload(build, workload); metrics = r.metrics;
    resultEl.className = `result ${r.passed ? "pass" : "fail"}`;
    const bn = r.bottleneck ? ` · limited by <code>${r.bottleneck}</code>` : "";
    resultEl.innerHTML = `${r.passed ? "✅ Goal met" : "❌ Not yet"} — score ${r.score}/100<div class="sub">${bn}</div>`;
  } else {
    metrics = evaluateBuild(build, { modality }); resultEl.className = "";
    resultEl.innerHTML = `<div class="sub">Free build — modality <code>${modality}</code></div>`;
  }
  const unit = metrics.compute.modality === "image" ? "img/s" : "tok/s";
  const perUnit = metrics.compute.modality === "image" ? "per M images" : "per M tokens";
  const rows: [string, string][] = [
    ["Power draw", `${fmt(metrics.power.drawKW, 1)} kW`],
    ["Power supply", `${fmt(metrics.power.supplyKW, 1)} kW · ${metrics.power.redundancy}`],
    ["Heat / cooling", `${fmt(metrics.thermal.heatKW, 1)} / ${fmt(metrics.thermal.coolingKW, 1)} kW`],
    ["Network", `${fmt(metrics.network.bisectionGbps)} Gbps · ${metrics.network.clusterConnected ? "clustered" : "not clustered"}`],
    ["Training throughput", `${fmt(metrics.compute.trainingThroughput)}`],
    ["Inference throughput", `${fmt(metrics.compute.inferenceThroughput)} ${unit}`],
    ["Capex", money(metrics.cost.capex)],
    ["Opex / month", money(metrics.cost.opexPerMonth)],
    [`Cost ${perUnit}`, money(metrics.cost.costPerMillionTokens)],
    ["Footprint", `${fmt(metrics.space.usedSqM, 1)} m²`],
  ];
  $("metrics").innerHTML = rows.map(([k, v]) => `<div class="metric"><span class="sub">${k}</span><span>${v}</span></div>`).join("");
  const vEl = $("violations");
  vEl.innerHTML = !metrics.violations.length
    ? `<div class="sub">No issues. 🎉</div>`
    : metrics.violations.map((v) => `<div class="viol ${v.severity}">${v.severity === "error" ? "⛔" : "⚠️"} ${v.message}</div>`).join("");
}

// ---- infra board ----
const NODE_POS: Record<FlowNodeId, { x: number; y: number }> = {
  power: { x: 8, y: 85 }, compute: { x: 225, y: 85 }, network: { x: 442, y: 18 }, cooling: { x: 442, y: 152 },
};
const NW = 150, NH = 60;
const NODE_CAT: Record<FlowNodeId, Category> = {
  power: "power", compute: "accelerator", network: "network", cooling: "cooling",
};
const KIND_COLOR: Record<string, string> = { power: "#f2c744", network: "#4ea1ff", heat: "#f85149" };
const center = (id: FlowNodeId) => ({ x: NODE_POS[id].x + NW / 2, y: NODE_POS[id].y + NH / 2 });

function renderFlowSVG(model: FlowModel): string {
  const edges = model.edges.map((e) => {
    const a = center(e.from), b = center(e.to);
    const color = e.status === "alert" ? "#f85149" : KIND_COLOR[e.kind];
    const dash = e.status === "alert" ? ` stroke-dasharray="6 4"` : "";
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="3"${dash}/>`;
  }).join("");
  const nodes = model.nodes.map((n) => {
    const p = NODE_POS[n.id];
    const border = n.status === "alert" ? "#f85149" : "#2d3a48";
    const alertText = n.alert ? `<text x="${p.x + 12}" y="${p.y + 52}" fill="#f85149" font-size="11">⚠ ${n.alert}</text>` : "";
    return `
      <rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="9" fill="#222c38" stroke="${border}" stroke-width="2"/>
      <svg x="${p.x + 10}" y="${p.y + 9}" width="40" height="26" style="color:#c7d2de">${iconForCategory(NODE_CAT[n.id])}</svg>
      <text x="${p.x + 58}" y="${p.y + 20}" fill="#e6edf3" font-size="14" font-weight="600">${n.label}</text>
      <text x="${p.x + 58}" y="${p.y + 36}" fill="#8b98a8" font-size="11">${n.stat}</text>
      ${alertText}`;
  }).join("");
  return `<svg viewBox="0 0 600 230" width="100%" style="min-width:560px">${edges}${nodes}</svg>`;
}

function renderBoard() {
  const el = $("board");
  const model = buildFlowModel(build, metricsForActive());
  if (!model.nodes.length) { el.innerHTML = `<div class="empty">Add parts to see your data center take shape.</div>`; return; }
  el.innerHTML = renderFlowSVG(model) +
    `<div class="board-legend"><span class="legend-power">power</span><span class="legend-net">network</span><span class="legend-heat">heat</span><span style="color:#f85149">⚠ red = problem</span></div>`;
}

// ---- detail panel ----
function openDetail(typeId: string) {
  const t = typeOf(typeId); if (!t) return;
  const specsRows = Object.entries(t.specs).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
  const extra = `<tr><td>Power draw</td><td>${t.powerDraw} W</td></tr><tr><td>Heat output</td><td>${t.heatOutput} W</td></tr><tr><td>Cost</td><td>${money(t.capex)}</td></tr>`;
  const link = t.learnMoreUrl ? `<a class="learn" href="${t.learnMoreUrl}" target="_blank" rel="noopener noreferrer">Learn more ↗</a>` : "";
  $("detail-panel").innerHTML = `
    <button class="close" id="detail-close" title="Close">✕</button>
    <div class="big">${iconFor(t)}</div>
    <h3>${t.name}</h3><div class="vendor">${t.vendor}</div>
    <p>${t.description ?? ""}</p>
    <table>${specsRows}${extra}</table>
    ${link}`;
  (document.getElementById("detail-close") as HTMLButtonElement).onclick = closeDetail;
  $("detail-panel").classList.add("open");
  $("detail-backdrop").classList.add("open");
  $("detail-panel").setAttribute("aria-hidden", "false");
}
function closeDetail() {
  $("detail-panel").classList.remove("open");
  $("detail-backdrop").classList.remove("open");
  $("detail-panel").setAttribute("aria-hidden", "true");
}

// ---- mode ----
function setMode(m: "learn" | "sandbox") { mode = m; saveMode(); lastHint = ""; viewIndex = frontierIndex(); render(); }
function renderModeButtons() {
  ($("mode-learn") as HTMLButtonElement).className = "mode" + (mode === "learn" ? " active" : "");
  ($("mode-sandbox") as HTMLButtonElement).className = "mode" + (mode === "sandbox" ? " active" : "");
  const pct = mode === "learn" ? courseProgressPct(course, progress) : 0;
  $("progress").textContent = mode === "learn" ? `Progress: ${courseProgressPct(course, progress)}%` : "";
  ($("coursebar-fill") as HTMLElement).style.width = `${pct}%`;
}

function render() {
  renderModeButtons(); renderShelf(); renderBuild(); renderMiddle(); renderReadout(); renderBoard();
}

// ---- init ----
($("mode-learn") as HTMLButtonElement).onclick = () => setMode("learn");
($("mode-sandbox") as HTMLButtonElement).onclick = () => setMode("sandbox");
$("detail-backdrop").onclick = closeDetail;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });
$("disclaimer").textContent = `${PRICING_DISCLAIMER} Catalog updated ${LAST_UPDATED}.`;
viewIndex = frontierIndex();
render();
