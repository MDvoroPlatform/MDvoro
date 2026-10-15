'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

export function HomeLogoLink({ children, className }: { children: ReactNode; className: string }) {
  return <Link href="/dashboard" className={className} aria-label="MDvoro home" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{children}</Link>;
}
