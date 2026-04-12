# Plan: Monetization

## Goal

Define and validate a business model for hosted rovers while keeping the framework itself open source and self-hostable.

## Working model

Use an open-core / managed-hosting model:

- free: the software, self-hosted
- paid: hosted rovers operated by Rizom

The hosted offer should sell convenience, operations, and managed lifecycle work — not artificial feature limits in the core product.

## Open work

### 1. Validate willingness to pay

Before building billing/product infrastructure, confirm that people will actually pay for a manually hosted rover.

Gate:

1. get 5 paying customers
2. keep them for at least 3 months
3. use retention and support load to judge whether the offer is real

### 2. Define the initial hosted offer

The first offer needs a simple, testable scope:

- hosted rover under a Rizom-managed subdomain
- managed deploys, updates, backups, SSL, and monitoring
- bring-your-own AI API keys by default
- clear storage and support expectations

Pricing can stay simple at first, but it needs to be explicit enough to sell manually.

### 3. Decide what must exist before charging

Hosted monetization depends on adjacent platform work landing to a usable degree.

Most important dependencies:

- hosted rover provisioning path
- stable standalone deploy/operator path
- enough monitoring/admin visibility to operate customer instances safely
- multi-user only if team-tier hosting is actually offered

### 4. Keep billing/admin work scoped to the proven offer

Do not build self-serve billing, signup funnels, or usage-based complexity until the manual-hosting phase proves demand.

Only after validation should follow-on work be scoped for:

- signup flow
- Stripe subscriptions
- usage tracking
- admin dashboard
- automated provisioning

### 5. Revisit pricing after real operator data exists

The current pricing ideas are placeholders. They should be revised only after there is real data on:

- support burden
- infra cost per brain
- average storage/build usage
- churn and retention

## Non-goals

- plugin/theme marketplace work
- AI token resale as a default offer
- enterprise packaging before real demand exists
- building self-serve SaaS before manual hosting is validated

## Done when

1. manual hosted rovers have paying users
2. pricing is informed by real support/cost data
3. there is a clear yes/no decision on whether to invest in self-serve billing and provisioning
