---
"@brains/plugins": patch
"@brains/blog": patch
"@brains/decks": patch
"@brains/portfolio": patch
"@brains/doc": patch
"@brains/core": patch
"@rizom/brain": patch
---

Text pasted to be saved as a portfolio project, a deck or a doc is kept as written, the way posts are. A leading `# Title` heading becomes the title, and the brain fills in what the type needs: a project gets a card description and the year the text names, saved as a draft; a deck is split into slides on its headings when the text has no `---` separators, keeps its first heading as the title slide, and gets a description; a doc goes after the last page, in the docs' only section or the one the user names. When the year, the section or the title cannot be derived, the brain asks once. A project page shows a body written outside the case-study sections. Generating a deck from a prompt works again: its placeholder kept no slide and failed every generation. A new deck without slide separators gets a validation message in Studio instead of a server error.
