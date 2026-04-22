# CronoStar Development Scripts e Utility

Questo documento descrive gli script e le utilità di sviluppo che sono stati organizzati all'interno della cartella `scripts/`.

## Script per Aider e Assistenza Sviluppo
* **`echo_files_aider.sh`**: Script personale utilizzato per concatenare o esportare il contenuto di file specifici, al fine di fornire rapidamente contesto all'assistente AI Aider.
* **`echo_files_aider_full.sh`**: Versione completa dello script per Aider. Esporta un set di file più esteso, permettendo di passare all'intelligenza artificiale un contesto globale del progetto o dell'intera directory.

## Analisi della Test Coverage
* **`analyze-coverage.sh`**: Script bash per l'esecuzione e l'analisi dei report di test coverage. Esegue i test e raccoglie le metriche sul codice sorgente testato.
* **`analyze-coverage.ps1`**: L'equivalente PowerShell dello script di coverage, permettendo agli sviluppatori di eseguire l'analisi nativamente su ambienti Windows.
* **`analyze-coverage-param.sh`**: Variante dello script bash che accetta dei parametri esterni, in modo da filtrare, aggiustare o mirare l'analisi della coverage solo su specifici moduli o metriche.
* **`list_coverage.sh`**: Script di utilità per mostrare o elencare un resoconto rapido dei risultati e delle percentuali di copertura dei file testati.
* **`parse-coverage.js`**: Script/utility di sviluppo Node.js dedicato al parsing, alla formattazione o all'elaborazione dei file di output grezzi della test coverage, probabilmente per trasformarli in formati leggibili per altre pipeline o riepiloghi.

## Networking, Dati Locali e Backup
* **`proxy.sh`**: Script di rete utilizzato per configurare o attivare/disattivare un proxy locale durante la fase di sviluppo o debug.
* **`test.json`**: File contenente dati fittizi in formato JSON (mock o payload di configurazione) utili per effettuare test locali e debugging senza dipendere da servizi esterni attivi.
* **`files_backup/`**: Cartella dedicata all'archiviazione di versioni obsolete di script o file temporanei di backup. Permette di mantenere i file per consultazione rapida tenendoli separati dalla struttura principale del progetto.
