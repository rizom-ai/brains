import { describe, expect, it } from "bun:test";
import {
  CliUsageError,
  buildParseArgsOptions,
  createCommandRegistry,
  defineCommand,
  getBooleanFlag,
  getStringFlag,
  parseCliArgs,
  renderCommandFlagSections,
  renderCommandList,
  renderFlagList,
  renderHelp,
  renderUsage,
  resolveSubcommand,
  type CommandDefinition,
  type FlagDefinition,
  type FlagDefinitions,
} from "../src/cli-kit";

interface TestResult {
  ok: boolean;
  detail?: string | undefined;
}

const pushToFlag: FlagDefinition = {
  type: "string",
  placeholder: "<target>",
  description: "Push target (`gh` or `bitwarden`)",
};

const dryRunFlag: FlagDefinition = {
  type: "boolean",
  description: "Show what would happen without writing",
};

const globalFlags: FlagDefinitions = {
  help: { type: "boolean", short: "h", description: "Show help" },
  version: { type: "boolean", short: "v", description: "Show version" },
};

const initCommand: CommandDefinition<string[], TestResult> = defineCommand({
  name: "init",
  usage: "<repo>",
  description: "Create a repo skeleton",
  run: ({ args }, log): TestResult => {
    log.push(`init:${args[0] ?? ""}`);
    return { ok: true };
  },
});

const certBootstrap: CommandDefinition<string[], TestResult> = defineCommand({
  name: "cert:bootstrap",
  usage: "<repo>",
  description: "Issue an origin certificate",
  flags: { "push-to": pushToFlag },
  run: ({ flags }, log): TestResult => {
    log.push(`cert:${getStringFlag(flags, "push-to") ?? "none"}`);
    return { ok: true };
  },
});

const sshBootstrap: CommandDefinition<string[], TestResult> = defineCommand({
  name: "ssh-key:bootstrap",
  usage: "<repo>",
  description: "Bootstrap a deploy SSH key",
  flags: { "push-to": pushToFlag },
  run: (): TestResult => ({ ok: true }),
});

const secretsPush: CommandDefinition<string[], TestResult> = defineCommand({
  name: "secrets:push",
  usage: "<repo>",
  description: "Push env-backed secrets",
  flags: { "push-to": pushToFlag, "dry-run": dryRunFlag },
  run: ({ flags }): TestResult => ({
    ok: true,
    detail: getBooleanFlag(flags, "dry-run") ? "dry" : "wet",
  }),
});

const commands = [initCommand, certBootstrap, sshBootstrap, secretsPush];

describe("defineCommand", () => {
  it("returns the definition unchanged", () => {
    expect(initCommand.name).toBe("init");
    expect(initCommand.usage).toBe("<repo>");
  });
});

describe("buildParseArgsOptions", () => {
  it("derives node:util parseArgs options from command and global flags", () => {
    const options = buildParseArgsOptions(commands, globalFlags);

    expect(options["help"]).toEqual({ type: "boolean", short: "h" });
    expect(options["version"]).toEqual({ type: "boolean", short: "v" });
    expect(options["push-to"]).toEqual({ type: "string" });
    expect(options["dry-run"]).toEqual({ type: "boolean" });
  });

  it("carries flag defaults through", () => {
    const options = buildParseArgsOptions([
      defineCommand<string[], TestResult>({
        name: "serve",
        description: "Serve",
        flags: {
          port: { type: "string", description: "Port", default: "8080" },
        },
        run: (): TestResult => ({ ok: true }),
      }),
    ]);

    expect(options["port"]).toEqual({ type: "string", default: "8080" });
  });

  it("accepts the same flag shape reused across commands", () => {
    expect(() => buildParseArgsOptions(commands)).not.toThrow();
  });

  it("rejects conflicting definitions of the same flag", () => {
    const conflicting = defineCommand<string[], TestResult>({
      name: "other",
      description: "Other",
      flags: { "push-to": { type: "boolean", description: "Conflicts" } },
      run: (): TestResult => ({ ok: true }),
    });

    expect(() => buildParseArgsOptions([...commands, conflicting])).toThrow(
      /push-to/,
    );
  });
});

describe("parseCliArgs", () => {
  it("splits command, positional args, and flags", () => {
    const parsed = parseCliArgs(
      ["secrets:push", "my-repo", "--push-to", "gh", "--dry-run"],
      { commands, globalFlags },
    );

    expect(parsed.command).toBe("secrets:push");
    expect(parsed.args).toEqual(["my-repo"]);
    expect(parsed.flags["push-to"]).toBe("gh");
    expect(parsed.flags["dry-run"]).toBe(true);
  });

  it("defaults to help when no arguments are given", () => {
    const parsed = parseCliArgs([], { commands, globalFlags });
    expect(parsed.command).toBe("help");
    expect(parsed.args).toEqual([]);
  });

  it("routes --help and -h to the help command", () => {
    expect(parseCliArgs(["--help"], { commands, globalFlags }).command).toBe(
      "help",
    );
    expect(
      parseCliArgs(["list", "-h"], { commands, globalFlags }).command,
    ).toBe("help");
  });

  it("routes --version and -v to the version command", () => {
    expect(parseCliArgs(["--version"], { commands, globalFlags }).command).toBe(
      "version",
    );
    expect(parseCliArgs(["-v"], { commands, globalFlags }).command).toBe(
      "version",
    );
  });

  it("throws CliUsageError for unknown flags in strict mode", () => {
    expect(() =>
      parseCliArgs(["init", "--nope"], { commands, globalFlags }),
    ).toThrow(CliUsageError);
    expect(() =>
      parseCliArgs(["init", "--nope"], { commands, globalFlags }),
    ).toThrow(/--nope/);
  });

  it("tolerates and drops unknown flags when strict is false", () => {
    const parsed = parseCliArgs(["build", "--experimental"], {
      commands,
      globalFlags,
      strict: false,
    });

    expect(parsed.command).toBe("build");
    expect(parsed.flags["experimental"]).toBeUndefined();
  });
});

