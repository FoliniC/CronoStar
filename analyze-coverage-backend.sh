#!/bin/bash
# Script per test e coverage del backend
# Attiva automaticamente il venv e esegue i test

# Carica il venv dalla root se presente
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

echo "Esecuzione test di backend con report coverage..."

# Esegue pytest con coverage sulla cartella del componente
pytest --cov=custom_components.cronostar --cov-report=term-missing --cov-report=html tests/

# Verifica l'esito
if [ $? -eq 0 ]; then
    echo "--------------------------------------------------"
    echo "Successo! Report HTML generato in 'htmlcov/index.html'"
else
    echo "--------------------------------------------------"
    echo "I test hanno riportato degli errori."
fi
