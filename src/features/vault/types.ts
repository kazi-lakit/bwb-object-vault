import type {
  BlocksStorageObject,
  BlocksStoragePermission,
  BlocksStoragePrincipalType,
  BlocksStorageResourceType
} from "@seliseblocks/client";

export type VaultObject = BlocksStorageObject;
export type VaultPermission = BlocksStoragePermission;
export type VaultPrincipalType = BlocksStoragePrincipalType;
export type VaultResourceType = BlocksStorageResourceType;

export type PathEntry = { id: string | undefined; name: string };

// The object tree's `type` discriminator is lowercase ("directory" | "file"),
// but the access/share endpoints take the capitalized BlocksStorageResourceType
// ("Directory" | "File") -- this is the one place that mapping happens.
export function resourceTypeOf(object: VaultObject): VaultResourceType {
  return object.type === "directory" ? "Directory" : "File";
}
