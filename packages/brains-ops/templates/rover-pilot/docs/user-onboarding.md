# Rover Pilot User Onboarding

Welcome to the Rover pilot.

This guide is for first-time Rover users. You do not need prior experience with Rover, MCP, git, GitHub, or Obsidian to get started.

## What Rover is

Rover is your private AI assistant for working with your own notes, links, and ideas.

For the current pilot, the normal core experience is:

- **Passkey setup email** — your secure first step
- **Discord** — the main chat interface when enabled for your pilot
- **Dashboard** — your browser overview at `https://<handle>.rizom.ai/`
- **MCP** — optional direct access from OAuth/passkey-capable AI clients

Some users may also receive:

- **CMS** access at `https://<handle>.rizom.ai/cms`
- **GitHub/content repo** access for editing the underlying markdown files
- **Obsidian** instructions for a local file-based workflow

If we did not explicitly give you CMS, GitHub, MCP, or Obsidian instructions, you can ignore those sections for now.

## Start here: setup

1. Open the setup email from Rover.
2. Click the passkey setup link.
3. Register a passkey in your browser.
4. Open your Dashboard: `https://<handle>.rizom.ai/`.
5. If Discord is enabled for you, send Rover a first message there.
6. If we asked you to test MCP, use the separate MCP connection instructions we sent for your pilot.

## Your setup email

The setup email contains a single-use passkey setup link.

Treat that link like a temporary password:

- do not forward it
- use it once
- expect it to expire
- ask us for help if it has expired or does not work

After you register your passkey, the setup link closes. Your passkey becomes the sign-in method for Rover's browser and OAuth-capable client flows.

If your Rover already existed before you received this email, nothing is being reset. The email is just the secure handoff for registering your own passkey so you can sign in yourself.

## Your first Rover session

Start in **Discord** if it is enabled for your pilot. That is the normal first interface.

### 1. Say hello

Send:

> What can you help me do, and what should I use you for?

Rover should answer with a short overview of what it can do.

### 2. Create your first note

Ask Rover to save a simple note:

> Save a note: I am trying Rover because I want a better way to collect ideas, links, and questions in one place.

Or:

> Help me save my first note.

### 3. Add your first link

Send Rover a link you want to remember:

> Save this link and tell me why it might be useful later: https://example.com

Or:

> Add this as a link about tools I want to revisit: https://example.com

Rover should save the link and, when possible, keep a short description of why it matters.

### 4. Upload an existing Markdown doc

If you already have notes or docs in Markdown, you do not need to retype them.

Upload a `.md` file and ask Rover to save or import it:

> Save this Markdown doc in my notes.

Or:

> Import this doc and tell me what it is about.

This is often the fastest way to give Rover useful context.

### 5. Ask Rover about what you just added

After you have saved a note, link, or Markdown doc, ask Rover to reflect it back:

> What have I added so far?

Or:

> What do you know about what I am interested in so far?

This is the basic Rover loop: add material, then ask Rover to help you think with it.

### 6. Try a more useful task

Once Rover has a little context, try one of these:

> Summarize my notes so far.

> What themes do you see in what I have added?

> Turn my rough note into a clearer paragraph.

> Help me make a small reading list from the links I saved.

These examples show the main scope of Rover: saving material, organizing it, reflecting on it, and helping you make something from it.

### 7. Ask another agent

If your pilot has agent-to-agent access enabled, we will tell you which other agents you can address and how to talk to them. Otherwise Rover should clearly say that this workflow is not available yet.

## The default mental model

If you remember only one thing, remember this:

- **Discord** = talk to Rover, when enabled
- **Dashboard** = browser overview
- **MCP** = optional direct client integration through OAuth/passkey login
- **CMS / git / Obsidian** = optional content-editing workflows when we enable them for you

## What you will receive from us

Depending on your pilot cohort, we will send you some or all of these:

- a passkey setup email from Rover
- this onboarding guide, or a link to it
- confirmation that Discord is enabled for you, plus the invite/setup steps
- your **Dashboard URL**: `https://<handle>.rizom.ai/`
- CMS URL and GitHub token instructions, if CMS editing is enabled
- private content repo access, if file-based editing is enabled
- separate MCP connection instructions, if MCP testing is enabled
- any extra instructions if we are testing a specific workflow with your cohort

Keep setup links, GitHub tokens, and any MCP credentials separate. Do not paste the passkey setup link into an MCP client.

## Discord

Discord is the default chat interface when it is enabled for your pilot. It is separate from the passkey setup email: the email sets up browser/client identity, while Discord is where many users chat with Rover day to day.

Use it to:

- save quick notes
- drop in links
- ask questions
- use Rover day to day without setting up a separate client

If Discord is enabled, we will send the exact invite/setup steps separately.

## Dashboard basics

The Dashboard is the browser landing page for your Rover.

Open it at:

```text
https://<handle>.rizom.ai/
```

Use it to confirm your Rover is up, see available endpoints, and orient yourself before using optional tools. This is not meant to be a public marketing website.

