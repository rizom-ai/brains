# Rover Pilot User Onboarding

Welcome to the Rover pilot.

This document is written for **first-time users**. You do **not** need prior experience with Rover, MCP, git, or the rest of the system to get started.

## What Rover is

Rover is your private AI assistant for working with your own notes, links, and ideas.

In this pilot, Rover is intentionally simple:

- you talk to it through an **MCP client**
- **there is no website to browse**
- Discord is optional
- Obsidian fits through the git-sync/content-repo workflow, not as the main chat interface

You can think of Rover as a private knowledge companion that helps you:

- save notes
- save links
- reflect on your own material
- find patterns in what you have collected
- think through questions with AI

## What you will receive from us

We will send you the details you need to connect.

That usually includes:

- your Rover URL: `https://<handle>.rizom.ai/mcp`
- your **Bearer token**
- confirmation of whether Discord is enabled for you
- if needed, an invite to your **private** Rover content repo
- any extra instructions if we are testing a specific workflow with your cohort

Treat the **Bearer token** like a password. Do not share it.

## One important idea: MCP is just the connection method

If you have never used MCP before, the shortest explanation is:

- **Rover** is the assistant
- **MCP** is the way your AI client connects to Rover

You do not need to understand the protocol details.

For the pilot, the practical meaning is simple:

- open a supported client
- add your Rover URL
- paste your Bearer token
- start talking to Rover

## What to use first

For most users, the easiest first setup is:

- **Claude Desktop** for talking to Rover
- **Obsidian** only if you also want to work directly with markdown files later
- **Discord** only if we explicitly enable it for you

## How to connect

Use an MCP client that supports:

- **HTTP / Streamable HTTP MCP**
- **Bearer token authentication**

When your client asks for connection details, use:

- **Server URL:** `https://<handle>.rizom.ai/mcp`
- **Authentication type:** Bearer token
- **Bearer token:** the token we sent you

If the client asks for a name, use something simple like:

- `Rover (<handle>)`

## Claude Desktop setup

If your Claude Desktop version supports connecting to a **remote HTTP / Streamable HTTP MCP server**, enter:

- **Server URL:** `https://<handle>.rizom.ai/mcp`
- **Authentication:** Bearer token
- **Token:** the token we sent you

Then try a first message like:

> What can you help me do, and what should I use you for?

Or:

> Help me save my first note.

If your Claude Desktop version only supports local MCP servers and not remote HTTP MCP cleanly, tell us what version you are using and we will help you.

## Your first 5 minutes

Once you are connected, try this sequence:

### 1. Check that Rover responds

Ask:

> What can you help me do?

### 2. Save a first note

Ask:

> Save a note: I want to use Rover to collect ideas from my work, reading, and conversations.

### 3. Save a useful link

Ask:

> Save this link and note why it matters to me: <paste URL>

### 4. Ask Rover to reflect back what it knows

Ask:

> Based on what I’ve stored so far, what themes are starting to emerge?

### 5. Use it as a thinking partner

Ask:

> I am thinking through a problem in my work. Help me structure the question and identify what context is missing.

## Wishlist: when Rover cannot do something yet

Rover has a built-in **wishlist**.

This is important for first-time users because Rover will not be able to do everything yet.

If you ask for something Rover cannot do, it should add that request to the wishlist instead of just failing silently.

You can think of the wishlist as:

- a backlog of missing capabilities
- a record of things users want Rover to do
- a way for the pilot team to see which missing features matter most

### When the wishlist is useful

The wishlist is especially useful when you ask Rover to do something like:

- connect to a tool it does not support yet
- perform an action it cannot perform yet
- add a workflow or feature that does not exist yet

Examples:

> I want Rover to draft and send emails for me.

> I want Rover to connect to my calendar.

> I want Rover to summarize voice notes automatically.

If Rover cannot actually do those things yet, it should tell you that and add the request to the wishlist.

### What happens when something is added to the wishlist

When a request is added to the wishlist:

- it is saved as a **wish**
- it starts in a **new** state
- similar requests can be grouped together instead of creating endless duplicates
- repeated demand can increase the count of how many times that wish was requested

That helps us see which gaps are one-off ideas and which ones keep coming up across real usage.

### How you should use it

You do **not** need special commands.

Just ask naturally.

If Rover cannot do what you asked, a good response from Rover is something like:

- it explains the limitation clearly
- it says the request was added to the wishlist

If that does **not** happen, that is useful feedback for us too.

## Obsidian

