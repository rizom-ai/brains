# Cost Estimates

Estimated monthly API costs per brain using **gpt-5.6-luna** with `low`
reasoning (the default across all brains). Dollar figures are illustrative,
using standard uncached API rates of $1.00/M input and $6.00/M output. Prompt
caching can reduce actual input cost.

Embeddings via OpenAI `text-embedding-3-small` (1536d): $0.02/M tokens. A brain with 500 entities ≈ $0.001 to embed everything. Re-embedding on model change is negligible.

## Usage Tiers

| Tier   | Profile                                              | Conversations/day | Tokens/month | Cost/month |
| ------ | ---------------------------------------------------- | ----------------- | ------------ | ---------- |
| Casual | Personal knowledge base, occasional use              | ~10               | ~900K        | ~$2        |
| Active | Daily writing, content creation, social media        | ~30               | ~5M          | ~$13       |
| Heavy  | Team use, publishing pipeline, newsletter automation | ~100              | ~15M         | ~$38       |

### Assumptions

- Average conversation: 3,000–5,000 tokens (2–3 tool calls)
- Token split: ~70% input, ~30% output
- Active/Heavy tiers include background generation jobs (content pipeline, topic extraction, social posts)

## Per-Operation Costs

| Operation                               | Typical tokens | Cost   |
| --------------------------------------- | -------------- | ------ |
| Single conversation (search + response) | 3,000          | $0.008 |
| Blog post generation                    | 8,000          | $0.020 |
| Social post from blog                   | 5,000          | $0.013 |
| Newsletter generation                   | 10,000         | $0.025 |
| Topic extraction (per entity)           | 2,000          | $0.005 |
| Deck generation                         | 12,000         | $0.030 |

## Image Generation

Image generation via OpenAI (gpt-image / DALL-E) is separate:

| Model         | Cost per image |
| ------------- | -------------- |
| gpt-image-1.5 | ~$0.02–0.10    |

Most brains generate 0–5 images/day (cover images for posts, social media).

## Eval Costs

The Rover core suite expands to 119 evaluated cases. In July 2026 controlled
runs, the Luna agent averaged about **$1.70 per run** before prompt-cache
discounts. The fixed `gpt-5.4-mini` judge is billed separately; judge usage is
not currently included in the eval reporter's agent token totals.

## Model Comparison

Observed Rover core agent usage from controlled July 2026 runs. Costs use
uncached standard rates and exclude the fixed judge:

| Model / configuration | Avg input tokens/run | Avg output tokens/run | Input price | Output price | Cost/run | Relative |
| --------------------- | -------------------: | --------------------: | ----------: | -----------: | -------: | -------: |
| gpt-5.4-mini, default |            1,707,247 |                 8,326 |     $0.75/M |      $4.50/M |    $1.32 |    1.00x |
| gpt-5.6-luna, low     |            1,635,884 |                10,592 |     $1.00/M |      $6.00/M |    $1.70 |    1.29x |

## Bottom Line

**Approximately $2–15/month for most users before prompt-cache discounts.**
API costs are dominated by conversation and content generation. Embeddings
remain negligible. Image generation is the biggest variable — 5 images/day at
gpt-image-1.5 is roughly $3–15/month.
