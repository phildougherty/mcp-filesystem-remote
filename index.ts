#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { diffLines, createTwoFilesPatch } from 'diff';
import { minimatch } from 'minimatch';
import express from 'express';
import cors from 'cors';

// Debug: Log all arguments
console.error("DEBUG: process.argv:", process.argv);

// Command line argument parsing with Docker fix
let allArgs = process.argv.slice(2);
console.error("DEBUG: Raw allArgs:", allArgs);

// Docker sometimes passes unexpected arguments, filter them out
allArgs = allArgs.filter(arg => 
  arg !== 'node' && 
  !arg.includes('/app/dist/index.js') &&
  !arg.endsWith('index.js') &&
  arg !== undefined &&
  arg !== null &&
  arg !== ''
);

console.error("DEBUG: Filtered allArgs:", allArgs);

let transportMode = 'stdio';
let port = 3000;
let host = 'localhost';
const allowedDirectoryArgs: string[] = [];

// Parse arguments more carefully
let i = 0;
while (i < allArgs.length) {
  const arg = allArgs[i];
  console.error(`DEBUG: Processing arg[${i}]: ${arg}`);
  
  if (arg === '--transport') {
    if (i + 1 < allArgs.length) {
      transportMode = allArgs[i + 1];
      console.error(`DEBUG: Set transport to: ${transportMode}`);
      i += 2; // Skip both --transport and its value
    } else {
      console.error("Error: --transport requires a value");
      process.exit(1);
    }
  } else if (arg === '--port') {
    if (i + 1 < allArgs.length) {
      port = parseInt(allArgs[i + 1], 10);
      if (isNaN(port)) {
        console.error("Invalid port number");
        process.exit(1);
      }
      console.error(`DEBUG: Set port to: ${port}`);
      i += 2; // Skip both --port and its value
    } else {
      console.error("Error: --port requires a value");
      process.exit(1);
    }
  } else if (arg === '--host') {
    if (i + 1 < allArgs.length) {
      host = allArgs[i + 1];
      console.error(`DEBUG: Set host to: ${host}`);
      i += 2; // Skip both --host and its value
    } else {
      console.error("Error: --host requires a value");
      process.exit(1);
    }
  } else if (arg.startsWith('--')) {
    console.error(`Error: Unknown flag: ${arg}`);
    process.exit(1);
  } else {
    // This is a directory path
    console.error(`DEBUG: Adding directory: ${arg}`);
    allowedDirectoryArgs.push(arg);
    i += 1;
  }
}

console.error("DEBUG: Final allowedDirectoryArgs:", allowedDirectoryArgs);
console.error("DEBUG: Transport mode:", transportMode);
console.error("DEBUG: Port:", port);
console.error("DEBUG: Host:", host);

