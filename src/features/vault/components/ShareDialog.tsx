import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BlocksUser } from "@seliseblocks/client";
import { Modal } from "../../../shared/ui/Modal";
import { Alert } from "../../../shared/ui/Alert";
import { listMyOrganizations, listRoles, searchUsers, shareObject } from "../vaultApi";
import { resourceTypeOf, type VaultObject, type VaultPermission, type VaultPrincipalType } from "../types";

const PERMISSIONS: VaultPermission[] = ["View", "Download", "Edit", "Delete", "Manage"];

function userLabel(user: BlocksUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} (${user.email ?? ""})` : user.email ?? String(user.itemId);
}

export function ShareDialog({ object, onClose }: { object: VaultObject; onClose: () => void }) {
  const [principalType, setPrincipalType] = useState<VaultPrincipalType>("User");
  const [permission, setPermission] = useState<VaultPermission>("View");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<BlocksUser>();
  const [selectedPrincipalId, setSelectedPrincipalId] = useState("");
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const usersQuery = useQuery({
    enabled: principalType === "User" && userQuery.trim().length > 1,
    queryFn: () => searchUsers(userQuery),
    queryKey: ["vault", "principals", "users", userQuery]
  });
  const rolesQuery = useQuery({
    enabled: principalType === "Role",
    queryFn: listRoles,
    queryKey: ["vault", "principals", "roles"]
  });
  const orgsQuery = useQuery({
    enabled: principalType === "Organization",
    queryFn: listMyOrganizations,
    queryKey: ["vault", "principals", "orgs"]
  });

  useEffect(() => {
    setSelectedUser(undefined);
    setSelectedPrincipalId("");
  }, [principalType]);

  const principalId = principalType === "User" ? selectedUser?.itemId : selectedPrincipalId;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!principalId) return;
    setError(undefined);
    setSubmitting(true);
    try {
      await shareObject({
        permission,
        principalId,
        principalType,
        resourceId: object.itemId,
        resourceType: resourceTypeOf(object)
      });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not share this item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Share "${object.name}"`} onClose={onClose}>
      {done ? (
        <>
          <Alert tone="info">Shared with {principalType.toLowerCase()}.</Alert>
          <div className="modal-actions">
            <button className="primary-button" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="modal-form">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <label className="form-field">
            <span>Share with</span>
            <select value={principalType} onChange={(event) => setPrincipalType(event.target.value as VaultPrincipalType)}>
              <option value="User">A specific user</option>
              <option value="Role">Everyone with a role</option>
              <option value="Organization">An organization</option>
            </select>
          </label>

          {principalType === "User" ? (
            <div className="form-field">
              <span>Find a user</span>
              <input
                type="search"
                placeholder="Search by name or email"
                value={selectedUser ? userLabel(selectedUser) : userQuery}
                onChange={(event) => {
                  setSelectedUser(undefined);
                  setUserQuery(event.target.value);
                }}
              />
              {!selectedUser && userQuery.trim().length > 1 ? (
                <div className="share-user-results">
                  {usersQuery.isLoading ? <p className="muted">Searching...</p> : null}
                  {usersQuery.data?.length === 0 ? <p className="muted">No matching users.</p> : null}
                  {usersQuery.data?.map((user) => (
                    <button
                      type="button"
                      key={user.itemId}
                      className="share-user-result"
                      onClick={() => {
                        setSelectedUser(user);
                        setUserQuery("");
                      }}
                    >
                      {userLabel(user)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {principalType === "Role" ? (
            <label className="form-field">
              <span>Role</span>
              <select value={selectedPrincipalId} onChange={(event) => setSelectedPrincipalId(event.target.value)}>
                <option value="" disabled>{rolesQuery.isLoading ? "Loading roles..." : "Choose a role"}</option>
                {rolesQuery.data?.map((role) => (
                  <option key={role.itemId} value={role.itemId}>{role.name ?? role.slug}</option>
                ))}
              </select>
            </label>
          ) : null}

          {principalType === "Organization" ? (
            <label className="form-field">
              <span>Organization</span>
              <select value={selectedPrincipalId} onChange={(event) => setSelectedPrincipalId(event.target.value)}>
                <option value="" disabled>{orgsQuery.isLoading ? "Loading organizations..." : "Choose an organization"}</option>
                {orgsQuery.data?.map((org) => (
                  <option key={org.itemId} value={org.itemId}>{org.name}</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="form-field">
            <span>Permission</span>
            <select value={permission} onChange={(event) => setPermission(event.target.value as VaultPermission)}>
              {PERMISSIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={submitting || !principalId}>
              {submitting ? "Sharing..." : "Share"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
