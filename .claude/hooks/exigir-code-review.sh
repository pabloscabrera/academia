#!/usr/bin/env bash
# PreToolUse (Bash): bloquea fusionar un PR con `gh api` si no se ha pasado
# /code-review sobre el commit que se va a fusionar. La marca es
# `.claude/.code-review-ok` y guarda un SHA: cualquier commit nuevo la invalida.
#
# Falla CERRADO: si no puede leer el commit, o la marca está vacía, bloquea.
# No depende de `jq`: sin él, mira el JSON en crudo.
entrada=$(cat)
cmd=$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && cmd="$entrada"

# Una orden de fusión REAL: `gh api` al inicio de una orden (tras ; & | ( ` ' "
# o un salto de línea, y admitiendo VAR=x, sudo o command delante) con una ruta
# repos/<o>/<r>/<pulls>/<n>/merge. Que el TEXTO de un commit o de una nota
# mencione la ruta no basta: ese fue el falso positivo que cazó la primera
# versión.
inicio='(^|[;&|(`'"'"'"\\])[[:space:]]*([A-Za-z_]+=[^[:space:]]*[[:space:]]+|sudo[[:space:]]+|command[[:space:]]+)*'
patron="${inicio}gh[[:space:]]+api[^|;&]*repos/[^[:space:]]+/pulls/[^[:space:]]+/merge"
printf '%s' "$cmd" | grep -Eq "$patron" || exit 0

raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
marca="$raiz/.claude/.code-review-ok"
local_head=$(git -C "$raiz" rev-parse HEAD 2>/dev/null)

# Si la orden da el número del PR, se compara con la cabeza REAL de ese PR; si
# no se puede averiguar, con el HEAD local. Nunca con una cadena vacía.
objetivo="$local_head"
ruta=$(printf '%s' "$cmd" | grep -Eo 'repos/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/pulls/[0-9]+/merge' | head -1)
if [ -n "$ruta" ] && command -v gh >/dev/null 2>&1; then
  sha_pr=$(timeout 8 gh api "${ruta%/merge}" --jq .head.sha 2>/dev/null)
  # Solo vale un SHA de verdad (40 hex): un error o un "null" no sustituye al HEAD.
  printf '%s' "$sha_pr" | grep -Eq '^[0-9a-f]{40}$' && objetivo="$sha_pr"
fi

if [ -z "$objetivo" ]; then
  echo "BLOQUEADO: no he podido leer el commit a fusionar, y sin él no se puede comprobar la revisión." >&2
  exit 2
fi
marcado=""
[ -f "$marca" ] && marcado=$(tr -d '[:space:]' < "$marca")
if [ -n "$marcado" ] && [ "$marcado" = "$objetivo" ]; then
  exit 0
fi
{
  echo "BLOQUEADO: falta pasar /code-review sobre el commit a fusionar ($objetivo)."
  echo "1) Ejecuta /code-review sobre el cambio y arregla lo que encuentre."
  echo "2) Solo entonces: echo $objetivo > .claude/.code-review-ok"
  echo "3) Vuelve a lanzar la fusión."
} >&2
exit 2
