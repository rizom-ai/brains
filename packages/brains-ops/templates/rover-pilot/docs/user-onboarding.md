# Rover Pilot User Onboarding

Welcome to the Rover pilot.

This document is written for **first-time users**. You do **not** need prior experience with Rover, MCP, git, or the rest of the system to get started.

## What Rover is

Rover is your private AI assistant for working with your own notes, links, and ideas.

In this pilot, Rover is intentionally simple:

- you will usually talk to it in **Discord**
- you can also use the **Dashboard** in your browser at `https://<handle>.rizom.ai/`
- you can edit content in the **CMS** at `https://<handle>.rizom.ai/cms`
- the CMS uses a **GitHub token** because your content lives in a private GitHub repo
- **MCP is optional** and only needed for direct client access or specific testing workflows
- **git** and **Obsidian** are optional if you want to work with the underlying files directly

You can think of Rover as a private knowledge companion that helps you:

- save notes
- save links
- reflect on your own material
- find patterns in what you have collected
- think through questions with AI

## What you will receive from us

We will send you the details you need to get started.

That usually includes:

- confirmation that Discord is enabled for you, plus the invite/setup steps
- your **Dashboard URL**: `https://<handle>.rizom.ai/`
- your **CMS URL**: `https://<handle>.rizom.ai/cms`
- if you will use the CMS, an invite to your **private** Rover content repo plus instructions for creating a GitHub token
- if needed, your Rover MCP URL: `https://<handle>.rizom.ai/mcp`
- if needed, your **Bearer token**
- any extra instructions if we are testing a specific workflow with your cohort

If we give you a **Bearer token**, treat it like a password. Do not share it.

## One important idea: Discord + Dashboard + CMS are the default, MCP is optional

If you are new to Rover, the shortest explanation is:

- **Rover** is the assistant
- **Discord** is the default chat interface
- the **Dashboard** is the default browser view
- the **CMS** is the default browser editing interface
- **MCP** is an optional direct connection method for supported AI clients

You do not need to understand the protocol details unless we specifically ask you to use MCP.

For most users, the practical meaning is simple:

- join Discord
- open your dashboard in the browser
- use the CMS when you want to edit structured content directly
- start using it

If your cohort is also testing MCP, we will send the URL, Bearer token, and setup help separately.

## What to use first

For most users, the easiest first setup is:

- **Discord** for talking to Rover
- the **Dashboard** at `https://<handle>.rizom.ai/` for the browser view
- the **CMS** at `https://<handle>.rizom.ai/cms` for editing, using a GitHub token
- a normal **git repo of markdown/text files** only if you also want to work directly with your content later
- **Obsidian** only if you want a friendlier interface for those same files
- **Claude Desktop** or another MCP client only if we explicitly ask you to test a direct MCP workflow

## Default setup: Discord + Dashboard + CMS

For most users, getting started means:

- join the Discord server we send you
- open your Dashboard at `https://<handle>.rizom.ai/`
- open the CMS at `https://<handle>.rizom.ai/cms`
- when the CMS asks for GitHub access, use a fine-grained GitHub token with access to your private Rover content repo
- send a first message in Discord and try a first edit in the CMS

Try a first message like:

> What can you help me do, and what should I use you for?

Or:

> Help me save my first note.

If Discord is not enabled for you yet, tell us and we will share the right next step.

In the browser, a good first check is:

- the Dashboard loads at `https://<handle>.rizom.ai/`
- the CMS loads at `https://<handle>.rizom.ai/cms`
- after you enter your GitHub token, you can see your collections and content

## Optional: direct MCP access

If we have asked you to use an MCP client, use one that supports:

- **HTTP / Streamable HTTP MCP**
- **Bearer token authentication**

When your client asks for connection details, use:

- **Server URL:** `https://<handle>.rizom.ai/mcp`
- **Authentication type:** Bearer token
- **Bearer token:** the token we sent you

If the client asks for a name, use something simple like:

- `Rover (<handle>)`

## Optional: Claude Desktop setup

If we ask you to connect through Claude Desktop and your version supports a **remote HTTP / Streamable HTTP MCP server**, enter:

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

## Git, text files, and Obsidian

The underlying content workflow is still a normal **git repo** with normal **markdown/text files**.

But for this pilot, treat that as **optional**.

The default setup is:

