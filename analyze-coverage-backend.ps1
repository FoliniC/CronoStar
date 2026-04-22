# Script per test e coverage del backend (PowerShell version)
# Esegue i test pytest con report di coverage

Write-Host "Esecuzione test di backend con report coverage..." -ForegroundColor Cyan

# Verifica e attiva il virtual environment se presente
if (Test-Path ".venv") {
    Write-Host "Attivazione virtual environment (.venv)..." -ForegroundColor Gray
    # Su Linux PowerShell, l'attivazione si fa dot-sourcing del file ps1 se generato, 
    # oppure puntando direttamente al python nel venv.
    # Proviamo il dot-source classico se esiste, altrimenti useremo il percorso del binario.
    if (Test-Path ".venv/bin/Activate.ps1") {
        . .venv/bin/Activate.ps1
    }
}

# Esegue pytest con coverage sulla cartella del componente
# Usiamo python3 -m pytest per essere sicuri di usare l'interprete del venv se attivo
python3 -m pytest --cov=custom_components.cronostar --cov-report=term-missing --cov-report=html tests/

# Verifica l'esito
if ($LASTEXITCODE -eq 0) {
    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "Successo! Report HTML generato in 'htmlcov/index.html'" -ForegroundColor Green
} else {
    Write-Host "--------------------------------------------------" -ForegroundColor Gray
    Write-Host "I test hanno riportato degli errori (Exit Code: $LASTEXITCODE)." -ForegroundColor Red
}
