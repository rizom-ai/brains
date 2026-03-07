#!/usr/bin/env bun
import { resolve, handleCLI } from "@brains/app";
import definition from "@brains/team";

const config = resolve(definition, process.env);

// If this file is run directly, handle CLI and run the app
if (import.meta.main) {
  handleCLI(config);
}

export default config;
