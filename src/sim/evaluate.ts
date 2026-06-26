import type { Build, ComponentType, EvalOpts, Metrics, Modality, PlacedComponent } from "./types";
import { catalog as defaultCatalog } from "./catalog";
import { collectViolations } from "./validate";

export const SECONDS_PER_MONTH = 2_592_000; // 30 days
export const HOURS_PER_MONTH = 730;
export const AMORTIZE_MONTHS = 36;
export const DEFAULT_PRICE_PER_KWH = 0.1;
export const IMAGE_COST_FACTOR = 20; // an image costs ~20x a text unit of compute
export const CLUSTER_BW_PER_ACCEL_GBPS = 100;
export const UNCONNECTED_TRAINING_PENALTY = 0.25;
export const MISMATCH_EFF_THRESHOLD = 0.6;

export function resolveInstances(
  build: Build,
  cat: ComponentType[],
): { inst: PlacedComponent; type: ComponentType }[] {
  const idx = new Map(cat.map((c) => [c.id, c]));
  const out: { inst: PlacedComponent; type: ComponentType }[] = [];
  for (const inst of build.components) {
    const type = idx.get(inst.typeId);
    if (type) out.push({ inst, type });
  }
  return out;
}

function num(v: number | string | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computePower(build: Build, cat: ComponentType[]): Metrics["power"] {
  const items = resolveInstances(build, cat);
  const drawKW = items.reduce((s, { type }) => s + type.powerDraw, 0) / 1000;
  const powerItems = items.filter((x) => x.type.category === "power");
  const capacities = powerItems.map((x) => num(x.type.specs.capacityKW));
  const supplyKW = capacities.reduce((a, b) => a + b, 0);
  const deficitKW = Math.max(0, drawKW - supplyKW);
  const maxSingle = capacities.length ? Math.max(...capacities) : 0;
  const redundancy: "none" | "n+1" =
    powerItems.length >= 2 && supplyKW - maxSingle >= drawKW ? "n+1" : "none";
  return { drawKW, supplyKW, deficitKW, redundancy };
}

export function computeThermal(build: Build, cat: ComponentType[]): Metrics["thermal"] {
  const items = resolveInstances(build, cat);
  const heatKW = items.reduce((s, { type }) => s + type.heatOutput, 0) / 1000;
  const coolingKW = items
    .filter((x) => x.type.category === "cooling")
    .reduce((s, { type }) => s + num(type.specs.heatRemovalKW), 0);
  const deficitKW = Math.max(0, heatKW - coolingKW);
  return { heatKW, coolingKW, deficitKW };
}

export function computeNetwork(build: Build, cat: ComponentType[]): Metrics["network"] {
  const items = resolveInstances(build, cat);
  const bisectionGbps = items
    .filter((x) => x.type.category === "network")
    .reduce((s, { type }) => s + num(type.specs.bandwidthGbps), 0);
  const numAcc = items.filter((x) => x.type.category === "accelerator").length;
  const clusterConnected =
    numAcc <= 1 ? true : bisectionGbps >= numAcc * CLUSTER_BW_PER_ACCEL_GBPS;
  return { bisectionGbps, clusterConnected };
}

export function computeCompute(
  build: Build,
  cat: ComponentType[],
  modality: Modality,
  network: Metrics["network"],
): Metrics["compute"] {
  const accs = resolveInstances(build, cat).filter((x) => x.type.category === "accelerator");

  const trainRaw = accs.reduce(
    (s, { type }) => s + num(type.specs.trainingTFLOPS) * num(type.specs.trainEff, 1),
    0,
  );
  const penalty = network.clusterConnected ? 1 : UNCONNECTED_TRAINING_PENALTY;
  const trainingThroughput = trainRaw * penalty;

  let inferenceThroughput: number;
  if (modality === "image") {
    inferenceThroughput =
      accs.reduce((s, { type }) => s + num(type.specs.inferenceQPS) * num(type.specs.imageEff, 1), 0) /
      IMAGE_COST_FACTOR;
  } else {
    inferenceThroughput = accs.reduce(
      (s, { type }) => s + num(type.specs.inferenceQPS) * num(type.specs.inferEff, 1),
      0,
    );
  }

  return { trainingThroughput, inferenceThroughput, modality };
}

export function computeCost(
  build: Build,
  cat: ComponentType[],
  power: Metrics["power"],
  compute: Metrics["compute"],
): Metrics["cost"] {
  const items = resolveInstances(build, cat);
  const capex = items.reduce((s, { type }) => s + type.capex, 0);
  const fixedOpex = items.reduce((s, { type }) => s + (type.opexPerMonth ?? 0), 0);

  const priceCandidates = items
    .map((x) => num(x.type.specs.pricePerKWh))
    .filter((n) => n > 0);
  const pricePerKWh = priceCandidates.length ? Math.min(...priceCandidates) : DEFAULT_PRICE_PER_KWH;

  const energyOpex = power.drawKW * HOURS_PER_MONTH * pricePerKWh;
  const opexPerMonth = fixedOpex + energyOpex;
  const monthlyCost = opexPerMonth + capex / AMORTIZE_MONTHS;

  const dollarsPerTrainingUnit =
    compute.trainingThroughput > 0 ? monthlyCost / compute.trainingThroughput : Infinity;

  const unitsPerMonth = compute.inferenceThroughput * SECONDS_PER_MONTH;
  const costPerMillionTokens =
    unitsPerMonth > 0 ? monthlyCost / (unitsPerMonth / 1_000_000) : Infinity;

  return { capex, opexPerMonth, dollarsPerTrainingUnit, costPerMillionTokens };
}

export function computeSpace(build: Build, cat: ComponentType[]): Metrics["space"] {
  const items = resolveInstances(build, cat);
  const usedSqM = items.reduce((s, { type }) => s + (type.footprint.areaSqM ?? 0), 0);
  const capSqM = build.landBudgetSqM;
  const overBudget = capSqM != null && usedSqM > capSqM;
  return { usedSqM, capSqM, overBudget };
}

export function evaluateBuild(build: Build, opts: EvalOpts = {}): Metrics {
  const cat = opts.catalog ?? defaultCatalog;
  const modality = opts.modality ?? "text";

  const power = computePower(build, cat);
  const thermal = computeThermal(build, cat);
  const network = computeNetwork(build, cat);
  const compute = computeCompute(build, cat, modality, network);
  const cost = computeCost(build, cat, power, compute);
  const space = computeSpace(build, cat);
  const violations = collectViolations(build, cat, { power, thermal, network, space }, opts);

  return { power, thermal, compute, cost, network, space, violations };
}
