# @brains/utils

Common utilities and helpers for Personal Brain applications.

## Overview

This package provides shared utilities used across Brain applications, including logging, markdown processing, formatters, permissions, and progress tracking.

## Features

- **Logging**: Structured logging with multiple levels
- **Markdown**: Parsing and manipulation utilities
- **Formatters**: Content formatting for different output types
- **Permissions**: User permission handling
- **Progress**: Progress calculation and tracking
- **YAML**: YAML parsing and serialization
- **ID Generation**: Unique identifier generation
- **Test Utilities**: Common testing helpers

## Installation

```bash
bun add @brains/utils
```

## Logging

Structured logger with multiple levels:

```typescript
import { createLogger } from "@brains/utils";

const logger = createLogger("my-component");

logger.info("Starting process");
logger.debug("Debug information", { data: value });
logger.warn("Warning message");
logger.error("Error occurred", error);

// Child logger
const childLogger = logger.child("sub-component");

// Silent logger for testing
const silent = createSilentLogger();
```

## Markdown Utilities

Parse and manipulate markdown content:

```typescript
import {
  extractTitle,
  parseMarkdownLinks,
  stripMarkdown,
  truncateMarkdown,
} from "@brains/utils";

// Extract title from markdown
const title = extractTitle(markdown); // First # heading or first line

// Parse links
const links = parseMarkdownLinks(markdown);
// [{ text: "Link text", url: "https://..." }]

// Strip markdown formatting
const plainText = stripMarkdown(markdown);

// Truncate with ellipsis
const summary = truncateMarkdown(markdown, 200);
```

## Formatters

Format content for different output types:

### Base Formatter

```typescript
import { BaseFormatter } from "@brains/utils";

class MyFormatter extends BaseFormatter {
  format(data: MyData): string {
    return this.formatSections([
      this.formatHeader("Title"),
      this.formatList(data.items),
      this.formatKeyValue("Status", data.status),
    ]);
  }
}
```

### Built-in Formatters

```typescript
import {
  SimpleTextFormatter,
  StructuredContentFormatter,
  YamlFormatter,
  DefaultQueryFormatter,
} from "@brains/utils";

// Simple text output
const text = new SimpleTextFormatter().format(data);

// Structured with sections
const structured = new StructuredContentFormatter().format({
  title: "Report",
  sections: [
    { heading: "Summary", content: "..." },
    { heading: "Details", list: ["item1", "item2"] },
  ],
});

// YAML output
const yaml = new YamlFormatter().format(data);
```

## Permissions

Handle user permission levels:

```typescript
import {
  getPermissionHandler,
  checkPermission,
  UserPermissionLevel,
} from "@brains/utils";

// Get handler for permission level
const handler = getPermissionHandler("anchor");

// Check if action is allowed
const canDelete = await handler.canDelete();
const canModify = await handler.canModifySystem();

// Check specific permission
const allowed = checkPermission("public", "read");
```

## Progress Tracking

Calculate and format progress:

```typescript
import {
  createProgressCalculator,
  formatProgress,
  calculateBatchProgress,
} from "@brains/utils";

// Simple progress
const calc = createProgressCalculator(100);
calc.update(45);
console.log(calc.percentage); // 45

// Batch progress
const batchProgress = calculateBatchProgress([
  { completed: 10, total: 20 },
  { completed: 5, total: 10 },
]);
console.log(batchProgress); // 50

// Format for display
const display = formatProgress(45, 100);
// "45/100 (45%)"
```

## YAML Utilities

Parse and serialize YAML:

```typescript
import { parseYaml, stringifyYaml } from "@brains/utils";

// Parse YAML
const data = parseYaml(`
  name: Test
  value: 123
  tags:
    - one
    - two
`);

// Serialize to YAML
const yaml = stringifyYaml({
  name: "Test",
  value: 123,
  tags: ["one", "two"],
});
```

## ID Generation

Generate unique identifiers:

```typescript
import { generateId, generateShortId } from "@brains/utils";

// Full UUID
const id = generateId(); // "123e4567-e89b-12d3-a456-426614174000"

// Short ID
const shortId = generateShortId(); // "abc123def"

// With prefix
const noteId = generateId("note"); // "note_123e4567..."
```

## Test Utilities

Helpers for testing:

```typescript
import { createMockLogger, waitFor, mockAsync } from "@brains/utils/test";

// Mock logger with jest spies
const logger = createMockLogger();
expect(logger.info).toHaveBeenCalledWith("message");

// Wait for condition
await waitFor(() => condition === true, {
  timeout: 5000,
  interval: 100,
});

// Mock async function
const mock = mockAsync(async (arg) => `result: ${arg}`);
```

## Response Types

Standard response structures:

```typescript
import {
  SuccessResponse,
  ErrorResponse,
  QueryResponse,
  createSuccessResponse,
  createErrorResponse,
} from "@brains/utils";

// Success response
const success = createSuccessResponse({
  message: "Entity created",
  data: { id: "123" },
});

// Error response
const error = createErrorResponse({
  error: "Not found",
  code: 404,
});
```

## Exports

### Main Utilities

- Logging: `createLogger`, `Logger`, `LogLevel`
- Markdown: `extractTitle`, `parseMarkdownLinks`, `stripMarkdown`
- ID: `generateId`, `generateShortId`
- YAML: `parseYaml`, `stringifyYaml`

### Formatters

- `BaseFormatter` - Base class
- `SimpleTextFormatter` - Plain text
- `StructuredContentFormatter` - Sections
- `YamlFormatter` - YAML output
- `DefaultQueryFormatter` - Query responses

### Permissions

- `getPermissionHandler` - Get handler
- `checkPermission` - Check permission
- `UserPermissionLevel` - Type

### Progress

- `createProgressCalculator` - Calculator
- `formatProgress` - Format display
- `calculateBatchProgress` - Batch calc

### Testing

- `createMockLogger` - Mock logger
- `waitFor` - Wait utility
- Test helpers

## License

MIT
