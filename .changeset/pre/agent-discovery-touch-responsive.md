---
"@brains/agent-discovery": patch
---

The proximity map works under touch: taps activate nodes, clusters, and sightings (hover/focus never fire on mobile SVG), a tap on the map ground dismisses the highlight, and the tooltip clamps inside the card on every edge instead of clipping under `overflow: hidden`. The directory surfaces stack properly on phones: agent-card meta drops below the copy as a full-width line instead of pinching the name column, the detail header stacks its avatar, skill-tag rows wrap, the endpoint URL breaks instead of overflowing, and the stacked sidebar gains a hairline separator. Pagination targets grow to a comfortable tap size.
