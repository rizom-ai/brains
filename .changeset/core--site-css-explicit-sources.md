---
"@brains/site-builder-plugin": patch
---

Site CSS is generated from what the build emits and nothing else. Tailwind's automatic source detection scanned the whole instance directory, so content, stores and other files leaked stray utility classes into every site, and the stylesheet changed with whatever happened to be lying there. The base stylesheet now disables automatic detection and scans the built pages and runtime scripts, and styles are compiled after the scripts are written, so classes that only a script toggles are still generated.
