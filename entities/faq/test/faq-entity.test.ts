import { describe, expect, it } from "bun:test";
import { faqEntityHarness } from "./helpers/faq-entity-harness";
import { createFaqContent, parseFaqContent } from "../src/lib/faq-content";

describe("declarative FAQ entity", () => {
  it("keeps FAQs out of broad searches and projection sourcing", async () => {
    const harness = await faqEntityHarness();
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("faq"),
    ).toMatchObject({
      includeInBroadSearch: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(harness.getCapabilities().tools).toHaveLength(0);
  });

  it("makes publishing a FAQ a publish action", async () => {
    const harness = await faqEntityHarness();
    expect(
      harness.getEntityRegistry().getEntityTypeConfig("faq").publish,
    ).toEqual({ publishStatuses: ["published"] });
  });

  it("offers a qualified section and source, without an automatic list route", async () => {
    const harness = await faqEntityHarness();
    const templates = [...harness.getTemplates().keys()];
    expect(templates.some((name) => name.endsWith("faq-section"))).toBe(true);
    expect(templates.some((name) => name.endsWith("faq-list"))).toBe(false);
    expect(
      harness.getTemplates().get("@brains/faq:faq:faq-section")?.dataSourceId,
    ).toBe("@brains/faq:entities");
    expect([...harness.getDataSources().keys()]).toContain(
      "@brains/faq:entities",
    );
  });

  it("keeps additional authored fields out of the metadata index without dropping them", async () => {
    const harness = await faqEntityHarness();
    await harness.getEntityService().createEntity({
      entity: {
        id: "authored",
        entityType: "faq",
        visibility: "public",
        content:
          "---\nquestion: An authored question?\nstatus: draft\nownerNote: Keep this field\n---\nAn answer.",
        metadata: {
          question: "An authored question?",
          status: "draft",
          asked: 1,
        },
      },
    });
    const entity = await harness
      .getEntityService()
      .getEntity({ entityType: "faq", id: "authored" });
    expect(entity?.content).toContain("ownerNote: Keep this field");
    expect(entity?.metadata).toEqual({
      question: "An authored question?",
      status: "draft",
      asked: 1,
    });
    const source = await harness
      .getEntityService()
      .getEntityWriteSnapshot({ entityType: "faq", id: "authored" });
    expect(source?.entity.content).toContain("ownerNote: Keep this field");
  });

  it("round-trips authored questions, rank and alternatives through the installed codec", async () => {
    const harness = await faqEntityHarness();
    const fields = {
      question: "Can I publish?",
      status: "draft" as const,
      asked: 3,
      rank: 2,
    };
    const alternatives = [{ answer: "Ask the owner." }];
    await harness.getEntityService().createEntity({
      entity: {
        id: "publish",
        entityType: "faq",
        visibility: "shared",
        content: createFaqContent(fields, "Use **Publish**.", alternatives),
        metadata: fields,
      },
    });
    const entity = await harness.getEntityService().getEntity({
      entityType: "faq",
      id: "publish",
      visibilityScope: "restricted",
    });
    expect(entity?.metadata).toEqual(fields);
    expect(entity?.visibility).toBe("shared");
    expect(parseFaqContent(entity?.content ?? "")).toEqual({
      frontmatter: fields,
      answer: "Use **Publish**.",
      alternatives,
    });
  });
});
