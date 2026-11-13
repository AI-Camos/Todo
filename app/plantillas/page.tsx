import Nav from "@/app/nav";
import TemplatesBoard from "./templates-board";

export default function PlantillasPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <Nav current="/plantillas" />
        <h1 className="text-2xl font-semibold tracking-tight">Días modelo</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Horarios tipo que no dependen de ninguna fecha · diséñalos aquí y
          aplícalos al día que toque (o desde la Semana con ⧉)
        </p>
      </header>
      <TemplatesBoard />
    </main>
  );
}
