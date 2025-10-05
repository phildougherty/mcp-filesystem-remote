import rateLimit, { type Options, type RateLimitRequestHandler } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { getLogger } from "../utils/logger.js";

// Rate limit configuration interface
export interface RateLimitConfig {
  enabled: boolean;
  general: {
    windowMs: number;
    max: number;
  };
  perOperation: {
    search_files: {
      windowMs: number;
      max: number;
    };
    directory_tree: {
      windowMs: number;
      max: number;
    };
    read_file: {
      windowMs: number;
      max: number;
    };
    read_multiple_files: {
      windowMs: number;
      max: number;
    };
    write_file: {
      windowMs: number;
      max: number;
    };
    edit_file: {
      windowMs: number;
      max: number;
    };
  };
  concurrentRequests: number;
}

// Default rate limit configuration
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  enabled: true,
  general: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
  },
  perOperation: {
    search_files: {
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 searches per minute
    },
    directory_tree: {
      windowMs: 60 * 1000, // 1 minute
      max: 5, // 5 tree operations per minute
    },
    read_file: {
      windowMs: 60 * 1000, // 1 minute
      max: 200, // 200 reads per minute
    },
    read_multiple_files: {
      windowMs: 60 * 1000, // 1 minute
      max: 50, // 50 multi-read operations per minute
    },
    write_file: {
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 writes per minute
    },
    edit_file: {
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 edits per minute
    },
  },
  concurrentRequests: 10, // 10 concurrent requests per IP
};

// Parse rate limit configuration from CLI argument
export function parseRateLimitConfig(configStr: string): Partial<RateLimitConfig> {
  try {
    const config = JSON.parse(configStr);
    return config;
  } catch (error) {
    throw new Error(
      `Invalid rate limit configuration: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Merge custom config with defaults
export function mergeRateLimitConfig(customConfig: Partial<RateLimitConfig> = {}): RateLimitConfig {
  return {
    enabled: customConfig.enabled ?? DEFAULT_RATE_LIMITS.enabled,
    general: {
      ...DEFAULT_RATE_LIMITS.general,
      ...customConfig.general,
    },
    perOperation: {
      ...DEFAULT_RATE_LIMITS.perOperation,
      ...customConfig.perOperation,
    },
    concurrentRequests: customConfig.concurrentRequests ?? DEFAULT_RATE_LIMITS.concurrentRequests,
  };
}

// Custom handler for rate limit exceeded
const rateLimitHandler = (req: Request, res: Response) => {
  const logger = getLogger();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const toolName = req.body?.params?.name || "unknown";

  logger.warn(
    {
      ip,
      toolName,
      path: req.path,
      event: "rate_limit_exceeded",
    },
    "Rate limit exceeded"
  );

  res.status(429).json({
    jsonrpc: "2.0",
    id: req.body?.id || null,
    error: {
      code: -32000, // Server error in JSON-RPC
      message: "Rate limit exceeded. Please try again later.",
      data: {
        retryAfter: res.getHeader("Retry-After"),
      },
    },
  });
};

// Create rate limiter with custom options
function createRateLimiter(
  windowMs: number,
  max: number,
  _operationName?: string
): RateLimitRequestHandler {
  const options: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: rateLimitHandler,
    skip: (req: Request) => {
      // Skip rate limiting for health check endpoint
      return req.path === "/health";
    },
    keyGenerator: (req: Request) => {
      // Use IP address as the key
      return req.ip || req.socket.remoteAddress || "unknown";
    },
    // Add custom store options if needed
  };

  return rateLimit(options);
}

// Store for tracking concurrent requests per IP
const concurrentRequestsMap = new Map<string, number>();

// Middleware to limit concurrent requests per IP
export function createConcurrentRequestLimiter(maxConcurrent: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip for health check
    if (req.path === "/health") {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const current = concurrentRequestsMap.get(ip) || 0;

    if (current >= maxConcurrent) {
      const logger = getLogger();
      logger.warn(
        {
          ip,
          concurrent: current,
          max: maxConcurrent,
          event: "concurrent_limit_exceeded",
        },
        "Concurrent request limit exceeded"
      );

      return res.status(429).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32000,
          message: "Too many concurrent requests. Please wait for previous requests to complete.",
        },
      });
    }

    // Increment counter
    concurrentRequestsMap.set(ip, current + 1);

    // Decrement counter when request completes
    const cleanup = () => {
      const current = concurrentRequestsMap.get(ip) || 0;
      if (current > 0) {
        concurrentRequestsMap.set(ip, current - 1);
      }
    };

    res.on("finish", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);

    next();
  };
}

// Create operation-specific rate limiter middleware
export function createOperationRateLimiter(config: RateLimitConfig) {
  // Create general rate limiter
  const generalLimiter = createRateLimiter(config.general.windowMs, config.general.max, "general");

  // Create operation-specific limiters
  const operationLimiters = new Map<string, RateLimitRequestHandler>();

  for (const [operation, limits] of Object.entries(config.perOperation)) {
    operationLimiters.set(operation, createRateLimiter(limits.windowMs, limits.max, operation));
  }

  // Return middleware that applies the appropriate limiter
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!config.enabled) {
      return next();
    }

    // Skip for health check
    if (req.path === "/health") {
      return next();
    }

    // Extract tool name from request body
    const toolName = req.body?.params?.name;

    // Apply operation-specific limiter if available
    if (toolName && operationLimiters.has(toolName)) {
      const limiter = operationLimiters.get(toolName)!;
      return limiter(req, res, next);
    }

    // Otherwise apply general limiter
    return generalLimiter(req, res, next);
  };
}

// Middleware factory that combines all rate limiting
export function createRateLimitMiddleware(config: RateLimitConfig) {
  const operationLimiter = createOperationRateLimiter(config);
  const concurrentLimiter = createConcurrentRequestLimiter(config.concurrentRequests);

  return {
    operationLimiter,
    concurrentLimiter,
  };
}

// Export statistics about rate limiting
export function getRateLimitStats(): {
  concurrentRequests: Map<string, number>;
} {
  return {
    concurrentRequests: new Map(concurrentRequestsMap),
  };
}
