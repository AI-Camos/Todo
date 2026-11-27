import Link from "next/link";
import type { ReactNode } from "react";

// Iconos de trazo, 16 px, `currentColor`: heredan el color del texto de la
// pestaña, así que la activa y las demás se tiñen solas.
const icon = (d: ReactNode) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4 shrink-0"
    aria-hidden
  >
    {d}
  </svg>
);

const LINKS = [
  {
    href: "/",
    label: "Tablero",
    // Tres columnas de alto distinto: un kanban.
    icon: icon(
      <>
        <rect x="2" y="2.5" width="3" height="11" rx="1" />
        <rect x="6.5" y="2.5" width="3" height="7" rx="1" />
        <rect x="11" y="2.5" width="3" height="9" rx="1" />
      </>,
    ),
  },
  {
    href: "/semana",
    label: "Semana",
    // Calendario.
    icon: icon(
      <>
        <rect x="2" y="3" width="12" height="11" rx="2" />
        <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
      </>,
    ),
  },
  {
    href: "/plantillas",
    label: "Días modelo",
    // Dos hojas superpuestas: una plantilla que se copia.
    icon: icon(
      <>
        <rect x="5" y="5" width="9" height="9" rx="1.5" />
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
      </>,
    ),
  },
] as const;

// Navegación entre vistas como control segmentado: una cápsula con las tres
// pestañas; la activa se "levanta" (fondo blanco + sombra) y las demás quedan
// en gris hasta pasar por encima. `aria-current` marca la activa para lectores
// de pantalla, que antes la veían como un texto suelto.
export default function Nav({ current }: { current: (typeof LINKS)[number]["href"] }) {
  return (
    <nav
      aria-label="Vistas"
      className="mb-5 inline-flex gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1 text-sm shadow-inner dark:border-zinc-800 dark:bg-zinc-900/80"
    >
      {LINKS.map((l) => {
        const active = l.href === current;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
              active
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-700 dark:text-white dark:ring-zinc-600"
                : "text-zinc-500 hover:bg-white/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            {/* El icono de la activa lleva el violeta del favicon / «Esta
                semana»: un único acento de color en toda la barra. */}
            <span className={active ? "text-violet-600 dark:text-violet-400" : ""}>
              {l.icon}
            </span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
