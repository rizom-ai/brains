import { existsSync } from "fs";
import { join } from "path";
import type { CommandResult } from "../run-command";
import { parseBrainYaml } from "../lib/brain-yaml";
import { getModel } from "../lib/model-registry";
import { resolveRunnerType } from "./start";

/**
 * brain diagnostics <subcommand>
 *
 * Operator-facing diagnostic tools. Not exposed via MCP or agent.
 */
export async function diagnostics(
  dir: string,
  subcommand: string,
): Promise<CommandResult> {
  if (!existsSync(join(dir, "brain.yaml"))) {
    return {
      success: false,
      message: `No brain.yaml found in ${dir}. Run 'brain init <dir>' first.`,
    };
  }

  switch (subcommand) {
    case "search":
      return searchDiagnostics(dir);
    default:
      return {
        success: false,
        message: [
          "Usage: brain diagnostics <subcommand>",
          "",
          "Subcommands:",
          "  search    Analyze search distance distribution for threshold tuning",
        ].join("\n"),
      };
  }
}

/**
 * brain diagnostics search
 *
 * Boots the brain, samples entity titles as queries, runs unfiltered
 * vector search, and outputs distance distribution statistics.
 */
async function searchDiagnostics(dir: string): Promise<CommandResult> {
  const runnerType = resolveRunnerType(dir);

  if (runnerType !== "builtin") {
    return {
      success: false,
      message:
        "Diagnostics require in-process boot. Install @rizom/brain globally.",
    };
  }

  const config = parseBrainYaml(dir);
  const definition = getModel(config.brain);

  if (!definition) {
    return {
      success: false,
      message: `Unknown model: ${config.brain}`,
    };
  }

  try {
    const { bootBrain } = await import("../lib/boot");

    // Full boot (not registerOnly) — search needs ATTACH'd embedding DB
    await bootBrain(dir, config.brain, definition, { chat: false });

    const { Shell } = await import("@brains/core");
    const shell = Shell.getInstance();
    const entityService = shell.getEntityService();

    // Wait for DB initialization
    await entityService.initialize();

    // Collect entity titles as sample queries
    const entityTypes = entityService.getEntityTypes();
    const allEntities: Array<{
      id: string;
      entityType: string;
      title: string;
    }> = [];

    for (const type of entityTypes) {
      const entities = await entityService.listEntities(type, { limit: 100 });
      for (const entity of entities) {
        const meta = entity.metadata as Record<string, unknown>;
        const title = String(meta["title"] ?? meta["name"] ?? entity.id);
        allEntities.push({
          id: entity.id,
          entityType: entity.entityType,
          title,
        });
      }
    }

    if (allEntities.length === 0) {
      await shell.shutdown();
      return { success: false, message: "No entities found" };
    }

    console.log(`\nAnalyzing ${allEntities.length} entities...\n`);

    // Sample up to 20 entities as queries
    const sampleSize = Math.min(20, allEntities.length);
    const samples = allEntities
      .sort(() => Math.random() - 0.5)
      .slice(0, sampleSize);

    const allDistances: number[] = [];
    const selfDistances: number[] = [];

    for (const sample of samples) {
      const results = await entityService.searchWithDistances(sample.title);

      for (const r of results) {
        allDistances.push(r.distance);
        if (r.entityId === sample.id && r.entityType === sample.entityType) {
          selfDistances.push(r.distance);
        }
      }
    }

    allDistances.sort((a, b) => a - b);
    selfDistances.sort((a, b) => a - b);

    const pct = (arr: number[], p: number): number => {
      if (arr.length === 0) return 0;
      const idx = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, idx)] ?? 0;
    };

    console.log("=== Search Distance Distribution ===\n");
    console.log(`Queries sampled: ${samples.length}`);
    console.log(`Total distance measurements: ${allDistances.length}`);
    console.log(`Self-match distances: ${selfDistances.length}\n`);

    console.log("All distances:");
    console.log(`  min:  ${pct(allDistances, 0).toFixed(4)}`);
    console.log(`  p25:  ${pct(allDistances, 25).toFixed(4)}`);
    console.log(`  p50:  ${pct(allDistances, 50).toFixed(4)}`);
    console.log(`  p75:  ${pct(allDistances, 75).toFixed(4)}`);
    console.log(`  p90:  ${pct(allDistances, 90).toFixed(4)}`);
    console.log(`  p95:  ${pct(allDistances, 95).toFixed(4)}`);
    console.log(`  max:  ${pct(allDistances, 100).toFixed(4)}\n`);

    console.log("Self-match distances (query = entity title):");
    console.log(`  min:  ${pct(selfDistances, 0).toFixed(4)}`);
    console.log(`  p50:  ${pct(selfDistances, 50).toFixed(4)}`);
    console.log(`  max:  ${pct(selfDistances, 100).toFixed(4)}\n`);

    // Suggest threshold
    const p75 = pct(allDistances, 75);
    const p90 = pct(allDistances, 90);
    const suggested = Number(((p75 + p90) / 2).toFixed(4));

    console.log(`Current threshold: 1.0`);
    console.log(`Suggested threshold: ${suggested}`);
    console.log(
      `  (midpoint between p75=${p75.toFixed(4)} and p90=${p90.toFixed(4)})\n`,
    );

    await shell.shutdown();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Diagnostics failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
