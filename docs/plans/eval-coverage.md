# Plan: Eval Coverage Expansion

## Context

Rover evals pass at 85% with 60 test cases. Target: 95%+. Eval-content directory with fictional test data (12 entities) and pre-built DB now provides content for search, quality, and history tests.

**This plan is also a prerequisite for [Search Quality](./search-quality.md)** — search quality Phase 0 (baseline measurement) requires a brain with real content to produce meaningful distance distributions. Phase 1 (test content repo) unblocks both eval coverage expansion and search quality tuning.

## Problems

### Empty brain

The eval brain starts fresh every run — empty database, no entities. Tests that depend on existing content fail or score poorly:

- "What have I written about X?" → search returns nothing → low helpfulness score
- "Show me the history of post Y" → entity doesn't exist
- "Summarize my recent posts" → no posts to summarize

### Entity type mapping

The agent doesn't always know the mapping between user-facing names and entity types:

- "deck" → entity type `deck` (not `presentation`)
- "blog post" / "essay" → entity type `post`
- "case study" → entity type `project`

### Missing test coverage

No test cases for: entity history, content insights, system_update variations, system_extract, error handling (delete non-existent entity), multi-entity workflows.

## Test content repo

A git repo with curated test content that the eval brain clones on startup. Same mechanism as production (directory-sync clones from `git.gitUrl`). The content is realistic but minimal — enough to exercise search, history, and quality tests.

```
rizom-ai/eval-content/
  post/
    urging-new-institutions.md     # blog post with topics
    the-future-of-work-is-play.md  # blog post with cover image
    ecosystem-architecture.md      # blog post in a series
  deck/
    have-your-agent-call-my-agent.md  # presentation
  note/
    typescript-patterns.md          # knowledge note
    deployment-checklist.md         # practical note
  link/
    atproto-docs.md                 # curated bookmark
  series/
    institutional-design.md         # series linking posts
  topic/
    architecture.md                 # extracted topic
    typescript.md
```

~15-20 entities across 7 types. Enough for search to return meaningful results, history to have commits, and quality tests to reference real content.

### How it's loaded

The eval brain.yaml points to the test content repo:

```yaml
brain: rover
preset: full
mode: eval

plugins:
  directory-sync:
    git:
      gitUrl: "https://github.com/rizom-ai/eval-content.git"
```

On startup, directory-sync clones the repo and imports the entities. The eval runs against a brain with real content.

### Git history for history tests

The test content repo has multiple commits — entities were added and modified over time. This gives the history tool actual commit history to work with.

## New test cases

### Entity type resolution

| Test                | Prompt                              | Expected tool + args                            |
| ------------------- | ----------------------------------- | ----------------------------------------------- |
| entity-history      | "Show me the history of the deck X" | `directory-sync_history { entityType: "deck" }` |
| entity-history-blog | "History of my blog post X"         | `directory-sync_history { entityType: "post" }` |
| list-essays         | "List my essays"                    | `system_list { entityType: "post" }`            |
| list-case-studies   | "List my case studies"              | `system_list { entityType: "project" }`         |

### Content-dependent quality

| Test                | Prompt                                               | Criteria                                           |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| search-with-results | "What have I written about architecture?"            | search called, results referenced, helpfulness ≥ 4 |
| summarize-content   | "Summarize my recent blog posts"                     | list called, content referenced, accuracy ≥ 4      |
| cross-reference     | "Which of my posts relate to the deck about agents?" | search + get called, connections identified        |

### Operations

| Test               | Prompt                                                            | Expected                                 |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------- |
| update-title       | "Change the title of note 'typescript-patterns' to 'TS Patterns'" | `system_update` called with correct args |
| update-content     | "Add a section about generics to the typescript-patterns note"    | `system_update` called                   |
| extract-topics     | "Extract topics from my blog posts"                               | `system_extract` called                  |
| delete-nonexistent | "Delete the note 'does-not-exist'"                                | `system_delete` called, graceful error   |
| insights-topics    | "What are my most common topics?"                                 | `system_insights` called                 |

### History

| Test                        | Prompt                                   | Expected                                         |
| --------------------------- | ---------------------------------------- | ------------------------------------------------ |
| entity-history              | "Show me the history of deck X"          | `directory-sync_history { entityType: "deck" }`  |
| entity-history-blog         | "History of blog post X"                 | `directory-sync_history { entityType: "post" }`  |
| entity-history-show-version | "Show me the previous version of post X" | history called twice (list + show) or list + get |

## Steps

### Phase 1: Eval content — DONE (2026-03)

1. Created `brains/rover/eval-content/` with 12 fictional entities (Alex Chen persona)
2. Pre-built `brain.db` with entities + embeddings (skips sync wait)
3. Build script: `brains/rover/scripts/build-eval-db.ts` (monitors job queue drain)
4. Eval runner uses eval-content instead of seed-content, loads pre-built DB

### Phase 2: New test cases — DONE (2026-03)

1. Entity type resolution: list-essays, list-case-studies (2 cases)
2. Content-dependent quality: search-with-results, summarize-content, cross-reference (3 cases)
3. Operations: update-title, extract-topics, delete-nonexistent, insights-topics (4 cases)
4. History: entity-history, entity-history-blog (2 cases, existed)
5. Entity type mapping + targetEntityType fixes in agent instructions

### Phase 3: Agent instruction tuning — IN PROGRESS

Current: 85% pass rate (51/60). Remaining failures:

- Flaky LLM variability (search scores, verbose repetition)
- Social media queue tool not called
- Some create/update tests inconsistent

Next:

1. Stabilize flaky tests (adjust thresholds or make prompts more deterministic)
2. Fix social media queue test (agent instruction or test prompt)
3. Add more test cases toward 70+ total
4. Iterate until 95%+

## Verification

1. Eval brain starts with 12+ entities from eval-content (pre-built DB)
2. 60+ test cases (target 70+)
3. Pass rate ≥ 95%
4. Search-dependent tests score helpfulness ≥ 4
5. Entity type resolution tests pass without user correction
