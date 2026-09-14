import { Building2 } from "lucide-react";
import { useActiveOrganization } from "./ActiveOrganizationProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../shared/ui/dropdown-menu";

// Hidden when the signed-in user belongs to zero or one organization -- a
// switcher with nothing to switch to is dead chrome (same rule LanguageSwitcher
// follows for a single-language tenant).
export function OrgSwitcher() {
  const { activeOrgId, organizations, switchTo, switching } = useActiveOrganization();
  if (organizations.length < 2) return null;

  const activeOrg = organizations.find((org) => org.itemId === activeOrgId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="icon-button org-switcher-trigger" aria-label="Switch organization" disabled={switching}>
        <Building2 size={18} />
        <span className="org-switcher-label">{activeOrg?.name ?? "Choose organization"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => (
          <DropdownMenuItem key={org.itemId} onSelect={() => void switchTo(org.itemId!)} disabled={switching}>
            {org.name}{org.itemId === activeOrgId ? " ✓" : ""}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
