#!/usr/bin/env python3
"""
Ludus Magnus training session viewer — auto-refreshing web dashboard.

Serves a web page that displays the current ludus-magnus state.json
with rubric score breakdowns, agent version history, and artifact details.

Usage:
  python viewer.py [path/to/state.json] [port]

Defaults:
  state.json path: .ludus-magnus/state.json (relative to cwd)
  port: 8777
"""

import json
import http.server
import os
import socket
import sys

STATE_PATH = sys.argv[1] if len(sys.argv) > 1 else ".ludus-magnus/state.json"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8777

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ludus Magnus — Training Viewer</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; }
  h1 { color: #38bdf8; margin-bottom: 4px; font-size: 1.6em; }
  .subtitle { color: #64748b; margin-bottom: 20px; font-size: 0.9em; }
  .refresh-info { color: #475569; font-size: 0.8em; margin-bottom: 16px; }

  .summary-bar { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
  .summary-stat { background: #1e293b; border: 1px solid #334155; border-radius: 10px; padding: 14px 20px; min-width: 140px; }
  .summary-stat .label { color: #64748b; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.05em; }
  .summary-stat .value { font-size: 1.6em; font-weight: 700; margin-top: 2px; }

  .session-card { background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #334155; }
  .session-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .session-id { color: #94a3b8; font-family: monospace; font-size: 0.85em; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.75em; font-weight: 600; }
  .badge-active { background: #065f46; color: #6ee7b7; }
  .badge-version { background: #1e3a5f; color: #7dd3fc; }
  .need { background: #0f172a; border-left: 3px solid #38bdf8; padding: 12px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; font-style: italic; color: #94a3b8; }
  .section { margin-top: 20px; }
  .section-title { color: #38bdf8; font-size: 1.1em; margin-bottom: 10px; border-bottom: 1px solid #334155; padding-bottom: 6px; }
  .prompt-box { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-family: monospace; font-size: 0.85em; line-height: 1.6; max-height: 500px; overflow-y: auto; color: #cbd5e1; }
  .prompt-toggle { color: #38bdf8; cursor: pointer; font-size: 0.85em; margin-bottom: 6px; user-select: none; }
  .prompt-toggle:hover { text-decoration: underline; }

  .version-history { display: flex; gap: 6px; margin: 10px 0; flex-wrap: wrap; }
  .version-pill { padding: 4px 12px; border-radius: 6px; font-size: 0.8em; cursor: pointer; border: 1px solid #334155; background: #0f172a; color: #94a3b8; transition: all 0.2s; }
  .version-pill:hover { border-color: #38bdf8; color: #7dd3fc; }
  .version-pill.active { background: #1e3a5f; border-color: #38bdf8; color: #7dd3fc; }

  .artifact { background: #1a2332; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .artifact-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .artifact-id { font-family: monospace; color: #64748b; font-size: 0.8em; }
  .input-label { color: #f59e0b; font-weight: 600; font-size: 0.85em; margin-bottom: 4px; }
  .output-label { color: #34d399; font-weight: 600; font-size: 0.85em; margin: 8px 0 4px; }
  .artifact-text { background: #0f172a; border-radius: 6px; padding: 12px; font-size: 0.85em; line-height: 1.5; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }
  .score { display: inline-flex; align-items: center; gap: 6px; }
  .score-num { font-size: 1.4em; font-weight: 700; }
  .score-high { color: #34d399; }
  .score-mid { color: #fbbf24; }
  .score-low { color: #f87171; }
  .no-score { color: #475569; font-style: italic; font-size: 0.85em; }
  .meta { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 0.8em; color: #64748b; }
  .meta span { background: #0f172a; padding: 2px 8px; border-radius: 4px; }

  .rubric-breakdown { margin: 12px 0; }
  .rubric-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 0.82em; }
  .rubric-label { width: 200px; color: #94a3b8; flex-shrink: 0; }
  .rubric-bar-bg { flex: 1; height: 14px; background: #0f172a; border-radius: 7px; overflow: hidden; max-width: 300px; }
  .rubric-bar-fill { height: 100%; border-radius: 7px; transition: width 0.5s ease; }
  .rubric-score-val { width: 50px; text-align: right; font-weight: 600; font-family: monospace; }

  .empty { color: #475569; font-style: italic; padding: 20px; text-align: center; }
  .collapsible { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
  .collapsible.open { max-height: 5000px; }
</style>
</head>
<body>

<h1>Ludus Magnus — Training Viewer</h1>
<p class="subtitle">Agent Evolution Dashboard</p>
<div class="refresh-info" id="refresh-info">Auto-refreshes every 3s</div>
<div class="summary-bar" id="summary-bar"></div>
<div id="content"><div class="empty">Loading state...</div></div>

<script>
const openSections = {};
function scoreClass(s) { return s >= 7 ? 'score-high' : s >= 4 ? 'score-mid' : 'score-low'; }
function barColor(s) { return s >= 7 ? '#34d399' : s >= 4 ? '#fbbf24' : '#f87171'; }
function escapeHtml(t) {
  if (!t) return '';
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function extractPrompt(raw) {
  try {
    let s = raw;
    if (s.startsWith('`' + '``')) s = s.split('\n').slice(1).join('\n').replace(/`{3}\s*$/, '');
    const obj = JSON.parse(s);
    return { prompt: obj.system_prompt || s, reasoning: obj.reasoning || '' };
  } catch { return { prompt: raw, reasoning: '' }; }
}

function parseAutoEval(comment) {
  if (!comment || !comment.startsWith('Auto-eval:')) return null;
  const scores = {};
  const match = comment.match(/Auto-eval:\s*(.+?)\.\s*(.*)/s);
  if (!match) return null;
  const pairs = match[1].split(',').map(s => s.trim());
  for (const p of pairs) {
    const m = p.match(/(.+?):\s*(\d+)\/10/);
    if (m) scores[m[1].trim()] = parseInt(m[2]);
  }
  return { scores, overall: match[2] || '' };
}

function toggle(id) {
  openSections[id] = !openSections[id];
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open', openSections[id]);
}

function renderState(state) {
  const el = document.getElementById('content');
  const sb = document.getElementById('summary-bar');
  if (!state || !state.sessions || Object.keys(state.sessions).length === 0) {
    el.innerHTML = '<div class="empty">No sessions found. Run trainer.py to start.</div>';
    sb.innerHTML = '';
    return;
  }

  let totalSessions = 0, totalArtifacts = 0, totalVersions = 0, latestAvg = null;
  for (const session of Object.values(state.sessions)) {
    totalSessions++;
    for (const lin of Object.values(session.lineages || {})) {
      totalVersions += (lin.agents || []).length;
      const arts = lin.artifacts || [];
      totalArtifacts += arts.length;
      const scored = arts.filter(a => a.evaluation && a.evaluation.score > 0);
      if (scored.length > 0) {
        latestAvg = scored.reduce((s,a) => s + a.evaluation.score, 0) / scored.length;
      }
    }
  }

  sb.innerHTML =
    '<div class="summary-stat"><div class="label">Sessions</div><div class="value" style="color:#38bdf8">'+totalSessions+'</div></div>' +
    '<div class="summary-stat"><div class="label">Agent Versions</div><div class="value" style="color:#c084fc">'+totalVersions+'</div></div>' +
    '<div class="summary-stat"><div class="label">Artifacts</div><div class="value" style="color:#f59e0b">'+totalArtifacts+'</div></div>' +
    '<div class="summary-stat"><div class="label">Avg Score</div><div class="value" style="color:'+(latestAvg ? barColor(latestAvg) : '#475569')+'">'+(latestAvg ? latestAvg.toFixed(1) : '\u2014')+'</div></div>';

  let html = '';
  for (const [sid, session] of Object.entries(state.sessions)) {
    html += '<div class="session-card">';
    html += '<div class="session-header">';
    html += '<div><strong>' + escapeHtml(session.mode) + ' session</strong> <span class="session-id">' + sid + '</span></div>';
    html += '<span class="badge badge-active">' + (session.status || 'active') + '</span>';
    html += '</div>';
    html += '<div class="need">' + escapeHtml(session.need) + '</div>';

    for (const [lid, lineage] of Object.entries(session.lineages || {})) {
      const agents = lineage.agents || [];
      const artifacts = lineage.artifacts || [];
      const latestAgent = agents[agents.length - 1];

      html += '<div class="section">';
      html += '<div class="section-title">Lineage: ' + escapeHtml(lineage.name) + ' \u2014 ' + agents.length + ' version(s)' + (lineage.locked ? ' [locked]' : '') + '</div>';

      if (agents.length > 1) {
        html += '<div class="version-history">';
        for (const ag of agents) {
          const agArts = artifacts.filter(a => a.agent_id === ag.id);
          const agScored = agArts.filter(a => a.evaluation && a.evaluation.score > 0);
          const agAvg = agScored.length > 0 ? (agScored.reduce((s,a) => s+a.evaluation.score,0)/agScored.length).toFixed(1) : '?';
          const isLatest = ag.id === latestAgent.id;
          html += '<div class="version-pill' + (isLatest ? ' active' : '') + '" onclick="toggle(\'agent_'+ag.id+'\')">';
          html += 'v' + ag.version + ' (' + agAvg + ')';
          html += '</div>';
        }
        html += '</div>';
      }

      for (const ag of agents) {
        const isLatest = ag.id === latestAgent.id;
        const secId = 'agent_' + ag.id;
        if (openSections[secId] === undefined) openSections[secId] = isLatest;
        const { prompt, reasoning } = extractPrompt(ag.definition.system_prompt);

        html += '<div id="' + secId + '" class="collapsible' + (openSections[secId] ? ' open' : '') + '">';
        html += '<div style="margin:8px 0"><span class="badge badge-version">v' + ag.version + '</span> <span class="artifact-id">' + ag.id + '</span></div>';

        const promptId = 'prompt_' + ag.id;
        if (openSections[promptId] === undefined) openSections[promptId] = isLatest;
        html += '<div class="prompt-toggle" onclick="toggle(\'' + promptId + '\')">System Prompt ' + (openSections[promptId] ? '[-]' : '[+]') + '</div>';
        html += '<div id="' + promptId + '" class="collapsible' + (openSections[promptId] ? ' open' : '') + '">';
        html += '<div class="prompt-box">' + escapeHtml(prompt) + '</div>';
        if (reasoning) {
          html += '<div style="margin-top:8px;margin-bottom:4px;color:#f59e0b;font-size:0.85em;font-weight:600;">Reasoning:</div>';
          html += '<div class="prompt-box" style="max-height:200px;border-color:#f59e0b33">' + escapeHtml(reasoning) + '</div>';
        }
        html += '</div>';

        const gm = ag.generation_metadata || {};
        html += '<div class="meta">';
        html += '<span>Model: ' + (gm.model || '?') + '</span>';
        html += '<span>Tokens: ' + (gm.tokens_used || '?') + '</span>';
        html += '<span>Time: ' + ((gm.duration_ms || 0) / 1000).toFixed(1) + 's</span>';
        html += '</div>';

        const agArts = artifacts.filter(a => a.agent_id === ag.id);
        if (agArts.length > 0) {
          const allRubrics = agArts.map(a => parseAutoEval(a.evaluation && a.evaluation.comment)).filter(Boolean);
          if (allRubrics.length > 0) {
            const criterionAgg = {};
            for (const r of allRubrics) {
              for (const [k, v] of Object.entries(r.scores)) {
                if (!criterionAgg[k]) criterionAgg[k] = [];
                criterionAgg[k].push(v);
              }
            }
            html += '<div class="rubric-breakdown">';
            html += '<div style="color:#c084fc;font-size:0.85em;font-weight:600;margin-bottom:6px;">Rubric Breakdown (avg across ' + allRubrics.length + ' inputs):</div>';
            for (const [k, vals] of Object.entries(criterionAgg)) {
              const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
              html += '<div class="rubric-row">';
              html += '<div class="rubric-label">' + escapeHtml(k) + '</div>';
              html += '<div class="rubric-bar-bg"><div class="rubric-bar-fill" style="width:' + (avg*10) + '%;background:' + barColor(avg) + '"></div></div>';
              html += '<div class="rubric-score-val" style="color:' + barColor(avg) + '">' + avg.toFixed(1) + '</div>';
              html += '</div>';
            }
            html += '</div>';
          }

          html += '<div style="margin-top:12px;margin-bottom:8px;color:#94a3b8;font-size:0.85em;font-weight:600;">Test runs (' + agArts.length + '):</div>';
          for (const art of agArts) {
            html += '<div class="artifact">';
            html += '<div class="artifact-header">';
            html += '<span class="artifact-id">' + art.id + '</span>';
            if (art.evaluation && art.evaluation.score > 0) {
              html += '<div class="score"><span class="score-num ' + scoreClass(art.evaluation.score) + '">' + art.evaluation.score + '/10</span></div>';
            } else {
              html += '<span class="no-score">not scored</span>';
            }
            html += '</div>';
            html += '<div class="input-label">Input:</div>';
            html += '<div class="artifact-text">' + escapeHtml(art.input) + '</div>';
            html += '<div class="output-label">Output:</div>';
            html += '<div class="artifact-text">' + escapeHtml(art.output) + '</div>';
            if (art.evaluation && art.evaluation.comment) {
              html += '<div style="margin-top:8px;color:#f59e0b;font-size:0.85em;font-weight:600;">Evaluation:</div>';
              html += '<div class="artifact-text" style="border-left:3px solid #f59e0b">' + escapeHtml(art.evaluation.comment) + '</div>';
            }
            const em = art.execution_metadata || {};
            html += '<div class="meta">';
            html += '<span>Tokens: ' + ((em.tokens_input||0)+(em.tokens_output||0)) + '</span>';
            html += '<span>Time: ' + ((em.duration_ms || 0) / 1000).toFixed(1) + 's</span>';
            html += '</div>';
            html += '</div>';
          }
        }

        html += '</div>';
      }

      const stickies = (lineage.directives && lineage.directives.sticky) || [];
      const oneshots = (lineage.directives && lineage.directives.oneshot) || [];
      if (stickies.length > 0 || oneshots.length > 0) {
        html += '<div style="margin-top:12px;color:#a78bfa;font-size:0.85em;font-weight:600;">Active Directives:</div>';
        for (const d of stickies) html += '<div class="meta"><span>Sticky: ' + escapeHtml(d.text) + '</span></div>';
        for (const d of oneshots) html += '<div class="meta"><span>Oneshot: ' + escapeHtml(d.text) + '</span></div>';
      }

      html += '</div>';
    }
    html += '</div>';
  }
  el.innerHTML = html;
}

async function refresh() {
  try {
    const r = await fetch('/state.json?t=' + Date.now());
    const state = await r.json();
    renderState(state);
    document.getElementById('refresh-info').textContent = 'Last updated: ' + new Date().toLocaleTimeString() + ' (auto-refreshes every 3s)';
  } catch (e) {
    document.getElementById('refresh-info').textContent = 'Error loading: ' + e.message;
  }
}

refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>
"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/state.json"):
            try:
                with open(STATE_PATH, "r") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data.encode())
            except FileNotFoundError:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'{"error":"state.json not found"}')
        else:
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(HTML.encode())

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("0.0.0.0", PORT))
    s.listen(5)
    print(f"Ludus Magnus Viewer running at http://localhost:{PORT}")
    print(f"Reading state from: {os.path.abspath(STATE_PATH)}")
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler, bind_and_activate=False)
    server.socket = s
    server.server_address = s.getsockname()
    server.serve_forever()
