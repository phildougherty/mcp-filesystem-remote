import fs from "fs/promises";
import path from "path";
import { minimatch } from "minimatch";
import { getLogger } from "../utils/logger.js";

export interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

/**
 * Get detailed file statistics
 */
export async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

/**
 * Recursively search for files matching a pattern
 */
export async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = [],
  maxResults: number = 1000,
  timeout: number = 30000,
  validatePath?: (path: string) => Promise<string>
): Promise<string[]> {
  const results: string[] = [];
  const abortController = new AbortController();
  let timedOut = false;

  // Set up timeout
  const timeoutId = setTimeout(() => {
    timedOut = true;
    abortController.abort();
  }, timeout);

  try {
    async function search(currentPath: string) {
      // Check for timeout or max results
      if (abortController.signal.aborted || results.length >= maxResults) {
        return;
      }

      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        // Check limits before processing each entry
        if (abortController.signal.aborted || results.length >= maxResults) {
          return;
        }

        const fullPath = path.join(currentPath, entry.name);
        try {
          // Validate each path before processing (if validator provided)
          if (validatePath) {
            await validatePath(fullPath);
          }

          // Check if path matches any exclude pattern
          const relativePath = path.relative(rootPath, fullPath);
          const shouldExclude = excludePatterns.some((pattern) => {
            const globPattern = pattern.includes("*") ? pattern : `**/${pattern}/**`;
            return minimatch(relativePath, globPattern, { dot: true });
          });

          if (shouldExclude) {
            continue;
          }

          if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(fullPath);
          }

          if (entry.isDirectory()) {
            await search(fullPath);
          }
        } catch (error) {
          // Skip invalid paths during search
          continue;
        }
      }
    }

    await search(rootPath);
  } finally {
    clearTimeout(timeoutId);
  }

  // Add warning message if search was limited
  const logger = getLogger();
  if (timedOut) {
    logger.warn(`Search timed out after ${timeout}ms. ${results.length} results found.`);
  } else if (results.length >= maxResults) {
    logger.warn(`Search stopped at ${maxResults} results limit.`);
  }

  return results;
}
