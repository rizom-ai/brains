import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils/zod";

/**
 * The markdown body of an agent file: an About section, one skill per
 * `- Name: Description [tag, tag]` line under Skills, and Notes.
 */
export const agentBodySkillSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

export type AgentBodySkill = z.output<typeof agentBodySkillSchema>;

/** A hand-written body may leave out any section; the others still count. */
export const agentBodySchema: z.ZodObject<{
  about: z.ZodDefault<z.ZodString>;
  skills: z.ZodDefault<z.ZodArray<typeof agentBodySkillSchema>>;
  notes: z.ZodDefault<z.ZodString>;
}> = z.object({
  about: z.string().default(""),
  skills: z.array(agentBodySkillSchema).default([]),
  notes: z.string().default(""),
});

export type AgentBody = z.output<typeof agentBodySchema>;

const SKILL_LINE = /^- (.+?): (.+?)(?:\s+\[(.+?)\])?$/;

function formatSkills(value: unknown): string {
  const parsed = z.array(agentBodySkillSchema).safeParse(value);
  if (!parsed.success) return "";

  return parsed.data
    .map((skill) => {
      const tags = skill.tags.length > 0 ? ` [${skill.tags.join(", ")}]` : "";
      return `- ${skill.name}: ${skill.description}${tags}`;
    })
    .join("\n");
}

function parseSkills(text: string): AgentBodySkill[] {
  return text.split("\n").flatMap((line) => {
    const match = line.match(SKILL_LINE);
    if (!match) return [];
    const tags = (match[3] ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    return [{ name: match[1] ?? "", description: match[2] ?? "", tags }];
  });
}

const bodyFormatter = new StructuredContentFormatter<AgentBody>(
  agentBodySchema,
  {
    title: "Agent",
    mappings: [
      { key: "about", label: "About", type: "string" },
      {
        key: "skills",
        label: "Skills",
        type: "custom",
        formatter: formatSkills,
        parser: parseSkills,
      },
      { key: "notes", label: "Notes", type: "string" },
    ],
  },
);

export function formatAgentBody(body: AgentBody): string {
  return bodyFormatter.format(body);
}

/**
 * Read an agent file's body. A blank body, or one that does not parse,
 * yields an empty profile rather than a broken entity; the agent is still
 * listed and can be re-fetched.
 */
export function parseAgentBody(body: string): AgentBody {
  if (!body.trim()) return agentBodySchema.parse({});
  try {
    return bodyFormatter.parse(body);
  } catch {
    return agentBodySchema.parse({});
  }
}
