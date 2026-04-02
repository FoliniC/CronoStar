#!/bin/bash

# Script per analizzare il coverage per il target "gold" di Home Assistant
# Basato sulla struttura Istanbul del JSON

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m'

BASE_DIR="$HOME/cronostar_git/cronostar_card"
COVERAGE_JSON="$BASE_DIR/coverage/coverage-final.json"

run_tests() {
    echo -e "${CYAN}🚀 Esecuzione di npm run test:coverage...${NC}"
    
    cd "$BASE_DIR" || {
        echo -e "${RED}Errore: Impossibile entrare in $BASE_DIR${NC}"
        return 1
    }
    
    npm run test:coverage 2>&1 | tail -50
    
    if [ -f "$COVERAGE_JSON" ]; then
        echo -e "${GREEN}✅ Trovato $COVERAGE_JSON${NC}"
    else
        echo -e "${RED}❌ File JSON non trovato!${NC}"
        return 1
    fi
}

# Analisi del JSON in formato Istanbul
analyze_json() {
    echo -e "${CYAN}📊 Analisi del file JSON (formato Istanbul)...${NC}"
    
    node << 'NODESCRIPT' > /tmp/coverage_analysis.txt
const fs = require('fs');
const path = require('path');

const coverageFile = process.env.HOME + '/cronostar_git/cronostar_card/coverage/coverage-final.json';
const baseDir = process.env.HOME + '/cronostar_git/cronostar_card';

if (!fs.existsSync(coverageFile)) {
    console.error('File non trovato');
    process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
const results = [];

for (const [filepath, data] of Object.entries(coverage)) {
    // Prendi solo i file .js sorgenti
    if (!filepath.endsWith('.js')) continue;
    if (filepath.includes('/test/') || filepath.includes('/tests/')) continue;
    if (filepath.includes('node_modules')) continue;
    
    const filename = path.basename(filepath);
    const relativePath = path.relative(baseDir, filepath);
    
    // Calcola LINE COVERAGE da statementMap (Istanbul format)
    let statementsTotal = 0;
    let statementsCovered = 0;
    let uncoveredLines = new Set();
    
    if (data.statementMap && data.s) {
        statementsTotal = Object.keys(data.statementMap).length;
        
        for (const [idx, hit] of Object.entries(data.s)) {
            if (hit > 0) {
                statementsCovered++;
            } else {
                // Aggiungi la linea non coperta
                const stmt = data.statementMap[idx];
                if (stmt && stmt.start) {
                    uncoveredLines.add(stmt.start.line);
                }
            }
        }
    }
    
    const linesPct = statementsTotal > 0 ? (statementsCovered * 100 / statementsTotal) : 0;
    
    // Calcola anche FUNCTION coverage
    let functionsTotal = 0;
    let functionsCovered = 0;
    if (data.fnMap && data.f) {
        functionsTotal = Object.keys(data.fnMap).length;
        functionsCovered = Object.values(data.f).filter(v => v > 0).length;
    }
    const funcsPct = functionsTotal > 0 ? (functionsCovered * 100 / functionsTotal) : 0;
    
    // Calcola BRANCH coverage
    let branchesTotal = 0;
    let branchesCovered = 0;
    if (data.branchMap && data.b) {
        for (const [idx, branches] of Object.entries(data.b)) {
            branchesTotal += branches.length;
            branchesCovered += branches.filter(v => v > 0).length;
        }
    }
    const branchesPct = branchesTotal > 0 ? (branchesCovered * 100 / branchesTotal) : 0;
    
    // Calcola dimensione reale del file
    let realFileSize = 0;
    const fullPath = path.join(baseDir, relativePath);
    if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        realFileSize = content.split('\n').length;
    } else if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        realFileSize = content.split('\n').length;
    }
    
    // Media pesata dei tre tipi di coverage
    const avgCoverage = (linesPct + funcsPct + branchesPct) / 3;
    
    // Calcola priorità: più basso è il coverage e più grande è il file, maggiore la priorità
    // Priority Score per HA Gold
    const priorityScore = (100 - linesPct) * (realFileSize / 100);
    
    // Salta file senza metriche significative
    if (statementsTotal === 0) continue;
    
    results.push({
        filename: filename,
        path: relativePath,
        linesPct: linesPct,
        funcsPct: funcsPct,
        branchesPct: branchesPct,
        avgCoverage: avgCoverage,
        statementsTotal: statementsTotal,
        statementsCovered: statementsCovered,
        uncoveredCount: uncoveredLines.size,
        uncoveredLines: Array.from(uncoveredLines).slice(0, 20),
        realSize: realFileSize,
        priorityScore: priorityScore
    });
}

