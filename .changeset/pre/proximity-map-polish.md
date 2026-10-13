---
"@brains/templates": patch
"@brains/site-engine": patch
"@brains/site-builder-plugin": patch
"@brains/agent-discovery": patch
"@brains/dashboard": patch
---

Polish the agent proximity map: templates can now declare `staticAssets` that site-builder emits for routes using them, so the map's interaction script ships as a real file instead of a CSP-hostile data: URI. The chart HUD gains a free-agents row with hover linkage, nutrient pulses ride approved threads (hidden under reduced motion), SVG defs are namespaced per surface, the tooltip is structured and injection-safe, node labels thin out past the label budget, and interactive elements drop the button role they could not honor.
