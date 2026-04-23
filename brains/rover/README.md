# Rover

**Your personal knowledge catalyst**

You're an independent professional. A consultant, coach, creator, or expert of some kind. You have ideas worth sharing and expertise people want to tap into. But managing your knowledge, building your online presence, and staying accessible to clients — that's a lot of spinning plates.

Rover handles it. One system for your knowledge, your website, and your availability. All working together.

## What You Get

**A professional website** — Your essays, presentations, and projects published to the web. No WordPress, no page builders, no hiring a developer. Just write, and your site updates.

**An AI assistant** — Rover lives inside your brain (the digital one). It helps you think through ideas, find connections in your past work, and draft new content.

**A way to scale yourself** — Here's the interesting part: other people can talk to Rover too. Potential clients, collaborators, curious readers — they can chat with your collected knowledge even when you're not available.

## What Goes in Your Brain

Everything you think, write, and create:

- **Essays** — Long-form writing that establishes your expertise
- **Presentations** — Slide decks from talks and workshops
- **Notes** — Quick thoughts, drafts, works in progress
- **Links** — Interesting things you've found and want to remember
- **Projects** — Case studies and portfolio pieces
- **Social posts** — Content for LinkedIn, Twitter, and the like
- **Topics** — Themes that connect your ideas
- **Summaries** — Distilled versions of longer content

All stored as simple markdown files. No lock-in, no proprietary formats. Just text.

## Why Rover?

As an independent professional, your knowledge _is_ your product. But it's probably scattered — notes here, documents there, half-finished drafts everywhere. Hard to access, impossible to share.

Rover brings it together and makes it conversational. Chat with your own ideas. Ask Rover to help you think through a problem or find connections between things you wrote months apart. Use it as a sparring partner when you're developing new concepts.

And because others can chat with your Rover too, your expertise becomes accessible even when you're busy, asleep, or on vacation.

## The Flywheel

Here's what makes Rover different from a static website or a dumb chatbot: it gets smarter as you feed it.

Add an essay, and Rover can reference it in conversations. Capture a link, and Rover remembers what you found interesting about it. The more you put in, the more useful Rover becomes — better answers, sharper connections, more relevant suggestions.

But it works the other way too. Rover helps you create. Draft social posts from your essays. Generate summaries of your presentations. Turn rough notes into polished content. That content goes back into the brain, making Rover smarter still.

Your knowledge compounds. Your brain grows. Your website expands. All from the same flywheel.

## Your Brain, Their Conversation

When someone talks to your Rover, they're essentially having a conversation with your collected knowledge. Not a search engine — a thinking partner that understands your perspective.

Say you've written extensively about organizational design. Someone curious about the topic can chat with your Rover and explore your ideas interactively. They can push back, ask follow-up questions, and riff on your thinking. It's like they're sparring with you, except you don't have to be there.

You stay in control of what's in the brain. They get access to a knowledgeable conversation partner shaped by your ideas.

## Two Modes

**As the owner (anchor)**, you have full access. You can:

- Add notes, essays, and other content
- Organize and connect your ideas
- Generate summaries and social posts
- Build out your brain over time

**As a visitor**, you can:

- Chat with Rover about the brain's content
- Explore ideas and ask questions
- Use the owner's knowledge as a thinking partner
- Get perspectives informed by their work

## Talk to Rover Anywhere

Rover meets you where you are.

Available today:

- **MCP clients** like Claude Desktop and Cursor
- **Browser routes** for presets that include the webserver/dashboard/CMS surface
- **Discord** when configured
- **A2A** for peer-brain communication when configured

No special Rover-only app is required. Start from the interface that fits your setup.

## Your Website, Handled

Your brain isn't just a knowledge base — it's your professional website. A fast, clean site that showcases your essays, presentations, and projects. Your domain, your brand.

No separate CMS to manage. No deployment pipelines to figure out. Write an essay, mark it as published, and it's live. Add a case study to your portfolio, and it appears. Your brain and your website are the same thing.

This is what independent professionals actually need: a web presence that grows with their thinking, not a static brochure they have to manually update.

## Just Markdown

Here's what makes this work: everything is markdown.

Your brain is a folder of `.md` files. That's it. No database to manage, no proprietary format to worry about. If you can edit a text file, you can edit your brain.

This means you can use whatever tools you already love:

- **Obsidian** — Full-featured knowledge management with graph views and plugins
- **VS Code** — If you prefer a code editor
- **iA Writer** — For distraction-free writing
- **Vim** — If that's your thing
- **Any text editor** — Seriously, any of them

Your files sync bidirectionally. Edit in Obsidian, Rover sees it. Add something through Rover, it appears in your folder. The tools stay out of each other's way.

Version control works too. Your brain is just files, so Git works exactly as you'd expect. Track changes, branch experiments, roll back mistakes.

## Agent directory and peer brains

Rover can also talk to other brains, but it does that through a local agent directory rather than by calling arbitrary URLs directly.

Current model:

- if you explicitly **add/save** an agent, Rover saves that local directory entry and treats that explicit save as approval
- some discovery/review flows can still create **discovered** agents that need approval before calling
- if you try to contact an unknown or raw-URL agent, Rover should tell you to **add/save it first** rather than turning that into a wishlist item

This keeps peer-brain calling explicit and reviewable.

## Presets

Pick a preset in your `brain.yaml` to control what Rover can do:

| Capability / interface | `core` | `default` | `full` |
| ---------------------- | ------ | --------- | ------ |
| `prompt`               | x      | x         | x      |
| `note`                 | x      | x         | x      |
| `link`                 | x      | x         | x      |
| `wishlist`             | x      | x         | x      |
| `topics`               | x      | x         | x      |
| `directory-sync`       | x      | x         | x      |
| `agents`               | x      | x         | x      |
| `cms`                  | x      | x         | x      |
| `dashboard`            | x      | x         | x      |
| `mcp`                  | x      | x         | x      |
| `webserver`            | x      | x         | x      |
| `discord`              | x      | x         | x      |
| `a2a`                  | x      | x         | x      |
| `image`                |        | x         | x      |
| `blog`                 |        | x         | x      |
| `series`               |        | x         | x      |
| `decks`                |        | x         | x      |
| `analytics`            |        | x         | x      |
| `obsidian-vault`       |        | x         | x      |
| `site-info`            |        | x         | x      |
| `site-builder`         |        | x         | x      |
| `portfolio`            |        |           | x      |
| `content-pipeline`     |        |           | x      |
| `social-media`         |        |           | x      |
| `newsletter`           |        |           | x      |
| `stock-photo`          |        |           | x      |

- **`core`** — minimal on-ramp: capture, sync, dashboard + CMS, MCP/web/Discord/A2A, but no site-builder
- **`default`** — adds the website and publishing surface
- **`full`** — adds portfolio, automation, newsletter, and stock-photo workflows

Fine-tune with `add` and `remove`:

```yaml
preset: default
add:
  - portfolio
remove:
  - discord
```

## Get Your Own Rover

Want to set up your own brain with Rover? The whole thing is open source.

Check out the [Brains project on GitHub](https://github.com/rizom-ai/brains) to get started.

For development details, see the repository docs: [../../docs/architecture-overview.md](../../docs/architecture-overview.md) and [../../docs/brain-model.md](../../docs/brain-model.md).

---

_Rover is built on the Brains platform — a plugin-based system for personal knowledge management and AI-assisted thinking._
