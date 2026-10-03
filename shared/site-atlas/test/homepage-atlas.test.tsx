import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HomepageAtlas } from "../src/templates/homepage-atlas";
import type { HomepageAtlasData } from "../src/schemas/homepage-atlas";
import type { HomepageOpeningContent } from "../src/schemas/homepage-opening";
import { homepageAtlasStyles } from "../src/templates/homepage-atlas-styles";
import { atlasTop } from "../src/lib/atlas-terrain";

const atlas: HomepageAtlasData = {
  zones: [
    {
      id: "institutions",
      name: "New institutions",
      x: 0.5,
      y: 0.4,
      members: 2,
    },
  ],
  items: [
    {
      id: "hiding",
      entityType: "post",
      content: "",
      metadata: { slug: "hiding-in-plain-sight" },
      title: "Hiding in Plain Sight",
      year: 2026,
      x: 0.52,
      y: 0.42,
      zoneId: "institutions",
      url: "/essays/hiding-in-plain-sight",
      typeLabel: "Essay",
      latest: false,
    },
    {
      id: "lefthoek",
      entityType: "project",
      content: "",
      metadata: { slug: "lefthoek" },
      title: "Lefthoek",
      year: 2020,
      x: 0.9,
      y: 0.9,
      zoneId: null,
      url: "/projects/lefthoek",
      typeLabel: "Project",
      latest: false,
    },
    {
      id: "offcourse",
      entityType: "project",
      content: "",
      metadata: { slug: "offcourse" },
      title: "Offcourse",
      year: 2013,
      x: 0.05,
      y: 0.6,
      zoneId: null,
      url: "/projects/offcourse",
      typeLabel: "Project",
      latest: false,
    },
  ],
};

const page: { opening: HomepageOpeningContent; owner: string } = {
  owner: "Jan Hein Hoogstad",
  opening: {
    title: "Building something inhabitable.",
    introduction: "I work on how institutions hold what they know.",
    topics: ["Someone who carries a lot is about to leave"],
    contactUrl: "https://yeehaa.test/contact",
    topicsHeading: "Pick a thread",
    contactLabel: "Write to me",
    contactNote: "I read these myself.",
    mapCaption: "My published work, by topic",
    faqHeading: null,
  },
};

describe("homepage atlas", () => {
  it("opens with the authored turn and a working door over the map", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={atlas} />,
    );
    expect(html).toContain("Building something inhabitable.");
    expect(html).toContain("I work on how institutions hold what they know.");
    // The name is said once, by the site's header, not again over the headline.
    expect(html).not.toContain("Jan Hein Hoogstad");
    expect(html).not.toContain("atlas__byline");
    expect(html).toContain('href="https://yeehaa.test/contact"');
    expect(html).toContain("Someone who carries a lot is about to leave");
  });

  it("draws the terrain and links every mark to its page", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={atlas} />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
    expect(html).toContain("New institutions");
    expect(html).toContain('href="/essays/hiding-in-plain-sight"');
    // Each mark carries its kind's name, for the answer's source list to use.
    expect(html).toMatch(
      /data-atlas-key="post:hiding" data-atlas-type="Essay"/,
    );
    expect(html).toContain("Hiding in Plain Sight");
    expect(html).toContain('href="/projects/lefthoek"');
    expect(html).toContain("Essay");
  });

  it("carries each topic to the contact form, where it starts the message", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={atlas} />,
    );
    const topics = [
      ...html.matchAll(/<li><a href="([^"]+)" data-atlas-door=""/g),
    ].map((match) =>
      new URL((match[1] ?? "").replaceAll("&amp;", "&")).searchParams.get(
        "topic",
      ),
    );
    expect(topics).toEqual(["Someone who carries a lot is about to leave"]);
    expect(html).toContain(
      'class="atlas__contact" href="https://yeehaa.test/contact" data-atlas-door=""',
    );
  });

  it("names each mark's territory on its card, so a name the map cannot fit stays one tap away", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={atlas} />,
    );
    const card = (title: string): string =>
      html
        .split('data-atlas-tip="">')
        .find((part) => part.includes(title))
        ?.split("</a>")[0] ?? "";
    expect(card("Hiding in Plain Sight")).toContain("New institutions");
    expect(card("Lefthoek")).not.toBe("");
    expect(card("Lefthoek")).not.toContain("New institutions");
  });

  it("works without JavaScript and starts no chat", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={atlas} />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("/guest");
  });

  it("keeps the opening and door when there is no map", () => {
    const html = renderToStaticMarkup(<HomepageAtlas {...page} atlas={null} />);
    expect(html).toContain("Building something inhabitable.");
    expect(html).toContain('href="https://yeehaa.test/contact"');
    expect(html).not.toContain("<svg");
  });
});

