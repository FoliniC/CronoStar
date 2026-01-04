import os

def fix_file(path, content, mode="w"):
    try:
        with open(path, mode, encoding="utf-8") as f:
            f.write(content)
        print(f"✅ Successfully updated {path}")
    except Exception as e:
        print(f"❌ Failed to update {path}: {e}")

# 1. Fix translations/en.json
en_json_path = os.path.join("custom_components", "cronostar", "translations", "en.json")
en_json_content = """{
    \"config\": {\n        \"step\": {\n            \"user\": {\n                \"title\": \"CronoStar Setup\",\n                \"description\": \"Choose an action:\n\n- **Install Component**: Sets up the global environment (if not already installed).\n- **Add Controller**: Create a new schedule controller for an entity.\"\n            },\n            \"install_component\": {\n                \"title\": \"Install Component Backend\",\n                \"description\": \"This will install the CronoStar global component.\n\nIt handles profile storage and global services.\"\n            },\n            \"controller\": {\n                \"title\": \"Add New Controller\",\n                \"description\": \"Create a new CronoStar controller.\",\n                \"data\": {\n                    \"name\": \"Controller Name\",\n                    \"preset\": \"Scheduler Type\",\n                    \"target_entity\": \"Target Entity to Control\"\n                }\n            }\n        },\n        \"abort\": {\n            \"single_instance_allowed\": \"The CronoStar global component is already installed.\",\n            \"already_configured\": \"This controller is already configured.\"\n        }\n    },\n    \"options\": {\n        \"step\": {\n            \"init\": {\n                \"title\": \"CronoStar Component Options\",\n                \"description\": \"Global component settings.\",\n                \"data\": {}\n            }\n        }\n    }\n}"""
fix_file(en_json_path, en_json_content)

# 2. Fix README.md
readme_path = "README.md"
removal_section = """
## 🗑️ Removal

1. **Remove from Devices & Services**:
   - Go to **Settings** → **Devices & Services**.
   - Select the **CronoStar** integration.
   - Click the three dots (⋮) next to the integration entry and select **Delete**.
   - Repeat for all CronoStar entries (Component and Controllers).

2. **Remove from HACS**:
   - Go to **HACS** → **Integrations**.
   - Find **CronoStar**.
   - Click the three dots (⋮) and select **Remove**.
   - Restart Home Assistant.

3. **Cleanup (Optional)**:
   - You can manually delete the storage folder if you want to remove all saved profiles:
     `/config/cronostar/`
"""

try:
    if os.path.exists(readme_path):
        with open(readme_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        if "## 🗑️ Removal" not in content:
            support_header = "## 💬 Support"
            if support_header in content:
                new_content = content.replace(support_header, removal_section + "\n" + support_header)
                fix_file(readme_path, new_content)
            else:
                print(f"⚠️ Could not find '{support_header}' in {readme_path}")
        else:
            print(f"✅ Removal section already exists in {readme_path}")
    else:
         print(f"❌ {readme_path} not found")
except Exception as e:
    print(f"❌ Failed to process {readme_path}: {e}")
