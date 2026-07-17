import { describe, expect, it } from "bun:test";
import { sendNotificationResultSchema, sendNotificationSchema } from "../src";

describe("notification contracts", () => {
  it("allows the router to supply a default recipient", () => {
    expect(
      sendNotificationSchema.parse({
        title: "New sightings",
        body: "One agent",
      }),
    ).toEqual({
      title: "New sightings",
      body: "One agent",
      sensitivity: "normal",
    });
  });

  it("validates successful delivery results", () => {
    expect(
      sendNotificationResultSchema.parse({
        status: "sent",
        deliveryId: "delivery-1",
      }),
    ).toEqual({ status: "sent", deliveryId: "delivery-1" });
  });
});
