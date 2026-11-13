#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getErrorMessage } from "@brains/utils/error";
import { ConsoleLogger } from "@brains/utils/logger";
import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import type { CommandResult } from "./lib/command-result";
import { runGitBrokerChild } from "./lib/git-broker-child";

// This bundle is only ever the broker, and it gets no `--child=` argument to
// say so: name the role before anything can be written.
ConsoleLogger.setProcessRole("git-broker");
const logger = ConsoleLogger.getInstance();

const brokerConfigSchema = z.object({
  plugins: z.object({ "directory-sync": z.unknown().optional() }).optional(),
});

const cwd = process.cwd();
const result = await Promise.resolve()
  .then(() =>
    runGitBrokerChild(
      cwd,
      brokerConfigSchema.parse(
        fromYaml(readFileSync(join(cwd, "brain.yaml"), "utf8")),
      ),
    ),
  )
  .catch((error: unknown): CommandResult => ({
    success: false,
    message: `Git broker failed: ${getErrorMessage(error)}`,
    exitCode: 1,
  }));

if (!result.success && result.message) logger.error(result.message);
process.exit(result.success ? 0 : (result.exitCode ?? 1));