describe("the latest piece", () => {
  const [hiding, ...rest] = atlas.items;
  if (!hiding) throw new Error("fixture needs an item");
  const withLatest: HomepageAtlasData = {
    ...atlas,
    items: [{ ...hiding, latest: true }, ...rest],
  };

  /** The page's markup without its stylesheet, which names every class. */
  const markup = (data: HomepageAtlasData): string =>
    renderToStaticMarkup(<HomepageAtlas {...page} atlas={data} />).replace(
      /<style>[\s\S]*?<\/style>/g,
      "",
    );

  it("rings the latest piece's mark and names it in the legend as Latest, linking to it", () => {
    const html = markup(withLatest);
    expect(html).toContain(
      'class="atlas__mark atlas__mark--post atlas__mark--latest"',
    );
    expect(html.match(/atlas__mark--latest/g)).toHaveLength(1);
    const key = /<a class="atlas__key--latest"[^>]*>.*?<\/a>/.exec(html)?.[0];
    expect(key).toContain('href="/essays/hiding-in-plain-sight"');
    expect(key).toContain('data-atlas-latest="post:hiding"');
    // The ring alone says nothing to a screen reader; the link names the piece.
    expect(key).toContain('aria-label="Latest: Hiding in Plain Sight"');
    expect(key).toContain(">Latest</a>");
  });

  it("shows no Latest key while no piece is the latest", () => {
    const html = markup(atlas);
    expect(html).not.toContain("atlas__key--latest");
    expect(html).not.toContain("atlas__mark--latest");
  });

  it("draws the ring once, and holds it still for reduced motion", () => {
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__mark--latest > a::after \{[^}]*animation: atlas-latest [^}]*both/,
    );
    const still = homepageAtlasStyles.slice(
      homepageAtlasStyles.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(still).toContain(".atlas__mark--latest > a::after");
  });
});

