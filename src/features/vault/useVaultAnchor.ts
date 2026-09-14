import { useQuery } from "@tanstack/react-query";

// This project's platform-managed "Cloud" root directory -- every user's
// personal drive folder is created under it during drive setup (see
// useDriveSetup). Its id is fixed for this project rather than discovered at
// runtime: listing top-level storage objects to find it dynamically proved
// unreliable, and apps aren't meant to create a second true root of their
// own anyway (that's an owner-only capability per blocks-data-storage).
const CLOUD_ROOT_DIRECTORY_ID = "7C7FA2D4-91E8-4BEB-BC6C-5D7A67F8E3A9";

export function useVaultAnchor() {
  return useQuery({
    queryFn: async () => ({ itemId: CLOUD_ROOT_DIRECTORY_ID }),
    queryKey: ["vault", "anchor"],
    staleTime: Infinity
  });
}
