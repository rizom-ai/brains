/**
 * Testing a package on the runtime itself: a brain started in the test's own
 * process, on its own services and storage, running the package under test.
 */

import {
  startTestBrain as startTestBrainFor,
  type TestBrain,
  type TestBrainOptions,
} from "@brains/app/testing";
import pkg from "../../package.json" with { type: "json" };

export type {
  TestBrain,
  TestBrainOptions,
  TestToolResult,
} from "@brains/app/testing";

/**
 * Start a brain that runs the given packages, as the package in the working
 * directory: its `package.json` names them, and its `@rizom/brain` peer range
 * must admit this brain. The brain keeps its storage apart from the package
 * and reaches no AI provider. Stop it with `stop()`, which deletes what it
 * stored.
 */
export function startTestBrain(options: TestBrainOptions): Promise<TestBrain> {
  return startTestBrainFor(options, {
    brainVersion: pkg.version,
    directory: process.cwd(),
  });
}
