// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { I18N } from "../src/editor/EditorI18n.js";
import fs from "fs";
import path from "path";

describe("I18n Coverage Validation", () => {
  // Helper to get all .js files in src
  const getAllJsFiles = (dir, fileList = []) => {
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        getAllJsFiles(filePath, fileList);
      } else if (file.endsWith(".js")) {
        fileList.push(filePath);
      }
    });
    return fileList;
  };

  // Helper to check if a nested key exists in an object
  const hasKey = (obj, path) => {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (!current || !Object.prototype.hasOwnProperty.call(current, part)) {
        return false;
      }
      current = current[part];
    }
    return true;
  };

  const srcDir = path.resolve(__dirname, "../src");
  const jsFiles = getAllJsFiles(srcDir);
  const tRegex = /_t\("([^"]+)"\)/g;

  // Extract all literal keys used in the source code
  const usedKeys = new Set();
  jsFiles.forEach((file) => {
    const content = fs.readFileSync(file, "utf8");
    let match;
    while ((match = tRegex.exec(content)) !== null) {
      usedKeys.add(match[1]);
    }
  });

  const languages = Object.keys(I18N);

  languages.forEach((lang) => {
    describe(`Language: ${lang}`, () => {
      Array.from(usedKeys).forEach((key) => {
        it(`should have a translation for "${key}"`, () => {
          const exists = hasKey(I18N[lang], key);
          if (!exists) {
            throw new Error(`Missing translation key: "${key}" in language: "${lang}"`);
          }
          expect(exists).toBe(true);
        });
      });
    });
  });
  
  it("should have consistent keys between EN and IT", () => {
      const enKeys = [];
      const itKeys = [];
      
      const flattenKeys = (obj, prefix = "") => {
          let keys = [];
          for (const k in obj) {
              const fullKey = prefix ? `${prefix}.${k}` : k;
              if (typeof obj[k] === "object" && obj[k] !== null) {
                  keys = keys.concat(flattenKeys(obj[k], fullKey));
              } else {
                  keys.push(fullKey);
              }
          }
          return keys;
      };
      
      const enFlat = flattenKeys(I18N.en);
      const itFlat = flattenKeys(I18N.it);
      
      const missingInIt = enFlat.filter(k => !itFlat.includes(k));
      const missingInEn = itFlat.filter(k => !enFlat.includes(k));
      
      expect(missingInIt, `Keys present in EN but missing in IT: ${missingInIt.join(", ")}`).toEqual([]);
      expect(missingInEn, `Keys present in IT but missing in EN: ${missingInEn.join(", ")}`).toEqual([]);
  });
});
