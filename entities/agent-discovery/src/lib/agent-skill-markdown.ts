import { z } from "@brains/utils";
import { agentSkillSchema, type AgentSkill } from "../schemas/agent";

const agentSkillsSchema = z.array(agentSkillSchema);

export function formatAgentSkills(value: unknown): string {
  const result = agentSkillsSchema.safeParse(value);
  if (!result.success || result.data.length === 0) return "";

  return result.data
    .map((skill) => {
      const tags = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
      return `- ${skill.name}: ${skill.description}${tags}`;
    })
    .join("\n");
}

export function parseAgentSkills(text: string): AgentSkill[] {
  if (!text.trim()) return [];

  const skills: AgentSkill[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^- (.+?): (.+?)(?:\s+\[(.+?)\])?$/);
    if (!match) continue;

    const name = match[1] ?? "";
    const description = match[2] ?? "";
    const tagsStr = match[3];
    const tags = tagsStr
      ? tagsStr
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
    skills.push({ name, description, tags });
  }

  return skills;
}
