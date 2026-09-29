import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openRuntimeStateOwner } from "./helpers/runtime-state-owner";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { ContactAdmission, type ContactAdmissionPolicy } from "../src";

const now = Date.parse("2026-09-21T10:00:00.000Z");
const policy: ContactAdmissionPolicy = {
  windowSeconds: 60,
  globalRequests: 100,
  networkRequests: 50,
  globalForms: 8,
  networkForms: 8,
  globalSubmissions: 2,
  networkSubmissions: 2,
  tokenTtlSeconds: 30,
  receiptTtlSeconds: 120,
  maxEntries: 20,
};
const network = "192.0.2.1";
const input = {
  name: "Ada",
  email: "private@example.com",
  message: "Please call me",
};

describe("contact admission persistence", () => {
  it("coordinates authenticated callers through one native owner and survives joined restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "contact-admission-"));
    const config = { url: `file:${join(directory, "state.db")}` };
    await migrateRuntimeState(config);
    const owner = await openRuntimeStateOwner(config);
    try {
      const first = await owner.connect();
      const second = await owner.connect();
      const a = new ContactAdmission(first, policy, () => now);
      const b = new ContactAdmission(second, policy, () => now);
      const forms = await Promise.all(
        Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).issue(network)),
      );
      const tokens = forms.flatMap((form) =>
        form.kind === "issued" ? [form.token] : [],
      );
      expect(tokens).toHaveLength(8);
      const results = await Promise.all(
        tokens.map((token, i) =>
          (i % 2 ? a : b).reserve(token, input, network),
        ),
      );
      expect(results.filter((r) => r.kind === "reserved")).toHaveLength(2);
      expect(results.filter((r) => r.kind === "denied")).toHaveLength(6);
      const winnerIndex = results.findIndex((r) => r.kind === "reserved");
      const winner = results[winnerIndex];
      const token = tokens[winnerIndex];
      if (!token || winner?.kind !== "reserved")
        throw new Error("No reservation");
      await owner.close();
      const replacement = await openRuntimeStateOwner(config);
      try {
        const restarted = await replacement.connect();
        const admission = new ContactAdmission(restarted, policy, () => now);
        expect(await admission.reserve(token, input, network)).toEqual({
          ...winner,
          kind: "duplicate",
        });
        const loser = tokens[results.findIndex((r) => r.kind === "denied")];
        if (!loser) throw new Error("No rejected submission");
        expect(await admission.reserve(loser, input, network)).toEqual({
          kind: "denied",
          reason: "rate-limited",
        });
        expect(await admission.issue(network)).toEqual({
          kind: "denied",
          reason: "rate-limited",
        });
      } finally {
        await replacement.close();
      }
    } finally {
      await owner.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
