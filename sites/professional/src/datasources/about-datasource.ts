import { ProfileAboutDataSource } from "@brains/profile";
import {
  professionalProfileSchema,
  type ProfessionalProfile,
} from "../schemas";

/** About page datasource: fetches full profile data for about page display. */
export class AboutDataSource extends ProfileAboutDataSource<ProfessionalProfile> {
  constructor() {
    super({
      id: "professional:about",
      name: "About Page DataSource",
      description: "Fetches full profile data for the about page",
      schema: professionalProfileSchema,
    });
  }
}
