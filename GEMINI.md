# GEMINI.md

# Gemini - CronoStar Development Workflow

This document outlines the standard procedures for developing, building, and deploying the CronoStar custom component.

## 1. Source Code Management

### Local Repository
- **Location**: `/home/carlo/cronostar_git`
- **Main Branch**: `main`

### GitHub Repository
- **URL**: `https://github.com/FoliniC/CronoStar`

**Workflow**:
1.  Always work on the `main` branch for simplicity, as this is a local-first workflow.
2.  After completing a feature or fix, commit the changes with a descriptive message.
3.  Pushing to GitHub is a manual step to back up the code.
Example commit
git add .
git commit -m "feat: Add new feature"
git push origin main


## 2. Frontend Compilation

The CronoStar card is a JavaScript component that must be compiled after any changes to its source files.

- **Frontend Source Directory**: `/home/carlo/cronostar_git/cronostar_card`
- **Build Command**: This command compiles the JavaScript source and outputs the final `cronostar-card.js` file into the correct backend directory
(`custom_components/cronostar/www/cronostar_card/`).
cd /home/carlo/cronostar_git/cronostar_card
npm run build


**Important**: Run this command every time you modify files in `cronostar_git/cronostar_card/src/`.

## 3. Deployment to Home Assistant

There are two Home Assistant instances:
- **Main Instance**: Running on port `8123`.
- **Test Instance**: Running on port `8125`.

### Deployment to Main Instance
- **Configuration Directory**: `/home/carlo/docker/homeassistant/config`
- **Command**: This copies the compiled backend and frontend code to your main Home Assistant instance.
Ensure you are in the root of the repo
cd /home/carlo/cronostar_git

Copy component files
cp -r custom_components/cronostar/* /home/carlo/docker/homeassistant/config/custom_components/cronostar/

Restart Home Assistant
docker restart homeassistant

### Deployment to Test Instance
- **Configuration Directory**: `/home/carlo/docker/homeassistant_test/config`
- **Command**: This copies the compiled backend and frontend code to your test Home Assistant instance.
Ensure you are in the root of the repo
cd /home/carlo/cronostar_git

Copy component files
cp -r custom_components/cronostar/* /home/carlo/docker/homeassistant_test/config/custom_components/cronostar/

Restart the test container
docker restart homeassistant_test_cronostar

## Full Workflow Example (Frontend Change)

From the `/home/carlo` directory:
1. Go to card directory and build
cd cronostar_git/cronostar_card
npm run build

2. Go back to repo root
cd ..

3. Deploy to test instance
cp -r custom_components/cronostar/* /home/carlo/docker/homeassistant_test/config/custom_components/cronostar/
docker restart homeassistant_test_cronostar

4. Verify changes in test instance, then commit
git add .
git commit -m "feat(frontend): Update card layout"

## 4. Testing Guidelines

To maintain 100% coverage and ensure stability, follow these guidelines for backend tests.

### Async Tests
The current environment does not have a native `pytest-asyncio` plugin. Use the `run()` helper in each test file:
```python
def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

def test_example(hass):
    result = run(some_async_function())
```

### Home Assistant Objects (Read-only attributes)
Avoid `patch.object` on attributes like `hass.states.get` or `hass.services.async_register`. Use real methods:
- **States**: Use `hass.states.async_set("domain.entity", "state")` or `hass.states.get.return_value = MagicMock(state="...")`.
- **Services**: Use `run(setup_services(hass, ...))` to register real handlers, then `run(hass.services.async_call(...))` to trigger them.
- **Config Entries**: Use `MockConfigEntry` from `conftest.py` (or `pytest_homeassistant_custom_component.common`).

### Config Entries Registry
When testing logic that depends on `hass.config_entries.async_entries()` or similar, the entry must be registered in the mock registry:
```python
entry = MockConfigEntry(domain="cronostar", data={...})
entry.add_to_hass(hass) # Necessary for the registry to "see" it
```

### Mocking entry.data
`MagicMock.update()` has no effect. Always ensure `entry.data` is a real dictionary if you need to perform updates or overrides.

### Stubs
Common HA modules like `voluptuous` and `homeassistant.helpers.selector` are stubbed in `tests/conftest.py`.

## 5. Home Assistant Logs
The Home Assistant logs are stored in a non-standard location:
- **Directory**: `/home/carlo/docker/homeassistant/config/logs/ha/`
- **Active Log**: Use `ls -t /home/carlo/docker/homeassistant/config/logs/ha/home-assistant_*.log | head -n 1` to find the most recent file.

Instructions:
Do not make up entities or states you don't know about.
If you don't have enough context, ask for a brief clarification.
If the request is not related to the home, still respond in a helpful and concise way.
The language of source code and comments must be English unless explicitly requested otherwise
