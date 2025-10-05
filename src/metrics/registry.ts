import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";

/**
 * Metrics Registry
 * Centralized Prometheus metrics for MCP Filesystem Server
 */

// Create a custom registry
export const register = new Registry();

// Add default Node.js metrics (heap, event loop, GC, etc.)
collectDefaultMetrics({
  register,
  prefix: "mcp_fs_",
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// ============================================================================
// Tool Operation Metrics
// ============================================================================

/**
 * Counter: Total number of tool operations by tool name
 */
export const toolOperationsTotal = new Counter({
  name: "mcp_fs_tool_operations_total",
  help: "Total number of tool operations",
  labelNames: ["tool_name", "status"],
  registers: [register],
});

/**
 * Histogram: Tool operation latency in seconds
 */
export const toolOperationDuration = new Histogram({
  name: "mcp_fs_tool_operation_duration_seconds",
  help: "Duration of tool operations in seconds",
  labelNames: ["tool_name", "operation_type"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

/**
 * Counter: Errors by error type
 */
export const errorsTotal = new Counter({
  name: "mcp_fs_errors_total",
  help: "Total number of errors",
  labelNames: ["error_type", "tool_name"],
  registers: [register],
});

// ============================================================================
// Connection Metrics (SSE/HTTP)
// ============================================================================

/**
 * Gauge: Active SSE connections
 */
export const activeConnections = new Gauge({
  name: "mcp_fs_active_connections",
  help: "Number of active SSE connections",
  labelNames: ["transport_type"],
  registers: [register],
});

/**
 * Histogram: Connection duration in seconds
 */
export const connectionDuration = new Histogram({
  name: "mcp_fs_connection_duration_seconds",
  help: "Duration of connections in seconds",
  labelNames: ["transport_type"],
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600, 7200, 14400, 28800],
  registers: [register],
});

/**
 * Counter: Total connections established
 */
export const connectionsTotal = new Counter({
  name: "mcp_fs_connections_total",
  help: "Total number of connections established",
  labelNames: ["transport_type"],
  registers: [register],
});

// ============================================================================
// File Operation Metrics
// ============================================================================

/**
 * Counter: Bytes read from files
 */
export const bytesRead = new Counter({
  name: "mcp_fs_bytes_read_total",
  help: "Total bytes read from files",
  labelNames: ["tool_name"],
  registers: [register],
});

/**
 * Counter: Bytes written to files
 */
export const bytesWritten = new Counter({
  name: "mcp_fs_bytes_written_total",
  help: "Total bytes written to files",
  labelNames: ["tool_name"],
  registers: [register],
});

/**
 * Histogram: File size distribution
 */
export const fileSize = new Histogram({
  name: "mcp_fs_file_size_bytes",
  help: "Distribution of file sizes accessed",
  labelNames: ["operation"],
  buckets: [1024, 10240, 102400, 1048576, 10485760, 104857600, 1073741824],
  registers: [register],
});

// ============================================================================
// HTTP Request Metrics
// ============================================================================

/**
 * Histogram: HTTP request duration
 */
export const httpRequestDuration = new Histogram({
  name: "mcp_fs_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Counter: HTTP requests total
 */
export const httpRequestsTotal = new Counter({
  name: "mcp_fs_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// ============================================================================
// Cache Metrics (for future cache implementation)
// ============================================================================

/**
 * Counter: Cache hits
 */
export const cacheHits = new Counter({
  name: "mcp_fs_cache_hits_total",
  help: "Total cache hits",
  labelNames: ["cache_type"],
  registers: [register],
});

/**
 * Counter: Cache misses
 */
export const cacheMisses = new Counter({
  name: "mcp_fs_cache_misses_total",
  help: "Total cache misses",
  labelNames: ["cache_type"],
  registers: [register],
});

/**
 * Gauge: Cache size in bytes
 */
export const cacheSize = new Gauge({
  name: "mcp_fs_cache_size_bytes",
  help: "Current cache size in bytes",
  labelNames: ["cache_type"],
  registers: [register],
});

// ============================================================================
// Rate Limit Metrics
// ============================================================================

/**
 * Counter: Rate limit hits
 */
export const rateLimitHits = new Counter({
  name: "mcp_fs_rate_limit_hits_total",
  help: "Total rate limit hits",
  labelNames: ["limit_type", "client_id"],
  registers: [register],
});

// ============================================================================
// Search & Directory Operations
// ============================================================================

/**
 * Histogram: Search results count
 */
export const searchResults = new Histogram({
  name: "mcp_fs_search_results_count",
  help: "Number of search results returned",
  labelNames: ["tool_name"],
  buckets: [0, 1, 10, 50, 100, 500, 1000, 5000, 10000],
  registers: [register],
});

/**
 * Histogram: Directory tree depth
 */
export const directoryTreeDepth = new Histogram({
  name: "mcp_fs_directory_tree_depth",
  help: "Depth of directory tree traversal",
  labelNames: ["tool_name"],
  buckets: [1, 2, 3, 5, 10, 15, 20, 30, 50],
  registers: [register],
});

/**
 * Counter: Path validation failures
 */
export const pathValidationFailures = new Counter({
  name: "mcp_fs_path_validation_failures_total",
  help: "Total path validation failures",
  labelNames: ["reason"],
  registers: [register],
});

// ============================================================================
// MCP Protocol Metrics
// ============================================================================

/**
 * Counter: MCP requests by method
 */
export const mcpRequestsTotal = new Counter({
  name: "mcp_fs_mcp_requests_total",
  help: "Total MCP requests by method",
  labelNames: ["method", "status"],
  registers: [register],
});

/**
 * Histogram: MCP request duration
 */
export const mcpRequestDuration = new Histogram({
  name: "mcp_fs_mcp_request_duration_seconds",
  help: "MCP request duration in seconds",
  labelNames: ["method"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});
