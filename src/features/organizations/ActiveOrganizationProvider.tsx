import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BlocksOrganization } from "@seliseblocks/client";
import { blocksClient } from "../../lib/blocks/client";
import { listMyOrganizations } from "../vault/vaultApi";
import { useAuth } from "../../app/providers/AuthProvider";

const ACTIVE_ORG_KEY = "blocks-app:active-org";

type ActiveOrganizationValue = {
  activeOrgId: string;
  isLoading: boolean;
  organizations: BlocksOrganization[];
  switchTo: (organizationId: string) => Promise<void>;
  switching: boolean;
};

const ActiveOrganizationContext = createContext<ActiveOrganizationValue | undefined>(undefined);

// The active organization lives in the session (switching it re-issues the
// session cookie server-side, like login) -- there is no per-request
// organizationId to pass to Data Storage calls. This provider tracks which
// org the session is currently in as shared state, so every page (not just
// the switcher itself) can react -- e.g. reset folder navigation that
// pointed into the previous org's directory tree.
export function ActiveOrganizationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { status } = useAuth();
  const [activeOrgId, setActiveOrgId] = useState(() => localStorage.getItem(ACTIVE_ORG_KEY) ?? "");
  const [switching, setSwitching] = useState(false);

  const organizationsQuery = useQuery({
    enabled: status === "authenticated",
    queryFn: listMyOrganizations,
    queryKey: ["iam", "organizations", "my"]
  });
  const organizations = organizationsQuery.data ?? [];

  useEffect(() => {
    if (organizations.length === 0) return;
    const stillValid = organizations.some((org) => org.itemId === activeOrgId);
    if (!stillValid) {
      const fallback = organizations[0]?.itemId ?? "";
      setActiveOrgId(fallback);
      localStorage.setItem(ACTIVE_ORG_KEY, fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations.map((org) => org.itemId).join()]);

  async function switchTo(organizationId: string) {
    if (organizationId === activeOrgId) return;
    setSwitching(true);
    try {
      await blocksClient.auth.switchOrganization({ organizationId });
      setActiveOrgId(organizationId);
      localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
      // Every org-scoped query (vault listings, IAM lookups, the current
      // user's own profile/claims) is now stale -- clear the slate instead
      // of hunting down each query key individually.
      await queryClient.invalidateQueries();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <ActiveOrganizationContext.Provider value={{ activeOrgId, isLoading: organizationsQuery.isLoading, organizations, switchTo, switching }}>
      {children}
    </ActiveOrganizationContext.Provider>
  );
}

export function useActiveOrganization(): ActiveOrganizationValue {
  const context = useContext(ActiveOrganizationContext);
  if (!context) throw new Error("useActiveOrganization must be used within ActiveOrganizationProvider");
  return context;
}
