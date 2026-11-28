import type { CSSProperties, JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type RouteDefinitionInput,
  type SectionDefinition,
} from "@rizom/site";
import { linkSchema } from "../home/links";
import { parsePhoto } from "../portrait";
import { Dot, Emphasized, Label, PageWrap, pageRoute } from "./common";

/**
 * About The Fourth: the fourth wall broken open, the mission (ideas spoken,
 * heard and grown, two of them drawn), the cast of two guides, and the
 * guides off stage on a wall of taped photos.
 */
const heroSchema = z.object({
  headline: z.string(),
  emphasis: z.string(),
  text: z.string(),
});

/** Bricks that fly off as the wall breaks: where they start and where they go. */
const CHIPS = [
  {
    left: "30%",
    top: "30%",
    w: 26,
    h: 14,
    cx: "-120px",
    cy: "-90px",
    cr: "-60deg",
  },
  {
    left: "68%",
    top: "26%",
    w: 20,
    h: 12,
    cx: "140px",
    cy: "-70px",
    cr: "80deg",
  },
  {
    left: "26%",
    top: "66%",
    w: 22,
    h: 12,
    cx: "-150px",
    cy: "90px",
    cr: "45deg",
  },
  {
    left: "72%",
    top: "70%",
    w: 28,
    h: 14,
    cx: "130px",
    cy: "110px",
    cr: "-70deg",
  },
  {
    left: "50%",
    top: "18%",
    w: 16,
    h: 10,
    cx: "20px",
    cy: "-130px",
    cr: "120deg",
  },
];

type ChipPlacement = CSSProperties & {
  "--cx": string;
  "--cy": string;
  "--cr": string;
};

function chipPlacement(chip: (typeof CHIPS)[number]): ChipPlacement {
  return {
    left: chip.left,
    top: chip.top,
    width: chip.w,
    height: chip.h,
    "--cx": chip.cx,
    "--cy": chip.cy,
    "--cr": chip.cr,
  };
}

function HeroSection({
  headline,
  emphasis,
  text,
}: z.infer<typeof heroSchema>): JSX.Element {
  return (
    <section className="tf-wall" aria-label={`${headline} ${emphasis}`}>
      <svg
        className="tf-wall__bricks"
        aria-hidden="true"
        width="100%"
        height="100%"
      >
        <defs>
          <pattern
            id="tf-brick"
            width="120"
            height="56"
            patternUnits="userSpaceOnUse"
          >
            <rect width="120" height="56" fill="#232323" />
            <rect x="3" y="3" width="114" height="23" fill="#3A3836" />
            <rect x="-57" y="30" width="114" height="23" fill="#34322F" />
            <rect x="63" y="30" width="114" height="23" fill="#34322F" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tf-brick)" />
      </svg>
      {CHIPS.map((chip) => (
        <span
          key={`${chip.left}-${chip.top}`}
          className="tf-wall__chip"
          aria-hidden="true"
          style={chipPlacement(chip)}
        />
      ))}
      <div className="tf-wall__break">
        <h1 className="tf-wall__headline">
          {headline} <span>{emphasis}</span>
        </h1>
        <p className="tf-wall__text">{text}</p>
      </div>
    </section>
  );
}

export const hero: SectionDefinition = defineSection(heroSchema, HeroSection, {
  title: "About — the fourth wall",
  description:
    "The poster breaking through the wall: the headline's first words, the words on their own line under them, and the sentence below.",
});

const missionSchema = z.object({
  label: z.string(),
  statement: z.string(),
  paragraphs: z.array(z.string()),
  spoken: z.object({
    label: z.string(),
    acts: z.array(z.object({ numeral: z.string(), name: z.string() })),
    title: z.string(),
    text: z.string(),
  }),
  heard: z.object({
    label: z.string(),
    button: z.string(),
    fold: z.string(),
    unfold: z.string(),
    title: z.string(),
    text: z.string(),
  }),
  grown: z.object({ strong: z.string(), text: z.string() }),
});

