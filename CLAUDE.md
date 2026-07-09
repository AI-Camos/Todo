# CLAUDE.md

Guía para trabajar en este repositorio. Léela antes de implementar o modificar código.

## Qué es este proyecto

Aplicación de **to-do personal con un chat de IA integrado**, para uso diario del autor
y como banco de pruebas para meter IA en su flujo de trabajo. Un solo repo (mono-repo)
Next.js full-stack: el CRUD de tareas y el backend del chat viven en la misma app.

**Decisión de arquitectura (por qué NO separamos repos):** el chat no necesita un servicio
aparte — es un conjunto de *route handlers* de Next.js. Al usar una API externa para el
modelo, no hay ningún proceso de inferencia propio que pudiéramos querer aislar. Separar
daría dos deploys y dos CI sin beneficio para una app personal. Un repo, un deploy.

## Stack

| Capa          | Elección                                             |
| ------------- | ---------------------------------------------------- |
| Framework     | Next.js (App Router) + React + TypeScript            |
| Estilos       | Tailwind CSS                                         |
| Base de datos | PostgreSQL (en Docker, vía `docker-compose`)         |
| ORM           | Drizzle ORM + `drizzle-kit` (migraciones)            |
| IA            | API externa de Claude vía `@anthropic-ai/sdk`        |
| Modelo chat   | `claude-haiku-4-5` (pequeño/rápido/barato por defecto) |

## Estructura esperada

```
app/
  page.tsx                 # UI principal de la lista de to-dos
  api/
    todos/route.ts         # CRUD de tareas (GET/POST) 
    todos/[id]/route.ts    # PATCH/DELETE de una tarea
    schedule/route.ts      # calendario: GET por rango (?start&end) + POST bloque
    schedule/[id]/route.ts # PATCH/DELETE de un bloque
    chat/route.ts          # endpoint del chat de IA (streaming)
  semana/                  # UI del calendario semanal (time-blocking, cliente)
  chat/                    # UI del chat (componente cliente)
lib/
  db/
    index.ts               # cliente Drizzle + pool de Postgres
    schema.ts              # tablas: todos, chat_messages
  anthropic.ts             # cliente Anthropic compartido
db/
  migrations/              # generadas por drizzle-kit
docker-compose.yml         # servicio postgres
drizzle.config.ts
.env.local                 # NO commitear
```

## Setup y comandos

```bash
# 1. Levantar Postgres
docker compose up -d

# 2. Instalar deps
npm install

# 3. Migraciones (tras editar lib/db/schema.ts)
npx drizzle-kit generate   # crea SQL en db/migrations
npx drizzle-kit migrate    # aplica a la BD

# 4. Dev server
npm run dev                # http://localhost:3000
```

