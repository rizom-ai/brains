import { describe, expect, it } from "bun:test";
import { migrateLegacyCommunicationPreferences } from "../src/profile-migration";

describe("migrateLegacyCommunicationPreferences", () => {
  const profile = `---
name: Ada Morgan
kind: professional
audience: climate-tech founders
desiredTone: clear and practical
---
Owner profile story.
`;

  it("copies legacy profile values without changing the profile source", () => {
    const character = `---
name: Rover
role: Knowledge assistant
purpose: Help organize knowledge
values:
  - clarity
---
`;

    const result = migrateLegacyCommunicationPreferences(profile, character);

    expect(result.changed).toBe(true);
    expect(result.migratedFields).toEqual(["audience", "tone"]);
    expect(result.content).toContain("audience: climate-tech founders");
    expect(result.content).toContain("tone: clear and practical");
    expect(profile).toContain("desiredTone: clear and practical");
  });

  it("fills only missing destination preferences", () => {
    const character = `---
name: Rover
role: Knowledge assistant
purpose: Help organize knowledge
values:
  - clarity
communicationPreferences:
  audience: existing readers
---
`;

    const result = migrateLegacyCommunicationPreferences(profile, character);

    expect(result.migratedFields).toEqual(["tone"]);
    expect(result.content).toContain("audience: existing readers");
    expect(result.content).toContain("tone: clear and practical");
  });

  it("preserves malformed destination data instead of clobbering it", () => {
    const character = `---
name: Rover
role: Knowledge assistant
purpose: Help organize knowledge
values:
  - clarity
communicationPreferences: preserve-me
---
`;

    expect(migrateLegacyCommunicationPreferences(profile, character)).toEqual({
      content: character,
      migratedFields: [],
      changed: false,
    });
  });

  it("does nothing when destination preferences already exist", () => {
    const character = `---
name: Rover
role: Knowledge assistant
purpose: Help organize knowledge
values:
  - clarity
communicationPreferences:
  audience: existing readers
  tone: existing tone
---
`;

    expect(migrateLegacyCommunicationPreferences(profile, character)).toEqual({
      content: character,
      migratedFields: [],
      changed: false,
    });
  });
});
