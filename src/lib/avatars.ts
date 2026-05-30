/**
 * Default profile avatars for user accounts (client-safe).
 *
 * Same friendly "notionists" style used elsewhere in the app - one male-leaning
 * and one female-leaning preset chosen when an admin creates a user.
 */
export const AVATAR_PRESETS = {
  male: "https://api.dicebear.com/9.x/notionists/svg?seed=Abhinav&backgroundColor=b6e3f4",
  female:
    "https://api.dicebear.com/9.x/notionists/svg?seed=Priya&backgroundColor=ffd5dc",
} as const;

export type AvatarPreset = keyof typeof AVATAR_PRESETS;

export function avatarForPreset(preset: string | undefined): string {
  return preset === "female" ? AVATAR_PRESETS.female : AVATAR_PRESETS.male;
}
