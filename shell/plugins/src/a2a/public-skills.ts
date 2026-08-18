import type { IShell } from "../interfaces";
import { skillDataSchema } from "./skill-data-schema";

const MAX_PUBLIC_CARD_SKILLS = 100;

export interface PublicSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

export interface IPublicSkillsNamespace {
  /** Public skill entities, or public tools when no valid skill entity exists. */
  list(): Promise<PublicSkill[]>;
}

function normalizeSkillId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
  return normalized.length > 0 ? normalized : "skill";
}

export function createPublicSkillsNamespace(
  shell: IShell,
): IPublicSkillsNamespace {
  return {
    async list(): Promise<PublicSkill[]> {
      const entityService = shell.getEntityService();
      if (entityService.hasEntityType("skill")) {
        try {
          const entities = await entityService.listEntities({
            entityType: "skill",
            options: { filter: { visibilityScope: "public" } },
          });
          const skills = entities
            .map((entity) => skillDataSchema.safeParse(entity.metadata))
            .filter((result) => result.success)
            .map(({ data }) => ({
              id: normalizeSkillId(data.name),
              name: data.name,
              description: data.description,
              tags: data.tags,
              examples: data.examples,
            }));
          if (skills.length > 0) {
            return skills.slice(0, MAX_PUBLIC_CARD_SKILLS);
          }
        } catch {
          // A card can still advertise public tools if skill storage is unavailable.
        }
      }

      return shell
        .listToolsForPermissionLevel("public")
        .map((tool) => ({
          id: tool.name,
          name: tool.name,
          description: tool.description,
          tags: [],
          examples: [],
        }))
        .slice(0, MAX_PUBLIC_CARD_SKILLS);
    },
  };
}
