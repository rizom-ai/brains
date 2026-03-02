# @brains/obsidian-vault

Obsidian vault integration — generates templates, fileClass definitions, and Bases views from entity schemas.

## What it does

- Generates **templates** (`_obsidian/templates/`) with correct YAML frontmatter so "Create from template" in Obsidian produces import-ready entity files
- Generates **fileClass definitions** (`_obsidian/fileClasses/`) so enum fields like `status` show as dropdowns instead of free-text inputs
- Generates **Bases views** (`_obsidian/bases/`) with per-entity table views, a cross-type Pipeline view, and a Settings view for singleton entities

### Singleton entity handling

Singleton entities (e.g., `brain-character`, `anchor-profile`, `site-info`) are treated differently:

- No template generated (you never create new singletons from a template)
- No individual `.base` file — instead grouped into `Settings.base`
- FileClasses are still generated for field type enforcement

### Generate-if-missing

Bases files are only written if they don't already exist. This lets users customize views without them being overwritten on the next sync. Templates and fileClasses are always regenerated.

## Obsidian setup

### 1. Templates (core plugin)

1. **Settings > Core plugins** > enable "Templates"
2. **Settings > Templates > Template folder** > set to `_obsidian/templates`

### 2. Metadata Menu (community plugin)

Install [Metadata Menu](https://github.com/mdelobelle/metadatamenu) to enable fileClass support (enum dropdowns, field type enforcement).

1. **Settings > Community plugins > Browse** > search "Metadata Menu" > Install > Enable
2. **Settings > Metadata Menu > Class files path** > set to `_obsidian/fileClasses`

Each fileClass includes a `filesPaths` mapping that automatically associates all files in an entity folder (e.g., `post/`) with the corresponding fileClass. No extra frontmatter or manual mapping needed.

### 3. Bases (core plugin)

1. **Settings > Core plugins** > enable "Bases" (available since Obsidian v1.9.10)

No additional configuration needed — Obsidian automatically picks up `.base` files.

## Usage

1. Open a note and run **"Insert template"** (or use the hotkey)
2. Pick a template (e.g., `post`, `series`, `link`)
3. The template pre-fills frontmatter: `entityType`, `status`, `title`, `tags`, etc.
4. Click any enum field (e.g., `status`) to get a dropdown with all valid values
5. Save — directory-sync picks up the file and imports it as an entity
6. Open any `.base` file to see table views of your entities, grouped by status or across types in the Pipeline

## Generated files

```
_obsidian/
├── templates/           # One per non-singleton entity type
│   ├── post.md
│   ├── link.md
│   └── ...
├── fileClasses/         # One per entity type (including singletons)
│   ├── post.md
│   ├── site-info.md
│   └── ...
└── bases/               # Per-entity views + Pipeline + Settings
    ├── Posts.base
    ├── Notes.base
    ├── Pipeline.base    # Non-published items across all status-bearing types
    ├── Settings.base    # Grouped view of all singleton entities
    └── ...
```

## Configuration

```typescript
obsidianVaultPlugin({
  baseFolder: "_obsidian", // default — parent directory for all generated files
});
```
