import { FolderCog, HardDrive, Share2, UserRound } from "lucide-react";

export const navItems = [
  { href: "/", labelKey: "nav.myDrive", icon: HardDrive },
  { href: "/shared", labelKey: "nav.shared", icon: Share2 },
  { href: "/system-files", labelKey: "nav.systemFiles", icon: FolderCog },
  { href: "/profile", labelKey: "nav.profile", icon: UserRound }
] as const;
