import yaml
from pathlib import Path

content = {
  "views": [
    {
      "cards": [
        {"type": "markdown", "content": "Header"},
        {"type": "markdown", "content": "Box 1"},
        {"type": "custom:cronostar-card"}
      ]
    }
  ]
}

yaml_path = Path("E:/J19173/temp/cronostar/tests/test_dump.py")
yaml_path.write_text("import yaml\n")