describe("living atlas", () => {
  const html = (): string =>
    renderToStaticMarkup(<HomepageAtlas {...page} atlas={atlas} />);

  it("drifts each ring on its own phase so the terrain shifts, with crisp lines", () => {
    expect(homepageAtlasStyles).toContain("@keyframes atlas-drift");
    const delays = html().match(/animation-delay:-?[\d.]+s/g) ?? [];
    expect(delays.length).toBeGreaterThan(3);
    expect(new Set(delays).size).toBe(delays.length);
    expect(html()).not.toContain("feDisplacementMap");
  });

  it("holds the terrain still for visitors who prefer reduced motion", () => {
    expect(homepageAtlasStyles).toMatch(
      /prefers-reduced-motion: reduce\)[^}]*\.atlas__contour \{ animation: none; \}/,
    );
  });

  it("parts the contour lines around a territory name so it reads over dense rings", () => {
    const zone = /\.atlas__zone \{[^}]*text-shadow: ([^;]*);/.exec(
      homepageAtlasStyles,
    )?.[1];
    // Stacked tight shadows in the page colour: a solid halo, not a soft glow.
    expect(zone?.match(/0 0 [1-4]px var\(--color-bg\)/g)?.length).toBe(5);
  });

  it("starts the homepage copy on the header's content edge, however wide the screen", () => {
    expect(homepageAtlasStyles).toContain(
      "--atlas-edge: max(3rem, (100% - var(--layout-max-width, 72rem)) / 2);",
    );
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__talk \{[^}]*padding: [^;]* var\(--atlas-edge\);/,
    );
    // Phones and tablets take the header's gutter: 1.5rem, and 3rem from 48rem.
    const narrow = homepageAtlasStyles.slice(
      homepageAtlasStyles.indexOf("@media (max-width: 60rem)"),
    );
    expect(narrow).toMatch(/\.atlas \{[^}]*--atlas-edge: 1\.5rem;/);
    expect(narrow).toContain(
      "@media (min-width: 48rem) and (max-width: 60rem) { .atlas { --atlas-edge: 3rem; } }",
    );
    expect(narrow).toMatch(
      /\.atlas__talk \{[^}]*padding: \.9rem var\(--atlas-edge\) 2\.5rem;/,
    );
    // Without a map the copy keeps its measure, moved by the same edge.
    expect(homepageAtlasStyles).toContain(
      ".atlas--bare .atlas__talk { width: min(calc(48rem + var(--atlas-edge) - 3rem), 100%);",
    );
  });

  it("marks the parts the touch script needs", () => {
    expect(html()).toContain("data-atlas=");
    expect(html()).toContain("data-atlas-terrain");
    expect(html().match(/data-atlas-mark/g)?.length).toBe(atlas.items.length);
  });

  it("names the largest territories first, for the label script to place", () => {
    const [base] = atlas.zones;
    if (!base) throw new Error("fixture needs a zone");
    const small = { ...base, id: "small", name: "Small", members: 1 };
    const large = { ...base, id: "large", name: "Large", members: 3 };
    const markup = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={{ ...atlas, zones: [small, large] }} />,
    );
    const names = Array.from(
      markup.matchAll(/data-atlas-zone=""[^>]*>([^<]+)</g),
      (match) => match[1],
    );
    expect(names).toEqual(["Large", "Small"]);
  });

  it("records where the map's content ends, for phones to start the text there", () => {
    const fill = (markup: string): number =>
      Number(/--atlas-fill:([\d.]+)/.exec(markup)?.[1]);
    const lowest = Math.max(...atlas.items.map((item) => atlasTop(item.y)));
    const measured = fill(html());
    // Room below the lowest mark for its ring before the phone's legend.
    expect(measured).toBeGreaterThanOrEqual((lowest + 8) / 100);
    expect(measured).toBeLessThan(1);
    const [item] = atlas.items;
    if (!item) throw new Error("fixture needs an item");
    const atBottom = renderToStaticMarkup(
      <HomepageAtlas
        {...page}
        atlas={{ ...atlas, items: [{ ...item, y: 1 }] }}
      />,
    );
    expect(fill(atBottom)).toBeCloseTo((atlasTop(1) + 8) / 100);
  });

  it("keeps the chat box out of sight until Web Chat's boot makes it live", () => {
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__ask:not\(\[data-ask-ready\]\) \{ display: none; \}/,
    );
  });

  it("lets the text flow with the page on phones, even with the chat box docked", () => {
    const phone = homepageAtlasStyles.slice(
      homepageAtlasStyles.indexOf("@media (max-width: 60rem)"),
    );
    expect(phone).toMatch(
      /\.atlas--chat \.atlas__talk \{ max-height: none; overflow: visible; \}/,
    );
  });

  it("scrolls a docked conversation only with the text column, never inside the box", () => {
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__ask:not\(\[data-ask-sheet\]\) \.brain-box-scroll \{ max-height: none; overflow: visible; \}/,
    );
    expect(homepageAtlasStyles).toMatch(
      /\.atlas--chat \.atlas__talk \{[^}]*scrollbar-width: thin;[^}]*scrollbar-color: var\(--color-rule\) transparent;/,
    );
  });

  it("on a phone, lends the map to the open conversation, where it scrolls up into a strip", () => {
    const phone = homepageAtlasStyles.slice(
      homepageAtlasStyles.indexOf("@media (max-width: 47.99rem)"),
    );
    // The open conversation rises above the sticky site header.
    expect(phone).toMatch(
      /\.atlas:has\(\.atlas__ask\[data-ask-sheet\]\) \{ z-index: 1000; \}/,
    );
    // In the conversation's dock the map is the page's own, at its size, and
    // pins once only a strip of it is left.
    expect(phone).toMatch(
      /\.atlas__ask \[data-ask-dock\]:has\(\.atlas__map\) \{[^}]*position: sticky;[^}]*top: calc\(7\.5rem - \(var\(--atlas-band\) - 2rem\)\);/,
    );
    expect(phone).toMatch(
      /\.atlas__ask \[data-ask-dock\] \.atlas__map \{[^}]*height: calc\(var\(--atlas-band\) - 2rem\);/,
    );
    // A slot holds its place on the page meanwhile.
    expect(phone).toMatch(
      /\.atlas__map-slot \{[^}]*height: var\(--atlas-band\);/,
    );
    // An answer opens below the whole map.
    expect(phone).toMatch(
      /\.atlas__ask\[data-ask-sheet\]:not\(\[data-ask-keyboard\]\) \{ --ask-sheet-inset: calc\(var\(--atlas-band\) - 2rem\); \}/,
    );
    // Out of the way while typing.
    expect(phone).toMatch(
      /\.atlas__ask\[data-ask-keyboard\] \[data-ask-dock\] \{ display: none; \}/,
    );
    // The field keeps the answer's pieces in the middle of the part that shows.
    expect(homepageAtlasStyles).toMatch(/\.atlas__field \{ bottom: 2rem; \}/);
    expect(phone).toMatch(
      /--atlas-window: max\(7\.5rem, calc\(var\(--atlas-field-height\) - var\(--atlas-sheet-scroll, 0px\)\)\);/,
    );
    // Pieces near the map's edge still reach the strip's middle: the field may
    // move by as much as the strip hides, but never at full height.
    expect(phone).toMatch(
      /\.atlas__ask \[data-ask-dock\] \.atlas__field \{[^}]*top: clamp\(calc\(var\(--atlas-window\) - var\(--atlas-field-height\)\), calc\(var\(--atlas-field-height\) - var\(--atlas-window\) \/ 2 - /,
    );
    // Only an answer pans it.
    expect(phone).toMatch(
      /\.atlas__ask \[data-ask-dock\] \.atlas__field \{[^}]*transition: transform [^;]*;\s*\}/,
    );
    expect(phone).toMatch(
      /\.atlas__field\[data-atlas-panning\] \{[^}]*top \.9s/,
    );
    // Marks cut by its edges fade out, as the terrain does.
    expect(phone).toMatch(
      /\.atlas__ask \[data-ask-dock\] \.atlas__map::after \{[^}]*linear-gradient\(180deg, var\(--color-bg\), transparent/,
    );
    // Nothing of the old overlay: no fixed map, no separate rise and fall.
    expect(phone).not.toContain("position: fixed");
    expect(homepageAtlasStyles).not.toContain("atlas-sheet-rise");
    expect(homepageAtlasStyles).not.toContain("data-atlas-moving");
  });

  it("lifts an open card above every other mark, lit ones included", () => {
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__mark\[data-open\] \{ z-index: 4; \}/,
    );
    // A lit piece's own card too: its lit rule must not pull it back down.
    const lit = homepageAtlasStyles.indexOf(
      ".atlas__mark[data-cited] { z-index: 3; }",
    );
    const openLit = homepageAtlasStyles.indexOf(
      ".atlas__mark[data-cited][data-open] { z-index: 4; }",
    );
    expect(lit).toBeGreaterThan(-1);
    expect(openLit).toBeGreaterThan(lit);
  });

  it("keeps marks and their cards at their own size while the map zooms", () => {
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__field\[data-focused\] :is\(\.atlas__mark > :first-child, \.atlas__cited\) \{[^}]*scale: calc\(1 \/ var\(--atlas-focus-scale, 1\)\);/,
    );
  });

  it("opens the title cards of marks near the map's top below them, so they stay on the map", () => {
    const marks = Array.from(
      html().matchAll(
        /<li[^>]*class="([^"]*)"[^>]*style="left:[^;]*;top:([\d.]+)%"/g,
      ),
      (match): [string, number] => [match[1] ?? "", Number(match[2])],
    );
    expect(marks.length).toBeGreaterThan(0);
    for (const [className, top] of marks)
      expect(className.includes("atlas__mark--south")).toBe(top < 28);
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__mark--south \.atlas__tip \{[^}]*top: calc\(100% \+ \.3rem\);/,
    );
  });

  it("anchors title cards inward at both edges so they stay on screen", () => {
    expect(html()).toContain("atlas__mark--west");
    expect(html()).toContain("atlas__mark--east");
  });
});

