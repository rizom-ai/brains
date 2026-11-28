---
title: Moving in as a researcher
slug: researcher
order: 20
section: Use a brain
persona: The researcher
for: Years of notes, papers and saved links you want to connect and question. Most of it sits in apps that never talk to each other.
summary: Notes, papers and saved links
recipe: personal
material:
  - from: Notes and fragments
    where: Obsidian, Apple Notes, a notes app
    becomes: note
    how: Export as Markdown, upload in chat
  - from: Papers and reports
    where: PDFs, exported articles
    becomes: note
    how: Upload the PDF in chat; its text becomes a note
  - from: What you read
    where: Bookmarks, open tabs, reading lists
    becomes: link
    how: Paste the URL in chat; it keeps a summary
  - from: Diagrams and photos
    where: Whiteboards, sketches, screenshots
    becomes: image
    how: Upload in chat and ask the brain to save it
---

## Bring your notes in

Export your notes as Markdown. Obsidian notes already are; most notes apps have a Markdown export.

Upload the files in the brain's own chat, in Studio or on Discord, Slack or Matrix, and ask the brain to keep them as notes. It lists every file with the title it will get, from its first top-level `#` heading or else its file name, and asks you once to confirm before it saves them. Claude and ChatGPT pass the brain text, not files, so from there you paste a note's text instead.

Exact steps: [Content management](../content-management.md), [Interface setup](../interface-setup.md).

## Bring your papers

Upload a PDF in the brain's chat and ask the brain to keep it as a note. Its text is extracted into the note, so the brain can search and answer from it. PDFs up to 5 MB and 50 pages work; headings and tables come through as plain text.

A PDF you save as a document instead is kept as the original file, without its text, so the brain does not answer from it.

Exact steps: [Content management](../content-management.md), [Entity types](../entity-types-reference.md).

## Save what you read

Paste a URL in chat and ask the brain to save it. It fetches the page and keeps it as a link with a short description and a summary, so a source you read once stays findable.

Exact steps: [Entity types](../entity-types-reference.md).

## Ask across it

Ask in chat what you have on a question, where two sources disagree, or what a paper you saved found. Answers come from what you have saved, with the sources listed under each answer.

With your brain connected under **AI tools**, you can ask the same from Claude or ChatGPT while you work.

Exact steps: [Interface setup](../interface-setup.md).

## See the shape of it

The brain extracts topics from your notes as they come in. The public dashboard at your brain's address shows them on its **Knowledge** tab: a map of your topics, with the largest clusters listed, so you can see what your material clusters around and where it is thin. Signed in, the address opens Studio; choose **View public dashboard** from the account menu to see the dashboard.

Topics come from public notes, which is how notes start, and from links once you set them to published in Studio. The dashboard shows only public material, and anyone with the address can open it.

Exact steps: [Public dashboard](../studio.md#the-public-dashboard), [Entity types](../entity-types-reference.md).

## A week later

Your notes, papers and links answer to one question box instead of five apps.

- **Answers with sources** from your own material, not the open web.
- **A map of your topics** that grows as you add notes.
- **One place to drop things**: a PDF, a link or a note.
- **Room to grow**: if the brain later adds a site and publishing, the same notes feed your writing.

Exact steps: [Feature overview](../feature-overview.md).
