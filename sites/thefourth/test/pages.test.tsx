/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import site from "../src";

/** Renders a route's sections from the design's copy, as the build would. */
function renderPage(routeId: string): string {
  const route = site.routes.find((candidate) => candidate.id === routeId);
  if (!route) throw new Error(`the site has no ${routeId} route`);
  const groups = [site.sections ?? []].flat();
  return (route.sections ?? [])
    .map((placed) => {
      const [namespace, name] = placed.template.split(":");
      const section = groups.find((group) => group.namespace === namespace)
        ?.sections[name ?? ""];
      if (!section) throw new Error(`no section ${placed.template}`);
      const Section = section.component;
      return render(<Section {...section.schema.parse(placed.content)} />);
    })
    .join("");
}

describe("the site's pages", () => {
  test("adds What, Who, How, About and Let's talk to the homepage", () => {
    expect(site.routes.map((route) => [route.id, route.path])).toEqual([
      ["home", "/"],
      ["what", "/what"],
      ["who", "/who"],
      ["how", "/how"],
      ["about", "/about"],
      ["work-with-us", "/work-with-us"],
    ]);
  });

  test("keeps every page out of the plugins' navigation", () => {
    for (const route of site.routes) {
      expect(route.navigation?.show).toBe(false);
    }
  });
});

describe("Who we work with", () => {
  const html = renderPage("who");

  test("opens on its headline, with a chip into each world", () => {
    expect(html).toContain(
      '<h1 class="tf-intro__headline">Every field speaks its own language. We learn yours.</h1>',
    );
    expect(html).toContain('<nav class="tf-tiles" aria-label="Sectors">');
    for (const id of ["sustainability", "health", "tech", "art"]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`<section id="${id}"`);
    }
  });

  test("links each world's services to their part of What", () => {
    expect(html).toContain(
      '<a class="tf-tile" href="/what#agenda">Agenda setting</a>',
    );
    expect(html).toContain(
      '<a class="tf-tile" href="/what#matching">Creator matching</a>',
    );
  });

  test("shows the cases with their figures and quotes", () => {
    expect(html).toContain('<span class="tf-stat__value">120.6K</span>');
    expect(html).toContain("Courses in north, central and south Taiwan");
    expect(html).toContain(
      "<figcaption>Head of marketing &amp; PR</figcaption>",
    );
  });

  test("translates the tech world's jargon before and after", () => {
    expect(html).toContain("“Transactive Memory Systems.”");
    expect(html).toContain('class="tf-translation__after"');
    expect(html.match(/tf-translation__after/g)?.length).toBe(1);
  });

  test("leaves out the design's notes for what is still to fill", () => {
    expect(html).not.toContain("To fill");
    expect(html).not.toContain("Second case");
    expect(html).not.toContain("Some of the people we’ve worked with");
  });

  test("ends by offering a diagnosis", () => {
    expect(html).toContain(
      '<p class="tf-next__headline">Recognise your world?</p>',
    );
    expect(html).toContain(
      '<a class="tf-btn tf-btn--mustard" href="/work-with-us">Book a Communication Diagnosis →</a>',
    );
  });
});

describe("Let's talk", () => {
  const html = renderPage("work-with-us");

  test("offers a path for each kind of visitor, each by email", () => {
    for (const title of [
      "Brands and organisations",
      "Creators",
      "Agencies and consultants",
      "Talks and workshops",
    ]) {
      expect(html).toContain(`<h2 class="tf-path__title">${title}</h2>`);
    }
    expect(html).toContain("mailto:nihao.fourth@gmail.com?subject=Creator");
    expect(html).not.toContain('href="#"');
  });

  test("says what happens next without promising what Sam has not decided", () => {
    expect(html).toContain("We reply to your message.");
    expect(html).not.toContain("working days");
    expect(html).not.toContain("30-minute");
  });

  test("sends those not ready to talk to the brand test", () => {
    expect(html).toContain(
      '<a class="tf-btn tf-btn--ink" href="/brand-test">Take the test →</a>',
    );
  });

  test("lists every way to say hello, opening profiles in a new tab", () => {
    expect(html).toContain(
      '<a class="tf-link" href="https://www.instagram.com/notaboutyou_bs/" target="_blank" rel="noopener">@notaboutyou_bs ↗</a>',
    );
    expect(html).toContain(
      '<a class="tf-link" href="mailto:nihao.fourth@gmail.com">nihao.fourth@gmail.com</a>',
    );
    expect(html).toContain("<dd>Taipei, Taiwan</dd>");
  });
});

