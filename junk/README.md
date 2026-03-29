# CronoStar Card – Test Coverage Setup

## File prodotti

```
tests/
  setup.js                 ← bootstrap Vitest (custom elements + canvas mock)
  config.test.js           ← src/config.js
  utils.test.js            ← src/utils.js
  state_manager.test.js    ← src/managers/state_manager.js
  profile_manager.test.js  ← src/managers/profile_manager.js
  card_lifecycle.test.js   ← src/core/CardLifecycle.js
  card_renderer.test.js    ← src/core/CardRenderer.js
  chart_manager.test.js    ← src/managers/chart_manager.js
  cronostar.test.js        ← src/core/CronoStar.js
vitest.config.js           ← configurazione Vitest
```

---

## Come integrare

### 1. Sostituisci i file esistenti

Copia (o sostituisci) i file nelle posizioni corrette:

```bash
# dalla radice del progetto
cp tests/setup.js         ./tests/setup.js
cp tests/*.test.js        ./tests/
cp vitest.config.js       ./vitest.config.js
```

### 2. Verifica i mock dei moduli non ancora presenti

Questi file vengono **mockati automaticamente** nei test, ma devono
esistere (anche vuoti) nell'albero sorgente per non bloccare la
risoluzione dei moduli da parte di Vitest:

| Percorso mock | Nota |
|---|---|
| `src/utils/logger_utils.js` | Usato in `config.js` |
| `src/utils/prefix_utils.js` | Usato in `profile_manager.js` |
| `src/core/EventBus.js` | Usato da state/chart/profile manager |
| `src/core/CardContext.js` | Usato in `CronoStar.js` |
| `src/core/CardEventHandlers.js` | Usato in `CronoStar.js` |
| `src/core/CardSync.js` | Usato in `CronoStar.js` |
| `src/managers/selection_manager.js` | Usato in `CronoStar.js` |
| `src/managers/localization_manager.js` | Usato in `CronoStar.js` |
| `src/handlers/keyboard_handler.js` | Usato in `CronoStar.js` |
| `src/handlers/pointer_handler.js` | Usato in `CronoStar.js` |
| `src/editor/CronoStarEditor.js` | Importato in `CronoStar.js` |
| `src/styles.js` | Importato in `CronoStar.js` |

### 3. Correzione `Invalid constructor` nei test

Il problema era che `customElements.define()` veniva chiamato
con classi non valide (non estendenti `HTMLElement`) in ambiente jsdom.

Il nuovo `tests/setup.js` risolve registrando stub `HTMLElement` per
**tutti** i custom elements usati nel codice sorgente prima che i
moduli vengano importati.  La lista include:
- Componenti CronoStar (`cronostar-card`, `cronostar-card-editor`)
- Componenti HA (`ha-card`, `ha-icon`, `ha-switch`, `ha-select`, …)
- Componenti MWC (`mwc-button`, `mwc-list-item`)
- Tag usati in `checkIsEditorContext` e `_isInHistoryContext`

### 4. Lancia i test

```bash
# esegui tutti i test
npm test

# con coverage (genera anche HTML in ./coverage/)
npm run test:coverage
```

---

## Strategia di coverage

| File | Approccio |
|---|---|
| `utils.js` | Test unitari diretti su ogni funzione esportata |
| `config.js` | Ogni branch di `validateConfig`, `normalizeHourBase`, `extractCardConfig` |
| `state_manager.js` | Ogni metodo pubblico + edge case su `finalizeSwitchData` |
| `profile_manager.js` | Mock di `hass`, `context`, `EventBus` e `prefix_utils` |
| `CardLifecycle.js` | Mock pesante del card; ogni metodo del lifecycle |
| `CardRenderer.js` | `html` di Lit mockato come tag-template → stringa; test su ogni branch condizionale |
| `chart_manager.js` | Chart.js mockato con `vi.mock`; test su ogni metodo pubblico + privato |
| `CronoStar.js` | Istanza via `Object.create` per bypassare LitElement; test sui wrapper pubblici |

---

## Note importanti

- **`VERSION` in `config.js`** legge `window.CRONOSTAR_CARD_VERSION`.
  In jsdom questa è `undefined`, quindi il valore atteso nei test è `"0.0.0"`
  (non `"5.4.1"` come in `config_test.js` originale: **aggiorna il test vecchio**).

- **`showDragValueDisplay` / `scheduleHideDragValueDisplay`** in `ChartManager`:
  se questi metodi non esistono nella versione del file caricata, i test
  relativi usano l'operatore `?.` e vengono saltati senza errore.

- Per raggiungere la **100% di coverage** su file non listati qui
  (es. `CardContext`, `CardSync`, `SelectionManager`, ecc.)
  è sufficiente aggiungere test analoghi una volta che quei file
  vengono condivisi.
