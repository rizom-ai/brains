/**
 * Sources the mutated-assertion-reads guard scans in its unit cases.
 *
 * They live outside `*.test.ts` because the guard's own repository-wide sweep
 * reads every tracked test file as text: fixtures written inline would be
 * indistinguishable from real assertions and the sweep would flag itself.
 */

/** A field read back after an asymmetric matcher replaced it. */
export const readsReplacedField: string = [
  `describe("suite", () => {`,
  `  it("registers", async () => {`,
  `    const options = await response.json();`,
  `    expect(options).toMatchObject({ challenge: expect.any(String) });`,
  `    await verify({ challenge: options.challenge });`,
  `  });`,
  `});`,
].join("\n");

/** The same hazard reached through destructuring. */
export const destructuresReplacedField: string = [
  `describe("suite", () => {`,
  `  it("issues a token", () => {`,
  `    expect(session).toMatchObject({ token: expect.any(String) });`,
  `    const { token } = session;`,
  `    use(token);`,
  `  });`,
  `});`,
].join("\n");

/** A literal match, which does not mutate the received object. */
export const matchesLiteral: string = [
  `describe("suite", () => {`,
  `  it("greets", () => {`,
  `    expect(profile).toMatchObject({ name: "Mira" });`,
  `    use(profile.name);`,
  `  });`,
  `});`,
].join("\n");

/** A read in a later test, which gets a fresh object. */
export const readsInLaterTest: string = [
  `describe("suite", () => {`,
  `  it("matches", () => {`,
  `    expect(options).toMatchObject({ challenge: expect.any(String) });`,
  `  });`,
  ``,
  `  it("reads", () => {`,
  `    use(options.challenge);`,
  `  });`,
  `});`,
].join("\n");
