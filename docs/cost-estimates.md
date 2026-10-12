# Cost Estimates

Estimated monthly API costs per brain using **gpt-6-luna** with `low`
reasoning (the default across all brains). Dollar figures are illustrative,
using OpenAI's published uncached rates of $0.10/M input and $0.50/M output.
Prompt caching can reduce actual input cost: cached input is $0.01/M.

Embeddings via OpenAI `text-embedding-3-small` (1536d): $0.02/M tokens. A brain with 500 entities ≈ $0.001 to embed everything. Re-embedding on model change is negligible.

## Usage Tiers

| Tier   | Profile                                              | Conversations/day | Tokens/month | Cost/month |
| ------ | ---------------------------------------------------- | ----------------- | ------------ | ---------- |
| Casual | Personal knowledge base, occasional use              | ~10               | ~900K        | ~$0.20     |
| Active | Daily writing, content creation, social media        | ~30               | ~5M          | ~$1.10     |
| Heavy  | Team use, publishing pipeline, newsletter automation | ~100              | ~15M         | ~$3.30     |

### Assumptions

- Average conversation: 3,000–5,000 tokens (2–3 tool calls)
- Token split: ~70% input, ~30% output
- Active/Heavy tiers include background generation jobs (content pipeline, topic extraction, social posts)

## Per-Operation Costs

| Operation                               | Typical tokens | Cost    |
| --------------------------------------- | -------------- | ------- |
| Single conversation (search + response) | 3,000          | $0.0007 |
| Blog post generation                    | 8,000          | $0.0018 |
| Social post from blog                   | 5,000          | $0.0011 |
| Newsletter generation                   | 10,000         | $0.0022 |
| Topic extraction (per entity)           | 2,000          | $0.0004 |
| Deck generation                         | 12,000         | $0.0026 |

## Image Generation

Image generation via OpenAI (gpt-image / DALL-E) is separate:

| Model         | Cost per image |
| ------------- | -------------- |
| gpt-image-1.5 | ~$0.02–0.10    |

Most brains generate 0–5 images/day (cover images for posts, social media).

## Eval Costs

One pass over the four canonical suites (headless, personal, professional,
team: 191 evaluated runs) cost about **$0.52** with GPT-6 Luna at low
reasoning in the October 2026 qualification, before prompt-cache discounts.
The fixed `gpt-5.4-mini` judge is billed separately; judge usage is not
included in the eval reporter's agent token totals.

## Model Comparison

Agent usage per pass over the four canonical suites, averaged over five
samples on identical code in October 2026. Costs use published uncached rates
and exclude the fixed judge:

| Model / configuration | Avg input tokens/pass | Avg output tokens/pass | Input price | Output price | Cost/pass | Relative |
| --------------------- | --------------------: | ---------------------: | ----------: | -----------: | --------: | -------: |
| gpt-5.6-luna, low     |             4,725,691 |                 32,036 |     $0.20/M |      $1.20/M |     $0.98 |    1.00x |
| gpt-6-luna, low       |             5,094,726 |                 23,185 |     $0.10/M |      $0.50/M |     $0.52 |    0.53x |

## Bottom Line

**Approximately $0.20–3.50/month for most users before prompt-cache discounts.**
API costs are dominated by conversation and content generation. Embeddings
remain negligible. Image generation is the biggest variable — 5 images/day at
gpt-image-1.5 is roughly $3–15/month.
