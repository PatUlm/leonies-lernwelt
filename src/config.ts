/** Title without a profile (playing on this device only). */
const NEUTRAL_TITLE = 'Meine Lernwelt';

/** German genitive of a first name: "Patricks", but "Max'" after s, ß, z, x and ce. */
export function genitive(name: string): string {
  return /(s|ß|z|x|ce)$/i.test(name) ? `${name}'` : `${name}s`;
}

/** App title for the signed-in profile, e.g. "Patricks Lernwelt". */
export function appTitle(profile: string | undefined): string {
  return profile ? `${genitive(profile)} Lernwelt` : NEUTRAL_TITLE;
}
