import { expect, it } from "bun:test";
import { createDeliveryViewFixtures } from "./studio-delivery-views";
import { createSyncViewFixture } from "./studio-sync-view";
import { createWorkViewFixtures } from "./studio-work-views";
import { studioStudyStateSchema } from "./studio-study-state";

for (const state of [undefined, ...studioStudyStateSchema.options]) {
  it(`materializes production Studio fixture declarations (${state ?? "default"})`, async () => {
    const delivery = await createDeliveryViewFixtures(state);
    const sync = await createSyncViewFixture(state);
    const work = await createWorkViewFixtures(state);
    expect(await delivery.site()).toMatchObject({ view: { title: "Site" } });
    expect(await delivery.publishing()).toMatchObject({
      view: { title: "Publishing" },
    });
    expect(await sync()).toMatchObject({ view: { title: "Content sync" } });
    expect(await work.overview()).toMatchObject({
      view: { title: "Overview" },
    });
    expect(await work.inbox({})).toMatchObject({ view: { title: "Inbox" } });
    expect(await work.overviewBadge()).toBeGreaterThanOrEqual(0);
  });
}
