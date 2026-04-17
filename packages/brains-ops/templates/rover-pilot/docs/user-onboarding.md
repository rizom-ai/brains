# Rover Pilot User Onboarding

Welcome to the Rover pilot.

This guide is written for **first-time users**. You do **not** need prior experience with Rover, MCP, git, GitHub, or Obsidian to get started.

## What Rover is

Rover is your private AI assistant for working with your own notes, links, and ideas.

In this pilot, the normal experience is:

- **Discord** for chatting with Rover
- the **Dashboard** in your browser at `https://<handle>.rizom.ai/`
- the **CMS** in your browser at `https://<handle>.rizom.ai/cms`

Optional workflows exist too:

- **MCP** for direct client access from supported AI tools
- **git** if you want to work with the underlying files directly
- **Obsidian** if you want a nicer note-focused editor for those same files

You can think of Rover as a private knowledge companion that helps you:

- save notes
- save links
- reflect on your own material
- find patterns in what you have collected
- think through questions with AI

## The default mental model

If you remember only one thing, remember this:

- **Discord** = talk to Rover
- **Dashboard** = browser overview
- **CMS** = browser editing interface
- **MCP** = optional direct client integration
- **git / Obsidian** = optional file-based workflow

Most pilot users should start with the first three.

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

## Start here: your first 5 minutes

For most users, the best first setup is:

1. join the Discord server we send you
2. open your Dashboard at `https://<handle>.rizom.ai/`
3. open the CMS at `https://<handle>.rizom.ai/cms`
4. when the CMS asks for GitHub access, use a fine-grained GitHub token with access to your private Rover content repo
5. send a first message in Discord and make one small edit in the CMS

A simple first chat message is:

> What can you help me do, and what should I use you for?

Or:

> Help me save my first note.

A simple first CMS action is:

- open the **Notes** collection
- create a short note about why you want to use Rover
- save it

If Discord is not enabled for you yet, tell us and we will share the right next step.

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

## Working in the CMS

The CMS is the easiest way to edit Rover content in the browser.

Use it when you want to:

- create notes without touching git directly
- edit existing content in a structured form
- browse your collections in one place
- make quick updates from the browser

### Why the CMS asks for GitHub access

Your Rover content lives in a **private GitHub repo**.

The CMS edits that repo for you.

That is why it asks for a **GitHub token**.

In practice, that means:

- you can use the CMS without cloning the repo locally
- your changes still go into your private content repo
- if you later open that repo with git or Obsidian, you are looking at the same underlying content

### What to expect the first time you open it

When you open `https://<handle>.rizom.ai/cms`, you should expect something like this:

1. the CMS asks you to authenticate with GitHub
2. you enter the GitHub token we told you to create
3. the CMS loads your content collections
4. you can open an entry, edit it, and save your changes

If the CMS loads correctly, that is a good sign that:

- your browser access is working
- your repo access is working
- the token is working

### What you will see in the CMS

The exact collections may change over time, but a normal pilot setup includes collections for things like:

- **Notes**
- links or saved resources
- settings or other structured content

The important idea is not the exact list — it is that the CMS is the browser-based editor for your Rover content.

### A good first CMS task

A good first CMS task is to create a short note.

For example:

- open **Notes**
- create a new note
- title it something like `Why I’m using Rover`
- write 3 to 5 sentences
- save it

Then go back to Discord and ask Rover something like:

> What do you know about why I’m using Rover so far?

That connects the browser editing workflow with the chat workflow.

### When to use Discord vs CMS

A good rule of thumb is:

Use **Discord** when you want to:

- think out loud
- ask questions
- capture something quickly
- use Rover as a day-to-day assistant

Use the **CMS** when you want to:

- deliberately create or revise content
- browse existing entries
- make cleaner edits than you would in chat
- work in a more editor-like browser interface

Use both together. That is the default pilot workflow.

### If the CMS feels confusing

That is useful feedback.

Please tell us:

- what part was confusing
- whether the problem was authentication, navigation, editing, or saving
- what you expected to happen instead

We want to improve this workflow.

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

## Optional: git, text files, and Obsidian

The underlying content workflow is still a normal **git repo** with normal **markdown/text files**.

But for this pilot, treat that as **optional**.

