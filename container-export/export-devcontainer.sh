#!/usr/bin/env bash
set -euo pipefail

out_dir="/workspace/container-export/out"
mkdir -p "$out_dir"

echo "Exporting devcontainer setup..."
if [ -d "/workspace/.devcontainer" ]; then
  rm -rf "$out_dir/devcontainer"
  mkdir -p "$out_dir/devcontainer"
  cp -a "/workspace/.devcontainer/." "$out_dir/devcontainer/"
  echo "Wrote: $out_dir/devcontainer/"
else
  echo "Skipped: /workspace/.devcontainer not found"
fi
