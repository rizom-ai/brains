---
"@rizom/brain": patch
---

A type can store its records as YAML files. The grouping definitions, traffic snapshots and forms do so in the next stored form: their files become `<type>/<id>.yaml`, the header each holds today, with a form's introduction as its `intro` key and a traffic snapshot's rendered table no longer stored. This release still writes `.md` and reads either file, so a brain moves to YAML files quietly on the release that writes them. Directory sync finds a `.yaml` file only under a YAML type's folder and keeps one file per record; the WebDAV drive serves and takes the file the store writes; the Obsidian vault leaves YAML types to Studio.