// Ordina per percentuale lines coverage (crescente) - i più bassi prima
results.sort((a, b) => a.linesPct - b.linesPct);

// Output in formato pipe-separated
for (const r of results) {
    console.log(`${r.linesPct.toFixed(2)}|${r.funcsPct.toFixed(2)}|${r.branchesPct.toFixed(2)}|${r.avgCoverage.toFixed(2)}|${r.realSize}|${r.uncoveredCount}|${r.filename}|${r.path}|${r.priorityScore.toFixed(2)}|${r.uncoveredLines.join(',')}`);
}

// Statistiche
const totalFiles = results.length;
const avgLines = results.reduce((sum, r) => sum + r.linesPct, 0) / totalFiles;
const avgFuncs = results.reduce((sum, r) => sum + r.funcsPct, 0) / totalFiles;
const avgBranches = results.reduce((sum, r) => sum + r.branchesPct, 0) / totalFiles;
const filesBelow80 = results.filter(r => r.linesPct < 80).length;
const filesBelow60 = results.filter(r => r.linesPct < 60).length;
const filesBelow40 = results.filter(r => r.linesPct < 40).length;
const filesBelow20 = results.filter(r => r.linesPct < 20).length;

console.error(`\n📊 STATISTICHE COMPONENTE:`);
console.error(`📁 Totale file analizzati: ${totalFiles}`);
console.error(`📈 Lines coverage medio: ${avgLines.toFixed(2)}%`);
console.error(`📈 Functions coverage medio: ${avgFuncs.toFixed(2)}%`);
console.error(`📈 Branches coverage medio: ${avgBranches.toFixed(2)}%`);
console.error(``);
console.error(`⚠️  File con lines < 80%: ${filesBelow80} (da migliorare)`);
console.error(`🔴 File con lines < 60%: ${filesBelow60} (priorità alta)`);
console.error(`🔥 File con lines < 40%: ${filesBelow40} (priorità massima)`);
console.error(`💀 File con lines < 20%: ${filesBelow20} (critici)`);
console.error(`\n🎯 OBIETTIVO GOLD HA: lines coverage > 80% su tutti i file principali`);
NODESCRIPT
}

