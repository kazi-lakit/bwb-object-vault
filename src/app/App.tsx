import { AppProviders } from "./providers/AppProviders";
import { AuthProvider } from "./providers/AuthProvider";
import { AppRouter } from "./router/routes";
import { ActiveOrganizationProvider } from "../features/organizations/ActiveOrganizationProvider";

export function App() {
  return (
    <AppProviders>
      <AuthProvider>
        <ActiveOrganizationProvider>
          <AppRouter />
        </ActiveOrganizationProvider>
      </AuthProvider>
    </AppProviders>
  );
}
