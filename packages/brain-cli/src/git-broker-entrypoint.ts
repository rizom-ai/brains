#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import type { CommandResult } from "./lib/command-result";
import { runGitBrokerChild } from "./lib/git-broker-child";

const brokerConfigSchema = z.object({
  plugins: z.object({ "directory-sync": z.unknown().optional() }).optional(),
});

const cwd = process.cwd();
const config = brokerConfigSchema.parse(
  fromYaml<unknown>(readFileSync(join(cwd, "brain.yaml"), "utf8")),
);
const result = await runGitBrokerChild(cwd, config).catch(
  (error: unknown): CommandResult => ({
    success: false,
    message: `Git broker failed: ${getErrorMessage(error)}`,
    exitCode: 1,
  }),
);

if (!result.success && result.message) console.error(result.message);
process.exit(result.success ? 0 : (result.exitCode ?? 1));
