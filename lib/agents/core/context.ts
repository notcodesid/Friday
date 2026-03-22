/**
 * Shared context passed through all Friday runs.
 * Carries brand identity and campaign goals so every agent
 * can tailor its output without re-asking the user.
 */
export type FridayContext = {
  /** Brand / company name */
  brandName?: string;
  /** One-liner describing the product */
  oneLiner?: string;
  /** Who the product is for */
  targetAudience?: string;
  /** Primary website URL */
  siteUrl?: string;
  /** Tone descriptors the brand uses (e.g. "sharp", "founder-led") */
  brandVoice?: string[];
  /** Current campaign or marketing goal, if any */
  campaignGoal?: string;
  /** Known competitor domains */
  competitors?: string[];
  /** Active product or campaign theme */
  brandTheme?: string;
  /** Priority distribution channels for the current workflow */
  preferredChannels?: string[];
  /** Publishing system used to schedule or upload content */
  publishingTool?: string;
  /** Free-form operator notes */
  notes?: string;
};
