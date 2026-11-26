#!/usr/bin/env bash
# PreToolUse (Bash): bloquea fusionar un PR (`gh api .../pulls/N/merge`) si no se
# ha pasado /code-review sobre el commit actual. La marca es
# `.claude/.code-review-ok` y guarda el SHA revisado: cualquier commit nuevo la
# invalida, así que una revisión vieja no vale para código nuevo.
cmd=$(jq -r '.tool_input.command // empty')
echo "$cmd" | grep -Eq '(^|[;&|])[[:space:]]*gh[[:space:]]+api[^|;&]*repos/[^[:space:]]+/pulls/[^[:space:]]+/merge' || exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
marca="$raiz/.claude/.code-review-ok"
head=$(git -C "$raiz" rev-parse HEAD 2>/dev/null)
if [ -f "$marca" ] && [ "$(tr -d '[:space:]' < "$marca")" = "$head" ]; then
  exit 0
fi
{
  echo "BLOQUEADO: falta pasar /code-review sobre el commit actual ($head)."
  echo "1) Ejecuta /code-review sobre el cambio y arregla lo que encuentre."
  echo "2) Solo entonces: git rev-parse HEAD > .claude/.code-review-ok"
  echo "3) Vuelve a lanzar la fusión."
} >&2
exit 2
