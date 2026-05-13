/**
 * Tool Output Formatters
 *
 * Shared formatters for converting tool results to markdown.
 * Used by plugin tools to provide consistent, rich output for chat interfaces.
 */

/**
 * Options for list formatting
 */
export interface ListFormatOptions<T> {
  /** Function to extract the title for each item */
  title: (item: T) => string;
  /** Optional function to extract a subtitle */
  subtitle?: (item: T) => string;
  /** Optional header text */
  header?: string;
  /** Use numbered list instead of bullets */
  numbered?: boolean;
  /** Maximum items to show (shows "and X more" if exceeded) */
  maxItems?: number;
}

/**
 * Format an array of items as a markdown list
 */
export function formatAsList<T>(
  items: T[],
  options: ListFormatOptions<T>,
): string {
  const { title, subtitle, header, numbered = false, maxItems } = options;

  if (items.length === 0) {
    return header ? `${header}\n\n_No items_` : "_No items_";
  }

  const displayItems = maxItems ? items.slice(0, maxItems) : items;
  const remaining = maxItems ? items.length - maxItems : 0;

  const lines: string[] = [];

  if (header) {
    lines.push(header);
    lines.push("");
  }

  displayItems.forEach((item, index) => {
    const prefix = numbered ? `${index + 1}.` : "-";
    const titleText = title(item);
    const subtitleText = subtitle ? subtitle(item) : null;

    if (subtitleText) {
      lines.push(`${prefix} **${titleText}**: ${subtitleText}`);
    } else {
      lines.push(`${prefix} ${titleText}`);
    }
  });

  if (remaining > 0) {
    lines.push("");
    lines.push(`_...and ${remaining} more_`);
  }

  return lines.join("\n");
}

/**
 * Column definition for table formatting
 */
export interface TableColumn<T> {
  /** Column header text */
  header: string;
  /** Function to extract cell value */
  value: (item: T) => string | number | boolean | null | undefined;
  /** Alignment: left (default), center, right */
  align?: "left" | "center" | "right";
}

/**
 * Options for table formatting
 */
export interface TableFormatOptions<T> {
  /** Column definitions */
  columns: TableColumn<T>[];
  /** Optional header text above the table */
  header?: string;
  /** Maximum rows to show */
  maxRows?: number;
}

/**
 * Format an array of items as a markdown table
 */
export function formatAsTable<T>(
  items: T[],
  options: TableFormatOptions<T>,
): string {
  const { columns, header, maxRows } = options;

  if (items.length === 0) {
    return header ? `${header}\n\n_No items_` : "_No items_";
  }

  const displayItems = maxRows ? items.slice(0, maxRows) : items;
  const remaining = maxRows ? items.length - maxRows : 0;

  const lines: string[] = [];

  if (header) {
    lines.push(header);
    lines.push("");
  }

  // Header row
  const headers = columns.map((col) => col.header);
  lines.push(`| ${headers.join(" | ")} |`);

  // Separator row with alignment
  const separators = columns.map((col) => {
    switch (col.align) {
      case "center":
        return ":---:";
      case "right":
        return "---:";
      default:
        return "---";
    }
  });
  lines.push(`| ${separators.join(" | ")} |`);

  // Data rows
  for (const item of displayItems) {
    const cells = columns.map((col) => {
      const value = col.value(item);
      if (value === null || value === undefined) return "";
      return String(value);
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }

  if (remaining > 0) {
    lines.push("");
    lines.push(`_...and ${remaining} more rows_`);
  }

  return lines.join("\n");
}

/**
 * Options for entity formatting
 */
export interface EntityFormatOptions {
  /** Optional title for the entity display */
  title?: string;
  /** Fields to exclude from display */
  excludeFields?: string[];
  /** Fields to show first (in order) */
  priorityFields?: string[];
}

/**
 * Format a single entity/object as markdown
 */
export function formatAsEntity(
  entity: Record<string, unknown>,
  options: EntityFormatOptions = {},
): string {
  const { title, excludeFields = [], priorityFields = [] } = options;

  const lines: string[] = [];

  if (title) {
    lines.push(`## ${title}`);
    lines.push("");
  }

  // Get all keys, filtering excluded ones
  const allKeys = Object.keys(entity).filter(
    (key) => !excludeFields.includes(key),
  );

  // Sort: priority fields first, then alphabetically
  const sortedKeys = [
    ...priorityFields.filter((k) => allKeys.includes(k)),
    ...allKeys.filter((k) => !priorityFields.includes(k)).sort(),
  ];

  for (const key of sortedKeys) {
    const value = entity[key];
    const formattedValue = formatValue(value);
    const label = formatLabel(key);
    lines.push(`**${label}**: ${formattedValue}`);
  }

  return lines.join("\n");
}

/**
 * Search result item for formatting
 */
export interface SearchResultItem {
  id: string;
  entityType?: string;
  title?: string;
  snippet?: string;
  score?: number;
}

/**
 * Options for search results formatting
 */
export interface SearchResultsFormatOptions {
  /** Query that produced these results */
  query?: string;
  /** Show relevance scores */
  showScores?: boolean;
  /** Maximum results to show */
  maxResults?: number;
}

/**
 * Format search results as markdown
 */
export function formatAsSearchResults(
  results: SearchResultItem[],
  options: SearchResultsFormatOptions = {},
): string {
  const { query, showScores = false, maxResults } = options;

  const lines: string[] = [];

  if (query) {
    lines.push(`## Search Results for "${query}"`);
    lines.push("");
  }

  if (results.length === 0) {
    lines.push("_No results found_");
    return lines.join("\n");
  }

  const displayResults = maxResults ? results.slice(0, maxResults) : results;
  const remaining = maxResults ? results.length - maxResults : 0;

  for (const result of displayResults) {
    const titleText = result.title ?? result.id;
    const typeText = result.entityType ? ` (${result.entityType})` : "";
    const scoreText =
      showScores && result.score !== undefined
        ? ` [${Math.round(result.score * 100)}%]`
        : "";

    lines.push(`- **${titleText}**${typeText}${scoreText}`);

    if (result.snippet) {
      lines.push(`  ${result.snippet}`);
    }
  }

  if (remaining > 0) {
    lines.push("");
    lines.push(`_...and ${remaining} more results_`);
  }

  return lines.join("\n");
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "_none_";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string") {
    // Truncate long strings
    if (value.length > 100) {
      return value.substring(0, 100) + "...";
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "_empty_";
    if (value.length <= 3) {
      return value.map((v) => formatValue(v)).join(", ");
    }
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    return "_object_";
  }
  return String(value);
}

/**
 * Format a key as a human-readable label
 */
function formatLabel(key: string): string {
  // Convert camelCase or snake_case to Title Case
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}
