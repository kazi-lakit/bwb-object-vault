import { useQuery } from "@tanstack/react-query";
import { blocksClient } from "../../lib/blocks/client";
import { VaultError } from "./vaultApi";

// Every project ships pre-existing, platform-managed top-level directories
// (e.g. "Cloud") -- apps are not meant to create a second true root of their
// own (that's an owner-only capability per blocks-data-storage). This
// resolves that shared directory once per session, purely as the technical
// parent every user's own personal drive folder is created under during
// drive setup (see useDriveSetup) -- it is never itself what a signed-in
// user browses as "My Drive".
export function useVaultAnchor() {
  return useQuery({
    queryFn: async () => {
      const page = await blocksClient.data.objects.list({ limit: 200 });
      const defaults = page.items.filter((item) => item.type === "directory" && item.isDefault);
      const anchor = defaults.find((item) => item.name === "Cloud") ?? defaults[0];
      if (!anchor) throw new VaultError("This project has no default storage directory to anchor a drive on.");
      return anchor;
    },
    queryKey: ["vault", "anchor"],
    staleTime: Infinity
  });
}
