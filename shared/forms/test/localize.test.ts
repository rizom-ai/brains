import { describe, expect, it } from "bun:test";
import {
  FORM_COPY,
  formCopyFor,
  formDefinitionSchema,
  formLanguages,
  formSitePages,
  localizeForm,
} from "../src";

const options = [
  { value: "a", label: "Seeking" },
  { value: "b", label: "Play" },
];
const input = {
  id: "brand-test",
  target: "quiz-result",
  path: "/brand-test",
  title: "Brand test",
  intro: "Twenty-four questions.",
  submitLabel: "See my result",
  thanks: { title: "Your result", body: "Thanks." },
  steps: [
    {
      title: "Identity",
      fields: [{ kind: "choice", id: "q1", label: "Who are you?", options }],
    },
  ],
  scoring: {
    dimensions: [
      {
        id: "identity",
        title: "Identity",
        outcomes: [{ id: "seeking", title: "Seeking", body: "Ahead." }],
      },
    ],
  },
  translations: {
    "zh-TW": {
      title: "品牌測驗",
      intro: "二十四個問題。",
      submitLabel: "看我的結果",
      thanks: { title: "你的結果" },
      steps: [{ title: "認同" }],
      fields: { q1: { label: "你是誰？", options: { a: "探索" } } },
      dimensions: {
        identity: {
          title: "認同",
          outcomes: { seeking: { title: "探索", body: "向前。" } },
        },
      },
    },
  },
};

describe("a form in another language", () => {
  it("lives under the language's path, its words in that language and the rest as written", () => {
    const form = formDefinitionSchema.parse(input);
    expect(formLanguages(form)).toEqual(["zh-TW"]);
    const zh = localizeForm(form, "zh-TW");
    expect(zh).toMatchObject({
      id: "brand-test",
      path: "/zh-tw/brand-test",
      title: "品牌測驗",
      pageTitle: "品牌測驗",
      intro: "二十四個問題。",
      submitLabel: "看我的結果",
      thanks: { title: "你的結果", body: "Thanks." },
      steps: [
        {
          title: "認同",
          fields: [
            {
              id: "q1",
              label: "你是誰？",
              options: [
                { value: "a", label: "探索" },
                { value: "b", label: "Play" },
              ],
            },
          ],
        },
      ],
      scoring: {
        dimensions: [
          {
            id: "identity",
            title: "認同",
            outcomes: [{ id: "seeking", title: "探索", body: "向前。" }],
          },
        ],
      },
    });
    expect(localizeForm(form, "zh-tw").path).toBe("/zh-tw/brand-test");
    expect(localizeForm(form, "en")).toBe(form);
  });

  it("refuses a translation of a field, option, step or outcome the form does not have", () => {
    for (const translation of [
      { fields: { q9: { label: "x" } } },
      { fields: { q1: { options: { z: "x" } } } },
      { steps: [{ title: "a" }, { title: "b" }] },
      { dimensions: { nope: { title: "x" } } },
      { dimensions: { identity: { outcomes: { nope: { title: "x" } } } } },
    ])
      expect(
        formDefinitionSchema.safeParse({
          ...input,
          translations: { "zh-TW": translation },
        }).success,
      ).toBe(false);
  });

  it("says what the engine says in the page's language, English otherwise", () => {
    expect(formCopyFor(undefined)).toBe(FORM_COPY);
    expect(formCopyFor("fr")).toBe(FORM_COPY);
    expect(formCopyFor("zh-tw").steps.next).not.toBe(FORM_COPY.steps.next);
    expect(formCopyFor("zh-TW").fields.choose("問題")).toContain("問題");
  });
});

describe("a translated form's pages on the site", () => {
  it("are built in each language it is translated to, titled in it", () => {
    const pages = formSitePages(formDefinitionSchema.parse(input), "quiz");
    expect(pages).toEqual([
      expect.objectContaining({
        id: "brand-test",
        path: "/brand-test",
        title: "Brand test",
        languages: ["zh-TW"],
        translations: { "zh-TW": { title: "品牌測驗" } },
      }),
      expect.objectContaining({
        id: "brand-test-thanks",
        path: "/brand-test/thanks",
        title: "Your result",
        languages: ["zh-TW"],
        translations: { "zh-TW": { title: "你的結果" } },
      }),
    ]);
    const plain = formSitePages(
      formDefinitionSchema.parse({ ...input, translations: undefined }),
      "quiz",
    );
    expect(plain[0]).not.toHaveProperty("languages");
  });
});
