#!/usr/bin/env bun
import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

// Target version - update this when you want to bump versions
const TARGET_VERSION = process.argv[2] || "0.1.0";

async function updatePackageVersion(path: string) {
  try {
    const content = await readFile(path, "utf-8");
    const pkg = JSON.parse(content);
    
    // Only update if version is different
    if (pkg.version !== TARGET_VERSION) {
      console.log(`  Updating ${pkg.name}: ${pkg.version} → ${TARGET_VERSION}`);
      pkg.version = TARGET_VERSION;
      await writeFile(path, JSON.stringify(pkg, null, 2) + "\n");
    } else {
      console.log(`  Skipping ${pkg.name}: already at ${TARGET_VERSION}`);
    }
  } catch (error) {
    console.error(`  Error updating ${path}:`, error);
  }
}

async function findPackageJsons(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      // Skip node_modules and hidden directories
      if (entry.name === "node_modules" || entry.name.startsWith(".")) {
        continue;
      }
      
      if (entry.isDirectory()) {
        files.push(...await findPackageJsons(fullPath));
      } else if (entry.name === "package.json") {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

console.log(`Syncing all package versions to ${TARGET_VERSION}\n`);

// Find all package.json files
const packages = await findPackageJsons("packages");
const apps = await findPackageJsons("apps");
const allPackages = [...packages, ...apps];

console.log(`Found ${allPackages.length} packages to update:\n`);

// Update all packages
for (const pkgPath of allPackages) {
  await updatePackageVersion(pkgPath);
}

console.log("\n✅ Version sync complete!");
console.log("\nDon't forget to commit the changes:");
console.log("  git add -A && git commit -m 'chore: sync package versions to " + TARGET_VERSION + "'");