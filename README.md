# MCP Filesystem Remote Server

A secure, remote-accessible Model Context Protocol (MCP) filesystem server with multiple transport options. This server extends the standard MCP filesystem server with HTTP/SSE transport capabilities and Docker support, enabling remote filesystem access while maintaining strict security controls.

## Features

### Core Filesystem Operations
- **File Reading**: Complete file contents, head/tail operations for large files
- **File Writing**: Create new files or overwrite existing ones
- **File Editing**: Line-based editing with git-style diff preview
- **Directory Operations**: Create, list (with sizes), recursive tree view
- **File Management**: Move/rename files and directories
- **Search**: Recursive file search with pattern matching and exclusion filters
- **Metadata**: Detailed file information (size, timestamps, permissions)

### Security Features
- **Path Validation**: Strict directory restrictions with allowed-directory enforcement
- **Symlink Protection**: Validates symlink targets are within allowed directories
- **Access Control**: Prevents directory traversal attacks
- **Input Validation**: Comprehensive parameter validation using Zod schemas

### Transport Options
- **stdio**: Traditional MCP stdio transport
- **HTTP**: Direct HTTP transport for request/response operations
- **SSE**: Server-Sent Events for persistent connections

### Performance Optimizations
- **Memory Efficient**: Streaming operations for large files
- **Chunk Processing**: Smart file processing for head/tail operations
- **Concurrent Operations**: Parallel file operations where safe

### Docker Support
- **Multi-stage Build**: Optimized Docker image with minimal runtime footprint
- **Container-ready**: Proper argument parsing and port exposure
- **Production Ready**: Health checks and graceful shutdown handling

## Installation

### From Source
```bash
git clone <repository-url>
cd mcp-filesystem-remote
npm install
npm run build
```

### Using Docker
```bash
docker build -t mcp-filesystem-remote .
```

## Usage

### Standalone (stdio transport)
```bash
node dist/index.js /allowed/directory1 /allowed/directory2
```

### HTTP Transport
```bash
node dist/index.js --transport http --port 3000 --host localhost /allowed/directory
```

### SSE Transport
```bash
node dist/index.js --transport sse --port 3000 --host 0.0.0.0 /allowed/directory
```

### Docker Usage
```bash
# HTTP transport
docker run -p 3000:3000 -v /host/path:/container/path mcp-filesystem-remote \
  --transport http --port 3000 --host 0.0.0.0 /container/path

# SSE transport  
docker run -p 3000:3000 -v /host/path:/container/path mcp-filesystem-remote \
  --transport sse --port 3000 --host 0.0.0.0 /container/path
```

## Configuration

### Command Line Options
- `--transport <mode>`: Transport type (`stdio`, `http`, `sse`) - default: `stdio`
- `--port <number>`: Port number for HTTP/SSE transports - default: `3000`
- `--host <address>`: Host address to bind to - default: `localhost`
- `<directories...>`: One or more allowed directory paths (required)

### Environment Variables
- `NODE_ENV`: Set to `production` for production deployment (automatically set in Docker)

### Security Configuration
The server only allows access to explicitly specified directories. All paths are validated against these allowed directories, including symlink targets.

## API Reference

### Available Tools

#### File Operations
- **`read_file`**: Read complete file contents
  - `path`: File path to read
  - `head` (optional): Read only first N lines
  - `tail` (optional): Read only last N lines

- **`read_multiple_files`**: Read multiple files simultaneously
  - `paths`: Array of file paths

- **`write_file`**: Write content to file
  - `path`: File path
  - `content`: File content

- **`edit_file`**: Edit file with line-based operations
  - `path`: File path
  - `edits`: Array of {oldText, newText} operations
  - `dryRun`: Preview changes without applying

#### Directory Operations
- **`create_directory`**: Create directory (recursive)
  - `path`: Directory path

- **`list_directory`**: List directory contents
  - `path`: Directory path

- **`list_directory_with_sizes`**: List with file sizes
  - `path`: Directory path
  - `sortBy`: Sort by 'name' or 'size'

- **`directory_tree`**: Recursive directory tree as JSON
  - `path`: Directory path

#### File Management
- **`move_file`**: Move/rename files or directories
  - `source`: Source path
  - `destination`: Destination path

- **`search_files`**: Search for files recursively
  - `path`: Search root path
  - `pattern`: Search pattern (case-insensitive)
  - `excludePatterns`: Array of exclusion patterns

#### Information
- **`get_file_info`**: Get file metadata
  - `path`: File path

- **`list_allowed_directories`**: List allowed directories

### HTTP Endpoints (HTTP/SSE modes)

- **`GET /health`**: Health check endpoint
- **`POST /`**: MCP protocol endpoint (HTTP mode)
- **`GET /message`**: SSE connection endpoint (SSE mode)
- **`POST /message`**: MCP protocol endpoint (SSE mode)

## Security Considerations

### Directory Restrictions
- Only explicitly allowed directories are accessible
- Symlinks are validated to ensure targets are within allowed directories
- Path traversal attempts are blocked

### Input Validation
- All inputs are validated using Zod schemas
- File paths are normalized and resolved
- Invalid operations return descriptive error messages

### Network Security
- CORS is enabled for web client access
- Health check endpoint provides minimal information
- Graceful shutdown prevents data loss

## Examples

### Basic File Operations
```javascript
// Read a configuration file
{
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": {"path": "/allowed/config/app.json"}
  }
}

// Edit a file with diff preview
{
  "method": "tools/call", 
  "params": {
    "name": "edit_file",
    "arguments": {
      "path": "/allowed/src/main.js",
      "edits": [{"oldText": "const port = 3000", "newText": "const port = 8080"}],
      "dryRun": true
    }
  }
}
```

### Directory Management
```javascript
// Get directory tree structure
{
  "method": "tools/call",
  "params": {
    "name": "directory_tree", 
    "arguments": {"path": "/allowed/project"}
  }
}

// Search for specific files
{
  "method": "tools/call",
  "params": {
    "name": "search_files",
    "arguments": {
      "path": "/allowed/src",
      "pattern": ".js",
      "excludePatterns": ["node_modules/**", "dist/**"]
    }
  }
}
```

## Development

### Building
```bash
npm run build       # Compile TypeScript
npm run watch       # Watch mode for development
```

### Docker Development
```bash
docker build -t mcp-filesystem-remote:dev .
docker run -p 3000:3000 -v $(pwd):/app/src mcp-filesystem-remote:dev
```

### Testing
The server includes comprehensive error handling and logging. Debug output is sent to stderr to avoid interfering with MCP protocol communication.

## License

MIT License - see package.json for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- **Health Check**: Access `/health` endpoint for server status
- **Logging**: Check stderr for detailed debug information
- **Error Handling**: All operations include descriptive error messages

---

This server provides a secure, efficient way to access filesystem operations remotely while maintaining the standard MCP protocol interface. Perfect for containerized environments, web applications, or any scenario requiring remote filesystem access with strict security controls.