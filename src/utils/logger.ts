import pino from "pino";
import { randomUUID } from "crypto";
import path from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty";

interface LoggerConfig {
  level: LogLevel;
  format: LogFormat;
  allowedDirectories: string[];
}

// Store correlation ID in AsyncLocalStorage for request tracing
class CorrelationIdManager {
  private currentId: string | null = null;

  generate(): string {
    this.currentId = randomUUID();
    return this.currentId;
  }

  get(): string | null {
    return this.currentId;
  }

  set(id: string): void {
    this.currentId = id;
  }

  clear(): void {
    this.currentId = null;
  }
}

export const correlationIdManager = new CorrelationIdManager();

// Sanitize paths to prevent leaking sensitive information
function sanitizePath(filePath: string, allowedDirs: string[]): string {
  // If path is within allowed directories, show it relative to the allowed dir
  for (const allowedDir of allowedDirs) {
    if (filePath.startsWith(allowedDir)) {
      return path.relative(allowedDir, filePath) || ".";
    }
  }
  // Otherwise, just show the basename for security
  return path.basename(filePath);
}

// Sanitize log arguments to prevent sensitive data leakage
function sanitizeArgs(args: any[], allowedDirs: string[]): any[] {
  return args.map((arg) => {
    if (typeof arg === "string") {
      // Check if it looks like a file path
      if (arg.includes("/") || arg.includes("\\")) {
        return sanitizePath(arg, allowedDirs);
      }
      return arg;
    }
    if (typeof arg === "object" && arg !== null) {
      // Recursively sanitize object properties
      const sanitized: any = {};
      for (const [key, value] of Object.entries(arg)) {
        if (typeof value === "string" && (value.includes("/") || value.includes("\\"))) {
          sanitized[key] = sanitizePath(value, allowedDirs);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    return arg;
  });
}

// Create logger instance
function createLogger(config: LoggerConfig): pino.Logger {
  const transport =
    config.format === "pretty"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
            singleLine: false,
            messageFormat: "{msg}",
          },
        }
      : undefined;

  return pino({
    level: config.level,
    transport,
    // Base context that will be included in every log
    base: {
      service: "mcp-filesystem-server",
    },
    // Customize timestamp format
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields
    redact: {
      paths: ["req.headers.authorization", "password", "token", "secret"],
      remove: true,
    },
  });
}

// Logger wrapper with correlation IDs and path sanitization
export class Logger {
  private logger: pino.Logger;
  private allowedDirectories: string[];

  constructor(config: LoggerConfig) {
    this.logger = createLogger(config);
    this.allowedDirectories = config.allowedDirectories;
  }

  private addContext(obj?: object): object {
    const correlationId = correlationIdManager.get();
    const context: any = { ...obj };

    if (correlationId) {
      context.correlationId = correlationId;
    }

    return context;
  }

  debug(msg: string, ...args: any[]): void;
  debug(obj: object, msg: string, ...args: any[]): void;
  debug(msgOrObj: string | object, ...args: any[]): void {
    if (typeof msgOrObj === "string") {
      const sanitized = sanitizeArgs(args, this.allowedDirectories);
      this.logger.debug(this.addContext(), msgOrObj, ...sanitized);
    } else {
      const [msg, ...restArgs] = args;
      const sanitized = sanitizeArgs(restArgs, this.allowedDirectories);
      this.logger.debug(this.addContext(msgOrObj), msg, ...sanitized);
    }
  }

  info(msg: string, ...args: any[]): void;
  info(obj: object, msg: string, ...args: any[]): void;
  info(msgOrObj: string | object, ...args: any[]): void {
    if (typeof msgOrObj === "string") {
      const sanitized = sanitizeArgs(args, this.allowedDirectories);
      this.logger.info(this.addContext(), msgOrObj, ...sanitized);
    } else {
      const [msg, ...restArgs] = args;
      const sanitized = sanitizeArgs(restArgs, this.allowedDirectories);
      this.logger.info(this.addContext(msgOrObj), msg, ...sanitized);
    }
  }

  warn(msg: string, ...args: any[]): void;
  warn(obj: object, msg: string, ...args: any[]): void;
  warn(msgOrObj: string | object, ...args: any[]): void {
    if (typeof msgOrObj === "string") {
      const sanitized = sanitizeArgs(args, this.allowedDirectories);
      this.logger.warn(this.addContext(), msgOrObj, ...sanitized);
    } else {
      const [msg, ...restArgs] = args;
      const sanitized = sanitizeArgs(restArgs, this.allowedDirectories);
      this.logger.warn(this.addContext(msgOrObj), msg, ...sanitized);
    }
  }

  error(msg: string, ...args: any[]): void;
  error(obj: object, msg: string, ...args: any[]): void;
  error(msgOrObj: string | object, ...args: any[]): void {
    if (typeof msgOrObj === "string") {
      const sanitized = sanitizeArgs(args, this.allowedDirectories);
      this.logger.error(this.addContext(), msgOrObj, ...sanitized);
    } else {
      const [msg, ...restArgs] = args;
      const sanitized = sanitizeArgs(restArgs, this.allowedDirectories);
      this.logger.error(this.addContext(msgOrObj), msg, ...sanitized);
    }
  }

  // Special method for tool execution logging
  tool(toolName: string, params: any, result?: any, error?: Error): void {
    const context = {
      tool: toolName,
      params: sanitizeArgs([params], this.allowedDirectories)[0],
      ...(result && { result: "success" }),
      ...(error && { error: error.message }),
    };

    if (error) {
      this.error(context, `Tool execution failed: ${toolName}`);
    } else {
      this.info(context, `Tool executed: ${toolName}`);
    }
  }

  // Method for request/response logging
  request(method: string, params: any): void {
    this.debug(
      { method, params: sanitizeArgs([params], this.allowedDirectories)[0] },
      "MCP request received"
    );
  }

  response(method: string, success: boolean, error?: any): void {
    const context = {
      method,
      success,
      ...(error && { error: error.message || String(error) }),
    };

    if (success) {
      this.debug(context, "MCP response sent");
    } else {
      this.error(context, "MCP request failed");
    }
  }

  // Connection lifecycle logging
  connection(event: "established" | "closed" | "error", connectionId: string, details?: any): void {
    const context = {
      connectionId,
      event,
      ...details,
    };

    switch (event) {
      case "established":
        this.info(context, "Connection established");
        break;
      case "closed":
        this.info(context, "Connection closed");
        break;
      case "error":
        this.error(context, "Connection error");
        break;
    }
  }

  // Update allowed directories (for path sanitization)
  updateAllowedDirectories(dirs: string[]): void {
    this.allowedDirectories = dirs;
  }

  // Get underlying pino logger for advanced use cases
  getLogger(): pino.Logger {
    return this.logger;
  }
}

// Global logger instance (will be initialized in index.ts)
let globalLogger: Logger | null = null;

export function initLogger(config: LoggerConfig): Logger {
  globalLogger = new Logger(config);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    throw new Error("Logger not initialized. Call initLogger() first.");
  }
  return globalLogger;
}
