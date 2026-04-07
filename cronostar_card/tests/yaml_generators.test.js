// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";

vi.mock("../src/utils/prefix_utils.js", () => ({
  getEffectivePrefix: vi.fn((config) => config.global_prefix || "cronostar_"),
}));

import { buildAutomationTemplate } from "../src/editor/yaml/yaml_generators.js";

describe("yaml_generators", () => {
  it("buildAutomationTemplate uses config values", () => {
    const yaml = buildAutomationTemplate({
      global_prefix: "my_prefix_",
      preset_type: "thermostat",
      target_entity: "climate.room",
      profiles_select_entity: "select.my_prefix_current_profile",
    });

    expect(yaml).toContain("sensor.my_prefix_current");
    expect(yaml).toContain("select.my_prefix_current_profile");
  });

  it("buildAutomationTemplate uses fallbacks when config is sparse", () => {
    const yaml = buildAutomationTemplate({});
    expect(yaml).toContain("sensor.cronostar_current");
    expect(yaml).toContain("select.cronostar_current_profile");
  });

  it("buildAutomationTemplate accepts legacy preset field without changing output flow", () => {
    const yaml = buildAutomationTemplate({
      global_prefix: "legacy_",
      preset: "thermostat",
    });
    expect(yaml).toContain("sensor.legacy_current");
  });
});
