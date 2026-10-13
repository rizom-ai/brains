import { describe, expect, it } from "bun:test";
import type { AuthAccountPluginSettingsField } from "@brains/auth-service/account-contracts";
import { settingInputType, settingsFormValues } from "./account-settings";

function field(
  name: string,
  control: AuthAccountPluginSettingsField["control"],
  secret = false,
): AuthAccountPluginSettingsField {
  return { name, label: name, control, secret, required: false };
}

describe("settingsFormValues", () => {
  it("reads checkboxes as booleans and filled numbers as numbers", () => {
    const form = new FormData();
    form.set("host", "imap.test.invalid");
    form.set("port", "993");
    form.set("tls", "on");

    expect(
      settingsFormValues(
        [
          field("host", "text"),
          field("port", "number"),
          field("tls", "checkbox"),
          field("starttls", "checkbox"),
        ],
        form,
      ),
    ).toEqual({
      host: "imap.test.invalid",
      port: 993,
      tls: true,
      starttls: false,
    });
  });

  it("leaves an empty number blank rather than zero", () => {
    const form = new FormData();
    form.set("port", "");

    expect(settingsFormValues([field("port", "number")], form)).toEqual({
      port: "",
    });
  });
});

describe("settingInputType", () => {
  it("hides secrets and otherwise follows the control", () => {
    expect(settingInputType(field("password", "text", true))).toBe("password");
    expect(settingInputType(field("site", "url"))).toBe("url");
    expect(settingInputType(field("port", "number"))).toBe("number");
    expect(settingInputType(field("host", "text"))).toBe("text");
  });
});
