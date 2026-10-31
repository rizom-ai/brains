import { describe, expect, it } from "bun:test";
import { runProcess } from "@brains/utils/run-process";
import {
  deployScriptNames,
  isStaleDeployMounts,
  renderDeployWorkflow,
  renderExtractBrainConfigScript,
  renderKamalDeploy,
} from "../src";
import {
  MODEL_RUNTIME_IMAGE,
  buildLocalModelPullScript,
  parseLocalModels,
} from "../src/deploy-scripts/pull-local-models";

const localModelsCondition =
  "# <% if ENV['LOCAL_MODELS'] && !ENV['LOCAL_MODELS'].empty? %>";

/** The lines between a conditional's opening and its `# <% end %>`. */
function conditionalBlocks(deploy: string): string[] {
  return deploy
    .split(localModelsCondition)
    .slice(1)
    .map((rest) => rest.slice(0, rest.indexOf("# <% end %>")));
}

describe("the model runtime accessory", () => {
  const deploy = renderKamalDeploy({ serviceName: "rover" });

  it("runs the pinned runtime image with a persistent models volume, only when the brain names local models", () => {
    const [accessory] = conditionalBlocks(deploy).filter((block) =>
      block.includes("accessories:"),
    );
    expect(accessory).toBeDefined();
    expect(accessory).toContain("  models:");
    expect(accessory).toContain(`image: ${MODEL_RUNTIME_IMAGE}`);
    expect(accessory).toContain("- /opt/brain-models:/root/.ollama");
    expect(accessory).toContain("health-cmd: ollama list");
  });

  it("gives the brain the accessory's address on the deploy network", () => {
    const [env] = conditionalBlocks(deploy).filter((block) =>
      block.includes("MODEL_RUNTIME_URL"),
    );
    expect(env).toContain("MODEL_RUNTIME_URL: http://rover-models:11434");
    expect(deploy).not.toContain("__SERVICE_NAME__");
  });

  it("keeps the mount list last, so older generated copies still reconcile", () => {
    expect(deploy.trimEnd().split("\n\n").at(-1)).toStartWith("volumes:");
  });

  it("treats a copy generated before the accessory as stale", () => {
    // The template as generated before: no conditional lines, one blank
    // line between the env secrets and the mounts.
    const beforeAccessory = deploy
      .split("\n")
      .reduce<{ lines: string[]; inside: boolean }>(
        ({ lines, inside }, line) => {
          if (line.trim() === localModelsCondition)
            return { lines, inside: true };
          if (inside) return { lines, inside: line.trim() !== "# <% end %>" };
          return { lines: [...lines, line], inside };
        },
        { lines: [], inside: false },
      )
      .lines.join("\n")
      .replace("\n\n\nvolumes:", "\n\nvolumes:");
    expect(beforeAccessory).not.toContain("LOCAL_MODELS");
    expect(isStaleDeployMounts(beforeAccessory, "rover")).toBe(true);
    expect(isStaleDeployMounts(deploy, "rover")).toBe(false);
  });
});

describe("pulling local models", () => {
  it("reads the local models the deploy names, once each", () => {
    expect(parseLocalModels(undefined)).toEqual([]);
    expect(parseLocalModels(" ")).toEqual([]);
    expect(
      parseLocalModels("embeddinggemma-2:270m, qwen3:4b embeddinggemma-2:270m"),
    ).toEqual(["embeddinggemma-2:270m", "qwen3:4b"]);
  });

  it("refuses a model name that is not a plain tag", () => {
    expect(() => parseLocalModels("gemma; rm -rf /")).toThrow(
      'Invalid local model "gemma;"',
    );
  });

  it("pulls exactly those models into the models volume with the pinned runtime", async () => {
    const script = buildLocalModelPullScript([
      "embeddinggemma-2:270m",
      "qwen3:4b",
    ]);
    expect(script).toContain("-v /opt/brain-models:/root/.ollama");
    expect(script).toContain(MODEL_RUNTIME_IMAGE);
    expect(script.match(/ollama pull /g)).toHaveLength(2);
    expect(script).toContain("ollama pull embeddinggemma-2:270m");
    expect(script).toContain("ollama pull qwen3:4b");
    expect((await runProcess(["bash", "-n"], { stdin: script })).exitCode).toBe(
      0,
    );
  });

  it("ships with the shared deploy scripts", () => {
    expect(deployScriptNames).toContain("pull-local-models.ts");
  });
});

describe("the standalone deploy", () => {
  it("derives the local models from brain.yaml", () => {
    const script = renderExtractBrainConfigScript();
    expect(script).toContain('config["embeddingModel"]');
    expect(script).toContain('file.puts("LOCAL_MODELS=#{local_models}")');
  });

  it("pulls local models before Kamal starts the brain", () => {
    const workflow = renderDeployWorkflow({
      secretNames: [],
      bootstrapSecrets: [],
    });
    const pull = workflow.indexOf("deploy/scripts/pull-local-models.ts");
    expect(pull).toBeGreaterThan(-1);
    expect(pull).toBeLessThan(workflow.indexOf("kamal setup --skip-push"));
  });
});