describe("renderCommandList", () => {
  it("aligns descriptions after the widest name/usage label", () => {
    const lines = renderCommandList(commands);

    expect(lines).toContain(
      "  init <repo>               Create a repo skeleton",
    );
    expect(lines).toContain(
      "  ssh-key:bootstrap <repo>  Bootstrap a deploy SSH key",
    );
  });
});

describe("renderFlagList", () => {
  it("renders placeholders, shorts, and descriptions", () => {
    const lines = renderFlagList({
      ...globalFlags,
      "push-to": pushToFlag,
      "dry-run": dryRunFlag,
    });

    expect(lines.some((line) => line.includes("--help, -h"))).toBe(true);
    expect(lines.some((line) => line.includes("--push-to <target>"))).toBe(
      true,
    );
    expect(
      lines.some(
        (line) =>
          line.includes("--dry-run") &&
          line.includes("Show what would happen without writing"),
      ),
    ).toBe(true);
  });
});

describe("renderUsage", () => {
  it("formats a usage line from the command definition", () => {
    expect(renderUsage("brains-ops", initCommand)).toBe(
      "Usage: brains-ops init <repo>",
    );
  });

  it("omits the usage suffix when the command has none", () => {
    const bare = defineCommand<string[], TestResult>({
      name: "help",
      description: "Show help",
      run: (): TestResult => ({ ok: true }),
    });
    expect(renderUsage("brain", bare)).toBe("Usage: brain help");
  });
});

describe("renderCommandFlagSections", () => {
  it("groups commands that share an identical flag set", () => {
    const sections = renderCommandFlagSections(commands).join("\n");

    expect(sections).toContain("cert:bootstrap / ssh-key:bootstrap options:");
    expect(sections).toContain("secrets:push options:");
    expect(sections).not.toContain("init options:");
  });
});

describe("renderHelp", () => {
  it("composes intro, usage, command list, and options", () => {
    const help = renderHelp({
      cliName: "brains-ops",
      intro: "brains-ops — operator CLI",
      commands,
      globalFlags,
    });

    expect(help).toContain("brains-ops — operator CLI");
    expect(help).toContain("Usage: brains-ops <command> [args]");
    expect(help).toContain("Commands:");
    expect(help).toContain("init <repo>");
    expect(help).toContain("Options:");
    expect(help).toContain("--help, -h");
    expect(help).toContain("secrets:push options:");
  });
});

describe("createCommandRegistry", () => {
  it("dispatches by command name", async () => {
    const registry = createCommandRegistry(commands);
    const log: string[] = [];

    const command = registry.get("cert:bootstrap");
    expect(command).toBeDefined();
    const result = await command?.run(
      { args: ["repo"], flags: { "push-to": "gh" } },
      log,
    );

    expect(result).toEqual({ ok: true });
    expect(log).toEqual(["cert:gh"]);
  });

  it("rejects duplicate command names", () => {
    expect(() => createCommandRegistry([initCommand, initCommand])).toThrow(
      /init/,
    );
  });
});

describe("resolveSubcommand", () => {
  it("keeps directly registered commands as-is", () => {
    const registry = createCommandRegistry(commands);
    expect(resolveSubcommand(registry, "init", ["my-repo"])).toEqual({
      name: "init",
      args: ["my-repo"],
    });
  });

  it("collapses space-form subcommands onto colon-form names", () => {
    const registry = createCommandRegistry(commands);
    expect(resolveSubcommand(registry, "cert", ["bootstrap"])).toEqual({
      name: "cert:bootstrap",
      args: [],
    });
  });

  it("leaves unknown commands untouched", () => {
    const registry = createCommandRegistry(commands);
    expect(resolveSubcommand(registry, "list", ["post"])).toEqual({
      name: "list",
      args: ["post"],
    });
  });
});

describe("flag accessors", () => {
  it("returns only values of the requested type", () => {
    expect(getStringFlag({ a: "x", b: true }, "a")).toBe("x");
    expect(getStringFlag({ a: "x", b: true }, "b")).toBeUndefined();
    expect(getBooleanFlag({ a: "x", b: true }, "b")).toBe(true);
    expect(getBooleanFlag({ a: "x", b: true }, "a")).toBeUndefined();
    expect(getStringFlag({}, "missing")).toBeUndefined();
  });
});
