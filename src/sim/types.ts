export type Category =
  | "accelerator"
  | "cpu"
  | "server"
  | "rack"
  | "power"
  | "cooling"
  | "network"
  | "space";

export type Modality = "text" | "image";

export interface Footprint {
  rackUnits?: number;
  areaSqM?: number;
  weightKg?: number;
}

export interface ComponentType {
  id: string;
  name: string;
  category: Category;
  vendor: string;
  specs: Record<string, number | string>;
  capex: number;
  opexPerMonth?: number;
  footprint: Footprint;
  powerDraw: number; // watts
  heatOutput: number; // watts
  requires?: string[];
}

export interface PlacedComponent {
  instanceId: string;
  typeId: string;
  position: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface Connection {
  from: string; // instanceId
  to: string; // instanceId
  kind: "power" | "network";
}

export interface Build {
  components: PlacedComponent[];
  connections: Connection[];
  landBudgetSqM?: number;
}

export type ViolationCode =
  | "power-deficit"
  | "overheating"
  | "rack-overfull"
  | "no-network"
  | "over-land"
  | "unpowered-component"
  | "weight-exceeded"
  | "chip-mismatch";

export interface Violation {
  code: ViolationCode;
  severity: "error" | "warning";
  message: string;
  relatedInstanceIds: string[];
}

export interface Metrics {
  power: {
    drawKW: number;
    supplyKW: number;
    deficitKW: number;
    redundancy: "none" | "n+1";
  };
  thermal: { heatKW: number; coolingKW: number; deficitKW: number };
  compute: {
    trainingThroughput: number;
    inferenceThroughput: number;
    modality: Modality;
  };
  cost: {
    capex: number;
    opexPerMonth: number;
    dollarsPerTrainingUnit: number;
    costPerMillionTokens: number; // per-M-tokens (text) or per-M-images (image)
  };
  network: { bisectionGbps: number; clusterConnected: boolean };
  space: { usedSqM: number; capSqM?: number; overBudget: boolean };
  violations: Violation[];
}

export type Bottleneck =
  | "power"
  | "cooling"
  | "network"
  | "compute"
  | "space"
  | "budget"
  | "affordability"
  | null;

export type Workload =
  | {
      type: "training";
      modality: Modality;
      modelSizeB: number;
      gpuBudget?: number;
      targetThroughput?: number;
    }
  | {
      type: "inference";
      modality: Modality;
      model: string;
      qpsTarget: number;
      maxCostPerUnit?: number; // per-M-tokens (text) or per-M-images (image)
    };

export interface Result {
  passed: boolean;
  score: number; // 0–100
  bottleneck: Bottleneck;
  metrics: Metrics;
}

/** Options accepted by evaluators. `catalog` override exists for testing. */
export interface EvalOpts {
  catalog?: ComponentType[];
  modality?: Modality;
  intent?: "training" | "inference";
}
