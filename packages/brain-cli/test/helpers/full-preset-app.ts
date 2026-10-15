import defaultSite from "@brains/site-default";
import {
  App,
  parseInstanceOverrides,
  registerPackage,
  resolve,
} from "@brains/app";
import defaultTheme from "@rizom/theme-default";
import { canonicalBrain } from "../../src/model/canonical-brain";

registerPackage("@brains/site-default", defaultSite);
registerPackage("@rizom/theme-default", defaultTheme);

export const fullPresetYaml = `brain: brain
bundleContract: capability-bundles-v1
anchor: person
kind: professional
bundles: [core, media, automation, web, chat, site, publishing, federation, team]
site:
  package: "@brains/site-default"
  theme: "@rizom/theme-default"
plugins:
  directory-sync:
    autoSync: false
    initialSync: false
    seedContent: false
`;

/** A brain with every bundle, its databases and content under one directory. */
export function createFullPresetApp(
  dataDir: string,
  presetYaml: string = fullPresetYaml,
): App {
  const config = resolve(
    canonicalBrain,
    { AI_API_KEY: "test-key" },
    parseInstanceOverrides(presetYaml),
  );
  return App.create({
    ...config,
    shellConfig: {
      ...config.shellConfig,
      database: { url: `file:${dataDir}/entities.db` },
      jobQueueDatabase: { url: `file:${dataDir}/jobs.db` },
      conversationDatabase: { url: `file:${dataDir}/conversations.db` },
      runtimeStateDatabase: { url: `file:${dataDir}/runtime-state.db` },
      embeddingDatabase: { url: `file:${dataDir}/embeddings.db` },
      embedding: { enabled: true },
      dataDir: `${dataDir}/content`,
      logging: { level: "error" },
    },
  });
}
