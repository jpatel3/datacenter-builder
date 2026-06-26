import type { Block, Course, Progress } from "./types";

export function flattenBlocks(course: Course): Block[] {
  return course.modules.flatMap((m) => m.lessons.flatMap((l) => l.blocks));
}

export function currentBlock(course: Course, progress: Progress): Block | null {
  const done = new Set(progress.completedBlockIds);
  return flattenBlocks(course).find((b) => !done.has(b.id)) ?? null;
}

export function unlockedComponents(course: Course, progress: Progress): Set<string> {
  const blocks = flattenBlocks(course);
  const current = currentBlock(course, progress);
  const out = new Set<string>();
  for (const b of blocks) {
    for (const u of b.unlocks ?? []) out.add(u);
    if (current && b.id === current.id) break; // include up to and including current
  }
  return out;
}

export function completeBlock(progress: Progress, blockId: string): Progress {
  if (progress.completedBlockIds.includes(blockId)) return progress;
  return { completedBlockIds: [...progress.completedBlockIds, blockId] };
}

export function courseProgressPct(course: Course, progress: Progress): number {
  const blocks = flattenBlocks(course);
  if (!blocks.length) return 0;
  const done = blocks.filter((b) => progress.completedBlockIds.includes(b.id)).length;
  return Math.round((done / blocks.length) * 100);
}
