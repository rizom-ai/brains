import { createTestEntity } from "@brains/test-utils";
import type { Whitepaper } from "../../src/schemas/whitepaper";

export const newInstitutionsWhitepaperContent = `---
title: "New Institutions: Technology for Sovereign, Regenerative, Distributed Coordination"
status: outline
slug: new-institutions
audience:
  - European and middle-power institutions
  - public-interest technology builders
  - funders
  - civic infrastructure organizations
thesis: New institutions need technology that strengthens memory, sovereignty, accountability, distributed coordination, and regeneration rather than reproducing platform capture.
sourceEntities:
  - entityType: post
    id: institutional-memory
appendices:
  - title: Key Terms
    type: glossary
---

## Executive Summary

## The Institutional Crisis

## Why Existing Innovation Models Are Not Enough

## What New Institutions Need

## Design Principles for New Institutional Technology

## The Stack: How Our Technology Fits

## Use Cases

## Governance and Accountability

## A European / Middle-Power Innovation Strategy

## Roadmap / Implementation Path

## Conclusion: Infrastructure for What Comes Next

## Appendix: Key Terms
`;

export function createNewInstitutionsWhitepaper(
  overrides: Partial<Whitepaper> = {},
): Whitepaper {
  return createTestEntity<Whitepaper>("whitepaper", {
    id: "new-institutions",
    content: newInstitutionsWhitepaperContent,
    metadata: {
      title:
        "New Institutions: Technology for Sovereign, Regenerative, Distributed Coordination",
      slug: "new-institutions",
      status: "outline",
    },
    ...overrides,
  });
}
