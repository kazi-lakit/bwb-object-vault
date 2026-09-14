import { blocksClient } from "../../lib/blocks/client";
import { VaultError } from "./vaultApi";

export type DriveSetupRecord = {
  DirectoryId: string;
  DirectoryName: string;
  UserId: string;
  itemId: string;
};

const driveSetups = blocksClient.data.collection<Record<string, unknown>>("DriveSetup", {
  fields: ["UserId", "DirectoryName", "DirectoryId"]
});

function normalizeList(response: unknown): Record<string, unknown>[] {
  const record = response as {
    data?: { getDriveSetups?: { items?: Record<string, unknown>[] }; items?: Record<string, unknown>[] };
    items?: Record<string, unknown>[];
  };
  return record.data?.getDriveSetups?.items ?? record.data?.items ?? record.items ?? [];
}

function toRecord(raw: Record<string, unknown>): DriveSetupRecord {
  return {
    DirectoryId: typeof raw.DirectoryId === "string" ? raw.DirectoryId : "",
    DirectoryName: String(raw.DirectoryName ?? ""),
    UserId: String(raw.UserId ?? ""),
    itemId: String(raw.ItemId ?? raw.itemId ?? "")
  };
}

// Mutation responses vary in nesting depth depending on how the gateway
// wraps the GraphQL result -- read defensively rather than assume one shape.
function extractItemId(response: unknown, mutationName: string): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const record = response as Record<string, unknown>;
  const direct = record.itemId;
  if (typeof direct === "string" && direct) return direct;
  const nested = record.data as Record<string, unknown> | undefined;
  const viaMutationName = nested?.[mutationName] as Record<string, unknown> | undefined;
  if (viaMutationName && typeof viaMutationName.itemId === "string") return viaMutationName.itemId;
  return undefined;
}

// Strip spaces/punctuation so the result is a valid Blocks Storage directory
// name on its own (1-255 chars, no slash/backslash, not "."/".."). A short,
// non-empty fallback keeps this valid even for a name that's all symbols.
export function sanitizeForFolderName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "");
}

// The user-facing part identifies whose folder it is at a glance; the raw
// user id suffix is what actually guarantees uniqueness (two people can
// share a display name, never a user id).
export function composeDriveFolderName(displayName: string, userId: string): string {
  const base = sanitizeForFolderName(displayName) || "user";
  return `${base}-${sanitizeForFolderName(userId)}`;
}

export async function getMyDriveSetup(userId: string): Promise<DriveSetupRecord | undefined> {
  const response = await driveSetups.list({ filter: { UserId: userId }, pageNo: 1, pageSize: 1 });
  const [raw] = normalizeList(response);
  return raw ? toRecord(raw) : undefined;
}

export async function createDriveSetupRecord(params: { directoryName: string; userId: string }): Promise<DriveSetupRecord> {
  const response = await driveSetups.create({ DirectoryId: "", DirectoryName: params.directoryName, UserId: params.userId });
  const itemId = extractItemId(response, "insertDriveSetup");
  if (!itemId) throw new VaultError("Could not register your drive -- no record id was returned.");
  return { DirectoryId: "", DirectoryName: params.directoryName, UserId: params.userId, itemId };
}

export async function setDriveSetupDirectoryId(itemId: string, directoryId: string): Promise<void> {
  await driveSetups.update(itemId, { DirectoryId: directoryId });
}
