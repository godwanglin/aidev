import type { ReactNode } from "react";

export default function PageHead({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="actions">{children}</div></div>;
}
