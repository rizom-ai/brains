# White paper entity type

Display name: `White paper`.
Entity type: `whitepaper`.

## Status

Technical exploration / foundation branch.

This is **not ready to merge as a product MVP**. The current branch proves the entity foundation and outline-stage generation, but a useful white paper product workflow still needs at least outline → draft expansion and document export/attachment decisions.

## Context

White papers are becoming a repeatable content format for brains that use long-form strategic content as part of their publishing workflow. The immediate use case is the New Institutions white paper: a document that connects institutional theory, product positioning, technology architecture, use cases, governance, and a roadmap.

Today this kind of work can live in a `note`, but that loses useful structure. A note can hold an outline or draft, but it cannot express the lifecycle, source material, audience, related posts, generated PDF, cover, social derivatives, or publication state in a first-class way. If white papers remain freeform notes, every future workflow has to rediscover the same conventions.

A dedicated `whitepaper` entity type would make the white paper logic reusable: outline generation, draft expansion, PDF generation, landing-page rendering, social-post generation, and relationship tracking can all target the same structured entity.

## Goals

- Add a first-class `whitepaper` entity type for strategic long-form documents.
- Support a reusable lifecycle: `idea` → `outline` → `draft` → `review` → `published`.
- Preserve links to source posts, notes, links, decks, and projects.
- Support document/PDF generation from the entity.
- Support derivative publishing workflows such as social posts, decks, newsletters, and landing pages.
- Keep the entity generic enough for future white papers beyond New Institutions.

## Non-goals

- Build a full document editor in this change.
- Replace `note` for all long-form writing.
- Force all white papers into one rigid section structure.
- Implement a custom PDF renderer if the existing document generation pipeline can be reused.

## Proposed schema

A minimal schema should be enough to make white papers first-class without overfitting the first use case.

```yaml
title: string
subtitle?: string
status: idea | outline | draft | review | published
audience?: string[]
thesis?: string
abstract?: string
keywords?: string[]
sourceEntities?:
  - entityType: post | note | link | deck | project | topic
    id: string
relatedPosts?: string[]
relatedNotes?: string[]
relatedLinks?: string[]
relatedProjects?: string[]
coverImageId?: string
documents?:
  - id: string
slug?: string
publishedAt?: string
```

The markdown body remains the canonical long-form content. Frontmatter stores workflow and relationship metadata; the body stores the actual outline or draft. Generated PDFs should follow the existing document attachment convention by storing references in `documents: [{ id }]` rather than introducing a separate single `documentId` field.

## Suggested content structure

The entity should not require these headings, but white paper generation prompts and templates can use them as defaults:

```md
## Executive Summary

## Problem / Context

## Core Thesis

## Conceptual Framework

## Design Principles

## Technology / Stack

## Use Cases

## Governance / Risks

## Implementation Roadmap

## Conclusion
```

For the New Institutions white paper, the default structure can be more specific:

```md
## Executive Summary

## The Institutional Crisis

## Why Existing Innovation Models Are Not Enough

## What New Institutions Need

## Design Principles for New Institutional Technology

## The Stack: How Our Technology Fits

## Use Cases

## Governance and Accountability

## A European / Middle-Power Innovation Strategy

## Roadmap / Implementation Path

## Conclusion: Infrastructure for What Comes Next
```

## Workflow

### 1. Create from prompt or source material

A user can ask for a white paper outline from a collection of posts, notes, links, or topics. The create flow should support:

- direct markdown content
- AI generation from a prompt
- source-driven generation from existing entities

### 2. Expand outline into draft

A future generation action can expand a `status: outline` whitepaper into a `status: draft` version while preserving the same entity ID.

### 3. Generate publication artifacts

The whitepaper should support the same downstream artifact generation patterns as posts and decks:

- printable PDF / document
- cover image
- landing-page route, if configured by a site template
- social-post derivatives
- newsletter derivatives
- deck/carousel derivatives

### 4. Publish or attach

Publishing can either mean:

- publishing a white paper page on the site;
- generating and attaching a PDF document;
- or both, depending on the site template and content-pipeline provider.

## Implementation plan

### Initial technical slice

This is not the product MVP. It is the first technical slice needed to make `whitepaper` a real entity type and prove the outline-stage workflow. Product MVP scope should be decided separately.

- register `whitepaper` as an explicit entity type
- add schema, adapter, and metadata extraction
- support create/get/update/list/search through existing system tools
- support directory sync round-tripping through `whitepaper/`
- include the New Institutions outline as the first fixture/test case
- add agent evals that map "white paper" / "strategic paper" requests to `entityType: whitepaper`, list whitepapers correctly, and avoid false-positive note captures
- add a narrow `WhitepaperGenerationJobHandler` for prompt-driven outline generation
- add plugin generation evals for outline quality and "write white paper" requests staying outline-stage

