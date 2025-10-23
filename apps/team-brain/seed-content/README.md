# Recall

**Your team's AI-powered knowledge hub**

Recall captures links, conversations, and decisions automatically, then makes them searchable and actionable. Connect via Matrix chat, web interface, or AI assistants like Claude Desktop.

## What is Recall?

Recall is a collaborative knowledge management system that:

- **Captures** links, conversations, and documents automatically
- **Organizes** content with AI-powered summaries and topic extraction
- **Connects** to Matrix chat, web browsers, and AI assistants
- **Syncs** everything to Git for version control and backup
- **Stores** data as human-readable Markdown files

Think of it as a smart second brain for your team that works where you already collaborate.

## Features

### 🔗 Automatic Link Capture

Paste any URL in Matrix chat and Recall automatically:

- Extracts and archives the content
- Generates a summary
- Identifies relevant topics
- Makes it searchable

### 💬 AI-Powered Conversations

- Ask questions in natural language via Matrix
- Query your team's knowledge base
- Get instant answers from captured content
- Integrated semantic search

### 🏷️ Smart Organization

- Automatic topic extraction from conversations
- AI-generated summaries of discussions
- Browse by links, topics, summaries, or presentations
- Full-text and semantic search

### 🌐 Static Site Generation

- Beautiful web interface with all your content
- Presentation decks with Reveal.js
- Responsive design with Tailwind CSS
- Can be deployed anywhere

### 🔄 Git Sync

- All content backed up to Git automatically
- Edit in Obsidian, VS Code, or any Markdown editor
- Version control for all changes
- Works with GitHub, GitLab, or self-hosted Git

### 🤖 MCP Integration

- Connect to Claude Desktop or other MCP clients
- Let AI assistants search your knowledge base
- Execute commands and queries remotely
- HTTP and stdio transport support

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- SQLite 3.x
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/brains
cd brains

# Install dependencies
bun install

# Navigate to team-brain
cd apps/team-brain
```

### Configuration

Create a `.env` file in the root directory:

```bash
# Required: Anthropic API key for AI features
ANTHROPIC_API_KEY=sk-ant-...

# Database URLs (defaults to local SQLite files)
DATABASE_URL=file:./data/brains.db
JOB_QUEUE_DATABASE_URL=file:./data/jobs.db
CONVERSATION_DATABASE_URL=file:./data/conversations.db

# Matrix Configuration (optional - for chat interface)
MATRIX_HOMESERVER=https://matrix.org
MATRIX_ACCESS_TOKEN=your_matrix_token
MATRIX_USER_ID=@recall:matrix.org
MATRIX_ANCHOR_USER_ID=@youruser:matrix.org

# Git Sync Configuration (optional - for backup)
GIT_SYNC_URL=https://github.com/your-org/recall-content
GIT_SYNC_TOKEN=ghp_your_github_token

# MCP Configuration (optional - for remote access)
MCP_AUTH_TOKEN=your_secure_token

# Web Interface (optional - for production deployment)
DOMAIN=recall.example.com
PORT=3000

# Logging
LOG_LEVEL=info
```

### Running Locally

```bash
# Run in development mode (watches for changes)
bun run dev

# Run CLI interface
bun run dev:cli

# Run in production mode
bun run start
```

The application will:

- Initialize SQLite databases
- Sync seed content to markdown files
- Start all configured interfaces (web, matrix, MCP)
- Begin processing jobs in the background

Visit `http://localhost:3000` to access the web interface.

## Development

### Available Commands

```bash
# Development
bun run dev              # Start with hot reload
bun run dev:cli          # Start CLI interface with hot reload

# Production
bun run start            # Run the application
bun run start:cli        # Run CLI interface

# Database
bun run migrate          # Run all migrations
bun run migrate:entities # Migrate entities database only
bun run db:studio        # Open Drizzle Studio (main DB)
bun run db:studio:entities    # Studio for entities
bun run db:studio:conversations # Studio for conversations
bun run db:studio:jobs   # Studio for job queue

# Quality
bun run test             # Run tests
bun run typecheck        # Type check
bun run lint             # Lint code

# Matrix Setup
bun run matrix:setup     # Interactive Matrix configuration
```

### Project Structure

```
apps/team-brain/
├── brain.config.ts      # Main configuration
├── seed-content/        # Initial markdown content
├── scripts/             # Utility scripts
└── data/                # SQLite databases (created on first run)
```

