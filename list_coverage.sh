#!/bin/bash

# Script per analizzare il coverage dei file in base alla loro dimensione
# Salva questo script come "analyze-coverage.sh"
# Uso: chmod +x analyze-coverage.sh && ./analyze-coverage.sh

set -e

# Colori per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Funzione per calcolare la dimensione del file basata sulle righe non coperte
calculate_file_size() {
    local uncovered_info="$1"
    local avg_coverage="$2"
    
    # Se non ci sono informazioni sulle righe non coperte
    if [[ -z "$uncovered_info" ]] || [[ "$uncovered_info" == "null" ]]; then
        echo "0"
        return
    fi
    
    local line_count=0
    
    # Gestisci il caso speciale con ellissi
    if [[ "$uncovered_info" == "..."* ]]; then
        # Skip lines with ellipsis (sono troncate)
        echo "0"
        return
    fi
    
    # Split per virgola
    IFS=',' read -ra parts <<< "$uncovered_info"
    
    for part in "${parts[@]}"; do
        # Rimuovi spazi
        part=$(echo "$part" | xargs)
        
        # Check per range (es: 32-36)
        if [[ "$part" =~ ^([0-9]+)-([0-9]+)$ ]]; then
            start="${BASH_REMATCH[1]}"
            end="${BASH_REMATCH[2]}"
            count=$((end - start + 1))
            line_count=$((line_count + count))
        # Check per numero singolo
        elif [[ "$part" =~ ^[0-9]+$ ]]; then
            line_count=$((line_count + 1))
        fi
    done
    
    # Calcola dimensione totale: righe non coperte / (1 - coverage/100)
    if (( $(echo "$avg_coverage < 100" | bc -l) )); then
        total_size=$(echo "scale=0; $line_count / ((100 - $avg_coverage) / 100)" | bc)
        echo "$total_size"
    else
        echo "$line_count"
    fi
}

