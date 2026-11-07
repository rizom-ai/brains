import { describe, expect, it } from "bun:test";
import {
  FORM_COPY,
  formDefinitionSchema,
  renderForm,
  renderPaused,
  renderRefused,
  renderThanks,
} from "../src";

const form = formDefinitionSchema.parse({
  id: "contact",
  target: "contact-request",
  path: "/contact",
  title: "Write to {owner}",
  intro: "It goes to {owner}.\n\nNothing else.",
  submitLabel: "Send note",
  thanks: {
    title: "Note saved",
    body: "Saved for {owner}.\n\nNo need to resend.",
  },
  steps: [
    {
      fields: [
        {
          kind: "text",
          id: "name",
          label: "Name",
          required: true,
          maxLength: 120,
          autocomplete: "name",
        },
        {
          kind: "email",
          id: "email",
          label: "Email",
          required: true,
          autocomplete: "email",
        },
        { kind: "longText", id: "message", label: "Message" },
      ],
    },
  ],
});
const token = "a".repeat(64);

describe("a form's page", () => {
  it("renders its copy, its fields and the token and honeypot every post carries", () => {
    const html = renderForm(form, {
      token,
      presentation: { owner: "Ada <3", theme: "dark" },
    });
    expect(html).toStartWith('<div class="form" data-form="contact"><style>');
    expect(html).toContain("<h1>Write to Ada &lt;3</h1>");
    expect(html).toContain(
      '<p class="form__intro">It goes to Ada &lt;3.</p><p class="form__intro">Nothing else.</p>',
    );
    expect(html).toContain(
      '<form method="post" action="/contact?theme=dark" accept-charset="UTF-8">',
    );
    expect(html).toContain(
      `<input type="hidden" name="token" value="${token}">`,
    );
    expect(html).toContain('<fieldset class="form__step">');
    expect(html).toContain(
      '<div class="form__field"><label for="form-contact-name">Name</label><input id="form-contact-name" name="name" type="text" autocomplete="name" required maxlength="120" value=""></div>',
    );
    expect(html).toContain(
      'name="email" type="email" autocomplete="email" required maxlength="254"',
    );
    expect(html).toContain(
      '<div class="form__field form__field--long"><label for="form-contact-message">Message <span class="form__optional">(optional)</span></label><textarea id="form-contact-message" name="message" rows="5" maxlength="4000"></textarea></div>',
    );
    expect(html).toContain(
      '<input name="website" tabindex="-1" autocomplete="off" value="">',
    );
    expect(html).toContain('<button type="submit">Send note</button>');
    expect(html).not.toContain("<script");
  });

  it("puts back the visitor's draft, escaped, with each field's error beside it", () => {
    const html = renderForm(form, {
      token,
      draft: { name: "", email: "x", message: "</textarea><script>" },
      errors: { name: "Name is required.", email: "Enter an email address." },
      notice: "Check the fields.",
    });
    expect(html).toContain(
      '<p class="form__notice" role="alert">Check the fields.</p>',
    );
    expect(html).toContain(
      'aria-invalid="true" aria-describedby="form-contact-name-error" required maxlength="120" value=""><p class="form__error" id="form-contact-name-error">Name is required.</p>',
    );
    expect(html).toContain(
      'value="x"><p class="form__error" id="form-contact-email-error">Enter an email address.</p>',
    );
    expect(html).toContain("&lt;/textarea&gt;&lt;script&gt;</textarea>");
    expect(html).toContain("<h1>Write to the owner of this site</h1>");
  });

  it("asks each step's fields in a fieldset under its title", () => {
    const steps = formDefinitionSchema.parse({
      id: "quiz",
      target: "quiz-result",
      title: "Quiz",
      steps: [
        { title: "You", fields: [{ kind: "text", id: "name", label: "Name" }] },
        {
          title: "More",
          fields: [{ kind: "text", id: "more", label: "More" }],
        },
      ],
    });
    const html = renderForm(steps, { token });
    expect(html.match(/<fieldset class="form__step">/g)).toHaveLength(2);
    expect(html).toContain('<fieldset class="form__step"><legend>You</legend>');
    expect(html).toContain('action="/forms/quiz"');
  });

  it("thanks the visitor, and says when it is paused or refused", () => {
    expect(renderThanks(form, { owner: "Ada" })).toContain(
      '<h1>Note saved</h1><p class="form__intro">Saved for Ada.</p><p>No need to resend.</p>',
    );
    expect(renderPaused(form, FORM_COPY)).toContain(
      `<h1>${FORM_COPY.paused.title}</h1>`,
    );
    const refused = renderRefused(
      form,
      "Too <many>.",
      { theme: "light" },
      FORM_COPY,
    );
    expect(refused).toContain(
      '<p class="form__notice" role="alert">Too &lt;many&gt;.</p>',
    );
    expect(refused).toContain(
      '<a href="/contact?theme=light">Open a new form</a>',
    );
  });
});

