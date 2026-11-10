import { describe, expect, it } from "bun:test";
import {
  formAdmissionPolicySchema,
  formDeliveryPolicySchema,
  formHttpPolicySchema,
  resolveFormPolicy,
} from "../src";

describe("a resolved form policy", () => {
  it("parses with each policy schema, unchanged", () => {
    const policy = resolveFormPolicy(
      {
        http: { maxBodyBytes: 4096 },
        admission: { globalSubmissions: 50, networkSubmissions: 10 },
        delivery: { maxAttempts: 2 },
      },
      "https://brain.example",
    );

    expect(formHttpPolicySchema.parse(policy.http)).toEqual(policy.http);
    expect(formAdmissionPolicySchema.parse(policy.admission)).toEqual(
      policy.admission,
    );
    expect(formDeliveryPolicySchema.parse(policy.delivery)).toEqual(
      policy.delivery,
    );
  });
});
