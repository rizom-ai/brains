import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils/string-utils";
import { playbookBodyFormatter } from "../formatters/playbook-formatter";
import {
  playbookFrontmatterSchema,
  playbookSchema,
  type PlaybookBody,
  type PlaybookEntity,
  type PlaybookFrontmatter,
  type PlaybookMetadata,
} from "../schemas/playbook";
import { assertValidPlaybookBody } from "../validation";

export class PlaybookAdapter extends BaseEntityAdapter<
  PlaybookEntity,
  PlaybookMetadata
> {
  constructor() {
    super({
      entityType: "playbook",
      purpose:
        "A guided multi-step workflow the assistant runs together with the user.",
      schema: playbookSchema,
      frontmatterSchema: playbookFrontmatterSchema,
    });
  }

  public createPlaybookContent(
    frontmatter: PlaybookFrontmatter,
    body: PlaybookBody,
  ): string {
    return this.buildMarkdown(playbookBodyFormatter.format(body), frontmatter);
  }

  public parsePlaybookContent(content: string): {
    frontmatter: PlaybookFrontmatter;
    body: PlaybookBody;
    bodyMarkdown: string;
  } {
    const raw = this.parseFrontMatter(content, playbookFrontmatterSchema);
    const bodyMarkdown = this.extractBody(content).trim();
    const body = hasAuthoredSteps(bodyMarkdown)
      ? parseAuthoredStepsBody(bodyMarkdown)
      : playbookBodyFormatter.parse(bodyMarkdown);
    assertValidPlaybookBody(body);
    return {
      frontmatter: playbookFrontmatterSchema.parse(raw),
      body,
      bodyMarkdown,
    };
  }

  public fromMarkdown(markdown: string): Partial<PlaybookEntity> {
    const { frontmatter } = this.parsePlaybookContent(markdown);
    return {
      content: markdown,
      entityType: "playbook",
      metadata: {
        title: frontmatter.title,
        status: frontmatter.status,
        audience: frontmatter.audience,
        ...(frontmatter.trigger ? { trigger: frontmatter.trigger } : {}),
        ...(frontmatter.lifecycle ? { lifecycle: frontmatter.lifecycle } : {}),
        ...(frontmatter.once !== undefined ? { once: frontmatter.once } : {}),
        ...(frontmatter.starterText
          ? { starterText: frontmatter.starterText }
          : {}),
        ...(frontmatter.description
          ? { description: frontmatter.description }
          : {}),
        ...(frontmatter.starterPrompt
          ? { starterPrompt: frontmatter.starterPrompt }
          : {}),
        completionMode: frontmatter.completionMode,
      },
    };
  }
}

export const playbookAdapter = new PlaybookAdapter();

interface AuthoredStep {
  title: string;
  id: string;
  prompt?: string | undefined;
  requiredDetails: string[];
  instructions: string[];
  doneWhen: string[];
  choices: Array<{ label: string; target: string }>;
  skip?: { label: string; target: string } | undefined;
}

function hasAuthoredSteps(markdown: string): boolean {
  return /^##\s+Steps\s*$/im.test(markdown);
}