Use direct git or file-based workflows only if you want more control.

Obsidian is optional. It is just one possible editor for those files.

That means:

- use **Discord** as the main way to talk to Rover
- use the **Dashboard** and **CMS** as the normal browser workflow
- use a normal editor plus **git** only if you want to browse, draft, and edit your files directly
- use **Obsidian** only if you want a more note-focused interface for the same files
- Rover can pick up those file changes through the normal git-sync / directory-sync flow

### Important: your content repo is private

If you use the git/text-file workflow, you will be working in your own **private** GitHub repo.

That means:

- you do **not** need repo access just to use Rover in Discord
- you **do** need GitHub access if you want to clone, edit, and push to your content repo
- we will invite you only to **your own** content repo, not to the operator repo and not to other users' repos

### How you get access

If you want the git/text-file workflow, we will:

1. create or confirm your private content repo
2. invite your GitHub account to that repo
3. ask you to accept the GitHub invite
4. send you the repo URL

### Authentication options

To work with a private repo or the CMS, you need GitHub authentication.

Usually the easiest order is:

1. **GitHub sign-in** to accept the private repo invite
2. a **fine-grained personal access token** for the CMS, with access to your private Rover content repo
3. **GitHub Desktop** or normal git auth if you also want to clone the repo locally
4. **SSH key** only if you already use git that way

You do **not** need a GitHub token just to use Rover in Discord.
You do **not** need an MCP Bearer token unless we explicitly ask you to use MCP.

### If you want the local file workflow

If we have already shared your content repo workflow with you, the normal setup is:

1. clone your Rover content repo locally
2. edit the markdown/text files in your normal editor, or open that same folder as an Obsidian vault if you prefer
3. optionally install the **Obsidian Git** plugin if you want in-app commit/push/pull support
4. edit or organize your notes there
5. commit and push your changes through normal git, GitHub Desktop, or the Obsidian Git plugin
6. let the normal git-sync flow carry those changes into Rover

If we have **not** given you a direct content repo workflow yet, that is fine. You can ignore git, text files, and Obsidian for now and use Rover in Discord and the CMS. If we have also asked you to test MCP, you can use that too.

## Discord (default chat interface)

Discord is the default chat interface for this pilot.

Think of it as the main place to:

- save quick notes
- drop in links to save
- ask short or long questions
- use Rover day to day without setting up a separate client

Important:

- **Discord is the main pilot chat interface**
- the **Dashboard** and **CMS** are the main browser interfaces
- MCP is **optional**
- if Discord is enabled, we will send the exact invite/setup steps separately
- for some pilot setups, Discord-enabled users may need to supply their own bot token

If Discord is **not** enabled for you yet, ask us and we will tell you whether your cohort is on the Discord-first workflow.

## Dashboard basics

The Dashboard is the browser landing page for your Rover.

Use it when you want to:

- confirm the instance is up
- see the browser-side operator surface
- jump into the CMS quickly

This is not meant to be a public website. It is part of your Rover control surface.

## Wishlist: when Rover cannot do something yet

Rover has a built-in **wishlist**.

This matters because Rover will not be able to do everything yet.

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
- your content repo is private
- you should avoid putting highly sensitive material into the pilot unless we have explicitly agreed that it is in scope

If you are unsure whether something belongs in Rover, ask us first.

## Troubleshooting

### I opened the domain and it does not look like a normal public site

That is expected. The root URL is your **Dashboard**, not a public website. The CMS lives at `/cms`. Rover also runs through Discord and, optionally, a direct MCP endpoint.

### The CMS asks for GitHub auth and I am not sure what to do

That is expected.

Use the GitHub token we told you to create for your **private Rover content repo**.

If you are missing one of these pieces, tell us:

- you did not get the repo invite
- you did not accept the repo invite yet
- you are not sure how to create the token
- the token was accepted but the CMS still does not load

### The CMS loads, but I am not sure whether my change worked

A good quick test is:

1. edit a short note in the CMS
2. save it
3. refresh the CMS and confirm the change is still there
4. ask Rover in Discord about that note

If anything in that loop feels unclear, tell us exactly where it became confusing.

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
- whether Discord, Dashboard, and CMS each made sense
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
