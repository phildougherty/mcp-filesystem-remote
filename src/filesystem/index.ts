// Re-export all filesystem functionality from a single entry point

// Operations
export {
  normalizeLineEndings,
  createUnifiedDiff,
  applyFileEdits,
  formatSize,
  tailFile,
  headFile,
} from "./operations.js";

// Search
export { getFileStats, searchFiles, type FileInfo } from "./search.js";

// Security
export { normalizePath, expandHome, validatePath } from "./security.js";
