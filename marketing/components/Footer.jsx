import Link from 'next/link';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            &copy; {year} Maximus Sports. Built for high-intensity college basketball fans.
          </p>
          <nav className="flex flex-wrap gap-6">
            <Link href="/privacy" className="text-sm text-slate-600 hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm text-slate-600 hover:text-slate-900">
              Terms
            </Link>
            <Link href="/about" className="text-sm text-slate-600 hover:text-slate-900">
              About
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
