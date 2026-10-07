/** A run of instruction text; `code` runs are literal values to type or pick. */
export type AiToolText = readonly (string | { code: string })[];

export interface AiToolClient {
  id: "claude" | "chatgpt" | "claude-code" | "cursor" | "vscode" | "other";
  /** Primary clients are always shown; developer clients sit in one collapsed section. */
  group: "primary" | "developer";
  name: string;
  /** How the client reads inside a sentence listing several; defaults to `name`. */
  inlineName?: string;
  note?: AiToolText;
  steps?: readonly AiToolText[];
  fields?: readonly { label: string; value: AiToolText }[];
  /** Paragraphs shown before the snippet. */
  lead?: readonly AiToolText[];
  /** Copied exactly as shown; JSON is pretty-printed. */
  snippet?: { label: string; code: string };
  /** Paragraphs shown after the snippet. */
  after?: readonly AiToolText[];
}

/**
 * The name every client stores this brain under, derived from its host so a
 * person connected to several brains keeps one entry per brain.
 */
export function mcpServerName(address: string): string {
  return new URL(address).host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function shellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function mergeHint(file: string, key: string, name: string): AiToolText {
  return [
    "Already have servers there? Add only the ",
    { code: `"${name}"` },
    " entry inside ",
    { code: `"${key}"` },
    ` of ${file}.`,
  ];
}

export function aiToolClients(address: string): readonly AiToolClient[] {
  const name = mcpServerName(address);
  const passkey = "Sign in with your passkey when asked.";
  return [
    {
      id: "claude",
      group: "primary",
      name: "Claude",
      note: ["Desktop app and claude.ai."],
      steps: [
        ["Open Settings → Connectors → Add custom connector."],
        ["Name it ", { code: name }, " and paste your brain’s address."],
        [passkey],
      ],
    },
    {
      id: "chatgpt",
      group: "primary",
      name: "ChatGPT",
      steps: [
        [
          "Open Settings → Apps & Connectors → Advanced and turn on Developer mode.",
        ],
        [
          "Choose Create, name it ",
          { code: name },
          ", paste your brain’s address and pick OAuth.",
        ],
        [passkey],
      ],
    },
    {
      id: "claude-code",
      group: "developer",
      name: "Claude Code",
      lead: [["Add the server in your terminal:"]],
      snippet: {
        label: "Claude Code command",
        code: `claude mcp add --transport http ${name} ${shellArgument(address)}`,
      },
      after: [
        [
          "Then start Claude Code, run ",
          { code: "/mcp" },
          ", choose ",
          { code: name },
          " and sign in with your passkey.",
        ],
      ],
    },
    {
      id: "cursor",
      group: "developer",
      name: "Cursor",
      steps: [
        ["Open Cursor Settings → MCP → Add new global MCP server."],
        ["Name it ", { code: name }, " and paste your brain’s address."],
        ["Sign in with your passkey when Cursor asks."],
      ],
      lead: [["Or add it to ", { code: "~/.cursor/mcp.json" }, ":"]],
      snippet: {
        label: "Cursor configuration",
        code: json({ mcpServers: { [name]: { url: address } } }),
      },
      after: [mergeHint("the file", "mcpServers", name)],
    },
    {
      id: "vscode",
      group: "developer",
      name: "VS Code",
      steps: [
        ["Open the Command Palette and run ", { code: "MCP: Add Server" }, "."],
        [
          "Choose HTTP, paste your brain’s address and name it ",
          { code: name },
          ".",
        ],
        ["Choose Global, then sign in with your passkey when asked."],
      ],
      lead: [
        ["Or run ", { code: "MCP: Open User Configuration" }, " and add:"],
      ],
      snippet: {
        label: "VS Code configuration",
        code: json({ servers: { [name]: { type: "http", url: address } } }),
      },
      after: [mergeHint("your user configuration", "servers", name)],
    },
    {
      id: "other",
      group: "developer",
      name: "Any other MCP client",
      inlineName: "any other MCP client",
      note: [
        "Look for “add MCP server”, “connector” or “integration” in the tool’s settings and fill in:",
      ],
      fields: [
        { label: "Name", value: [{ code: name }] },
        {
          label: "Type",
          value: ["Remote server, Streamable HTTP — not stdio, not SSE"],
        },
        { label: "URL", value: [{ code: address }] },
        {
          label: "Authentication",
          value: [
            "OAuth. Leave API key, token, client ID and secret empty; the tool registers itself.",
          ],
        },
      ],
      lead: [
        [
          "When you connect, your browser opens “Authorize <tool>?” on your brain. Approve MCP access with your passkey. The tool then has two tools: ",
          { code: "chat" },
          ", to ask your brain anything as you would in chat, and ",
          { code: "confirm" },
          ", to approve changes when the brain asks.",
        ],
        [
          "Tool only takes local (stdio) servers, or insists on an API key? Bridge it with ",
          { code: "mcp-remote" },
          ", which handles the sign-in:",
        ],
      ],
      snippet: {
        label: "mcp-remote bridge configuration",
        code: json({
          mcpServers: {
            [name]: { command: "npx", args: ["-y", "mcp-remote", address] },
          },
        }),
      },
    },
  ];
}
