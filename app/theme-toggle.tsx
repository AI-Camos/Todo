"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

// La fuente de verdad es data-theme en <html> (lo fija el script pre-render);
// nos suscribimos a sus cambios en vez de copiarlo a un estado de React.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getTheme = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "light");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
      className="fixed right-4 top-4 z-40 flex size-9 items-center justify-center rounded-lg border border-zinc-300 bg-white/80 text-base backdrop-blur transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:bg-zinc-800"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
