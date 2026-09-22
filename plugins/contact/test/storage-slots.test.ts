import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RuntimeStateService } from "@brains/runtime-state";
import { migrateRuntimeState } from "@brains/runtime-state/migrate";
import { ContactStorageSlots } from "../src/storage-slots";

const start = Date.parse("2026-09-21T10:00:00.000Z");
const policy = { retentionSeconds: 86400, maxRecords: 2, maxBytes: 2048 };

describe("contact storage capacity", () => {
  it("coordinates capacity across SQLite connections and preserves uncertain writes after expiry and restart", async () => {
    let now = start;
    const directory = await mkdtemp(join(tmpdir(), "contact-capacity-"));
    const config = { url: `file:${join(directory, "state.db")}` };
    await migrateRuntimeState(config);
    const first = RuntimeStateService.createFresh(config);
    const second = RuntimeStateService.createFresh(config);
    try {
      await Promise.all([first.initialize(), second.initialize()]);
      const a = new ContactStorageSlots(first, policy, () => now);
      const b = new ContactStorageSlots(second, policy, () => now);
      const ids = Array.from(
        { length: 8 },
        (_, i) => `contact-${String(i).padStart(64, "0")}`,
      );
      const results = await Promise.all(
        ids.map((id, i) => (i % 2 ? a : b).claim(id, now, 1000)),
      );
      expect(results.filter((result) => result.kind === "new")).toHaveLength(2);
      expect(
        results.filter((result) => result.kind === "capacity"),
      ).toHaveLength(6);
      const winners = ids.filter((_, i) => results[i]?.kind === "new");
      const stored = winners[0];
      const uncertain = winners[1];
      if (!stored || !uncertain)
        throw new Error("Missing storage reservations");
      await a.stored(stored);
      expect(await a.releaseDeleted(stored)).toBe(false);
      const deliveries = await Promise.all([
        a.beginDelivery(stored, 3, 3600),
        b.beginDelivery(stored, 3, 3600),
      ]);
      expect(deliveries.map((claim) => claim.status).sort()).toEqual([
        "busy",
        "send",
      ]);
      first.close();
      second.close();
      const restarted = RuntimeStateService.createFresh(config);
      try {
        await restarted.initialize();
        const slots = new ContactStorageSlots(restarted, policy, () => now);
        expect(await slots.beginDelivery(stored, 3, 3600)).toEqual({
          status: "busy",
        });
        now += 65_000;
        expect(await slots.beginDelivery(stored, 3, 3600)).toMatchObject({
          status: "send",
          attempt: 2,
        });
        // A failed late attempt cannot clear the new owner's lease.
        await slots.settleDelivery(stored, 1, false, 3);
        expect(await slots.beginDelivery(stored, 3, 3600)).toEqual({
          status: "busy",
        });
        // A real late acknowledgement is still useful; failures never undo it.
        await slots.settleDelivery(stored, 1, true, 3);
        await slots.settleDelivery(stored, 2, false, 3);
        expect(await slots.beginDelivery(stored, 3, 3600)).toEqual({
          status: "sent",
        });
        now += 86400_000;
        expect(await slots.list()).toHaveLength(2);
        expect(await slots.releaseDeleted(uncertain)).toBe(false);
        expect(await slots.releaseDeleted(stored)).toBe(true);
        expect(await slots.settleDelivery(stored, 2, true, 3)).toBeNull();
        const fresh = `contact-${"a".repeat(64)}`;
        expect((await slots.claim(fresh, now, 1000)).kind).toBe("new");
        expect(
          await slots.claim(`contact-${"b".repeat(64)}`, now, 1000),
        ).toEqual({ kind: "capacity" });
      } finally {
        restarted.close();
      }
    } finally {
      first.close();
      second.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
