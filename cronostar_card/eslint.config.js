
import globals from "globals";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        globals: {
            ...globals.browser,
            ...globals.node,
        }
    },
    rules: {
        "no-console": "off",
        "no-unused-vars": ["warn", { "args": "none", "caughtErrors": "none" }],
    }
  }
];
