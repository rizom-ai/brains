# @brains/decks

Presentation decks plugin for creating and viewing slide presentations.

## Features

- **Slide Management**: Create and organize presentation slides
- **Markdown Support**: Write slides in markdown format
- **AI Generation**: Generate presentations from prompts
- **Publishing Workflow**: Draft → Published lifecycle
- **Site Integration**: Automatic routes for deck viewing

## Usage

```typescript
import { decksPlugin } from "@brains/decks";

const config = defineConfig({
  plugins: [decksPlugin()],
});
```

## Tools

- `decks:generate` - Generate a new presentation deck
- `decks:publish` - Publish a deck

## Templates

- `decks:deck-list` - List of all decks
- `decks:deck-detail` - Individual deck viewer
- `decks:deck-slide` - Single slide view

## Schema

Decks are stored as entities with slides in markdown format:

```yaml
---
title: My Presentation
status: draft
description: A brief overview
author: Author Name
---
```
