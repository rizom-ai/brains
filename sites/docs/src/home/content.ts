import type { DocsHomeDoorsContent } from "./doors";
import type { DocsHomeHeroContent } from "./hero";

interface DocsHomeContent {
  hero: DocsHomeHeroContent;
  doors: DocsHomeDoorsContent;
}

/**
 * The docs home's starting copy. The site seeds it once; after that it is
 * content, edited in Studio and synced like the rest.
 */
export const docsHomeContent: DocsHomeContent = {
  hero: {
    title: "A brain is one place for what you know.",
    lede: "It runs on a server you control, and the code is open source.",
    bringHeading: "What you bring",
    brainLabel: "Your brain",
    showsUpHeading: "Where it shows up",
    hint: "Pick anything to follow it through the brain.",
    sources: {
      draft: "A draft in Google Docs",
      pdf: "A paper as a PDF",
      link: "A link from your open tabs",
      photo: "A photo of a whiteboard",
    },
    files: {
      note: "on-slowness.md",
      paper: "attention.md",
      link: "link/calm-technology.md",
      image: "image/whiteboard.png",
      post: "post/on-slowness.md",
    },
    destinations: {
      site: "Your site and newsletter",
      chat: "Answers in chat",
      ai: "Claude and ChatGPT",
      brains: "Other brains you approve",
    },
    captions: {
      draft:
        "A draft comes in once and becomes on-slowness.md. Ask about it in chat, or turn it into a post for your site.",
      pdf: "The paper's text becomes a note. Ask about it in chat, or from Claude or ChatGPT.",
      link: "The link is kept with a summary, so answers can point back to it.",
      photo:
        "The photo is kept as an image, ready to use as the cover of a post.",
      chat: "Chat answers from everything the brain keeps, and cites the files it used.",
      ai: "Claude, ChatGPT and other MCP tools reach the same files you do.",
      brains:
        "Brains you approve can ask yours questions, within the access you grant them.",
      site: "Posts go out on your site and in the newsletter, with a photo as the cover if you want one.",
    },
  },
  doors: {
    heading: "Where to start",
    lede: "Three ways in. Each begins with one concrete step, then the guides and reference behind it.",
    firstStepLabel: "First step",
    doors: [
      {
        title: "Use a brain",
        who: "Someone has set one up for you, or you will.",
        firstStep: {
          text: "Open the welcome email from your brain and set up a passkey. Then work wherever suits you: chat, Studio, or your AI tools.",
          commands: [],
          steps: [],
          note: null,
        },
      },
      {
        title: "Run a brain",
        who: "For yourself, or for the people moving in.",
        firstStep: {
          text: null,
          commands: [
            "bun add -g @rizom/brain",
            "brain init my-brain --recipe personal",
            "cd my-brain",
            "brain start",
          ],
          steps: [],
          note: "Set `OPENAI_API_KEY` in `.env` first. The brain prints a setup link for your passkey.",
        },
      },
      {
        title: "Extend a brain",
        who: "Sites, themes and plugins, or the framework itself.",
        firstStep: {
          text: null,
          commands: [],
          steps: [
            "Configure the instance in `brain.yaml`",
            "Edit content in `brain-data/`",
            "Layer CSS in `src/theme.css`",
            "Change site structure in `src/site.tsx`",
            "Write a plugin when behavior or data must change",
          ],
          note: "Use the smallest layer that solves the problem.",
        },
      },
    ],
  },
};
