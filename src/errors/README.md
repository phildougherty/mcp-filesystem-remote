# Error Handling System

Comprehensive error handling implementation for MCP Filesystem Server.

## Overview

This error handling system provides:
- **Hierarchical error classes** with specific error types for different failure scenarios
- **MCP error code mapping** for JSON-RPC 2.0 compliance
- **Client-safe error messages** that hide sensitive internal paths
- **Server-side detailed logging** with full stack traces and internal details
- **Error recovery suggestions** in user-facing messages
- **HTTP status code mapping** for REST API compatibility

## Architecture

### Error Class Hierarchy

```
Error (built-in)
  └── FileSystemError (base class)
      ├── PermissionDeniedError
      ├── FileNotFoundError
      ├── InvalidPathError
      ├── OperationTimeoutError
      ├── RateLimitExceededError
      ├── InvalidArgumentError
      ├── FileAlreadyExistsError
      ├── OperationFailedError
      └── InvalidParamsError
```

### Error Codes

The system uses MCP-compliant error codes:

| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| -32700 | Parse Error | 400 |
| -32600 | Invalid Request | 400 |
| -32601 | Method Not Found | 404 |
| -32602 | Invalid Params | 400 |
| -32603 | Internal Error | 500 |
| -32001 | Permission Denied | 403 |
| -32002 | File Not Found | 404 |
| -32003 | Invalid Path | 400 |
| -32004 | Operation Timeout | 408 |
| -32005 | Rate Limit Exceeded | 429 |
| -32006 | Invalid Argument | 400 |
| -32007 | File Already Exists | 409 |
| -32008 | Operation Failed | 500 |

## Usage Examples

### Basic Error Throwing

```typescript
import { PermissionDeniedError, FileNotFoundError } from './errors';

// Throw specific errors
throw new PermissionDeniedError('/etc/passwd', 'read', '/etc/passwd');
throw new FileNotFoundError('config.json', '/home/user/config.json');
```

### Error Handling in Tool Execution

```typescript
import { handleToolError } from './errors';

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;
    // ... tool execution logic
  } catch (error) {
    // Automatically converts, logs, and formats errors
    return handleToolError(error, request.params.name, request.params.arguments);
  }
});
```

### Converting Node.js Errors

```typescript
import { toFileSystemError } from './errors';

try {
  await fs.readFile('/path/to/file');
} catch (error) {
  // Converts ENOENT to FileNotFoundError, EACCES to PermissionDeniedError, etc.
  const fsError = toFileSystemError(error, 'read_file', '/path/to/file');
  throw fsError;
}
```

### Logging Errors

```typescript
import { logError } from './errors';

try {
  await someOperation();
} catch (error) {
  const fsError = toFileSystemError(error, 'operation');

  // Logs with full details server-side
  logError(fsError, {
    userId: 'user-123',
    tool: 'read_file',
    path: '/some/path'
  });

  throw fsError;
}
```

### Creating JSON-RPC Error Responses

```typescript
import { toJsonRpcError } from './errors';

try {
  // ... operation
} catch (error) {
  const fsError = toFileSystemError(error, 'operation');
  const jsonRpcError = toJsonRpcError(fsError, requestId);

  res.status(fsError.httpStatus).json(jsonRpcError);
}
```

## Error Response Formats

### Client-Safe MCP Response

What the client receives (sensitive paths removed):

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Permission denied: Cannot access the specified path\n\nSuggestion: Ensure the path is within allowed directories and you have the necessary permissions.\n\nDetails: {\n  \"operation\": \"read\"\n}"
    }
  ],
  "isError": true
}
```

### Server-Side Log Entry

What gets logged internally (full details):

```json
{
  "level": "warn",
  "time": "2025-10-04T12:34:56.789Z",
  "correlationId": "abc-123",
  "errorCode": -32001,
  "errorName": "PermissionDeniedError",
  "isUserError": true,
  "httpStatus": 403,
  "code": -32001,
  "message": "Permission denied: Cannot access the specified path",
  "details": {
    "operation": "read"
  },
  "suggestion": "Ensure the path is within allowed directories and you have the necessary permissions.",
  "internalMessage": "Access denied for: /etc/passwd",
  "stack": "PermissionDeniedError: Permission denied...\n    at validatePath (/app/index.js:244:11)\n    ..."
}
```

### JSON-RPC Error Response

For HTTP/SSE transport:

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "error": {
    "code": -32001,
    "message": "Permission denied: Cannot access the specified path",
    "data": {
      "operation": "read"
    }
  }
}
```