show_analysis() {
    local data_file="/tmp/coverage_analysis.txt"
    
    if [[ ! -f "$data_file" ]] || [[ ! -s "$data_file" ]]; then
        echo -e "${RED}❌ Nessun dato disponibile!${NC}"
        return 1
    fi
    
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}                     ANALISI COVERAGE PER TARGET GOLD HOME ASSISTANT${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════${NC}\n"
    
    printf "${YELLOW}%-4s %-32s %12s %12s %12s %10s %15s${NC}\n" "#" "FILE" "LINES %" "FUNCS %" "BRANCHES %" "RIGHE" "PRIORITA'"
    printf "${YELLOW}%-4s %-32s %12s %12s %12s %10s %15s${NC}\n" "-" "----" "-------" "-------" "---------" "-----" "---------"
    
    local count=0
    local critical=0 high=0 medium=0 good=0 gold=0
    
    while IFS='|' read -r lines_pct funcs_pct branches_pct avg_pct real_size uncovered_count filename path priority_score uncovered_list; do
        
        # Determina priorità per HA Gold
        local priority_label=""
        local color="$NC"
        
        if (( $(echo "$lines_pct >= 90" | bc -l 2>/dev/null) )); then
            priority_label="🏆 GOLD"
            color="$GREEN"
            ((gold++))
        elif (( $(echo "$lines_pct >= 80" | bc -l 2>/dev/null) )); then
            priority_label="✅ GOOD"
            color="$GREEN"
            ((good++))
        elif (( $(echo "$lines_pct >= 60" | bc -l 2>/dev/null) )); then
            priority_label="⚠️  MEDIUM"
            color="$YELLOW"
            ((medium++))
        elif (( $(echo "$lines_pct >= 40" | bc -l 2>/dev/null) )); then
            priority_label="🔴 HIGH"
            color="$RED"
            ((high++))
        else
            priority_label="🔥 CRITICAL"
            color="$RED"
            ((critical++))
        fi
        
        # Mostra solo i primi 40 file (i peggiori)
        if [[ $count -lt 40 ]]; then
            printf "${color}%-4s %-32s %11.2f%% %11.2f%% %11.2f%% %10s %15s${NC}\n" \
                "$((count+1))" "${filename:0:30}" "$lines_pct" "$funcs_pct" "$branches_pct" "$real_size" "$priority_label" 2>/dev/null
        fi
        
        ((count++))
    done < "$data_file"
    
    if [[ $count -gt 40 ]]; then
        echo -e "\n${YELLOW}... e altri $((count - 40)) file (usa CSV per lista completa)${NC}"
    fi
    
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${WHITE}📊 RIEPILOGO PER PRIORITA':${NC}"
    echo -e "   ${RED}🔥 CRITICAL (<40%):  $critical file  ← PRIORITA' ASSOLUTA${NC}"
    echo -e "   ${RED}🔴 HIGH (40-60%):    $high file      ← DA TESTARE URGENTEMENTE${NC}"
    echo -e "   ${YELLOW}⚠️  MEDIUM (60-80%):  $medium file     ← DA MIGLIORARE${NC}"
    echo -e "   ${GREEN}✅ GOOD (80-90%):    $good file       ← BUONO${NC}"
    echo -e "   ${GREEN}🏆 GOLD (>90%):      $gold file       ← OBIETTIVO RAGGIUNTO${NC}"
    echo -e "\n${WHITE}🎯 OBIETTIVO GOLD HOME ASSISTANT:${NC}"
    echo -e "   • Lines coverage > 80% su tutti i file principali"
    echo -e "   • Concentrare i test sui file CRITICAL e HIGH"
    echo -e "\n${WHITE}💡 PROSSIMI PASSI:${NC}"
    echo -e "   1. Analizzare i file CRITICAL (coverage < 40%)"
    echo -e "   2. Scrivere test per le funzioni non coperte"
    echo -e "   3. Raggiungere almeno 80% su tutti i file"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════${NC}\n"
}

export_csv() {
    local data_file="/tmp/coverage_analysis.txt"
    local output_file="coverage_report_$(date +%Y%m%d_%H%M%S).csv"
    
    echo "Rank,FileName,Path,LinesCoverage,FunctionsCoverage,BranchesCoverage,AvgCoverage,TotalLines,UncoveredLinesCount,PriorityScore,UncoveredLines" > "$output_file"
    
    local rank=1
    while IFS='|' read -r lines_pct funcs_pct branches_pct avg_pct real_size uncovered_count filename path priority_score uncovered_list; do
        echo "$rank,\"$filename\",\"$path\",$lines_pct,$funcs_pct,$branches_pct,$avg_pct,$real_size,$uncovered_count,$priority_score,\"$uncovered_list\"" >> "$output_file"
        ((rank++))
    done < "$data_file"
    
    echo -e "${GREEN}✅ Report esportato in: $output_file${NC}"
}

# Main
main() {
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}              ANALISI COVERAGE PER HOME ASSISTANT CUSTOM COMPONENT${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════════════════════════════════════════════${NC}\n"
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Errore: Node.js non installato!${NC}"
        exit 1
    fi
    
    if ! command -v bc &> /dev/null; then
        echo -e "${YELLOW}📦 Installazione bc...${NC}"
        sudo apt install bc -y
    fi
    
    run_tests
    
    if [[ ! -f "$COVERAGE_JSON" ]]; then
        echo -e "${RED}❌ File coverage JSON non trovato!${NC}"
        exit 1
    fi
    
    analyze_json
    
    if [[ ! -f "/tmp/coverage_analysis.txt" ]] || [[ ! -s "/tmp/coverage_analysis.txt" ]]; then
        echo -e "${RED}❌ Errore durante l'analisi!${NC}"
        exit 1
    fi
    
    show_analysis
    
    echo -n -e "\n${YELLOW}📊 Esportare report dettagliato in CSV? (s/N): ${NC}"
    read -r export_choice
    if [[ "$export_choice" =~ ^[Ss]$ ]]; then
        export_csv
    fi
    
    echo -e "\n${GREEN}✅ Analisi completata!${NC}"
}

main "$@"