/** The statement's words between asterisks, underlined red, mustard, mint. */
function Statement({ text }: { text: string }): JSX.Element {
  const parts = text.split(/\*([^*]+)\*/);
  const lights = ["red", "mustard", "mint"];
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span
            key={index}
            className={`tf-mark-word tf-mark-word--${lights[Math.floor(index / 2) % lights.length]}`}
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function MissionSection({
  label,
  statement,
  paragraphs,
  spoken,
  heard,
  grown,
}: z.infer<typeof missionSchema>): JSX.Element {
  const last = spoken.acts.length - 1;
  return (
    <section className="tf-grain">
      <PageWrap className="tf-mission">
        <Label>{label}</Label>
        <p className="tf-mission__statement tf-reveal">
          <Statement text={statement} />
        </p>
        <div className="tf-stack tf-stack--loose tf-mission__paragraphs">
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className="tf-body tf-body--large">
              {paragraph}
            </p>
          ))}
        </div>
        <div className="tf-mission__figures">
          <figure className="tf-diagram tf-reveal">
            <span className="tf-diagram__label">
              <Dot light="red" />
              {spoken.label}
            </span>
            <div className="tf-acts" aria-hidden="true">
              {spoken.acts.map((act, index) => (
                <span
                  key={act.numeral}
                  className={
                    index === last
                      ? "tf-acts__act tf-acts__act--fourth"
                      : "tf-acts__act"
                  }
                >
                  <span className="tf-acts__numeral">{act.numeral}</span>
                  <span className="tf-acts__name">{act.name}</span>
                </span>
              ))}
            </div>
            <figcaption className="tf-diagram__caption">
              <span className="tf-diagram__title">{spoken.title}</span>
              <span>{spoken.text}</span>
            </figcaption>
          </figure>
          <figure className="tf-diagram tf-reveal">
            <span className="tf-diagram__label">
              <Dot light="mustard" />
              {heard.label}
            </span>
            <button
              type="button"
              className="tf-fold"
              aria-pressed="false"
              aria-label={heard.button}
              data-fold={heard.fold}
              data-unfold={heard.unfold}
            >
              <span className="tf-fold__paper">
                <span className="tf-fold__half tf-fold__half--left">
                  <span className="tf-fold__dot tf-fold__dot--a">A</span>
                  <span className="tf-fold__path" aria-hidden="true" />
                </span>
                <span className="tf-fold__flap">
                  <span className="tf-fold__face tf-fold__face--front">
                    <span className="tf-fold__dot tf-fold__dot--b">B</span>
                  </span>
                  <span className="tf-fold__face tf-fold__face--back">
                    <span className="tf-fold__dot tf-fold__dot--met">A·B</span>
                  </span>
                </span>
                <span className="tf-fold__label" aria-hidden="true">
                  {heard.fold}
                </span>
              </span>
            </button>
            <figcaption className="tf-diagram__caption">
              <span className="tf-diagram__title">{heard.title}</span>
              <span>{heard.text}</span>
            </figcaption>
          </figure>
        </div>
        <p className="tf-mission__grown">
          <Dot light="mint" />
          <span>
            <strong>{grown.strong}</strong> {grown.text}
          </span>
        </p>
      </PageWrap>
    </section>
  );
}

export const mission: SectionDefinition = defineSection(
  missionSchema,
  MissionSection,
  {
    title: "About — the mission",
    description:
      "The mission: the label, the statement (its three words between asterisks get a red, mustard and mint line), the paragraphs, how ideas get spoken (label, the acts as numeral and name, title, text), how they get heard (label, the button's name for screen readers, its fold and unfold words, title, text) and how they grow (bold lead and text).",
  },
);

/**
 * The fold: pressing the paper folds B onto A and back. Without the script
 * the paper stays open and the caption still tells the trick.
 */
export const foldScript: string = `<script>
document.addEventListener("click", function (event) {
  var fold = event.target instanceof Element ? event.target.closest(".tf-fold") : null;
  if (!fold) return;
  var folded = fold.getAttribute("aria-pressed") !== "true";
  fold.setAttribute("aria-pressed", folded ? "true" : "false");
  var label = fold.querySelector(".tf-fold__label");
  if (label) label.textContent = fold.getAttribute(folded ? "data-unfold" : "data-fold");
});
</script>`;

const guideSchema = z.object({
  first: z.string(),
  last: z.string(),
  native: z.string().default(""),
  role: z.string(),
  photo: z.string().default(""),
  light: z.enum(["red", "mint"]),
  bio: z.string(),
  strengths: z.array(z.string()).default([]),
  previously: z
    .object({ title: z.string(), text: z.string() })
    .default({ title: "", text: "" }),
});

