import {
  catalog, evaluateBuild, evaluateAgainstWorkload, PRICING_DISCLAIMER, LAST_UPDATED,
} from "./sim";
import type { Build, Category, Metrics, Modality, Workload } from "./sim";
import {
  course, checkSuccess, currentBlock, unlockedComponents, completeBlock, courseProgressPct,
} from "./curriculum";
import type { Block, Progress } from "./curriculum";
import { iconFor } from "./ui/icons";

// ---- state ----
const build: Build = { components: [], connections: [] };
let counter = 0;
let mode: "learn" | "sandbox" = (localStorage.getItem("dcb-mode") as "learn" | "sandbox") || "learn";
let progress: Progress = loadProgress();

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
      const b = document.createElement("button"); b.className = "add";
      const watt = p.powerDraw ? `${fmt(p.powerDraw)}W · ` : "";
      b.innerHTML = `<span class="ico">${iconFor(p)}</span><span class="nm">${p.name}</span><small>${watt}${money(p.capex)}</small>`;
      b.onclick = () => addComponent(p.id);
      wrap.appendChild(b);
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
  const block = currentBlock(course, progress);
  if (!block) {
    el.innerHTML = `<div class="kind">Course complete</div><h3>🎉 You finished the foundations!</h3>
      <p class="sub">You've covered chips, power, cooling, and why training needs a network. Jump into Sandbox to build freely.</p>
      <div class="actions"><button id="to-sandbox">Open Sandbox</button></div>`;
    ($("to-sandbox") as HTMLButtonElement).onclick = () => setMode("sandbox");
    return;
  }
  let html = `<div class="kind">${block.type}</div><h3>${block.title}</h3><p>${block.body}</p>`;
  if (block.unlocks?.length) {
    const cards = block.unlocks
      .map((id) => typeOf(id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => `<div class="u"><span class="ico">${iconFor(t)}</span>${t.name}</div>`)
      .join("");
    if (cards) html += `<div class="unlocked-row">${cards}</div>`;
  }
  if (block.type === "reflect" && block.quiz) {
    html += `<div class="quiz">` + block.quiz.options.map((o, i) => `<button data-i="${i}">${o}</button>`).join("") + `</div>`;
  }
  html += `<div class="actions"></div>`;
  if (lastHint) html += `<div class="hint">💡 ${lastHint}</div>`;
  el.innerHTML = html;

  const actions = el.querySelector(".actions")!;
  if (block.type === "teach") {
    const b = document.createElement("button"); b.textContent = "Got it →";
    b.onclick = () => advance(block); actions.appendChild(b);
  } else if (block.type === "task" || block.type === "challenge") {
    const satisfied = block.successCheck ? checkSuccess(block.successCheck, build, block) : false;
    const cont = document.createElement("button"); cont.textContent = "Continue →";
    cont.disabled = !satisfied; cont.onclick = () => advance(block); actions.appendChild(cont);
    const hint = document.createElement("button"); hint.className = "ghost"; hint.textContent = "Hint";
    hint.onclick = () => { lastHint = computeHint(block); render(); }; actions.appendChild(hint);
    if (satisfied) actions.insertAdjacentHTML("beforeend", `<span class="done">✓ requirement met</span>`);
  } else if (block.type === "reflect" && block.quiz) {
    el.querySelectorAll<HTMLButtonElement>(".quiz button").forEach((qb) => {
      qb.onclick = () => {
        const i = Number(qb.dataset.i);
        if (i === block.quiz!.answerIndex) advance(block);
        else { lastHint = "Not quite — try again."; render(); }
      };
    });
  }
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

function advance(block: Block) {
  progress = completeBlock(progress, block.id); saveProgress(); lastHint = ""; render();
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

// ---- mode ----
function setMode(m: "learn" | "sandbox") { mode = m; saveMode(); lastHint = ""; render(); }
function renderModeButtons() {
  ($("mode-learn") as HTMLButtonElement).className = "mode" + (mode === "learn" ? " active" : "");
  ($("mode-sandbox") as HTMLButtonElement).className = "mode" + (mode === "sandbox" ? " active" : "");
  $("progress").textContent = mode === "learn" ? `Progress: ${courseProgressPct(course, progress)}%` : "";
}

function render() {
  renderModeButtons(); renderShelf(); renderBuild(); renderMiddle(); renderReadout();
}

// ---- init ----
($("mode-learn") as HTMLButtonElement).onclick = () => setMode("learn");
($("mode-sandbox") as HTMLButtonElement).onclick = () => setMode("sandbox");
$("disclaimer").textContent = `${PRICING_DISCLAIMER} Catalog updated ${LAST_UPDATED}.`;
render();
