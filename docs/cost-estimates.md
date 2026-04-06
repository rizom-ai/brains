# Cost Estimates

Estimated monthly API costs per brain using **gpt-4.1-mini** ($0.40/M input, $1.60/M output).

Embeddings via OpenAI `text-embedding-3-small` (1536d): $0.02/M tokens. A brain with 500 entities ≈ $0.001 to embed everything. Re-embedding on model change is negligible.

## Usage Tiers

| Tier   | Profile                                              | Conversations/day | Tokens/month | Cost/month |
| ------ | ---------------------------------------------------- | ----------------- | ------------ | ---------- |
| Casual | Personal knowledge base, occasional use              | ~10               | ~900K        | ~$0.50     |
| Active | Daily writing, content creation, social media        | ~30               | ~5M          | ~$2.50     |
| Heavy  | Team use, publishing pipeline, newsletter automation | ~100              | ~15M         | ~$7        |

### Assumptions

- Average conversation: 3,000–5,000 tokens (2–3 tool calls)
- Token split: ~70% input, ~30% output
- Active/Heavy tiers include background generation jobs (content pipeline, topic extraction, social posts)

## Per-Operation Costs

| Operation                               | Typical tokens | Cost   |
| --------------------------------------- | -------------- | ------ |
| Single conversation (search + response) | 3,000          | $0.002 |
| Blog post generation                    | 8,000          | $0.005 |
| Social post from blog                   | 5,000          | $0.003 |
| Newsletter generation                   | 10,000         | $0.006 |
| Topic extraction (per entity)           | 2,000          | $0.001 |
| Deck generation                         | 12,000         | $0.008 |

## Image Generation

Image generation via OpenAI (gpt-image / DALL-E) is separate:

| Model         | Cost per image |
| ------------- | -------------- |
| gpt-image-1.5 | ~$0.02–0.10    |

Most brains generate 0–5 images/day (cover images for posts, social media).

## Eval Costs

Running the eval suite (58 test cases):

| Component        | Model            | Cost per run |
| ---------------- | ---------------- | ------------ |
| Agent under test | gpt-4.1-mini     | ~$0.17       |
| LLM judge        | claude-haiku-4-5 | ~$0.70       |
| **Total**        |                  | **~$0.87**   |

## Model Comparison

Measured from eval runs (58 test cases, avg tokens per test):

| Model            | Avg tokens/test | Input price | Output price | Cost/test | Relative |
| ---------------- | --------------- | ----------- | ------------ | --------- | -------- |
| gpt-4.1-mini     | 3,762           | $0.40/M     | $1.60/M      | $0.003    | 1x       |
| claude-haiku-4-5 | 6,679           | $0.80/M     | $4.00/M      | $0.012    | 4x       |

## Bottom Line

**$1–5/month for most users.** API costs are dominated by conversation and content generation. Embeddings are negligible (~$0.01/month even for heavy users). Image generation is the biggest variable — 5 images/day at gpt-image-1.5 ≈ $3–15/month.
