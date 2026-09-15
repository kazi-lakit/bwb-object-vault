import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; variant?: "icon" | "primary" | "secondary" };

const CLASS_BY_VARIANT: Record<NonNullable<Props["variant"]>, string> = {
  icon: "icon-button",
  primary: "primary-button",
  secondary: "secondary-button"
};

export function ActionButton({ children, icon, variant = "primary", ...props }: Props) {
  return <button className={CLASS_BY_VARIANT[variant]} {...props}>{icon}{children}</button>;
}
