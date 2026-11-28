---
title: Running your own brain
slug: self-hosting
order: 50
persona: Running your own brain
section: Run a brain
summary: Your own server, content and domain
---

## For

You want the brain on your own machine or server, your content in a folder and a git repository you control, and the site on your own domain.

## Material

### A folder of Markdown

- **Where:** An Obsidian vault, a notes folder
- **Becomes:** note
- **How:** Copy its Markdown files to the top of brain-data/

### Saved links

- **Where:** Bookmarks you keep as Markdown files
- **Becomes:** link
- **How:** Put them in brain-data/link/ with the link fields at the top

### Pictures

- **Where:** Images your notes refer to
- **Becomes:** image
- **How:** Put them in brain-data/image/

## Install and start

You need Bun 1.4 or later and an AI API key.

Install the brain and create one from a recipe: `bun add -g @rizom/brain`, then `brain init my-brain --recipe personal`. `brain init` asks for your OpenAI key and writes it to `.env` as `OPENAI_API_KEY`; if you skip the question, copy `.env.example` to `.env` and set it there. Then run `brain start` in the new folder. The log prints a one-time setup link; open it and register a passkey to sign in. To have setup links and invitations sent by email, also set `SETUP_EMAIL_TO`, `SETUP_EMAIL_FROM` and `SETUP_EMAIL_API_KEY`, a Resend API key.

Exact steps: [Getting started](/docs/getting-started), [CLI reference](/docs/cli-reference).

## Choose a recipe

The recipe decides what the brain does. **personal** is a private brain you talk to; **professional** adds a site and publishing; **team** adds shared memory, roles and a board; **headless** runs without the web interface. Everything the recipe sets is written into `brain.yaml`, where you can add or remove pieces later. When you add one, the files already in `brain-data/` for its type are imported the next time the brain starts.

Exact steps: [brain.yaml reference](/docs/brain-yaml-reference).

## Bring a folder

Your content lives in `brain-data/`. A Markdown file at the top becomes a note. Every folder is read as an entity type: one named after a type, such as `brain-data/link/`, holds files of that type, each with the fields the type needs at the top, and images go in `brain-data/image/`. Any other folder is skipped, so flatten a vault's subfolders or move their notes to the top. A file that does not match its type is renamed with `.invalid` and left for you to fix.

The brain keeps the folder and itself in step while it runs: add or edit a file and the brain updates; change something in chat or Studio and the file changes.

To open a hosted brain's files on your computer, mount its drive: in Studio under **Account → Drive**, create an app password, allowing saving changes if you want to edit, and follow the steps for macOS Finder, Windows, GNOME Files or rclone.

To work in Obsidian, install the Rizom Brain plugin, enter the brain's address in its settings and choose **Connect**, then confirm in Studio under **Account → Drive**. It keeps a vault on your computer in step with the brain, and writes templates, field definitions and table views for every type into the vault's `_obsidian/` folder.

Exact steps: [Content management](/docs/content-management), [The Drive and Obsidian](/docs/drive-and-obsidian).

## Keep it in git

Create the brain with `--content-repo owner/name`, which sets the repository under `directory-sync` in `brain.yaml`, and put a token that can push to it in `.env` as `GIT_SYNC_TOKEN`. The brain clones the repository, pulls on a schedule, and commits and pushes its own changes, so your content has a history and a backup outside the server.

Exact steps: [Directory sync and git](/docs/directory-sync-git).

## Put it online

The deployment path uses a GitHub repository, a Cloudflare zone and a Hetzner server. `brain init my-brain --deploy --domain your.domain` adds the deployment files; `brain ssh-key:bootstrap --push-to gh`, `brain secrets:push --push-to gh` and `brain cert:bootstrap --push-to gh` put the deploy key, secrets and certificate into the repository's GitHub Actions secrets; a push to `main` builds the image and deploys it.

Exact steps: [Deployment guide](/docs/deployment-guide).

## A week later

The brain runs on its own, and you know where everything is.

- **Content in a folder and in git**, readable without the brain.
- **Deploys on push**, with a backup of the brain's state before each one.
- **Versions you choose**: `brain init` writes `@rizom/brain` into `package.json` as a caret range; to upgrade, change the version there and run `bun install`. `brain pin` writes that file for a brain started without `brain init`.
- **Everything else** works as in the guide for your kind of user.

Exact steps: [Getting started](/docs/getting-started), [CLI reference](/docs/cli-reference).
