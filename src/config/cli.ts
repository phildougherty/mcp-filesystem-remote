import { Config, CLI_ARG_MAPPING } from "./schema.js";

/**
 * Parse CLI arguments into configuration object
 */
export interface ParsedArgs {
  configPath?: string;
  allowedDirectories: string[];
  cliConfig: Partial<Config>;
  showHelp: boolean;
  showVersion: boolean;
}

/**
 * Display help message
 */
export function displayHelp(): void {
  console.error(`
MCP Filesystem Server - Configuration & Usage

USAGE:
  mcp-server-filesystem [OPTIONS] <allowed-directory> [additional-directories...]

OPTIONS:
  --config PATH              Path to config file (YAML or JSON)
  --transport MODE           Transport mode: stdio|http|sse (default: stdio)
  --port PORT                Server port for HTTP/SSE modes (default: 3000)
  --host HOST                Server host binding (default: localhost)
  --working-dir DIR          Working directory for relative paths
  --log-level LEVEL          Log level: debug|info|warn|error (default: info)
  --log-format FORMAT        Log format: json|pretty (default: pretty)
  --auth-token TOKEN         Authentication token for HTTP/SSE
  --cache-enabled            Enable file caching
  --cache-ttl MS             Cache TTL in milliseconds (default: 60000)
  --cache-size BYTES         Max cache size in bytes (default: 104857600)
  --max-file-size BYTES      Maximum file size for operations
  --max-search-results N     Maximum search results (default: 1000)
  --max-tree-depth N         Maximum directory tree depth (default: 10)
  --search-timeout MS        Search operation timeout (default: 30000)
  --metrics-enabled          Enable metrics endpoint
  --help, -h                 Show this help message
  --version, -v              Show version information

POSITIONAL ARGUMENTS:
  <allowed-directory>        One or more directories the server can access

ENVIRONMENT VARIABLES:
  MCP_FS_*                   See CONFIGURATION.md for all environment variables

CONFIGURATION FILES:
  Use --config to specify a YAML or JSON configuration file.
  See config.example.yaml and config.example.json for examples.

CONFIGURATION PRECEDENCE:
  CLI arguments > Environment variables > Config file > Defaults

EXAMPLES:
  # Basic usage with single directory
  mcp-server-filesystem /home/user/documents

  # Multiple directories with custom transport
  mcp-server-filesystem --transport http --port 8080 /var/www /home/user/docs

  # Using config file
  mcp-server-filesystem --config config.yaml

  # Config file with CLI overrides
  mcp-server-filesystem --config config.yaml --log-level debug --port 3001

  # Development mode with verbose logging
  mcp-server-filesystem --log-level debug --log-format pretty ~/Projects

  # Production mode with JSON logging
  mcp-server-filesystem --log-level info --log-format json --cache-enabled /var/www

LEGACY ENVIRONMENT VARIABLES:
  MATEY_WORKING_DIR          Set working directory relative to first allowed directory
  MATEY_START_DIR            Set absolute working directory

For more information, see CONFIGURATION.md
`);
}

/**
 * Display version information
 */
export function displayVersion(): void {
  console.error("MCP Filesystem Server v0.2.0");
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
 * Parse a value to appropriate type
 */
function parseValue(value: string, hint?: string): any {
  // Handle boolean flags
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  // Try to parse as number
  if (hint === "number" || /^\d+$/.test(value)) {
    const num = Number(value);
    if (!isNaN(num)) {
      return num;
    }
  }

  // Return as string
  return value;
}

/**
 * Parse CLI arguments
 */
export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    allowedDirectories: [],
    cliConfig: {},
    showHelp: false,
    showVersion: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (!arg) {
      i++;
      continue;
    }

    // Help flags
    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
      i++;
      continue;
    }

    // Version flags
    if (arg === "--version" || arg === "-v") {
      result.showVersion = true;
      i++;
      continue;
    }

    // Config file
    if (arg === "--config") {
      if (i + 1 >= args.length) {
        throw new Error("--config requires a file path");
      }
      const configPathValue = args[i + 1];
      if (!configPathValue) {
        throw new Error("--config requires a file path");
      }
      result.configPath = configPathValue;
      i += 2;
      continue;
    }

    // Handle known flags
    if (arg.startsWith("--")) {
      const flagName = arg.slice(2);

      // Check if it's a boolean flag
      if (flagName === "cache-enabled" || flagName === "metrics-enabled") {
        const configPath = CLI_ARG_MAPPING[flagName];
        if (configPath) {
          setNestedProperty(result.cliConfig, configPath, true);
        }
        i++;
        continue;
      }

      // All other flags require a value
      if (i + 1 >= args.length) {
        throw new Error(`${arg} requires a value`);
      }

      const value = args[i + 1];
      if (!value) {
        throw new Error(`${arg} requires a value`);
      }
      const configPath = CLI_ARG_MAPPING[flagName];

      if (!configPath) {
        throw new Error(`Unknown flag: ${arg}`);
      }

      // Determine type hint from config path
      const typeHint =
        configPath.includes("port") ||
        configPath.includes("ttl") ||
        configPath.includes("size") ||
        configPath.includes("timeout") ||
        configPath.includes("results") ||
        configPath.includes("depth")
          ? "number"
          : undefined;

      const parsedValue = parseValue(value, typeHint);
      setNestedProperty(result.cliConfig, configPath, parsedValue);

      i += 2;
      continue;
    }

    // Positional argument (allowed directory)
    if (!arg.startsWith("-")) {
      result.allowedDirectories.push(arg);
      i++;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

/**
 * Filter and clean arguments (remove Docker artifacts, etc.)
 */
export function filterArgs(args: string[]): string[] {
  return args.filter(
    (arg) =>
      arg !== "node" &&
      !arg.includes("/app/dist/index.js") &&
      !arg.endsWith("index.js") &&
      arg !== undefined &&
      arg !== null &&
      arg !== ""
  );
}
