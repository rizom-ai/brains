---
"@rizom/theme-rizom-ai": patch
---

The theme now owns its complete font set: the base theme's Google-font imports (Barlow, JetBrains Mono, and a Fraunces slice missing SOFT below 30) are stripped at composition, and theme.css imports Fraunces with the full SOFT 0–100 axis (the brain screens dial SOFT 20) alongside IBM Plex Sans/Mono. Every deployed page loses two dead font-CSS requests. The growth diagram gets a real mobile treatment: filaments and node rings keep their drawn stroke weight at any scale (`vector-effect: non-scaling-stroke`), and below `md` the zone labels enlarge to stay legible while the sub-captions and ticks yield until there is room.
