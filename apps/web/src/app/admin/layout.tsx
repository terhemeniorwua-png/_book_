import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-[70vh] bg-stone-50">{children}</div>;
}
