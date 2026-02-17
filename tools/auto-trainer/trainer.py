#!/usr/bin/env python3
"""
Rubric-based auto-trainer for ludus-magnus.

Runs the generate -> run -> evaluate -> iterate loop automatically,
using an LLM judge to score outputs against a defined rubric.

Usage:
  python trainer.py <rubric.json> <test_inputs.json> [session_id]

Environment variables:
  LUDUS_BIN     Path to ludus-magnus binary (default: ludus-magnus)
  LITELLM_BASE  LiteLLM proxy base URL (required)
  LITELLM_KEY   LiteLLM API key (required)
  LITELLM_MODEL Model to use (default: gpt-4o-mini)
  JUDGE_MODEL   Model for rubric evaluation (defaults to LITELLM_MODEL)
  PROVIDER      Provider name (default: openai-compatible)
"""

import json
import subprocess
import sys
import os
import time
import urllib.request


# -- Config -------------------------------------------------------------------

LUDUS = os.environ.get("LUDUS_BIN", "ludus-magnus")
LITELLM_BASE = os.environ.get("LITELLM_BASE", "")
LITELLM_KEY = os.environ.get("LITELLM_KEY", "")
MODEL = os.environ.get("LITELLM_MODEL", "gpt-4o-mini")
JUDGE_MODEL = os.environ.get("JUDGE_MODEL", MODEL)
PROVIDER = os.environ.get("PROVIDER", "openai-compatible")

PROVIDER_FLAGS = [
    "--provider", PROVIDER,
    "--base-url", LITELLM_BASE,
    "--api-key", LITELLM_KEY,
    "--model", MODEL,
]


def log(msg, level="INFO"):
    ts = time.strftime("%H:%M:%S")
    colors = {
        "INFO": "\033[36m", "OK": "\033[32m",
        "WARN": "\033[33m", "ERR": "\033[31m", "SCORE": "\033[35m",
    }
    c = colors.get(level, "")
    print(f"{c}[{ts}] [{level}]\033[0m {msg}")


def check_config():
    ok = True
    if not LITELLM_BASE:
        log("LITELLM_BASE not set. Export it or pass via environment.", "ERR")
        ok = False
    if not LITELLM_KEY:
        log("LITELLM_KEY not set. Export it or pass via environment.", "ERR")
        ok = False
    # Check ludus-magnus binary
    try:
        subprocess.run([LUDUS, "--help"], capture_output=True, timeout=5)
    except FileNotFoundError:
        log(f"ludus-magnus binary not found at '{LUDUS}'. Set LUDUS_BIN.", "ERR")
        ok = False
    return ok


# -- Ludus-magnus CLI helpers -------------------------------------------------

