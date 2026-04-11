#!/usr/bin/env bash
set -euo pipefail

git commit -m "$(cat <<'EOF'
Add T-series allocation variants and performance rank metric.

Introduce new dominance-cap strategy variants (T, T1, T2, T3) and add a performance-focused rank column based on normalized return and drawdown.
EOF
)"
