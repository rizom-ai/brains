# @brains/portfolio

Portfolio showcase for projects and case studies.

## Features

- **Project Management**: Create and organize portfolio projects
- **Case Studies**: Detailed project writeups with images
- **Publishing Workflow**: Draft → Published lifecycle
- **Site Integration**: Automatic routes for portfolio pages

## Usage

```typescript
import { portfolioPlugin } from "@brains/portfolio";

const config = defineConfig({
  plugins: [portfolioPlugin()],
});
```

## Tools

- `portfolio:create` - Create a new project
- `portfolio:publish` - Publish a project

## Templates

- `portfolio:project-list` - Grid of portfolio projects
- `portfolio:project-detail` - Individual project page

## Schema

Projects are stored as entities:

```yaml
---
title: Project Name
status: draft
description: Brief project summary
client: Client Name
year: 2025
tags:
  - web
  - design
---
Full project description and case study...
```
