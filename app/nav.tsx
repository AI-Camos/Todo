import Link from "next/link";

const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/semana", label: "Semana" },
  { href: "/plantillas", label: "Días modelo" },
] as const;

export default function Nav({ current }: { current: (typeof LINKS)[number]["href"] }) {
  return (
    <nav className="mb-4 flex gap-4 text-sm">
      {LINKS.map((l) =>
        l.href === current ? (
          <span key={l.href} className="font-medium text-zinc-900 dark:text-zinc-100">
            {l.label}
          </span>
        ) : (
          <Link
            key={l.href}
            href={l.href}
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {l.label}
          </Link>
        ),
      )}
    </nav>
  );
}
