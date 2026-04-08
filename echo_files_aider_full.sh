#!/bin/bash

# Script con gestione errori e colori
base_dir="/home/carlo/cronostar_git"
files=(
    "cronostar_card/src/main.js"
    "cronostar_card/src/utils.js"
    "cronostar_card/src/config.js"
       "cronostar_card/src/managers/chart_manager.js"
       "cronostar_card/src/editor/steps/Step1Preset.js"
       "cronostar_card/src/editor/CronoStarEditor.js"
       "cronostar_card/src/core/CardEventHandlers.js"
       "cronostar_card/src/editor/steps/Step0Dashboard.js"
       "cronostar_card/src/core/CardLifecycle.js"
       "cronostar_card/src/core/cronostar_define_guard.js"
       "cronostar_card/src/handlers/pointer_handler.js"
       "cronostar_card/src/editor/services/service_handlers.js"
       "cronostar_card/src/core/CronoStar.js"
       "cronostar_card/src/managers/state_manager.js"
       "cronostar_card/src/handlers/keyboard_handler.js"
"ronostar_card/tests/chart_manager.test.js"
"cronostar_card/tests/card_event_handlers.test.js"                                                                                                                                      
"cronostar_card/tests/card_lifecycle.test.js"                                                                                                                                           
"cronostar_card/tests/cronostar.test.js"                                                                                                                                                
"cronostar_card/tests/pointer_handler.test.js"                                                                                                                                          
"cronostar_card/tests/service_handlers.test.js"                                                                                                                                         
"cronostar_card/tests/state_manager.test.js"                                                                                                                                            
"cronostar_card/tests/keyboard_handler.test.js"                                                                                                                                         
"cronostar_card/tests/Step0Dashboard.test.js"                                                                                                                                           
"cronostar_card/tests/Step1Preset.test.js"                                                                                                                                              
"cronostar_card/tests/cronostar_editor.test.js"                                                                                                                                         
"cronostar_card/tests/cronostar_define_guard.test.js"  
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
