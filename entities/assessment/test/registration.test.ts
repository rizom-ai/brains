import { describe, expect, it } from "bun:test";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import type { AssessmentConfigInput } from "../src";
import { createAssessmentPlugins } from "./assessment-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  evals: string[];
  widgets: string[];
}

async function installed(
  config: AssessmentConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const evals: string[] = [];
  shell.registerEvalHandler = (pluginId: string, handlerId: string): void => {
    evals.push(`${pluginId}:${handlerId}`);
  };
  const widgets: string[] = [];
  shell
    .getMessageBus()
    .subscribe<{ id: string; pluginId: string }>(
      dashboardWidgetRegisterContract.name,
      async (message) => {
        widgets.push(`${message.payload.pluginId}:${message.payload.id}`);
        return { success: true };
      },
    );
  const plugins = createAssessmentPlugins(config);
  const capabilities = await registerAll(shell, plugins, options);
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
    broadcast: true,
  });
  return { shell, plugins, capabilities, evals, widgets };
}

function rules(capabilities: PluginCapabilities[]): string[] {
  return capabilities.flatMap(({ projectionRules }) =>
    (projectionRules ?? []).map(
      ({ id, version, sources }) =>
        `${id}@${version} <- ${sources.flatMap(({ types }) => types).join(",") || "nothing"}`,
    ),
  );
}

/**
 * What the assessment capability registers, pinned as the swot entity
 * plugin class registered it: brains read the SWOT by its type, the
 * scheduler derives it by the swot-derivation rule, the Dashboard shows it
 * as swot:swot and evals measure it through swot:deriveSwot.
 */
describe("the assessment capability's registered surface", () => {
  it("is the swot plugin, with no tools, resources, instructions, templates, data sources, jobs or routes", async () => {
    const { shell, plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["swot", "entity", "@brains/assessment", []]]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(
      capabilities.flatMap(({ instructions }) =>
        instructions === undefined ? [] : [instructions],
      ),
    ).toEqual([]);
    expect([...shell.getTemplates().keys()]).toEqual([]);
    expect(shell.getDataSourceRegistry().list()).toEqual([]);
    expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers the swot type as a system type out of projections, with no action policy of its own", async () => {
    const { shell, plugins } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["swot"]);
    expect(registry.getEntityTypeConfig("swot")).toMatchObject({
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(
      plugins.flatMap((plugin) =>
        plugin instanceof EntityPlugin && plugin.entityActionPolicy
          ? [plugin.entityActionPolicy]
          : [],
      ),
    ).toEqual([]);
  });

  it("derives the SWOT by the swot-derivation rule, scheduled only with derivation on", async () => {
    for (const executionOnly of [false, true]) {
      expect(
        rules((await installed({}, { executionOnly })).capabilities),
      ).toEqual(["swot-derivation@1 <- agent,skill"]);
      // Off, the rule names no sources: nothing derives the SWOT in the
      // background, as main registered no rule, and its eval still runs it.
      expect(
        rules(
          (await installed({ enableSwotDerivation: false }, { executionOnly }))
            .capabilities,
        ),
      ).toEqual(["swot-derivation@1 <- nothing"]);
    }
  });

  it("registers its eval and widget in the main process only, derivation on or off", async () => {
    for (const config of [{}, { enableSwotDerivation: false }]) {
      const main = await installed(config);
      expect(main.evals).toEqual(["swot:deriveSwot"]);
      expect(main.widgets).toEqual(["swot:swot"]);
    }
    const worker = await installed({}, { executionOnly: true });
    expect(worker.evals).toEqual([]);
    expect(worker.widgets).toEqual([]);
  });
});
