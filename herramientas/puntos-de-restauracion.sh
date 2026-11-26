#!/usr/bin/env bash
# Lista los puntos de restauración de la web: cada PR fusionado en `main`, con el
# SHA de su commit de fusión. Se saca de GitHub cada vez, así que nunca está
# desfasada. Uso:  herramientas/puntos-de-restauracion.sh [cuántos]   (30 por defecto)
#
# Cómo volver atrás con esos SHA: ver herramientas/COMO-RETROCEDER.md
n="${1:-30}"
gh api -X GET "repos/pabloscabrera/academia/pulls" \
  -f state=closed -f per_page="$n" -f sort=updated -f direction=desc \
  --jq '.[] | select(.merged_at != null) | "PR #\(.number)\t\(.merge_commit_sha[0:12])\t\(.merged_at[0:10])\t\(.title)"'
