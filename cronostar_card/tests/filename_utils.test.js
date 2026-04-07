// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  buildProfileFilename,
  buildHelpersFilename,
  buildAutomationFilename,
  getExpectedAutomationId,
} from "../src/utils/filename_utils.js";

describe("filename_utils", () => {
  it("buildProfileFilename should generate the expected filename", () => {
    expect(buildProfileFilename("thermostat", "living")).toBe(
      "cronostar_thermostat_living_data.json",
    );
  });

  it("buildProfileFilename handles empty prefix", () => {
    expect(buildProfileFilename("thermostat", "")).toBe(
      "cronostar_thermostat__data.json",
    );
  });

  it("buildHelpersFilename should generate the expected filename", () => {
    expect(buildHelpersFilename("test")).toBe("test_package.yaml");
  });

  it("buildHelpersFilename handles empty prefix", () => {
    expect(buildHelpersFilename("")).toBe("package.yaml");
  });

  it("buildAutomationFilename should generate the expected filename", () => {
    expect(buildAutomationFilename("test")).toBe("test_automation.yaml");
  });

  it("buildAutomationFilename handles empty prefix", () => {
    expect(buildAutomationFilename("")).toBe("_automation.yaml");
  });

  it("getExpectedAutomationId should generate the expected id", () => {
    expect(getExpectedAutomationId("test")).toBe("test_apply");
  });

  it("getExpectedAutomationId handles empty prefix", () => {
    expect(getExpectedAutomationId("")).toBe("_apply");
  });
});