Obsidian is part of the pilot through the **git-synced content repo workflow**, not through MCP.

That means:

- use **Claude Desktop** as the main way to talk to Rover
- use **Obsidian** if you want to browse, draft, and edit markdown files directly
- Rover can pick up those file changes through the normal git-sync / directory-sync flow

A simple mental model:

- **Claude Desktop** = talk to Rover
- **Obsidian** = edit the underlying notes

### Important: your content repo is private

If you use the Obsidian/git workflow, you will be working in your own **private** GitHub repo.

That means:

- you do **not** need repo access just to use Rover through MCP
- you **do** need GitHub access if you want to clone, edit, and push to your content repo
- we will invite you only to **your own** content repo, not to the operator repo and not to other users' repos

### How you get access

If you want the Obsidian/git workflow, we will:

1. create or confirm your private content repo
2. invite your GitHub account to that repo
3. ask you to accept the GitHub invite
4. send you the repo URL

### Easiest setup for most users

The easiest path for most first-time users is:

1. install **GitHub Desktop**
2. accept the repo invite in GitHub
3. clone the private repo with GitHub Desktop
4. open the cloned folder as an Obsidian vault
5. optionally install the **Obsidian Git** plugin if you want in-app commit/push/pull support
6. edit your markdown notes
7. commit and push your changes

### Authentication options

To work with a private repo, you need GitHub authentication.

Usually the easiest order is:

1. **GitHub Desktop** or normal GitHub sign-in
2. **SSH key** if you already use git that way
3. a **fine-grained personal access token** only if another tool specifically requires it

You do **not** need a personal access token just to use Rover through MCP.

If we have already shared your content repo workflow with you, the normal setup is:

1. clone your Rover content repo locally
2. open that folder as an Obsidian vault
3. optionally install the **Obsidian Git** plugin if you want in-app commit/push/pull support
4. edit or organize your markdown notes there
5. commit and push your changes through normal git or the Obsidian Git plugin
6. let the normal git-sync flow carry those changes into Rover

If we have **not** given you a direct content repo workflow yet, that is fine. You can ignore Obsidian for now and use Rover purely through MCP.

## Discord (optional)

Discord is optional in this pilot.

If it is enabled for you, think of it as a lightweight secondary interface for:

- quick note capture
- dropping in links to save
- short questions when you do not want to open Claude Desktop

Important:

- **MCP remains the main interface**
- Discord is **off by default**
- if you want Discord, tell us explicitly
- for this pilot, Discord-enabled users may need to supply their own bot token
- if Discord is enabled, we will send the exact invite/setup steps separately

If Discord is **not** enabled for you, that is completely normal.

## What to expect in the pilot

This is a real working system, but it is still an early pilot.

So you should expect:

- some rough edges
- a setup process that may still be a bit manual
- a Rover that becomes more useful as you add more notes and links
- occasional follow-up questions from us about your experience
- improvements and changes during the pilot

That is normal. The point of the pilot is to learn from real use.

## Privacy and boundaries

For the pilot:

- your Rover is deployed specifically for you
- access to `/mcp` is protected by your Bearer token
- you should avoid putting highly sensitive material into the pilot unless we have explicitly agreed that it is in scope

If you are unsure whether something belongs in Rover, ask us first.

## Troubleshooting

### I opened the domain and it does not look like a normal site

That is expected. In this pilot, **there is no website to browse**. Rover core is MCP-first.

### I got an authentication error

Usually this means one of three things:

- the Bearer token was missing
- the Bearer token was pasted incorrectly
- the client is using the wrong authentication type

Double-check that you are using:

- URL: `https://<handle>.rizom.ai/mcp`
- auth type: **Bearer token**
- token: exactly the token we sent you

### My MCP client says it cannot connect

Some clients support local MCP servers better than remote HTTP MCP servers.

If that happens, send us:

- the name of the client
- the version you are using
- the exact error message
- a screenshot if possible

## What feedback helps us most

We especially want to hear:

- what was confusing during setup
- what felt useful immediately
- what felt weak, awkward, or unclear
- what you expected Rover to do but could not get it to do
- whether you would keep using it after the pilot

Short, honest feedback is perfect.

## Quick handoff template

When we onboard you, the message will look roughly like this:

```text
Rover URL: https://<handle>.rizom.ai/mcp
Auth type: Bearer token
Bearer token: <token>
Discord enabled: yes/no
```

If anything is unclear, reply with the exact error text or a screenshot and we will help.
