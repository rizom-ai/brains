---
"@rizom/brain": patch
---

Every type whose file layout moved now writes its next stored form, and the rewrite on start brings every stored record to it quietly, exported in one commit. Links, mail items and action items state their source as flat keys; social posts their documents as ids; decisions, summaries and action items their time range as two dates and their people as actor refs, each person whole in a closing People section; FAQs and series use the compact body layout; the SWOT, quiz results, skills, the brain character, Ask copy, guides, the style guide, site info and the anchor profile state their structured copy in the body; and the grouping definitions, traffic snapshots and forms are YAML files, the old `.md` file removed once the `.yaml` holds the same record. Studio and the Obsidian vault are shown each type's new header. A brain on the previous release reads every one of these files.
