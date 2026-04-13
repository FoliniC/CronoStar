#!/bin/bash

# Script per analizzare il coverage per il target "gold" di Home Assistant
# Basato sulla struttura Istanbul del JSON
# Supporta analisi di file specifico: ./analyze-coverage.sh [nomefile]

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m'

BASE_DIR="$HOME/cronostar_git/cronostar_card"
COVERAGE_JSON="$BASE_DIR/coverage/coverage-final.json"
COVERAGE_DIR="$BASE_DIR/coverage"

run_tests() {
    echo -e "${CYAN}📁 File di test disponibili:${NC}"
    find "$BASE_DIR/tests" "$BASE_DIR/src/__tests__" -type f \( -name "*.test.js" -o -name "*.spec.js" \) 2>/dev/null | sed 's/^/  /'
    
    echo -e "\n${CYAN}🚀 Esecuzione di npm run test:coverage con output completo...${NC}"
    
    cd "$BASE_DIR" || {
        echo -e "${RED}Errore: Impossibile entrare in $BASE_DIR${NC}"
        return 1
    }
    
    # Esegue i test senza tagliare l'output
    npm run test:coverage
    
    if [ -f "$COVERAGE_JSON" ]; then
        echo -e "${GREEN}✅ Trovato $COVERAGE_JSON${NC}"
    else
        echo -e "${RED}❌ File JSON non trovato!${NC}"
        return 1
    fi
}

# Funzione per trovare quali test coprono determinate linee/funzioni
find_tests_for_coverage() {
    local source_file="$1"
    
    node << 'NODESCRIPT'
const fs = require('fs');
const path = require('path');

const coverageFile = process.env.HOME + '/cronostar_git/cronostar_card/coverage/coverage-final.json';
const sourceFile = process.env.SOURCE_FILE;

if (!sourceFile) {
    process.exit(0);
}

if (!fs.existsSync(coverageFile)) {
    process.exit(0);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));

// Cerca il file sorgente
let sourceData = null;
let sourcePath = null;
for (const [filepath, data] of Object.entries(coverage)) {
    if (filepath.endsWith(sourceFile) || filepath.includes(sourceFile)) {
        sourceData = data;
        sourcePath = filepath;
        break;
    }
}

if (!sourceData) {
    process.exit(0);
}

console.log('\n🔍 ANALISI TEST PER FILE: ' + path.basename(sourcePath));
console.log('='.repeat(80));

// Raccogli informazioni sulle funzioni (incluse anonime)
const coveredFunctions = [];
const uncoveredFunctions = [];

if (sourceData.fnMap && sourceData.f) {
    for (const [idx, hit] of Object.entries(sourceData.f)) {
        const fn = sourceData.fnMap[idx];
        if (fn) {
            let name = fn.name;
            if (!name || name === '' || name.startsWith('(')) {
                // Funzione anonima: usa la linea
                const line = fn.decl ? fn.decl.start.line : (fn.loc ? fn.loc.start.line : 0);
                name = `anonima_linea_${line}`;
            }
            if (hit > 0) {
                coveredFunctions.push({ name: name, hits: hit });
            } else {
                const line = fn.decl ? fn.decl.start.line : (fn.loc ? fn.loc.start.line : 0);
                uncoveredFunctions.push({ name: name, line: line });
            }
        }
    }
}

console.log('\n📊 STATISTICHE TEST:');
console.log('  Funzioni coperte: ' + coveredFunctions.length);
console.log('  Funzioni non coperte: ' + uncoveredFunctions.length);

if (coveredFunctions.length > 0) {
    console.log('\n✅ FUNZIONI COPERTE DAI TEST (prime 30):');
    coveredFunctions.slice(0, 30).forEach(fn => {
        console.log('  - ' + fn.name + ' [eseguita ' + fn.hits + ' volte]');
    });
    if (coveredFunctions.length > 30) {
        console.log('  ... e altre ' + (coveredFunctions.length - 30) + ' funzioni');
    }
}

