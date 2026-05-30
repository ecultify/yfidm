import type { ComponentType } from "react";
import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  type BrandIconProps,
} from "@/components/inbox/brand-icons";
import type { Channel } from "./types";

export interface ChannelMeta {
  id: Channel;
  label: string;
  Icon: ComponentType<BrandIconProps>;
  /** Tailwind classes for the channel badge background. */
  badgeClass: string;
  /** Raw accent color for small flourishes (rings, dots). */
  accent: string;
}

export const CHANNELS: Record<Channel, ChannelMeta> = {
  instagram: {
    id: "instagram",
    label: "Instagram",
    Icon: InstagramIcon,
    badgeClass:
      "bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white",
    accent: "#E1306C",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    Icon: FacebookIcon,
    badgeClass: "bg-[#1877F2] text-white",
    accent: "#1877F2",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    Icon: LinkedInIcon,
    badgeClass: "bg-[#0A66C2] text-white",
    accent: "#0A66C2",
  },
};

export const CHANNEL_LIST: ChannelMeta[] = [
  CHANNELS.instagram,
  CHANNELS.facebook,
  CHANNELS.linkedin,
];
