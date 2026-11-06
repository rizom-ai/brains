import { describe, expect, it } from "bun:test";
import {
  lifecycleStarterRegistrationContract,
  type LifecycleStarterRegistration,
} from "../src";

describe("playbook lifecycle starter contract", () => {
  it("is a request with one owner on the registration channel", () => {
    expect(lifecycleStarterRegistrationContract.name).toBe(
      "playbooks:register-lifecycle-starter",
    );
    expect(lifecycleStarterRegistrationContract.delivery).toBe("request");
  });

  it("validates lifecycle starter registrations", () => {
    const registration: LifecycleStarterRegistration =
      lifecycleStarterRegistrationContract.schema.parse({
        id: "onboarding",
        trigger: "first-admin-web-chat",
        playbookId: "rover-onboarding",
        starterText: "Set up Rover",
        starterPrompt: "Start playbook rover-onboarding.",
      });

    expect(registration).toEqual({
      id: "onboarding",
      trigger: "first-admin-web-chat",
      playbookId: "rover-onboarding",
      once: true,
      starterText: "Set up Rover",
      starterPrompt: "Start playbook rover-onboarding.",
    });
  });

  it("answers whether the starter was registered or ignored", () => {
    expect(
      lifecycleStarterRegistrationContract.response.parse({
        registered: false,
        id: "onboarding",
        ignored: true,
        reason: "conflict",
      }),
    ).toEqual({
      registered: false,
      id: "onboarding",
      ignored: true,
      reason: "conflict",
    });
  });
});