describe("What we do", () => {
  const html = renderPage("what");

  test("sets the lede's three verbs in the story's italics", () => {
    expect(html).toContain('help you <em class="tf-em">see</em> what');
  });

  test("indexes the six services by number, each leading to its part of the page", () => {
    expect(html).toContain('<nav class="tf-index__nav" aria-label="Services">');
    for (const [n, id, title] of [
      ["01", "positioning", "Brand positioning"],
      ["03", "strategy", "Communication strategy"],
      ["06", "matching", "Creator matching"],
    ]) {
      expect(html).toContain(
        `<a class="tf-index__tile" href="#${id}"><span class="tf-index__n">${n}</span><span class="tf-index__title">${title}</span></a>`,
      );
      expect(html).toContain(`<article id="${id}" class="tf-service">`);
    }
  });

  test("gives each step its big word and its mark", () => {
    for (const [id, word] of [
      ["see", "See."],
      ["tell", "Tell."],
      ["reach", "Reach."],
    ]) {
      expect(html).toContain(
        `<section id="${id}" class="tf-step tf-step--${id}">`,
      );
      expect(html).toContain(`<h2 class="tf-step__word">${word}</h2>`);
    }
    expect(html).toContain(
      '<span class="tf-plabel tf-plabel--muted">05 · Tell</span>',
    );
  });

  test("shows where a service was seen only when it has a case", () => {
    expect(html.match(/class="tf-pcard tf-seen"/g)?.length).toBe(5);
    expect(html).toContain(
      '<a class="tf-link" href="/who#tech">Read the case →</a>',
    );
  });

  test("closes on the loop back to See and the note on fees", () => {
    expect(html).toContain("Results feed the next round.");
    expect(html).toContain(
      '<span class="tf-loop__arrow" aria-hidden="true">↺</span>',
    );
    expect(html).toContain(
      "<strong>Fees</strong> depend on hours and type of service",
    );
  });
});

describe("How we work", () => {
  const html = renderPage("how");

  test("opens the case with its figure and points down to the moves", () => {
    expect(html).toContain('<span class="tf-howcase__stat">+30%</span>');
    expect(html).toContain('<a class="tf-link" href="#story">Here’s how ↓</a>');
    expect(html).toContain('<section id="story">');
  });

  test("ties each move to the method behind it", () => {
    expect(html.match(/<li class="tf-move">/g)?.length).toBe(4);
    expect(html).toContain(
      'href="#seamless"><span class="tf-pdot tf-pdot--mustard" aria-hidden="true"></span>See · Seamless Communication ↓</a>',
    );
    expect(html).toContain('<section id="seamless" class="tf-band">');
    expect(html).toContain('<section id="contentdna" class="tf-band">');
  });

  test("compares the usual handoffs with working as one team", () => {
    expect(html).toContain(
      '<span class="tf-chain__link tf-chain__link--lead">You + The Fourth, one team</span>',
    );
    expect(html).toContain(
      "Five handoffs. Each one loses a little of what you meant.",
    );
  });

  test("shows a ContentDNA match as a table a phone can read", () => {
    expect(html).toContain(
      '<div class="tf-match" role="table" aria-label="A match, shown">',
    );
    expect(html.match(/role="rowheader"/g)?.length).toBe(3);
    expect(html).toContain("Young people who pay for deep travel");
  });

  test("names the proof under each benefit and leaves the reviewers' note out", () => {
    expect(html.match(/<li class="tf-benefit">/g)?.length).toBe(3);
    expect(html).toContain(
      '<a class="tf-link" href="/who">See the cases →</a>',
    );
    expect(html).not.toContain("For reviewers and investors");
  });
});

describe("About", () => {
  const html = renderPage("about");

  test("breaks through the fourth wall", () => {
    expect(html).toContain(
      '<h1 class="tf-wall__headline">Breaking <span>the fourth wall.</span></h1>',
    );
    expect(html.match(/class="tf-wall__chip"/g)?.length).toBe(5);
  });

  test("underlines the mission's three words in red, mustard and mint", () => {
    expect(html).toContain(
      '<span class="tf-mark-word tf-mark-word--red">spoken</span>',
    );
    expect(html).toContain(
      '<span class="tf-mark-word tf-mark-word--mustard">heard</span>',
    );
    expect(html).toContain(
      '<span class="tf-mark-word tf-mark-word--mint">grown</span>',
    );
  });

  test("folds the paper on a press, its words for both ways at hand", () => {
    expect(html).toContain(
      '<button type="button" class="tf-fold" aria-pressed="false" aria-label="Fold the paper so A meets B" data-fold="Fold the paper →" data-unfold="Unfold it ↺">',
    );
  });

  test("casts both guides with their portraits, names in Chinese and strengths", () => {
    expect(html).toContain('src="/images/samantha-shao.webp"');
    expect(html).toContain('src="/images/becca-chen.webp"');
    expect(html).toContain(
      '<span class="tf-guide__native" lang="zh-TW">邵容謙</span>',
    );
    expect(html).toContain('<li class="tf-stub">Crisis management</li>');
    expect(html.match(/class="tf-note-card"/g)?.length).toBe(1);
  });

  test("fills the gap in Sam's years from her bio on the live site", () => {
    expect(html).toContain("Sam spent nine years in public relations");
    expect(html).not.toContain("8+ or 9+");
  });

  test("hangs eight photos off stage, and the podcast a tab away", () => {
    expect(html.match(/<figure class="tf-pin"/g)?.length).toBe(8);
    expect(html).toContain('src="/images/offstage-confession.webp"');
    expect(html).toContain('<em class="tf-em">Not About You</em> 不是在說你');
    expect(html).toContain(
      'target="_blank" rel="noopener">Listen to the podcast ↗</a>',
    );
  });

  test("ends on a curtain call", () => {
    expect(html).toContain('<p class="tf-next__eyebrow">Curtain call</p>');
  });
});
