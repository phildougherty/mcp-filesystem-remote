/**
 * Base error class for all filesystem-related errors.
 * Provides consistent error handling with MCP error code mapping,
 * client-safe messages, and structured logging support.
 */

export enum ErrorCode {
  // MCP Protocol Error Codes (from JSON-RPC 2.0)
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // Custom Application Error Codes
  PERMISSION_DENIED = -32001,
  FILE_NOT_FOUND = -32002,
  INVALID_PATH = -32003,
  OPERATION_TIMEOUT = -32004,
  RATE_LIMIT_EXCEEDED = -32005,
  INVALID_ARGUMENT = -32006,
  FILE_ALREADY_EXISTS = -32007,
  OPERATION_FAILED = -32008,
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: any;
  suggestion?: string;
  internalMessage?: string;
  stack?: string;
}

/**
 * Base class for all filesystem errors.
 * Extends Error with additional metadata for better error handling.
 */
export class FileSystemError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly suggestion?: string;
  public readonly internalMessage?: string;
  public readonly httpStatus: number;

  constructor(
    message: string,
    code: ErrorCode,
    options?: {
      details?: any;
      suggestion?: string;
      internalMessage?: string;
      httpStatus?: number;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = options?.details;
    this.suggestion = options?.suggestion;
    this.internalMessage = options?.internalMessage;
    this.httpStatus = options?.httpStatus || this.mapErrorCodeToHttpStatus(code);

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Preserve the original error if provided
    if (options?.cause) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }

  /**
   * Map error codes to HTTP status codes
   */
  private mapErrorCodeToHttpStatus(code: ErrorCode): number {
    switch (code) {
      case ErrorCode.PERMISSION_DENIED:
        return 403;
      case ErrorCode.FILE_NOT_FOUND:
        return 404;
      case ErrorCode.INVALID_PATH:
      case ErrorCode.INVALID_ARGUMENT:
      case ErrorCode.INVALID_PARAMS:
        return 400;
      case ErrorCode.OPERATION_TIMEOUT:
        return 408;
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return 429;
      case ErrorCode.FILE_ALREADY_EXISTS:
        return 409;
      case ErrorCode.METHOD_NOT_FOUND:
        return 404;
      case ErrorCode.PARSE_ERROR:
      case ErrorCode.INVALID_REQUEST:
        return 400;
      case ErrorCode.INTERNAL_ERROR:
      case ErrorCode.OPERATION_FAILED:
      default:
        return 500;
    }
  }

  /**
   * Get client-safe error details (excludes sensitive information)
   */
  public toClientResponse(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      suggestion: this.suggestion,
    };
  }

  /**
   * Get full error details for server-side logging (includes everything)
   */
  public toLogDetails(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      suggestion: this.suggestion,
      internalMessage: this.internalMessage,
      stack: this.stack,
    };
  }

  /**
   * Convert to MCP error response format
   */
  public toMcpError(): { code: number; message: string; data?: any } {
    return {
      code: this.code,
      message: this.message,
      data: this.details,
    };
  }

  /**
   * Check if this is a user error (client fault) vs system error (server fault)
   */
  public isUserError(): boolean {
    return [
      ErrorCode.PERMISSION_DENIED,
      ErrorCode.FILE_NOT_FOUND,
      ErrorCode.INVALID_PATH,
      ErrorCode.INVALID_ARGUMENT,
      ErrorCode.INVALID_PARAMS,
      ErrorCode.FILE_ALREADY_EXISTS,
      ErrorCode.METHOD_NOT_FOUND,
      ErrorCode.PARSE_ERROR,
      ErrorCode.INVALID_REQUEST,
    ].includes(this.code);
  }
}
