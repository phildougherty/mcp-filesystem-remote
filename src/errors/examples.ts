/**
 * Example usage of the error handling system.
 * This file demonstrates how errors work in practice.
 */

import {
  PermissionDeniedError,
  FileNotFoundError,
  InvalidPathError,
  InvalidArgumentError,
  OperationTimeoutError,
  RateLimitExceededError,
  FileAlreadyExistsError,
  OperationFailedError,
  toFileSystemError,
} from "./index.js";

// Example 1: Permission Denied Error
const permissionError = new PermissionDeniedError("config.json", "read", "/etc/app/config.json");

console.log("=== Permission Denied Error ===");
console.log("Client sees:", permissionError.toClientResponse());
console.log("Server logs:", permissionError.toLogDetails());
console.log("MCP error:", permissionError.toMcpError());
console.log("HTTP Status:", permissionError.httpStatus);
console.log("Is user error?", permissionError.isUserError());
console.log("");

// Example 2: File Not Found Error
const notFoundError = new FileNotFoundError("data.txt", "/home/user/data.txt");

console.log("=== File Not Found Error ===");
console.log("Client sees:", notFoundError.toClientResponse());
console.log("Server logs:", notFoundError.toLogDetails());
console.log("");

// Example 3: Invalid Argument Error
const invalidArgError = new InvalidArgumentError("path", "Must be a non-empty string", "");

console.log("=== Invalid Argument Error ===");
console.log("Client sees:", invalidArgError.toClientResponse());
console.log("HTTP Status:", invalidArgError.httpStatus);
console.log("");

// Example 4: Operation Timeout Error
const timeoutError = new OperationTimeoutError(
  "search_files",
  30000,
  "Searched 1M files before timeout"
);

console.log("=== Operation Timeout Error ===");
console.log("Client sees:", timeoutError.toClientResponse());
console.log("Server logs:", timeoutError.toLogDetails());
console.log("");

// Example 5: Rate Limit Error
const rateLimitError = new RateLimitExceededError(100, 60);

console.log("=== Rate Limit Exceeded Error ===");
console.log("Client sees:", rateLimitError.toClientResponse());
console.log("");

// Example 6: Converting Node.js errors
const mockNodeError = Object.assign(new Error("ENOENT: file not found"), {
  code: "ENOENT",
  path: "/tmp/missing.txt",
});

const converted = toFileSystemError(mockNodeError, "read_file", "missing.txt");

console.log("=== Converted Node.js Error (ENOENT) ===");
console.log("Original:", mockNodeError);
console.log("Converted to:", converted.constructor.name);
console.log("Client sees:", converted.toClientResponse());
console.log("");

// Example 7: Error with suggestion
const pathError = new InvalidPathError(
  "Path contains .. traversal",
  "/allowed/dir/../../etc/passwd"
);

console.log("=== Invalid Path Error with Suggestion ===");
console.log("Client sees:", pathError.toClientResponse());
console.log("");

// Example 8: File Already Exists
const existsError = new FileAlreadyExistsError("output.txt", "/home/user/output.txt");

console.log("=== File Already Exists Error ===");
console.log("Client sees:", existsError.toClientResponse());
console.log("HTTP Status:", existsError.httpStatus);
console.log("");

// Example 9: Operation Failed with Cause
const cause = new Error("Disk full");
const opError = new OperationFailedError(
  "write_file",
  "Failed to write file",
  cause,
  "Disk quota exceeded on /dev/sda1"
);

console.log("=== Operation Failed Error with Cause ===");
console.log("Client sees:", opError.toClientResponse());
console.log("Server logs (note stack includes cause):", opError.toLogDetails());
console.log("");

// Example 10: Error Classification
console.log("=== Error Classification ===");
console.log("Permission Denied is user error?", permissionError.isUserError()); // true
console.log("Operation Failed is user error?", opError.isUserError()); // false
console.log("");

// Example 11: MCP Error Response Format
console.log("=== MCP Error Response (what client receives) ===");
const mcpResponse = {
  content: [
    {
      type: "text",
      text: `Error: ${permissionError.message}\n\nSuggestion: ${permissionError.suggestion}\n\nDetails: ${JSON.stringify(permissionError.details, null, 2)}`,
    },
  ],
  isError: true,
};
console.log(JSON.stringify(mcpResponse, null, 2));
console.log("");

// Example 12: JSON-RPC Error Format
console.log("=== JSON-RPC Error Response (for HTTP/SSE) ===");
const jsonRpcError = {
  jsonrpc: "2.0",
  id: "req-123",
  error: permissionError.toMcpError(),
};
console.log(JSON.stringify(jsonRpcError, null, 2));
