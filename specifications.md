# PRD: Training Camp (Lineage-Based Interactive Training)

## Summary

Training Camp is a stand-alone product that lets non-technical enterprise users **create or improve** an agent, agentic system, or AI skill by doing only two things: **expressing a need** and **evaluating outputs**. A built-in expert system called the **Master Trainer** handles all technical configuration and evolution. The core UX is an iterative loop where the user reviews **4 parallel options** (default) presented as cards, scores them **1–10** with optional comments, optionally **locks** the best options, and regenerates new variations for the unlocked ones.

---

## Problem

Enterprises want reliable agentic automation, but building and tuning agentic systems typically requires specialized expertise (prompting, tool design, orchestration patterns, eval design). This creates a bottleneck: domain experts know what “good” looks like but can’t easily translate that into agentic system engineering. Training Camp removes that bottleneck by converting domain judgment (simple scoring and feedback) into systematic improvement via the Master Trainer.

---

## Key innovation

Instead of requiring users to be experts in building agentic systems, Training Camp requires only:

1. the ability to **state intent/constraints**, and
2. the ability to **evaluate and choose** among outputs.

Everything else—scenario generation, variation, optimization, and system changes—is delegated to the Master Trainer.

---

## Definitions (to avoid ambiguity)

* **Target**: The thing being trained. One of:

  * **Agent** (single reasoning + tools)
  * **Agentic system** (multiple components/agents + coordination logic)
  * **AI skill** (a reusable packaged workflow capability)
* **Artifact**: The concrete output produced by a Target for a given prompt/input (e.g., summary, email, report, plan, code file, slide outline).
* **Session**: A training workspace for a single objective (e.g., “summarize in my style”).
* **Cycle**: One iteration of “generate → user evaluates → Master Trainer updates → generate again.”
* **Lineage**: **A persistent evolutionary branch** of the Target within a Session.

  * Each Lineage maintains its own internal configuration/state as it evolves across cycles.
  * Each Lineage produces one Artifact per cycle (shown as a card).
  * A user may **lock** a Lineage to freeze it (no further evolution) while continuing to evolve others.
* **Locked Lineage**: A Lineage whose configuration is frozen; it continues to display its latest Artifact until unlocked.
* **Directive**: Optional user-provided guidance applied to a specific Lineage to influence how it evolves (e.g., “use provocative hooks”).

---

## Goals

1. Enable a non-technical user to get **useful candidate outputs within minutes** from either:

   * “Need-only” (start from scratch), or
   * “Bring your own Target” (agent/system/skill).
2. Provide a fast evaluation loop: **score 1–10 + comment**, lock winners, regenerate the rest.
3. Support controlled diversity: user can give **Lineage-specific directives** to push different branches in different directions.
4. Produce publishable results: export one or more Lineages as **versioned artifacts** with an evidence trail (scores, comments, lineage history).
5. Enterprise readiness: permissions, auditability, and controlled publishing.

---

## Non-goals (MVP)

* Requiring users to define rubrics/evals (rubrics are optional later).
* Exposing technical configuration (prompts, tool schemas, orchestration graphs) as a prerequisite.
* Real-time production deployment orchestration (Training Camp outputs portable versions; runtime hosting is separate).

---

## Primary personas

* **Domain Evaluator (primary user)**: knows what “good” is; evaluates outputs; not technical.
* **Publisher**: can promote/export versions for use elsewhere.
* **Admin (enterprise)**: configures data/tool permissions and access policies.
* **Auditor/Reviewer**: read-only access to evidence and change history.

---

## User journeys

### Journey A: Start from scratch (need-only)

1. User enters need: “Summarize source material in my writing style.”
2. Optionally uploads style samples and example sources.
3. Master Trainer generates 4 Lineages → 4 cards appear.
4. User scores each 1–10, adds comments, locks best.
5. User clicks **Regenerate Unlocked** and repeats until satisfied.
6. User exports/publishes selected Lineage(s).

### Journey B: Train an existing Target

1. User selects or uploads a Target (agent/system/skill).
2. States improvement goal.
3. Same 4-Lineage loop; outcomes are improved versions of the uploaded Target.

### Journey C: Create deliberate spread (Lineage directives)

1. User adds directive to Lineage A: “Use provocative hooks.”
2. Adds directive to Lineage B: “Lead with an inspirational quote.”
3. Regenerate unlocked; user sees divergence and selects preferred direction.

### Journey D: Preserve winners while exploring

1. User locks 2–3 Lineages.
2. Repeatedly regenerates the remaining unlocked Lineage(s) to search for a better option.

---

## Product requirements

### 1) Session setup

**User-facing**

* Create Session from:

  * Need-only, or
  * Existing Target upload/select.
* Optional: upload reference files (style samples, example inputs/outputs).
* Optional: constraints (tone, length, format, do/don’t).

**System behavior**

