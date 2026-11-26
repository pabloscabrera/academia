#!/usr/bin/env bash
# PreToolUse (Bash): bloquea fusionar un PR si no consta una revisión de código
# del commit que se va a fusionar. La marca es `.claude/.code-review-ok` y guarda
# un SHA: cualquier commit nuevo la invalida.
#
# Es un FRENO, no una cerradura: la marca la puede escribir cualquiera y hay
# formas de fusionar que esto no ve (un alias, una función de shell, una consulta
# GraphQL en una variable). Falla CERRADO donde sí mira: si no puede leer el
# commit, si la marca está vacía o si hay un PR que no puede resolver, bloquea.
# No depende de `jq`.
entrada=$(cat)
cmd=$(printf '%s' "$entrada" | jq -r '.tool_input.command // empty' 2>/dev/null)
if [ -z "$cmd" ]; then
  # Sin jq: el JSON en crudo trae los saltos de línea como \n y las comillas
  # escapadas; se deshacen para que el patrón vea la orden como es.
  cmd=$(printf '%s' "$entrada" | sed 's/\\n/\n/g; s/\\"/"/g')
fi

# Las continuaciones con barra invertida al final de línea se unen: una fusión
# escrita en varias líneas así es UNA sola orden.
cmd=$(printf '%s' "$cmd" | sed -e ':a' -e '/\\$/N; s/\\\n/ /; ta')

# Una orden de fusión REAL, no el texto de un commit o de una nota que la nombra
# (ese fue el falso positivo que cazó la primera versión, cuatro veces).
#  - inicio: tras ; & | ( ` ' " \ o un salto de línea, admitiendo VAR=x, sudo,
#    command, env o xargs delante.
#  - gh: con o sin ruta (/usr/bin/gh) y con opciones globales (-R o/r, --repo o/r).
inicio='(^|[;&|(`'"'"'"\\])[[:space:]]*([A-Za-z_]+=[^[:space:]]*[[:space:]]+|sudo[[:space:]]+|command[[:space:]]+|env[[:space:]]+|xargs[[:space:]]+|exec[[:space:]]+|time[[:space:]]+|then[[:space:]]+|do[[:space:]]+|else[[:space:]]+|elif[[:space:]]+|![[:space:]]+|\{[[:space:]]+)*'
gh='([^[:space:]]*/)?gh([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*'
rest_api="${inicio}${gh}[[:space:]]+api[^|;&]*repos/[^[:space:]]+/pulls/[^[:space:]]+/merge"
conurl="${inicio}(curl|wget)[^|;&]*repos/[^[:space:]]+/pulls/[^[:space:]]+/merge"
graphql="${inicio}${gh}[[:space:]]+api[[:space:]]+graphql[^|;&]*mergePullRequest"
# Tras `merge` tiene que venir un espacio o el final de la orden: "`gh pr merge` y…"
# en un texto (comilla inversa pegada) no es una orden.
porcli="${inicio}${gh}[[:space:]]+pr[[:space:]]+merge([[:space:]]|\$|[;&|)])"
es_fusion=""; es_cli=""; es_graphql=""
printf '%s' "$cmd" | grep -Eq "$rest_api" && es_fusion=1
printf '%s' "$cmd" | grep -Eq "$conurl" && es_fusion=1
printf '%s' "$cmd" | grep -Eq "$porcli" && { es_fusion=1; es_cli=1; }
printf '%s' "$cmd" | grep -Eq "$graphql" && { es_fusion=1; es_graphql=1; }
[ -z "$es_fusion" ] && exit 0

# Una sola fusión por orden: el hook comprueba UN PR, así que con dos (`a; b`) la
# segunda pasaría sin que nadie mirase su cabeza. Se bloquea y se pide una a una.
n=$(printf '%s' "$cmd" | grep -Eo "$rest_api|$conurl|$porcli|$graphql" | wc -l)
if [ "$n" -gt 1 ]; then
  echo "BLOQUEADO: la orden fusiona más de un PR a la vez; el hook solo comprueba uno. Lánzalas por separado." >&2
  exit 2
