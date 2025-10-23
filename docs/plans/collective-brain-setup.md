# Collective Brain Setup Plan

## Overview

Create a new brain application for the Rizom collective that serves as a public-facing knowledge hub. This brain will have a minimal feature set focused on presenting content through markdown files.

### Purpose

- Serve as the public face of the Rizom collective
- Display curated content about the collective's mission, projects, and values
- Provide MCP interface for AI assistant integration
- Keep configuration minimal and focused

### Key Requirements

1. **Homepage**: Display `HOME.md` content at root path `/`
2. **About Page**: Display `README.md` content at `/about`
3. **Interfaces**: Webserver (public) + MCP (AI access)
4. **Features**: Standard site navigation, footer, responsive layouts
5. **Branding**: Named "Rizom" with appropriate identity configuration

## Architecture Decisions

### 1. Reuse Default Site Content

**Decision**: Import templates and layouts from `@brains/default-site-content`

**Rationale**:

- The `about` template already handles markdown rendering with proper typography
- Layouts (DefaultLayout, MinimalLayout) provide consistent, tested UI
- Footer and navigation components work out of the box
- Maintains consistency with team-brain appearance

**Implementation**:

```typescript
import {
  templates,
  DefaultLayout,
  MinimalLayout,
} from "@brains/default-site-content";
```

### 2. Custom Routes Configuration

**Decision**: Define routes inline in brain.config.ts rather than using default routes

**Rationale**:

- Need HOME.md on homepage (not intro template)
- Need control over which markdown file loads on which route
- Both routes use same template (about) with different data queries

**Implementation**:

```typescript
const routes = [
  {
    id: "home",
    path: "/",
    title: "Rizom Collective",
    layout: "minimal", // Clean homepage without header
    sections: [
      {
        id: "main",
        template: "about",
        dataQuery: {
          entityType: "base",
          query: { id: "HOME" },
        },
      },
    ],
  },
  {
    id: "about",
    path: "/about",
    title: "About",
    layout: "default", // With header and navigation
    navigation: {
      show: true,
      label: "About",
      slot: "secondary",
      priority: 90,
    },
    sections: [
      {
        id: "main",
        template: "about",
        dataQuery: {
          entityType: "base",
          query: { id: "README" },
        },
      },
    ],
  },
];
```

### 3. Dual Markdown Files

**Decision**: Use separate markdown files for homepage and about page

**Files**:

- `seed-content/HOME.md` - Collective homepage content
- `seed-content/README.md` - Project/setup documentation

**Rationale**:

- Separates public-facing content from technical documentation
- Allows independent editing and evolution
- README can focus on setup/technical details
- HOME can focus on mission/values/projects

### 4. Minimal Plugin Set

**Plugins**:

- `SystemPlugin` - Core functionality
- `MCPInterface` - AI assistant access
- `WebserverInterface` - Public website
- `siteBuilderPlugin` - Static site generation

**Not included** (unlike team-brain):

- MatrixInterface - Not needed for public brain
- GitSyncPlugin - Can add later if needed
- DirectorySync - Will use for seed content only
- TopicsPlugin, LinkPlugin, SummaryPlugin, DecksPlugin - Not needed initially

## File Structure

```
apps/collective-brain/
├── brain.config.ts           # Main configuration
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── .env.example              # Environment variable template
├── theme.css                 # Optional: Custom theme overrides
└── seed-content/             # Content directory
    ├── HOME.md               # Homepage content
    └── README.md             # About/setup documentation
```

## Configuration Details

### Identity Configuration

```typescript
identity: {
  name: "Rizom",
  role: "Collective knowledge coordinator",
  purpose: "Share the vision, projects, and values of the Rizom collective",
  values: ["openness", "collaboration", "innovation", "community"]
}
```

### Site Configuration

```typescript
siteConfig: {
  title: "Rizom",
  description: "The Rizom collective's knowledge hub",
  url: process.env["DOMAIN"] ? `https://${process.env["DOMAIN"]}` : undefined
}
```

### Environment Variables

Required:

- `ANTHROPIC_API_KEY` - For AI features
- `MCP_AUTH_TOKEN` - For MCP interface authentication
- `DOMAIN` - Public domain (optional, for production)

## Implementation Steps

### Phase 1: Directory Setup

1. Create `apps/collective-brain/` directory
2. Create `apps/collective-brain/seed-content/` directory
3. Create placeholder markdown files:
   - `HOME.md` with collective introduction
   - `README.md` with setup/technical info

### Phase 2: Configuration Files

4. Create `package.json` with:
   - Name: `@brains/collective-brain`
   - Dependencies: core packages, plugins, interfaces
   - Scripts: dev, start, build

5. Create `tsconfig.json` extending base config

6. Create `.env.example` with required variables

7. Create `brain.config.ts` with:
   - Identity configuration
   - Plugin setup (System, MCP, Webserver, SiteBuilder)
   - Custom routes (home, about)
   - Site configuration

### Phase 3: Integration

8. Verify app is recognized by monorepo
9. Run typecheck to ensure configuration is valid
10. Test locally with `bun run dev`

### Phase 4: Content

11. Update `HOME.md` with real collective content
12. Update `README.md` with setup documentation

## Testing Plan

1. **Local Development**:

   ```bash
   cd apps/collective-brain
   bun run dev
   ```

2. **Verify Routes**:
   - Visit `http://localhost:3000/` → should show HOME.md content
   - Visit `http://localhost:3000/about` → should show README.md content

3. **Verify MCP**:
   - Start MCP server
   - Connect AI assistant
   - Verify tools are accessible

4. **Verify Navigation**:
   - Check footer shows on both pages
   - Check "About" link in navigation works
   - Check site title links to home

## Success Criteria

- [ ] Homepage displays HOME.md content
- [ ] About page displays README.md content
- [ ] Site is accessible via webserver interface
- [ ] MCP interface responds to tool calls
- [ ] Navigation and footer work correctly
- [ ] TypeScript compiles without errors
- [ ] Site builds for production successfully

## Future Enhancements

Potential additions (not in initial scope):

1. **Content Types**:
   - Blog/articles (using existing blog plugin pattern)
   - Project showcase
   - Team members

2. **Interfaces**:
   - Matrix interface for community chat
   - GitSync for content backup

3. **Features**:
   - Search functionality
   - Tags/categories
   - Content calendar

## Notes

- This is intentionally minimal to start
- Focus on getting core functionality working first
- Content can be refined iteratively
- Additional features can be added based on actual needs
