"use client";

import { useState } from "react";
import type * as React from "react";

export interface TabsProps {
  items: React.ReactNode[];
  value?: number;
  defaultValue?: number;
  onChange?: (i: number) => void;
}

export function Tabs({ items, value, defaultValue = 0, onChange }: TabsProps) {
  const [inner, setInner] = useState(defaultValue);
  const cur = value ?? inner;
  return (
    <div role="tablist" className="y-tabs">
      {items.map((t, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          className="y-tab"
          aria-selected={i === cur ? "true" : "false"}
          onClick={() => {
            setInner(i);
            onChange?.(i);
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
