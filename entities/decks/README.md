# @brains/decks

Presentation decks plugin for creating and viewing slide presentations.

## Features

- **Slide Management**: Create and organize presentation slides
- **Markdown Support**: Write slides in markdown format
- **AI Generation**: Generate presentations from prompts
- **Publishing Workflow**: Draft → Published lifecycle
- **Site Integration**: Automatic routes for deck viewing

## Usage

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `decks`, so its templates and data source keep the `decks:` names:

```typescript
import decksPackage from "@brains/decks";
```

## Tools

None of its own. Decks are written from text with `system_create` and generated from a prompt with `system_generate`, through `deck:generation`.

## Templates

- `decks:deck-list` - List of all decks
- `decks:deck-detail` - Individual deck viewer
- `decks:carousel` - The deck as social carousel slides

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
