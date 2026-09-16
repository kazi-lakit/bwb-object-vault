import { forwardRef, type InputHTMLAttributes } from "react";

export const FormField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(function FormField({ label, ...props }, ref) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input ref={ref} {...props} />
    </label>
  );
});
