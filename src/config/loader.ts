import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { ConfigSchema, Config, ENV_VAR_MAPPING } from "./schema.js";
import { ZodError } from "zod";

/**
 * Load configuration from a file (YAML or JSON)
 */
export async function loadConfigFromFile(configPath: string): Promise<Partial<Config>> {
  try {
    const fileContent = await fs.readFile(configPath, "utf-8");
    const ext = path.extname(configPath).toLowerCase();

    let parsed: any;
    if (ext === ".yaml" || ext === ".yml") {
      parsed = yaml.load(fileContent);
    } else if (ext === ".json") {
      parsed = JSON.parse(fileContent);
    } else {
      throw new Error(`Unsupported config file format: ${ext}. Use .yaml, .yml, or .json`);
    }

    return parsed || {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw new Error(
      `Failed to load config file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Set a nested property on an object using dot notation
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) {
      continue;
    }
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

/**
 * Parse environment variable value to appropriate type
 */
function parseEnvValue(value: string): any {
  // Try to parse as JSON first (handles arrays, booleans, numbers, etc.)
  try {
    return JSON.parse(value);
  } catch {
    // If not valid JSON, return as string
    return value;
  }
}

/**
 * Load configuration from environment variables
 */
export function loadConfigFromEnv(): Partial<Config> {
  const config: any = {};

  for (const [envVar, configPath] of Object.entries(ENV_VAR_MAPPING)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      const parsedValue = parseEnvValue(value);
      setNestedProperty(config, configPath, parsedValue);
    }
  }

  return config;
}

/**
 * Merge multiple config objects with proper precedence
 * Later configs override earlier ones
 */
export function mergeConfigs(...configs: Partial<Config>[]): Partial<Config> {
  const result: any = {};

  for (const config of configs) {
    mergeDeep(result, config);
  }

  return result;
}

/**
 * Deep merge helper
 */
function mergeDeep(target: any, source: any): void {
  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key] || typeof target[key] !== "object") {
        target[key] = {};
      }
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

/**
 * Validate and parse configuration using Zod schema
 */
export function validateConfig(config: Partial<Config>): Config {
  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof ZodError) {
      const messages = error.errors
        .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
        .join("\n");
      throw new Error(`Configuration validation failed:\n${messages}`);
    }
    throw error;
  }
}

/**
 * Expand home directory in paths
 */
function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    const homeDir = process.env["HOME"] || process.env["USERPROFILE"] || "";
    return path.join(homeDir, filepath.slice(1));
  }
  return filepath;
}

/**
 * Normalize and resolve paths in configuration
 */
export function normalizePaths(config: Config): Config {
  const normalized = { ...config };

  // Normalize allowed directories
  if (normalized.filesystem?.allowedDirectories) {
    normalized.filesystem.allowedDirectories = normalized.filesystem.allowedDirectories.map((dir) =>
      path.resolve(expandHome(dir))
    );
  }

  // Normalize working directory
  if (normalized.filesystem?.workingDirectory) {
    normalized.filesystem.workingDirectory = path.resolve(
      expandHome(normalized.filesystem.workingDirectory)
    );
  }

  // Normalize log destination
  if (normalized.logging?.destination) {
    normalized.logging.destination = path.resolve(expandHome(normalized.logging.destination));
  }

  return normalized;
}

/**
 * Main configuration loader with full precedence chain
 * Precedence: CLI args > env vars > config file > defaults
 */
export interface LoadConfigOptions {
  configPath?: string;
  cliConfig?: Partial<Config>;
  envConfig?: Partial<Config>;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<Config> {
  const configs: Partial<Config>[] = [];

  // 1. Start with defaults (handled by Zod schema defaults)
  configs.push({});

  // 2. Load from config file if provided
  if (options.configPath) {
    const fileConfig = await loadConfigFromFile(options.configPath);
    configs.push(fileConfig);
  }

  // 3. Load from environment variables
  const envConfig = options.envConfig || loadConfigFromEnv();
  configs.push(envConfig);

  // 4. Apply CLI arguments (highest precedence)
  if (options.cliConfig) {
    configs.push(options.cliConfig);
  }

  // Merge all configs
  const merged = mergeConfigs(...configs);

  // Validate
  const validated = validateConfig(merged);

  // Normalize paths
  return normalizePaths(validated);
}

/**
 * Format configuration for display (hides sensitive values)
 */
export function formatConfigForDisplay(config: Config): string {
  const sanitized = { ...config };

  // Hide sensitive fields
  if (sanitized.security?.authToken) {
    sanitized.security.authToken = "***REDACTED***";
  }

  return JSON.stringify(sanitized, null, 2);
}
