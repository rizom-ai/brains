import { ProfileAboutDataSource } from "@brains/profile";
import { personalProfileSchema, type PersonalProfile } from "../schemas";

/** About page datasource — fetches full profile */
export class AboutDataSource extends ProfileAboutDataSource<PersonalProfile> {
  constructor() {
    super({
      id: "personal:about",
      name: "About Page DataSource",
      description: "Fetches full profile data for the about page",
      schema: personalProfileSchema,
    });
  }
}