if (allowedDirectoryArgs.length === 0) {
  console.error("Usage: mcp-server-filesystem [--transport stdio|sse] [--port PORT] [--host HOST] <allowed-directory> [additional-directories...]");
  console.error("Examples:");
  console.error("  mcp-server-filesystem /path/to/allowed/dir");
  console.error("  mcp-server-filesystem --transport sse --port 3001 /path/to/allowed/dir");
  console.error("  mcp-server-filesystem --transport sse --host 0.0.0.0 --port 3001 /path/to/allowed/dir");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p);
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = allowedDirectoryArgs.map(dir =>
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(allowedDirectoryArgs.map(async (dir) => {
  try {
    const stats = await fs.stat(expandHome(dir));
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
  tail: z.number().optional().describe('If provided, returns only the last N lines of the file'),
  head: z.number().optional().describe('If provided, returns only the first N lines of the file')
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const EditOperation = z.object({
  oldText: z.string().describe('Text to search for - must match exactly'),
  newText: z.string().describe('Text to replace with')
});

const EditFileArgsSchema = z.object({
  path: z.string(),
  edits: z.array(EditOperation),
  dryRun: z.boolean().default(false).describe('Preview changes using git-style diff format')
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryWithSizesArgsSchema = z.object({
  path: z.string(),
  sortBy: z.enum(['name', 'size']).optional().default('name').describe('Sort entries by name or size'),
});

const DirectoryTreeArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
  excludePatterns: z.array(z.string()).optional().default([])
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool implementations
async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(
  rootPath: string,
  pattern: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      try {
        // Validate each path before processing
        await validatePath(fullPath);
        
        // Check if path matches any exclude pattern
        const relativePath = path.relative(rootPath, fullPath);
        const shouldExclude = excludePatterns.some(pattern => {
          const globPattern = pattern.includes('*') ? pattern : `**/${pattern}/**`;
          return minimatch(relativePath, globPattern, { dot: true });
        });
        
        if (shouldExclude) {
          continue;
        }
        
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }
        
        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        // Skip invalid paths during search
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// file editing and diffing utilities
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function createUnifiedDiff(originalContent: string, newContent: string, filepath: string = 'file'): string {
  // Ensure consistent line endings for diff
  const normalizedOriginal = normalizeLineEndings(originalContent);
  const normalizedNew = normalizeLineEndings(newContent);
  
  return createTwoFilesPatch(
    filepath,
    filepath,
    normalizedOriginal,
    normalizedNew,
    'original',
    'modified'
  );
}

async function applyFileEdits(
  filePath: string,
  edits: Array<{oldText: string, newText: string}>,
  dryRun = false
): Promise<string> {
  // Read file content and normalize line endings
  const content = normalizeLineEndings(await fs.readFile(filePath, 'utf-8'));
  
  // Apply edits sequentially
  let modifiedContent = content;
  for (const edit of edits) {
    const normalizedOld = normalizeLineEndings(edit.oldText);
    const normalizedNew = normalizeLineEndings(edit.newText);
    
    // If exact match exists, use it
    if (modifiedContent.includes(normalizedOld)) {
      modifiedContent = modifiedContent.replace(normalizedOld, normalizedNew);
      continue;
    }
    
    // Otherwise, try line-by-line matching with flexibility for whitespace
    const oldLines = normalizedOld.split('\n');
    const contentLines = modifiedContent.split('\n');
    let matchFound = false;
    
    for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
      const potentialMatch = contentLines.slice(i, i + oldLines.length);
      
      // Compare lines with normalized whitespace
      const isMatch = oldLines.every((oldLine, j) => {
        const contentLine = potentialMatch[j];
        return oldLine.trim() === contentLine.trim();
      });
      
      if (isMatch) {
        // Preserve original indentation of first line
        const originalIndent = contentLines[i].match(/^\s*/)?.[0] || '';
        const newLines = normalizedNew.split('\n').map((line, j) => {
          if (j === 0) return originalIndent + line.trimStart();
          // For subsequent lines, try to preserve relative indentation
          const oldIndent = oldLines[j]?.match(/^\s*/)?.[0] || '';
          const newIndent = line.match(/^\s*/)?.[0] || '';
          if (oldIndent && newIndent) {
            const relativeIndent = newIndent.length - oldIndent.length;
            return originalIndent + ' '.repeat(Math.max(0, relativeIndent)) + line.trimStart();
          }
          return line;
        });
        
        contentLines.splice(i, oldLines.length, ...newLines);
        modifiedContent = contentLines.join('\n');
        matchFound = true;
        break;
      }
    }
    
    if (!matchFound) {
      throw new Error(`Could not find exact match for edit:\n${edit.oldText}`);
    }
  }
  
  // Create unified diff
  const diff = createUnifiedDiff(content, modifiedContent, filePath);
  
  // Format diff with appropriate number of backticks
  let numBackticks = 3;
  while (diff.includes('`'.repeat(numBackticks))) {
    numBackticks++;
  }
  const formattedDiff = `${'`'.repeat(numBackticks)}diff\n${diff}${'`'.repeat(numBackticks)}\n\n`;
  
  if (!dryRun) {
    await fs.writeFile(filePath, modifiedContent, 'utf-8');
  }
  
  return formattedDiff;
}

// Helper functions
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} ${units[i]}`;
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// Memory-efficient implementation to get the last N lines of a file
async function tailFile(filePath: string, numLines: number): Promise<string> {
  const CHUNK_SIZE = 1024; // Read 1KB at a time
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  
  if (fileSize === 0) return '';
  
  // Open file for reading
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const lines: string[] = [];
    let position = fileSize;
    let chunk = Buffer.alloc(CHUNK_SIZE);
    let linesFound = 0;
    let remainingText = '';
    
    // Read chunks from the end of the file until we have enough lines
    while (position > 0 && linesFound < numLines) {
      const size = Math.min(CHUNK_SIZE, position);
      position -= size;
      
      const { bytesRead } = await fileHandle.read(chunk, 0, size, position);
      if (!bytesRead) break;
      
      // Get the chunk as a string and prepend any remaining text from previous iteration
      const readData = chunk.slice(0, bytesRead).toString('utf-8');
      const chunkText = readData + remainingText;
      
      // Split by newlines and count
      const chunkLines = normalizeLineEndings(chunkText).split('\n');
      
      // If this isn't the end of the file, the first line is likely incomplete
      // Save it to prepend to the next chunk
      if (position > 0) {
        remainingText = chunkLines[0];
        chunkLines.shift(); // Remove the first (incomplete) line
      }
      
      // Add lines to our result (up to the number we need)
      for (let i = chunkLines.length - 1; i >= 0 && linesFound < numLines; i--) {
        lines.unshift(chunkLines[i]);
        linesFound++;
      }
    }
    
    return lines.join('\n');
  } finally {
    await fileHandle.close();
  }
}

// New function to get the first N lines of a file
async function headFile(filePath: string, numLines: number): Promise<string> {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const lines: string[] = [];
    let buffer = '';
    let bytesRead = 0;
    const chunk = Buffer.alloc(1024); // 1KB buffer
    
    // Read chunks and count lines until we have enough or reach EOF
    while (lines.length < numLines) {
      const result = await fileHandle.read(chunk, 0, chunk.length, bytesRead);
      if (result.bytesRead === 0) break; // End of file
      
      bytesRead += result.bytesRead;
      buffer += chunk.slice(0, result.bytesRead).toString('utf-8');
      
      const newLineIndex = buffer.lastIndexOf('\n');
      if (newLineIndex !== -1) {
        const completeLines = buffer.slice(0, newLineIndex).split('\n');
        buffer = buffer.slice(newLineIndex + 1);
        
        for (const line of completeLines) {
          lines.push(line);
          if (lines.length >= numLines) break;
        }
      }
    }
    
    // If there is leftover content and we still need lines, add it
    if (buffer.length > 0 && lines.length < numLines) {
      lines.push(buffer);
    }
    
    return lines.join('\n');
  } finally {
    await fileHandle.close();
  }
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description:
          "Read the complete contents of a file from the file system. " +
          "Handles various text encodings and provides detailed error messages " +
          "if the file cannot be read. Use this tool when you need to examine " +
          "the contents of a single file. Use the 'head' parameter to read only " +
          "the first N lines of a file, or the 'tail' parameter to read only " +
          "the last N lines of a file. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
      },
      {
        name: "read_multiple_files",
        description:
          "Read the contents of multiple files simultaneously. This is more " +
          "efficient than reading files one by one when you need to analyze " +
          "or compare multiple files. Each file's content is returned with its " +
          "path as a reference. Failed reads for individual files won't stop " +
          "the entire operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
      },
      {
        name: "write_file",
        description:
          "Create a new file or completely overwrite an existing file with new content. " +
          "Use with caution as it will overwrite existing files without warning. " +
          "Handles text content with proper encoding. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
      },
      {
        name: "edit_file",
        description:
          "Make line-based edits to a text file. Each edit replaces exact line sequences " +
          "with new content. Returns a git-style diff showing the changes made. " +
          "Only works within allowed directories.",
        inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
      },
      {
        name: "create_directory",
        description:
          "Create a new directory or ensure a directory exists. Can create multiple " +
          "nested directories in one operation. If the directory already exists, " +
          "this operation will succeed silently. Perfect for setting up directory " +
          "structures for projects or ensuring required paths exist. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory",
        description:
          "Get a detailed listing of all files and directories in a specified path. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is essential for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
      },
      {
        name: "list_directory_with_sizes",
        description:
          "Get a detailed listing of all files and directories in a specified path, including sizes. " +
          "Results clearly distinguish between files and directories with [FILE] and [DIR] " +
          "prefixes. This tool is useful for understanding directory structure and " +
          "finding specific files within a directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryWithSizesArgsSchema) as ToolInput,
      },
      {
        name: "directory_tree",
        description:
            "Get a recursive tree view of files and directories as a JSON structure. " +
            "Each entry includes 'name', 'type' (file/directory), and 'children' for directories. " +
            "Files have no children array, while directories always have a children array (which may be empty). " +
            "The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
      },
      {
        name: "move_file",
        description:
          "Move or rename files and directories. Can move files between directories " +
          "and rename them in a single operation. If the destination exists, the " +
          "operation will fail. Works across different directories and can be used " +
          "for simple renaming within the same directory. Both source and destination must be within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
      },
      {
        name: "search_files",
        description:
          "Recursively search for files and directories matching a pattern. " +
          "Searches through all subdirectories from the starting path. The search " +
          "is case-insensitive and matches partial names. Returns full paths to all " +
          "matching items. Great for finding files when you don't know their exact location. " +
          "Only searches within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
      },
      {
        name: "get_file_info",
        description:
          "Retrieve detailed metadata about a file or directory. Returns comprehensive " +
          "information including size, creation time, last modified time, permissions, " +
          "and type. This tool is perfect for understanding file characteristics " +
          "without reading the actual content. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
      },
      {
        name: "list_allowed_directories",
        description:
          "Returns the list of directories that this server is allowed to access. " +
          "Use this to understand which directories are available before trying to access files.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        
        if (parsed.data.head && parsed.data.tail) {
          throw new Error("Cannot specify both head and tail parameters simultaneously");
        }

        if (parsed.data.tail) {
          // Use memory-efficient tail implementation for large files
          const tailContent = await tailFile(validPath, parsed.data.tail);
          return {
            content: [{ type: "text", text: tailContent }],
          };
        }

        if (parsed.data.head) {
          // Use memory-efficient head implementation for large files
          const headContent = await headFile(validPath, parsed.data.head);
          return {
            content: [{ type: "text", text: headContent }],
          };
        }

        const content = await fs.readFile(validPath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }

        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );

        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }

      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");

        return {
          content: [{ type: "text", text: formatted }],
        };
      }

      case "list_directory_with_sizes": {
        const parsed = ListDirectoryWithSizesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory_with_sizes: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        
        // Get detailed information for each entry
        const detailedEntries = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(validPath, entry.name);
            try {
              const stats = await fs.stat(entryPath);
              return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                mtime: stats.mtime
              };
            } catch (error) {
              return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: 0,
                mtime: new Date(0)
              };
            }
          })
        );

        // Sort entries based on sortBy parameter
        const sortedEntries = [...detailedEntries].sort((a, b) => {
          if (parsed.data.sortBy === 'size') {
            return b.size - a.size; // Descending by size
          }
          // Default sort by name
          return a.name.localeCompare(b.name);
        });

        // Format the output
        const formattedEntries = sortedEntries.map(entry =>
          `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${
            entry.isDirectory ? "" : formatSize(entry.size).padStart(10)
          }`
        );

        // Add summary
        const totalFiles = detailedEntries.filter(e => !e.isDirectory).length;
        const totalDirs = detailedEntries.filter(e => e.isDirectory).length;
        const totalSize = detailedEntries.reduce((sum, entry) => sum + (entry.isDirectory ? 0 : entry.size), 0);
        
        const summary = [
          "",
          `Total: ${totalFiles} files, ${totalDirs} directories`,
          `Combined size: ${formatSize(totalSize)}`
        ];

        return {
          content: [{
            type: "text",
            text: [...formattedEntries, ...summary].join("\n")
          }],
        };
      }

      case "directory_tree": {
        const parsed = DirectoryTreeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
        }

        interface TreeEntry {
            name: string;
            type: 'file' | 'directory';
            children?: TreeEntry[];
        }

        async function buildTree(currentPath: string): Promise<TreeEntry[]> {
            const validPath = await validatePath(currentPath);
            const entries = await fs.readdir(validPath, {withFileTypes: true});
            const result: TreeEntry[] = [];

            for (const entry of entries) {
                const entryData: TreeEntry = {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file'
                };

                if (entry.isDirectory()) {
                    const subPath = path.join(currentPath, entry.name);
                    entryData.children = await buildTree(subPath);
                }

                result.push(entryData);
            }

            return result;
        }

        const treeData = await buildTree(parsed.data.path);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(treeData, null, 2)
            }],
        };
      }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }

        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }

        const validPath = await validatePath(parsed.data.path);
        const info = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
      }

      case "list_allowed_directories": {
        return {
          content: [{
            type: "text",
            text: `Allowed directories:\n${allowedDirectories.join('\n')}`
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  if (transportMode === 'sse' || transportMode === 'http') {
    // Setup HTTP server with SSE and HTTP transport support
    const app = express();
    
    // Enable CORS for all routes
    app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS']
    }));
    
    app.use(express.json());
    
    // Store active SSE connections
    const connections = new Map<string, any>();
    
    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        server: 'secure-filesystem-server',
        version: '0.2.0',
        allowedDirectories: allowedDirectories,
        transport: transportMode
      });
    });
    
    // Root endpoint for HTTP MCP protocol
    app.post('/', async (req, res) => {
      try {
        const request = req.body;
        console.error('=== MCP Request received at / ===');
        console.error('Method:', request.method);
        console.error('ID:', request.id);
        console.error('Full request:', JSON.stringify(request, null, 2));
        console.error('============================');
        
        let response;
        
        // Handle MCP initialize request
        if (request.method === 'initialize') {
          console.error('Handling initialize request...');
          response = {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "secure-filesystem-server",
              version: "0.2.0"
            }
          };
        }
        // Handle tools/list request  
        else if (request.method === 'tools/list') {
          console.error('Handling tools/list request...');
          response = {
            tools: [
              {
                name: "read_file",
                description: "Read the complete contents of a file from the file system. Handles various text encodings and provides detailed error messages if the file cannot be read. Use this tool when you need to examine the contents of a single file. Use the 'head' parameter to read only the first N lines of a file, or the 'tail' parameter to read only the last N lines of a file. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(ReadFileArgsSchema) as ToolInput,
              },
              {
                name: "read_multiple_files",
                description: "Read the contents of multiple files simultaneously. This is more efficient than reading files one by one when you need to analyze or compare multiple files. Each file's content is returned with its path as a reference. Failed reads for individual files won't stop the entire operation. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema) as ToolInput,
              },
              {
                name: "write_file",
                description: "Create a new file or completely overwrite an existing file with new content. Use with caution as it will overwrite existing files without warning. Handles text content with proper encoding. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(WriteFileArgsSchema) as ToolInput,
              },
              {
                name: "edit_file",
                description: "Make line-based edits to a text file. Each edit replaces exact line sequences with new content. Returns a git-style diff showing the changes made. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(EditFileArgsSchema) as ToolInput,
              },
              {
                name: "create_directory",
                description: "Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. If the directory already exists, this operation will succeed silently. Perfect for setting up directory structures for projects or ensuring required paths exist. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema) as ToolInput,
              },
              {
                name: "list_directory",
                description: "Get a detailed listing of all files and directories in a specified path. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is essential for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(ListDirectoryArgsSchema) as ToolInput,
              },
              {
                name: "list_directory_with_sizes",
                description: "Get a detailed listing of all files and directories in a specified path, including sizes. Results clearly distinguish between files and directories with [FILE] and [DIR] prefixes. This tool is useful for understanding directory structure and finding specific files within a directory. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(ListDirectoryWithSizesArgsSchema) as ToolInput,
              },
              {
                name: "directory_tree",
                description: "Get a recursive tree view of files and directories as a JSON structure. Each entry includes 'name', 'type' (file/directory), and 'children' for directories. Files have no children array, while directories always have a children array (which may be empty). The output is formatted with 2-space indentation for readability. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(DirectoryTreeArgsSchema) as ToolInput,
              },
              {
                name: "move_file",
                description: "Move or rename files and directories. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail. Works across different directories and can be used for simple renaming within the same directory. Both source and destination must be within allowed directories.",
                inputSchema: zodToJsonSchema(MoveFileArgsSchema) as ToolInput,
              },
              {
                name: "search_files",
                description: "Recursively search for files and directories matching a pattern. Searches through all subdirectories from the starting path. The search is case-insensitive and matches partial names. Returns full paths to all matching items. Great for finding files when you don't know their exact location. Only searches within allowed directories.",
                inputSchema: zodToJsonSchema(SearchFilesArgsSchema) as ToolInput,
              },
              {
                name: "get_file_info",
                description: "Retrieve detailed metadata about a file or directory. Returns comprehensive information including size, creation time, last modified time, permissions, and type. This tool is perfect for understanding file characteristics without reading the actual content. Only works within allowed directories.",
                inputSchema: zodToJsonSchema(GetFileInfoArgsSchema) as ToolInput,
              },
              {
                name: "list_allowed_directories",
                description: "Returns the list of directories that this server is allowed to access. Use this to understand which directories are available before trying to access files.",
                inputSchema: {
                  type: "object",
                  properties: {},
                  required: [],
                },
              },
            ]
          };
        }
        // Handle tools/call request
        else if (request.method === 'tools/call') {
          console.error('Handling tools/call request...');
          response = await handleToolCall(request.params);
        }
        else {
          console.error('Unknown method:', request.method);
          response = {
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            }
          };
        }
        
        // Build response based on method and response type
        let fullResponse: any = {
          jsonrpc: "2.0",
          id: request.id
        };
        
        if (request.method === 'initialize' || request.method === 'tools/list') {
          fullResponse.result = response;
        } else if (request.method === 'tools/call') {
          const toolResponse = response as any;
          if (toolResponse && toolResponse.isError) {
            fullResponse.error = {
              code: -32603,
              message: toolResponse.content?.[0]?.text || "Tool execution failed"
            };
          } else {
            fullResponse.result = response;
          }
        } else {
          // For error responses
          const errorResponse = response as any;
          if (errorResponse && errorResponse.error) {
            fullResponse.error = errorResponse.error;
          } else {
            fullResponse.error = response;
          }
        }
        
        console.error('=== MCP Response ===');
        console.error('Sending response:', JSON.stringify(fullResponse, null, 2));
        console.error('====================');
        
        res.json(fullResponse);
      } catch (error) {
        console.error('=== MCP Request Error at / ===');
        console.error('Error processing request:', error);
        console.error('Request body:', req.body);
        console.error('===============================');
        
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          }
        });
      }
    });
    
    // SSE endpoint for establishing connection (only for SSE mode)
    if (transportMode === 'sse') {
      app.get('/message', (req, res) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Cache-Control'
        });
        
        const connectionId = Date.now().toString();
        connections.set(connectionId, res);
        
        console.error('New SSE connection established:', connectionId);
        
        // Send initial ready message in proper SSE format
        res.write('event: message\n');
        res.write('data: {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n\n');
        
        // Keep connection alive with heartbeat every 30 seconds
        const heartbeat = setInterval(() => {
          if (connections.has(connectionId)) {
            try {
              res.write(': heartbeat\n\n');
            } catch (error) {
              console.error('Error sending heartbeat:', error);
              clearInterval(heartbeat);
              connections.delete(connectionId);
            }
          } else {
            clearInterval(heartbeat);
          }
        }, 30000);
        
        req.on('close', () => {
          console.error('SSE connection closed:', connectionId);
          clearInterval(heartbeat);
          connections.delete(connectionId);
        });
        
        req.on('error', (error) => {
          console.error('SSE connection error:', connectionId, error);
          clearInterval(heartbeat);
          connections.delete(connectionId);
        });
      });
      
      // Handle MCP requests via POST for SSE mode (duplicate of root handler)
      app.post('/message', async (req, res) => {
        // Same logic as the root POST handler
        try {
          const request = req.body;
          console.error('=== MCP Request received at /message ===');
          console.error('Method:', request.method);
          console.error('ID:', request.id);
          
          let response;
          
          if (request.method === 'initialize') {
            response = {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "secure-filesystem-server", version: "0.2.0" }
            };
          } else if (request.method === 'tools/list') {
            response = { tools: [] }; // Simplified for /message endpoint
          } else if (request.method === 'tools/call') {
            response = await handleToolCall(request.params);
          } else {
            response = { error: { code: -32601, message: `Method not found: ${request.method}` } };
          }
          
          let fullResponse: any = {
            jsonrpc: "2.0",
            id: request.id
          };
          
          if (request.method === 'initialize' || request.method === 'tools/list') {
            fullResponse.result = response;
          } else {
            fullResponse.result = response;
          }
          
          res.json(fullResponse);
        } catch (error) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: req.body?.id || null,
            error: { code: -32603, message: "Internal error" }
          });
        }
      });
    }
    
    // Start HTTP server
    const httpServer = app.listen(port, host, () => {
      console.error(`Secure MCP Filesystem Server running on http://${host}:${port}`);
      console.error(`Transport mode: ${transportMode.toUpperCase()}`);
      console.error("Allowed directories:", allowedDirectories);
      console.error(`Health check available at: http://${host}:${port}/health`);
      if (transportMode === 'http') {
        console.error(`HTTP MCP endpoint available at: http://${host}:${port}/`);
      } else {
        console.error(`SSE endpoint available at: http://${host}:${port}/message`);
      }
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.error('Received SIGTERM, shutting down gracefully...');
      httpServer.close(() => {
        console.error('HTTP server closed.');
        process.exit(0);
      });
    });
    
  } else {
    // Use stdio transport (original behavior)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Secure MCP Filesystem Server running on stdio");
    console.error("Allowed directories:", allowedDirectories);
  }
}

// Helper function to handle tool calls
async function handleToolCall(params: any) {
  try {
    const { name, arguments: args } = params;
    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        if (parsed.data.head && parsed.data.tail) {
          throw new Error("Cannot specify both head and tail parameters simultaneously");
        }
        if (parsed.data.tail) {
          const tailContent = await tailFile(validPath, parsed.data.tail);
          return {
            content: [{ type: "text", text: tailContent }],
          };
        }
        if (parsed.data.head) {
          const headContent = await headFile(validPath, parsed.data.head);
          return {
            content: [{ type: "text", text: headContent }],
          };
        }
        const content = await fs.readFile(validPath, "utf-8");
        return {
          content: [{ type: "text", text: content }],
        };
      }
      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return `${filePath}: Error - ${errorMessage}`;
            }
          }),
        );
        return {
          content: [{ type: "text", text: results.join("\n---\n") }],
        };
      }
      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return {
          content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }],
        };
      }
      case "edit_file": {
        const parsed = EditFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for edit_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const result = await applyFileEdits(validPath, parsed.data.edits, parsed.data.dryRun);
        return {
          content: [{ type: "text", text: result }],
        };
      }
      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return {
          content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }],
        };
      }
      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return {
          content: [{ type: "text", text: formatted }],
        };
      }
      case "list_directory_with_sizes": {
        const parsed = ListDirectoryWithSizesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory_with_sizes: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const detailedEntries = await Promise.all(
          entries.map(async (entry) => {
            const entryPath = path.join(validPath, entry.name);
            try {
              const stats = await fs.stat(entryPath);
              return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: stats.size,
                mtime: stats.mtime
              };
            } catch (error) {
              return {
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: 0,
                mtime: new Date(0)
              };
            }
          })
        );
        const sortedEntries = [...detailedEntries].sort((a, b) => {
          if (parsed.data.sortBy === 'size') {
            return b.size - a.size;
          }
          return a.name.localeCompare(b.name);
        });
        const formattedEntries = sortedEntries.map(entry =>
          `${entry.isDirectory ? "[DIR]" : "[FILE]"} ${entry.name.padEnd(30)} ${
            entry.isDirectory ? "" : formatSize(entry.size).padStart(10)
          }`
        );
        const totalFiles = detailedEntries.filter(e => !e.isDirectory).length;
        const totalDirs = detailedEntries.filter(e => e.isDirectory).length;
        const totalSize = detailedEntries.reduce((sum, entry) => sum + (entry.isDirectory ? 0 : entry.size), 0);
        const summary = [
          "",
          `Total: ${totalFiles} files, ${totalDirs} directories`,
          `Combined size: ${formatSize(totalSize)}`
        ];
        return {
          content: [{
            type: "text",
            text: [...formattedEntries, ...summary].join("\n")
          }],
        };
      }
      case "directory_tree": {
        const parsed = DirectoryTreeArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for directory_tree: ${parsed.error}`);
        }
        interface TreeEntry {
            name: string;
            type: 'file' | 'directory';
            children?: TreeEntry[];
        }
        async function buildTree(currentPath: string): Promise<TreeEntry[]> {
            const validPath = await validatePath(currentPath);
            const entries = await fs.readdir(validPath, {withFileTypes: true});
            const result: TreeEntry[] = [];
            for (const entry of entries) {
                const entryData: TreeEntry = {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file'
                };
                if (entry.isDirectory()) {
                    const subPath = path.join(currentPath, entry.name);
                    entryData.children = await buildTree(subPath);
                }
                result.push(entryData);
            }
            return result;
        }
        const treeData = await buildTree(parsed.data.path);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(treeData, null, 2)
            }],
        };
      }
      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return {
          content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }],
        };
      }
      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern, parsed.data.excludePatterns);
        return {
          content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }],
        };
      }
      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const info = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
      }
      case "list_allowed_directories": {
        return {
          content: [{
            type: "text",
            text: `Allowed directories:\n${allowedDirectories.join('\n')}`
          }],
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});