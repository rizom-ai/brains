#!/usr/bin/env bun
import { resolve } from 'path';

import { importMarkdownDirectory, importMarkdownFile } from '@/importers/markdownImporter';
import { ProfileImporter } from '@/importers/profileImporter';
import logger from '@/utils/logger';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    logger.info(`
Usage:
  bun run src/import.ts <path-to-markdown-or-directory>
  bun run src/import.ts profile <path-to-profile-yaml>

Examples:
  bun run src/import.ts ./articles
  bun run src/import.ts ./articles/my-note.md
  bun run src/import.ts profile ./src/models/profiles/sample.yaml
    `);
    process.exit(1);
  }

  // Check if this is a profile import
  if (args[0] === 'profile') {
    if (args.length < 2) {
      logger.error('Profile import requires a YAML file path');
      process.exit(1);
    }
    
    const profilePath = resolve(args[1]);
    try {
      logger.info(`Importing profile from: ${profilePath}`);
      const importer = new ProfileImporter();
      const profileId = await importer.importProfileFromYaml(profilePath);
      logger.info(`Successfully imported profile with ID: ${profileId}`);
      return;
    } catch (error) {
      logger.error(`Error importing profile: ${error}`);
      process.exit(1);
    }
  }

  // Otherwise, handle markdown import
  const path = resolve(args[0]);
  
  try {
    const stats = await Bun.file(path).stat();
    
    if (stats.isDirectory()) {
      logger.info(`Importing markdown files from directory: ${path}`);
      const result = await importMarkdownDirectory(path);
      logger.info(`Import complete. Imported: ${result.imported}, Failed: ${result.failed}`);
    } else if (stats.isFile()) {
      logger.info(`Importing markdown file: ${path}`);
      const id = await importMarkdownFile(path);
      logger.info(`Successfully imported file with ID: ${id}`);
    } else {
      logger.error(`Path is neither a file nor directory: ${path}`);
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Error during import: ${error}`);
    process.exit(1);
  }
}

main();