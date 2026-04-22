# Script per analizzare il coverage - VERSIONE CORRETTA PER PS5.1

$BASE_DIR = "E:\J19173\temp\cronostar\cronostar_card"
$COVERAGE_JSON = "$BASE_DIR\coverage\coverage-final.json"

function Run-Tests {
    Write-Host "Esecuzione di npm run test:coverage..."

    Set-Location -Path $BASE_DIR -ErrorAction Stop

    npm run test:coverage 2>&1 | Select-Object -Last 50

    if (Test-Path $COVERAGE_JSON) {
        Write-Host "Trovato $COVERAGE_JSON"
        return $true
    } else {
        Write-Host "File $COVERAGE_JSON non trovato"
        return $false
    }
}

function Analyze-Json {
    Write-Host "Analisi del file JSON (formato Istanbul)..."

    $nodeScript = @'
const fs = require('fs');
const path = require('path');

const coverageFile = 'E:\\J19173\\temp\\cronostar\\cronostar_card\\coverage\\coverage-final.json';
const baseDir = 'E:\\J19173\\temp\\cronostar\\cronostar_card';

if (!fs.existsSync(coverageFile)) {
    console.error('File non trovato: ' + coverageFile);
    process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coverageFile, 'utf8'));
const results = [];

for (const [filepath, data] of Object.entries(coverage)) {
    if (!filepath.endsWith('.js')) continue;
    if (filepath.includes('/test/') || filepath.includes('/tests/')) continue;
    if (filepath.includes('node_modules')) continue;
    if (filepath.includes('\\test\\') || filepath.includes('\\tests\\')) continue;

    const filename = path.basename(filepath);
    const relativePath = path.relative(baseDir, filepath);

    let statementsTotal = 0;
    let statementsCovered = 0;
    let uncoveredLines = new Set();
    let uncoveredDetails = [];

    if (data.statementMap && data.s) {
        statementsTotal = Object.keys(data.statementMap).length;

        for (const [idx, hit] of Object.entries(data.s)) {
            if (hit > 0) {
                statementsCovered++;
            } else {
                const stmt = data.statementMap[idx];
                if (stmt && stmt.start) {
                    const line = stmt.start.line;
                    uncoveredLines.add(line);
                    uncoveredDetails.push({
                        line: line,
                        text: ''
                    });
                }
            }
        }
    }

    const linesPct = statementsTotal > 0 ? (statementsCovered * 100 / statementsTotal) : 0;

    let functionsTotal = 0;
    let functionsCovered = 0;
    if (data.fnMap && data.f) {
        functionsTotal = Object.keys(data.fnMap).length;
        functionsCovered = Object.values(data.f).filter(v => v > 0).length;
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
    let fileContent = '';
    const fullPath = path.join(baseDir, relativePath);
    if (fs.existsSync(fullPath)) {
        fileContent = fs.readFileSync(fullPath, 'utf8');
        realFileSize = fileContent.split('\n').length;
    } else if (fs.existsSync(filepath)) {
        fileContent = fs.readFileSync(filepath, 'utf8');
        realFileSize = fileContent.split('\n').length;
    }

    if (fileContent && uncoveredDetails.length > 0) {
        const lines = fileContent.split('\n');
        for (const detail of uncoveredDetails) {
            if (detail.line <= lines.length) {
                detail.text = lines[detail.line - 1].trim();
            }
        }
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
        uncoveredDetails: uncoveredDetails.slice(0, 20),
        realSize: realFileSize,
        priorityScore: priorityScore
    });
}

results.sort((a, b) => a.linesPct - b.linesPct);

// Output principale pipe-separated
for (const r of results) {
    console.log(`${r.linesPct.toFixed(2)}|${r.funcsPct.toFixed(2)}|${r.branchesPct.toFixed(2)}|${r.avgCoverage.toFixed(2)}|${r.realSize}|${r.uncoveredCount}|${r.filename}|${r.path}|${r.priorityScore.toFixed(2)}|${r.uncoveredLines.join(',')}`);
}