def lm(*args):
    """Run a ludus-magnus CLI command with provider flags, return parsed JSON."""
    cmd = [LUDUS] + list(args) + PROVIDER_FLAGS + ["--json"]
    log(f"$ ludus-magnus {' '.join(args)}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        log(f"CLI error: {result.stderr.strip()}", "ERR")
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        log(f"JSON parse error: {result.stdout[:200]}", "ERR")
        return None


def lm_no_provider(*args):
    """Run a ludus-magnus CLI command without provider flags."""
    cmd = [LUDUS] + list(args) + ["--json"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


# -- LLM Judge ---------------------------------------------------------------

def call_llm(system_prompt, user_message):
    """Direct LLM call via LiteLLM for judging."""
    url = f"{LITELLM_BASE}/chat/completions"
    payload = json.dumps({
        "model": JUDGE_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 2000,
        "temperature": 0.2,
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LITELLM_KEY}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


def judge_output(rubric, test_input, agent_output):
    """Score an agent output against rubric criteria using LLM-as-judge."""
    criteria_text = "\n".join(
        f"- **{c['id']}** ({c['name']}, weight {c['weight']}): {c['description']}"
        for c in rubric["criteria"]
    )

    system_prompt = (
        "You are a strict but fair evaluator for AI agents. "
        "You evaluate agent outputs against specific rubric criteria.\n\n"
        "IMPORTANT: Return ONLY valid JSON, no markdown fences, no extra text.\n"
        "Return a JSON object with this exact structure:\n"
        "{\n"
        '  "scores": {\n'
        '    "<criterion_id>": {"score": <1-10>, "comment": "<brief reason>"},\n'
        "    ...\n"
        "  },\n"
        '  "overall_comment": "<1-2 sentence summary>"\n'
        "}"
    )

    user_msg = (
        f"## Rubric Criteria\n{criteria_text}\n\n"
        f"## Test Input Given to Agent\n{test_input}\n\n"
        f"## Agent Output\n{agent_output}\n\n"
        "Score each criterion 1-10 where:\n"
        "- 1-3: Poor, fails the criterion\n"
        "- 4-6: Adequate but needs improvement\n"
        "- 7-8: Good, meets expectations\n"
        "- 9-10: Excellent, exceeds expectations\n\n"
        "Return ONLY the JSON object."
    )

    raw = call_llm(system_prompt, user_msg)
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        log(f"Judge returned invalid JSON: {text[:200]}", "ERR")
        return None


def compute_weighted_score(rubric, judge_result):
    """Compute weighted average score from judge results."""
    total_weight = sum(c["weight"] for c in rubric["criteria"])
    weighted_sum = 0
    for c in rubric["criteria"]:
        score_data = judge_result.get("scores", {}).get(c["id"])
        if score_data:
            weighted_sum += score_data["score"] * c["weight"]
    return round(weighted_sum / total_weight, 2) if total_weight > 0 else 0


def format_feedback(rubric, judge_results_per_input):
    """Aggregate judge feedback into improvement directives."""
    lines = []
    criterion_scores = {c["id"]: [] for c in rubric["criteria"]}

    for entry in judge_results_per_input:
        for cid, data in entry.get("scores", {}).items():
            if cid in criterion_scores:
                criterion_scores[cid].append((data["score"], data.get("comment", "")))

    for c in rubric["criteria"]:
        scores = criterion_scores.get(c["id"], [])
        if not scores:
            continue
        avg = sum(s for s, _ in scores) / len(scores)
        low_comments = [comment for s, comment in scores if s < 7 and comment]
        status = "PASS" if avg >= 7 else "NEEDS WORK"
        lines.append(f"[{status}] {c['name']} (avg {avg:.1f}/10, weight {c['weight']})")
        if low_comments:
            for comment in low_comments[:2]:
                lines.append(f"  - {comment}")

    overall_comments = [
        e.get("overall_comment", "")
        for e in judge_results_per_input
        if e.get("overall_comment")
    ]
    if overall_comments:
        lines.append("")
        lines.append("Overall observations:")
        for oc in overall_comments[:3]:
            lines.append(f"  - {oc}")

    return "\n".join(lines)


# -- Main training loop -------------------------------------------------------

def train(rubric_path, inputs_path, session_id=None):
    """Run the full auto-training loop."""
    with open(rubric_path) as f:
        rubric = json.load(f)
    with open(inputs_path) as f:
        test_data = json.load(f)

    test_inputs = test_data["inputs"]
    max_gen = rubric.get("max_generations", 5)
    passing = rubric.get("passing_score", 7.5)

    log(f"Rubric: {rubric['name']}")
    log(f"Criteria: {len(rubric['criteria'])}, Passing: {passing}, Max gens: {max_gen}")
    log(f"Test inputs: {len(test_inputs)}")
    print()

    # Init session if needed
    if not session_id:
        need = rubric.get("need")
        if not need:
            log("No session_id and no 'need' field in rubric. Provide one.", "ERR")
            return
        log("Initializing new quickstart session...")
        result = lm("quickstart", "init", "--need", need)
        if not result:
            log("Failed to init session", "ERR")
            return
        session_id = result["session_id"]
        log(f"Session: {session_id}", "OK")
    else:
        log(f"Resuming session: {session_id}")

    # Training generations
    for gen in range(1, max_gen + 1):
        print()
        log("=" * 60)
        log(f"GENERATION {gen}/{max_gen}")
        log("=" * 60)

        judge_results = []
        artifact_ids = []

        for i, ti in enumerate(test_inputs):
            log(f"  Test {i+1}/{len(test_inputs)}: {ti['name']}")

            run_result = lm("run", session_id, "--input", ti["input"])
            if not run_result:
                log(f"  Run failed for input {ti['id']}", "ERR")
                continue

            art_id = run_result["artifact_id"]
            artifact_ids.append(art_id)

            art = lm_no_provider("artifact", "inspect", art_id)
            if not art:
                log(f"  Could not inspect artifact {art_id}", "ERR")
                continue

            output = art.get("output", "")
            log(f"  Output: {len(output)} chars")

            log("  Judging against rubric...")
            judge_result = judge_output(rubric, ti["input"], output)
            if not judge_result:
                log("  Judge failed", "ERR")
                continue

            score = compute_weighted_score(rubric, judge_result)
            judge_results.append(judge_result)

            feedback_parts = []
            for c in rubric["criteria"]:
                sd = judge_result.get("scores", {}).get(c["id"])
                if sd:
                    feedback_parts.append(f"{c['name']}: {sd['score']}/10")
            feedback_comment = (
                f"Auto-eval: {', '.join(feedback_parts)}. "
                f"{judge_result.get('overall_comment', '')}"
            )

            int_score = max(1, min(10, round(score)))
            lm_no_provider(
                "evaluate", art_id,
                "--score", str(int_score),
                "--comment", feedback_comment,
            )

            log(f"  Score: {score}/10", "SCORE")

        if not judge_results:
            log("No successful evaluations this generation", "ERR")
            continue

        gen_scores = [compute_weighted_score(rubric, jr) for jr in judge_results]
        gen_avg = sum(gen_scores) / len(gen_scores)

        print()
        log(f"Generation {gen} average: {gen_avg:.2f}/10", "SCORE")

        for c in rubric["criteria"]:
            c_scores = []
            for jr in judge_results:
                sd = jr.get("scores", {}).get(c["id"])
                if sd:
                    c_scores.append(sd["score"])
            if c_scores:
                c_avg = sum(c_scores) / len(c_scores)
                bar = "#" * int(c_avg) + "." * (10 - int(c_avg))
                status = "OK" if c_avg >= 7 else "!!"
                log(f"  [{status}] {c['name']:.<30s} {c_avg:.1f}/10  [{bar}]")

        if gen_avg >= passing:
            print()
            log(f"PASSED! Score {gen_avg:.2f} >= {passing}", "OK")
            log(f"Agent converged after {gen} generation(s).", "OK")
            break

        if gen < max_gen:
            log(f"Score {gen_avg:.2f} < {passing}, iterating...")
            feedback = format_feedback(rubric, judge_results)

            session_data = lm_no_provider("session", "inspect", session_id)
            if session_data:
                for lid, lin in session_data.get("lineages", {}).items():
                    lm_no_provider(
                        "directive", "set", session_id, lin["name"],
                        "--text", feedback, "--oneshot",
                    )

            iterate_result = lm("iterate", session_id)
            if not iterate_result:
                log("Iterate failed", "ERR")
                break
            log("New agent version generated", "OK")
        else:
            print()
            log(f"Max generations reached. Final score: {gen_avg:.2f}/10", "WARN")

    print()
    log("=" * 60)
    log("TRAINING COMPLETE")
    log(f"Session: {session_id}")
    log("View results: python viewer.py")
    log("=" * 60)


# -- CLI entry ----------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python trainer.py <rubric.json> <test_inputs.json> [session_id]")
        print()
        print("Environment variables:")
        print("  LITELLM_BASE   LiteLLM proxy URL (required)")
        print("  LITELLM_KEY    LiteLLM API key (required)")
        print("  LITELLM_MODEL  Model name (default: gpt-4o-mini)")
        print("  LUDUS_BIN      Path to ludus-magnus binary (default: ludus-magnus)")
        sys.exit(1)

    if not check_config():
        sys.exit(1)

    rubric_path = sys.argv[1]
    inputs_path = sys.argv[2]
    session_id = sys.argv[3] if len(sys.argv) > 3 else None

    train(rubric_path, inputs_path, session_id)
