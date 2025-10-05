import { z } from "zod";

/**
 * Configuration schema for MCP Filesystem Server
 * Supports both YAML and JSON formats
 */
export const ConfigSchema = z
  .object({
    // Server configuration
    server: z
      .object({
        name: z.string().optional().default("secure-filesystem-server"),
        version: z.string().optional().default("0.2.0"),
      })
      .optional()
      .default({}),

    // Transport configuration
    transport: z
      .object({
        mode: z.enum(["stdio", "sse", "http"]).optional().default("stdio"),
        port: z.number().min(1).max(65535).optional().default(3000),
        host: z.string().optional().default("localhost"),
      })
      .optional()
      .default({}),

    // Filesystem configuration
    filesystem: z.object({
      allowedDirectories: z.array(z.string()).min(1),
      workingDirectory: z.string().optional(),
    }),

    // Cache configuration
    cache: z
      .object({
        enabled: z.boolean().optional().default(false),
        ttl: z.number().optional().default(60000), // 60 seconds
        maxSize: z.number().optional().default(104857600), // 100MB
      })
      .optional()
      .default({}),

    // Rate limiting configuration
    rateLimit: z
      .object({
        enabled: z.boolean().optional().default(false),
        requestsPerMinute: z.number().optional().default(100),
        searchRequestsPerMinute: z.number().optional().default(10),
        treeRequestsPerMinute: z.number().optional().default(5),
      })
      .optional()
      .default({}),

    // Performance limits
    limits: z
      .object({
        maxFileSize: z.number().optional().default(104857600), // 100MB
        maxSearchResults: z.number().optional().default(1000),
        maxTreeDepth: z.number().optional().default(10),
        searchTimeout: z.number().optional().default(30000), // 30 seconds
      })
      .optional()
      .default({}),

    // Logging configuration
    logging: z
      .object({
        level: z.enum(["debug", "info", "warn", "error"]).optional().default("info"),
        format: z.enum(["json", "pretty"]).optional().default("pretty"),
        destination: z.string().optional(), // Optional log file path
      })
      .optional()
      .default({}),

    // Security configuration
    security: z
      .object({
        authToken: z.string().optional(),
        corsEnabled: z.boolean().optional().default(true),
        corsOrigin: z
          .union([z.string(), z.array(z.string()), z.boolean()])
          .optional()
          .default(true),
      })
      .optional()
      .default({}),

    // Monitoring configuration
    monitoring: z
      .object({
        metricsEnabled: z.boolean().optional().default(false),
        metricsEndpoint: z.string().optional().default("/metrics"),
      })
      .optional()
      .default({}),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Environment variable mapping for configuration
 * Format: MCP_FS_<SECTION>_<KEY>
 */
export const ENV_VAR_PREFIX = "MCP_FS_";

export const ENV_VAR_MAPPING: Record<string, string> = {
  // Server
  MCP_FS_SERVER_NAME: "server.name",
  MCP_FS_SERVER_VERSION: "server.version",

  // Transport
  MCP_FS_TRANSPORT_MODE: "transport.mode",
  MCP_FS_TRANSPORT_PORT: "transport.port",
  MCP_FS_TRANSPORT_HOST: "transport.host",

  // Filesystem
  MCP_FS_FILESYSTEM_ALLOWED_DIRECTORIES: "filesystem.allowedDirectories",
  MCP_FS_FILESYSTEM_WORKING_DIRECTORY: "filesystem.workingDirectory",

  // Cache
  MCP_FS_CACHE_ENABLED: "cache.enabled",
  MCP_FS_CACHE_TTL: "cache.ttl",
  MCP_FS_CACHE_MAX_SIZE: "cache.maxSize",

  // Rate limiting
  MCP_FS_RATE_LIMIT_ENABLED: "rateLimit.enabled",
  MCP_FS_RATE_LIMIT_REQUESTS_PER_MINUTE: "rateLimit.requestsPerMinute",
  MCP_FS_RATE_LIMIT_SEARCH_REQUESTS_PER_MINUTE: "rateLimit.searchRequestsPerMinute",
  MCP_FS_RATE_LIMIT_TREE_REQUESTS_PER_MINUTE: "rateLimit.treeRequestsPerMinute",

  // Performance limits
  MCP_FS_LIMITS_MAX_FILE_SIZE: "limits.maxFileSize",
  MCP_FS_LIMITS_MAX_SEARCH_RESULTS: "limits.maxSearchResults",
  MCP_FS_LIMITS_MAX_TREE_DEPTH: "limits.maxTreeDepth",
  MCP_FS_LIMITS_SEARCH_TIMEOUT: "limits.searchTimeout",

  // Logging
  MCP_FS_LOGGING_LEVEL: "logging.level",
  MCP_FS_LOGGING_FORMAT: "logging.format",
  MCP_FS_LOGGING_DESTINATION: "logging.destination",

  // Security
  MCP_FS_SECURITY_AUTH_TOKEN: "security.authToken",
  MCP_FS_SECURITY_CORS_ENABLED: "security.corsEnabled",
  MCP_FS_SECURITY_CORS_ORIGIN: "security.corsOrigin",

  // Monitoring
  MCP_FS_MONITORING_METRICS_ENABLED: "monitoring.metricsEnabled",
  MCP_FS_MONITORING_METRICS_ENDPOINT: "monitoring.metricsEndpoint",
};

/**
 * CLI argument mapping to configuration paths
 */
export const CLI_ARG_MAPPING: Record<string, string> = {
  transport: "transport.mode",
  port: "transport.port",
  host: "transport.host",
  "working-dir": "filesystem.workingDirectory",
  "log-level": "logging.level",
  "log-format": "logging.format",
  "auth-token": "security.authToken",
  "cache-enabled": "cache.enabled",
  "cache-ttl": "cache.ttl",
  "cache-size": "cache.maxSize",
  "max-file-size": "limits.maxFileSize",
  "max-search-results": "limits.maxSearchResults",
  "max-tree-depth": "limits.maxTreeDepth",
  "search-timeout": "limits.searchTimeout",
  "metrics-enabled": "monitoring.metricsEnabled",
};