// Output dettagliato delle linee non coperte
console.error(`\n--- DETAILED UNCOVERED LINES ---`);
for (const r of results) {
    if (r.linesPct < 100 && r.uncoveredDetails.length > 0) {
        console.error(`\nFile: ${r.filename} (${r.linesPct.toFixed(2)}% covered)`);
        console.error(`Path: ${r.path}`);
        console.error(`Uncovered lines:`);
        for (const detail of r.uncoveredDetails) {
            console.error(`  Line ${detail.line}: ${detail.text.substring(0, 100)}`);
        }
        console.error(`-`.repeat(60));
    }
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

console.error(`\nSTATISTICHE COMPONENTE:`);
console.error(`Totale file analizzati: ${totalFiles}`);
console.error(`Lines coverage medio: ${avgLines.toFixed(2)}%`);
console.error(`Functions coverage medio: ${avgFuncs.toFixed(2)}%`);
console.error(`Branches coverage medio: ${avgBranches.toFixed(2)}%`);
console.error(``);
console.error(`File con lines < 80%: ${filesBelow80} (da migliorare)`);
console.error(`File con lines < 60%: ${filesBelow60} (priorita alta)`);
console.error(`File con lines < 40%: ${filesBelow40} (priorita massima)`);
console.error(`File con lines < 20%: ${filesBelow20} (critici)`);
console.error(`\nOBIETTIVO GOLD HA: lines coverage > 80% su tutti i file principali`);
'@

    # CORREZIONE: Senza Tee-Object, salva direttamente in file e mostra output
    $output = $nodeScript | node 2>&1
    $output | Out-File -FilePath "$env:TEMP\coverage_analysis.txt" -Encoding UTF8
    $output | Write-Host
}

function Show-Analysis {
    $dataFile = "$env:TEMP\coverage_analysis.txt"

    if (-not (Test-Path $dataFile) -or (Get-Content $dataFile | Measure-Object -Line).Lines -eq 0) {
        Write-Host "File di analisi non trovato o vuoto"
        return $false
    }

    Write-Host "`n==============================================================================="
    Write-Host "           ANALISI COVERAGE PER TARGET GOLD HOME ASSISTANT"
    Write-Host "===============================================================================`n"

    Write-Host ("{0,-4} {1,-32} {2,12} {3,12} {4,12} {5,10} {6,15}" -f "#", "FILE", "LINES %", "FUNCS %", "BRANCHES %", "RIGHE", "PRIORITA'")
    Write-Host ("{0,-4} {1,-32} {2,12} {3,12} {4,12} {5,10} {6,15}" -f "-", "----", "-------", "-------", "---------", "-----", "---------")

    $count = 0
    $critical = 0; $high = 0; $medium = 0; $good = 0; $gold = 0

    Get-Content $dataFile | ForEach-Object {
        $parts = $_ -split '\|'
        if ($parts.Count -ge 10) {
            $lines_pct = [double]$parts[0]
            $funcs_pct = [double]$parts[1]
            $branches_pct = [double]$parts[2]
            $avg_pct = [double]$parts[3]
            $real_size = [int]$parts[4]
            $uncovered_count = [int]$parts[5]
            $filename = $parts[6]
            $path = $parts[7]
            $priority_score = [double]$parts[8]
            $uncovered_list = $parts[9]

            $priority_label = ""

            if ($lines_pct -ge 90) {
                $priority_label = "GOLD"
                $gold++
            } elseif ($lines_pct -ge 80) {
                $priority_label = "GOOD"
                $good++
            } elseif ($lines_pct -ge 60) {
                $priority_label = "MEDIUM"
                $medium++
            } elseif ($lines_pct -ge 40) {
                $priority_label = "HIGH"
                $high++
            } else {
                $priority_label = "CRITICAL"
                $critical++
            }

            if ($count -lt 40) {
                Write-Host ("{0,-4} {1,-32} {2,11:F2}% {3,11:F2}% {4,11:F2}% {5,10} {6,15}" -f ($count + 1), ($filename.Substring(0, [Math]::Min(30, $filename.Length))), $lines_pct, $funcs_pct, $branches_pct, $real_size, $priority_label)
            }
            $count++
        }
    }

    if ($count -gt 40) {
        Write-Host "`n... e altri $($count - 40) file (usa CSV per lista completa)"
    }

    Write-Host "`n==============================================================================="
    Write-Host "RIEPILOGO PER PRIORITA':"
    Write-Host "   CRITICAL (<40%):  $critical file    -> Intervenire subito"
    Write-Host "   HIGH (40-60%):    $high file      -> Priorita alta"
    Write-Host "   MEDIUM (60-80%):  $medium file     -> Da migliorare"
    Write-Host "   GOOD (80-90%):    $good file       -> Buono"
    Write-Host "   GOLD (>90%):      $gold file       -> Eccellente"
    Write-Host "`nOBIETTIVO GOLD HOME ASSISTANT:"
    Write-Host "   * Lines coverage > 80% su tutti i file principali"
    Write-Host "   * Concentrare i test sui file CRITICAL e HIGH"
    Write-Host "`nPROSSIMI PASSI:"
    Write-Host "   1. Analizzare i file CRITICAL (coverage < 40%)"
    Write-Host "   2. Scrivere test per le funzioni non coperte"
    Write-Host "   3. Raggiungere almeno 80% su tutti i file"
    Write-Host "==============================================================================="
}