if (uncoveredFunctions.length > 0) {
    console.log('\n❌ FUNZIONI NON COPERTE (prime 30):');
    uncoveredFunctions.slice(0, 30).forEach(fn => {
        console.log('  - ' + fn.name + ' (linea ' + fn.line + ')');
    });
    if (uncoveredFunctions.length > 30) {
        console.log('  ... e altre ' + (uncoveredFunctions.length - 30) + ' funzioni');
    }
}

// Normalizzazione nomi per matching case-insensitive e senza underscore/trattini
function normalizeName(name) {
    return name.toLowerCase()
        .replace(/[_-]/g, '')          // rimuove underscore e trattini
        .replace(/\.test\.js$/, '')
        .replace(/\.js$/, '');
}

const normalizedSource = normalizeName(path.basename(sourceFile));
const possibleTestFiles = [];

const testDirs = [
    path.join(process.env.HOME, '/cronostar_git/cronostar_card/tests'),
    path.join(process.env.HOME, '/cronostar_git/cronostar_card/src/__tests__'),
    path.join(process.env.HOME, '/cronostar_git/cronostar_card/test'),
    path.join(process.env.HOME, '/cronostar_git/cronostar_card/__tests__')
];

testDirs.forEach(testDir => {
    if (fs.existsSync(testDir)) {
        const testFiles = fs.readdirSync(testDir);
        testFiles.forEach(file => {
            const normalizedTest = normalizeName(file);
            // Match se il nome normalizzato del sorgente è contenuto in quello del test o viceversa
            if (normalizedTest.includes(normalizedSource) || normalizedSource.includes(normalizedTest)) {
                possibleTestFiles.push(path.join(testDir, file));
            }
        });
    }
});

if (possibleTestFiles.length > 0) {
    console.log('\n📁 FILE DI TEST CORRELATI TROVATI:');
    possibleTestFiles.forEach(file => {
        console.log('  - ' + file);
    });
} else {
    console.log('\n⚠️  Nessun file di test specifico trovato');
    console.log('  Directory cercate:');
    testDirs.forEach(dir => {
        if (fs.existsSync(dir)) {
            console.log('    * ' + dir);
            const files = fs.readdirSync(dir);
            // Fallback: mostra file che contengono parti del nome originale
            const baseName = path.basename(sourceFile, '.js').toLowerCase();
            const matching = files.filter(f => f.toLowerCase().includes(baseName.replace(/editor|card|manager/gi, '')) ||
                                               f.toLowerCase().includes('cronostar'));
            if (matching.length > 0) {
                console.log('      File che potrebbero corrispondere:');
                matching.forEach(f => console.log('        - ' + f));
            }
        }
    });
}

console.log('\n' + '='.repeat(80) + '\n');

NODESCRIPT
}

# Analisi del JSON in formato Istanbul per un file specifico
analyze_single_file() {
    local target_file="$1"
    
    echo -e "${CYAN}📊 Analisi dettagliata del file: ${WHITE}$target_file${NC}\n"
    
    # Passa il target file come variabile d'ambiente al node
    TARGET_FILE="$target_file" node << 'NODESCRIPT'
const fs = require('fs');
const path = require('path');

const coverageFile = process.env.HOME + '/cronostar_git/cronostar_card/coverage/coverage-final.json';
const baseDir = process.env.HOME + '/cronostar_git/cronostar_card';
const targetFile = process.env.TARGET_FILE;

if (!targetFile) {
    console.error('Nessun file specificato');
    process.exit(1);
}

if (!fs.existsSync(coverageFile)) {
    console.error('File coverage non trovato:', coverageFile);
    process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));

// Cerca il file target nel coverage
let foundFile = null;
let foundPath = null;

for (const [filepath, data] of Object.entries(coverage)) {
    if (filepath.endsWith(targetFile) || 
        filepath.includes(targetFile) ||
        path.basename(filepath) === path.basename(targetFile)) {
        foundFile = data;
        foundPath = filepath;
        break;
    }
}

