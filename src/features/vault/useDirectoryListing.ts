import { useInfiniteQuery } from "@tanstack/react-query";
import type { BlocksStorageObjectsResponse } from "@seliseblocks/client";
import { listObjects, listSharedWithMe, searchObjects } from "./vaultApi";
import type { VaultObject } from "./types";

function flatten(pages: BlocksStorageObjectsResponse[] | undefined): VaultObject[] {
  return pages?.flatMap((page) => page.items) ?? [];
}

function nextCursor(lastPage: BlocksStorageObjectsResponse): string | undefined {
  return lastPage.hasMore ? lastPage.nextCursor : undefined;
}

// Browse one directory's children, or (when `search` is set) full-text
// search its descendants -- same paging shape either way, so one hook
// covers both of VaultPage's modes.
export function useDirectoryListing(parentDirectoryId: string | undefined, search: string) {
  const trimmedSearch = search.trim();
  const query = useInfiniteQuery<BlocksStorageObjectsResponse, Error, { pages: BlocksStorageObjectsResponse[] }, unknown[], string | undefined>({
    enabled: Boolean(parentDirectoryId),
    getNextPageParam: nextCursor,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      trimmedSearch
        ? searchObjects({ cursor: pageParam, directoryId: parentDirectoryId, query: trimmedSearch })
        : listObjects({ cursor: pageParam, parentDirectoryId }),
    queryKey: ["vault", "objects", parentDirectoryId, trimmedSearch]
  });

  return { ...query, items: flatten(query.data?.pages) };
}

export function useSharedWithMe() {
  const query = useInfiniteQuery<BlocksStorageObjectsResponse, Error, { pages: BlocksStorageObjectsResponse[] }, unknown[], string | undefined>({
    getNextPageParam: nextCursor,
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => listSharedWithMe({ cursor: pageParam }),
    queryKey: ["vault", "shared"]
  });

  return { ...query, items: flatten(query.data?.pages) };
}
