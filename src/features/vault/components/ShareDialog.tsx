import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Users } from "lucide-react";
import type { BlocksRole, BlocksUser } from "@seliseblocks/client";
import { Modal } from "../../../shared/ui/Modal";
import { Alert } from "../../../shared/ui/Alert";
import { useActiveOrganization } from "../../organizations/ActiveOrganizationProvider";
import {
  describeAccessPrincipal,
  listAccessPolicies,
  listMyOrganizations,
  revokeAccessPolicy,
  searchRoles,
  searchUsers,
  shareObject,
  updateAccessPolicy,
  type VaultAccessPolicy
} from "../vaultApi";
import { resourceTypeOf, type VaultObject, type VaultPermission, type VaultPrincipalType } from "../types";

const PERMISSIONS: VaultPermission[] = ["View", "Download", "Edit", "Delete", "Manage"];
type SharePrincipalType = Exclude<VaultPrincipalType, "Everyone"> | "OrganizationRole";

function userLabel(user: BlocksUser): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} (${user.email ?? ""})` : user.email ?? String(user.itemId);
}

function roleLabel(role: BlocksRole): string {
  return role.name ?? role.slug ?? String(role.itemId);
}

export function ShareDialog({ object, onClose }: { object: VaultObject; onClose: () => void }) {
  const { activeOrgId } = useActiveOrganization();
  const queryClient = useQueryClient();
  const resourceType = resourceTypeOf(object);
  const accessQueryKey = ["vault", "access", object.itemId] as const;
  const [principalType, setPrincipalType] = useState<SharePrincipalType>("User");
  const [permission, setPermission] = useState<VaultPermission>("View");
  const [userQuery, setUserQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<BlocksUser>();
  const [roleQuery, setRoleQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<BlocksRole>();
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [updatingPolicyId, setUpdatingPolicyId] = useState<string>();
  const [revokingPolicyId, setRevokingPolicyId] = useState<string>();

  const policiesQuery = useQuery({
    queryFn: () => listAccessPolicies(object.itemId),
    queryKey: accessQueryKey
  });
  const policies = policiesQuery.data ?? [];

  const usersQuery = useQuery({
    enabled: principalType === "User" && userQuery.trim().length > 1,
    queryFn: () => searchUsers(userQuery),
    queryKey: ["vault", "principals", "users", userQuery]
  });
  const rolesQuery = useQuery({
    enabled: (principalType === "Role" || principalType === "OrganizationRole") && roleQuery.trim().length > 1,
    queryFn: () => searchRoles(roleQuery),
    queryKey: ["vault", "principals", "roles", roleQuery]
  });
  const orgsQuery = useQuery({
    queryFn: listMyOrganizations,
    queryKey: ["vault", "principals", "orgs"]
  });

  const principalQueries = useQueries({
    queries: policies.map((policy) => ({
      queryFn: () => describeAccessPrincipal(policy),
      queryKey: ["vault", "principal", policy.principalType, policy.principalId, policy.organizationId]
    }))
  });
  const principalDetails = useMemo(
    () => new Map(policies.map((policy, index) => [policy.policyItemId, principalQueries[index]?.data])),
    [policies, principalQueries]
  );

  useEffect(() => {
    setSelectedUser(undefined);
    setSelectedRole(undefined);
    setSelectedOrganizationId(principalType === "Organization" || principalType === "OrganizationRole" ? activeOrgId : "");
    setUserQuery("");
    setRoleQuery("");
  }, [activeOrgId, principalType]);

  const principalId = principalType === "User"
    ? selectedUser?.itemId
    : principalType === "Organization"
      ? selectedOrganizationId
      : selectedRole?.itemId;
  const organizationId = principalType === "OrganizationRole" ? selectedOrganizationId : undefined;

  async function refreshPolicies() {
    await queryClient.invalidateQueries({ queryKey: accessQueryKey });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!principalId || (principalType === "OrganizationRole" && !organizationId)) return;
    setError(undefined);
    setNotice(undefined);
    setSubmitting(true);
    try {
      await shareObject({
        organizationId,
        permission,
        principalId,
        principalType: principalType === "OrganizationRole" ? "Role" : principalType,
        resourceId: object.itemId,
        resourceType
      });
      await refreshPolicies();
      setSelectedUser(undefined);
      setSelectedRole(undefined);
      setUserQuery("");
      setRoleQuery("");
      if (principalType !== "Organization" && principalType !== "OrganizationRole") setSelectedOrganizationId("");
      setNotice("Access granted.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not share this item.");
    } finally {
      setSubmitting(false);
    }
  }

  async function changePermission(policy: VaultAccessPolicy, nextPermission: VaultPermission) {
    setError(undefined);
    setNotice(undefined);
    setUpdatingPolicyId(policy.policyItemId);
    try {
      await updateAccessPolicy(policy, nextPermission, resourceType);
      await refreshPolicies();
      setNotice("Permission updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update access.");
    } finally {
      setUpdatingPolicyId(undefined);
    }
  }

  async function removeAccess(policy: VaultAccessPolicy) {
    setError(undefined);
    setNotice(undefined);
    setRevokingPolicyId(policy.policyItemId);
    try {
      await revokeAccessPolicy(object.itemId, policy.policyItemId);
      await refreshPolicies();
      setNotice("Access removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove access.");
    } finally {
      setRevokingPolicyId(undefined);
    }
  }

  return (
    <Modal title={`Share “${object.name}”`} onClose={onClose}>
      <p>Give a user, role, organization, or organization-scoped role access to this {object.type === "directory" ? "folder" : "file"}.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      <form className="share-form" onSubmit={handleSubmit}>
        <div className="share-type-tabs">
          {(["User", "Role", "Organization", "OrganizationRole"] as const).map((type) => (
            <button
              key={type}
              type="button"
              className={principalType === type ? "active" : ""}
              onClick={() => setPrincipalType(type)}
            >
              {type === "OrganizationRole" ? "Org role" : type}
            </button>
          ))}
        </div>

        {principalType === "User" ? (
          <PrincipalSearch
            label="Find a user"
            placeholder="Search by name or email"
            value={selectedUser ? userLabel(selectedUser) : userQuery}
            onChange={(value) => { setSelectedUser(undefined); setUserQuery(value); }}
            searching={usersQuery.isLoading}
            showResults={!selectedUser && userQuery.trim().length > 1}
            empty={usersQuery.data?.length === 0}
            results={usersQuery.data?.map((user) => ({ id: String(user.itemId), label: userLabel(user), select: () => { setSelectedUser(user); setUserQuery(""); } }))}
          />
        ) : null}

        {principalType === "Role" || principalType === "OrganizationRole" ? (
          <PrincipalSearch
            label="Find a role"
            placeholder="Search roles by name"
            value={selectedRole ? roleLabel(selectedRole) : roleQuery}
            onChange={(value) => { setSelectedRole(undefined); setRoleQuery(value); }}
            searching={rolesQuery.isLoading}
            showResults={!selectedRole && roleQuery.trim().length > 1}
            empty={rolesQuery.data?.length === 0}
            results={rolesQuery.data?.map((role) => ({ id: String(role.itemId), label: roleLabel(role), select: () => { setSelectedRole(role); setRoleQuery(""); } }))}
          />
        ) : null}

        {principalType === "Organization" || principalType === "OrganizationRole" ? (
          <label className="form-field">
            <span>{principalType === "OrganizationRole" ? "Organization for this role" : "Organization"}</span>
            <select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} required>
              <option value="" disabled>{orgsQuery.isLoading ? "Loading organizations..." : "Choose an organization"}</option>
              {orgsQuery.data?.map((organization) => <option key={organization.itemId} value={organization.itemId}>{organization.name || "Unnamed organization"}</option>)}
            </select>
          </label>
        ) : null}

        <div className="share-submit-row">
          <label className="form-field">
            <span>Permission</span>
            <select value={permission} onChange={(event) => setPermission(event.target.value as VaultPermission)}>
              {PERMISSIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button type="submit" className="primary-button" disabled={submitting || !principalId || (principalType === "OrganizationRole" && !organizationId)}>
            <Users size={16} /> {submitting ? "Sharing..." : "Share"}
          </button>
        </div>
      </form>

      <section className="access-section">
        <h4>Who has access</h4>
        <div className="access-list">
          {policiesQuery.isLoading ? <p className="muted access-empty">Loading access...</p> : null}
          {policiesQuery.isError ? <Alert tone="error">Could not load existing access.</Alert> : null}
          {!policiesQuery.isLoading && !policiesQuery.isError && policies.length === 0 ? <p className="muted access-empty">Not shared with anyone yet.</p> : null}
          {policies.map((policy) => {
            const details = principalDetails.get(policy.policyItemId);
            const isOwner = policy.permission === "Owner";
            return (
              <div className="access-row" key={policy.policyItemId}>
                <div className="access-principal">
                  <strong title={details?.primary || policy.principalName || policy.principalId}>{details?.primary || policy.principalName || policy.principalId || policy.principalType}</strong>
                  <small>{details?.secondary || policy.principalType}{policy.effect === "Deny" ? " · Denied" : ""}</small>
                </div>
                <select
                  aria-label={`Permission for ${details?.primary || policy.principalType}`}
                  value={policy.permission}
                  disabled={isOwner || updatingPolicyId === policy.policyItemId || policy.effect === "Deny"}
                  onChange={(event) => void changePermission(policy, event.target.value as VaultPermission)}
                >
                  {isOwner ? <option value="Owner">Owner</option> : PERMISSIONS.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
                <button
                  className="icon-button access-remove"
                  aria-label="Remove access"
                  title={isOwner ? "Owner access cannot be removed" : "Remove access"}
                  disabled={isOwner || revokingPolicyId === policy.policyItemId}
                  onClick={() => void removeAccess(policy)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Done</button></div>
    </Modal>
  );
}

function PrincipalSearch({ empty, label, onChange, placeholder, results, searching, showResults, value }: {
  empty: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  results?: Array<{ id: string; label: string; select: () => void }>;
  searching: boolean;
  showResults: boolean;
  value: string;
}) {
  return (
    <div className="form-field">
      <span>{label}</span>
      <input type="search" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {showResults ? (
        <div className="share-user-results">
          {searching ? <p className="muted">Searching...</p> : null}
          {empty ? <p className="muted">No matches.</p> : null}
          {results?.map((result) => <button type="button" key={result.id} className="share-user-result" onClick={result.select}>{result.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}