## Optional: Working in the CMS

If CMS is enabled for you, open:

```text
https://<handle>.rizom.ai/cms
```

The CMS is a browser editor for your Rover content. It may ask for GitHub access because your content lives in a private GitHub repo.

Use the CMS when you want to:

- create or edit notes in the browser
- add existing Markdown docs
- browse structured content collections
- make cleaner edits than you would in chat

A good first CMS task is:

1. open the **Notes** collection
2. create a note titled `Why I’m using Rover`
3. write 3 to 5 sentences
4. save it
5. refresh the CMS and confirm the note is still there

If the CMS asks for GitHub access, use the fine-grained GitHub token for your private Rover content repo. If you were not given CMS/GitHub instructions, skip this section.

## Optional: direct MCP access

MCP is an optional way to connect Rover directly to an AI client that supports remote HTTP MCP.

Use MCP only if we ask you to test it or if you already use a client that supports remote HTTP / Streamable HTTP MCP servers.

We will send MCP connection details separately when MCP testing is enabled. The normal hosted MCP path is `https://<handle>.rizom.ai/mcp`, but use the exact server URL we send for your pilot.

### What the MCP login flow looks like

If your client supports OAuth / browser login, the normal flow is:

1. In your MCP client, add a remote MCP server.
2. Enter the Rover MCP server URL we sent you.
3. The client discovers Rover's OAuth settings automatically.
4. The client opens a browser window for Rover login.
5. You sign in with your passkey.
6. Rover asks you to approve client access.
7. The client receives an access token automatically.
8. You can use Rover tools from that client.

You should not need to copy a setup link into the client. The setup link is only for registering your first passkey.

If your client asks for a token or other credential, use only the MCP instructions we sent separately. Treat any MCP credentials like a password. Do not share them.

### Client-specific notes

Different MCP clients support remote HTTP and OAuth at different speeds. If you are using Claude Desktop, Cursor, VS Code, MCP Inspector, or another client, tell us the exact version before assuming it should work.

### If MCP does not work

Send us:

- the client name
- the client version
- the exact error message
- a screenshot if possible
- the server URL you entered, without any secret token

Do not paste your passkey setup link into an MCP client.

## Optional: git, text files, and Obsidian

Rover content can also live as normal markdown/text files in a private GitHub repo.

This workflow is optional. Use it only if we explicitly enabled it for you or if you want more control.

If enabled, we will:

1. create or confirm your private content repo
2. invite your GitHub account to that repo
3. send you the repo URL
4. explain whether to use GitHub Desktop, command-line git, Obsidian, or the CMS

You do not need GitHub repo access just to use Rover in Discord.

## Wishlist: when Rover cannot do something yet

Rover has a built-in wishlist.

If you ask for something Rover cannot do yet, it should explain the limitation and save the request as a wish. This helps us see which missing capabilities matter most.

## What to expect in the pilot

This is a real working system, but it is still an early pilot. Expect some rough edges, setup steps that may still be a bit manual, and improvements during the pilot.

## Privacy and boundaries

For the pilot:

- your Rover is deployed specifically for you
- browser/client access uses passkeys/OAuth where supported
- if you are using MCP, we will send separate access instructions
- your content repo is private when repo access is enabled
- avoid putting highly sensitive material into the pilot unless we have explicitly agreed that it is in scope

If you are unsure whether something belongs in Rover, ask us first.

## Troubleshooting

### I did not receive the setup email

Check spam/promotions first. If it is not there, tell us which email address we should use.

### The setup link expired or does not work

Reply to your Rover operator. We can rotate/reissue setup.

### I opened the domain and it does not look like a normal public site

That is expected. The root URL is your Dashboard, not a public marketing site.

### The browser asks me to use a passkey

That is expected after setup. Use the same passkey you registered from the setup email.

### My MCP client cannot connect

Send us the client name, version, exact error message, and a screenshot if possible.

### The CMS asks for GitHub auth and I am not sure what to do

That is expected only if CMS is enabled for you. Use the GitHub token instructions we sent for your private Rover content repo. If you did not receive those instructions, ask us before continuing.

## What feedback helps us most

We especially want to hear:

- what was confusing during setup
- whether the setup email and passkey flow made sense
- whether Discord and Dashboard made sense
- what felt useful immediately
- what felt weak, awkward, or unclear
- what you expected Rover to do but could not get it to do
- whether you would keep using it after the pilot

Short, honest feedback is perfect.

## Quick handoff template

When we onboard you, the message will look roughly like this:

```text
Setup email: sent to <email>
Onboarding guide: attached / linked
Dashboard URL: https://<handle>.rizom.ai/
Discord enabled: yes/no
Discord setup: <invite link or setup steps>
MCP access: optional / enabled / not enabled
MCP setup: sent separately if enabled
CMS enabled: yes/no
CMS URL: https://<handle>.rizom.ai/cms
Content repo access: yes/no
```

If anything is unclear, reply with the exact error text or a screenshot and we will help.
