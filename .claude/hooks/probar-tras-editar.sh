#!/usr/bin/env bash
# PostToolUse (Edit|Write): corre `npm test` si lo editado puede romper algo que
# las pruebas vigilan. Si falla, sale con código 2: Claude Code le devuelve el
# error a Claude y no puede seguir como si nada.
entrada=$(cat)
f=$(printf '%s' "$entrada" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
# Sin jq no se apaga en silencio: se saca la ruta del JSON en crudo.
if [ -z "$f" ]; then
  f=$(printf '%s' "$entrada" | grep -Eo '"file_path" *: *"[^"]*"' | head -1 | sed 's/.*: *"//; s/"$//')
fi
[ -z "$f" ] && exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
rel="${f#"$raiz"/}"
case "$rel" in
  src/*|tests/*.test.mjs|supabase-pir*-preguntas.sql) ;;
  *) exit 0 ;;
esac
cd "$raiz" || exit 0
salida=$(timeout 100 npm test 2>&1)
codigo=$?
if [ $codigo -ne 0 ]; then
  echo "npm test FALLA tras editar $rel (código $codigo). No sigas hasta arreglarlo:" >&2
  [ $codigo -eq 124 ] && echo "(se agotó el plazo de 100 s)" >&2
  filtrado=$(echo "$salida" | grep -E "^not ok|^# (tests|pass|fail)|Error|expected|actual" | head -40)
  # Un fallo sin ninguna de esas palabras (un runner que no arranca, una opción
  # mala) no puede llegar mudo: se enseña el final de la salida tal cual.
  if [ -n "$filtrado" ]; then echo "$filtrado" >&2; else echo "$salida" | tail -25 >&2; fi
  exit 2
fi
exit 0
