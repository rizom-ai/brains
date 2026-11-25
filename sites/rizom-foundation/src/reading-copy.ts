import type { SectionDefinitionInput } from "@rizom/site";

/**
 * The words the reading pages start with: Common Sense and the
 * founding-supporters page of 21 November 2026. Each part is a section of
 * its route, so the brain keeps it as site-content/<route>/<part>.md once
 * edited there; until then these stand.
 */
export const commonSenseParts: SectionDefinitionInput[] = [
  {
    id: "head",
    template: "reading:head",
    content: {
      title: "Common Sense",
      subtitle: "The case for collective intelligence",
    },
  },
  {
    id: "vision",
    template: "reading:prose",
    content: {
      heading: "Vision",
      body: [
        "A world in which intelligence is collective. People and organizations hold what they know, and why, so nothing depends on one indispensable person or one platform. They connect the way a rhizome does, sharing what they choose and growing from any point, so that what one of them learns can make the others stronger. With memory that has a home, no one has to patch the gaps by hand, chasing who knows what or explaining the same decision twice, and people get to do what they do best: making things and solving puzzles together.",
      ],
    },
  },
  {
    id: "obstacle",
    template: "reading:prose",
    content: {
      heading: "What stands in the way",
      body: [
        "People and organizations rarely lose what they know all at once. It drains away, because their memory has no home of its own: who knows what, why a decision was made, whose judgment settles a question. Memory without a home settles wherever it is cheapest to keep. For a long time that meant a few indispensable people, who take it with them when they leave. Now it increasingly means a model owned by one company, which amplifies whatever it finds, confusion included. The two look different, but they are symptoms of the same gap.",
        "None of this is a law of nature. How people remember and decide together is built, by habits and by tools, so it can be built differently. Vendor tools keep memory you cannot take elsewhere, wikis lose who knows what and why, and open-source tools leave independent parties without shared rules for connecting. What is missing is a commons: memory that keeps its reasons, and agreements that no one in the middle owns.",
      ],
    },
  },
  {
    id: "why-now",
    template: "reading:prose",
    content: {
      heading: "Why now",
      body: [
        "Models are getting smaller and more open, and their value shifts to the context they work with, which is local. Middle powers such as Europe, Canada and Taiwan increasingly want digital infrastructure of their own, built with partners they choose; their strength has always been cooperation among many independent parties rather than size. If that context lives in memory people own, intelligence moves to the edge with it. If it lives inside a vendor's tools, the center has only moved. The defaults are being set now.",
      ],
    },
  },
  {
    id: "steps",
    template: "reading:steps",
    content: {
      heading: "The change runs through two steps",
      lede: "Each with a technical and a social side.",
      items: [
        {
          term: "Memory they own",
          text: "Each person and organization has a Brain: their memory in open files they own, which people and their AI tools can work from. It keeps the map of who knows what, whose judgment counts and why things were decided, while lived experience stays with the people who hold it. A practice makes writing down reasons a habit. Knowledge stops depending on who is still in the room.",
        },
        {
          term: "Connection without a center",
          text: "An open standard lets independent parties find each other by expertise, share what they choose and keep a record of their agreements, signed by both and held by each. A charter sets how disagreements are settled. The Foundation holds the rules, never the parties' memory, and anyone can host their own and leave.",
        },
      ],
      closing:
        "Together these turn memory and coordination into shared infrastructure that no single person or company holds. That is what we mean by collective intelligence.",
    },
  },
  {
    id: "mission",
    template: "reading:mission",
    content: {
      heading: "Mission",
      text: "The Rizom Foundation works to decenter AI, moving intelligence back to the people and organizations it comes from. It gives them memory of their own and connections that no one in the middle owns, so that what they know depends neither on one company's model nor on a few indispensable people. The Foundation researches and builds that infrastructure, technical and social, and holds it as a commons that cannot be sold.",
      body: [],
    },
  },
  {
    id: "spread",
    template: "reading:prose",
    content: {
      heading: "How it spreads",
      body: [
        "**Hubs.** A hub gets a Brain of its own, fed by its members, and members who want more take a Brain of their own. An organization outside a hub starts with a setup that maps who knows what and why, and leaves with a Brain of its own and the habit of keeping it.",
        "**Certified partners.** Practitioners learn the method by apprenticeship and are certified by the Foundation. The method and the name stay with the Foundation, and 25% of every engagement flows back to the commons.",
        "**A think tank that builds.** The Foundation publishes its research as essays and working software, so an argument can be tried as well as read, and takes part in the debate on digital sovereignty in Europe and Taiwan.",
      ],
    },
  },
  {
    id: "assumptions",
    template: "reading:assumptions",
    content: {
      heading: "Five assumptions, tested in public",
      items: [
        "Memory that people own strengthens their map of who knows what, and keeps it intact when people leave.",
        "People will hold their own memory once it costs no more effort than handing it over.",
        "Connection without a center can be made as easy as a platform, so parties do not drift back to one.",
        "Others can learn the method through apprenticeship, without its author in the room.",
        "Organizations pay for the method and hosting though the software is free, and a share of that funds the commons.",
      ],
      note: "Each assumption has a test and its thresholds, published before the test runs. The results are published either way.",
    },
  },
  {
    id: "goals",
    template: "reading:goals",
    content: {
      heading: "Goals for the end of 2027",
      lede: "",
      items: [
        {
          term: "Memory they own",
          text: "At least three organizations run their own Brain for six months without the founder's hands, with their memory measured before and after. One rehearses the exit to self-hosting.",
        },
        {
          term: "Connection without a center",
          text: "The open standard and the charter are published, and two independent parties have kept an agreement through it for six months, with no one from Rizom in the middle.",
        },
        {
          term: "Certified partners",
          text: "The registry is public, at least two partners are certified, and one has delivered without the founder, on par with the founder's own work.",
        },
        {
          term: "Hubs",
          text: "The first public program has run in a hub, and six months later at least half of its organizations still use the memory it left behind.",
        },
        {
          term: "Research in public",
          text: "All five assumptions are published with their tests before they run, and with their results afterwards, including any that fail.",
        },
        {
          term: "Funding",
          text: "The first year, about €115,000, is funded from pledges and the commons remit with no say attached, plus a first grant in the Foundation's own name.",
        },
      ],
      closing: "",
    },
  },
  {
    id: "why",
    template: "reading:prose",
    content: {
      heading: "Why a foundation",
      body: [
        "Infrastructure people depend on should not belong to whoever happens to sell it. The Foundation owns the code, the method and the Rizom name. The core stays under AGPL, the SDK and protocols under Apache. Rizom B.V. runs hosting and client work under license, cannot take the commons with it, and pays 25% of every engagement back. An independent board majority decides on the license, the name and the company, and the Foundation takes no investors.",
        "No one has to take Rizom on trust. Anyone can read the code, run it for free and leave with their memory. Hosting differs from self-hosting by service, never by what the software can do, and no supporter, funder or partner gains a say over the license, the name or the code.",
      ],
    },
  },
  {
    id: "close",
    template: "reading:close",
    content: {
      text: "The Rizom Foundation is a think tank that builds. It works to decenter AI by giving people and organizations memory of their own and connections that no one in the middle owns. It holds that infrastructure as an open commons that cannot be sold, tests its assumptions in public, and spreads its method through hubs and certified partners.",
      doors: [
        {
          label: "Become a founding supporter →",
          href: "/support",
        },
        {
          label: "yeehaa@rizom.ai",
          href: "mailto:yeehaa@rizom.ai",
        },
      ],
    },
  },
];

