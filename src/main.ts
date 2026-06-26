import {
  catalog,
  evaluateBuild,
  evaluateAgainstWorkload,
  PRICING_DISCLAIMER,
  LAST_UPDATED,
} from "./sim";
import type { Build, Category, Metrics, Modality, Workload } from "./sim";

// ---- state ----
const build: Build = { components: [], connections: [] };
let counter = 0;

interface Scenario {
  id: string;
  label: string;
  modality: Modality;
  workload: Workload | null;
}

const SCENARIOS: Scenario[] = [
  { id: "free-text", label: "Free build — text workload", modality: "text", workload: null },
  { id: "free-image", label: "Free build — image workload", modality: "image", workload: null },
  {
    id: "chatgpt",
    label: "Serve ChatGPT — text inference, 5,000 q/s",
    modality: "text",
    workload: { type: "inference", modality: "text", model: "ChatGPT", qpsTarget: 5000 },
  },
  {
    id: "midjourney",
    label: "Serve Midjourney — image generation, 50 img/s",
    modality: "image",
    workload: { type: "inference", modality: "image", model: "Midjourney", qpsTarget: 50 },
  },
  {
    id: "train",
    label: "Train a Llama-ish model — needs a real cluster",
    modality: "text",
    workload: { type: "training", modality: "text", modelSizeB: 8, targetThroughput: 2500 },
  },
];
let scenarioId = SCENARIOS[0].id;

// ---- helpers ----
const CATEGORY_ORDER: Category[] = [
  "accelerator", "cpu", "server", "rack", "power", "cooling", "network", "space",
];
const CATEGORY_LABEL: Record<Category, string> = {
  accelerator: "Chips (accelerators)", cpu: "CPUs", server: "Servers", rack: "Racks",
  power: "Power", cooling: "Cooling", network: "Networking", space: "Space / land",
};

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number, d = 0) =>
  !Number.isFinite(n) ? "∞" : n.toLocaleString("en-US", { maximumFractionDigits: d });
const money = (n: number) =>
  !Number.isFinite(n) ? "∞" : "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

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

const typeOf = (id: string) => catalog.find((c) => c.id === id);

function addComponent(typeId: string) {
  build.components.push({ instanceId: `i${counter++}`, typeId, position: { x: 0, y: 0 } });
  rewirePower();
  render();
}

function removeComponent(instanceId: string) {
  build.components = build.components.filter((c) => c.instanceId !== instanceId);
  rewirePower();
  render();
}

// ---- rendering ----
function renderShelf() {
  const el = $("shelf");
  el.innerHTML = "";
  for (const cat of CATEGORY_ORDER) {
    const parts = catalog.filter((c) => c.category === cat);
    if (!parts.length) continue;
    const wrap = document.createElement("div");
    wrap.className = "cat";
    wrap.innerHTML = `<h3>${CATEGORY_LABEL[cat]}</h3>`;
    for (const p of parts) {
      const b = document.createElement("button");
      b.className = "add";
      const watt = p.powerDraw ? `${fmt(p.powerDraw)}W · ` : "";
      b.innerHTML = `+ ${p.name} <small>${watt}${money(p.capex)}</small>`;
      b.onclick = () => addComponent(p.id);
      wrap.appendChild(b);
    }
    el.appendChild(wrap);
  }
}

function renderBuild() {
  const el = $("build");
  if (!build.components.length) {
    el.innerHTML = `<div class="empty">Empty — add some parts from the shelf.</div>`;
    return;
  }
  const counts = new Map<string, number>();
  for (const c of build.components) counts.set(c.typeId, (counts.get(c.typeId) ?? 0) + 1);
  el.innerHTML = "";
  for (const c of build.components) {
    const t = typeOf(c.typeId);
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span>${t?.name ?? c.typeId}</span>`;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "Remove";
    btn.onclick = () => removeComponent(c.instanceId);
    row.appendChild(btn);
    el.appendChild(row);
  }
}

function renderScenario() {
  const el = $("scenario") as HTMLSelectElement;
  if (!el.options.length) {
    for (const s of SCENARIOS) {
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.label;
      el.appendChild(o);
    }
    el.onchange = () => {
      scenarioId = el.value;
      render();
    };
  }
  el.value = scenarioId;
}

function renderReadout() {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  let metrics: Metrics;
  const resultEl = $("result");

  if (scenario.workload) {
    const r = evaluateAgainstWorkload(build, scenario.workload);
    metrics = r.metrics;
    resultEl.className = `result ${r.passed ? "pass" : "fail"}`;
    const bn = r.bottleneck ? ` · limited by <code>${r.bottleneck}</code>` : "";
    resultEl.innerHTML = `${r.passed ? "✅ Goal met" : "❌ Not yet"} — score ${r.score}/100
      <div class="sub">${scenario.label}${bn}</div>`;
  } else {
    metrics = evaluateBuild(build, { modality: scenario.modality });
    resultEl.className = "";
    resultEl.innerHTML = `<div class="sub">Free build — no pass/fail. Modality: <code>${scenario.modality}</code></div>`;
  }

  const unit = metrics.compute.modality === "image" ? "img/s" : "tok/s · (per query)";
  const perUnit = metrics.compute.modality === "image" ? "per M images" : "per M tokens";
  const rows: [string, string][] = [
    ["Power draw", `${fmt(metrics.power.drawKW, 1)} kW`],
    ["Power supply", `${fmt(metrics.power.supplyKW, 1)} kW · ${metrics.power.redundancy}`],
    ["Heat / cooling", `${fmt(metrics.thermal.heatKW, 1)} / ${fmt(metrics.thermal.coolingKW, 1)} kW`],
    ["Network", `${fmt(metrics.network.bisectionGbps)} Gbps · ${metrics.network.clusterConnected ? "clustered" : "not clustered"}`],
    ["Training throughput", `${fmt(metrics.compute.trainingThroughput)} TFLOP-eff`],
    ["Inference throughput", `${fmt(metrics.compute.inferenceThroughput)} ${unit}`],
    ["Capex", money(metrics.cost.capex)],
    ["Opex / month", money(metrics.cost.opexPerMonth)],
    [`Cost ${perUnit}`, money(metrics.cost.costPerMillionTokens)],
    ["Footprint", `${fmt(metrics.space.usedSqM, 1)} m²`],
  ];
  $("metrics").innerHTML = rows
    .map(([k, v]) => `<div class="metric"><span class="sub">${k}</span><span>${v}</span></div>`)
    .join("");

  const vEl = $("violations");
  if (!metrics.violations.length) {
    vEl.innerHTML = `<div class="sub">No issues. 🎉</div>`;
  } else {
    vEl.innerHTML = metrics.violations
      .map((v) => `<div class="viol ${v.severity}">${v.severity === "error" ? "⛔" : "⚠️"} ${v.message}</div>`)
      .join("");
  }
}

function render() {
  renderBuild();
  renderScenario();
  renderReadout();
}

// ---- init ----
renderShelf();
$("disclaimer").textContent = `${PRICING_DISCLAIMER} Catalog updated ${LAST_UPDATED}.`;
render();
