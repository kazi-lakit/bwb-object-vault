import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser, userDisplayName } from "../profile/useCurrentUser";
import { useVaultAnchor } from "./useVaultAnchor";
import {
  composeDriveFolderName,
  createDriveSetupRecord,
  getMyDriveSetup,
  setDriveSetupDirectoryId,
  type DriveSetupRecord
} from "./driveSetupApi";
import { createFolder, makePrivate } from "./vaultApi";

// Whether a signed-in user has a personal drive folder is tracked in the
// DriveSetup schema (one row per user), not inferred from the storage tree
// itself -- that's what lets this recover cleanly from a partial failure:
// if the row was inserted but folder creation then failed (a real failure
// window, not hypothetical -- network blips, a transient 5xx), the row's
// empty DirectoryId is exactly what tells the next attempt to skip
// re-inserting and only retry the folder.
export function useDriveSetup() {
  const me = useCurrentUser();
  const anchor = useVaultAnchor();
  const userId = me.data?.data?.itemId;
  const queryClient = useQueryClient();
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string>();

  const setupQuery = useQuery({
    enabled: Boolean(userId),
    // TanStack Query v5 throws if a queryFn resolves to `undefined` -- and
    // "no record yet" (a brand new user) is exactly that case -- so coerce
    // it to `null` rather than let a perfectly normal result be treated as
    // a query error (which would surface an error screen instead of the
    // setup prompt).
    queryFn: async () => (await getMyDriveSetup(userId!)) ?? null,
    queryKey: ["vault", "drive-setup", userId]
  });

  const record = setupQuery.data;
  const isReady = Boolean(record?.DirectoryId);
  const needsFolderOnly = Boolean(record) && !record?.DirectoryId;
  const needsSetup = !setupQuery.isLoading && !record;

  async function completeSetup(): Promise<void> {
    if (!userId || !anchor.data) return;
    setError(undefined);
    setIsCompleting(true);
    try {
      let current: DriveSetupRecord | undefined = record ?? undefined;

      if (!current) {
        const displayName = userDisplayName(me.data?.data) || me.data?.data?.email || "user";
        const directoryName = composeDriveFolderName(displayName, userId);
        current = await createDriveSetupRecord({ directoryName, userId });
        queryClient.setQueryData(["vault", "drive-setup", userId], current);
      }

      const { directoryId } = await createFolder({ name: current.DirectoryName, parentDirectoryId: anchor.data.itemId });
      // The folder just inherited Cloud's project-wide "Everyone: Edit" grant
      // (needed so any signed-in user can create it there at all) -- cut it
      // loose right away so this one personal root, and everything the user
      // creates inside it afterward by ordinary inheritance, stays private.
      await makePrivate({ ownerId: userId, resourceId: directoryId, resourceType: "Directory" });
      await setDriveSetupDirectoryId(current.itemId, directoryId);

      await queryClient.invalidateQueries({ queryKey: ["vault", "drive-setup", userId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set up your drive.");
    } finally {
      setIsCompleting(false);
    }
  }

  return {
    completeSetup,
    error,
    isCompleting,
    isLoading: me.isLoading || anchor.isLoading || setupQuery.isLoading,
    isReady,
    needsFolderOnly,
    needsSetup,
    refetchError: anchor.isError
      ? anchor.error instanceof Error
        ? anchor.error.message
        : "Could not prepare storage."
      : setupQuery.isError
        ? setupQuery.error instanceof Error
          ? setupQuery.error.message
          : "Could not check your drive setup."
        : undefined,
    rootDirectoryId: record?.DirectoryId || undefined
  };
}
