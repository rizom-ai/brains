import { ProfileAboutDataSource } from "@brains/profile";
import {
  organizationProfileSchema,
  type OrganizationProfile,
} from "../schemas/organization-profile";

/** About page datasource: the team's or organization's anchor profile. */
export class OrganizationAboutDataSource extends ProfileAboutDataSource<OrganizationProfile> {
  constructor() {
    super({
      id: "organization:about",
      name: "Organization About DataSource",
      description: "Fetches the anchor profile for the organization about page",
      schema: organizationProfileSchema,
    });
  }
}
