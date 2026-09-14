import { HardDrive, Share2, UserRound } from "lucide-react";

export const navItems = [
  { href: "/", labelKey: "nav.myDrive", icon: HardDrive },
  { href: "/shared", labelKey: "nav.shared", icon: Share2 },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound }
] as const;
