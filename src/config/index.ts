/**
 * Configuration module for MCP Filesystem Server
 *
 * This module provides comprehensive configuration management with:
 * - YAML and JSON config file support
 * - Environment variable configuration
 * - CLI argument override
 * - Configuration validation using Zod
 * - Hot reload capability with file watching
 * - Configuration precedence: CLI args > env vars > config file > defaults
 */

export {
  ConfigSchema,
  Config,
  ENV_VAR_PREFIX,
  ENV_VAR_MAPPING,
  CLI_ARG_MAPPING,
} from "./schema.js";
export {
  loadConfig,
  loadConfigFromFile,
  loadConfigFromEnv,
  mergeConfigs,
  validateConfig,
  normalizePaths,
  formatConfigForDisplay,
  type LoadConfigOptions,
} from "./loader.js";
export { ConfigWatcher, createConfigWatcher } from "./watcher.js";
