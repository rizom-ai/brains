# Getting Started with Personal Brain

Welcome to your Personal Brain! This example document will help you understand how to use the directory-sync feature to manage your knowledge base.

## What is Directory Sync?

Directory sync is a powerful feature that bridges the gap between your local file system and your Personal Brain. It allows you to:

- Write notes in your favorite markdown editor
- Organize files in a familiar directory structure
- Version control your knowledge with Git
- Deploy your brain with pre-populated content

## How Directory Sync Works

### Local Development

When developing locally, place your markdown files in the `brain-data` directory. The directory-sync plugin will:

1. **Watch for changes** - Any new or modified `.md` files are automatically imported
2. **Preserve metadata** - File creation and modification times are preserved
3. **Support hot reload** - Changes appear immediately in your brain

### Deployment

When you deploy your Personal Brain:

1. All files in `brain-data` are included in the build
2. The deployment process copies these files to `/app/brain-data`
3. Your brain starts with all your pre-populated content
4. You can continue adding new files in production

## File Organization Tips

### Basic Structure

```
brain-data/
├── .gitkeep                 # Ensures directory is tracked by Git
├── getting-started.md       # This file!
├── daily-notes.md          # Your daily journal
├── project-ideas.md        # Project brainstorming
└── reading-list.md         # Books and articles to read
```

### Naming Conventions

- Use descriptive filenames (they become entity IDs)
- Use hyphens instead of spaces: `my-awesome-note.md`
- Keep names concise but meaningful
- Avoid special characters

### Content Best Practices

1. **Start with a clear title** - The first `#` heading becomes the entity title
2. **Use markdown features** - Lists, code blocks, links all work great
3. **Cross-reference** - Link between your notes using standard markdown links
4. **Add metadata** - Use YAML frontmatter for additional properties (coming soon)

## Example Content Ideas

Here are some ideas for your first notes:

### Daily Journal

Create a `daily-2024-01-15.md` file for each day:

```markdown
# Daily Notes - January 15, 2024

## Morning Thoughts

- Excited about the new Personal Brain setup
- Need to migrate old notes from Notion

## Tasks

- [x] Set up Personal Brain
- [ ] Import existing notes
- [ ] Configure Matrix interface

## Learnings

- Directory sync makes it easy to manage notes
- Markdown is more portable than proprietary formats
```

### Project Planning

Track your projects in `project-website-redesign.md`:

```markdown
# Website Redesign Project

## Goals

- Modernize the design
- Improve performance
- Add dark mode support

## Timeline

- Week 1: Research and wireframes
- Week 2: Design mockups
- Week 3-4: Implementation
- Week 5: Testing and launch

## Resources

- [Design inspiration](https://dribbble.com)
- [Color palette generator](https://coolors.co)
```

### Knowledge Base

Build your personal wiki with interconnected topics:

```markdown
# JavaScript Async Patterns

## Callbacks

The original async pattern...

## Promises

Introduced in ES6...

## Async/Await

Modern syntax sugar...

See also: [[error-handling]], [[performance-tips]]
```

## Advanced Features (Coming Soon)

The Personal Brain roadmap includes exciting features:

- **Subdirectory organization** - Group related notes in folders
- **Entity type detection** - Automatic categorization based on content
- **Frontmatter support** - Add tags, dates, and custom metadata
- **Git sync integration** - Full version control and remote backup

## Getting Help

- Check the [documentation](https://github.com/yeehaa123/brains/docs)
- Join the community chat
- Submit issues on GitHub

## Next Steps

1. **Delete this file** (or keep it as reference)
2. **Create your first note** - Start with something simple
3. **Experiment** - Try different organizational approaches
4. **Make it yours** - This is YOUR brain, organize it your way

Happy note-taking! 🧠✨
