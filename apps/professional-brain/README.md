# Professional Brain

A brain application for individual professionals that serves dual purposes:

1. **Knowledge Management**: Personal note-taking, content capture, and organization
2. **Public Showcase**: Professional portfolio and blog with public-facing website

## Quick Start

```bash
# Copy environment configuration
cp .env.example .env

# Edit .env and add your ANTHROPIC_API_KEY

# Install dependencies (from repo root)
bun install

# Run in development mode
bun run dev
```

The preview site will be available at http://localhost:4321

## Features

- **Directory Sync**: Bidirectional sync between markdown files and database
- **Site Builder**: Static site generation with default theme
- **System Tools**: Health checks and system information
- **Preview Server**: Local development server with hot reload

## Configuration

Edit `.env` to configure:

- `ANTHROPIC_API_KEY`: Required for AI features
- `PREVIEW_PORT`: Preview server port (default: 4321)
- `SYNC_PATH`: Directory for markdown content (default: ./brain-data)

See `.env.example` for all available options.

## Seed Content

The `seed-content/` directory contains initial content that will be synced to the database on first run:

- `identity/identity.md`: AI assistant personality and behavior
- `profile/profile.md`: Professional profile information
- `site-info/site-info.md`: Website presentation and configuration
- `HOME.md`: Homepage content
- `README.md`: About page content

Edit these files to customize your brain.

## Scripts

- `bun run dev`: Start with hot reload
- `bun run start`: Start in production mode
- `bun run typecheck`: Run TypeScript type checking
- `bun run test`: Run tests
- `bun run clean`: Remove build artifacts

## Next Steps

After Phase 1, additional plugins will be added:

- **Blog Plugin**: Long-form content with publishing workflow
- **Portfolio Plugin**: Project showcase (future)