# Funzione per parsare il report
parse_coverage_report() {
    local report_file="$1"
    local -n files_array=$2
    
    # Dati del report (inline per esempio)
    cat > /tmp/coverage_report.txt << 'EOF'
src                        |    66.1 |    71.42 |   89.47 |   65.31 |                                                                                                                   
  config.js                 |     100 |    96.87 |     100 |     100 | 220                                                                                                               
  main.js                   |       0 |        0 |       0 |       0 | 3-177                                                                                                             
  styles.js                 |       0 |      100 |     100 |       0 | 6                                                                                                                 
  utils.js                  |     100 |      100 |     100 |     100 |                                                                                                                   
 src/core                   |   70.22 |    69.68 |   63.02 |   70.85 |                                                                                                                   
  CardContext.js            |   95.83 |      100 |   94.11 |   95.83 | 78                                                                                                                
  CardEventHandlers.js      |    80.2 |    59.71 |   77.19 |   81.36 | ...32-564,577,585-587,602,662,729-730,789-795,800-806,857-863,871-873,888,1061-1071,1082,1106,1112-1113,1133,1158 
  CardLifecycle.js          |    89.4 |    82.64 |   86.95 |   90.21 | 220,266,339,404-405,413-426,438,606,756-762,765-766,782,808,824,864-872,890-905,994,1003                          
  CardRenderer.js           |   35.89 |     78.8 |   15.68 |   35.71 | 22,49-87,189-263,432,485-628,655-854,873-957                                                                      
  CardSync.js               |   65.76 |     62.5 |   85.71 |   67.59 | 32-36,52,76-83,85-86,90-92,103-105,110-112,115-117,120-122,128-130,144-146,158-160,189                            
  CronoStar.js              |   56.74 |       80 |    90.9 |   57.06 | 25-60,113-206,356-359,427                                                                                         
  EventBus.js               |     100 |     87.5 |     100 |     100 | 37                                                                                                                
  cronostar_define_guard.js |       0 |        0 |       0 |       0 | 2-184                                                                                                             
 src/editor                 |   46.06 |    31.26 |   39.18 |   47.82 |                                                                                                                   
  CronoStarEditor.js        |   37.62 |    25.37 |   29.68 |   39.36 | ...10,826,828,835-843,851-853,862,889,899,911,946,956-1001,1030-1186,1227,1296-1302,1331,1336,1342-1347,1363-1395 
  EditorI18n.js             |     100 |     87.5 |     100 |     100 | 248,262,293                                                                                                       
  EditorWizard.js           |     100 |    68.75 |     100 |     100 | 12-20,35-37                                                                                                       
 src/editor/services        |       0 |        0 |       0 |       0 |                                                                                                                   
  service_handlers.js       |       0 |        0 |       0 |       0 | 9-165                                                                                                             
 src/editor/steps           |   43.42 |    36.48 |   48.38 |   43.98 |                                                                                                                   
  Step0Dashboard.js         |   56.81 |    42.25 |   61.11 |   57.31 | 40,58,81-120,141,143-158,170,202-247,367                                                                          
  Step1Preset.js            |   32.98 |    28.73 |   36.84 |   33.33 | 76,95-179,217,221-222,248-340,352-360                                                                             
  Step2Entities.js          |   52.38 |    54.16 |      50 |   52.38 | 40-77,118-135                                                                                                     
  Step3Options.js           |    8.51 |     12.9 |   28.57 |    9.09 | 67-146                                                                                                            
  Step4Automation.js        |    37.5 |    21.73 |   33.33 |    37.5 | 17-18,22,65-163                                                                                                   
  Step5Summary.js           |   82.85 |    70.27 |   83.33 |   82.85 | 11-19,239-240                                                                                                     
 src/editor/yaml            |     100 |    57.14 |     100 |     100 |                                                                                                                   
  yaml_generators.js        |     100 |    57.14 |     100 |     100 | 9-10                                                                                                              
 src/handlers               |   46.42 |    32.59 |   38.46 |   49.06 |                                                                                                                   
  keyboard_handler.js       |   33.95 |    24.53 |   25.71 |      36 | 41-42,65-72,81,148-151,156-161,181-185,192-193,205-209,234-257,276-277,315-316,322-723                            
  pointer_handler.js        |   69.84 |    55.91 |    64.7 |   73.65 | 67,70,83-85,159-162,176-177,185,195,200-204,237,248,265-272,279-284,303-307,312,332,356-390                       
 src/managers               |   62.76 |     50.7 |   65.67 |    63.3 |                                                                                                                   
  chart_manager.js          |   46.27 |    39.19 |   46.87 |   45.58 | 118,204-327,338-339,353-375,387,478-775,793-848,858,862-865,868-870,884-894,902-1066,1163-1165,1281               
  localization_manager.js   |     100 |      100 |     100 |     100 |                                                                                                                   
  profile_manager.js        |   99.34 |    83.72 |     100 |   99.33 | 343                                                                                                               
  selection_manager.js      |   95.32 |    78.43 |      90 |      97 | 200,293-301                                                                                                       
  shared_data_manager.js    |       0 |        0 |       0 |       0 | 11-302                                                                                                            
  state_manager.js          |   99.03 |     94.3 |     100 |   99.47 | 303                                                                                                               
 src/utils                  |   92.72 |    87.75 |     100 |   91.83 |                                                                                                                   
  editor_utils.js           |   92.85 |      100 |     100 |    90.9 | 53                                                                                                                
  filename_utils.js         |     100 |      100 |     100 |     100 |                                                                                                                   
  logger_utils.js           |   81.81 |       90 |     100 |   81.81 | 7-8                                                                                                               
  prefix_utils.js           |   95.23 |    82.14 |     100 |   94.44 | 34                                                                                                               
EOF

    local index=0
    
    while IFS= read -r line; do
        # Cerca righe che contengono file .js (con spazi iniziali)
        if [[ "$line" =~ ^[[:space:]]+([a-zA-Z0-9_]+\.js)[[:space:]]+\|[[:space:]]+([0-9\.]+)[[:space:]]+\|[[:space:]]+([0-9\.]+)[[:space:]]+\|[[:space:]]+([0-9\.]+)[[:space:]]+\|[[:space:]]+([0-9\.]+)[[:space:]]+\|(.*)$ ]]; then
            filename="${BASH_REMATCH[1]}"
            cov1="${BASH_REMATCH[2]}"
            cov2="${BASH_REMATCH[3]}"
            cov3="${BASH_REMATCH[4]}"
            cov4="${BASH_REMATCH[5]}"
            uncovered="${BASH_REMATCH[6]}"
            
            # Calcola media coverage
            avg=$(echo "scale=2; ($cov1 + $cov2 + $cov3 + $cov4) / 4" | bc)
            
            # Calcola dimensione stimata
            estimated_size=$(calculate_file_size "$uncovered" "$avg")
            
            # Calcola weighted coverage
            if [[ $estimated_size -gt 0 ]]; then
                weighted=$(echo "scale=2; ($avg * $estimated_size) / 100" | bc)
            else
                weighted=$avg
            fi
            
            # Salva in array associativo
            files_array[$index,"name"]="$filename"
            files_array[$index,"avg"]="$avg"
            files_array[$index,"size"]="$estimated_size"
            files_array[$index,"weighted"]="$weighted"
            files_array[$index,"cov1"]="$cov1"
            files_array[$index,"cov2"]="$cov2"
            files_array[$index,"cov3"]="$cov3"
            files_array[$index,"cov4"]="$cov4"
            files_array[$index,"uncovered"]="${uncovered:0:50}"  # Limita a 50 caratteri
            
            ((index++))
        fi
    done < /tmp/coverage_report.txt
    
    rm -f /tmp/coverage_report.txt
    echo "$index"
}