## Variables de entorno (`.env.local`)

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/todo
ANTHROPIC_API_KEY=sk-ant-...
```

Nunca hardcodear la API key ni el `DATABASE_URL` en el código: siempre `process.env`.
`.env.local` va en `.gitignore`.

## Integración con Claude (reglas)

- **Usar SIEMPRE el SDK oficial `@anthropic-ai/sdk`.** No mezclar con `fetch`/`axios`
  crudos contra la API, y no usar shims "compatibles con OpenAI".
- **Modelo por defecto del chat: `claude-haiku-4-5`.** Es el modelo pequeño que pediste
  para preguntas básicas (200K de contexto, el más económico). Si en el futuro quieres
  más capacidad para una función concreta, sube a `claude-opus-4-8` — pero manténlo como
  decisión explícita, no por defecto en todo.
- **Streaming en el route handler del chat.** Usar `client.messages.stream(...)` y
  responder con un `ReadableStream` para que la UI muestre tokens en vivo. Evita timeouts
  y da mejor UX.
- **IDs de modelo exactos, sin sufijos de fecha.** `claude-haiku-4-5`, no
  `claude-haiku-4-5-20251001` en el código de la app.
- **`max_tokens`:** en streaming, ~`4096`–`8192` es suficiente para un chat de tareas.
- **System prompt:** darle contexto de que es un asistente dentro de una app de to-dos
  (puede resumir tareas, sugerir prioridades, responder preguntas básicas). Mantenerlo
  estable (no interpolar timestamps) para no romper el prompt caching más adelante.
- **Guardar historial** en la tabla `chat_messages` para poder retomar la conversación;
  la API es *stateless*, así que se reenvía el historial en cada request.

Patrón de referencia del handler (`app/api/chat/route.ts`):

```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: "Eres el asistente de una app de tareas personal...",
    messages, // historial completo user/assistant
  });

  return new Response(
    stream.toReadableStream(), // o mapear los eventos manualmente
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
```

## Convenciones

- TypeScript estricto; tipar los payloads de las route handlers.
- Toda escritura en BD pasa por Drizzle (nada de SQL crudo salvo migraciones).
- Componentes de servidor por defecto; `"use client"` solo donde haya estado/interacción
  (la lista editable y el chat).
- Un cambio de `schema.ts` **siempre** va acompañado de su migración generada.

## Next.js 16

El scaffold es **Next.js 16 (App Router + Turbopack)**. Es una versión con *breaking
changes* respecto a versiones anteriores: APIs, convenciones y estructura pueden diferir.
**Antes de escribir código de Next (route handlers, `next.config`, etc.), consultar
`node_modules/next/dist/docs/` y `AGENTS.md`.** Tailwind es v4 (config vía
`@tailwindcss/postcss`, sin `tailwind.config.js`).

## Estado actual

- ✅ **Paso 1 — scaffold Next.js** hecho: App Router + TS + Tailwind v4 + ESLint.
  `npm run build` compila limpio.
- ✅ **Paso 2 — Postgres + Drizzle** hecho: `docker-compose.yml` (Postgres 17),
  `lib/db/schema.ts` (`todos`, `chat_messages`), `lib/db/index.ts` (cliente), migración
  `0000` generada y aplicada. Verificado con un round-trip insert/select/delete.
  Migración `0001` (aplicada): `todos` pasó de `completed` (boolean) a un enum `status`
  (`todo_status`: todo/doing/paused/done) más un enum `priority` (`todo_priority`:
  low/medium/high, default medium). El backfill mapea `completed=true → done`.
  Migración `0002` (aplicada): tabla `schedule_blocks` (time-blocking semanal estilo
  Clockify) con `todo_id` (FK→todos, `ON DELETE CASCADE`), `date`, `hour` (0-23) y su
  propio `status`. Verificado el borrado en cascada. Migración `0003` (aplicada): columna
  `duration` (horas, default 1) para bloques multi-hora; la API valida `hour+duration<=24`.
- 🔶 **Paso 3 — Route handlers:** CRUD de tareas ✅ (`app/api/todos/route.ts` GET/POST,
  `app/api/todos/[id]/route.ts` PATCH/DELETE; `runtime = "nodejs"`; PATCH valida `status`
  y `priority` contra los enums). Calendario ✅ (`app/api/schedule/route.ts` GET por rango
  `?start&end` + POST, `app/api/schedule/[id]/route.ts` PATCH/DELETE; GET hace join con
  `todos` para devolver `title`/`priority`). Verificado end-to-end contra la BD. ⬜ Falta
  `/api/chat` con streaming (requiere `ANTHROPIC_API_KEY`).
- 🔶 **Paso 4 — UI:** tablero Kanban ✅ (`app/page.tsx` + `app/todo-list.tsx`, componente
  cliente con `@dnd-kit`: 4 columnas por `status`, tarjetas arrastrables que cambian de
  estado al soltar, selector de prioridad por tarjeta con updates optimistas, editar inline
  y eliminar; orden dentro de columna por prioridad y recencia). Calendario semanal ✅
  (`app/semana/page.tsx` + `app/semana/week-calendar.tsx`: cuadrícula Lun–Dom × horas 6–23
  con bloques posicionados en absoluto — ocupan varias filas según `duration` y se reparten
  en carriles al solaparse; navegación de semana con fechas reales, clic en hueco → selector
  de tarea con duración, clic en bloque → modal de estado/duración/quitar, y una barra de
  "ahora" que recorre el tablero; updates optimistos). Navegación Tablero↔Semana. Dark mode
  conmutable (`app/theme-toggle.tsx` +
  `data-theme` en <html>, con script pre-render anti-flash; el `dark:` de Tailwind se
  redefine por atributo en `globals.css`). Build de producción limpio. ⬜ Falta el chat.

## Cómo retomar (próxima sesión)

Único pendiente: **el chat de IA** (todo lo demás funciona end-to-end). En orden:

1. Poner un `ANTHROPIC_API_KEY` real en `.env.local` (ahora está vacío).
2. Implementar `app/api/chat/route.ts` con streaming — ver el patrón de referencia en
   "Integración con Claude (reglas)". Verificar la API exacta del SDK contra
   `node_modules/@anthropic-ai/sdk` al implementar (y `node_modules/next/dist/docs/` por
   ser Next 16).
3. Persistir cada turno en `chat_messages` y reenviar el historial completo en cada
   request (la API de Claude es *stateless*).
4. Panel de chat en la UI: componente cliente que consume `/api/chat` por streaming.

## Entorno de desarrollo (recordatorios)

- **Node** vía nvm (v24), no está en el PATH por defecto: `source ~/.nvm/nvm.sh` antes de
  `npm`/`npx` (o usar una terminal interactiva).
- **Docker:** el usuario no está en el grupo `docker`, así que la BD se levanta con
  `sudo docker compose up -d` (o añadirlo al grupo una vez: `sudo usermod -aG docker $USER`
  y reiniciar sesión). Los datos persisten en el volumen `pgdata`.
- Hay una tarea de ejemplo ("Probar la UI") sembrada en la BD durante las pruebas; se
  puede borrar desde la propia UI.
