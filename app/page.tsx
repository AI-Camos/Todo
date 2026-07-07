import TodoList from "./todo-list";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Mis tareas</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          To-do personal · el chat de IA llega pronto
        </p>
      </header>
      <TodoList />
    </main>
  );
}
