import fs from "fs/promises";
import path from "path";
import os from "os";
import { PermissionDeniedError, FileNotFoundError } from "../errors/index.js";

/**
 * Normalize paths consistently
 */
export function normalizePath(p: string): string {
  return path.normalize(p);
}

/**
 * Expand home directory in file paths
 */
export function expandHome(filepath: string): string {
  if (filepath.startsWith("~/") || filepath === "~") {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Validate that a path is within allowed directories
 */
export async function validatePath(
  requestedPath: string,
  allowedDirectories: string[],
  workingDirectory: string
): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(workingDirectory, expandedPath);
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some((dir) => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new PermissionDeniedError(requestedPath, "access", absolute);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some((dir) => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new PermissionDeniedError(
        requestedPath,
        "access (symlink target outside allowed directories)",
        realPath
      );
    }
    return realPath;
  } catch (error) {
    // If it's already a FileSystemError, re-throw it
    if (error instanceof PermissionDeniedError) {
      throw error;
    }

    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some((dir) => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new PermissionDeniedError(
          requestedPath,
          "access (parent directory outside allowed directories)",
          realParentPath
        );
      }
      return absolute;
    } catch (parentError) {
      // If parent error is already a FileSystemError, re-throw it
      if (parentError instanceof PermissionDeniedError) {
        throw parentError;
      }
      throw new FileNotFoundError(requestedPath, parentDir);
    }
  }
}
