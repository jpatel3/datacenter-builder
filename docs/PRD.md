# Data Center Builder — Product Requirements Document (PRD)

**Status:** Living document — the single source of truth for the product. Update this whenever a product decision is made, *before* implementing. Detailed designs live in `docs/superpowers/specs/`; implementation steps in `docs/superpowers/plans/`.

**Last updated:** 2026-06-26

---

## 1. Vision

A standalone, browser-based educational **game** where you build AI data centers and learn what actually goes into one — chips, racks, power, cooling, networking, land — and how those choices trade off on **cost, capacity, and the difference between training and inference** (and text vs. image workloads). Learn by building, with room to make mistakes and understand why.

**One-liner:** "Minecraft-style, but you're building the infrastructure behind ChatGPT — and learning what every piece costs and does."

Not affiliated with any company (Tuva or otherwise). The Tuva energy-machine sim and [prompttochip.com](https://www.prompttochip.com/) are stylistic references only.

## 2. Target user

College students and early-career tech people. Implications:
- Numbers/vendors are **realistic-ish** (right ballpark, correct ratios, real vendors) — not engineering-grade.
- Training-vs-inference and affordability tradeoffs must be **meaningful**.
- Real, recognizable anchors (ChatGPT, Midjourney, DeepSeek, Llama; NVIDIA, AMD, AWS, Google).

## 3. Design principles (tone & pedagogy)

- **Plain language first** — introduce a jargon term only after the player has *felt* the thing it names.
- **Simple → hard** — each step adds one new idea; early steps win in a minute.
- **Discovery over instruction** — let players choose and see results; recommendations are opt-in.
- **Room to be wrong** — sub-optimal choices are informative, not punished (e.g. the `chip-mismatch` warning explains *why* and suggests a fix). Errors are the lesson.
- **Make it fun** — light voice, relatable hooks, small wins, and **visuals** (schematic icons) so abstract parts feel real.

## 4. Modes

- **Learn (guided course):** block-by-block lessons (Teach / Task / Challenge / Reflect), component unlocks, hints keyed to the engine's bottleneck, progress tracking.
- **Sandbox (open exploration):** all parts unlocked, free building, pick any scenario to test against.

## 5. Subsystems & status

| # | Subsystem | Status | Spec / Plan |
|---|-----------|--------|-------------|
| 1 | **Simulation core** — headless engine + component/pricing catalog | ✅ Built (39 tests) | `specs/2026-06-26-simulation-core-design.md`, `plans/2026-06-26-simulation-core.md` |
| 2 | **Playground UI** (Vite) — shelf, build list, scenario, live readout | ✅ Built | — |
| 3 | **Curriculum (Modules 1–3)** — guided Learn mode | ✅ Built (16 tests) | `specs/2026-06-26-curriculum-and-sharing-design.md`, `plans/2026-06-26-curriculum-modules-1-3.md` |
| 3a | **Component visuals** — inline SVG schematic icons | ✅ Built | (this PRD §7) |
| 4 | **UI enhancements** — progress bar, nav, infra board, part details | ✅ Built (63 tests total) | `specs/2026-06-26-ui-enhancements-design.md`, `plans/2026-06-26-ui-enhancements.md` |
| 5 | **Curriculum Modules 4–6** — chip choice, cost, real builds finale (ChatGPT/Midjourney/DeepSeek/Llama) | ✅ Built | curriculum spec |
| 5a | **Lesson UI polish** — full-height lesson panel, pinned footer nav, in-panel course bar, lesson-jump menu | ✅ Built | ui-enhancements spec |
| 6 | **Movable infra nodes** — drag the 4 grouped board nodes to rearrange; positions persist (localStorage) | ✅ Built | — |
| 7 | **Isometric game canvas** — the "Minecraft feel" build surface | 📋 Planned | — |
| 8 | **Accounts + save/share** — GitHub sign-in, save/load builds, public link + fork, progress sync | 🔨 Spec'd, awaiting Supabase keys | `specs/2026-06-26-accounts-and-sharing-design.md` |

## 6. Decision log (product-level)

- **Standalone web app**, TypeScript + Vite; PixiJS planned for the isometric canvas (subsystem 6).
- **Currency: USD** everywhere; narrative may cite a source's original currency for flavor.
- **Sim model: steady-state snapshot**, credible-but-simplified physics.
- **Modality:** workloads are text or image; image generation costs ~20× per output.
- **Chip specialization is soft, not hard:** efficiency multipliers (`trainEff`/`inferEff`/`imageEff`); off-sweet-spot chips work but raise a `chip-mismatch` warning. Roster: NVIDIA (A100/H100), AMD MI300X, AWS Trainium, AWS Inferentia, Google TPU.
- **Affordability is first-class:** `costPerMillionTokens` is a headline metric.
- **Accuracy/honesty rule:** closed-model figures (GPT-4o, Anthropic) are labeled *estimated*; prefer models with published infra (GPT-3-class, DeepSeek-V3, Llama).
- **Real-build scenario anchors:** ChatGPT (text inference), Midjourney/Stable Diffusion (image), DeepSeek (affordability), Llama (run-it-yourself).
- **Auth/persistence:** Supabase (managed). Progress is localStorage now, behind a swappable boundary.
- **Sharing:** public link + fork-to-edit.
- **Visual style:** inline SVG schematic / blueprint line-art (prompttochip aesthetic); self-contained, vendor-tinted.

## 7. Subsystem 4 — UI enhancements (next; decisions made 2026-06-26)

Brainstormed and decided; to be written up as a spec then implemented.

1. **Lesson progress:** a "Step N of M" indicator + thin per-lesson bar, plus a slim overall-course bar. Replaces the bare header "%".
2. **Navigation:** a **fixed footer nav** (`← Previous … Next →`) in a consistent place on every block. Model = **free review, gated forward**: Previous always revisits earlier blocks; Next is blocked past an unfinished Task/Challenge until its requirement is met. Requires a *view pointer* separate from the *progress pointer*.
3. **Infra board:** a **schematic flow diagram** of the build — both a picture and a live diagnostic.
   - Color-coded flows: ⚡ power = yellow, network = blue, heat = red.
   - Nodes/lines turn red on a matching problem (power deficit → power node red; overheating → cooling red; un-clustered chips → network link dashed-red).
   - **Node granularity: grouped by type** (Power / Compute / Network / Cooling, each with a count + key stat) — ✅ confirmed.
4. **Part details:** an **ⓘ button** on each shelf item opens a **side detail panel** with a plain-language description, key specs, cost, and a **"Learn more" link**. The main click still adds the part.
   - **Link source: Wikipedia/reference pages** + author blurbs — ✅ confirmed. Requires adding `description` + `learnMoreUrl` to catalog entries.

Full design: `specs/2026-06-26-ui-enhancements-design.md`. No open product questions remain for this subsystem.

## 8. Roadmap (suggested order)

1. Subsystem 4 — UI enhancements (progress/nav/infra board/part details). ← next
2. Curriculum Modules 4–6 (chip choice → cost → real-build finale).
3. Isometric game canvas.
4. Accounts + save/share (Supabase).

## 9. Repo & docs

- Repo: `jpatel3/datacenter-builder` (public GitHub).
- **Live demo: https://jpatel3.github.io/datacenter-builder/** — auto-deploys from `main` via GitHub Actions (`.github/workflows/deploy.yml`).
- Run: `npm install && npm run dev` (local playground), `npm test`, `npm run typecheck`.
- Doc layers: **this PRD** (product source of truth) → **specs** (per-subsystem design) → **plans** (bite-sized implementation steps).
