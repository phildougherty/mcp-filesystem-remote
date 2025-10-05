import { Request, Response, NextFunction } from "express";
import { httpRequestDuration, httpRequestsTotal } from "./registry.js";

/**
 * Express middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Capture response finish event
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = getRoute(req.path);
    const method = req.method;
    const statusCode = res.statusCode.toString();

    // Record duration
    httpRequestDuration.labels(method, route, statusCode).observe(duration);

    // Increment request counter
    httpRequestsTotal.labels(method, route, statusCode).inc();
  });

  next();
}

/**
 * Normalize route paths for metrics
 */
function getRoute(path: string): string {
  if (path === "/") {
    return "root";
  }
  if (path === "/health") {
    return "health";
  }
  if (path === "/metrics") {
    return "metrics";
  }
  if (path === "/message") {
    return "message";
  }
  if (path.startsWith("/message")) {
    return "message";
  }
  return "unknown";
}

/**
 * Track connection lifecycle for SSE connections
 */
export class ConnectionTracker {
  private connectionStartTimes: Map<string, number> = new Map();

  constructor(
    private transportType: string,
    private activeConnectionsGauge: any,
    private connectionDurationHistogram: any,
    private connectionsTotalCounter: any
  ) {}

  /**
   * Record a new connection
   */
  start(connectionId: string): void {
    this.connectionStartTimes.set(connectionId, Date.now());
    this.activeConnectionsGauge.labels(this.transportType).inc();
    this.connectionsTotalCounter.labels(this.transportType).inc();
  }

  /**
   * Record connection end
   */
  end(connectionId: string): void {
    const startTime = this.connectionStartTimes.get(connectionId);
    if (startTime) {
      const duration = (Date.now() - startTime) / 1000; // Convert to seconds
      this.connectionDurationHistogram.labels(this.transportType).observe(duration);
      this.connectionStartTimes.delete(connectionId);
    }
    this.activeConnectionsGauge.labels(this.transportType).dec();
  }

  /**
   * Get active connection count
   */
  getActiveCount(): number {
    return this.connectionStartTimes.size;
  }
}
