"use client";

import { useState } from "react";

export interface ToggleProps {
  label?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}

export function Toggle({ label, checked, defaultChecked, disabled, onChange }: ToggleProps) {
  const [inner, setInner] = useState(!!defaultChecked);
  const on = checked ?? inner;
  return (
    <label className="y-toggle">
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled}
        onChange={(e) => {
          setInner(e.target.checked);
          onChange?.(e.target.checked);
        }}
      />
      <span className="y-toggle-track" aria-hidden="true">
        <span className="y-toggle-knob" />
      </span>
    </label>
  );
}
