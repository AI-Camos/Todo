import Nav from "@/app/nav";
import TodoList from "./todo-list";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <Nav current="/" />
        <h1 className="text-2xl font-semibold tracking-tight">Mis tareas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Tablero Kanban · arrastra tareas entre columnas · el chat de IA llega pronto
        </p>
      </header>
      <TodoList />
    </main>
  );
}