if (!foundFile) {
    console.error('File non trovato nel coverage:', targetFile);
    console.error('\nFile disponibili nel coverage:');
    let count = 0;
    for (const [filepath] of Object.entries(coverage)) {
        if (filepath.endsWith('.js') && !filepath.includes('node_modules')) {
            console.error('  -', path.basename(filepath), ':', filepath);
            count++;
            if (count >= 20) {
                console.error('  ... e altri');
                break;
            }
        }
    }
    process.exit(1);
}

const filename = path.basename(foundPath);
const relativePath = path.relative(baseDir, foundPath);

// Analisi LINE COVERAGE
let statementsTotal = 0;
let statementsCovered = 0;
const uncoveredStatements = [];

if (foundFile.statementMap && foundFile.s) {
    statementsTotal = Object.keys(foundFile.statementMap).length;
    
    for (const [idx, hit] of Object.entries(foundFile.s)) {
        if (hit > 0) {
            statementsCovered++;
        } else {
            const stmt = foundFile.statementMap[idx];
            if (stmt && stmt.start) {
                uncoveredStatements.push({
                    line: stmt.start.line,
                    column: stmt.start.column,
                    text: ''
                });
            }
        }
    }
}

const linesPct = statementsTotal > 0 ? (statementsCovered * 100 / statementsTotal) : 0;

// Analisi FUNCTION coverage - include funzioni anonime
let functionsTotal = 0;
let functionsCovered = 0;
const uncoveredFunctions = [];
const coveredFunctions = [];

if (foundFile.fnMap && foundFile.f) {
    for (const [idx, hit] of Object.entries(foundFile.f)) {
        const fn = foundFile.fnMap[idx];
        if (fn) {
            let name = fn.name;
            let line = fn.decl ? fn.decl.start.line : (fn.loc ? fn.loc.start.line : 0);
            if (!name || name === '' || name.startsWith('(')) {
                name = `anonima_linea_${line}`;
            }
            functionsTotal++;
            if (hit > 0) {
                functionsCovered++;
                coveredFunctions.push({
                    name: name,
                    line: line,
                    hits: hit
                });
            } else {
                uncoveredFunctions.push({
                    name: name,
                    line: line
                });
            }
        }
    }
}

const funcsPct = functionsTotal > 0 ? (functionsCovered * 100 / functionsTotal) : 0;

// Analisi BRANCH coverage
let branchesTotal = 0;
let branchesCovered = 0;
const uncoveredBranches = [];

if (foundFile.branchMap && foundFile.b) {
    for (const [idx, branches] of Object.entries(foundFile.b)) {
        const branchInfo = foundFile.branchMap[idx];
        branchesTotal += branches.length;
        
        branches.forEach((hit, branchIdx) => {
            if (hit > 0) {
                branchesCovered++;
            } else {
                if (branchInfo && branchInfo.locations && branchInfo.locations[branchIdx]) {
                    const line = branchInfo.locations[branchIdx].start.line;
                    if (line && !isNaN(line)) {
                        uncoveredBranches.push({
                            line: line,
                            type: branchInfo.type || 'branch'
                        });
                    }
                }
            }
        });
    }
}

const branchesPct = branchesTotal > 0 ? (branchesCovered * 100 / branchesTotal) : 0;

// Calcola dimensione reale del file
let realFileSize = 0;
let fileContent = '';
const fullPath = path.join(baseDir, relativePath);
if (fs.existsSync(fullPath)) {
    fileContent = fs.readFileSync(fullPath, 'utf8');
    realFileSize = fileContent.split('\n').length;
} else if (fs.existsSync(foundPath)) {
    fileContent = fs.readFileSync(foundPath, 'utf8');
    realFileSize = fileContent.split('\n').length;
}

