# CLAUDE.md

Guía para trabajar en este repositorio. Léela antes de implementar o modificar código.

## Qué es este proyecto

Aplicación de **to-do personal con un agente de IA integrado**, para uso diario del autor
y como banco de pruebas para meter IA en su flujo de trabajo. Un solo repo (mono-repo)
Next.js full-stack: el CRUD de tareas y el backend del agente viven en la misma app.

**No es "un to-do con un chatbot al lado".** El chat tiene *herramientas* (tool use) sobre
la propia base de datos: puede crear tareas, cambiar prioridades, agendar bloques y
consultar la semana. La distinción es deliberada y es el eje del proyecto: un chat que
solo conversa es un formulario con más pasos; un chat que ejecuta acciones sobre el
dominio es un agente.

**Decisión de arquitectura (por qué NO separamos repos):** el agente no necesita un
servicio aparte — es un conjunto de *route handlers* de Next.js. Al usar una API externa
para el modelo, no hay ningún proceso de inferencia propio que pudiéramos querer aislar.
Separar daría dos deploys y dos CI sin beneficio para una app personal. Un repo, un deploy.

**Decisión: no se despliega públicamente.** Se ejecuta en local (`npm run dev` + Postgres
en Docker). Cualquiera puede clonarlo y usarlo con su propia `ANTHROPIC_API_KEY`. Razón:
una instancia pública con la clave del autor necesita tope de gasto, rate limiting por IP y
un Postgres gestionado — coste y trabajo sin retorno para una app de un solo usuario. Si
hace falta enseñarlo, se graba una demo. Esto **no** es un pendiente: es una decisión..

## Stack

| Capa            | Elección                                              |
| --------------- | ----------------------------------------------------- |
| Framework       | Next.js (App Router) + React + TypeScript             |
| Estilos         | Tailwind CSS                                          |
| Base de datos   | PostgreSQL (en Docker, vía `docker-compose`)          |
| ORM             | Drizzle ORM + `drizzle-kit` (migraciones)             |
| IA              | API externa de Claude vía `@anthropic-ai/sdk`         |
| Modelo chat     | `claude-haiku-4-5` (pequeño/rápido/barato por defecto) |
| Bucle de agente | `client.beta.messages.toolRunner()` del SDK           |
| Evaluación      | Harness propio (casos + scorer) sobre las tools        |
| Observabilidad  | Tabla `llm_calls` + `/observabilidad` (coste, latencia, errores, trazas) |

## Estructura esperada

