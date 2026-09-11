/** @jsxImportSource react */
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import {
  OperatorViewRenderer,
  operatorViewStylexCSS,
} from "@brains/operator-view-react";
import type { RuntimeStudioWorkspaceData } from "@brains/plugins";

const data: RuntimeStudioWorkspaceData = {
  view: {
    blocks: [
      {
        type: "action",
        actionId: "create",
        label: "Create record",
        input: {
          enabled: true,
          total: 0,
          role: "admin",
          token: "DO-NOT-PREFILL",
        },
        form: {
          fields: [
            {
              name: "name",
              label: "Exact name",
              control: "text",
              required: true,
            },
            { name: "url", label: "URL", control: "url", required: false },
            {
              name: "total",
              label: "Total",
              control: "number",
              required: false,
            },
            {
              name: "enabled",
              label: "Enabled",
              control: "checkbox",
              required: false,
            },
            {
              name: "role",
              label: "Role",
              control: "select",
              required: true,
              options: [
                { value: "reader", label: "Reader" },
                { value: "admin", label: "Administrator" },
              ],
            },
            {
              name: "token",
              label: "Token",
              control: "text",
              secret: true,
              required: true,
            },
          ],
        },
      },
    ],
  },
};

test("compiled native form fields preserve validation, defaults and secret suppression", async () => {
  const html = renderToStaticMarkup(
    <OperatorViewRenderer
      data={data}
      onAction={async () => ({})}
      onOpenEntity={() => {}}
    />,
  );
  expect(html).not.toContain("DO-NOT-PREFILL");
  for (const width of [1440, 390]) {
    const window = new Window({ width });
    try {
      const doc = window.document;
      doc.head.innerHTML = `<style>:root{--console-ui:Barlow;--console-mono:monospace}${operatorViewStylexCSS}</style>`;
      doc.body.innerHTML = html;
      const form = doc.querySelector("form"),
        submit = form?.querySelector('button[type="submit"]');
      if (!form || !submit) throw Error("Missing native form");
      expect(window.getComputedStyle(form).display).toBe("grid");
      expect(
        window.getComputedStyle(form).gridTemplateColumns.replace(/\s/g, ""),
      ).toBe(width === 390 ? "minmax(0,1fr)" : "repeat(2,minmax(0,1fr))");
      expect(window.getComputedStyle(submit).alignSelf).toBe("end");
      expect(window.getComputedStyle(submit).justifySelf).toBe("start");
      const name = doc.querySelector('input[name="name"]'),
        url = doc.querySelector('input[name="url"]'),
        total = doc.querySelector('input[name="total"]'),
        enabled = doc.querySelector('input[name="enabled"]'),
        role = doc.querySelector('select[name="role"]'),
        token = doc.querySelector('input[name="token"]');
      if (!name || !url || !total || !enabled || !role || !token)
        throw Error("Missing form fields");
      for (const field of [name, url, total, role, token]) {
        expect(window.getComputedStyle(field).minHeight).toBe(
          width === 390 ? "44px" : "38px",
        );
        expect(window.getComputedStyle(field).fontFamily).toBe("Barlow");
        expect(window.getComputedStyle(field).fontSize).toBe("12px");
        expect(field.closest("label")).not.toBeNull();
      }
      expect(name.hasAttribute("required")).toBe(true);
      expect(role.hasAttribute("required")).toBe(true);
      expect(total.getAttribute("value")).toBe("0");
      expect(url.getAttribute("type")).toBe("url");
      expect(enabled.hasAttribute("checked")).toBe(true);
      expect(window.getComputedStyle(enabled).minHeight).toBe("auto");
      const label = enabled.closest("label");
      if (!label) throw Error("Missing checkbox label");
      expect(Number.parseFloat(window.getComputedStyle(label).minHeight)).toBe(
        width === 390 ? 44 : 0,
      );
      expect(
        role.querySelector('option[value="admin"]')?.hasAttribute("selected"),
      ).toBe(true);
      expect(token.getAttribute("type")).toBe("password");
      expect(token.getAttribute("value")).toBe("");
      expect(token.getAttribute("autocomplete")).toBe("new-password");
    } finally {
      await window.happyDOM.close();
    }
  }
  expect(operatorViewStylexCSS).not.toContain(".declarative-action-form");
});