### Generation handler

The initial `WhitepaperGenerationJobHandler` should stay deliberately narrow:

- prompt/content → outline whitepaper
- default `status: outline`
- generic section structure, not New Institutions-specific sections by default
- no full-draft generation yet
- no PDF/social/deck derivatives yet

Prompt-based generation should create an outline that can be expanded later rather than attempting a complete long-form paper in one shot. If source content is provided, the handler may include it in the prompt as grounding material, but structured `sourceEntities` resolution/citation mapping can remain follow-up work.

Open design questions for later generation work:

- Should outline → draft mutate the same entity, create a new revision, or create a separate entity?
- Should source-grounded generation require citations/source mapping in the body?
- How should long draft generation be chunked to avoid one-shot low-quality output?

### Product MVP candidates

A useful product MVP likely needs more than outline generation. Candidate minimum product scope:

- create or import a whitepaper outline
- expand outline → draft while preserving the same whitepaper entity ID
- attach or export a generated document/PDF
- preserve source relationships sufficiently for later review

### Follow-ups

These should be implemented after the initial entity type is stable:

- outline → draft expansion workflow
- document/PDF generation and attachment
- cover image generation/attachment
- public site route and templates
- social-post, newsletter, and deck/carousel derivatives
- generalized source-entity relationship conventions shared by other entity types

## Implementation notes

Likely areas to inspect or modify:

- entity type registration and schema mapping
- `system_create`, `system_get`, `system_update`, and `system_list` support
- MCP tool metadata / generated typed tools
- directory-sync path mapping (`whitepaper/`)
- site-content plugin routes/templates, if white papers should render publicly
- document generation source support
- content-pipeline publishing support
- CMS/editor type visibility, if applicable
- eval coverage for agent entity mapping and whitepaper-specific generation quality

The implementation should follow the existing entity-type pattern rather than special-casing white papers in tools. If a `note` type now replaces the old `base` type in the public registry, whitepaper should be registered explicitly rather than relying on base/note fallback behavior.

## Open questions

- Should `whitepaper` be a first-party core entity type, or should it be provided by a content/publishing plugin?
- Should white papers be public by default, draft-only by default, or follow the same visibility defaults as posts?
- Should `sourceEntities` be generic across all content entities rather than introduced only for white papers? The initial technical slice may add it locally, but follow-up work should consider promoting the shape to a shared convention.
- Should `sourceEntityType` constraints in `social-post` be expanded beyond `post | deck`, or should derivatives simply omit source references when the source is a note/whitepaper?
- Should PDF generation attach documents automatically by appending to `documents: [{ id }]` on the whitepaper?
- Should a whitepaper have a stable slug and public route by default? The initial technical slice should persist `slug` when provided, but public routing can remain template/site-config dependent.

## Acceptance criteria

### Initial technical slice acceptance criteria

- `whitepaper` appears in the entity type registry.
- A whitepaper can be created, retrieved, updated, listed, searched, and synced to disk.
- Whitepaper markdown round-trips through directory sync without losing frontmatter.
- The New Institutions outline can be saved as a `whitepaper` rather than a generic note.
- Agent eval coverage verifies that white paper / strategic paper language maps to `entityType: whitepaper`, listing requests use `system_list`, and note/memo captures are not over-mapped to whitepaper.
- Prompt-driven generation can create an outline whitepaper with `status: outline`.
- Plugin eval coverage verifies generated outlines are structured, whitepaper-specific, and do not become full prose drafts.

### Follow-up acceptance criteria

- Outline → draft expansion preserves the same whitepaper entity ID unless explicitly configured otherwise.
- Whitepaper entities support cover images and generated document attachments using existing `coverImageId` and `documents: [{ id }]` conventions.
- Whitepaper can be used as a source for social-post and deck generation, even if the social-post schema does not store it as `sourceEntityType` initially.
- Whitepaper can render publicly when a site template/config enables a route.

## First test case

Use the New Institutions outline as the first content fixture:

- title: `New Institutions: Technology for Sovereign, Regenerative, Distributed Coordination`
- status: `outline`
- audience: `European and middle-power institutions`, `public-interest technology builders`, `funders`, `civic infrastructure organizations`
- thesis: `New institutions need technology that strengthens memory, sovereignty, accountability, distributed coordination, and regeneration rather than reproducing platform capture.`

This fixture validates the initial outline-stage entity workflow. Full lifecycle validation from outline → draft → document/social derivatives belongs to follow-up product workflow work.
