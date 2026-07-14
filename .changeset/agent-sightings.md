---
"@brains/agent-discovery": patch
"@brains/dashboard": patch
"@brains/a2a": patch
---

Second-order agent discovery. Brains serve their approved public agents as minimal name/url pointers at /.well-known/agent-directory.json, and the trusted agent_scan_directories tool walks each approved peer's directory, verifies each pointee's own Agent Card, and saves sightings as discovered agents carrying provenance (introducedBy, hops) — skipping self and known agents, merging introducers on repeat sightings. Sighted agents chart on the proximity map at half light, threads growing from their introducers, germinating only within semantic reach with an active introducer; approving one (agent_connect) promotes it to a full first-order contact.
