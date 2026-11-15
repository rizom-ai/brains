import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { QUIZ_DEPENDENCIES } from "../src";
import type { QuizPluginConfig } from "../src/config";
import { createQuizPackage } from "../src/plugin";
import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/**
 * The quiz package's plugins, as the canonical brain composes it under
 * its class's plugin id and dependencies: the quiz-result type's
 * plugin, then the quiz service.
 */
export function createQuizPlugins(config: QuizPluginConfig = {}): Plugin[] {
  return instantiatePluginPackageDefinition(
    createQuizPackage(),
    config,
    metadata,
    { pluginId: "quiz", dependencies: QUIZ_DEPENDENCIES },
  );
}

/** The quiz-result type's plugin alone, as the package installs it. */
export function createQuizResultPlugin(): Plugin {
  const [plugin] = createQuizPlugins();
  if (!plugin) throw new Error("The package installs no quiz-result plugin");
  return plugin;
}

/** The quiz service as a test drives it: its routes and its lifecycle. */
export type QuizService = Plugin & {
  getWebRoutes(): WebRouteDefinition[];
  ready(): Promise<void>;
  shutdown(): Promise<void>;
};

function asService(plugin: Plugin | undefined): QuizService {
  if (!plugin?.getWebRoutes || !plugin.ready || !plugin.shutdown)
    throw new Error("The package installs no service plugin");
  const { getWebRoutes, ready, shutdown } = plugin;
  return Object.assign(plugin, {
    getWebRoutes: (): WebRouteDefinition[] => getWebRoutes.call(plugin),
    ready: (): Promise<void> => ready.call(plugin),
    shutdown: (): Promise<void> => shutdown.call(plugin),
  });
}

/** The quiz service alone, as the package installs it. */
export function createQuizPlugin(config: QuizPluginConfig = {}): QuizService {
  const [, plugin] = createQuizPlugins(config);
  return asService(plugin);
}

/** The package's two plugins, the service as a test drives it. */
export function createQuizPluginPair(
  config: QuizPluginConfig = {},
): [Plugin, QuizService] {
  const [entity, service] = createQuizPlugins(config);
  if (!entity) throw new Error("The package installs no quiz-result plugin");
  return [entity, asService(service)];
}