// Ottieni il testo delle righe non coperte
const lines = fileContent.split('\n');
uncoveredStatements.forEach(stmt => {
    if (lines[stmt.line - 1]) {
        stmt.text = lines[stmt.line - 1].trim();
    }
});

// Output dettagliato
console.log('\n' + '='.repeat(80));
console.log('FILE ANALIZZATO:', filename);
console.log('PERCORSO:', relativePath);
console.log('='.repeat(80) + '\n');

console.log('METRICHE DI COPERTURA:');
console.log('  Lines coverage:     ' + linesPct.toFixed(2) + '% (' + statementsCovered + '/' + statementsTotal + ' statements)');
console.log('  Functions coverage: ' + funcsPct.toFixed(2) + '% (' + functionsCovered + '/' + functionsTotal + ' functions)');
console.log('  Branches coverage:  ' + branchesPct.toFixed(2) + '% (' + branchesCovered + '/' + branchesTotal + ' branches)');

const avgCoverage = (linesPct + funcsPct + branchesPct) / 3;
console.log('\nCopertura media: ' + avgCoverage.toFixed(2) + '%');

// Valutazione per HA Gold
console.log('\nVALUTAZIONE TARGET GOLD HA:');
if (linesPct >= 90) {
    console.log('  OBIETTIVO GOLD RAGGIUNTO! (' + linesPct.toFixed(2) + '% >= 90%)');
} else if (linesPct >= 80) {
    console.log('  OBIETTIVO GOOD RAGGIUNTO (' + linesPct.toFixed(2) + '% >= 80%), manca il GOLD (90%)');
} else if (linesPct >= 60) {
    console.log('  Obiettivo non raggiunto (' + linesPct.toFixed(2) + '% < 80%) - Priorita MEDIA');
} else if (linesPct >= 40) {
    console.log('  Obiettivo non raggiunto (' + linesPct.toFixed(2) + '% < 80%) - Priorita ALTA');
} else {
    console.log('  Obiettivo non raggiunto (' + linesPct.toFixed(2) + '% < 80%) - Priorita CRITICA');
}

// Mostra funzioni coperte (max 20)
if (coveredFunctions.length > 0) {
    console.log('\nFUNZIONI COPERTE DAI TEST (' + coveredFunctions.length + '):');
    coveredFunctions.slice(0, 20).forEach(fn => {
        console.log('  * ' + fn.name + ' [linea ' + fn.line + ', ' + fn.hits + ' exec]');
    });
    if (coveredFunctions.length > 20) {
        console.log('  ... e altre ' + (coveredFunctions.length - 20) + ' funzioni');
    }
}

// Dettaglio funzioni non coperte
if (uncoveredFunctions.length > 0) {
    console.log('\nFUNZIONI NON TESTATE (' + uncoveredFunctions.length + '):');
    uncoveredFunctions.slice(0, 15).forEach((fn, idx) => {
        console.log('  ' + (idx+1) + '. ' + fn.name + ' (linea ' + fn.line + ')');
    });
    if (uncoveredFunctions.length > 15) {
        console.log('  ... e altre ' + (uncoveredFunctions.length - 15) + ' funzioni');
    }
}

// Dettaglio branch non coperti
if (uncoveredBranches.length > 0) {
    const validLines = [...new Set(uncoveredBranches.map(b => b.line).filter(l => l && !isNaN(l)))];
    if (validLines.length > 0) {
        console.log('\nBRANCH NON TESTATI (' + validLines.length + '):');
        validLines.slice(0, 10).forEach(line => {
            console.log('  - Linea ' + line);
        });
        if (validLines.length > 10) {
            console.log('  ... e altri ' + (validLines.length - 10) + ' branch');
        }
    }
}

