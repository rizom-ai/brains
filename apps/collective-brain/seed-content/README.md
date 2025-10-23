# Rizom Collective Brain

This is the Rizom collective's brain - a knowledge hub powered by the Brains framework.

## About This Brain

The Rizom brain serves as the public face of the collective, providing information about our mission, projects, and values.

## Technical Setup

This brain is built on the Brains framework with:

- **Webserver Interface**: Public website at the configured domain
- **MCP Interface**: AI assistant integration for programmatic access
- **Site Builder**: Static site generation with markdown content

### Local Development

```bash
cd apps/collective-brain
cp .env.example .env
# Add your ANTHROPIC_API_KEY and other variables
bun run dev
```

### Environment Variables

- `ANTHROPIC_API_KEY`: Required for AI features
- `MCP_AUTH_TOKEN`: Optional, for securing MCP interface
- `DOMAIN`: Optional, your public domain for production

## Content Management

Content is managed through markdown files in the `seed-content/` directory:

- `HOME.md`: Homepage content
- `README.md`: This file, shown on the About page

Edit these files to update the site content.

## Architecture

This brain uses:

- Default site content (templates and layouts)
- Custom route configuration (HOME.md on /, README.md on /about)
- Minimal plugin set focused on public presentation

See the [planning document](../../docs/plans/collective-brain-setup.md) for full architectural details.
