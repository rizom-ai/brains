---
"@rizom/brain": patch
---

Every type whose file layout moves in the next stored form now reads both forms and still writes the current one: links, mail items and action items with flat source keys; social posts with document ids; decisions, summaries and action items with their time range as two dates and their people as actor refs, each person whole in a People section; FAQs and series in the compact body layout; and the SWOT, quiz results, skills, the brain character, Ask copy, guides, the style guide and the anchor profile with their structured copy in the body. A brain on this release reads a file written by the next one, so the switch to the next form is a quiet rewrite on start. The structured content formatter heads a titled list item by its title and derives a body's mappings from its schema.