* Master Trainer creates initial training plan internally (not exposed as technical config).
* Default creates **4 Lineages**.

**Acceptance**

* User reaches first set of 4 cards without touching any technical settings.

---

### 2) Main Training Loop (Lineage Card Grid)

**UI layout**

* 2×2 grid of cards (default 4 Lineages).
* Right panel: Master Trainer chat + per-Lineage directives.
* Top actions: **Regenerate Unlocked** (primary), History, Export/Publish.

**Card contents (collapsed)**

* Lineage label (A/B/C/D) + short “strategy tag” (auto)
* Artifact preview snippet
* Score input (1–10)
* Optional comment field
* Lock toggle
* Expand-on-click

**Expand behavior**

* Card expands into full Artifact viewer (modal or full screen)
* Actions: copy, pin, mark winner (optional), view metadata (collapsed)

**Acceptance**

* Scoring + commenting works without expansion, but expansion is one click.
* Locked cards never change during regeneration.

---

### 3) Evaluation capture (training signal)

* Required for each **unlocked** Lineage before regenerating:

  * Score 1–10
* Optional:

  * Freeform comment
  * “Use this as gold” (later / v1.1) to store edited ideal output

**Acceptance**

* Regenerate button disabled until all unlocked Lineages have scores.

---

### 4) Locking and regeneration

* User can lock/unlock any Lineage at any time.
* **Regenerate Unlocked**:

  * Only unlocked Lineages evolve and produce new Artifacts.
  * Locked Lineages remain unchanged and visible for comparison.
* Cycle repeats indefinitely.

**Acceptance**

* Locked Lineage configuration is immutable until unlocked.
* Each regeneration creates a new version entry in that Lineage’s history.

---

### 5) Lineage-specific directives

* User can attach directives to any Lineage:

  * **Sticky** (persists across cycles) or **One-shot** (next regeneration only)
* Directives affect only that Lineage’s evolution.

**Acceptance**

* Directive changes are reflected in subsequent outputs for that Lineage only.
* UI clearly indicates when a Lineage has an active directive.

---

### 6) History & compare (MVP)

* Per-Lineage timeline of previous Artifacts.
* Ability to pin a version and restore it into the current locked slot.

**Acceptance**

* Users can retrieve prior good results even if they later regenerate.

---

### 7) Export / publish

* User selects 1+ Lineages to export/publish.
* System outputs:

  * Versioned Target artifact(s)
  * Evidence pack (scores, comments, lineage timeline, session metadata)

**Acceptance**

* Export includes enough context to justify “why this version is chosen.”

---

## Enterprise requirements (MVP)

* **Access control** by role (Evaluator/Publisher/Admin/Auditor).
* **Policy guardrails** (Admin-configured):

  * allowed data sources
  * allowed tools/actions
* **Audit log**:

  * session creation, permission approvals, evaluations, locks/unlocks, exports/publishes.

---

## Analytics and success metrics

* Time to first 4 cards (TTF4)
* % sessions that complete ≥ 3 cycles
* Average evaluations per session
* % sessions with at least one locked Lineage
* Export/publish rate
* User-rated satisfaction (“did you get what you needed?”)
* (Later) quality uplift vs baseline on a held-out set

---

## Technical notes (implementation-facing)

* Lineage = persistent state bundle (target version pointer + trainer context + directives + history).
* Regeneration = Master Trainer update step conditioned on:

  * scores/comments for each unlocked Lineage
  * optional per-Lineage directives
  * locked Lineage snapshots (for comparative anchoring)
* Storage must support:

  * immutable Artifact versions per Lineage per cycle
  * evaluation events linked to Artifact versions
  * audit trail

---

## Risks & mitigations

* **Noisy scoring** → add calibration prompts and “compare two” modes later.
* **Mode collapse** (all Lineages converge) → encourage directives + diversity boosts internally.
* **Overfitting to user preferences** → optional held-out tests + regression suite later.
* **Governance concerns** → strict permissions, publish gates (optional) and immutable audit logs.

---

## Release scope

**MVP**

* Need-only + existing Target sessions
* 4 Lineages, card grid, expand viewer
* Score 1–10 + comments
* Lock/unlock + regenerate unlocked
* Lineage directives (sticky + one-shot)
* History timeline + restore
* Export with evidence pack
* Roles + audit log

**Later**

* Optional rubrics, pairwise comparisons, “gold edits,” automated regression gates, collaboration/review flows, advanced trace viewer.

# Additions based on spec review
* Look up agent lightning to understand how it work: https://microsoft.github.io/agent-lightning/stable/deep-dive/birds-eye-view/ 
* Make sure to use most recent libraries and packages for the build. 
* We use Claude Code CLI Login, antrohpic API and Google API-keys and LiteLLM API for LLM access
* See LiteLLM API specs here https://litellm-api.up.railway.app/openapi.json 
* We are buiding and MVP for now. We can use eg local SQLite as database. 