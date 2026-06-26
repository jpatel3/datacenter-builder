import type { Course } from "./types";

export const course: Course = {
  id: "dc-foundations",
  title: "Data Center Foundations",
  modules: [
    {
      id: "m1",
      title: "Anatomy of a server",
      lessons: [
        {
          id: "m1l1",
          title: "Your first chip",
          blocks: [
            {
              id: "m1l1b1",
              type: "teach",
              title: "What's a chip?",
              body: "AI runs on accelerators — specialized chips. Each one does a lot of math, draws power, and gives off heat. Let's add one.",
              unlocks: ["gpu-nvidia-a100", "power-grid-feed"],
            },
            {
              id: "m1l1b2",
              type: "task",
              title: "Add an accelerator",
              body: "Add an NVIDIA A100 from the shelf.",
              successCheck: { require: "componentCount", category: "accelerator", min: 1 },
              hints: [{ text: "Click the A100 under “Chips (accelerators)” in the parts shelf." }],
            },
            {
              id: "m1l1b3",
              type: "task",
              title: "Plug it in",
              body: "A chip with no power does nothing. Add a Utility Grid Feed — power wires up automatically.",
              successCheck: { require: "componentCount", category: "power", min: 1 },
              hints: [{ text: "The grid feed is under “Power”." }],
            },
            {
              id: "m1l1b4",
              type: "reflect",
              title: "Quick check",
              body: "Why did the chip need the grid feed?",
              quiz: { options: ["For looks", "Chips need electricity to run", "To make it heavier"], answerIndex: 1 },
            },
          ],
        },
        {
          id: "m1l2",
          title: "Rack it up",
          blocks: [
            {
              id: "m1l2b1",
              type: "teach",
              title: "Racks hold your gear",
              body: "Real data centers mount servers and chips in racks. Add one so your build has a home.",
              unlocks: ["rack-42u", "server-2u"],
            },
            {
              id: "m1l2b2",
              type: "task",
              title: "Add a rack",
              body: "Add a 42U Rack from the shelf.",
              successCheck: { require: "componentCount", category: "rack", min: 1 },
            },
          ],
        },
      ],
    },
    {
      id: "m2",
      title: "Keep it alive",
      lessons: [
        {
          id: "m2l1",
          title: "Power and cooling",
          blocks: [
            {
              id: "m2l1b1",
              type: "teach",
              title: "Bigger chips, bigger heat",
              body: "The H100 is far more powerful than the A100 — and runs hotter. Power must cover the draw, and cooling must remove the heat.",
              unlocks: ["gpu-nvidia-h100", "cooling-crac", "power-ups"],
            },
            {
              id: "m2l1b2",
              type: "challenge",
              title: "A healthy build",
              body: "Add an H100, enough power, and a CRAC cooling unit so there are NO red warnings.",
              successCheck: { require: "noViolations" },
              hints: [
                { when: "power", text: "You're short on power — add a grid feed or UPS." },
                { when: "cooling", text: "Heat is building up — add a CRAC cooling unit." },
              ],
            },
            {
              id: "m2l1b3",
              type: "reflect",
              title: "Quick check",
              body: "What happens if cooling can't keep up with heat?",
              quiz: { options: ["Nothing", "The build overheats and can't run reliably", "It gets cheaper"], answerIndex: 1 },
            },
          ],
        },
      ],
    },
    {
      id: "m3",
      title: "Make it a cluster",
      lessons: [
        {
          id: "m3l1",
          title: "Training needs a network",
          blocks: [
            {
              id: "m3l1b1",
              type: "teach",
              title: "Many chips, one job",
              body: "Training a model splits work across many chips that must talk constantly. Without a fast network, they can't act as one cluster — and training crawls.",
              unlocks: ["net-spine-switch", "net-tor-switch"],
            },
            {
              id: "m3l1b2",
              type: "challenge",
              title: "Train a small model",
              body: "Build at least 4 H100s, power, cooling, AND a Spine Switch so the cluster connects — then meet the training goal.",
              workload: { type: "training", modality: "text", modelSizeB: 8, targetThroughput: 2500 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "network", text: "Your chips aren't clustered — add a Spine Switch." },
                { when: "compute", text: "Not enough training power — add more H100s." },
                { when: "power", text: "Add more power capacity." },
                { when: "cooling", text: "Add more cooling." },
              ],
            },
            {
              id: "m3l1b3",
              type: "reflect",
              title: "Quick check",
              body: "You serve ChatGPT-style inference instead. Does it need the same fast cluster network as training?",
              quiz: {
                options: ["Yes, exactly the same", "No — inference splits across chips far more easily", "Inference can't use GPUs"],
                answerIndex: 1,
              },
            },
          ],
        },
      ],
    },
  ],
};
