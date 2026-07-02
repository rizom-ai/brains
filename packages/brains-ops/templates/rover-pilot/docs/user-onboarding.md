# Welcome to Rover

---

Most of us have more thinking happening than we can hold onto. Ideas show up in the wrong moment, notes land in five different places, and half of what you've figured out is effectively invisible by the time you need it again.

Rover is built for that problem. It's a private space where your thinking accumulates — notes, links, fragments, half-formed ideas — and an AI that can work with all of it. Find things you saved months ago. Connect dots across topics. Turn a rough note into a draft. The more you put in, the more useful it gets. And if another Rover user is in your network, your Rovers can talk to each other — share knowledge, work on something together — just by asking.

---

## What Rover is

Rover is your private knowledge companion. It holds your notes, links, and ideas — and helps you think with them, not just store them.

Ask it a question and it searches what you've saved. Give it a fragment of thinking and it can help you turn it into something.

---

## Getting in

We'll send you a personal URL — something like `https://<handle>.rizom.ai/`.

When you open it for the first time, you'll be asked to set a passkey. Do that once and you're in. No passwords to remember.

From there, your three main interfaces are:

- **Chat** (`/chat`) — where you talk to Rover
- **Dashboard** (`/`) — an overview of your Rover
- **CMS** (`/cms`) — a browser editor for your content

Start with Chat. Everything else follows from there.

---

## Your first five minutes

1. Open your Chat URL. A good first message:
   > Help me save my first note.
2. Save something — a thought, a link, an idea. Doesn't need to be polished.
3. Ask Rover about it. See what comes back.

That loop — save, ask, get something useful back — is the core of how Rover works.

---

## The Chat and the CMS: when to use which

**Chat** is for thinking out loud, asking questions, saving things quickly, and using Rover as a day-to-day thinking partner.

**CMS** is for when you want to deliberately create or edit content — browsing your notes, making clean edits, working more like an editor than a conversationalist.

Most people spend most of their time in Chat. The CMS becomes useful once you have something worth editing.

---

## Other ways to chat with Rover

`/chat` is the primary interface, but Rover can also be reached through messaging platforms. Discord is tested and working. Slack, WhatsApp Business, and similar should work out of the box — we'll send setup steps if that's part of your configuration.

**Talking to another Rover**

If you know another Rover user, you can add them to your contacts and call their Rover directly from your chat.

- To add: _Add jane.rizom.ai to my contacts._
- To call: _Call jane.rizom.ai and ask [your question]._

You'll need their address — in the format `name.rizom.ai` — which they can share with you directly.

---

## Connecting Rover to other tools

Rover can connect to external tools via MCP — a standard protocol that works in two directions: agentic AI clients (like Claude Desktop) can use it to talk to Rover, and Rover can use it to talk to productivity tools like Notion or Linear.

Plugins exist for a number of tools already, and new ones can be built quickly in response to what you actually need. If there's a tool you'd want Rover to connect to, tell us.

If MCP is part of your setup, we'll send specific instructions alongside your URL.

---

## This is a pilot

Rover works. But it's not finished.

You'll hit rough edges. Some things you try won't work. Some things you expect to be there won't be yet. That's normal — and it's actually why you're here.

There's a ceiling on how much Rover can improve without real people using it on real problems. We've reached that ceiling on our own. Your usage is what lets the product become what it's capable of becoming. A single Rover in isolation can only do so much — the network only becomes real when there are enough active, populated Rovers in it.

Rover has a built-in wishlist. If you ask it to do something it can't do yet, it should tell you clearly and log the request — that goes back to us as a signal for where the product needs to go next.

When something breaks or falls short, tell us: what you were trying to do, what you expected, and what happened instead.

---

## Presets

Rover is available in three presets: `core`, `default`, and `full`. Most pilot partners are onboarded on `core` — it's the most stable version, which is why we start there.

Some features you may have seen demoed or discussed might not be available in your current preset. If something seems like it should work but doesn't, it may be a preset limitation rather than a bug. Reach out and we'll clarify — and can bump you up if it makes sense.

---

## Common questions

**How do I access my data?**
Your primary interface is the CMS (`/cms`), where you can browse and edit everything you've saved. If you're set up with GitHub access, your content also lives in a private repository you can access directly.

**Who can see my content?**
Every piece of content in Rover has a visibility level:

- **Restricted** — visible to you only
- **Shared** — visible to agents you've connected to (trusted contacts)
- **Public** — visible to anyone

By default all content is public — this is how knowledge sharing can flourish. However, at any point your content visibility can be granularly updated.

Similarly, every agent in your network has a trust level:

- **Anchor** — you
- **Trusted** — agents you've explicitly connected to
- **Public** — everyone else

_Default visibility settings and where to configure them — to be added._

**Does Rover connect to the internet?**
No — and that's intentional. Rover works with what you've put into it, not with whatever the internet currently says. That means its answers are grounded in your actual knowledge base, not in generic search results.

**What does this cost?**
Nothing during the pilot. We cover hosting costs while you're part of the programme.

**The CMS isn't showing my latest changes from chat.**
The CMS syncs automatically every few minutes. If you've just edited something in chat and need it reflected in the CMS immediately, run `sync` in chat and it'll update straight away.

**Rover isn't doing something I think it should be able to do.**
Some interactions require specific phrasing — Rover is still being fine-tuned to handle natural language variations. A few examples of what works reliably:

- To connect to another agent: _Connect to agent jane.rizom.ai_
- To call a connected agent: _Call jane.rizom.ai and ask about [topic]_
- Note that `topic` is a reserved term in Rover — it refers to themes derived from your knowledge base. Using it in a different context may confuse Rover; try rephrasing if that happens.

If something still isn't working, tell us — this list will grow as we identify patterns.

---

## Your access details

When we onboard you, we'll send something like:

```
Chat URL: https://<handle>.rizom.ai/chat
Dashboard URL: https://<handle>.rizom.ai/
CMS URL: https://<handle>.rizom.ai/cms
Discord: yes/no — setup steps below if yes
MCP: enabled/not enabled — details below if enabled
```

If anything is unclear, reply with what you're seeing and we'll help.
