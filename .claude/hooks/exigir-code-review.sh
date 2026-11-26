#!/usr/bin/env bash
# PreToolUse (Bash): bloquea fusionar un PR si no se ha pasado /code-review sobre
# el commit que se va a fusionar. La marca es `.claude/.code-review-ok` y guarda
# un SHA: cualquier commit nuevo la invalida.
#
# Falla CERRADO: si no puede leer el commit, si la marca está vacía o si hay un
# número de PR que no puede resolver, bloquea. No depende de `jq`.
entrada=$(cat)
cmd=$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$cmd" ]; then
  # Sin jq: el JSON en crudo trae los saltos de línea como \n y las comillas
  # escapadas; se deshacen para que el patrón vea la orden como es.
  cmd=$(printf '%s' "$entrada" | sed 's/\\n/\n/g; s/\\"/"/g')
fi

# Una orden de fusión REAL: `gh api` / `gh pr merge` al inicio de una orden (tras
# ; & | ( ` ' " o un salto de línea, y admitiendo VAR=x, sudo o command delante).
# Que el TEXTO de un commit o de una nota mencione la ruta no basta: ese fue el
# falso positivo que cazó la primera versión.
inicio='(^|[;&|(`'"'"'"\\])[[:space:]]*([A-Za-z_]+=[^[:space:]]*[[:space:]]+|sudo[[:space:]]+|command[[:space:]]+)*'
rest_api="${inicio}gh[[:space:]]+api[^|;&]*repos/[^[:space:]]+/pulls/[^[:space:]]+/merge"
graphql="${inicio}gh[[:space:]]+api[[:space:]]+graphql[^|;&]*mergePullRequest"
porcli="${inicio}gh[[:space:]]+pr[[:space:]]+merge"
es_fusion=""
for p in "$rest_api" "$graphql" "$porcli"; do
  printf '%s' "$cmd" | grep -Eq "$p" && es_fusion=1
done
[ -z "$es_fusion" ] && exit 0

raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
marca="$raiz/.claude/.code-review-ok"
local_head=$(git -C "$raiz" rev-parse HEAD 2>/dev/null)

# Si la orden da el NÚMERO del PR se compara con la cabeza REAL de ese PR (revisar
# la rama A y fusionar el PR B no puede valer). Admite {owner}/{repo}, que `gh`
# rellena él. Si hay número y no se puede resolver, se bloquea: caer al HEAD local
# sería justo el hueco. Sin número (una variable), se usa el HEAD local.
objetivo="$local_head"
ruta=$(printf '%s' "$cmd" | grep -Eo 'repos/[^[:space:]/]+/[^[:space:]/]+/pulls/[0-9]+/merge' | head -1)
if [ -n "$ruta" ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "BLOQUEADO: la orden fusiona un PR concreto y no encuentro \`gh\` para saber su cabeza." >&2
    exit 2
  fi
  limite=""; command -v timeout >/dev/null 2>&1 && limite="timeout 8"
  sha_pr=$($limite gh api "${ruta%/merge}" --jq .head.sha 2>/dev/null)
  # Solo vale un SHA de verdad (40 hex): un error o un "null" no sustituye a nada.
  if printf '%s' "$sha_pr" | grep -Eq '^[0-9a-f]{40}$'; then
    objetivo="$sha_pr"
  else
    echo "BLOQUEADO: no he podido averiguar la cabeza del PR de la orden ($ruta); sin ella no se puede comprobar la revisión." >&2
    exit 2
  fi
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
