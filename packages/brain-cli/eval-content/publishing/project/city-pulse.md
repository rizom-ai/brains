---
title: CityPulse
slug: city-pulse
status: published
description: Real-time urban data dashboard for mid-sized European cities
year: 2025
publishedAt: "2025-06-01T00:00:00.000Z"
checksum: seed
created: "2025-06-01T00:00:00.000Z"
updated: "2025-06-01T00:00:00.000Z"
---

# CityPulse

Real-time urban data dashboard built for three mid-sized European cities. Aggregates air quality, noise levels, traffic flow, and public transit data into a single public interface.

## The problem

Each city had sensor data scattered across vendor silos. Air quality from one provider, traffic from another, transit from a third. No unified view, no public access, no cross-domain analysis.

## What we built

An open source data aggregation layer that normalizes sensor data from multiple vendors into a common schema, with a public dashboard and API. Edge processing at the sensor level ensures privacy — raw camera feeds never leave the device.

## Technical decisions

- **Event-sourced data pipeline** — every measurement is an immutable event, enabling full audit trail and historical replay
- **Edge-first architecture** — aggregation happens on device, only summaries reach the cloud
- **Grafana + custom panels** — familiar tooling for city engineers, custom panels for public dashboards
- **OpenAPI spec** — third-party developers can build on the data

## Outcome

Three cities deployed. 2,400 sensors integrated. 15 third-party apps built on the API within the first year. Open sourced under EUPL.
