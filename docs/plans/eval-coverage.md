# Plan: Eval Coverage Expansion

## Context

Rover evals pass at ~88% with 49 test cases. Target: 95%+ with 70+ test cases. The main gap: the eval brain has no content, so quality-dependent tests score low (search returns nothing, summaries have nothing to summarize, history has nothing to show).

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
brain: "@brains/rover"
preset: pro
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

### Phase 1: Test content repo

1. Create `rizom-ai/eval-content` GitHub repo
2. Add ~15-20 entities across 7 types
3. Multiple commits for history coverage
4. Update eval brain.yaml to point to test content repo
5. Verify: eval brain starts with content loaded

### Phase 2: New test cases

1. Add entity type resolution tests (4 cases)
2. Add content-dependent quality tests (3 cases)
3. Add operation tests (5 cases)
4. Add history tests (3 cases)
5. Run evals — measure improvement

### Phase 3: Agent instruction tuning

Based on Phase 2 results, update agent instructions:

1. Add entity type mapping hints if agent gets types wrong
2. Improve search behavior instructions if quality tests fail
3. Iterate until 95%+ pass rate

## Verification

1. Eval brain starts with 15+ entities from test content repo
2. 70+ test cases total (49 existing + ~15 new)
3. Pass rate ≥ 95%
4. Search-dependent tests score helpfulness ≥ 4 (have content to work with)
5. History tests pass with real git history
6. Entity type resolution tests pass without user correction
