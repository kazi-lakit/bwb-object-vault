import { useQuery } from "@tanstack/react-query";
import { blocksClient } from "../../lib/blocks/client";
import { VaultError } from "./vaultApi";

// Every project ships pre-existing, platform-managed top-level directories
// (e.g. "Cloud") -- apps are not meant to create a second true root of their
// own (that's an owner-only capability per blocks-data-storage), so "My
// Drive" is this app's name for the "Cloud" default directory's contents,
// resolved once and cached for the session rather than hardcoded, since the
// exact id is per-project.
export function useVaultRoot() {
  return useQuery({
    queryFn: async () => {
      const page = await blocksClient.data.objects.list({ limit: 200 });
      const defaults = page.items.filter((item) => item.type === "directory" && item.isDefault);
      const root = defaults.find((item) => item.name === "Cloud") ?? defaults[0];
      if (!root) throw new VaultError("This project has no default storage directory to anchor a drive on.");
      return root;
    },
    queryKey: ["vault", "root"],
    staleTime: Infinity
  });
}
