import type { Build, Category, Metrics, Modality, Workload } from "../sim";
import { catalog, evaluateBuild, evaluateAgainstWorkload } from "../sim";
import type { SuccessCheck } from "./types";

function countCategory(build: Build, category: Category): number {
  const idx = new Map(catalog.map((c) => [c.id, c]));
  return build.components.filter((c) => idx.get(c.typeId)?.category === category).length;
}

function hasConnection(build: Build, kind: "power" | "network"): boolean {
  return build.connections.some((c) => c.kind === kind);
}

function readPath(metrics: Metrics, path: string): number {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, metrics);
  return typeof value === "number" ? value : NaN;
}

export function checkSuccess(
  check: SuccessCheck,
  build: Build,
  block?: { workload?: Workload },
): boolean {
  if ("all" in check) return check.all.every((c) => checkSuccess(c, build, block));
  if ("any" in check) return check.any.some((c) => checkSuccess(c, build, block));

  switch (check.require) {
    case "componentCount":
      return countCategory(build, check.category) >= check.min;
    case "connected":
      return hasConnection(build, check.kind);
    case "noViolations": {
      const m = evaluateBuild(build);
      return m.violations.filter((v) => v.severity === "error").length === 0;
    }
    case "metricAtLeast": {
      const modality: Modality = check.modality ?? block?.workload?.modality ?? "text";
      const m = evaluateBuild(build, { modality });
      const got = readPath(m, check.path);
      return Number.isFinite(got) && got >= check.value;
    }
    case "workloadPassed": {
      if (!block?.workload) return false;
      return evaluateAgainstWorkload(build, block.workload).passed;
    }
  }
}
