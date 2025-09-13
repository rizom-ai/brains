# Seed Content

This directory contains default content that is automatically copied to new Brain installations.

## Structure

- **Root directory**: General markdown documents
- **link/**: Sample link entities
- **summary/**: Sample summary entities
- **topic/**: Sample topic entities
- **site-content/**: Site builder content

## Usage

### Docker Deployment

The seed content is automatically copied to `/app/brain-data` during the Docker build process.

### Local Development

When running locally, you can copy this content to your app's brain-data folder:

```bash
cp -r seed-content/* apps/your-app/brain-data/
```

## Adding New Seed Content

To add new default content:

1. Add markdown files to the appropriate directory
2. Ensure frontmatter follows the entity schema for that type
3. Test that the content loads correctly in a fresh installation

## Note

This content is meant as a starting point. Users should replace it with their own content as they use the system.
