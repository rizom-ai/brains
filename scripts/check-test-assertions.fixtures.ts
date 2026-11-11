/**
 * Sources the test-assertion check scans in its unit cases.
 *
 * They live outside `*.test.ts` so no sweep that reads test files as text
 * mistakes them for real tests.
 */

/** A constructed value whose only assertion is that it exists. */
export const constructsThenExists: string = [
  `describe("suite", () => {`,
  `  it("is instantiable", () => {`,
  `    const service = new TopicService(entityService, logger);`,
  ``,
  `    expect(service).toBeDefined();`,
  `  });`,
  `});`,
].join("\n");

/** A factory result whose only assertion is that it exists. */
export const createsThenExists: string = [
  `describe("suite", () => {`,
  `  it("creates a context", () => {`,
  `    const context = createEntityPluginContext(shell, "topics");`,
  `    expect(context).toBeTruthy();`,
  `    expect(context).not.toBeUndefined();`,
  `  });`,
  `});`,
].join("\n");

/** A value constructed in a hook, checked for existence in the test. */
export const constructsInHookThenExists: string = [
  `describe("suite", () => {`,
  `  let plugin: TopicsPlugin;`,
  ``,
  `  beforeEach(() => {`,
  `    plugin = new TopicsPlugin();`,
  `  });`,
  ``,
  `  it("should be instantiable", () => {`,
  `    expect(plugin).toBeDefined();`,
  `  });`,
  `});`,
].join("\n");

/** A looked-up value can be absent, so its existence is a real claim. */
export const looksUpThenExists: string = [
  `describe("suite", () => {`,
  `  it("registers the topic adapter", () => {`,
  `    const registry = createRegistry();`,
  `    registry.register("topic", adapter);`,
  `    const found = registry.get("topic");`,
  `    expect(found).toBeDefined();`,
  `  });`,
  `});`,
].join("\n");

/** A constructed value with a real assertion besides its existence. */
export const constructsThenAssertsBehavior: string = [
  `describe("suite", () => {`,
  `  it("names the plugin", () => {`,
  `    const plugin = new TopicsPlugin();`,
  `    expect(plugin).toBeDefined();`,
  `    expect(plugin.id).toBe("topics");`,
  `  });`,
  `});`,
].join("\n");
