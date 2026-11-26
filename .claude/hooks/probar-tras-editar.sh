#!/usr/bin/env bash
# PostToolUse (Edit|Write): corre `npm test` si lo editado puede romper algo que
# las pruebas vigilan. Si falla, sale con código 2: Claude Code le devuelve el
# error a Claude y no puede seguir como si nada.
f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -z "$f" ] && exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${f#"$raiz"/}"
case "$rel" in
  src/*|tests/*|supabase-pir*-preguntas.sql|CLAUDE.md) ;;
  *) exit 0 ;;
esac
# CLAUDE.md no cambia código: no hace falta probarlo.
[ "$rel" = "CLAUDE.md" ] && exit 0
cd "$raiz" || exit 0
salida=$(npm test 2>&1)
if [ $? -ne 0 ]; then
  echo "npm test FALLA tras editar $rel. No sigas hasta arreglarlo:" >&2
  echo "$salida" | grep -E "^not ok|^# (tests|pass|fail)|Error|expected|actual" | head -40 >&2
  exit 2
fi
exit 0
