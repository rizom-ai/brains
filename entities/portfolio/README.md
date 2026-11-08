# @brains/portfolio

Portfolio showcase for projects and case studies.

## Features

- **Project Management**: Create and organize portfolio projects
- **Case Studies**: Detailed project writeups with images
- **Publishing Workflow**: Draft → Published lifecycle
- **Site Integration**: Automatic routes for portfolio pages

## Usage

The package default-exports a declarative entity package. The canonical brain composes it under the plugin id `portfolio`, so its templates and data source keep the `portfolio:` names:

```typescript
import portfolioPackage from "@brains/portfolio";
```

## Tools

None of its own. Projects are written from text with `system_create` and generated from a prompt with `system_generate`; a prompt that names the year the project began queues `project:generation`.

## Templates

- `portfolio:project-list` - Grid of portfolio projects
- `portfolio:project-detail` - Individual project page

## Schema

Projects are stored as entities:

```yaml
---
title: Project Name
slug: project-name
status: draft
description: Brief project summary
year: 2025
url: https://example.com
---
## Context

## Problem

## Solution

## Outcome
```
