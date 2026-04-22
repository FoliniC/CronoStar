const fs = require('fs');
const { execSync } = require('child_process');

// Esegui i test e cattura l'output
console.log('Esecuzione npm run test:coverage...');
try {
    const output = execSync('npm run test:coverage', { 
        cwd: '/home/carlo/cronostar_git/cronostar_card',
        encoding: 'utf8',
        stdio: 'pipe'
    });
    
    const lines = output.split('\n');
    const files = [];
    
    // Pattern per la tabella
    const pattern = /^\s*([a-zA-Z0-9_]+\.js)\s+\|\s+([0-9.]+)\s+\|\s+([0-9.]+)\s+\|\s+([0-9.]+)\s+\|\s+([0-9.]+)/;
    
    for (const line of lines) {
        const match = line.match(pattern);
        if (match) {
            files.push({
                file: match[1],
                statements: parseFloat(match[2]),
                branches: parseFloat(match[3]),
                functions: parseFloat(match[4]),
                lines: parseFloat(match[5])
            });
        }
    }
    
    // Calcola la dimensione reale dei file
    const baseDir = '/home/carlo/cronostar_git/cronostar_card';
    for (const file of files) {
        const findCmd = `find ${baseDir} -name "${file.file}" -type f 2>/dev/null | head -1`;
        const filepath = execSync(findCmd, { encoding: 'utf8' }).trim();
        if (filepath) {
            const wcCmd = `wc -l < "${filepath}"`;
            const lines = parseInt(execSync(wcCmd, { encoding: 'utf8' }).trim());
            file.realSize = lines;
            file.weighted = (file.lines * lines) / 100;
        } else {
            file.realSize = 0;
            file.weighted = file.lines;
        }
        
        file.avgCoverage = (file.statements + file.branches + file.functions + file.lines) / 4;
    }
    
    // Ordina per weighted coverage
    files.sort((a, b) => b.weighted - a.weighted);
    
    // Salva JSON
    fs.writeFileSync('/tmp/coverage_data.json', JSON.stringify(files, null, 2));
    console.log(`Trovati ${files.length} file`);
    
    // Stampa tabella
    console.log('\n' + '='.repeat(100));
    console.log('ANALISI COVERAGE PER DIMENSIONE REALE');
    console.log('='.repeat(100));
    console.log(`${'FILE'.padEnd(35)} ${'COVERAGE%'.padEnd(10)} ${'RIGHE NON COPERTE'.padEnd(18)} ${'DIM.REALE'.padEnd(12)} ${'WEIGHTED'.padEnd(10)}`);
    console.log('-'.repeat(100));
    
    for (const file of files) {
        const color = file.weighted >= 80 ? '\x1b[32m' : (file.weighted >= 50 ? '\x1b[33m' : '\x1b[31m');
        const reset = '\x1b[0m';
        const uncovered = 'N/D'; // Non abbiamo info sulle righe specifiche
        console.log(`${color}${file.file.padEnd(35)} ${file.lines.toFixed(2)}%${' '.padEnd(6)} ${uncovered.padEnd(18)} ${String(file.realSize).padEnd(12)} ${file.weighted.toFixed(2)}${reset}`);
    }
    
} catch (error) {
    console.error('Errore:', error.message);
}