// Mostra righe non coperte con contesto (max 10)
if (uncoveredStatements.length > 0) {
    console.log('\nRIGHE NON COPERTE (' + uncoveredStatements.length + '):');
    
    const uniqueLines = new Map();
    uncoveredStatements.forEach(stmt => {
        if (!uniqueLines.has(stmt.line)) {
            uniqueLines.set(stmt.line, stmt.text);
        }
    });
    
    const sortedLines = Array.from(uniqueLines.keys()).sort((a,b) => a-b);
    const linesToShow = sortedLines.slice(0, 10);
    
    linesToShow.forEach(line => {
        const code = uniqueLines.get(line);
        console.log('  Linea ' + line + ': ' + (code ? code.substring(0, 80) : ''));
    });
    
    if (sortedLines.length > 10) {
        console.log('  ... e altre ' + (sortedLines.length - 10) + ' righe non coperte');
    }
}

console.log('\n' + '='.repeat(80) + '\n');

NODESCRIPT
    
    # Analizza quali test coprono il file
    SOURCE_FILE="$target_file" find_tests_for_coverage
}

# Analisi del JSON in formato Istanbul per tutti i file
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
    if (!filepath.endsWith('.js')) continue;
    if (filepath.includes('/test/') || filepath.includes('/tests/')) continue;
    if (filepath.includes('node_modules')) continue;
    
    const filename = path.basename(filepath);
    const relativePath = path.relative(baseDir, filepath);
    
    let statementsTotal = 0;
    let statementsCovered = 0;
    let uncoveredLines = new Set();
    
    if (data.statementMap && data.s) {
        statementsTotal = Object.keys(data.statementMap).length;
        
        for (const [idx, hit] of Object.entries(data.s)) {
            if (hit > 0) {
                statementsCovered++;
            } else {
                const stmt = data.statementMap[idx];
                if (stmt && stmt.start) {
                    uncoveredLines.add(stmt.start.line);
                }
            }
        }
    }
    
    const linesPct = statementsTotal > 0 ? (statementsCovered * 100 / statementsTotal) : 0;
    
    let functionsTotal = 0;
    let functionsCovered = 0;
    if (data.fnMap && data.f) {
        for (const [idx, hit] of Object.entries(data.f)) {
            const fn = data.fnMap[idx];
            if (fn) {
                functionsTotal++;
                if (hit > 0) functionsCovered++;
            }
        }
    }
    const funcsPct = functionsTotal > 0 ? (functionsCovered * 100 / functionsTotal) : 0;
    
    let branchesTotal = 0;
    let branchesCovered = 0;
    if (data.branchMap && data.b) {
        for (const [idx, branches] of Object.entries(data.b)) {
            branchesTotal += branches.length;
            branchesCovered += branches.filter(v => v > 0).length;
        }
    }
    const branchesPct = branchesTotal > 0 ? (branchesCovered * 100 / branchesTotal) : 0;
    
    let realFileSize = 0;
    const fullPath = path.join(baseDir, relativePath);
    if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        realFileSize = content.split('\n').length;
    } else if (fs.existsSync(filepath)) {
        const content = fs.readFileSync(filepath, 'utf8');
        realFileSize = content.split('\n').length;
    }
    
    const avgCoverage = (linesPct + funcsPct + branchesPct) / 3;
    const priorityScore = (100 - linesPct) * (realFileSize / 100);
    
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

results.sort((a, b) => a.linesPct - b.linesPct);

for (const r of results) {
    console.log(`${r.linesPct.toFixed(2)}|${r.funcsPct.toFixed(2)}|${r.branchesPct.toFixed(2)}|${r.avgCoverage.toFixed(2)}|${r.realSize}|${r.uncoveredCount}|${r.filename}|${r.path}|${r.priorityScore.toFixed(2)}|${r.uncoveredLines.join(',')}`);
}

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
    
    if [[ $# -gt 0 ]]; then
        local target_file="$1"
        echo -e "${CYAN}🔍 Modalità analisi singolo file: ${WHITE}$target_file${NC}\n"
        analyze_single_file "$target_file"
    else
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
    fi
    
    echo -e "\n${GREEN}✅ Analisi completata!${NC}"
}

main "$@"
