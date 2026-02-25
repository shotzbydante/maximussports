'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { trackCtaClick } from '@/lib/analytics';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://maximussports.vercel.app';

const nav = [
  { href: '/', label: 'Home' },
  { href: '/features', label: 'Features' },
  { href: '/teams', label: 'Teams' },
  { href: '/about', label: 'About' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-xl font-bold text-slate-900">
          Maximus Sports
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {nav.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-sm font-medium ${
                pathname === href ? 'text-sky-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <a
          href={APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackCtaClick({ ctaId: 'open_app', location: 'header' })}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Open the App
        </a>
      </div>
    </header>
  );
}
