import { describe, expect, it } from "bun:test";
import {
  PLAYBOOKS_REGISTER_LIFECYCLE_STARTER,
  lifecycleStarterRegistrationSchema,
  type LifecycleStarterRegistration,
} from "../src";

describe("playbook lifecycle starter contract", () => {
  it("exposes the registration channel used by lifecycle-capable plugins", () => {
    expect(PLAYBOOKS_REGISTER_LIFECYCLE_STARTER).toBe(
      "playbooks:register-lifecycle-starter",
    );
  });

  it("validates lifecycle starter registrations", () => {
    const registration: LifecycleStarterRegistration =
      lifecycleStarterRegistrationSchema.parse({
        id: "onboarding",
        trigger: "first-anchor-web-chat",
        playbookId: "rover-onboarding",
        starterText: "Set up Rover",
        starterPrompt: "Start playbook rover-onboarding.",
      });

    expect(registration).toEqual({
      id: "onboarding",
      trigger: "first-anchor-web-chat",
      playbookId: "rover-onboarding",
      once: true,
      starterText: "Set up Rover",
      starterPrompt: "Start playbook rover-onboarding.",
    });
  });
});