const castSchema = z.object({
  label: z.string(),
  headline: z.string(),
  intro: z.string(),
  starring: z.string(),
  strengthsLabel: z.string(),
  guides: z.array(guideSchema),
});

function CastSection({
  label,
  headline,
  intro,
  starring,
  strengthsLabel,
  guides,
}: z.infer<typeof castSchema>): JSX.Element {
  return (
    <section className="tf-grain">
      <PageWrap className="tf-cast">
        <div className="tf-cast__head">
          <span className="tf-cast__label">{label}</span>
          <h2 className="tf-cast__headline tf-reveal">{headline}</h2>
          <p className="tf-cast__intro">{intro}</p>
        </div>
        <div className="tf-cast__guides">
          {guides.map((guide, index) => {
            const photo = parsePhoto(guide.photo);
            return (
              <article key={guide.first} className="tf-guide tf-reveal">
                {photo && (
                  <div className="tf-guide__portrait" aria-hidden="true">
                    <div
                      className={`tf-guide__disc tf-guide__disc--${guide.light}`}
                    />
                    <div
                      className={
                        index % 2 === 1
                          ? "tf-guide__frame tf-guide__frame--right"
                          : "tf-guide__frame"
                      }
                    >
                      <img src={photo.src} alt="" loading="lazy" />
                    </div>
                  </div>
                )}
                <div className="tf-stack">
                  <span className="tf-guide__starring">{starring}</span>
                  <h3 className="tf-guide__name">
                    {guide.first}
                    <br />
                    {guide.last}
                    {guide.native && (
                      <>
                        {" "}
                        <span className="tf-guide__native" lang="zh-TW">
                          {guide.native}
                        </span>
                      </>
                    )}
                  </h3>
                  <span className="tf-guide__role">{guide.role}</span>
                </div>
                <p className="tf-body tf-body--card">{guide.bio}</p>
                {guide.strengths.length > 0 && (
                  <ul className="tf-stubs" aria-label={strengthsLabel}>
                    {guide.strengths.map((strength) => (
                      <li key={strength} className="tf-stub">
                        {strength}
                      </li>
                    ))}
                  </ul>
                )}
                {guide.previously.text && (
                  <div className="tf-note-card">
                    <span className="tf-tape" aria-hidden="true" />
                    <span className="tf-note-card__title">
                      {guide.previously.title}
                    </span>
                    <p>{guide.previously.text}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </PageWrap>
    </section>
  );
}

export const cast: SectionDefinition = defineSection(castSchema, CastSection, {
  title: "About — the cast",
  description:
    "The guides: the label, headline and intro, the word over each name, the name for screen readers of their strengths, and each guide (first name, last name, name in Chinese, role, portrait as ![alt](entity://image/<id>), the disc's light: red or mint, bio, strengths, and an optional note from before: title and text).",
});

const offStageSchema = z.object({
  headline: z.string(),
  text: z.string(),
  listen: linkSchema,
  photos: z.array(z.object({ photo: z.string(), caption: z.string() })),
});

/** How each photo hangs on the wall: width, tilt, offsets and the tape's place. */
const PINS = [
  {
    width: "clamp(240px, 30vw, 400px)",
    margin: "30px 0 0 0",
    turn: -3,
    tape: "30%",
    tapeTurn: -6,
    ratio: "4 / 3",
    z: 2,
  },
  {
    width: "clamp(220px, 26vw, 340px)",
    margin: "0 0 0 -30px",
    turn: 5,
    tape: "62%",
    tapeTurn: 4,
    ratio: "3 / 2",
    z: 3,
  },
  {
    width: "clamp(160px, 17vw, 230px)",
    margin: "56px 0 0 -26px",
    turn: -6,
    tape: "45%",
    tapeTurn: -10,
    ratio: "3 / 4",
    z: 4,
  },
  {
    width: "clamp(160px, 17vw, 220px)",
    margin: "10px 0 0 -22px",
    turn: 3,
    tape: "55%",
    tapeTurn: 7,
    ratio: "3 / 4",
    z: 1,
  },
  {
    width: "clamp(230px, 27vw, 360px)",
    margin: "-6px 0 0 20px",
    turn: 2,
    tape: "40%",
    tapeTurn: 3,
    ratio: "3 / 2",
    z: 2,
  },
  {
    width: "clamp(170px, 18vw, 240px)",
    margin: "34px 0 0 -24px",
    turn: -7,
    tape: "66%",
    tapeTurn: -4,
    ratio: "4 / 5",
    z: 3,
  },
  {
    width: "clamp(170px, 19vw, 250px)",
    margin: "0 0 0 -30px",
    turn: 4,
    tape: "38%",
    tapeTurn: 9,
    ratio: "3 / 4",
    z: 5,
  },
  {
    width: "clamp(240px, 24vw, 320px)",
    margin: "44px 0 0 -26px",
    turn: -2.5,
    tape: "58%",
    tapeTurn: -3,
    ratio: "1 / 1",
    z: 1,
  },
];

type PinPlacement = CSSProperties & {
  "--pin-width": string;
  "--pin-margin": string;
  "--pin-turn": string;
  "--pin-ratio": string;
  "--tape-left": string;
  "--tape-turn": string;
};

function pinPlacement(pin: (typeof PINS)[number]): PinPlacement {
  return {
    "--pin-width": pin.width,
    "--pin-margin": pin.margin,
    "--pin-turn": `${pin.turn}deg`,
    "--pin-ratio": pin.ratio,
    "--tape-left": pin.tape,
    "--tape-turn": `${pin.tapeTurn}deg`,
    zIndex: pin.z,
  };
}

function OffStageSection({
  headline,
  text,
  listen,
  photos,
}: z.infer<typeof offStageSchema>): JSX.Element {
  return (
    <section className="tf-grain">
      <PageWrap className="tf-offstage">
        <div className="tf-offstage__head">
          <div className="tf-stack tf-offstage__words">
            <h2 className="tf-offstage__headline">{headline}</h2>
            <p className="tf-body">
              <Emphasized text={text} />
            </p>
          </div>
          <a
            className="tf-btn tf-btn--ink"
            href={listen.href}
            target="_blank"
            rel="noopener"
          >
            {listen.label}
          </a>
        </div>
        <div className="tf-pins">
          {photos.flatMap((item, index) => {
            const photo = parsePhoto(item.photo);
            const pin = PINS[index % PINS.length];
            if (!photo || !pin) return [];
            return [
              <figure
                key={item.caption}
                className="tf-pin"
                style={pinPlacement(pin)}
              >
                <span className="tf-tape" aria-hidden="true" />
                <img src={photo.src} alt={photo.alt} loading="lazy" />
                <figcaption>{item.caption}</figcaption>
              </figure>,
            ];
          })}
        </div>
      </PageWrap>
    </section>
  );
}

export const offStage: SectionDefinition = defineSection(
  offStageSchema,
  OffStageSection,
  {
    title: "About — off stage",
    description:
      "The guides off stage: the headline, the sentence (words between asterisks in italics), the podcast link, and the photos on the wall, each ![alt](entity://image/<id>) with its caption.",
  },
);

const PODCAST =
  "https://podcasts.apple.com/tw/podcast/%E4%B8%8D%E6%98%AF%E5%9C%A8%E8%AA%AA%E4%BD%A0/id1674146827?l=en-GB";

const aboutContent = {
  hero: {
    headline: "Breaking",
    emphasis: "the fourth wall.",
    text: "A story is the fastest way through the screen between you and the people you want to reach.",
  },
  mission: {
    label: "Our mission",
    statement:
      "The Fourth aims to create an environment for important ideas to be *spoken*, *heard*, and *grown*.",
    paragraphs: [
      "We started in 2024 because we kept meeting good work that the right people never got to hear about.",
      "Important ideas rarely fail because they’re wrong. They stall because they’re said in a language only insiders speak, or never reach the people who would care. So we build the conditions for them: the right words, the right voices, and room to keep going after the first round.",
    ],
    spoken: {
      label: "How ideas get spoken",
      acts: [
        { numeral: "I", name: "Setup" },
        { numeral: "II", name: "Conflict" },
        { numeral: "III", name: "Resolution" },
        { numeral: "IV", name: "Switch places" },
      ],
      title: "Masterminding the fourth act",
      text: "After the story ends comes the moment your audience switches places and sees it anew.",
    },
    heard: {
      label: "How ideas get heard",
      button: "Fold the paper so A meets B",
      fold: "Fold the paper →",
      unfold: "Unfold it ↺",
      title: "Entering the fourth dimension",
      text: "The fastest way from A to B isn’t a longer line. Fold the paper, and your message reaches the people it’s for, with nothing lost.",
    },
    grown: {
      strong: "And grown:",
      text: "every round shows who is still missing, so the next one reaches further.",
    },
  },
  cast: {
    label: "The cast",
    headline: "Every hero needs a guide.",
    intro:
      "Ideally one who’s already taken the wrong turns. Two women co-founders, with separate expertise and shared decisions.",
    starring: "Starring",
    strengthsLabel: "Strengths",
    guides: [
      {
        first: "Samantha Y.",
        last: "Shao",
        native: "邵容謙",
        role: "Co-founder · Brand strategy, client partnerships, ContentDNA™ development",
        photo: "![Samantha Shao](entity://image/samantha-shao)",
        light: "red",
        bio: "Sam spent nine years in public relations and communications at agencies and start-ups in Taiwan and the US. Before The Fourth, her clients included Porsche, Emirates and Expedia. She studied history and contemporary art curation, and she still reads every brand the way a curator reads a show: what is it really saying, and to whom?",
        strengths: [
          "Marketing analysis",
          "Communication strategy",
          "Crisis management",
        ],
        previously: {
          title: "Previously…",
          text: "At a US beauty-tech brand, sharpening the brand’s personality helped lift e-commerce conversion to a 6% peak, holding around 5%.",
        },
      },
      {
        first: "Becca",
        last: "Chen",
        native: "陳玠汝",
        role: "Co-founder · Content strategy, creator partnerships, content classification",
        photo: "![Becca Chen](entity://image/becca-chen)",
        light: "mint",
        bio: "Becca has 8+ years developing new-media content. She plans events, manages creators, designs content, writes scripts and produces video. Her clients have included the National Palace Museum, the National Museum of Taiwan Literature and LINE VOOM.",
        strengths: [
          "Events",
          "Creator management",
          "Content design",
          "Scriptwriting",
          "Video production",
        ],
      },
    ],
  },
  "off-stage": {
    headline: "Off stage.",
    text: "Sam and Becca have known each other for more than half their lives. They also host the podcast *Not About You* 不是在說你.",
    listen: { label: "Listen to the podcast ↗", href: PODCAST },
    photos: [
      {
        photo:
          "![The team in the living room, posing with peace signs](entity://image/offstage-team)",
        caption: "The team, on a good day",
      },
      {
        photo:
          "![Sam and Becca pulling faces](entity://image/offstage-sam-becca)",
        caption: "Sam & Becca",
      },
      {
        photo:
          "![Sam and Becca recording the podcast](entity://image/offstage-podcast)",
        caption: "Recording the podcast",
      },
      {
        photo:
          "![Filming a video at a dining table](entity://image/offstage-camera)",
        caption: "Behind the camera",
      },
      {
        photo:
          "![A guided tour at a museum exhibition](entity://image/offstage-tour)",
        caption: "Double act at work",
      },
      {
        photo:
          "![Sam speaking at a Rizom event](entity://image/offstage-stage)",
        caption: "Sam, on stage",
      },
      {
        photo:
          "![Becca hosting a community night](entity://image/offstage-hosting)",
        caption: "Becca, hosting",
      },
      {
        photo:
          "![Guests writing by candlelight at a community night](entity://image/offstage-confession)",
        caption: "Community confession night",
      },
    ],
  },
  "next-step": {
    eyebrow: "Curtain call",
    headline: "Want to talk to the guides?",
    action: { label: "Book a conversation →", href: "/work-with-us" },
  },
} satisfies Record<string, JsonObject>;

export const aboutRoute: RouteDefinitionInput = pageRoute(
  {
    id: "about",
    path: "/about",
    title: "About — The Fourth",
    description:
      "Breaking the fourth wall: The Fourth's mission, and Sam and Becca, the guides behind it.",
    translations: {
      "zh-TW": {
        title: "關於我們 — The Fourth",
        description:
          "打破第四道牆：The Fourth 的使命，以及背後的兩位引路人 Sam 與 Becca。",
      },
    },
  },
  [
    { id: "hero", template: "about:hero", content: aboutContent.hero },
    { id: "mission", template: "about:mission", content: aboutContent.mission },
    { id: "cast", template: "about:cast", content: aboutContent.cast },
    {
      id: "off-stage",
      template: "about:off-stage",
      content: aboutContent["off-stage"],
    },
    {
      id: "next-step",
      template: "page:next-step",
      content: aboutContent["next-step"],
    },
  ],
);
