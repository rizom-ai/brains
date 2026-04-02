import type { Plugin } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { skillEntitySchema, type SkillEntity } from "../schemas/skill";
import { SkillAdapter } from "../adapters/skill-adapter";
import packageJson from "../../package.json";

const skillAdapter = new SkillAdapter();

export class SkillPlugin extends EntityPlugin<SkillEntity> {
  readonly entityType = "skill";
  readonly schema = skillEntitySchema;
  readonly adapter = skillAdapter;

  constructor() {
    super("skill", packageJson);
  }
}

export function skillPlugin(): Plugin {
  return new SkillPlugin();
}