- **Discord** = talk to Rover
- **Dashboard** = browser overview
- **CMS** = browser editing interface

Use direct git or file-based workflows only if you want more control.

Obsidian is optional. It is just one possible editor for those files.

That means:

- use **Discord** as the main way to talk to Rover
- use the **Dashboard** and **CMS** as the normal browser workflow
- use a normal editor plus **git** only if you want to browse, draft, and edit your files directly
- use **Obsidian** only if you want a more note-focused interface for the same files
- Rover can pick up those file changes through the normal git-sync / directory-sync flow

A simple mental model:

- **Discord** = talk to Rover
- **Dashboard** = see Rover in the browser
- **CMS** = edit Rover content in the browser
- **git repo + text files** = the underlying content
- **Obsidian** = an optional editor for that content

### Important: your content repo is private

If you use the git/text-file workflow, you will be working in your own **private** GitHub repo.

That means:

- you do **not** need repo access just to use Rover in Discord or through MCP
- you **do** need GitHub access if you want to clone, edit, and push to your content repo
- we will invite you only to **your own** content repo, not to the operator repo and not to other users' repos

### How you get access

If you want the git/text-file workflow, we will:

1. create or confirm your private content repo
2. invite your GitHub account to that repo
3. ask you to accept the GitHub invite
4. send you the repo URL

### Easiest setup for most users

The easiest path for most first-time users is:

1. install **GitHub Desktop**
2. accept the repo invite in GitHub
3. clone the private repo with GitHub Desktop
4. open the cloned folder in your normal editor and edit the markdown/text files directly
5. optionally open that same folder as an **Obsidian** vault if you prefer
6. commit and push your changes

### Authentication options

To work with a private repo or the CMS, you need GitHub authentication.

Usually the easiest order is:

1. **GitHub sign-in** to accept the private repo invite
2. a **fine-grained personal access token** for the CMS, with access to your private Rover content repo
3. **GitHub Desktop** or normal git auth if you also want to clone the repo locally
4. **SSH key** only if you already use git that way

You do **not** need a GitHub token just to use Rover in Discord.
You do **not** need an MCP Bearer token unless we explicitly ask you to use MCP.

If we have already shared your content repo workflow with you, the normal setup is:

1. clone your Rover content repo locally
2. edit the markdown/text files in your normal editor, or open that same folder as an Obsidian vault if you prefer
3. optionally install the **Obsidian Git** plugin if you want in-app commit/push/pull support
4. edit or organize your notes there
5. commit and push your changes through normal git, GitHub Desktop, or the Obsidian Git plugin
6. let the normal git-sync flow carry those changes into Rover

If we have **not** given you a direct content repo workflow yet, that is fine. You can ignore git, text files, and Obsidian for now and use Rover in Discord. If we have also asked you to test MCP, you can use that too.

## Discord (default chat interface)

Discord is the default chat interface for this pilot.

Think of it as the main place to:

- save quick notes
- drop in links to save
- ask short or long questions
- use Rover day to day without setting up a separate client

Important:

- **Discord is the main pilot interface moving forward**
- MCP is **optional**
- if Discord is enabled, we will send the exact invite/setup steps separately
- for some pilot setups, Discord-enabled users may need to supply their own bot token

If Discord is **not** enabled for you yet, ask us and we will tell you whether your cohort is on the Discord-first workflow.

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
- if you are using MCP, access to `/mcp` is protected by your Bearer token
- you should avoid putting highly sensitive material into the pilot unless we have explicitly agreed that it is in scope

If you are unsure whether something belongs in Rover, ask us first.

## Troubleshooting

### I opened the domain and it does not look like a normal public site

That is expected. The root URL is your **Dashboard**, not a public website. The CMS lives at `/cms`. Rover also runs through Discord and, optionally, a direct MCP endpoint.

### I got an authentication error in MCP

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
Discord enabled: yes/no
Discord setup: <invite link or setup steps>
Dashboard URL: https://<handle>.rizom.ai/
CMS URL: https://<handle>.rizom.ai/cms
CMS auth: GitHub token with access to your private Rover content repo
MCP access: optional / enabled / not enabled

If MCP is enabled:
MCP URL: https://<handle>.rizom.ai/mcp
Auth type: Bearer token
Bearer token: <token>
```

If anything is unclear, reply with the exact error text or a screenshot and we will help.
