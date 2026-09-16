import { Upload } from "lucide-react";
import { ActionButton } from "../../../shared/ui/ActionButton";

export function UploadButton({
  disabled,
  onClick
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <ActionButton icon={<Upload size={18} />} disabled={disabled} onClick={onClick}>
      Upload
    </ActionButton>
  );
}