export const supportParts: SectionDefinitionInput[] = [
  {
    id: "head",
    template: "reading:head",
    content: {
      title: "Become a founding supporter",
      subtitle: "Rizom Foundation",
    },
  },
  {
    id: "opening",
    template: "reading:prose",
    content: {
      heading: "",
      body: [
        "Most organizations keep what they know in the heads of a few people, and more and more in AI tools owned by one company. When those people leave, or that company changes its terms, the knowledge goes with them, and everyone else is left patching the gaps by hand. The Rizom Foundation works on the alternative: organizations that hold their own memory (who knows what, why decisions were made, whose judgment counts), so that it no longer depends on who is still in the room. It researches how that works, tests it in public with hubs and partners, and builds the open tools that make it last.",
      ],
    },
  },
  {
    id: "why-now",
    template: "reading:prose",
    content: {
      heading: "Why founding supporters, and why now",
      body: [
        "The Foundation takes no investors, so that its work stays open for good and belongs to no one. Its first year is started instead by people and organizations who care how institutions remember and decide: its founding supporters. They make it possible to do this work in public from the first day, and because every result is published, they can see what their support made possible.",
        "The timing is good. As organizations start working with AI, they are rethinking how they share knowledge and make decisions, and the habits formed in this period will last for years. Founding support lets the Foundation help shape those habits while they are still being formed.",
      ],
    },
  },
  {
    id: "goals",
    template: "reading:goals",
    content: {
      heading: "What your support makes happen",
      lede: "By the end of 2027, in public.",
      items: [
        {
          term: "Organizations that hold their own memory",
          text: "At least three organizations keeping who knows what and why for six months or more without the founder's help, with the effect measured before and after.",
        },
        {
          term: "A method that no longer depends on its author",
          text: "At least two practitioners certified by the Foundation, one of whom has done the work for an organization on their own, as well as the founder does.",
        },
        {
          term: "An ecosystem that remembers",
          text: "A first public program at a hub, whose memory its participants still use six months later.",
        },
        {
          term: "Research anyone can check",
          text: "Every assumption behind the work published with its test before the test runs, and with its results afterwards, including what fails.",
        },
      ],
      closing: "Founding pledges pay for the first stretch of all of it.",
    },
  },
  {
    id: "gets",
    template: "reading:prose",
    content: {
      heading: "What founding supporters get",
      body: [
        "A pledge is a gift: it buys no stake and no vote, which keeps the Foundation independent. What founding supporters get is a view from the inside and a place in the record.",
        "**The founders' letter.** Every quarter, a letter on what was tried, what worked and what did not, with the numbers and the reasons.",
        "**A pledge you can trace.** The Foundation's own Brain links each pledge to the essays, software and register entries it helped pay for.",
        "**Your name among the founders,** if you want it there, in the founding charter and the Foundation's public list of founding supporters. Organizations that want to be named publicly do so as sponsors.",
        "**A place in the network.** The Foundation brings together the people around the work (partners, researchers, hubs and supporters) at roundtables, dinners and public programs, and founding supporters are part of that circle from the start.",
      ],
    },
  },
  {
    id: "trust",
    template: "reading:prose",
    content: {
      heading: "Why you can trust it",
      body: [
        "The Foundation is new, so you are backing people and work rather than a track record. Here is what you can check for yourself.",
        "The work is already running. More than fifteen Brains are in use today, each owned by the person or organization that runs it, and for now five of them run without the founder's help. Every line of the code is public at github.com/rizom-ai/brains, with more than 10,000 changes so far, and the Foundation's own board keeps its memory the same way.",
        "The structure protects what you fund. The Foundation owns the code, the method and the name, so no company, Rizom's own included, can take them, and an independent majority of its board decides anything that touches them. It publishes what it sets out to achieve before it starts, and reports the results whether they are good or not.",
      ],
    },
  },
  {
    id: "ways",
    template: "reading:steps",
    content: {
      heading: "Two ways to give",
      lede: "",
      items: [
        {
          term: "As a gift",
          text: "Anyone, a person or an organization, can give once or commit to a fixed amount each year for five years. The five-year form is a periodic gift: it is set down in a short written agreement with the Foundation, and for Dutch taxpayers it is fully deductible, without the threshold that applies to one-off gifts. The Foundation is applying for recognition as a public-benefit institution (ANBI), effective from its founding date. Once that is granted, gifts made from the start are deductible, and companies can deduct a gift from their corporate tax within the usual limits.",
        },
        {
          term: "As a sponsor",
          text: "An organization that wants to be seen supporting the work can become a founding sponsor instead. Sponsors get everything founding supporters get, and what a gift cannot carry: their name on the Foundation's site, in its code repository and at its public programs, seats for their people at the roundtables and dinners, and the chance to host a roundtable of their own. They get no say over the research, the code or the name. Sponsorship is invoiced with VAT and treated as a business expense rather than a gift, so a VAT-registered company can usually reclaim the VAT.",
        },
      ],
      closing: "",
    },
  },
  {
    id: "pledge",
    template: "reading:mission",
    content: {
      heading: "How to pledge",
      text: "We ask €50,000 in founding support to start the Foundation's first year, and anything beyond that takes the work further.",
      body: [
        "Any amount is welcome, from individuals and from organizations. Write to yeehaa@rizom.ai, or join one of the small sessions first, where the work is shown live, in person or online, and decide after you have seen it.",
      ],
    },
  },
  {
    id: "close",
    template: "reading:close",
    content: {
      text: "Jan Hein Hoogstad, founder and chair",
      doors: [
        {
          label: "Pledge as a founding supporter →",
          href: "mailto:yeehaa@rizom.ai?subject=Founding%20pledge",
        },
        {
          label: "Read Common Sense",
          href: "/common-sense",
        },
      ],
    },
  },
];
