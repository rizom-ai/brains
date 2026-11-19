---
"@brains/console-theme": patch
"@brains/studio": patch
"@brains/operator-view-react": patch
"@brains/app-ui-react": patch
"@brains/knowledge-map": patch
"@brains/theme-rizom": patch
"@rizom/brain": patch
---

Studio's small text now reads at WCAG AA contrast (4.5:1) in every shipped theme and in both climates. Accent-colored text (the active rail number, links, the "required" marker, chat sessions) uses a new `--console-accent-text` token, the theme's accent pulled toward its text color, so a light accent such as rizom.ai's brass stays legible on paper. In the Rizom theme's paper climate, muted text is darker and success ink is the base's readable green instead of the dark mode's terminal green.
