import {
  defineSection,
  defineSite,
  sectionGroup,
  z,
  type ComponentType,
  type IsJsonValue,
  type JsonObject,
  type JsonObjectOutputGuard,
  type JsonPrimitive,
  type JsonValue,
  type NavigationItem,
  type NavigationMetadata,
  type NavigationMetadataInput,
  type NavigationSlot,
  type RouteDefinition,
  type RouteDefinitionInput,
  type RouteSectionDefinition,
  type RuntimeScript,
  type SectionDefinition,
  type SectionDefinitionInput,
  type SectionGroup,
  type SectionMeta,
  type SiteContent,
  type SiteDefinition,
  type SiteLayoutInfo,
  type SiteLayoutProps,
  type SiteMetadata,
  type SiteMetadataCTA,
  type SiteMetadataSection,
  type SiteMetadataTranslation,
  type SiteSectionDefinition,
  type SiteSectionGroup,
  type UserPermissionLevel,
} from "@rizom/site";

// Compile-only: checked by the fixture typecheck, never rendered.

// Section content is JSON, which the types prove before a schema is accepted.
const count: JsonPrimitive = 3;
const tags: JsonValue = ["systems", count];
const card: JsonObject = { title: "A reading", tags };
const cardIsJson: IsJsonValue<typeof card> = true;
void cardIsJson;
export const shelfCard: JsonObject = card;
const quoteSchema = z.object({ quote: z.string(), author: z.string() });
const guarded: JsonObjectOutputGuard<z.output<typeof quoteSchema>> = undefined;
void guarded;

// A section, its metadata and its group, each through its own type.
const permission: UserPermissionLevel = "public";
const quoteMeta: SectionMeta = {
  title: "Quote",
  description: "A line worth keeping",
  requiredPermission: permission,
};
const Quote: ComponentType<z.output<typeof quoteSchema>> = ({
  quote,
  author,
}) => (
  <blockquote>
    {quote} <cite>{author}</cite>
  </blockquote>
);
const quoteSection: SiteSectionDefinition<typeof quoteSchema> = defineSection(
  quoteSchema,
  Quote,
  quoteMeta,
);
const sections: Record<string, SectionDefinition> = { quote: quoteSection };
const quotes: SiteSectionGroup = sectionGroup("quotes", sections);
const groups: SectionGroup[] = [quotes];

// Routes, their sections and their navigation, written and as built.
const placement: SectionDefinitionInput = {
  id: "quote",
  template: "quotes:quote",
};
const routeSections: RouteSectionDefinition[] = [placement];
const slot: NavigationSlot = "secondary";
const navigation: NavigationMetadataInput = { show: true, slot, priority: 30 };
const quotesRoute: RouteDefinitionInput = {
  id: "quotes",
  path: "/quotes",
  title: "Quotes",
  sections: routeSections,
  navigation,
};
const built: NavigationMetadata = { show: true, slot, priority: 30 };
export const builtRoute: RouteDefinition = {
  ...quotesRoute,
  title: "Quotes",
  description: "Lines worth keeping",
  sections: routeSections,
  layout: "default",
  navigation: built,
};

// What a layout is given: the site's metadata, its languages and its menus.
const cta: SiteMetadataCTA = {
  heading: "Read along",
  buttonText: "Subscribe",
  buttonLink: "/subscribe",
};
const blurb: SiteMetadataSection = { blurb: "Saved lines" };
const dutch: SiteMetadataTranslation = { title: "Citaten", cta };
const metadata: SiteMetadata = {
  title: "Quotes",
  description: "Lines worth keeping",
  cta,
  sections: { quotes: blurb },
  translations: { nl: dutch },
};
const menuItem: NavigationItem = {
  label: "Quotes",
  href: "/quotes",
  priority: 30,
};
export const layoutInfo: SiteLayoutInfo = {
  ...metadata,
  copyright: "Reader",
  navigation: { primary: [menuItem], secondary: [] },
};
const Layout: ComponentType<SiteLayoutProps> = ({
  title,
  siteInfo,
  sections,
}) => (
  <html lang="en">
    <head>
      <title>{`${title} · ${siteInfo.title}`}</title>
    </head>
    <body>
      <nav>
        {siteInfo.navigation.primary.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <main>{sections}</main>
    </body>
  </html>
);

// A section's script, as a runtime script declaration describes it.
export const quoteScript: RuntimeScript = { src: "/quotes.js", defer: true };

const content: SiteContent = {
  quotes: { quote: { quote: "Read slowly.", author: "Reader" } },
};

export const contractTypeCanary: SiteDefinition = defineSite({
  layouts: { default: Layout },
  routes: [quotesRoute],
  sections: groups,
  content,
  entityDisplay: {},
});
