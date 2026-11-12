/**
 * The brain's forms, the brand test among them, on the paper stage: each
 * step a card, each answer a cut-out to pick, buttons as the site's pills.
 * The engine renders the same markup on every site; these rules dress it
 * here, ahead of the engine's own zero-specificity look.
 */
export const formsCSS: string = `
.tf-site .form { max-width: 760px; margin: 0 auto; padding: calc(96px + 3vw) var(--layout-gutter) 96px; color: var(--palette-ink); line-height: 1.55; }
.tf-site .form h1 { margin: 0 0 20px; font-family: var(--font-sans); font-weight: 800; font-size: clamp(38px, 6vw, 84px); line-height: 0.9; letter-spacing: -0.045em; text-transform: uppercase; color: var(--palette-ink); }
.tf-site .form p { color: var(--palette-ink); max-width: 62ch; }
.tf-site .form .form__intro { font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(18px, 1.6vw, 23px); letter-spacing: var(--tracking-story); }
.tf-site .form form { gap: 28px; margin-block: 32px; }
.tf-site .form .form__step { grid-template-columns: 1fr; gap: 22px; padding: clamp(22px, 3vw, 40px); background: var(--palette-card); border-radius: 22px; box-shadow: var(--shadow-paper); }
.tf-site .form .form__step > legend { float: left; width: 100%; margin: 0 0 6px; font-family: var(--font-sans); font-weight: 800; font-size: clamp(20px, 2.2vw, 30px); line-height: 1; letter-spacing: -0.03em; text-transform: uppercase; }
.tf-site .form .form__step-intro { font-family: var(--font-story); font-style: italic; font-size: 18px; }
.tf-site .form .form__field { font-size: 16px; font-weight: 700; color: var(--palette-ink); }
.tf-site .form .form__field--choice legend { margin-bottom: 12px; font-family: var(--font-sans); font-size: 18px; font-weight: 700; line-height: 1.35; text-transform: none; letter-spacing: 0; }
.tf-site .form .form__choice { gap: 12px; align-items: center; margin-bottom: 8px; padding: 12px 16px; border: 2px solid var(--palette-ink); border-radius: 14px; font-weight: 500; color: var(--palette-ink); cursor: pointer; transition: transform 0.15s cubic-bezier(0.2, 0.9, 0.25, 1.3), background 0.15s ease; }
.tf-site .form .form__choice:hover { transform: translateY(-2px); }
.tf-site .form .form__choice:has(input:checked) { background: var(--palette-mustard); }
.tf-site .form .form__choice input { accent-color: var(--palette-ink); }
.tf-site .form input:not([type="radio"]):not([type="checkbox"]), .tf-site .form textarea { background: var(--color-bg); border: 2px solid var(--palette-ink); border-radius: 14px; color: var(--palette-ink); font-family: var(--font-sans); }
.tf-site .form button { justify-self: start; min-height: 52px; padding: 0 26px; border: 0; border-radius: var(--radius-pill); background: var(--palette-ink); color: var(--palette-card); font-family: var(--font-sans); font-weight: 700; font-size: 16px; box-shadow: var(--shadow-paper); transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.25, 1.3), filter 0.2s ease; }
.tf-site .form button:hover { transform: translateY(-3px); filter: brightness(1.12); }
.tf-site .form .form__back { background: var(--palette-card); color: var(--palette-ink); box-shadow: none; border: 2px solid var(--palette-ink); }
.tf-site .form .form__progress { font-weight: 700; font-size: var(--text-label-sm); letter-spacing: var(--tracking-label); text-transform: uppercase; }
.tf-site .form .form__notice { border-inline-start: 4px solid var(--palette-red); border-radius: 14px; background: var(--palette-card); color: var(--palette-ink); }
.tf-site .form .form__error { color: var(--palette-red); font-weight: 700; }
.tf-site .form [aria-invalid="true"] { border-color: var(--palette-red); }
.tf-site .form .form__outcome { padding: 24px; background: var(--palette-card); border-radius: 22px; box-shadow: var(--shadow-paper); }
.tf-site .form .form__outcome h3 { font-family: var(--font-story); font-style: italic; color: var(--palette-red); }
.tf-site .form a:focus-visible, .tf-site .form button:focus-visible, .tf-site .form input:focus-visible { outline: 3px solid var(--palette-mustard); outline-offset: 3px; }
@media (max-width: 540px) { .tf-site .form button { width: 100%; justify-content: center; } }
`;