describe("atlas hover on touch screens", () => {
  it("shows hover cards only where a pointer really hovers, never as sticky touch hover", () => {
    const hoverBlock = homepageAtlasStyles.indexOf("@media (hover: hover)");
    expect(hoverBlock).toBeGreaterThan(-1);
    for (const rule of [":hover .atlas__tip", ":hover .atlas__glyph"]) {
      const first = homepageAtlasStyles.indexOf(rule);
      expect(first).toBeGreaterThan(hoverBlock);
    }
  });

  const touch = (): string => {
    const start = homepageAtlasStyles.indexOf("@media (hover: none)");
    expect(start).toBeGreaterThan(-1);
    return homepageAtlasStyles.slice(start).split("\n}")[0] ?? "";
  };

  it("underlines an open card's title on touch screens, where the card is the way in", () => {
    expect(touch()).toMatch(
      /\.atlas__tip b \{[^}]*text-decoration-line: underline/,
    );
  });

  it("shows topics as the choices they are on touch screens: a list between hairlines, with no hover to reveal them", () => {
    expect(touch()).toMatch(
      /\.atlas__topics a \{[^}]*border-bottom: 1px solid var\(--color-border\)/,
    );
    expect(touch()).toMatch(/\.atlas__topics a \{[^}]*padding:/);
    expect(touch()).toMatch(
      /\.atlas__topics li:first-child a \{[^}]*border-top: 1px solid/,
    );
  });

  it("overrides the resting styles it follows, so touch sizes win at equal specificity", () => {
    const touchBlock = homepageAtlasStyles.indexOf("@media (hover: none)");
    for (const base of [
      ".atlas__topics {",
      ".atlas__topics a {",
      ".atlas__tip b {",
    ])
      expect(homepageAtlasStyles.indexOf(base)).toBeLessThan(touchBlock);
  });
});

