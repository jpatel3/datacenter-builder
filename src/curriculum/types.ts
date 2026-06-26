import type { Bottleneck, Category, Modality, Workload } from "../sim";

export type SuccessCheck =
  | { require: "componentCount"; category: Category; min: number }
  | { require: "connected"; kind: "power" | "network" }
  | { require: "noViolations" }
  | { require: "metricAtLeast"; path: string; value: number; modality?: Modality }
  | { require: "workloadPassed" }
  | { all: SuccessCheck[] }
  | { any: SuccessCheck[] };

export interface HintRule {
  when?: Exclude<Bottleneck, null>;
  text: string;
}

export type BlockType = "teach" | "task" | "challenge" | "reflect";

export interface Block {
  id: string;
  type: BlockType;
  title: string;
  body: string;
  unlocks?: string[]; // component type ids
  workload?: Workload; // for challenge blocks (and metricAtLeast modality context)
  successCheck?: SuccessCheck; // for task/challenge blocks
  hints?: HintRule[];
  quiz?: { options: string[]; answerIndex: number }; // for reflect blocks
}

export interface Lesson {
  id: string;
  title: string;
  blocks: Block[];
}
export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}
export interface Course {
  id: string;
  title: string;
  modules: Module[];
}

export interface Progress {
  completedBlockIds: string[];
}
