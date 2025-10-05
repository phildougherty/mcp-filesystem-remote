/**
 * Error handling module for MCP Filesystem Server.
 *
 * This module provides:
 * - Hierarchical error classes with MCP error code mapping
 * - Client-safe error messages (sanitized paths)
 * - Server-side detailed logging
 * - Error conversion utilities
 * - Consistent error response formatting
 *
 * Usage:
 * ```typescript
 * import { PermissionDeniedError, handleToolError } from './errors';
 *
 * // Throw specific errors
 * throw new PermissionDeniedError('/path/to/file', 'read');
 *
 * // Handle errors in tool execution
 * try {
 *   await someOperation();
 * } catch (error) {
 *   return handleToolError(error, 'read_file', params);
 * }
 * ```
 */

// Base error class and types
export { FileSystemError, ErrorCode } from "./base.js";
export type { ErrorDetails } from "./base.js";

// Specific error classes
export {
  PermissionDeniedError,
  FileNotFoundError,
  InvalidPathError,
  OperationTimeoutError,
  RateLimitExceededError,
  InvalidArgumentError,
  FileAlreadyExistsError,
  OperationFailedError,
  InvalidParamsError,
} from "./filesystem-errors.js";

// Error utilities
export {
  toFileSystemError,
  logError,
  toMcpErrorResponse,
  toJsonRpcError,
  handleToolError,
  withErrorHandling,
  isRetryableError,
  getErrorSummary,
  validatePathArgument,
  getErrorMessage,
} from "./utils.js";
