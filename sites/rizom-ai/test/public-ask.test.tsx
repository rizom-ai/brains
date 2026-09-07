/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicAsk } from "../src/public-ask";
import { AiLayout } from "../src/layout";
import { aiRoutes } from "../src/routes";

test("public Ask uses the existing site layout and mounts the shared guest app", () => {
  expect(aiRoutes.find((route) => route.path === "/ask")).toMatchObject({
    layout: "default",
    sections: [
      { id: "conversation", template: "public-ask:conversation", content: {} },
    ],
  });
  const html = renderToStaticMarkup(
    <AiLayout
      sections={[<PublicAsk key="ask" />]}
      title="Ask"
      description="Public Brain knowledge"
      path="/ask"
      siteInfo={{
        title: "Rizom",
        description: "Brain",
        url: "https://rizom.ai",
        copyright: "Rizom",
        navigation: { primary: [], secondary: [] },
      }}
    />,
  );
  expect(html).toContain("faces-strip");
  expect(html).toContain('id="themeToggle"');
  expect(html).toContain("<footer");
  expect(html).toContain("data-guest-chat");
  expect(html).toContain('data-chat-api-path="/api/chat/guest"');
  expect(html).toContain('src="/ask/assets/app.js"');
  expect(html).toContain('href="/ask/assets/page.css"');
  expect(html).not.toContain("guest-masthead");
  expect(html).not.toContain("climateToggle");
  expect(html).not.toContain("iframe");
});
