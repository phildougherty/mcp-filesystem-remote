import {
  toolOperationsTotal,
  toolOperationDuration,
  errorsTotal,
  bytesRead,
  bytesWritten,
  fileSize,
  searchResults,
  directoryTreeDepth,
  pathValidationFailures,
  mcpRequestsTotal,
  mcpRequestDuration,
} from "./registry.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * Record a tool operation with automatic timing and error handling
 */
export async function recordToolOperation<T>(
  toolName: string,
  operationType: string,
  operation: () => Promise<T>
): Promise<T> {
  const start = Date.now();

  try {
    const result = await operation();

    // Record success
    const duration = (Date.now() - start) / 1000;
    toolOperationDuration.labels(toolName, operationType).observe(duration);

    toolOperationsTotal.labels(toolName, "success").inc();

    logger.debug(
      {
        toolName,
        operationType,
        duration,
        status: "success",
      },
      "Tool operation completed"
    );

    return result;
  } catch (error) {
    // Record failure
    const duration = (Date.now() - start) / 1000;
    toolOperationDuration.labels(toolName, operationType).observe(duration);

    toolOperationsTotal.labels(toolName, "error").inc();

    // Record error type
    const errorType = getErrorType(error);
    errorsTotal.labels(errorType, toolName).inc();

    logger.warn(
      {
        toolName,
        operationType,
        duration,
        status: "error",
        errorType,
      },
      "Tool operation failed"
    );

    throw error;
  }
}

/**
 * Record bytes read from a file
 */
export function recordBytesRead(toolName: string, bytes: number): void {
  bytesRead.labels(toolName).inc(bytes);
  fileSize.labels("read").observe(bytes);
}

/**
 * Record bytes written to a file
 */
export function recordBytesWritten(toolName: string, bytes: number): void {
  bytesWritten.labels(toolName).inc(bytes);
  fileSize.labels("write").observe(bytes);
}

/**
 * Record search operation results
 */
export function recordSearchResults(toolName: string, resultCount: number): void {
  searchResults.labels(toolName).observe(resultCount);
}

/**
 * Record directory tree depth
 */
export function recordDirectoryTreeDepth(toolName: string, depth: number): void {
  directoryTreeDepth.labels(toolName).observe(depth);
}

/**
 * Record path validation failure
 */
export function recordPathValidationFailure(reason: string): void {
  pathValidationFailures.labels(reason).inc();
}

/**
 * Record MCP request
 */
export async function recordMcpRequest<T>(method: string, operation: () => Promise<T>): Promise<T> {
  const start = Date.now();

  try {
    const result = await operation();

    const duration = (Date.now() - start) / 1000;
    mcpRequestDuration.labels(method).observe(duration);
    mcpRequestsTotal.labels(method, "success").inc();

    return result;
  } catch (error) {
    const duration = (Date.now() - start) / 1000;
    mcpRequestDuration.labels(method).observe(duration);
    mcpRequestsTotal.labels(method, "error").inc();

    throw error;
  }
}

/**
 * Get error type from error object
 */
function getErrorType(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Categorize common error types
    if (message.includes("access denied") || message.includes("permission")) {
      return "permission_denied";
    }
    if (message.includes("not found") || message.includes("enoent")) {
      return "not_found";
    }
    if (message.includes("invalid") || message.includes("validation")) {
      return "validation_error";
    }
    if (message.includes("timeout")) {
      return "timeout";
    }
    if (message.includes("eacces")) {
      return "access_error";
    }
    if (message.includes("eisdir")) {
      return "is_directory";
    }
    if (message.includes("enotdir")) {
      return "not_directory";
    }

    // Generic error
    return error.name || "unknown_error";
  }

  return "unknown_error";
}

/**
 * Record an error explicitly
 */
export function recordError(errorType: string, toolName: string = "unknown"): void {
  errorsTotal.labels(errorType, toolName).inc();
}
