---
title: "Urban Sensing Networks and the Data Commons"
slug: urban-sensing-networks
status: published
description: How cities can build sensor networks that serve the public without becoming surveillance infrastructure
excerpt: The difference between a smart city and a surveilled city is governance, not technology.
author: Alex Chen
topics:
  - urban-tech
  - sustainability
  - privacy
publishedAt: "2025-10-01T00:00:00.000Z"
checksum: seed
created: "2025-10-01T00:00:00.000Z"
updated: "2025-10-01T00:00:00.000Z"
---

Barcelona has air quality sensors on every block. Amsterdam monitors canal water levels in real time. Taipei tracks flood risk through a mesh of IoT devices in storm drains. These cities share a belief: urban data should be a public resource.

But the implementation matters enormously. The same sensor network that measures pollution can track pedestrian movement. The same camera that counts cyclists can identify individuals. Technology is not the differentiator — governance is.

## The data commons model

A data commons treats urban sensor data as a shared resource with clear rules:

1. **Aggregation before storage** — count people, don't track people. Measure flow, not identity.
2. **Public dashboards** — if the city collects it, citizens can see it. No secret datasets.
3. **Purpose limitation** — data collected for air quality monitoring cannot be repurposed for law enforcement.
4. **Sunset clauses** — raw data is deleted after processing. Only aggregates persist.

## Technical architecture

The architecture follows from the governance model. Edge processing is essential — you aggregate at the sensor, not in the cloud. A camera that counts bicycles and outputs a number is fundamentally different from a camera that streams video to a central server.

This means more compute at the edge and less in the data center. It means simpler APIs (the sensor outputs a count every 5 minutes) and less sophisticated analytics. That's a feature, not a bug.

## The Barcelona model

Barcelona's Sentilo platform is open source. Any city can deploy it. The sensor data feeds public dashboards and academic research. The city publishes an annual data ethics audit.

Is it perfect? No. But it demonstrates that you can build useful urban sensing without building a panopticon. The constraint of privacy forces better design.