### Adding Seed Content

Place markdown files in `seed-content/` and they'll be synced to the database on startup. Files can include:

- Links (frontmatter: `type: link`)
- Summaries (frontmatter: `type: summary`)
- Topics (frontmatter: `type: topic`)
- Presentations (frontmatter: `type: deck`)
- Custom content types

## Usage

### Matrix Chat

1. Invite your Recall bot to a Matrix room
2. Paste URLs to capture links automatically
3. Mention the bot to ask questions: `@recall what topics have we discussed?`
4. Use commands: `!help`, `!identity`, `!git-sync`

### Web Interface

Navigate to your deployment URL to:

- Browse all captured links at `/links`
- View topics at `/topics`
- Read summaries at `/summaries`
- Present decks at `/decks`
- Search content with semantic search

### MCP (AI Assistant Integration)

Configure Claude Desktop or another MCP client:

```json
{
  "mcpServers": {
    "recall": {
      "command": "node",
      "args": ["/path/to/brains/apps/team-brain/brain.config.ts", "--mcp"]
    }
  }
}
```

Or use HTTP transport for remote access:

```json
{
  "mcpServers": {
    "recall": {
      "url": "https://recall.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your_auth_token"
      }
    }
  }
}
```

Available MCP tools:

- `brain_query` - Natural language queries
- `brain_command` - Execute shell commands
- `entity_*` - Create, read, update, delete entities

### CLI Interface

```bash
bun run start:cli

# In the CLI:
> query "what are our main topics?"
> command "help"
> exit
```

## Deployment

Recall can be deployed as:

1. **Docker Container** - See `deploy/providers/hetzner/` for examples
2. **Systemd Service** - Run as a system service
3. **Node.js Process** - Standard Node deployment
4. **Bun Binary** - Compile to standalone executable

### Docker Deployment

```bash
# Build image
docker build -t recall .

# Run container
docker run -d \
  --name recall \
  -p 3000:3000 \
  -v ./data:/app/data \
  -v ./content:/app/content \
  --env-file .env \
  recall
```

### Environment-Specific Configuration

- **Development**: Local SQLite, hot reload, debug logging
- **Production**: Remote databases, health checks, info logging
- **Preview**: Separate databases, preview domain

See `deploy/` directory for deployment scripts and configurations.

## Architecture

Recall is built on a plugin-based architecture:

### Core

- **Shell** - Plugin system and service orchestration
- **Entity Service** - Unified data model with SQLite + vector embeddings
- **Job Queue** - Background task processing
- **Messaging** - Event-driven communication between plugins

### Plugins

- **System** - Core commands and queries
- **Link** - URL capture and content extraction
- **Summary** - AI-powered summarization
- **Topics** - Topic extraction and organization
- **Decks** - Presentation deck rendering
- **Site Builder** - Static site generation
- **Directory Sync** - Markdown file synchronization
- **Git Sync** - Automatic Git backup

### Interfaces

- **Matrix** - Chat integration
- **MCP** - AI assistant protocol
- **Webserver** - HTTP API and static site hosting
- **CLI** - Command-line interface

## Contributing

This is an internal tool, but we welcome contributions:

1. Follow the [CLAUDE.md](../../CLAUDE.md) development guidelines
2. Write tests for new features
3. Run `bun run typecheck` and `bun run lint` before committing
4. Keep commits focused and write clear messages

## Troubleshooting

### Database Issues

```bash
# Reset databases (WARNING: deletes all data)
rm -rf data/*.db

# Run migrations
bun run migrate
```

### Matrix Connection Issues

```bash
# Verify Matrix configuration
bun run matrix:setup

# Check Matrix access token validity
curl -H "Authorization: Bearer $MATRIX_ACCESS_TOKEN" \
  $MATRIX_HOMESERVER/_matrix/client/v3/account/whoami
```

### MCP Connection Issues

```bash
# Test MCP endpoint
curl -X POST https://your-domain.com/mcp \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method": "ping"}'
```

### Git Sync Issues

```bash
# Check Git sync status
cd content
git status
git log

# Force sync
# In Matrix: !git-sync
# Or restart the application
```

## License

MIT

## Support

- Documentation: [docs/](../../docs/)
- Issues: [GitHub Issues](https://github.com/your-org/brains/issues)
- Matrix: `#recall:your-domain.com`
