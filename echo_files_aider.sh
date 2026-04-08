#!/bin/bash

# Script con gestione errori e colori
base_dir="/home/carlo/cronostar_git"
files=(
"cronostar_card/tests/chart_manager.test.js"
)

# Colori per output (opzionale)
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "# File estratti per Aider"
echo ""
echo "Ecco i file richiesti nel formato specificato:"
echo ""

for file in "${files[@]}"; do
    full_path="${base_dir}/${file}"
    
    if [ -f "$full_path" ]; then
        echo -e "${GREEN}✓${NC} $file"
        echo "\`\`\`"
        cat "$full_path"
        echo "\`\`\`"
        echo ""
    else
        echo -e "${RED}✗${NC} File non trovato: $file" >&2
        echo "  Percorso cercato: $full_path" >&2
    fi
done

# Statistiche finali
total=${#files[@]}
found=0
for file in "${files[@]}"; do
    if [ -f "${base_dir}/${file}" ]; then
        ((found++))
    fi
done

echo "" >&2
echo "Riepilogo: $found/$total file trovati" >&2