## Error Properties

Each `FileSystemError` has:

- **code**: MCP error code (number)
- **message**: User-friendly error message (string)
- **details**: Additional context for the error (object, optional)
- **suggestion**: Recovery suggestion for the user (string, optional)
- **internalMessage**: Internal details for logging (string, optional)
- **httpStatus**: HTTP status code (number)
- **stack**: Stack trace (string)

## Integration with Logger

Errors are automatically integrated with the logging framework:

```typescript
// User errors (client mistakes) logged at WARN level
logger.warn({
  errorCode: -32001,
  errorName: 'PermissionDeniedError',
  isUserError: true,
  // ... full error details
}, 'User error: Permission denied');

// System errors (server issues) logged at ERROR level
logger.error({
  errorCode: -32603,
  errorName: 'OperationFailedError',
  isUserError: false,
  // ... full error details
}, 'System error: Operation failed');
```

## Path Sanitization

All error messages use path sanitization from the logger to prevent leaking sensitive information:

```typescript
// Internal path: /home/user/.ssh/id_rsa
// Client sees: "requested path" or relative path within allowed directory
// Server logs: Full internal path for debugging
```

## Error Classification

Errors are classified as either **user errors** or **system errors**:

### User Errors (Client Fault)
- PermissionDeniedError
- FileNotFoundError
- InvalidPathError
- InvalidArgumentError
- InvalidParamsError
- FileAlreadyExistsError
- Method Not Found

These are logged at **WARN** level.

### System Errors (Server Fault)
- OperationFailedError
- Internal Error
- Operation Timeout (system-level)

These are logged at **ERROR** level.

## Utility Functions

### `toFileSystemError(error, operation, path?)`
Converts any error to a FileSystemError. Handles Node.js errors automatically.

### `handleToolError(error, toolName, params)`
Complete error handling for tool execution: converts, logs, and formats response.

### `logError(error, context?)`
Logs error with full details, using appropriate log level.

### `toMcpErrorResponse(error)`
Converts to client-safe MCP response format.

### `toJsonRpcError(error, requestId?)`
Converts to JSON-RPC 2.0 error format.

### `withErrorHandling(operation, operationName, context?)`
Wraps async operations with automatic error conversion and logging.

### `isRetryableError(error)`
Checks if an error might succeed on retry (timeouts, rate limits).

### `validatePathArgument(path, argumentName?)`
Type guard that throws InvalidArgumentError if path is invalid.

## Best Practices

1. **Always use specific error types** when you know the failure reason
2. **Use handleToolError** for all tool execution error handling
3. **Provide helpful suggestions** in error messages
4. **Log errors with context** (user, tool, parameters)
5. **Never expose internal paths** to clients
6. **Use InvalidArgumentError** for validation failures
7. **Convert Node.js errors** using toFileSystemError
8. **Check isRetryableError** before implementing retry logic

## Example: Complete Tool Implementation

```typescript
import {
  InvalidArgumentError,
  handleToolError,
  validatePathArgument,
} from './errors';

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new InvalidArgumentError(
            'arguments',
            'Invalid schema for read_file',
            args
          );
        }

        // validatePath will throw PermissionDeniedError or FileNotFoundError
        const validPath = await validatePath(parsed.data.path);

        // fs.readFile might throw, which gets caught and converted
        const content = await fs.readFile(validPath, "utf-8");

        return {
          content: [{ type: "text", text: content }],
        };
      }

      default:
        throw new InvalidArgumentError('name', `Unknown tool: ${name}`, name);
    }
  } catch (error) {
    // Converts any error, logs with full context, returns client-safe response
    return handleToolError(error, request.params.name, request.params.arguments);
  }
});
```

## Testing Error Handling

```typescript
import { PermissionDeniedError, FileNotFoundError } from './errors';

// Test error throwing
expect(() => {
  throw new PermissionDeniedError('/etc/passwd', 'read');
}).toThrow(PermissionDeniedError);

// Test error properties
const error = new FileNotFoundError('missing.txt', '/full/path/missing.txt');
expect(error.code).toBe(-32002);
expect(error.httpStatus).toBe(404);
expect(error.isUserError()).toBe(true);

// Test client response doesn't leak internal paths
const clientResponse = error.toClientResponse();
expect(clientResponse.internalMessage).toBeUndefined();
expect(clientResponse.stack).toBeUndefined();

// Test server logging includes all details
const logDetails = error.toLogDetails();
expect(logDetails.internalMessage).toContain('/full/path/missing.txt');
expect(logDetails.stack).toBeDefined();
```
