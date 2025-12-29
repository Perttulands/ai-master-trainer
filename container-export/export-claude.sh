#!/usr/bin/env bash
set -euo pipefail

include_home="0"
if [ "${1:-}" = "--include-home" ]; then
  include_home="1"
fi

out_dir="/workspace/container-export/out"
mkdir -p "$out_dir"

echo "Exporting repo .claude prompts (commands/skills)..."
if [ -d "/workspace/.claude" ]; then
  rm -rf "$out_dir/claude-repo"
  mkdir -p "$out_dir/claude-repo"
  cp -a "/workspace/.claude/commands" "$out_dir/claude-repo/" 2>/dev/null || true
  cp -a "/workspace/.claude/skills" "$out_dir/claude-repo/" 2>/dev/null || true
  echo "Wrote: $out_dir/claude-repo/"
else
  echo "Skipped: /workspace/.claude not found"
fi

if [ "$include_home" = "1" ]; then
  echo "Exporting Claude home credentials (may contain secrets)..."
  if [ -d "/home/node/.claude" ]; then
    tar -C "/home/node" -czf "$out_dir/claude-home.tgz" ".claude"
    echo "Wrote: $out_dir/claude-home.tgz"
  else
    echo "Skipped: /home/node/.claude not found"
  fi
else
  echo "Skipping Claude home credentials (pass --include-home to export)"
fi