describe("atlas copy", () => {
  it("uses the words the owner wrote around the door and the map", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={atlas} />,
    );
    for (const words of [
      "Pick a thread",
      "Write to me",
      "I read these myself.",
      "My published work, by topic",
    ]) {
      expect(html).toContain(words);
    }
  });

  it("leaves out words nobody wrote and names the button plainly", () => {
    const opening = {
      ...page.opening,
      title: "Building something inhabitable.",
      introduction: null,
      topics: [],
      contactUrl: "https://yeehaa.test/contact",
      topicsHeading: null,
      contactLabel: null,
      contactNote: null,
      mapCaption: null,
    };
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} opening={opening} atlas={atlas} />,
    );
    for (const fixed of [
      "Where would you start?",
      "Let’s talk",
      "A private note to the owner",
      "Written, not generated",
      "Everything published here",
    ]) {
      expect(html).not.toContain(fixed);
    }
    expect(html).toContain(
      'href="https://yeehaa.test/contact" data-atlas-door="">Contact</a>',
    );
    expect(html).not.toContain('class="atlas__caption"');
    expect(html).not.toContain('class="atlas__note"');
  });
});

describe("atlas styles for the conversation", () => {
  const phone = homepageAtlasStyles.slice(
    homepageAtlasStyles.indexOf("@media (max-width: 47.99rem)"),
  );

  it("draws each source in its mark's shape, named as the legend names it", () => {
    expect(homepageAtlasStyles).toMatch(
      /\[data-ask-source\^="deck:"\] \.brain-box-source-mark \{[^}]*rotate: 45deg/,
    );
    expect(homepageAtlasStyles).toMatch(
      /\[data-ask-source\^="project:"\] \.brain-box-source-mark \{[^}]*border-radius: 1\.5px/,
    );
    expect(homepageAtlasStyles).toMatch(
      /\[data-atlas-type\]::after \{[^}]*content: attr\(data-atlas-type\)/,
    );
  });

  it("lights a piece with one thin ring, not a blurred halo", () => {
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__mark\[data-cited\] \.atlas__glyph \{[^}]*box-shadow: 0 0 0 2px var\(--color-bg\), 0 0 0 3px var\(--color-accent\);/,
    );
  });

  it("keeps a phone's type below the desktop sizes", () => {
    expect(phone).toMatch(
      /\.atlas h1 \{ font-size: clamp\(2\.1rem, 9\.5vw, 2\.6rem\)/,
    );
    expect(phone).toMatch(/\.atlas__prose \{ font-size: 1rem; \}/);
  });
});

