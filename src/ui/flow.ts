import type { Build, Metrics } from "../sim";
import { catalog } from "../sim";

export type FlowNodeId = "power" | "compute" | "network" | "cooling";
export type FlowKind = "power" | "network" | "heat";

export interface FlowNode {
  id: FlowNodeId;
  label: string;
  stat: string;
  status: "ok" | "alert";
  alert?: string;
}
export interface FlowEdge {
  from: FlowNodeId;
  to: FlowNodeId;
  kind: FlowKind;
  status: "ok" | "alert";
}
export interface FlowModel {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const fmt = (n: number) => (!Number.isFinite(n) ? "∞" : Math.round(n).toLocaleString("en-US"));

export function buildFlowModel(build: Build, metrics: Metrics): FlowModel {
  const idx = new Map(catalog.map((c) => [c.id, c]));
  const count = (cats: string[]) =>
    build.components.filter((c) => cats.includes(idx.get(c.typeId)?.category ?? "")).length;

  const numAcc = count(["accelerator"]);
  const hasPower = count(["power"]) > 0;
  const hasCompute = count(["accelerator", "server"]) > 0;
  const hasNetwork = count(["network"]) > 0;
  const hasCooling = count(["cooling"]) > 0;

  const nodes: FlowNode[] = [];

  if (hasPower) {
    const alert = metrics.power.deficitKW > 0;
    nodes.push({
      id: "power",
      label: "Power",
      status: alert ? "alert" : "ok",
      alert: alert ? "under-powered" : undefined,
      stat: `${fmt(metrics.power.supplyKW)} / ${fmt(metrics.power.drawKW)} kW`,
    });
  }
  if (hasCompute) {
    const unit = metrics.compute.modality === "image" ? "img/s" : "tok/s";
    let alert: string | undefined;
    if (!hasPower) alert = "no power";
    else if (numAcc >= 2 && !metrics.network.clusterConnected) alert = "not clustered";
    nodes.push({
      id: "compute",
      label: "Compute",
      status: alert ? "alert" : "ok",
      alert,
      stat: `${numAcc} chips · ${fmt(metrics.compute.inferenceThroughput)} ${unit}`,
    });
  }
  if (hasNetwork) {
    nodes.push({
      id: "network",
      label: "Network",
      status: "ok",
      stat: `${fmt(metrics.network.bisectionGbps)} Gbps · ${metrics.network.clusterConnected ? "clustered" : "not clustered"}`,
    });
  }
  if (hasCooling) {
    const alert = metrics.thermal.deficitKW > 0;
    nodes.push({
      id: "cooling",
      label: "Cooling",
      status: alert ? "alert" : "ok",
      alert: alert ? "overheating" : undefined,
      stat: `${fmt(metrics.thermal.coolingKW)} kW removal`,
    });
  }

  const has = (id: FlowNodeId) => nodes.some((n) => n.id === id);
  const edges: FlowEdge[] = [];
  if (has("power") && has("compute")) edges.push({ from: "power", to: "compute", kind: "power", status: "ok" });
  if (has("power") && has("cooling")) edges.push({ from: "power", to: "cooling", kind: "power", status: "ok" });
  if (has("power") && has("network")) edges.push({ from: "power", to: "network", kind: "power", status: "ok" });
  if (has("network") && has("compute")) {
    edges.push({
      from: "network",
      to: "compute",
      kind: "network",
      status: numAcc >= 2 && !metrics.network.clusterConnected ? "alert" : "ok",
    });
  }
  if (has("compute") && has("cooling")) {
    edges.push({
      from: "compute",
      to: "cooling",
      kind: "heat",
      status: metrics.thermal.deficitKW > 0 ? "alert" : "ok",
    });
  }

  return { nodes, edges };
}
