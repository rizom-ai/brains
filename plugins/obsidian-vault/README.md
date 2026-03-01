# @brains/obsidian-vault

Obsidian vault integration — generates templates and fileClass definitions from entity schemas.

## What it does

- Generates **templates** (`_obsidian/templates/`) with correct YAML frontmatter so "Create from template" in Obsidian produces import-ready entity files
- Generates **fileClass definitions** (`_obsidian/fileClasses/`) so enum fields like `status` show as dropdowns instead of free-text inputs

## Obsidian setup

### 1. Templates (core plugin)

1. **Settings > Core plugins** > enable "Templates"
2. **Settings > Templates > Template folder** > set to `_obsidian/templates`

### 2. Metadata Menu (community plugin)

Install [Metadata Menu](https://github.com/mdelobelle/metadatamenu) to enable fileClass support (enum dropdowns, field type enforcement).

1. **Settings > Community plugins > Browse** > search "Metadata Menu" > Install > Enable
2. **Settings > Metadata Menu > Class files path** > set to `_obsidian/fileClasses`

Each fileClass includes a `filesPaths` mapping that automatically associates all files in an entity folder (e.g., `post/`) with the corresponding fileClass. No extra frontmatter or manual mapping needed.

## Usage

1. Open a note and run **"Insert template"** (or use the hotkey)
2. Pick a template (e.g., `post`, `series`, `link`)
3. The template pre-fills frontmatter: `entityType`, `status`, `title`, `tags`, etc.
4. Click any enum field (e.g., `status`) to get a dropdown with all valid values
5. Save — directory-sync picks up the file and imports it as an entity

## Configuration

```typescript
obsidianVaultPlugin({
  baseFolder: "_obsidian", // default — parent directory for templates and fileClasses
});
```
