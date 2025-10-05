/**
 * Cache configuration types
 */

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // Time to live in milliseconds
  maxSize: number; // Maximum cache size in bytes
}

export interface CacheEntry {
  content: string;
  mtime: number; // File modification time in milliseconds
  size: number; // Entry size in bytes
}

export interface CacheMetadata {
  path: string;
  mtime: number;
  size: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  currentSize: number;
  entryCount: number;
}
