import { extendSite } from "@brains/site-composition";
import siteProfessional from "@brains/site-professional";

/**
 * Rover default site package — clean professional layout.
 *
 * A neutral professional site identity suitable as the out-of-box
 * experience for the rover brain model. Pair it with
 * `@brains/theme-default` for the standard blue/orange styling.
 */
const site = extendSite(siteProfessional, {});

export default site;
