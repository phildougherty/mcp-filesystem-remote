/**
 * Utility functions for error handling.
 * Provides helpers for error conversion, logging, and response formatting.
 */

import { FileSystemError, ErrorCode } from "./base.js";
import {
  PermissionDeniedError,
  FileNotFoundError,
  InvalidPathError,
  OperationFailedError,
  InvalidArgumentError,
} from "./filesystem-errors.js";
import { getLogger } from "../utils/logger.js";

/**
 * Convert a generic error to an appropriate FileSystemError.
 * This is useful for wrapping Node.js fs errors and other exceptions.
 */
export function toFileSystemError(
  error: unknown,
  operation: string,
  path?: string
): FileSystemError {
  // If it's already a FileSystemError, return it
  if (error instanceof FileSystemError) {
    return error;
  }

  // Handle Node.js system errors
  if (error instanceof Error && "code" in error) {
    const nodeError = error as NodeJS.ErrnoException;

    switch (nodeError.code) {
      case "ENOENT":
        return new FileNotFoundError(path || "unknown", nodeError.path);

      case "EACCES":
      case "EPERM":
        return new PermissionDeniedError(path || "unknown", operation, nodeError.path);

      case "EEXIST":
        return new FileSystemError(
          "File or directory already exists",
          ErrorCode.FILE_ALREADY_EXISTS,
          {
            details: { operation },
            internalMessage: nodeError.path ? `Path exists: ${nodeError.path}` : undefined,
            suggestion: "Choose a different path or remove the existing file.",
            cause: nodeError,
          }
        );

      case "ENOTDIR":
        return new InvalidPathError("Path component is not a directory", nodeError.path);

      case "EISDIR":
        return new InvalidPathError("Expected a file but found a directory", nodeError.path);

      case "EINVAL":
        return new InvalidArgumentError("path", "Invalid path format", nodeError.path);

      case "ETIMEDOUT":
      case "ETIME":
        return new FileSystemError(
          `Operation timed out: ${operation}`,
          ErrorCode.OPERATION_TIMEOUT,
          {
            details: { operation },
            suggestion: "The operation took too long. Try again or check system resources.",
            cause: nodeError,
          }
        );

      default:
        // Generic operation failed error for unknown Node.js errors
        return new OperationFailedError(
          operation,
          nodeError.code || "Unknown error",
          nodeError,
          nodeError.message
        );
    }
  }

  // Handle generic Error objects
  if (error instanceof Error) {
    return new OperationFailedError(operation, error.message, error, error.stack);
  }

  // Handle non-Error objects
  return new OperationFailedError(
    operation,
    String(error),
    undefined,
    `Non-error object thrown: ${JSON.stringify(error)}`
  );
}

/**
 * Log an error with full details server-side.
 * Uses the logger to record stack traces and internal details.
 */
export function logError(error: FileSystemError, context?: Record<string, any>): void {
  const logger = getLogger();
  const logDetails = error.toLogDetails();

  const enrichedContext = {
    ...context,
    errorCode: logDetails.code,
    errorName: error.name,
    isUserError: error.isUserError(),
    httpStatus: error.httpStatus,
    ...logDetails,
  };

  if (error.isUserError()) {
    // User errors are logged at warn level (client mistakes)
    logger.warn(enrichedContext, `User error: ${logDetails.message}`);
  } else {
    // System errors are logged at error level (server issues)
    logger.error(enrichedContext, `System error: ${logDetails.message}`);
  }
}

/**
 * Create a client-safe MCP error response.
 * Excludes sensitive internal details like stack traces and internal paths.
 */
export function toMcpErrorResponse(error: FileSystemError): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const clientError = error.toClientResponse();

  let errorText = `Error: ${clientError.message}`;

  if (clientError.suggestion) {
    errorText += `\n\nSuggestion: ${clientError.suggestion}`;
  }

  if (clientError.details) {
    errorText += `\n\nDetails: ${JSON.stringify(clientError.details, null, 2)}`;
  }

  return {
    content: [{ type: "text", text: errorText }],
    isError: true,
  };
}

/**
 * Create a JSON-RPC error response.
 */
export function toJsonRpcError(
  error: FileSystemError,
  requestId?: string | number | null
): {
  jsonrpc: "2.0";
  id: string | number | null;
  error: { code: number; message: string; data?: any };
} {
  const mcpError = error.toMcpError();

  return {
    jsonrpc: "2.0",
    id: requestId ?? null,
    error: mcpError,
  };
}

/**
 * Handle an error from a tool execution.
 * Logs the error server-side and returns a client-safe response.
 */
export function handleToolError(
  error: unknown,
  toolName: string,
  params: any
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const fsError = toFileSystemError(error, `${toolName} execution`, params?.path);

  // Log the error with tool context
  logError(fsError, {
    tool: toolName,
    params,
  });

  return toMcpErrorResponse(fsError);
}

/**
 * Wrap an async operation with error handling.
 * Automatically converts and logs errors.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const fsError = toFileSystemError(error, operationName);
    logError(fsError, context);
    throw fsError;
  }
}

/**
 * Check if an error should trigger a retry.
 * Returns true for transient errors that might succeed on retry.
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof FileSystemError)) {
    return false;
  }

  const retryableCodes = [ErrorCode.OPERATION_TIMEOUT, ErrorCode.RATE_LIMIT_EXCEEDED];

  return retryableCodes.includes(error.code);
}

/**
 * Get a human-readable error summary for logging.
 */
export function getErrorSummary(error: unknown): string {
  if (error instanceof FileSystemError) {
    return `[${error.name}] ${error.message}`;
  }

  if (error instanceof Error) {
    return `[${error.name}] ${error.message}`;
  }

  return String(error);
}

/**
 * Validate that a path argument is provided and is a string.
 * Throws InvalidArgumentError if validation fails.
 */
export function validatePathArgument(path: unknown, argumentName = "path"): asserts path is string {
  if (typeof path !== "string") {
    throw new InvalidArgumentError(argumentName, "Must be a string", path);
  }

  if (path.trim().length === 0) {
    throw new InvalidArgumentError(argumentName, "Cannot be empty", path);
  }
}

/**
 * Safely get error message from unknown error type.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
