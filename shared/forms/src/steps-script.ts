/** What the step script says, in the page's language. */
export interface FormStepCopy {
  next: string;
  back: string;
  /** The step shown, out of all: `{n}` and `{total}`. */
  step: string;
}

/**
 * Shows a form of several steps one at a time. Without it every step shows
 * and the form posts as it is; with it, Next checks the step's fields before
 * moving on, and a form sent back with errors opens on the first step that
 * has one.
 */
const STEPS_SCRIPT = `(() => {
  const script = document.currentScript;
  const form = script && script.closest(".form") && script.closest(".form").querySelector("form");
  if (!form) return;
  const steps = Array.from(form.querySelectorAll(".form__step"));
  const submit = form.querySelector('button[type="submit"]');
  if (steps.length < 2 || !submit) return;
  const copy = COPY;
  const button = (label, name) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = name;
    element.textContent = label;
    return element;
  };
  const back = button(copy.back, "form__back");
  const next = button(copy.next, "form__next");
  const progress = document.createElement("p");
  progress.className = "form__progress";
  progress.setAttribute("aria-live", "polite");
  steps[0].before(progress);
  submit.before(back, next);
  let current = Math.max(0, steps.findIndex((step) => step.querySelector(".form__error")));
  const show = (index) => {
    current = index;
    steps.forEach((step, i) => { step.hidden = i !== index; });
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    submit.hidden = index !== steps.length - 1;
    progress.textContent = copy.step.replace("{n}", String(index + 1)).replace("{total}", String(steps.length));
  };
  next.addEventListener("click", () => {
    const fields = Array.from(steps[current].querySelectorAll("input, textarea, select"));
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    show(current + 1);
    steps[current].scrollIntoView({ block: "start", behavior: "smooth" });
    const first = steps[current].querySelector("input, textarea, select");
    if (first) first.focus({ preventScroll: true });
  });
  back.addEventListener("click", () => show(current - 1));
  show(current);
})();`;

/** The script for one form, its words in the page's language. */
export function stepsScript(copy: FormStepCopy): string {
  const words = JSON.stringify(copy).replace(/</g, "\\u003c");
  return `<script data-form-steps>${STEPS_SCRIPT.replace("COPY", words)}</script>`;
}
