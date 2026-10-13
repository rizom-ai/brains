import { describe, expect, it } from "bun:test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import {
  loadHomepagePlacement,
  requireDoor,
} from "../src/datasources/homepage-datasource";

const opening = {
  title: "Building something inhabitable.",
  introduction: "I work on how institutions hold what they know.",
  topics: [],
  contactUrl: "https://yeehaa.test/contact",
};

describe("professional homepage opening", () => {
  it("keeps an opening whose door leads to a contact form", () => {
    expect(requireDoor(opening)).toBe(opening);
  });

  it("keeps the list homepage when no contact form can receive the door", () => {
    expect(requireDoor({ ...opening, contactUrl: null })).toBeNull();
    expect(requireDoor(null)).toBeNull();
  });
});

const faq = { id: "q", question: "What is it?", answer: "This." };
const context = {
  entityService: createMockServicePluginContext().entityService,
  publishedOnly: true,
};

describe("published FAQs on the professional homepage", () => {
  it("load with an opening that renders, under the atlas", async () => {
    const placement = await loadHomepagePlacement(
      {
        loadOpening: async () => opening,
        loadFaqs: async () => [faq],
      },
      context,
    );
    expect(placement.faqs).toEqual([faq]);
  });

  it("are not loaded for a page that keeps its list homepage", async () => {
    let asked = false;
    const placement = await loadHomepagePlacement(
      {
        loadOpening: async () => ({ ...opening, contactUrl: null }),
        loadFaqs: async () => {
          asked = true;
          return [faq];
        },
      },
      context,
    );
    expect(placement.faqs).toBeUndefined();
    expect(asked).toBe(false);
  });
});