describe("choice fields on the page", () => {
  const options = [
    { value: "a", label: "Seeking" },
    { value: "b", label: "Play & fun" },
  ];
  const quiz = formDefinitionSchema.parse({
    id: "quiz",
    target: "quiz-result",
    title: "Quiz",
    steps: [
      {
        fields: [
          { kind: "choice", id: "q1", label: "One", options, required: true },
          { kind: "choices", id: "q2", label: "Some", options },
        ],
      },
    ],
  });

  it("asks one as radio buttons and several as checkboxes, keeping what was chosen", () => {
    const html = renderForm(quiz, {
      token,
      draft: { q1: "b", q2: ["a", "b"] },
      errors: { q2: "Choose at most 1 for Some." },
    });
    expect(html).toContain(
      '<fieldset class="form__field form__field--choice"><legend>One</legend><label class="form__choice"><input type="radio" name="q1" value="a" required> Seeking</label><label class="form__choice"><input type="radio" name="q1" value="b" required checked> Play &amp; fun</label></fieldset>',
    );
    expect(html).toContain(
      '<fieldset class="form__field form__field--choice" aria-describedby="form-quiz-q2-error"><legend>Some <span class="form__optional">(optional)</span></legend><label class="form__choice"><input type="checkbox" name="q2" value="a" checked> Seeking</label><label class="form__choice"><input type="checkbox" name="q2" value="b" checked> Play &amp; fun</label><p class="form__error" id="form-quiz-q2-error">Choose at most 1 for Some.</p></fieldset>',
    );
  });
});

describe("a form of several steps", () => {
  const steps = formDefinitionSchema.parse({
    id: "quiz",
    target: "quiz-result",
    title: "Quiz",
    steps: [
      { title: "You", fields: [{ kind: "text", id: "name", label: "Name" }] },
      { title: "More", fields: [{ kind: "text", id: "more", label: "More" }] },
    ],
  });

  it("works without JavaScript, every step on one page, and a script then shows one at a time", () => {
    const html = renderForm(steps, { token });
    // Without the script every step shows and the form posts as it is.
    expect(html).not.toContain(" hidden");
    expect(html).toContain("<script data-form-steps>");
    expect(html).toContain(
      '"next":"Next","back":"Back","step":"Step {n} of {total}"',
    );
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(renderForm(form, { token })).not.toContain("<script");
  });
});

describe("a scored form's thanks page", () => {
  it("shows the submission's outcome in each dimension", () => {
    const quiz = formDefinitionSchema.parse({
      id: "quiz",
      target: "quiz-result",
      title: "Quiz",
      thanks: { title: "Done" },
      steps: [{ fields: [{ kind: "text", id: "name", label: "Name" }] }],
      scoring: {
        dimensions: [
          {
            id: "identity",
            title: "Identity",
            outcomes: [
              {
                id: "seeking",
                title: "Seeking",
                body: "You look <ahead>.\n\nAlways.",
              },
            ],
          },
        ],
      },
    });
    expect(
      renderThanks(quiz, {}, FORM_COPY, [
        { dimension: "identity", outcome: "seeking" },
      ]),
    ).toContain(
      '<h1>Done</h1><section class="form__outcomes"><div class="form__outcome" data-dimension="identity" data-outcome="seeking"><h2>Identity</h2><h3>Seeking</h3><p>You look &lt;ahead&gt;.</p><p>Always.</p></div></section>',
    );
  });
});
