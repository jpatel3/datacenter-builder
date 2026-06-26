import type { Build, ComponentType, EvalOpts, Metrics, Violation } from "./types";
import { MISMATCH_EFF_THRESHOLD, resolveInstances } from "./evaluate";

export type ViolationParts = Pick<Metrics, "power" | "thermal" | "network" | "space">;

function num(v: number | string | undefined, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function collectViolations(
  build: Build,
  cat: ComponentType[],
  parts: ViolationParts,
  opts: EvalOpts,
): Violation[] {
  const v: Violation[] = [];
  const items = resolveInstances(build, cat);

  if (parts.power.deficitKW > 0) {
    v.push({
      code: "power-deficit",
      severity: "error",
      message: `Power short by ${parts.power.deficitKW.toFixed(1)} kW — add supply or a bigger feed.`,
      relatedInstanceIds: [],
    });
  }

  if (parts.thermal.deficitKW > 0) {
    v.push({
      code: "overheating",
      severity: "error",
      message: `Cooling short by ${parts.thermal.deficitKW.toFixed(1)} kW — heat is building up faster than it's removed.`,
      relatedInstanceIds: [],
    });
  }

  const poweredIds = new Set<string>();
  for (const c of build.connections) {
    if (c.kind === "power") {
      poweredIds.add(c.from);
      poweredIds.add(c.to);
    }
  }
  const needsPower = items.filter(
    (x) => x.type.category === "accelerator" || x.type.category === "server",
  );
  const unpowered = needsPower.filter((x) => !poweredIds.has(x.inst.instanceId));
  if (unpowered.length) {
    v.push({
      code: "unpowered-component",
      severity: "error",
      message: `${unpowered.length} component(s) aren't wired to power.`,
      relatedInstanceIds: unpowered.map((x) => x.inst.instanceId),
    });
  }

  const rackCapacity = items
    .filter((x) => x.type.category === "rack")
    .reduce((s, { type }) => s + num(type.specs.rackUnitCapacity), 0);
  const rackDemand = items
    .filter((x) => x.type.category === "server" || x.type.category === "accelerator")
    .reduce((s, { type }) => s + num(type.footprint.rackUnits), 0);
  if (rackCapacity > 0 && rackDemand > rackCapacity) {
    v.push({
      code: "rack-overfull",
      severity: "error",
      message: `Racks are over capacity (${rackDemand}U needed, ${rackCapacity}U available).`,
      relatedInstanceIds: items
        .filter((x) => x.type.category === "rack")
        .map((x) => x.inst.instanceId),
    });
  }

  const weightCap = items
    .filter((x) => x.type.category === "rack")
    .reduce((s, { type }) => s + num(type.specs.weightCapacityKg), 0);
  const weight = items.reduce((s, { type }) => s + num(type.footprint.weightKg), 0);
  if (weightCap > 0 && weight > weightCap) {
    v.push({
      code: "weight-exceeded",
      severity: "error",
      message: `Total weight ${weight}kg exceeds rack limit ${weightCap}kg.`,
      relatedInstanceIds: [],
    });
  }

  const numAcc = items.filter((x) => x.type.category === "accelerator").length;
  if (numAcc >= 2 && parts.network.bisectionGbps === 0) {
    v.push({
      code: "no-network",
      severity: "warning",
      message: `Multiple accelerators but no networking — they can't train as one cluster.`,
      relatedInstanceIds: [],
    });
  }

  if (parts.space.overBudget) {
    v.push({
      code: "over-land",
      severity: "error",
      message: `Footprint ${parts.space.usedSqM}m² exceeds the ${parts.space.capSqM}m² land budget.`,
      relatedInstanceIds: [],
    });
  }

  if (opts.intent) {
    const effKey = opts.intent === "training" ? "trainEff" : "inferEff";
    const mismatched = items.filter(
      (x) =>
        x.type.category === "accelerator" &&
        num(x.type.specs[effKey], 1) < MISMATCH_EFF_THRESHOLD,
    );
    if (mismatched.length) {
      const better =
        opts.intent === "training"
          ? "a training-tuned chip (e.g. AWS Trainium or NVIDIA H100)"
          : "an inference-tuned chip (e.g. AWS Inferentia)";
      v.push({
        code: "chip-mismatch",
        severity: "warning",
        message: `Some chips are off their sweet spot for ${opts.intent} — ${better} would do more per dollar.`,
        relatedInstanceIds: mismatched.map((x) => x.inst.instanceId),
      });
    }
  }

  return v;
}
