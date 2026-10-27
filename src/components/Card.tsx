import * as React from "react";
import { cx } from "./cx";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  tone?: "white" | "sand" | "amber" | "dark";
  title?: React.ReactNode;
  as?: React.ElementType;
}

export function Card({ tone = "white", title, as: Tag = "section", className, children, ...rest }: CardProps) {
  return (
    <Tag {...rest} className={cx("y-card", `y-card-${tone}`, className)}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </Tag>
  );
}
