/**
 * File caching module
 *
 * Provides LRU-based file content caching with:
 * - Configurable TTL (Time To Live)
 * - Maximum cache size limits
 * - Automatic invalidation on file modifications
 * - Cache hit/miss statistics
 */

export { FileCache } from "./FileCache.js";
export type { CacheConfig, CacheEntry, CacheMetadata, CacheStats } from "./types.js";

import { FileCache } from "./FileCache.js";
import type { CacheConfig } from "./types.js";

let globalCache: FileCache | null = null;

/**
 * Initialize the global file cache instance
 */
export function initCache(config: CacheConfig): FileCache {
  globalCache = new FileCache(config);
  return globalCache;
}

/**
 * Get the global cache instance
 */
export function getCache(): FileCache {
  if (!globalCache) {
    throw new Error("Cache not initialized. Call initCache() first.");
  }
  return globalCache;
}

/**
 * Check if cache is initialized
 */
export function isCacheInitialized(): boolean {
  return globalCache !== null;
}

/**
 * Parse cache size string (e.g., "100MB", "1GB") to bytes
 */
export function parseCacheSize(sizeStr: string): number {
  const units: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) {
    throw new Error(
      `Invalid cache size format: ${sizeStr}. Expected format: <number><unit> (e.g., "100MB", "1GB")`
    );
  }

  const valueStr = match[1];
  const unitStr = match[2];
  if (!valueStr || !unitStr) {
    throw new Error(`Invalid cache size format: ${sizeStr}`);
  }
  const value = parseFloat(valueStr);
  const unit = unitStr.toUpperCase();
  const multiplier = units[unit];

  if (!multiplier) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return Math.floor(value * multiplier);
}

/**
 * Format bytes to human-readable string
 */
export function formatCacheSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  if (bytes === 0) {
    return "0 B";
  }

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);

  if (i === 0) {
    return `${bytes} B`;
  }

  return `${value.toFixed(2)} ${units[i]}`;
}
