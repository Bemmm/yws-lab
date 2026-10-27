import type * as React from "react";
import { cx } from "./cx";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={cx("y-btn", `y-btn-${variant}`, size !== "md" && `y-btn-${size}`, className)}
    />
  );
}
