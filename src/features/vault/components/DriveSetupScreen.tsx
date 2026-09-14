import { HardDrive } from "lucide-react";
import { ActionButton } from "../../../shared/ui/ActionButton";
import { Alert } from "../../../shared/ui/Alert";

export function DriveSetupScreen({
  error,
  isCompleting,
  isRetry,
  onSetup
}: {
  error?: string;
  isCompleting: boolean;
  isRetry: boolean;
  onSetup: () => void;
}) {
  return (
    <div className="empty-page">
      <div className="empty-icon"><HardDrive size={32} /></div>
      <h2>{isRetry ? "Finish setting up your drive" : "Set up your drive"}</h2>
      <p>
        {isRetry
          ? "Your drive was registered, but its folder wasn't created last time. Let's finish setting it up."
          : "We'll create a personal, private folder in storage for your files. Only you can see it unless you share something."}
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ActionButton onClick={onSetup} disabled={isCompleting}>
        {isCompleting ? "Setting up..." : isRetry ? "Try again" : "Set up my drive"}
      </ActionButton>
    </div>
  );
}
