import type * as React from "react";
import { cx } from "./cx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export function Input({ label, hint, error, className, ...rest }: InputProps) {
  return (
    <label className={cx("y-field", className)}>
      {label}
      <input className="y-input" aria-invalid={error ? "true" : undefined} {...rest} />
      {error ? <span className="y-field-error">{error}</span> : hint ? <span className="y-field-hint">{hint}</span> : null}
    </label>
  );
}
