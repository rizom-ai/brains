import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { CliUsageError } from "@brains/deploy-support/cli-kit";
import { parseArgs, parseCommandLine } from "../src/parse-args";
import { commands, globalFlags } from "../src/run-command";

function usageError(argv: string[]): string {
  try {
    parseArgs(argv);
  } catch (error) {
    if (error instanceof CliUsageError) return error.message;
    throw error;
  }
  throw new Error(`Expected brain ${argv.join(" ")} to be rejected`);
}

describe("unknown flags", () => {
  it("rejects a flag the command does not have, naming both", () => {
    const message = usageError(["start", "--cli"]);

    expect(message).toContain("--cli");
    expect(message).toContain("`brain start`");
    expect(message).toContain("`brain start --help`");
    expect(message).not.toContain("Did you mean");
  });

  it("suggests the closest flag when one is near", () => {
    expect(usageError(["start", "--startup-chek"])).toContain(
      "Did you mean --startup-check?",
    );
    expect(usageError(["secrets:push", "--dry-rn"])).toContain(
      "Did you mean --dry-run?",
    );
  });

  it("names a space-form subcommand by its registered name", () => {
    const message = usageError(["cert", "bootstrap", "--push-too", "gh"]);

    expect(message).toContain("`brain cert:bootstrap`");
    expect(message).toContain("Did you mean --push-to?");
  });

  it("rejects another command's flag", () => {
    expect(usageError(["start", "--dry-run"])).toContain("--dry-run");
    expect(usageError(["tool", "system_status", "--recipe", "team"])).toContain(
      "`brain tool`",
    );
  });

  it("rejects an unknown short flag as typed", () => {
    expect(usageError(["start", "-x"])).toContain("-x for `brain start`");
  });

  it("rejects flags a brain command cannot receive", () => {
    const message = usageError(["sync", "--full"]);

    expect(message).toContain("--full");
    expect(message).toContain("`brain sync`");
  });

  it("reaches the entrypoint as a failed result, not a crash", () => {
    const commandLine = parseCommandLine(["start", "--cli"]);

    expect(commandLine).toEqual({
      failure: { success: false, message: usageError(["start", "--cli"]) },
    });
    expect(parseCommandLine(["start"])).toEqual({
      parsed: parseArgs(["start"]),
    });
  });

  // No brain command takes an output directory: the site builder writes
  // where its plugin config says.
  it("rejects the removed --outputDir", () => {
    expect(usageError(["build", "--outputDir", "dist"])).toContain(
      "Unknown flag --outputDir for `brain build`.",
    );
  });

  it("shows help even next to an unknown flag", () => {
    expect(parseArgs(["start", "--cli", "--help"]).command).toBe("help");
  });

  it("leaves eval flags to the eval runner", () => {
    expect(parseArgs(["eval", "--compare", "--tags", "core"]).command).toBe(
      "eval",
    );
  });

  it("accepts the supervisor's child role on start, without suggesting it", () => {
    expect(parseArgs(["start", "--child=web"]).command).toBe("start");
    expect(parseArgs(["start", "--child=git-broker"]).command).toBe("start");
    expect(usageError(["chat", "--child=web"])).toContain("`brain chat`");
    expect(usageError(["start", "--chil"])).not.toContain("--child");
  });
});

describe("global flags", () => {
  const values = (name: string): string[] =>
    globalFlags[name]?.type === "string"
      ? [`--${name}`, "value"]
      : [`--${name}`];

  it("are accepted by every built-in command", () => {
    for (const command of commands) {
      for (const name of Object.keys(globalFlags)) {
        expect(() => parseArgs([command.name, ...values(name)])).not.toThrow();
      }
    }
  });

  it("are accepted by brain commands", () => {
    for (const name of Object.keys(globalFlags)) {
      expect(() => parseArgs(["build", ...values(name)])).not.toThrow();
    }
    expect(
      parseArgs(["status", "--remote", "rover.rizom.ai", "--token", "t"]).flags,
    ).toMatchObject({ remote: "rover.rizom.ai", token: "t" });
  });
});

// Whether a brain command has an environment is known only once its tool is
// found; the operate tests cover that half.
describe("--preview", () => {
  it("is a brain-command flag, not a global one", () => {
    expect(Object.keys(globalFlags)).not.toContain("preview");
    expect(parseArgs(["build", "--preview"]).flags["preview"]).toBe(true);
  });

  it("is rejected by every built-in command", () => {
    for (const command of commands.filter(({ name }) => name !== "eval")) {
      expect(usageError([command.name, "--preview"])).toContain(
        `Unknown flag --preview for \`brain ${command.name}\`.`,
      );
    }
  });
});

describe("brain command flags", () => {
  it("keep remote and token", () => {
    expect(
      parseArgs(["status", "--remote", "rover.rizom.ai", "--token", "t"]).flags,
    ).toMatchObject({ remote: "rover.rizom.ai", token: "t" });
  });
});

/** Split a documented command line into argv the way a shell would. */
function shellWords(line: string): string[] {
  const words: string[] = [];
  const pattern = /'([^']*)'|"([^"]*)"|(\S+)/g;
  for (const match of line.replace(/\s+#.*$/, "").matchAll(pattern)) {
    words.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return words;
}

interface DocSection {
  /** The commands a section's heading names, as argv; empty when none. */
  commands: string[][];
  lines: string[];
}

function docSections(markdown: string): DocSection[] {
  const sections: DocSection[] = [{ commands: [], lines: [] }];
  for (const line of markdown.split("\n")) {
    if (/^#{2,3} /.test(line)) {
      const commands = [...line.matchAll(/`brain ([^`]+)`/g)].map((match) =>
        (match[1] ?? "").split(" ").filter((word) => !/^[<[]/.test(word)),
      );
      sections.push({ commands, lines: [] });
      continue;
    }
    sections.at(-1)?.lines.push(line);
  }
  return sections;
}

describe("cli-reference.md", () => {
  const markdown = readFileSync(
    join(import.meta.dir, "..", "docs", "cli-reference.md"),
    "utf8",
  );
  const sections = docSections(markdown);

  it("every documented command line parses", () => {
    const lines = [
      ...markdown
        .split("\n")
        .filter((line) => line.startsWith("brain "))
        .map((line) => line.slice("brain ".length)),
      ...[...markdown.matchAll(/`brain ([^`<[]+)`/g)].map(
        (match) => match[1] ?? "",
      ),
    ];
    expect(lines.length).toBeGreaterThan(40);

    for (const line of lines) {
      expect(() => parseArgs(shellWords(line))).not.toThrow();
    }
  });

  it("every documented flag is accepted where its section says", () => {
    let checked = 0;
    for (const section of sections) {
      // A section without a command documents flags of brain commands.
      const targets =
        section.commands.length > 0 ? section.commands : [["build"]];
      const body = section.lines.join("\n").replace(/`brain [^`]*`/g, "");
      for (const match of body.matchAll(/`(--?[a-zA-Z][^`]*)`/g)) {
        const flag = shellWords(match[1] ?? "");
        const accepted = targets.some((target) => {
          try {
            parseArgs([...target, ...flag]);
            return true;
          } catch {
            return false;
          }
        });
        expect({ flag: flag.join(" "), accepted }).toEqual({
          flag: flag.join(" "),
          accepted: true,
        });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});