```
app/
  page.tsx                 # UI principal de la lista de to-dos
  api/
    todos/route.ts         # CRUD de tareas (GET/POST) 
    todos/[id]/route.ts    # PATCH/DELETE de una tarea
    subtasks/route.ts      # subtareas: GET (todas o ?todoId=) + POST
    subtasks/[id]/route.ts # PATCH (renombrar) / DELETE de una subtarea
    schedule/route.ts      # calendario: GET por rango (?start&end) + POST bloque
    schedule/[id]/route.ts # PATCH/DELETE de un bloque
    day-templates/         # días modelo: GET/POST (+fromDate), [id] PATCH/DELETE,
                           #   [id]/apply POST (copia a una fecha: merge|replace)
    template-blocks/       # bloques de los días modelo: GET/POST, [id] PATCH/DELETE
    chat/route.ts          # endpoint del agente (streaming + tool use)
    plan/route.ts          # planificador semanal (propone bloques, no los aplica)
  time-grid.tsx            # cuadrícula horaria GENÉRICA (columnas = fechas o plantillas)
  template-dialog.tsx      # aplicar día modelo a una fecha / guardar día como modelo
  semana/                  # calendario semanal: TimeGrid con una columna por fecha
  plantillas/              # días modelo: TimeGrid con una columna por plantilla
  chat/                    # UI del chat (componente cliente)
  observabilidad/          # dashboard de coste/latencia/errores + trazas
lib/
  db/
    index.ts               # cliente Drizzle + pool de Postgres
    schema.ts              # tablas: todos, subtasks, schedule_blocks, day_templates,
                           #   template_blocks, chat_messages, llm_calls
    blocks.ts              # select compartido del bloque enriquecido (tarea + subtarea)
  anthropic.ts             # cliente Anthropic compartido
  agent/
    tools.ts               # definición + implementación de las tools
    system-prompt.ts       # system prompt estable (no interpolar timestamps)
    telemetry.ts           # registro de cada llamada en llm_calls
evals/
  cases.ts                 # casos de prueba del agente (entrada → tool esperada)
  scorer.ts                # comprueba tool + argumentos
  run.ts                   # `npm run evals`
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
# El agente necesita además: @anthropic-ai/sdk y zod (betaZodTool deriva
# el JSON Schema de las tools desde el esquema Zod).

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
- **Streaming siempre en el chat**, respondiendo con un `ReadableStream`: evita timeouts y
  da mejor UX. Pero **no** con `client.messages.stream(...)` — el chat tiene tools, así que
  el streaming se obtiene pasando `stream: true` al `toolRunner`. Ver "El bucle de agente".
- **IDs de modelo exactos, sin sufijos de fecha.** `claude-haiku-4-5`, no
  `claude-haiku-4-5-20251001` en el código de la app.
- **`max_tokens`:** ~`8192` es suficiente para un chat de tareas. (La guía general del SDK
  recomienda ~64K en streaming para no cortar salidas largas; aquí las respuestas son
  cortas y el bucle de tools acota el turno, así que 8192 es una decisión consciente.)
- **`claude-haiku-4-5` es de generación anterior.** No acepta `output_config.effort` ni
  `thinking: {type: "adaptive"}` — esos parámetros dan **400** en este modelo. Si algún día
  se quiere thinking en Haiku, es `thinking: {type: "enabled", budget_tokens: N}` con
  `budget_tokens < max_tokens`. Para el planificador, ver "El planificador semanal".
- **System prompt:** darle contexto de que es un asistente dentro de una app de to-dos
  (puede resumir tareas, sugerir prioridades, responder preguntas básicas). Mantenerlo
  estable (no interpolar timestamps) para no romper el prompt caching más adelante.
- **Guardar historial** en la tabla `chat_messages` para poder retomar la conversación;
  la API es *stateless*, así que se reenvía el historial en cada request.

### El bucle de agente: `toolRunner`, no un bucle a mano

El SDK trae `client.beta.messages.toolRunner()`, que conduce el ciclo
petición → `tool_use` → ejecutar → `tool_result` → repetir hasta que el modelo deja de
llamar tools. **Usarlo.** No escribir el `while (stop_reason === "tool_use")` a mano: el
runner ya expone ganchos por turno (interceptar el resultado, denegar la llamada antes de
que se ejecute, reintentar) y esas eran las únicas razones para bajar al bucle manual.
Es una API `beta` del SDK — de ahí `client.beta.messages`.

Las tools se definen con `betaZodTool`, que genera el JSON Schema desde el esquema Zod:

```ts
// lib/agent/tools.ts
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const crearTarea = betaZodTool({
  name: "crear_tarea",
  // La descripción decide CUÁNDO se llama. Sé prescriptivo, no descriptivo:
  // "Llama a esto cuando el usuario pida añadir algo a su lista", no "crea una tarea".
  description:
    "Crea una tarea nueva. Llama a esto cuando el usuario pida añadir, apuntar o " +
    "recordar algo que tenga que hacer.",
  inputSchema: z.object({
    title: z.string().describe("Título breve de la tarea"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  }),
  run: async ({ title, priority }) => {
    // Toda escritura pasa por Drizzle, igual que las route handlers.
    // Nunca lanzar: devolver el error como texto para que el modelo se recupere.
    try {
      const [row] = await db.insert(todos).values({ title, priority }).returning();
      return `Creada la tarea ${row.id}: "${row.title}" (prioridad ${row.priority}).`;
    } catch (e) {
      return `Error al crear la tarea: ${(e as Error).message}`;
    }
  },
});
```

Y el handler (`app/api/chat/route.ts`), con `stream: true` para que la UI vea tokens en vivo.
Ojo a la forma del bucle: con streaming, **cada iteración del runner produce un stream, no
un mensaje**. Son dos bucles anidados.

```ts
export const runtime = "nodejs";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const runner = client.beta.messages.toolRunner({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [crearTarea, consultarSemana, agendarBloque /* ... */],
    messages,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (type: string, data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));

        // Bucle externo: una iteración por turno del agente.
        for await (const messageStream of runner) {
          // Bucle interno: eventos de ese turno.
          for await (const event of messageStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send("text", event.delta.text);
            }
            if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
              // La UI pinta "creando tarea…" en vez de quedarse en blanco.
              send("tool_call", { name: event.content_block.name });
            }
          }
          const message = await messageStream.finalMessage();
          await persistirTurno(message);   // chat_messages
          await registrarLlamada(message); // llm_calls (ver Observabilidad)
        }
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
```

**Por qué el stream lleva eventos tipados (`text`, `tool_call`) y no texto plano:** sin eso,
mientras el agente ejecuta una tool la UI no muestra nada durante segundos y parece colgada.

### Tools destructivas: nunca auto-ejecutar

El runner ejecuta el `run()` de una tool **en cuanto el modelo la pide**. Para una app de
tareas eso es inaceptable en `eliminar_tarea` o `mover_bloque`: una alucinación borra datos
reales. Y en un route handler HTTP no se puede preguntar al usuario a mitad de la request.

Regla: **dos niveles de tool.**

| Nivel | Tools | `run()` hace |
| --- | --- | --- |
| Auto | `consultar_tareas`, `consultar_semana`, `crear_tarea`, `agendar_bloque` | Ejecuta y devuelve el resultado. Son creaciones y lecturas: reversibles a mano. |
| Confirmación | `eliminar_tarea`, `mover_bloque`, `eliminar_bloque` | **No ejecuta.** Devuelve una propuesta (`{ accion, id, descripción }`). El handler la emite como evento `tool_proposal`; la UI pinta un botón; al confirmar, el cliente llama al endpoint REST normal (`DELETE /api/todos/[id]`). |

El modelo recibe como `tool_result` un texto del tipo *"He propuesto borrar la tarea 12; el
usuario aún no lo ha confirmado"*, así que no da por hecho que ocurrió.

### Contexto: no volcar la base de datos en el prompt

`consultar_tareas` **no** devuelve las 200 tareas. Acepta filtros (`status`, `priority`,
`limit` con tope) y devuelve un resumen. `consultar_semana` acepta un rango de fechas
obligatorio. Un agente que se ahoga en su propio contexto es el fallo más común y el más
aburrido de depurar.

## Subtareas

Una tarea puede tener **subtareas**: solo un título colgando de ella. Sin estado, sin
prioridad, sin color. Existen para partir un bloque grande del calendario sin partir la
tarea: el bloque de 8 h de «Trabajo» se agenda como 4 bloques de 2 h, cada uno con su
subtarea, y los 4 siguen siendo «Trabajo» — mismo `todo_id`, mismo color, misma tarjeta
del tablero. Es el modelo de Clockify (proyecto → tarea → entrada), y por eso la subtarea
se pinta **debajo** del título dentro del bloque, nunca en su lugar.

Decisiones, para no rediscutirlas:

- **La subtarea no es una tarea.** Si necesitas darle estado, prioridad o agendarla por su
  cuenta, lo que quieres es una tarea. Añadirle campos a `subtasks` es la forma de acabar
  con dos modelos de tarea y ninguno bueno.
- **`schedule_blocks.subtask_id` es `ON DELETE SET NULL`, no cascade.** Borrar una subtarea
  del catálogo no puede borrarte horas ya agendadas: el bloque se queda como la tarea a
  secas. La cascada solo va de `todos` hacia abajo.
- **La API comprueba que la subtarea pertenezca a la tarea del bloque.** El FK solo
  garantiza que la subtarea exista; sin esta comprobación podrías agendar «Trabajo» con una
  subtarea de «Gimnasio».
- **Se piden todas de una vez** (`GET /api/subtasks`), no por tarjeta: son un título por
  fila y pedirlas por tarea sería un N+1 gratuito.
- Cuando llegue el agente, `crear_tarea`/`agendar_bloque` deberían aceptar subtarea, y hará
  falta una tool para listarlas. No está hecho.

## Días modelo (`/plantillas`)

Plantillas de horario que **no pertenecen a ninguna fecha** («Día con reuniones», «Día sin
reuniones», «Fin de semana»…). Existen porque el día se planifica esa misma mañana, no el
domingo para toda la semana, pero los días se parecen mucho entre sí.

- **Misma cuadrícula, otra columna.** `app/time-grid.tsx` es la cuadrícula genérica: una
  columna es una fecha (Semana) o una plantilla (Días modelo). Arrastrar, sombra, copiar/
  pegar, selección múltiple y subtareas son el MISMO código. La vista solo aporta
  `columns`, el endpoint, `colField` (`date` | `templateId`) y `shiftCol`/`colDelta`. Para
  fechas, desplazar nunca se sale (pegar cruzando el domingo crea en la semana siguiente);
  para plantillas, más allá de la última es `null` y ese bloque no se mueve/pega.
- **Aplicar = copiar, no enlazar.** `POST /api/day-templates/:id/apply {date, mode}` copia
  los bloques al día. Editar o borrar la plantilla después no toca días ya aplicados.
  `merge` (por defecto) añade; `replace` vacía el día primero. En una transacción: un
  `replace` a medias dejaría el día vacío.
- **`template_blocks` no tiene `status`.** El estado es de la ejecución, no del plan; al
  aplicar, los bloques nacen como `todo`. Mismas reglas que `schedule_blocks` (paso 0.5,
  `hour+duration<=24`, subtarea de esa tarea, `subtask_id ON DELETE SET NULL`).
- Se aplica desde los dos lados: «Aplicar a…» en la cabecera de la plantilla, o el botón
  ⧉ en la cabecera de cada día de la Semana, que además permite **guardar ese día como
  plantilla** (`POST /api/day-templates {name, fromDate}`).

## El harness de evaluación (`evals/`)

**Qué es y por qué existe.** Un system prompt o una descripción de tool son código sin
tests: los cambias, "parece" que va mejor, y no tienes ni idea de si has roto otra cosa. El
harness es la suite de tests del agente. Un caso es una entrada de usuario más lo que el
agente *debería* haber hecho; el scorer comprueba si lo hizo.

Lo importante: **no se evalúa el texto de la respuesta**, se evalúa la *tool call*. Comparar
prosa contra prosa exige otro modelo de juez y es ruidoso. Comparar
`crear_tarea({title: "informe", priority: "high"})` contra lo esperado es determinista y
barato.

```ts
// evals/cases.ts
{
  input: "agéndame 2 horas mañana por la mañana para el informe y ponlo en alta",
  expect: {
    tools: ["crear_tarea", "agendar_bloque"],  // en cualquier orden
    args: {
      crear_tarea: { priority: "high" },        // subconjunto: solo lo que importa
      agendar_bloque: { duration: 2 },
    },
  },
}
```

Reglas del harness:

- **Se ejecuta contra una BD de prueba**, no contra la real. Transacción por caso, rollback
  al final. Un eval que borra tus tareas de verdad no se ejecuta dos veces.
- **Aserciones por subconjunto.** No fijes la fecha exacta si lo que pruebas es la duración.
  Un eval que falla por algo que no estabas probando es un eval que acabarás ignorando.
- **Se ejecuta antes de tocar el system prompt o una descripción de tool**, y después. Si el
  número no sube, revierte.
- Nada de sofisticación: unas 20–30 filas, `npm run evals`, imprime `18/20` y qué falló.
  El valor está en que exista y se ejecute, no en el framework.

## El planificador semanal (`/api/plan`)

Recibe las tareas pendientes con prioridades y los huecos libres del calendario; devuelve
una **propuesta** de bloques. No escribe en la BD: el usuario aprueba o ajusta en la UI.

No es prompt→texto: es **generación con restricciones**. La propuesta tiene que caber en
huecos libres, no solaparse, y respetar el paso de 0.5 h. Por tanto:

1. Se pide la propuesta con `output_config.format` (structured outputs) para que el JSON sea
   válido por construcción — no parsear prosa. `claude-haiku-4-5` **sí** soporta structured
   outputs, así que esto no obliga por sí solo a cambiar de modelo.
2. Se **valida contra la BD** (¿ese hueco sigue libre? ¿solapa consigo misma?).
3. Si falla, se reinyecta el error como turno y se pide corrección. Máximo 2 reintentos.

Ese ciclo validar-y-reintentar es la parte interesante del proyecto y donde más se itera el
prompt — de ahí que las evals vayan **antes** que esta feature, no después.

**Modelo:** decisión abierta. `claude-haiku-4-5` puede quedarse corto en razonamiento con
restricciones; `claude-opus-4-8` es el escalón natural. Decidirlo **con las evals**, no por
corazonada, y dejarlo escrito aquí. Si acaban conviviendo dos modelos, que sea una decisión
documentada y no un accidente.

## Observabilidad (`/observabilidad`)

**Esto es telemetría de aplicación, no MLOps.** Se dice aquí para no confundirse al
contarlo: guardar coste, latencia y errores en Postgres y pintarlos es instrumentación, no
un pipeline de ML. Dicho eso, es barato, es útil a diario, y es lo que permite lo que de
verdad interesa al autor: **interpretabilidad — poder abrir una respuesta rara y ver por qué
el agente hizo lo que hizo.** Ese es el objetivo real del dashboard; el coste y la latencia
son el subproducto.

Cada llamada a la API se registra en `llm_calls`:

| Columna | Para qué |
| --- | --- |
| `model`, `created_at`, `latency_ms` | latencia por modelo y por ruta |
| `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` | coste real (ver la nota sobre caching abajo) |
| `stop_reason` | `max_tokens` recurrente = respuestas cortadas |
| `tools_called` (jsonb) | qué tools se usan, cuáles nunca (candidatas a borrar) |
| `error_type` | 429 / 5xx / 400, separados |
| `conversation_id` | para reconstruir la traza completa de un turno |

**Sobre el prompt caching: en este proyecto no se va a activar, y eso es normal.** El
prefijo mínimo cacheable de `claude-haiku-4-5` son **4096 tokens**; nuestro system prompt
más las definiciones de tools no se acercan. Por debajo de ese umbral la API no cachea —
sin error y sin aviso, simplemente `cache_creation_input_tokens: 0`. Así que **un
`cache_read` a cero aquí NO es un síntoma de nada**; registramos las columnas porque son
gratis y porque si algún día el prompt crece (o se sube a otro modelo) el dato ya está.
No perseguir ese cero.

La vista que importa para interpretabilidad no es el gráfico de coste: es **la traza de un
turno** — mensaje del usuario, tools que pidió el modelo con sus argumentos exactos, lo que
devolvió cada una, y la respuesta final. Ahí es donde se ve *por qué* alucinó.

El coste sale de multiplicar tokens por el precio del modelo. **Los precios se guardan en
una constante versionada en el código, no se hardcodean en la consulta SQL** — cambian.

## Alcance: lo que NO se va a hacer

Escrito para no volver a discutirlo:

- **Nada de ML clásico** (prioridad "aprendida", detección de tareas estancadas con un
  modelo entrenado). Con el historial de un solo usuario hay unos cientos de filas ruidosas;
  cualquier modelo entrenado sobre eso sería peor que una heurística de tres líneas. Si algún
  día hay dataset de verdad, se reconsidera. Hasta entonces, más LLM y menos scikit-learn.
- **Nada de despliegue público.** Ver "Qué es este proyecto".
- **Nada de multiusuario, auth, ni organizaciones.** Es una app de una persona.

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
  Migración `0004` (aplicada): `hour` y `duration` pasaron de `integer` a `real` para
  soportar **medias horas** (paso 0.5: `6.5` = 06:30). Sin backfill (los enteros existentes
  se castean a `x.0`). La API valida ahora pasos de 0.5 (`hour` 0–23.5, `duration` >=0.5)
  vía un helper `isHalfStep`. Verificado round-trip con `hour:6.5, duration:1.5`.
  Migración `0005` (aplicada): columna `color` (text, nullable) en `todos` — color
  elegido por el usuario para distinguir tareas en el calendario. Guarda una **clave**
  de la paleta de `lib/colors.ts` (18 colores), no una clase ni un hex; `null` = automático
  (derivado del id). Se valida en la API contra la paleta, **no** con un enum de Postgres:
  la paleta es presentación y se retoca a menudo, y un enum obligaría a migrar por color.
  Migración `0006` (aplicada): tabla `subtasks` (`todo_id` FK→todos `ON DELETE CASCADE`,
  `title`) + columna `subtask_id` (nullable, FK→subtasks **`ON DELETE SET NULL`**) en
  `schedule_blocks`. Ver "Subtareas" abajo para el porqué del `SET NULL`.
  Migración `0007` (aplicada): `day_templates` + `template_blocks` (días modelo; ver
  "Días modelo").
- 🔶 **Paso 3 — Route handlers:** CRUD de tareas ✅ (`app/api/todos/route.ts` GET/POST,
  `app/api/todos/[id]/route.ts` PATCH/DELETE; `runtime = "nodejs"`; PATCH valida `status`
  y `priority` contra los enums). Subtareas ✅ (`app/api/subtasks/route.ts` GET
  (todas o `?todoId=`) + POST, `app/api/subtasks/[id]/route.ts` PATCH (solo `title`) /
  DELETE). Calendario ✅ (`app/api/schedule/route.ts` GET por rango
  `?start&end` + POST, `app/api/schedule/[id]/route.ts` PATCH/DELETE; GET hace join con
  `todos` para devolver `title`/`priority` y `leftJoin` con `subtasks` para `subtaskTitle`;
  POST/PATCH aceptan `subtaskId` y comprueban que la subtarea sea **de esa tarea**, cosa
  que el FK no garantiza; PATCH devuelve el bloque enriquecido, no la fila cruda, para que
  la UI pueda fusionar la respuesta). Verificado end-to-end contra la BD. ⬜ Falta
  `/api/chat` (agente con tool use + streaming; requiere `ANTHROPIC_API_KEY`) y `/api/plan`.
  Días modelo ✅ (`app/api/day-templates/…`, `app/api/template-blocks/…`). ⬜ Falta la
  migración `0008`: tabla `llm_calls` (ver "Observabilidad").
- 🔶 **Paso 4 — UI:** tablero Kanban ✅ (`app/page.tsx` + `app/todo-list.tsx`, componente
  cliente con `@dnd-kit`: 4 columnas por `status`, tarjetas arrastrables que cambian de
  estado al soltar, selector de prioridad por tarjeta con updates optimistas, editar inline
  y eliminar; orden dentro de columna por prioridad y recencia; **lista de subtareas** en
  cada tarjeta: añadir con Enter encadenado, renombrar al clic, borrar con ×, y el botón
  "+ subtarea" solo asoma al pasar por encima si la tarea no tiene ninguna). Calendario
  semanal ✅
  (`app/semana/page.tsx` + `app/semana/week-calendar.tsx`: cuadrícula Lun–Dom × horas 6–23
  con bloques posicionados en absoluto — ocupan varias filas según `duration` y se reparten
  en carriles al solaparse; navegación de semana con fechas reales, clic en hueco → selector
  de tarea con duración, clic en bloque → modal de estado/duración/quitar, y una barra de
  "ahora" que recorre el tablero; updates optimistos). Mover bloques con **drag & drop**
  (HTML5 nativo, no `@dnd-kit`: el `drop` se maneja a nivel de columna y calcula la hora
  desde la Y del cursor; `PATCH date/hour` optimista con clamp a medianoche). Al arrastrar se
  pinta una **sombra de destino**: un fantasma a rayas en la posición exacta donde caería el
  bloque, con su hora inicio–fin, y el original se atenúa. Sale de la MISMA aritmética que
  `moveGroup` (`clampHourDelta` + `hourFromY`, que viven a nivel de módulo justo para poder
  compartirse) — si divergieran, la sombra mentiría. Con selección múltiple se pinta un
  fantasma por bloque del grupo. La sombra lleva `pointer-events-none` a la fuerza: si
  capturase eventos se comería el `dragover` de la columna al pasar el cursor sobre ella y
  el destino se congelaría. El `dragover` devuelve el mismo objeto de estado cuando el
  destino no cambia, para no re-renderizar por píxel movido. Y **copiar/pegar**
  estilo portapapeles (`Ctrl/⌘+C` → cursor sobre un hueco + `Ctrl/⌘+V`, o clic en el hueco,
  crea la réplica vía `POST`; `Esc` cancela). **Selección múltiple** (`Ctrl/⌘/Shift+clic`
  alterna sin abrir el modal) para operar sobre un grupo: arrastrar mueve todos conservando
  su forma (mismo desfase días/horas, `PATCH` en lote) y copiar/pegar recoloca el grupo
  respecto a un ancla (el bloque más temprano) mediante desfases relativos (`POST` en lote);
  `clampHourDelta` recorta el desfase para que ningún bloque del grupo se salga de las horas
  válidas. Eliminar en lote la selección (botón **Eliminar** o tecla `Supr`/`Backspace`;
  `DELETE` en lote, 404 tratado como ya borrado). Los atajos de teclado se ignoran mientras
  se escribe en un input. Barra flotante con contador de selección/portapapeles y acciones.
  Rejilla en **medias horas** (paso 0.5): ranuras de fondo de 30 min (líneas de hora
  sólidas, de media hora punteadas), el drop encaja a la media hora más cercana, y los
  selectores de duración van en pasos de 0.5 con etiquetas tipo "30 min" / "1 h 30 min"
  (`fmtTime`/`fmtDuration`). **Subtareas en el calendario:** el selector de tarea lista las
  subtareas indentadas bajo su tarea (un clic agenda la tarea con esa subtarea; el buscador
  también busca por subtarea), el bloque pinta la subtarea bajo el título, el modal del
  bloque tiene un desplegable
  «— sin subtarea —» y copiar/pegar conserva la subtarea. **Bloques de 30 min:** miden 22 px
  útiles, así que no cabe una segunda línea — título y subtarea comparten fila separados por
  un punto medio, con `py-0` + `justify-center` para recuperar el alto que se comía el
  padding. La subtarea lleva `shrink-[3]` para encogerse antes que el título: el bloque tiene
  que seguir leyéndose como «Trabajo» aunque se corte el detalle. La sombra de arrastre hace
  lo mismo, pero poniendo la hora **primera**: arrastrando es el dato que se viene a mirar.
  Navegación Tablero↔Semana↔Días modelo (`app/nav.tsx`). **Días modelo** ✅
  (`app/plantillas/`: una columna por plantilla, crear/renombrar/borrar en la cabecera,
  «Aplicar a…» una fecha; en la Semana, ⧉ por día para aplicar o guardar como modelo).
  Dark mode
  conmutable (`app/theme-toggle.tsx` +
  `data-theme` en <html>, con script pre-render anti-flash; el `dark:` de Tailwind se
  redefine por atributo en `globals.css`). Build de producción limpio. ⬜ Falta el chat, el
  planificador y el dashboard de observabilidad.
- ⬜ **Paso 5 — Agente, evals, planificador, observabilidad.** Nada empezado. Ver abajo.

## Cómo retomar (próxima sesión)

Todo el CRUD y el calendario funcionan end-to-end. Lo que falta es la parte de IA, **en
este orden** (el orden importa: las evals van antes del planificador porque es donde más se
itera el prompt, y sin evals se itera a ciegas):

1. **`ANTHROPIC_API_KEY` real en `.env.local`** (ahora está vacío).
2. **Tool use** — `lib/agent/tools.ts` + `app/api/chat/route.ts` con `toolRunner` y
   streaming; ver "El bucle de agente". Empezar por las tools *auto* (`consultar_tareas`,
   `consultar_semana`, `crear_tarea`, `agendar_bloque`); las de confirmación después.
   Panel de chat en la UI que consuma los eventos `text` / `tool_call` / `tool_proposal`.
   Persistir cada turno en `chat_messages`.
3. **Harness de evals** (`evals/`) — 20–30 casos, scorer sobre tool + argumentos, BD de
   prueba. **Antes de tocar el planificador.** El autor ha pedido explícitamente que se le
   explique esta parte a fondo mientras se construye, no solo que funcione.
4. **Planificador** (`/api/plan`) — structured outputs + ciclo validar-y-reintentar contra
   la BD. Decidir el modelo con las evals y escribir la decisión aquí.
5. **Observabilidad** — migración `0008` (`llm_calls`), `lib/agent/telemetry.ts`, y
   `/observabilidad` con la vista de trazas por turno (la de coste es secundaria).

Al implementar: verificar la API exacta del SDK contra `node_modules/@anthropic-ai/sdk`
(`toolRunner` y `betaZodTool` son superficie **beta**, pueden moverse entre versiones) y
`node_modules/next/dist/docs/` por ser Next 16.

## Entorno de desarrollo (recordatorios)

- **Node** vía nvm (v24), no está en el PATH por defecto: `source ~/.nvm/nvm.sh` antes de
  `npm`/`npx` (o usar una terminal interactiva).
- **Docker:** el usuario no está en el grupo `docker`, así que la BD se levanta con
  `sudo docker compose up -d` (o añadirlo al grupo una vez: `sudo usermod -aG docker $USER`
  y reiniciar sesión). Los datos persisten en el volumen `pgdata`.
- Hay una tarea de ejemplo ("Probar la UI") sembrada en la BD durante las pruebas; se
  puede borrar desde la propia UI.
