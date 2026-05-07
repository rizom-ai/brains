---
title: Peer-brain directory
section: Relay handbook
order: 30
sourcePath: relay/eval-content/doc/peer-brain-directory.md
slug: peer-brain-directory
description: How Relay treats saved agents and skills for A2A coordination.
---

# Peer-brain directory

Relay calls peer brains through explicit local agent records.

- `discovered` agents are visible for review but not callable.
- `approved` agents are allowed for A2A calls.
- `archived` agents remain historical and should not be called.

Skill records describe what this Relay instance can advertise in its Agent Card and what peer brains can be selected for.