function parseAuthoredStepsBody(markdown: string): PlaybookBody {
  const steps = parseAuthoredSteps(extractHeadingSection(markdown, "Steps"));
  if (steps.length === 0) {
    throw new Error("Playbook must declare at least one step.");
  }

  const states = steps.map((step, index) => {
    const isTerminal = index === steps.length - 1;
    if (
      !isTerminal &&
      step.doneWhen.length === 0 &&
      step.choices.length === 0 &&
      !step.skip
    ) {
      throw new Error(
        `Playbook step '${step.title}' must declare Done when, Choices, or Skip.`,
      );
    }

    return {
      id: step.id,
      title: step.title,
      ...(step.prompt ? { prompt: step.prompt } : {}),
      requiredDetails: step.requiredDetails,
      instructions: step.instructions,
      doneWhen: step.doneWhen,
      transitions: [
        ...(step.doneWhen.length > 0 && !isTerminal
          ? [{ event: "NEXT", target: steps[index + 1]?.id ?? step.id }]
          : []),
        ...step.choices.map((choice, choiceIndex) => ({
          event: `CHOICE_${choiceIndex + 1}`,
          target: slugify(choice.target),
          operatorAction: true,
          label: choice.label,
        })),
        ...(step.skip
          ? [
              {
                event: "SKIP",
                target: slugify(step.skip.target),
                operatorAction: true,
                label: step.skip.label,
              },
            ]
          : []),
      ],
    };
  });

  return {
    purpose: textSection(markdown, "Purpose"),
    operatingRules: listSection(markdown, "Operating Rules"),
    initialState: steps[0]?.id ?? "",
    states,
    finalStates: [steps.at(-1)?.id ?? ""],
    nextPrompts: listSection(markdown, "Next Prompts"),
  };
}

function parseAuthoredSteps(stepsMarkdown: string): AuthoredStep[] {
  const blocks: Array<{ title: string; content: string[] }> = [];
  let current: { title: string; content: string[] } | undefined;

  for (const line of stepsMarkdown.split(/\r?\n/)) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      current = { title: heading[1] ?? "", content: [] };
      blocks.push(current);
      continue;
    }
    current?.content.push(line);
  }

  return blocks.map((block) => {
    const content = block.content.join("\n");
    return {
      title: block.title,
      id: slugify(block.title),
      ...(prefixedLine(content, "Say")
        ? { prompt: prefixedLine(content, "Say") }
        : {}),
      requiredDetails: labelledList(content, "Required details"),
      instructions: labelledList(content, "To do"),
      doneWhen: labelledList(content, "Done when"),
      choices: labelledChoices(content, "Choices"),
      ...(parseSkip(content) ? { skip: parseSkip(content) } : {}),
    };
  });
}

function extractHeadingSection(markdown: string, label: string): string {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${label.toLowerCase()}`,
  );
  if (startIndex === -1) return "";
  const body: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^##\s+/.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

function textSection(markdown: string, label: string): string {
  return extractHeadingSection(markdown, label)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .join("\n")
    .trim();
}

function listSection(markdown: string, label: string): string[] {
  return extractListItems(extractHeadingSection(markdown, label));
}

function prefixedLine(markdown: string, label: string): string | undefined {
  const regex = new RegExp(`^${escapeRegExp(label)}:\\s*(.+?)\\s*$`, "im");
  const match = regex.exec(markdown);
  return match?.[1]?.trim();
}

function labelledList(markdown: string, label: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const startIndex = lines.findIndex(
    (line) => line.trim().toLowerCase() === `${label.toLowerCase()}:`,
  );
  if (startIndex === -1) return [];
  const listLines: string[] = [];
  for (const line of lines.slice(startIndex + 1)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^[A-Za-z][A-Za-z ]+:/.test(trimmed) || /^#{1,6}\s+/.test(trimmed)) {
      break;
    }
    listLines.push(line);
  }
  return extractListItems(listLines.join("\n"));
}

function labelledChoices(
  markdown: string,
  label: string,
): Array<{ label: string; target: string }> {
  return labelledList(markdown, label).map(parseChoiceLine);
}

function parseChoiceLine(line: string): { label: string; target: string } {
  const match = /^(.+?)\s*(?:→|->)\s*(.+)$/.exec(line);
  if (!match) {
    throw new Error(
      `Invalid playbook choice '${line}'. Expected "Label → Step".`,
    );
  }
  return { label: match[1]?.trim() ?? "", target: match[2]?.trim() ?? "" };
}

function parseSkip(
  markdown: string,
): { label: string; target: string } | undefined {
  const match = /^Skip:\s*(.+?)\s*(?:→|->)\s*(.+?)\s*$/im.exec(markdown);
  if (!match) return undefined;
  return { label: match[1]?.trim() ?? "", target: match[2]?.trim() ?? "" };
}

function extractListItems(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((line) => /^-\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
