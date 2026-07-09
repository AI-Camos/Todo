"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  // El script pre-render ya fijó data-theme; aquí solo lo leemos para el icono.
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTheme(t === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
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
