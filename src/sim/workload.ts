import type { Bottleneck, Build, EvalOpts, Result, Workload } from "./types";
import { catalog as defaultCatalog } from "./catalog";
import { evaluateBuild, resolveInstances } from "./evaluate";

function bottleneckForError(code: string): Bottleneck {
  switch (code) {
    case "power-deficit":
    case "unpowered-component":
      return "power";
    case "overheating":
      return "cooling";
    case "over-land":
    case "rack-overfull":
    case "weight-exceeded":
      return "space";
    default:
      return "compute";
  }
}

export function evaluateAgainstWorkload(
  build: Build,
  workload: Workload,
  opts: EvalOpts = {},
): Result {
  const cat = opts.catalog ?? defaultCatalog;
  const metrics = evaluateBuild(build, {
    ...opts,
    modality: workload.modality,
    intent: workload.type,
  });

  const errors = metrics.violations.filter((v) => v.severity === "error");

  let passed = true;
  let bottleneck: Bottleneck = null;

  if (errors.length) {
    passed = false;
    bottleneck = bottleneckForError(errors[0].code);
  } else if (workload.type === "training") {
    const numAcc = resolveInstances(build, cat).filter(
      (x) => x.type.category === "accelerator",
    ).length;
    if (workload.gpuBudget != null && numAcc > workload.gpuBudget) {
      passed = false;
      bottleneck = "budget";
    } else if (!metrics.network.clusterConnected) {
      passed = false;
      bottleneck = "network";
    } else if (
      workload.targetThroughput != null &&
      metrics.compute.trainingThroughput < workload.targetThroughput
    ) {
      passed = false;
      bottleneck = "compute";
    } else if (metrics.compute.trainingThroughput <= 0) {
      passed = false;
      bottleneck = "compute";
    }
  } else {
    // inference
    if (metrics.compute.inferenceThroughput < workload.qpsTarget) {
      passed = false;
      bottleneck = "compute";
    } else if (
      workload.maxCostPerUnit != null &&
      metrics.cost.costPerMillionTokens > workload.maxCostPerUnit
    ) {
      passed = false;
      bottleneck = "affordability";
    }
  }

  let score: number;
  if (!passed) {
    let progress = 0;
    if (workload.type === "inference" && workload.qpsTarget > 0) {
      progress = metrics.compute.inferenceThroughput / workload.qpsTarget;
    } else if (workload.type === "training" && workload.targetThroughput) {
      progress = metrics.compute.trainingThroughput / workload.targetThroughput;
    }
    score = Math.max(0, Math.min(49, Math.round(progress * 49)));
  } else {
    const warnings = metrics.violations.filter((v) => v.severity === "warning").length;
    score = Math.max(60, 100 - warnings * 10);
  }

  return { passed, score, bottleneck, metrics };
}
