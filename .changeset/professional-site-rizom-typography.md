---
"@brains/theme-default": patch
"@brains/theme-base": patch
"@brains/theme-rizom": patch
"@brains/ui-library": patch
"@brains/site-professional": patch
"@brains/site-builder-plugin": patch
"@brains/site-info": patch
---

Tighten typography and editorial layout on the professional site to match the rizom-aligned mock. Load Fraunces with the SOFT axis range (was inert), introduce `--color-rule` / `--color-rule-strong` / `--color-accent-soft` / `--color-bg-deep` tokens and matching utilities, refine the light palette toward the mock's warmer cream, and wire `.hero-bg-pattern` / `.cta-bg-pattern` / `.section-divider` / `.section-rule` to actual CSS rules. UI library updates: 3-column header (wordmark | nav | toggle), `.nav-link` utility, single-moon ThemeToggle, editorial entry styling with hover→accent + 1px rule separators, mono pill CTA button, and a footer wordmark size override. Drop the unused `--font-serif` token + `.font-serif` utility.
