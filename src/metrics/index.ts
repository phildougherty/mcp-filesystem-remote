/**
 * Metrics Module
 *
 * Provides Prometheus metrics collection for MCP Filesystem Server
 *
 * Features:
 * - Tool operation metrics (count, duration)
 * - Error tracking by type
 * - Connection metrics (SSE/HTTP)
 * - File operation metrics (bytes read/written)
 * - Cache metrics (hit/miss rates)
 * - HTTP request metrics
 * - Rate limit tracking
 * - Default Node.js metrics (heap, event loop, GC)
 *
 * Usage:
 * 1. Import metrics helpers in your code
 * 2. Wrap operations with recordToolOperation()
 * 3. Call record* functions for specific metrics
 * 4. Access /metrics endpoint for Prometheus scraping
 */

export { register } from "./registry.js";
export * from "./registry.js";
export * from "./middleware.js";
export * from "./helpers.js";

import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * Metrics configuration
 */
export interface MetricsConfig {
  enabled: boolean;
  port?: number;
  path?: string;
}

let metricsEnabled = true;

/**
 * Initialize metrics system
 */
export function initMetrics(config: MetricsConfig): void {
  metricsEnabled = config.enabled;

  if (metricsEnabled) {
    logger.info(
      {
        enabled: true,
        port: config.port,
        path: config.path || "/metrics",
      },
      "Metrics collection enabled"
    );
  } else {
    logger.info("Metrics collection disabled");
  }
}

/**
 * Check if metrics are enabled
 */
export function isMetricsEnabled(): boolean {
  return metricsEnabled;
}
