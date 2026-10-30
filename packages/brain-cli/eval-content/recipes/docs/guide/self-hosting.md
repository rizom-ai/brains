---
title: Running your own brain
slug: self-hosting
order: 50
persona: Running your own brain
for: >-
  You want the brain on your own machine or server, your content in a folder and
  a git repository you control, and the site on your own domain.
material:
  - from: A folder of Markdown
    where: An Obsidian vault, a notes folder
    becomes: note
    how: Copy it into brain-data/
  - from: Saved links
    where: Bookmarks you keep as Markdown files
    becomes: link
    how: Put them in brain-data/link/ with the link fields at the top
  - from: Pictures
    where: Images your notes refer to
    becomes: image
    how: Put them in brain-data/image/
---

## Install and start

You need Bun 1.4 or later, an AI API key and an email address.

Install the brain and create one from a recipe: `bun add -g @rizom/brain`, then `brain init my-brain --recipe personal`. In the new folder, put your key in `.env` as `AI_API_KEY` and your email address as `SETUP_EMAIL_TO`, then run `brain start`. The log prints a one-time setup link; open it and register a passkey to sign in.

Exact steps: [Getting started](/docs/getting-started), [CLI reference](/docs/cli-reference).

## Choose a recipe

The recipe decides what the brain does. **personal** is a private brain you talk to; **professional** adds a site and publishing; **team** adds shared memory, roles and a board; **headless** runs without the web interface. Everything the recipe sets is written into `brain.yaml`, where you can add or remove pieces later.

Exact steps: [brain.yaml reference](/docs/brain-yaml-reference).

## Bring a folder

Your content lives in `brain-data/`. A Markdown file at the top becomes a note; a folder named after a type, such as `brain-data/link/`, holds files of that type, each with the fields the type needs at the top; images go in `brain-data/image/`. A file that does not match its type is renamed with `.invalid` and left for you to fix.

The brain reads the folder when it starts, and writes what you change in chat or Studio back to the files. Files you add or edit while it runs are read at the next start.

To use the folder as an Obsidian vault, add the `obsidian-vault` plugin under `add:` in `brain.yaml`. It writes templates, field definitions and table views for every type into `brain-data/_obsidian/`.

Exact steps: [Content management](/docs/content-management).

## Keep it in git

Create the brain with `--content-repo owner/name`, which sets the repository under `directory-sync` in `brain.yaml`, and put a token that can push to it in `.env` as `GIT_SYNC_TOKEN`. The brain clones the repository, pulls on a schedule, and commits and pushes its own changes, so your content has a history and a backup outside the server.

Exact steps: [Directory sync and git](/docs/directory-sync-git).

## Put it online

The deployment path uses a GitHub repository, a Cloudflare zone and a Hetzner server. `brain init my-brain --deploy --domain your.domain` adds the deployment files; `brain ssh-key:bootstrap`, `brain secrets:push` and `brain cert:bootstrap` put the keys, secrets and certificate in place; a push to `main` builds the image and deploys it.

Exact steps: [Deployment guide](/docs/deployment-guide).

## A week later

The brain runs on its own, and you know where everything is.

- **Content in a folder and in git**, readable without the brain.
- **Deploys on push**, with a backup of the brain's state before each one.
- **Pinned versions** you upgrade on your own schedule with `brain pin`.
- **Everything else** works as in the guide for your kind of user.

Exact steps: [CLI reference](/docs/cli-reference).
