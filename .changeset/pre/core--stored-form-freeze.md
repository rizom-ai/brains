---
"@rizom/brain": patch
---

The stored format is frozen. A markdown type whose header nests (an object, a record, a list of objects) is refused when it registers, and a codec that writes such a header is refused at the write; a YAML type's file may nest. The authoring guide states the format and the rule for changing a field, and the old forms' decoders are listed for removal in 0.3.0.
