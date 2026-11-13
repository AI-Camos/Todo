import Nav from "@/app/nav";
import WeekCalendar from "./week-calendar";

export default function SemanaPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <Nav current="/semana" />
        <h1 className="text-2xl font-semibold tracking-tight">Mi semana</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Planifica tus tareas por hora y marca su estado a lo largo del día
        </p>
      </header>
      <WeekCalendar />
    </main>
  );
}