# Funzione per mostrare l'analisi
show_coverage_analysis() {
    local -n files=$1
    local count=$2
    
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${CYAN}    ANALISI COVERAGE PER DIMENSIONE${NC}"
    echo -e "${CYAN}========================================${NC}\n"
    
    # Crea array temporaneo per ordinamento
    local sorted_indices=()
    for ((i=0; i<count; i++)); do
        sorted_indices+=($i)
    done
    
    # Ordinamento bubble sort per weighted coverage (decrescente)
    for ((i=0; i<count-1; i++)); do
        for ((j=0; j<count-i-1; j++)); do
            idx1=${sorted_indices[$j]}
            idx2=${sorted_indices[$((j+1))]}
            if (( $(echo "${files[$idx2,"weighted"]} > ${files[$idx1,"weighted"]}" | bc -l) )); then
                temp=${sorted_indices[$j]}
                sorted_indices[$j]=${sorted_indices[$((j+1))]}
                sorted_indices[$((j+1))]=$temp
            fi
        done
    done
    
    # Intestazione tabella
    printf "${YELLOW}%-35s %12s %12s %15s %15s${NC}\n" "FILE" "COVERAGE %" "DIMENSIONE" "WEIGHTED" "PRIORITA'"
    printf "${YELLOW}%-35s %12s %12s %15s %15s${NC}\n" "----" "---------" "----------" "--------" "---------"
    
    # Mostra risultati
    for idx in "${sorted_indices[@]}"; do
        name="${files[$idx,"name"]}"
        avg="${files[$idx,"avg"]}"
        size="${files[$idx,"size"]}"
        weighted="${files[$idx,"weighted"]}"
        
        # Determina priorità
        if (( $(echo "$weighted >= 80" | bc -l) )); then
            priority="ALTA"
            color="$GREEN"
        elif (( $(echo "$weighted >= 50" | bc -l) )); then
            priority="MEDIA"
            color="$YELLOW"
        else
            priority="BASSA"
            color="$RED"
        fi
        
        size_display="$size"
        if [[ "$size" == "0" ]] || [[ -z "$size" ]]; then
            size_display="N/D"
        fi
        
        printf "${color}%-35s %11.2f%% %12s %14.2f %15s${NC}\n" \
            "$name" "$avg" "$size_display" "$weighted" "$priority"
    done
    
    echo -e "\n${CYAN}========================================${NC}"
    echo -e "${WHITE}LEGENDA PRIORITA':${NC}"
    echo -e "${GREEN}  ALTA   - Weighted Coverage >= 80% (file importanti ben coperti)${NC}"
    echo -e "${YELLOW}  MEDIA  - Weighted Coverage 50-80% (necessita miglioramento)${NC}"
    echo -e "${RED}  BASSA  - Weighted Coverage < 50% (priorità di test)${NC}"
    echo -e "${CYAN}========================================${NC}\n"
}

# Funzione per esportare in CSV
export_coverage_report() {
    local -n files=$1
    local count=$2
    local output_file="${3:-coverage_analysis_$(date +%Y%m%d_%H%M%S).csv}"
    
    # Crea header CSV
    echo "FileName,AvgCoverage,EstimatedSize,WeightedCoverage,Coverage1,Coverage2,Coverage3,Coverage4,UncoveredInfo" > "$output_file"
    
    # Ordina per weighted coverage decrescente
    local sorted_indices=()
    for ((i=0; i<count; i++)); do
        sorted_indices+=($i)
    done
    
    for ((i=0; i<count-1; i++)); do
        for ((j=0; j<count-i-1; j++)); do
            idx1=${sorted_indices[$j]}
            idx2=${sorted_indices[$((j+1))]}
            if (( $(echo "${files[$idx2,"weighted"]} > ${files[$idx1,"weighted"]}" | bc -l) )); then
                temp=${sorted_indices[$j]}
                sorted_indices[$j]=${sorted_indices[$((j+1))]}
                sorted_indices[$((j+1))]=$temp
            fi
        done
    done
    
    # Aggiungi dati
    for idx in "${sorted_indices[@]}"; do
        echo "\"${files[$idx,"name"]}\",${files[$idx,"avg"]},${files[$idx,"size"]},${files[$idx,"weighted"]},${files[$idx,"cov1"]},${files[$idx,"cov2"]},${files[$idx,"cov3"]},${files[$idx,"cov4"]},\"${files[$idx,"uncovered"]}\"" >> "$output_file"
    done
    
    echo -e "${GREEN}Report esportato in: $output_file${NC}"
}

# Main execution
main() {
    echo -e "${CYAN}Analisi report di coverage in corso...${NC}"
    
    # Verifica che bc sia installato (necessario per calcoli floating point)
    if ! command -v bc &> /dev/null; then
        echo -e "${RED}Errore: 'bc' non è installato. Installalo con: sudo apt install bc${NC}"
        exit 1
    fi
    
    # Dichiara array associativo
    declare -A files_data
    
    # Parsing del report
    file_count=$(parse_coverage_report "/tmp/coverage_report.txt" files_data)
    
    if [[ $file_count -eq 0 ]]; then
        echo -e "${RED}Nessun file trovato nel report!${NC}"
        exit 1
    fi
    
    # Mostra analisi
    show_coverage_analysis files_data $file_count
    
    # Esporta report (opzionale)
    echo -n -e "\n${YELLOW}Esportare i risultati in CSV? (s/N): ${NC}"
    read -r export_choice
    
    if [[ "$export_choice" =~ ^[Ss]$ ]]; then
        export_coverage_report files_data $file_count
    fi
    
    echo -e "${GREEN}Analisi completata!${NC}"
}

# Esegui lo script
main "$@"
