---
title: Green Software Engineering Principles
slug: green-software-principles
status: published
description: Key principles for reducing the environmental impact of software systems
publishedAt: "2025-10-15T00:00:00.000Z"
checksum: seed
created: "2025-10-15T00:00:00.000Z"
updated: "2025-10-15T00:00:00.000Z"
---

# Green Software Engineering Principles

Notes from the Green Software Foundation's practitioner guide.

## Carbon Efficiency

- Measure carbon intensity per unit of work (gCO2eq per request, per user, per transaction)
- Optimize for carbon, not just cost or latency
- Use carbon-aware scheduling — run batch jobs when the grid is cleanest

## Energy Proportionality

- Idle servers waste energy — scale to zero when possible
- Right-size instances (oversized VMs burn watts doing nothing)
- Prefer serverless for bursty workloads

## Hardware Efficiency

- Extend hardware lifetime (embodied carbon dominates for most devices)
- Use commodity hardware, not specialized silicon
- Cloud providers amortize embodied carbon across more tenants than on-prem

## Network Efficiency

- Reduce data transfer (compress, cache, delta sync)
- Process at the edge when possible
- Choose regions with low carbon intensity grids

## Measurement

Without measurement, optimization is guesswork. Instrument energy consumption at the application level, not just the infrastructure level.