describe("atlas with guest chat", () => {
  const html = (): string =>
    renderToStaticMarkup(<HomepageAtlas {...page} atlas={atlas} askBox />);

  it("renders the shared chat host, disabled until Web Chat's boot enables it", () => {
    expect(html()).toContain('data-ask-box=""');
    // Web Chat's shared box presentation, themed by the site's own tokens.
    expect(html()).toContain('data-ask-styled=""');
    expect(html()).toContain('data-ask-send=""');
    expect(html()).toContain('data-ask-status=""');
    expect(html()).toMatch(/<textarea[^>]*disabled/);
    // The box asks in the page's own voice, before and after it mounts.
    expect(html()).toContain('data-ask-placeholder="Ask about my work…"');
    expect(html()).toMatch(/<textarea[^>]*placeholder="Ask about my work…"/);
    expect(html()).toContain('src="/ask/assets/box.js"');
  });

  it("lets topics fill the draft, while each still reaches the contact form", () => {
    expect(html()).toMatch(
      /href="https:\/\/yeehaa\.test\/contact\?topic=Someone\+who\+carries[^"]*" data-atlas-door="" data-atlas-fill="Someone who carries a lot is about to leave"/,
    );
  });

  it("keeps the door to the owner outside the chat", () => {
    expect(html()).toMatch(
      /class="atlas__contact" href="https:\/\/yeehaa\.test\/contact" data-atlas-door="">Write to me/,
    );
  });

  it("carries a hidden layer for leads from an answer's sources to the map", () => {
    expect(html()).toMatch(/<svg[^>]*data-atlas-leads[^>]*aria-hidden="true"/);
  });

  it("lets a lit piece show where a phone's answer cites it", () => {
    expect(html()).toMatch(
      /<button type="button" class="atlas__cited" data-atlas-cited="">Where it’s cited ↓<\/button>/,
    );
    const phone = homepageAtlasStyles.slice(
      homepageAtlasStyles.indexOf("@media (max-width: 47.99rem)"),
    );
    // Only on the open card of a lit piece, in the open conversation.
    expect(homepageAtlasStyles).toMatch(/\.atlas__cited \{ display: none; \}/);
    expect(phone).toMatch(
      /\.atlas__ask \[data-ask-dock\] \.atlas__mark\[data-open\]\[data-cited\] \.atlas__cited \{[^}]*display: block;/,
    );
    // Beside its mark, towards the map's middle, so no edge of the map cuts it.
    expect(phone).toMatch(
      /\.atlas__mark\[data-open\]\[data-cited\] \.atlas__cited \{[^}]*top: 50%; left: calc\(100% \+ \.3rem\); translate: 0 -50%;/,
    );
    expect(phone).toMatch(
      /\.atlas__mark--west\[data-open\]\[data-cited\] \.atlas__cited \{ left: auto; right: calc\(100% \+ \.3rem\); \}/,
    );
    // A tapped source pulses its piece; a piece's source flashes in the answer.
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__mark\[data-atlas-pulse\] \.atlas__glyph \{ animation: atlas-pulse /,
    );
    expect(homepageAtlasStyles).toMatch(
      /\.atlas__ask \[data-ask-source\]\[data-atlas-flash\] \{ animation: atlas-flash /,
    );
  });

  it("gives the script a handle on the map it lends to a phone's conversation", () => {
    expect(html()).toMatch(/<div class="atlas__map" data-atlas-map=""/);
  });

  it("keys every mark as the answer's sources are keyed", () => {
    expect(html()).toContain('data-atlas-key="post:hiding"');
    expect(html()).toContain('data-atlas-key="project:lefthoek"');
  });

  it("stays a static page with no chat when guest chat is off", () => {
    const off = renderToStaticMarkup(<HomepageAtlas {...page} atlas={atlas} />);
    expect(off).not.toContain("data-ask-box");
    expect(off).not.toContain("data-atlas-fill");
    expect(off).not.toContain("data-atlas-leads");
    expect(off).not.toContain('data-atlas-cited=""');
    expect(off).not.toContain("<script");
  });
});

describe("atlas frame around a supplied map", () => {
  const supplied = {
    label: "Agent network",
    element: <svg data-supplied-map="" />,
  };

  it("draws the site's own map in the map box, under its own name, with no terrain", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas {...page} atlas={null} map={supplied} />,
    );
    expect(html).toMatch(
      /<div class="atlas__map atlas__map--supplied" role="group" aria-label="Agent network"><svg data-supplied-map=""><\/svg><\/div>/,
    );
    expect(html).not.toContain("data-atlas-terrain");
    expect(html).not.toContain('class="atlas atlas--bare"');
    expect(html).toContain("Building something inhabitable.");
  });

  it("leaves out the door when there is no contact form to reach", () => {
    const html = renderToStaticMarkup(
      <HomepageAtlas
        {...page}
        opening={{ ...page.opening, contactUrl: null }}
        atlas={null}
        map={supplied}
      />,
    );
    expect(html).toContain("Building something inhabitable.");
    expect(html).not.toContain('class="atlas__door"');
    expect(html).not.toContain("data-atlas-door");
    expect(html).not.toContain("Someone who carries a lot is about to leave");
  });
});
