import {
  ServicePlugin,
  type ServicePluginContext,
  type WebRouteDefinition,
} from "@brains/plugins";
import { FormService } from "@brains/forms";
import packageJson from "../package.json";
import { ContactInboxSource } from "./inbox-source";
import { contactPluginConfigSchema, type ContactPluginConfig } from "./config";
import type { ContactRequest } from "./entity/schema";
import { CONTACT_FORM } from "./form";
import { contactRequestTarget } from "./target";

/** The brain's contact form, on the forms engine; its requests are
 * `contact-request` records in the owner's Inbox. */
export class ContactPlugin extends ServicePlugin<ContactPluginConfig, unknown> {
  readonly dependencies: string[];
  private readonly forms: FormService<ContactRequest>;

  constructor(config: ContactPluginConfig = {}) {
    super("contact", packageJson, config, contactPluginConfigSchema);
    // site-builder registers first, so it is listening when the site's
    // contact pages are declared.
    this.dependencies = [
      "contact-request",
      "notifications",
      "site-builder",
      "studio",
      "unified-inbox",
    ];
    this.forms = new FormService({
      label: "Contact",
      target: contactRequestTarget,
      forms: [CONTACT_FORM],
      overrides: this.config.intake,
    });
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    if (!context.executionOnly)
      context.inbox.registerSource(new ContactInboxSource(context));
    await this.forms.register(context, this.id);
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return this.forms.webRoutes();
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    await this.forms.ready(context);
  }

  protected override async onShutdown(): Promise<void> {
    await this.forms.shutdown();
  }
}
