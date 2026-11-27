/** @jsxImportSource react */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup as render } from "react-dom/server";
import { createMockShell } from "@brains/plugins/test";
import { seminarAskPage } from "../src/datasources/seminar-ask-datasource";
import { SeminarAskTemplate } from "../src/templates/seminar-ask";
import { createSeminarPlugins } from "./seminar-plugins";

const peers = [
  { agent: "karl.example", name: "Marx" },
  { agent: "friedrich.example", name: "Nietzsche" },
];

describe("the Ask page's data", () => {
  test("names who answers, whether asking is open, and the peers a question reaches", () => {
    expect(seminarAskPage({ name: () => "Suspicion", peers }, true)).toEqual({
      name: "Suspicion",
      askBox: true,
      peers: ["Marx", "Nietzsche"],
    });
  });

  test("is closed where Web Chat serves no guest box for the build", () => {
    expect(
      seminarAskPage({ name: () => "Suspicion", peers }, false),
    ).toMatchObject({ askBox: false });
  });

  test("is registered beside the seminars' pages", async () => {
    const shell = createMockShell();
    for (const plugin of createSeminarPlugins()) await plugin.register(shell);

    expect([...shell.getTemplates().keys()]).toContain("seminar:ask");
    expect(
      shell
        .getDataSourceRegistry()
        .list()
        .map(({ id }) => id)
        .sort(),
    ).toEqual(["seminar:ask", "seminar:entities"]);
  });
});

describe("the Ask page", () => {
  test("offers the question box while asking is open, and says whom a question reaches", () => {
    const html = render(
      <SeminarAskTemplate
        name="Suspicion"
        askBox
        peers={["Marx", "Nietzsche", "Freud"]}
      />,
    );
    expect(html).toContain("Ask Suspicion");
    expect(html).toContain("data-ask-box");
    expect(html).toContain("Marx, Nietzsche and Freud");
    expect(html).not.toContain("not open yet");
  });

  test("says asking is not open yet, with no box, while it is closed", () => {
    const html = render(
      <SeminarAskTemplate name="Suspicion" askBox={false} peers={[]} />,
    );
    expect(html).toContain("Asking Suspicion is not open yet.");
    expect(html).not.toContain("data-ask-box");
  });
});