function Export-CsvReport {
    $dataFile = "$env:TEMP\coverage_analysis.txt"
    $outputFile = "coverage_report_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"
    $detailsFile = "uncovered_lines_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

    $lines = Get-Content $dataFile
    $dataLines = $lines | Where-Object { $_ -match '^\d+\.\d+\|' }
    
    if ($dataLines.Count -eq 0) {
        Write-Host "Nessun dato valido trovato nel file di analisi"
        return
    }

    # Esporta CSV principale
    "Rank,FileName,Path,LinesCoverage,FunctionsCoverage,BranchesCoverage,AvgCoverage,TotalLines,UncoveredLinesCount,PriorityScore,UncoveredLines" | Out-File $outputFile -Encoding UTF8

    $rank = 1
    foreach ($line in $dataLines) {
        $parts = $line -split '\|'
        if ($parts.Count -ge 10) {
            $lines_pct = $parts[0]
            $funcs_pct = $parts[1]
            $branches_pct = $parts[2]
            $avg_pct = $parts[3]
            $real_size = $parts[4]
            $uncovered_count = $parts[5]
            $filename = $parts[6]
            $path = $parts[7]
            $priority_score = $parts[8]
            $uncovered_list = $parts[9] -replace ',', ';'

            "$rank,`"$filename`",`"$path`",$lines_pct,$funcs_pct,$branches_pct,$avg_pct,$real_size,$uncovered_count,$priority_score,`"$uncovered_list`"" | Out-File $outputFile -Append -Encoding UTF8
            $rank++
        }
    }

    # Estrai e salva il dettaglio delle linee non coperte
    $inDetailSection = $false
    $detailsLines = @()
    
    foreach ($line in $lines) {
        if ($line -match "^--- DETAILED UNCOVERED LINES ---") {
            $inDetailSection = $true
            $detailsLines += $line
        } elseif ($inDetailSection) {
            $detailsLines += $line
        }
    }
    
    if ($detailsLines.Count -gt 0) {
        $detailsLines | Out-File $detailsFile -Encoding UTF8
        Write-Host "Dettaglio linee non coperte esportato in: $detailsFile"
    }

    Write-Host "Report principale esportato in: $outputFile"
}

function Main {
    Write-Host "==============================================================================="
    Write-Host "     ANALISI COVERAGE PER HOME ASSISTANT CUSTOM COMPONENT"
    Write-Host "==============================================================================="

    $nodeVersion = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeVersion) {
        Write-Host "Node.js non trovato. Installa Node.js per continuare."
        exit 1
    }

    if (-not (Test-Path $BASE_DIR)) {
        Write-Host "Directory $BASE_DIR non trovata!"
        exit 1
    }

    # Esegui i test automaticamente
    $testResult = Run-Tests
    if (-not $testResult) {
        Write-Host "Errore durante l'esecuzione dei test"
        exit 1
    }

    if (-not (Test-Path $COVERAGE_JSON)) {
        Write-Host "File $COVERAGE_JSON non trovato"
        exit 1
    }

    Analyze-Json

    if (-not (Test-Path "$env:TEMP\coverage_analysis.txt")) {
        Write-Host "Errore durante l'analisi del JSON"
        exit 1
    }

    Show-Analysis

    Write-Host "`nEsportare report dettagliato in CSV? (s/N): " -NoNewline
    $exportChoice = Read-Host
    if ($exportChoice -match '^[Ss]$') {
        Export-CsvReport
    }

    Write-Host "`nAnalisi completata!"
}

Main @args