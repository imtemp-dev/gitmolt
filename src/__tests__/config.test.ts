import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, ConfigError } from "../config.js";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("loads valid config from env vars", () => {
    process.env.GITMOLT_APP_ID = "123456";
    process.env.GITMOLT_PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----";
    process.env.GITMOLT_REPOS = "owner/repo1,owner/repo2";
    process.env.GITMOLT_DEFAULT_EFFORT = "small";

    const config = loadConfig();
    expect(config.appId).toBe("123456");
    expect(config.privateKey).toContain("BEGIN RSA");
    expect(config.repos).toEqual(["owner/repo1", "owner/repo2"]);
    expect(config.defaultEffort).toBe("small");
  });

  it("throws ConfigError when GITMOLT_APP_ID is missing", () => {
    process.env.GITMOLT_PRIVATE_KEY = "some-key";
    delete process.env.GITMOLT_APP_ID;

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow("Missing GITMOLT_APP_ID");
  });

  it("throws ConfigError when both GITMOLT_PRIVATE_KEY and GITMOLT_PRIVATE_KEY_PATH are missing", () => {
    process.env.GITMOLT_APP_ID = "123456";
    delete process.env.GITMOLT_PRIVATE_KEY;
    delete process.env.GITMOLT_PRIVATE_KEY_PATH;

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow("Missing GITMOLT_PRIVATE_KEY");
  });

  it("handles empty GITMOLT_REPOS gracefully", () => {
    process.env.GITMOLT_APP_ID = "123456";
    process.env.GITMOLT_PRIVATE_KEY = "some-key";
    process.env.GITMOLT_REPOS = "";

    const config = loadConfig();
    expect(config.repos).toEqual([]);
  });

  it("parses GITMOLT_INSTALLATION_ID as number", () => {
    process.env.GITMOLT_APP_ID = "123456";
    process.env.GITMOLT_PRIVATE_KEY = "some-key";
    process.env.GITMOLT_INSTALLATION_ID = "78901234";

    const config = loadConfig();
    expect(config.installationId).toBe(78901234);
  });

  it("trims whitespace from repo names", () => {
    process.env.GITMOLT_APP_ID = "123456";
    process.env.GITMOLT_PRIVATE_KEY = "some-key";
    process.env.GITMOLT_REPOS = " owner/repo1 , owner/repo2 ";

    const config = loadConfig();
    expect(config.repos).toEqual(["owner/repo1", "owner/repo2"]);
  });

  it("returns frozen config object", () => {
    process.env.GITMOLT_APP_ID = "123456";
    process.env.GITMOLT_PRIVATE_KEY = "some-key";

    const config = loadConfig();
    expect(() => {
      (config as any).appId = "changed";
    }).toThrow();
  });
});
