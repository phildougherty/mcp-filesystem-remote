/**
 * Specific error classes for filesystem operations.
 * Each error type provides appropriate error codes, messages, and suggestions.
 */

import { FileSystemError, ErrorCode } from "./base.js";

/**
 * Error thrown when access to a file or directory is denied.
 */
export class PermissionDeniedError extends FileSystemError {
  constructor(_path: string, operation: string, internalPath?: string) {
    super(
      `Permission denied: Cannot ${operation} the specified path`,
      ErrorCode.PERMISSION_DENIED,
      {
        details: { operation },
        suggestion:
          "Ensure the path is within allowed directories and you have the necessary permissions.",
        internalMessage: internalPath ? `Access denied for: ${internalPath}` : undefined,
        httpStatus: 403,
      }
    );
  }
}

/**
 * Error thrown when a file or directory is not found.
 */
export class FileNotFoundError extends FileSystemError {
  constructor(_path: string, internalPath?: string) {
    super("The specified file or directory does not exist", ErrorCode.FILE_NOT_FOUND, {
      details: { path: "requested path" },
      suggestion: "Check the path spelling and verify the file exists.",
      internalMessage: internalPath ? `File not found: ${internalPath}` : undefined,
      httpStatus: 404,
    });
  }
}

/**
 * Error thrown when a path is invalid or outside allowed directories.
 */
export class InvalidPathError extends FileSystemError {
  constructor(reason: string, internalPath?: string) {
    super(`Invalid path: ${reason}`, ErrorCode.INVALID_PATH, {
      details: { reason },
      suggestion: "Ensure the path is within allowed directories and properly formatted.",
      internalMessage: internalPath ? `Invalid path: ${internalPath}` : undefined,
      httpStatus: 400,
    });
  }
}

/**
 * Error thrown when an operation times out.
 */
export class OperationTimeoutError extends FileSystemError {
  constructor(operation: string, timeoutMs: number, details?: string) {
    super(`Operation timed out: ${operation}`, ErrorCode.OPERATION_TIMEOUT, {
      details: { operation, timeoutMs },
      suggestion: `The operation took longer than ${timeoutMs}ms. Try reducing the scope or increasing the timeout.`,
      internalMessage: details,
      httpStatus: 408,
    });
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitExceededError extends FileSystemError {
  constructor(limit: number, retryAfterSeconds?: number) {
    super("Rate limit exceeded", ErrorCode.RATE_LIMIT_EXCEEDED, {
      details: { limit, retryAfter: retryAfterSeconds },
      suggestion: retryAfterSeconds
        ? `Wait ${retryAfterSeconds} seconds before retrying.`
        : "Please slow down your requests and try again later.",
      httpStatus: 429,
    });
  }
}

/**
 * Error thrown when an argument is invalid.
 */
export class InvalidArgumentError extends FileSystemError {
  constructor(argumentName: string, reason: string, received?: any) {
    super(`Invalid argument: ${argumentName} - ${reason}`, ErrorCode.INVALID_ARGUMENT, {
      details: { argumentName, reason, received: received ? typeof received : undefined },
      suggestion: "Check the API documentation for correct parameter types and values.",
      httpStatus: 400,
    });
  }
}

/**
 * Error thrown when a file already exists (for operations that require it not to exist).
 */
export class FileAlreadyExistsError extends FileSystemError {
  constructor(_path: string, internalPath?: string) {
    super(
      "A file or directory already exists at the specified path",
      ErrorCode.FILE_ALREADY_EXISTS,
      {
        details: { path: "target path" },
        suggestion: "Choose a different path or remove the existing file first.",
        internalMessage: internalPath ? `File exists: ${internalPath}` : undefined,
        httpStatus: 409,
      }
    );
  }
}

/**
 * Error thrown when a generic operation fails.
 */
export class OperationFailedError extends FileSystemError {
  constructor(operation: string, reason: string, cause?: Error, internalDetails?: string) {
    super(`Operation failed: ${operation}`, ErrorCode.OPERATION_FAILED, {
      details: { operation, reason },
      suggestion: "Check the logs for more details or retry the operation.",
      internalMessage: internalDetails,
      cause,
      httpStatus: 500,
    });
  }
}

/**
 * Error thrown when MCP method parameters are invalid.
 */
export class InvalidParamsError extends FileSystemError {
  constructor(reason: string, details?: any) {
    super(`Invalid parameters: ${reason}`, ErrorCode.INVALID_PARAMS, {
      details,
      suggestion: "Verify all required parameters are provided with correct types.",
      httpStatus: 400,
    });
  }
}
