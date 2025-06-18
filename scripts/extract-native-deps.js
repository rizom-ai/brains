#!/usr/bin/env bun
// Script to extract versions of native dependencies from node_modules

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// List of native modules we need to mark as external
const NATIVE_MODULES = [
  '@libsql/client',
  'libsql', 
  '@matrix-org/matrix-sdk-crypto-nodejs'
];

function findNodeModules() {
  // Check common locations
  const locations = [
    join(process.cwd(), 'node_modules'),
    join(process.cwd(), '../../node_modules'),
    join(process.cwd(), '../../../node_modules')
  ];
  
  for (const loc of locations) {
    if (existsSync(loc)) {
      return loc;
    }
  }
  
  throw new Error('Could not find node_modules directory');
}

function getPackageVersion(nodeModulesPath, packageName) {
  const packageJsonPath = join(nodeModulesPath, packageName, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    console.warn(`Warning: ${packageName} not found in node_modules`);
    return null;
  }
  
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    console.error(`Error reading ${packageName}/package.json:`, error.message);
    return null;
  }
}

function generateMinimalPackageJson(appName, appVersion, verbose = false) {
  const nodeModulesPath = findNodeModules();
  if (verbose) {
    console.log(`Found node_modules at: ${nodeModulesPath}`);
  }
  
  const dependencies = {};
  
  for (const moduleName of NATIVE_MODULES) {
    const version = getPackageVersion(nodeModulesPath, moduleName);
    if (version) {
      dependencies[moduleName] = version;
      if (verbose) {
        console.log(`  ${moduleName}: ${version}`);
      }
    }
  }
  
  return {
    name: appName,
    version: appVersion,
    type: 'module',
    dependencies
  };
}

// Main execution
if (import.meta.main) {
  const appName = process.argv[2] || 'personal-brain';
  const appVersion = process.argv[3] || '0.1.0';
  
  try {
    const packageJson = generateMinimalPackageJson(appName, appVersion);
    // Output only the JSON for easier parsing
    console.log(JSON.stringify(packageJson, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

export { generateMinimalPackageJson, NATIVE_MODULES };