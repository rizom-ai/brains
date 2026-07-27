import { toYaml } from "@brains/utils/yaml";
import {
  cohortSchemaV2,
  pilotSchemaV2,
  type CohortConfig,
  type CohortConfigV2,
  type PilotConfig,
  type PilotConfigV2,
  type PilotPreset,
} from "./schema";

interface PreparedSelection {
  bundles: PilotConfigV2["bundles"];
  add?: string[] | undefined;
  remove?: string[] | undefined;
}

const roverDefaultRemovals = [
  "series",
  "portfolio",
  "content-pipeline",
  "social-media",
  "newsletter",
  "stock-photo",
];

function selectionForPreset(preset: PilotPreset): PreparedSelection {
  if (preset === "core") {
    return { bundles: ["core"] };
  }
  if (preset === "default") {
    return {
      bundles: ["core", "site", "publishing"],
      add: ["obsidian-vault"],
      remove: [...roverDefaultRemovals],
    };
  }
  return {
    bundles: ["core", "site", "publishing"],
    add: ["obsidian-vault"],
  };
}

/** Convert v1 pilot defaults to an opt-in v2 preview value. */
export function migratePilotConfigV2(pilot: PilotConfig): PilotConfigV2 {
  const selection = selectionForPreset(pilot.preset);
  return pilotSchemaV2.parse({
    schemaVersion: 2,
    brainVersion: pilot.brainVersion,
    ...selection,
    githubOrg: pilot.githubOrg,
    contentRepoPrefix: pilot.contentRepoPrefix,
    domainSuffix: pilot.domainSuffix,
    aiApiKey: pilot.aiApiKey,
    gitSyncToken: pilot.gitSyncToken,
    contentRepoAdminToken: pilot.contentRepoAdminToken,
    agePublicKey: pilot.agePublicKey,
  });
}

/** Convert a v1 cohort override without changing membership or secret selectors. */
export function migrateCohortConfigV2(cohort: CohortConfig): CohortConfigV2 {
  const selection = cohort.presetOverride
    ? selectionForPreset(cohort.presetOverride)
    : undefined;
  return cohortSchemaV2.parse({
    members: [...cohort.members],
    ...(cohort.brainVersionOverride
      ? { brainVersionOverride: cohort.brainVersionOverride }
      : {}),
    ...(selection
      ? {
          bundlesOverride: selection.bundles,
          ...(selection.add ? { addOverride: selection.add } : {}),
          ...(selection.remove ? { removeOverride: selection.remove } : {}),
        }
      : {}),
    ...(cohort.aiApiKeyOverride
      ? { aiApiKeyOverride: cohort.aiApiKeyOverride }
      : {}),
    ...(cohort.gitSyncTokenOverride
      ? { gitSyncTokenOverride: cohort.gitSyncTokenOverride }
      : {}),
  });
}

export function renderPilotConfigV2(config: PilotConfigV2): string {
  return toYaml(pilotSchemaV2.parse(config));
}

export function renderCohortConfigV2(config: CohortConfigV2): string {
  return toYaml(cohortSchemaV2.parse(config));
}
