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
    {
      id: "m4",
      title: "Pick the right chip",
      lessons: [
        {
          id: "m4l1",
          title: "Chips have specialties",
          blocks: [
            {
              id: "m4l1b1",
              type: "teach",
              title: "Different chips, different jobs",
              body: "Not every accelerator is the same. Some are tuned for training, some for serving (inference). Use one off its sweet spot and it still works — just slower and pricier. Watch for the ⚠ chip-mismatch hint.",
              unlocks: ["gpu-amd-mi300x", "acc-aws-trainium", "acc-aws-inferentia", "acc-google-tpu"],
            },
            {
              id: "m4l1b2",
              type: "challenge",
              title: "Serve efficiently",
              body: "Serve 4,000 text queries/sec. Try AWS Inferentia (built for serving) with power and cooling. If you reach for a training chip, you'll see why it's the wrong tool.",
              workload: { type: "inference", modality: "text", model: "serve", qpsTarget: 4000 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "power", text: "Add power capacity." },
                { when: "cooling", text: "Add cooling." },
                { when: "compute", text: "Add more inference chips — Inferentia serves a lot per chip." },
              ],
            },
            {
              id: "m4l1b3",
              type: "reflect",
              title: "Quick check",
              body: "You need to SERVE a model to lots of users. Which chip fits best?",
              quiz: { options: ["AWS Trainium (training-tuned)", "AWS Inferentia (inference-tuned)", "Neither can serve"], answerIndex: 1 },
            },
          ],
        },
      ],
    },
    {
      id: "m5",
      title: "Cost & affordability",
      lessons: [
        {
          id: "m5l1",
          title: "What it costs to run",
          blocks: [
            {
              id: "m5l1b1",
              type: "teach",
              title: "Capex vs opex",
              body: "Two costs matter: capex (buying the gear) and opex (the monthly electric bill to run and cool it). For serving, the number people compare is cost per million tokens.",
            },
            {
              id: "m5l1b2",
              type: "challenge",
              title: "Serve under a budget",
              body: "Serve 4,000 text queries/sec at no more than $0.20 per million tokens. Cheaper, inference-tuned chips win here — watch the 'Cost per M tokens' readout.",
              workload: { type: "inference", modality: "text", model: "budget", qpsTarget: 4000, maxCostPerUnit: 0.2 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "affordability", text: "Too pricey per token — swap to cheaper, inference-tuned chips like Inferentia." },
                { when: "compute", text: "Add more chips to hit the throughput." },
                { when: "power", text: "Add power." },
                { when: "cooling", text: "Add cooling." },
              ],
            },
            {
              id: "m5l1b3",
              type: "reflect",
              title: "Quick check",
              body: "'Cost per million tokens' mainly tells you…",
              quiz: { options: ["How fast the model is", "How affordable it is to serve", "How big the model is"], answerIndex: 1 },
            },
          ],
        },
      ],
    },
    {
      id: "m6",
      title: "Real builds",
      lessons: [
        {
          id: "m6l1",
          title: "Serve ChatGPT",
          blocks: [
            {
              id: "m6l1b1",
              type: "teach",
              title: "Powering a chatbot",
              body: "Apps like ChatGPT answer millions of text questions. That's inference at scale — lots of throughput, served affordably.",
            },
            {
              id: "m6l1b2",
              type: "challenge",
              title: "5,000 questions a second",
              body: "Serve 5,000 text queries/sec, with power and cooling in place.",
              workload: { type: "inference", modality: "text", model: "ChatGPT", qpsTarget: 5000 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "compute", text: "Add more chips." },
                { when: "power", text: "Add power." },
                { when: "cooling", text: "Add cooling." },
              ],
            },
          ],
        },
        {
          id: "m6l2",
          title: "Make images (Midjourney)",
          blocks: [
            {
              id: "m6l2b1",
              type: "teach",
              title: "Images cost more",
              body: "Image generators like Midjourney do far more compute per output than a text reply — so the same hardware serves far fewer images per second.",
            },
            {
              id: "m6l2b2",
              type: "challenge",
              title: "200 images a second",
              body: "Serve an image workload at 200 images/sec. Notice how much more hardware this takes than text.",
              workload: { type: "inference", modality: "image", model: "Midjourney", qpsTarget: 200 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "compute", text: "Images are heavy — add more chips." },
                { when: "power", text: "Add power." },
                { when: "cooling", text: "Add cooling." },
              ],
            },
          ],
        },
        {
          id: "m6l3",
          title: "Do more with less (DeepSeek)",
          blocks: [
            {
              id: "m6l3b1",
              type: "teach",
              title: "The affordability race",
              body: "DeepSeek made headlines for matching top models far more cheaply. The game isn't just raw power — it's cost per token.",
            },
            {
              id: "m6l3b2",
              type: "challenge",
              title: "Beat the cost bar",
              body: "Serve 4,000 text queries/sec at or below $0.18 per million tokens. Pick your chips wisely.",
              workload: { type: "inference", modality: "text", model: "DeepSeek", qpsTarget: 4000, maxCostPerUnit: 0.18 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "affordability", text: "Still too pricey — lean on cheap, inference-tuned chips." },
                { when: "compute", text: "Add chips to hit throughput." },
                { when: "power", text: "Add power." },
                { when: "cooling", text: "Add cooling." },
              ],
            },
          ],
        },
        {
          id: "m6l4",
          title: "Train your own (Llama)",
          blocks: [
            {
              id: "m6l4b1",
              type: "teach",
              title: "Training needs a cluster",
              body: "Training a model like Llama means many chips working as one — which needs fast networking, plenty of power, and cooling.",
            },
            {
              id: "m6l4b2",
              type: "challenge",
              title: "Train a model",
              body: "Build a connected cluster (4+ training-capable chips + a Spine Switch + power + cooling) and hit the training goal.",
              workload: { type: "training", modality: "text", modelSizeB: 8, targetThroughput: 2500 },
              successCheck: { require: "workloadPassed" },
              hints: [
                { when: "network", text: "Add a Spine Switch so the chips cluster." },
                { when: "compute", text: "Add more training chips." },
                { when: "power", text: "Add power." },
                { when: "cooling", text: "Add cooling." },
              ],
            },
            {
              id: "m6l4b3",
              type: "reflect",
              title: "You did it!",
              body: "You've built serving and training infrastructure across text and images. What mattered most for affordability?",
              quiz: { options: ["The logo on the chip", "Matching the chip to the job and watching cost per token", "Using the most expensive parts"], answerIndex: 1 },
            },
          ],
        },
      ],
    },
  ],
};
