"use client";

import { useMemo, useState } from "react";
import TimeGrid, { type GridColumn } from "@/app/time-grid";
import TemplateDialog, { fmtDay } from "@/app/template-dialog";

// Calendario semanal: la cuadrícula genérica con una columna por fecha. Toda la
// interacción (arrastrar, copiar/pegar, selección…) vive en `TimeGrid`; aquí
// solo está lo que es propio de una semana real: fechas, navegación, "hoy" y
// aplicar un día modelo sobre un día concreto.

const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

const pad = (n: number) => String(n).padStart(2, "0");

// --- helpers de fecha (en hora local, trabajando con 'YYYY-MM-DD') ---
function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // 0=Lun .. 6=Dom
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Para fechas, desplazar una columna nunca "se sale": pegar un grupo que cruza
// el domingo crea los bloques en la semana siguiente, aunque no se vean.
function isoAddDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(addDays(new Date(y, m - 1, d), n));
}
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime();
  return Math.round(ms / 86_400_000);
}

const navBtn =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

export default function WeekCalendar() {
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  // Tras aplicar una plantilla, los bloques nuevos los ha creado el servidor:
  // se fuerza a la cuadrícula a recargar.
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialogDate, setDialogDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayISO = toISO(new Date());
  const columns: GridColumn[] = days.map((d, i) => {
    const iso = toISO(d);
    return {
      key: iso,
      label: DOW[i],
      sub: String(d.getDate()),
      highlight: iso === todayISO,
    };
  });
  const start = toISO(days[0]);
  const end = toISO(days[6]);
  const rangeLabel = `${days[0].getDate()} ${MONTHS[days[0].getMonth()]} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()]}`;

  return (
    <>
      {notice && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
          {notice}
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100">
            ×
          </button>
        </p>
      )}
      <TimeGrid
        columns={columns}
        url="/api/schedule"
        query={`?start=${start}&end=${end}`}
        colField="date"
        shiftCol={isoAddDays}
        colDelta={daysBetween}
        withStatus
        nowCol={columns.some((c) => c.key === todayISO) ? todayISO : null}
        refreshKey={refreshKey}
        removeLabel="Quitar del calendario"
        toolbar={
          <>
            <button onClick={() => setWeekStart((w) => addDays(w, -7))} className={navBtn}>
              ← Anterior
            </button>
            <button onClick={() => setWeekStart(mondayOf(new Date()))} className={navBtn}>
              Hoy
            </button>
            <button onClick={() => setWeekStart((w) => addDays(w, 7))} className={navBtn}>
              Siguiente →
            </button>
            <span className="ml-1 text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {rangeLabel}
            </span>
          </>
        }
        headerExtra={(c) => (
          <button
            onClick={() => setDialogDate(c.key)}
            title="Aplicar un día modelo / guardar este día como modelo"
            aria-label={`Días modelo para el ${fmtDay(c.key)}`}
            className="absolute right-1 top-1 rounded px-1 text-xs text-zinc-400 opacity-40 transition hover:bg-zinc-200 hover:text-zinc-700 group-hover/head:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          >
            ⧉
          </button>
        )}
      />
      {dialogDate && (
        <TemplateDialog
          date={dialogDate}
          onApplied={({ date, templateName, added, removed }) => {
            setDialogDate(null);
            setRefreshKey((k) => k + 1);
            setNotice(
              `«${templateName}» aplicado al ${fmtDay(date)}: ${added} bloque${added === 1 ? "" : "s"}` +
                (removed ? ` (se quitaron ${removed} que había)` : ""),
            );
          }}
          onSaved={(t) => {
            setDialogDate(null);
            setNotice(`Guardado el día como «${t.name}». Lo tienes en «Días modelo».`);
          }}
          onClose={() => setDialogDate(null)}
        />
      )}
    </>
  );
}
