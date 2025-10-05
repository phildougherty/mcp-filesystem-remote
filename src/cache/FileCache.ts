import { LRUCache } from "lru-cache";
import fs from "fs/promises";
import type { CacheConfig, CacheEntry, CacheMetadata, CacheStats } from "./types.js";
import { getLogger } from "../utils/logger.js";

/**
 * File content cache with LRU eviction, TTL, and size limits.
 *
 * Features:
 * - LRU (Least Recently Used) eviction policy
 * - Configurable TTL (Time To Live)
 * - Maximum cache size limit in bytes
 * - Automatic invalidation on file modification time changes
 * - Separate metadata and content caching
 * - Cache hit/miss statistics
 */
export class FileCache {
  private contentCache: LRUCache<string, CacheEntry>;
  private metadataCache: LRUCache<string, CacheMetadata>;
  private config: CacheConfig;
  private stats: CacheStats;
  private currentSize: number;
  private logger = getLogger();

  constructor(config: CacheConfig) {
    this.config = config;
    this.currentSize = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      currentSize: 0,
      entryCount: 0,
    };

    // Configure LRU cache for file contents
    this.contentCache = new LRUCache<string, CacheEntry>({
      max: 10000, // Maximum number of entries (items, not bytes)
      ttl: config.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (value, key) => {
        // Update size tracking when entry is evicted
        this.currentSize -= value.size;
        this.stats.evictions++;
        this.stats.currentSize = this.currentSize;
        this.stats.entryCount = this.contentCache.size;
        this.logger.debug({ key, size: value.size }, "Cache entry evicted");
      },
    });

    // Configure LRU cache for file metadata (smaller, faster)
    this.metadataCache = new LRUCache<string, CacheMetadata>({
      max: 50000, // More metadata entries than content
      ttl: config.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    });

    this.logger.debug(
      { enabled: config.enabled, ttl: config.ttl, maxSize: config.maxSize },
      "FileCache initialized"
    );
  }

  /**
   * Get file content from cache if available and valid
   */
  async get(filePath: string): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    const entry = this.contentCache.get(filePath);
    if (!entry) {
      this.stats.misses++;
      this.logger.debug({ path: filePath }, "Cache miss");
      return null;
    }

    // Validate that file hasn't been modified
    try {
      const stat = await fs.stat(filePath);
      const currentMtime = stat.mtimeMs;

      if (currentMtime !== entry.mtime) {
        // File has been modified, invalidate cache
        this.invalidate(filePath);
        this.stats.misses++;
        this.logger.debug(
          { path: filePath, cachedMtime: entry.mtime, currentMtime },
          "Cache miss - file modified"
        );
        return null;
      }

      // Cache hit!
      this.stats.hits++;
      this.logger.debug({ path: filePath, size: entry.size }, "Cache hit");
      return entry.content;
    } catch (error) {
      // File no longer exists, invalidate cache
      this.invalidate(filePath);
      this.stats.misses++;
      this.logger.debug({ path: filePath, error }, "Cache miss - file error");
      return null;
    }
  }

  /**
   * Store file content in cache
   */
  async set(filePath: string, content: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const stat = await fs.stat(filePath);
      const mtime = stat.mtimeMs;
      const size = Buffer.byteLength(content, "utf-8");

      // Check if adding this entry would exceed max size
      // If so, evict entries until we have space
      while (this.currentSize + size > this.config.maxSize && this.contentCache.size > 0) {
        // LRU will evict the least recently used entry
        const oldestKey = this.getOldestKey();
        if (oldestKey) {
          this.contentCache.delete(oldestKey);
        } else {
          break; // Safety check
        }
      }

      // Don't cache if single file is larger than max cache size
      if (size > this.config.maxSize) {
        this.logger.debug(
          { path: filePath, size, maxSize: this.config.maxSize },
          "File too large to cache"
        );
        return;
      }

      const entry: CacheEntry = {
        content,
        mtime,
        size,
      };

      this.contentCache.set(filePath, entry);
      this.currentSize += size;
      this.stats.currentSize = this.currentSize;
      this.stats.entryCount = this.contentCache.size;

      this.logger.debug({ path: filePath, size, mtime }, "File cached");

      // Also cache metadata
      this.metadataCache.set(filePath, {
        path: filePath,
        mtime,
        size: stat.size,
      });
    } catch (error) {
      this.logger.debug({ path: filePath, error }, "Failed to cache file");
    }
  }

  /**
   * Get file metadata from cache
   */
  async getMetadata(filePath: string): Promise<CacheMetadata | null> {
    if (!this.config.enabled) {
      return null;
    }

    const metadata = this.metadataCache.get(filePath);
    if (!metadata) {
      return null;
    }

    // Validate metadata is still current
    try {
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs !== metadata.mtime) {
        this.metadataCache.delete(filePath);
        return null;
      }
      return metadata;
    } catch {
      this.metadataCache.delete(filePath);
      return null;
    }
  }

  /**
   * Invalidate cache entry for a specific file
   */
  invalidate(filePath: string): void {
    const entry = this.contentCache.get(filePath);
    if (entry) {
      this.currentSize -= entry.size;
      this.stats.currentSize = this.currentSize;
    }

    this.contentCache.delete(filePath);
    this.metadataCache.delete(filePath);
    this.stats.entryCount = this.contentCache.size;

    this.logger.debug({ path: filePath }, "Cache invalidated");
  }

  /**
   * Invalidate all cache entries
   */
  invalidateAll(): void {
    this.contentCache.clear();
    this.metadataCache.clear();
    this.currentSize = 0;
    this.stats.currentSize = 0;
    this.stats.entryCount = 0;

    this.logger.debug("All cache entries invalidated");
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      currentSize: this.currentSize,
      entryCount: this.contentCache.size,
    };
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the oldest key in the cache (for eviction)
   */
  private getOldestKey(): string | undefined {
    // LRU cache iterator returns items from most to least recent
    // We want the last (oldest) one
    let oldestKey: string | undefined;
    for (const key of this.contentCache.keys()) {
      oldestKey = key;
    }
    return oldestKey;
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheConfig>): void {
    if (config.enabled !== undefined) {
      this.config.enabled = config.enabled;
      if (!config.enabled) {
        this.invalidateAll();
      }
    }

    if (config.ttl !== undefined) {
      this.config.ttl = config.ttl;
      // Update existing caches with new TTL
      this.contentCache.ttl = config.ttl;
      this.metadataCache.ttl = config.ttl;
    }

    if (config.maxSize !== undefined) {
      this.config.maxSize = config.maxSize;
      // Evict entries if current size exceeds new max
      while (this.currentSize > this.config.maxSize && this.contentCache.size > 0) {
        const oldestKey = this.getOldestKey();
        if (oldestKey) {
          this.contentCache.delete(oldestKey);
        } else {
          break;
        }
      }
    }

    this.logger.debug({ config: this.config }, "Cache configuration updated");
  }
}