fi

raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
marca="$raiz/.claude/.code-review-ok"
local_head=$(git -C "$raiz" rev-parse HEAD 2>/dev/null)
limite=""; command -v timeout >/dev/null 2>&1 && limite="timeout 8"
es_sha() { printf '%s' "$1" | grep -Eq '^[0-9a-f]{40}$'; }

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
  sha_pr=$($limite gh api "${ruta%/merge}" --jq .head.sha 2>/dev/null)
  if es_sha "$sha_pr"; then
    objetivo="$sha_pr"
  else
    echo "BLOQUEADO: no he podido averiguar la cabeza del PR de la orden ($ruta); sin ella no se puede comprobar la revisión." >&2
    exit 2
  fi
fi

# La mutación GraphQL trae un id opaco: no se puede saber qué PR es. Se bloquea y
# se pide la ruta REST con el número.
if [ -n "$es_graphql" ]; then
  echo "BLOQUEADO: la fusión por GraphQL no dice qué PR es. Usa la ruta REST con el número del PR." >&2
  exit 2
fi

# `gh pr merge [n|url|rama]` no trae la ruta REST: sin resolver QUÉ PR es se caería
# al HEAD local. Se saca el argumento (saltando las opciones y sus valores, y
# recortando en el primer ; & | )) y, si es un número, se resuelve por REST (que
# funciona aunque GraphQL esté vedado); si no, con `gh pr view`.
if [ -n "$es_cli" ]; then
  linea=$(printf '%s' "$cmd" | grep -E "$porcli" | head -1)
  seg=$(printf '%s' "$linea" | sed -nE 's/.*pr[[:space:]]+merge[[:space:]]*([^;&|)]*).*/\1/p' | head -1)
  repo=""; arg=""; salto=""
  for tok in $seg; do
    if [ -n "$salto" ]; then [ "$salto" = repo ] && repo="$tok"; salto=""; continue; fi
    case "$tok" in
      -R|--repo) salto=repo ;;
      --repo=*) repo="${tok#--repo=}" ;;
      -R=*) repo="${tok#-R=}" ;;
      -R?*) repo="${tok#-R}" ;;
      -b|--body|-t|--subject|-F|--body-file|-A|--author-email|--match-head-commit) salto=otro ;;
      -*) ;;
      *) [ -z "$arg" ] && arg="$tok" ;;
    esac
  done
  sha_pr=""
  if printf '%s' "$arg" | grep -Eq '^[0-9]+$'; then
    ph='{owner}/{repo}'
    sha_pr=$($limite gh api "repos/${repo:-$ph}/pulls/$arg" --jq .head.sha 2>/dev/null)
  fi
  if ! es_sha "$sha_pr"; then
    if [ -n "$repo" ]; then sha_pr=$($limite gh pr view ${arg:+"$arg"} -R "$repo" --json headRefOid --jq .headRefOid 2>/dev/null)
    else sha_pr=$($limite gh pr view ${arg:+"$arg"} --json headRefOid --jq .headRefOid 2>/dev/null); fi
  fi
  if es_sha "$sha_pr"; then
    objetivo="$sha_pr"
  else
    echo "BLOQUEADO: no he podido averiguar la cabeza del PR de la fusión por CLI (${arg:-la rama actual}); sin ella no se puede comprobar la revisión." >&2
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
  echo "BLOQUEADO: no consta una revisión de código del commit a fusionar ($objetivo)."
  echo "1) Ejecuta /code-review sobre el cambio y arregla lo que encuentre."
  echo "2) Solo entonces anota el SHA en .claude/.code-review-ok."
  echo "3) Vuelve a lanzar la fusión."
  echo "(La marca es un recordatorio y no una prueba: escribirla sin haber revisado es saltarse el paso.)"
} >&2
exit 2
