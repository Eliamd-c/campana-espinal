# Plan de desarrollo — Módulo de Agenda

> Documento de especificación para implementar el nuevo módulo de agenda de
> `campana-espinal`. Escrito para alguien que no ha participado en las
> conversaciones previas: incluye el contexto, el porqué de cada decisión y
> los criterios para dar cada fase por terminada.

**Fecha:** 20 de septiembre de 2026
**Estado del documento:** propuesta, pendiente de validación de los campos de plantilla

---

## 1. Qué se quiere construir

Una plataforma de agendamiento **versátil**, donde los tipos de cita no estén
programados en el código sino definidos por quien gestiona la agenda.

Hoy el sistema tiene tipos fijos (mitin, casa a casa, foro…) escritos a mano en
el código. Cada vez que aparece una necesidad nueva —una visita a una junta de
acción comunal, un compromiso adquirido con una comunidad— hay que tocar el
código. El objetivo es que **quien gestiona la agenda cree la plantilla y el
sistema se adapte**, sin desarrollo de por medio.

### El caso de uso que originó el diseño

Así es como el responsable describe una solicitud real:

> «Vamos a realizar una reunión el 4 de agosto en el barrio Caballero y
> Góngora, carrera 12 # 11-18, hora 6:30 pm. Reunión de Cervera. Solicito
> tarima, decoración, sonido, sillas 200, 200 refrigerios.»

De ahí salen tres requisitos que gobiernan todo el diseño:

**a) Se escribe en lenguaje natural.** Quien agenda está en la calle y redacta
como redactaría un WhatsApp, no rellenando doce campos.

**b) «Solicito» no es «tengo».** Tarima, sonido y 200 refrigerios son recursos
que alguien tiene que conseguir y que pueden no llegar. Son parte del
agendamiento, con cantidad y con estado propio.

**c) Faltan datos, y eso es normal.** En ese mismo ejemplo se olvidó la hora.
El sistema debe avisar de lo que falta; y si de verdad no se sabe, la persona
debe poder **declararlo como «por confirmar»**, que es distinto de olvidarlo.

### Los dos umbrales

Es la idea central del módulo:

| | Reservar un cupo | Confirmar |
|---|---|---|
| Qué exige | fecha, hora y plantilla | todas las reglas de la plantilla |
| Cómo se ve en el calendario | en gris, punteado | en firme |
| Cuenta en métricas | no | sí |
| Qué significa | «este hueco está apartado» | «esto va a ocurrir» |

Se puede apartar el jueves a las 4 con muy poca información. Pero eso **no es
una reunión confirmada**, y el sistema no debe dejar que se confunda una cosa
con la otra. Mientras algún dato siga «por confirmar», el agendamiento
permanece como cupo.

---

## 2. Qué hay hoy

Antes de escribir nada, conviene saber qué existe y en qué estado.

### `Evento` — el modelo con vida

`prisma/schema.prisma`, tabla `eventos`. Es el único que usa la interfaz.

- Estados: `borrador`, `pendiente_aprobacion`, `aprobado`, `en_ejecucion`,
  `finalizado`, `cancelado`.
- Tipos fijos en el código: mitin, casa_a_casa, foro, recorrido,
  reunion_barrial, reunion_lideres, fecha_critica.
- Guarda `checklist` como JSON con la forma `[{item, cantidad, obtenido}]` —
  el embrión de los recursos solicitados.
- Tiene `asistentes_esperados` / `asistentes_reales` y
  `presupuesto_estimado` / `presupuesto_real`: el cierre compara lo planeado
  con lo ocurrido, pero esos datos **no se muestran en ninguna pantalla**.
- Campo `fuente` (`web` | `whatsapp` | `ia`): el camino de WhatsApp ya no
  existe, se retiró con la integración de Evolution API.

### `Reunion` — un sistema paralelo sin uso

Tabla `reuniones`, con su propia ruta `/api/reuniones`. Más pobre que `Evento`
(título, fecha, lugar, líder, conteos, foto de planilla) y **la pantalla de
agenda no la referencia ni una vez**. Quedó huérfano.

### `ChecklistPlantilla` — el embrión de las plantillas

Tabla `checklist_plantillas`: `tipo_evento` + `items` JSON + `activa`. Al crear
un evento se busca la plantilla de ese tipo y se copia el checklist.

**No hay ninguna plantilla creada**, así que esa función busca, no encuentra y
deja el checklist vacío. Existe y no hace nada.

### Compromisos

**No existen.** No hay ninguna tabla de acuerdos, tareas o compromisos en el
esquema.

### Estado de los datos

Las tablas `eventos`, `asistentes_eventos` y `checklist_plantillas` están
**vacías**. Eso hace que la migración sea indolora: no hay datos que preservar.

### Problemas conocidos de la pantalla actual

`app/(dashboard)/agenda/page.tsx`, 572 líneas:

1. **El calendario se rompe en meses de 6 semanas.** La grilla está fija en
   `grid-rows-5`.
2. **Cinco recargas completas.** Cada acción vuelve a pedir *todos* los
   eventos al servidor.
3. **Todo en un fichero**: calendario, aprobaciones, métricas y dos modales.
4. **El barrio es texto libre**, cuando en `contactos` hay barrios ya
   registrados que podrían ofrecerse como lista.
5. Las métricas de cierre (real contra esperado) no se muestran.

---

## 3. Modelo de datos propuesto

Cuatro tablas nuevas. Los nombres de campo siguen la convención del esquema
actual (`snake_case` en base, `camelCase` en Prisma con `@map`).

### `PlantillaAgenda`

Lo que define quien gestiona la agenda.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `nombre` | varchar(120) | «Reunión de barrio», «Compromiso con comunidad» |
| `descripcion` | text? | para quien vaya a usarla |
| `icono` | varchar(40)? | identificación visual en el calendario |
| `color` | varchar(20)? | idem |
| `campos` | jsonb | definición de los campos (ver abajo) |
| `recursos_sugeridos` | jsonb | `[{item, cantidad_default}]` |
| `requiere_aprobacion` | boolean | default `false` |
| `duracion_default_min` | int? | para precargar la hora de fin |
| `activa` | boolean | default `true` |
| `creada_por` | varchar(80) | id de usuario |
| `fecha_creada` | timestamp | |
| `veces_usada` | int | default 0 — para ordenar por frecuencia |

**Forma de `campos`:**

```
[
  {
    "clave": "direccion",
    "etiqueta": "Dirección exacta",
    "tipo": "texto_corto",
    "requerido_para_confirmar": true,
    "ayuda": "Ej: carrera 12 # 11-18",
    "orden": 3
  }
]
```

**Tipos de campo admitidos** (lista cerrada, validada contra un catálogo en
`lib/agenda/campos.ts`):

`texto_corto`, `texto_largo`, `numero`, `dinero`, `fecha`, `hora`,
`fecha_hora`, `si_no`, `opciones` (con lista de valores), `barrio` (lista
tomada de los barrios del padrón), `persona` (busca en `contactos` por cédula),
`lider` (selecciona de `lideres`).

> **Decisión pendiente:** confirmar con el responsable si falta algún tipo que
> use a diario. Este catálogo cubre el ejemplo de la reunión de Cervera y todo
> lo que el modelo `Evento` maneja hoy.

### `Agendamiento`

Lo que se crea a partir de una plantilla. Sustituye a `Evento` y `Reunion`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `plantilla_id` | uuid | FK a `PlantillaAgenda` |
| `reglas_congeladas` | jsonb | **copia** de `campos` al crearse |
| `titulo` | varchar(200) | |
| `fecha_inicio` | timestamp | |
| `fecha_fin` | timestamp? | |
| `barrio` | varchar(80)? | |
| `direccion` | varchar(200)? | |
| `datos` | jsonb | valores de los campos de la plantilla |
| `estado` | varchar(20) | ver máquina de estados |
| `lider_id` | int? | FK opcional |
| `responsable` | varchar(80)? | quién responde del agendamiento |
| `asistentes_esperados` | int? | |
| `asistentes_reales` | int? | |
| `presupuesto_estimado` | float? | |
| `presupuesto_real` | float? | |
| `notas` | text? | |
| `texto_original` | text? | lo que escribió la persona, si vino por IA |
| `creado_por` | varchar(80) | |
| `confirmado_por` | varchar(80)? | |
| `fecha_confirmado` | timestamp? | |
| `fecha_creado` / `fecha_actualizado` | timestamp | |

**Por qué `reglas_congeladas`:** si alguien edita la plantilla en octubre, los
agendamientos de septiembre no deben cambiar de reglas de golpe. Cada
agendamiento se valida contra las reglas con las que nació.

### `CampoPorConfirmar`

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `agendamiento_id` | uuid | FK, `onDelete: Cascade` |
| `campo` | varchar(60) | la clave del campo |
| `marcado_por` | varchar(80) | quién declaró que falta |
| `fecha_marcado` | timestamp | |
| `resuelto` | boolean | default `false` |
| `fecha_resuelto` | timestamp? | |

**Por qué una tabla y no un array en el agendamiento:** hay que distinguir
«nadie lo ha rellenado» de «alguien declaró explícitamente que aún no se
sabe». La segunda es una decisión con autor y fecha, y de ella depende que el
agendamiento pueda quedarse en cupo sin que parezca un descuido.

Índice único por `(agendamiento_id, campo)`.

### `RecursoSolicitado`

Las 200 sillas y los 200 refrigerios.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `agendamiento_id` | uuid | FK, `onDelete: Cascade` |
| `item` | varchar(120) | «sillas», «sonido», «refrigerios» |
| `cantidad_solicitada` | int? | nulo cuando no aplica («decoración») |
| `cantidad_conseguida` | int? | |
| `estado` | varchar(20) | `solicitado`, `gestionando`, `conseguido`, `no_disponible` |
| `responsable` | varchar(80)? | quién lo consigue |
| `notas` | text? | |
| `orden` | int | para reordenar en la interfaz |

Índice por `agendamiento_id`.

### Migración

`prisma/migrations/manual/007_agenda_plantillas.sql`:

1. Crear las cuatro tablas.
2. Sembrar plantillas equivalentes a los siete tipos actuales, para que nada
   se pierda conceptualmente.
3. Migrar `eventos` → `agendamientos` (hoy 0 filas; el script debe funcionar
   igual si hubiera datos).
4. Migrar `reuniones` → `agendamientos` con la plantilla «Reunión» (0 filas).
5. Absorber `checklist_plantillas` en `PlantillaAgenda.recursos_sugeridos`.
6. **No borrar** las tablas viejas en esta migración. Dejarlas hasta verificar
   en producción; el borrado va en una migración posterior.

---

## 4. El motor de reglas

El corazón del módulo. Va en `lib/agenda/reglas.ts` y **no depende de React ni
de Next**: es una función pura, fácil de probar.

**Contrato:**

```
evaluar(reglas, datos, camposPorConfirmar) -> {
  puedeConfirmar: boolean,
  faltantes: [{ campo, etiqueta, motivo: "vacio" | "invalido" }],
  porConfirmar: [{ campo, etiqueta, marcadoPor, fecha }]
}
```

Reglas de negocio:

- Un campo con `requerido_para_confirmar: true` y sin valor → `faltantes`.
- Un campo declarado por confirmar → `porConfirmar`, **no** `faltantes`.
- `puedeConfirmar` es `true` solo si `faltantes` y `porConfirmar` están ambos
  vacíos.

Esa última línea es la que impide dar por sentada una reunión a la que le
falta la hora.

**Esta función la usan tres sitios**: el formulario (avisos en vivo), la API
(no confiar en el cliente) y la pantalla de confirmación. Una sola fuente de
verdad.

---

## 5. API

Todas las rutas comprueban permisos con `exigirPermiso` de
`lib/auth/permisos-ruta.ts`, y llevan `export const dynamic = "force-dynamic"`
al principio del fichero — una ruta que depende de quién la pide no puede
prerenderizarse.

| Ruta | Método | Permiso | Qué hace |
|---|---|---|---|
| `/api/agenda/plantillas` | GET | `agenda.ver` | lista plantillas activas |
| `/api/agenda/plantillas` | POST | `agenda.plantillas` | crea plantilla |
| `/api/agenda/plantillas/[id]` | PUT / DELETE | `agenda.plantillas` | edita / desactiva |
| `/api/agenda` | GET | `agenda.ver` | lista agendamientos, con filtros de rango y estado |
| `/api/agenda` | POST | `agenda.editar` | crea (nace como `borrador` o `cupo`) |
| `/api/agenda/[id]` | GET / PUT | `agenda.ver` / `agenda.editar` | detalle y edición |
| `/api/agenda/[id]/confirmar` | POST | `agenda.editar` | **valida las reglas**; 422 con la lista de faltantes si no cumple |
| `/api/agenda/[id]/por-confirmar` | POST / DELETE | `agenda.editar` | marca o resuelve un campo pendiente |
| `/api/agenda/[id]/recursos` | GET / POST / PATCH | `agenda.editar` | gestiona recursos solicitados |
| `/api/agenda/[id]/estado` | POST | `agenda.editar` | transiciones de estado |
| `/api/agenda/interpretar` | POST | `agenda.editar` | texto natural → estructura (**no guarda**) |

**Permiso nuevo:** `agenda.plantillas`. Añadir al catálogo de `lib/permisos.ts`
y al grupo «Agenda y eventos» de `GRUPOS_DE_PERMISOS`, con advertencia:
*«Quien define las plantillas decide qué se puede confirmar»*.

> Hay un test en `__tests__/lib/permisos.test.ts` que falla si se añade un
> permiso al catálogo y se olvida ponerlo en un grupo. Es intencional.

---

## 6. Interpretación de texto natural

`/api/agenda/interpretar` recibe el párrafo y devuelve la estructura. **Nunca
guarda nada**: devuelve lo interpretado, la interfaz lo muestra en el
formulario y la persona corrige antes de enviar.

### Contrato de salida

```
{
  titulo, fecha, hora, barrio, direccion,
  recursos: [{ item, cantidad }],
  no_reconocido: ["texto que no encajó en ningún campo"]
}
```

Todo campo que el modelo no identifique con seguridad se devuelve vacío. Es
mejor un hueco que un dato inventado: la persona ve el hueco y lo rellena; un
dato inventado se cuela.

### Seguridad — no improvisar aquí

El texto lo escribe una persona y va a un modelo de lenguaje. Ese problema ya
está resuelto en este repositorio y hay que reutilizarlo, no rehacerlo:

- Envolver el texto con `envolverNoConfiable()` de `lib/ia/sanitizar.ts`.
  Delimita el contenido con una marca aleatoria por llamada, de modo que no se
  pueda cerrar el bloque y hacer pasar el resto por instrucciones.
- Añadir `AVISO_CONTENIDO_EXTERNO` después de las instrucciones.
- Validar la respuesta con **zod** antes de usarla: longitudes acotadas,
  cantidades como enteros positivos, fechas parseables.
- Si el modelo no devuelve JSON válido, descartar con aviso — no reventar.

Ver `app/api/ocr/route.ts` como referencia: es el mismo patrón, ya probado.
Hay tests en `__tests__/lib/prompts-delimitados.test.ts` que fallan si un
prompt deja texto externo fuera del bloque delimitado.

### Nota de producto

Esta pieza es la más vistosa en una demostración, y por eso mismo va **la
penúltima** en el plan. Sin el motor de reglas por debajo, acabaríamos con un
intérprete bonito que rellena un formulario que no sabe qué exigir.

---

## 7. Estados

```
borrador ──► cupo ──► confirmado ──► ejecutado
              │           │
              └───────────┴──► cancelado
```

- **borrador**: se está redactando, no ocupa espacio en el calendario.
- **cupo**: aparta fecha y hora. Visible en gris punteado. Admite campos por
  confirmar.
- **confirmado**: pasó la validación de reglas. Solo aquí se registra
  `confirmado_por` y `fecha_confirmado`.
- **ejecutado**: ocurrió; se capturan asistentes y presupuesto reales.
- **cancelado**: no ocurrió.

**Regla de conservación:** no se puede borrar un agendamiento confirmado,
ejecutado o cancelado — solo borradores y cupos. Es la regla que ya aplica
`app/api/eventos/[id]/route.ts` y conviene mantenerla.

**Cupos solapados:** se avisa, no se bloquea. Dos cosas a la vez a veces se
quieren. Mostrar el conflicto y dejar decidir.

---

## 8. Pantallas

```
app/(dashboard)/agenda/
  page.tsx                      orquestación (~80 líneas)
  components/
    VistaCalendario.tsx         grilla, con el bug de 6 semanas corregido
    VistaLista.tsx              próximos agendamientos en orden cronológico
    BandejaAprobaciones.tsx     lo que ya existe
    PanelMetricas.tsx           lo que ya existe + real contra esperado
    FormularioAgendar.tsx       caja de texto + campos de la plantilla
    AvisoFaltantes.tsx          "falta la hora" → completar / por confirmar
    DetalleAgendamiento.tsx     con lo pendiente siempre visible
    PanelRecursos.tsx           ítems, cantidades y estado
    EditorPlantillas.tsx        crear y editar plantillas
  hooks/
    useAgenda.ts                carga y **actualización local**
```

`useAgenda` es lo que elimina las cinco recargas completas actuales: al
confirmar un agendamiento se actualiza ese elemento en memoria, no se vuelve a
pedir la lista entera.

### Flujo de agendar

1. La persona elige plantilla (o escribe y el sistema la sugiere).
2. Escribe el párrafo o rellena los campos. Si escribe, `interpretar` rellena
   el formulario y ella revisa.
3. Pulsa **Agendar**.
4. El motor de reglas evalúa. Si falta algo, aparece el aviso:

   > **Falta la hora de la reunión.**
   > [ Completar ahora ] [ Marcar como por confirmar ]

5. Si completa → puede confirmar. Si marca por confirmar → se guarda como
   **cupo**, y en el calendario aparece en gris con el aviso de qué falta.

---

## 9. Fases y criterios de aceptación

### Fase 1 — Modelo y motor de reglas
Tablas, migración y `lib/agenda/reglas.ts`. Sin interfaz.
**Terminada cuando:** hay tests que cubren campo vacío, campo por confirmar,
plantilla sin requisitos y plantilla con todos los campos exigidos; y
`puedeConfirmar` es `false` mientras quede algo por confirmar.

### Fase 2 — Agendar con validación
Formulario, aviso de faltantes y marcado «por confirmar». Sin IA.
**Terminada cuando:** se puede crear un agendamiento como el de la reunión de
Cervera sin la hora, el sistema avisa, y al marcarla por confirmar queda como
cupo.

### Fase 3 — Calendario y estados
Vistas de calendario y lista, con cupos diferenciados. Transiciones. Despiece
del fichero de 572 líneas y `useAgenda`.
**Terminada cuando:** un mes de 6 semanas se ve completo, confirmar un
agendamiento no recarga la lista entera, y cupo y confirmado se distinguen a
simple vista.

### Fase 4 — Recursos solicitados
Panel de recursos con cantidades y estado.
**Terminada cuando:** se registran «sillas 200» y «refrigerios 200», se marca
cuántas se consiguieron, y el detalle muestra lo que falta por conseguir.

### Fase 5 — Interpretación por texto
`/api/agenda/interpretar` y la caja de texto.
**Terminada cuando:** el párrafo del ejemplo rellena fecha, barrio, dirección,
título y los cinco recursos con sus cantidades; y un texto con instrucciones
incrustadas no altera el comportamiento (hay tests para esto).

### Fase 6 — Editor de plantillas
Crear y editar plantillas desde la interfaz, con permiso `agenda.plantillas`.
**Terminada cuando:** se crea una plantilla nueva con sus campos y reglas, y
se agenda con ella sin tocar código.

---

## 10. Riesgos y decisiones abiertas

**Campos de plantilla sin validar.** El catálogo de tipos de campo es una
propuesta. Antes de la fase 1 hay que confirmarlo con el responsable: añadir
un tipo después es fácil, pero cambiar la forma de `campos` cuando ya hay
plantillas creadas obliga a migrar datos.

**`Evento` y `Reunion` conviven durante la transición.** No borrarlas hasta
verificar en producción. Marcar sus rutas como obsoletas antes de retirarlas.

**El motor de reglas es el punto de fallo único.** Si se equivoca, o bloquea
agendamientos legítimos o deja confirmar lo que no debería. Es la pieza que
más test merece.

**Interpretación por IA:** puede equivocarse con fechas ambiguas («el 4» sin
mes) y con cantidades pegadas al ítem («sillas 200» frente a «200 sillas»). De
ahí que nunca guarde directamente y siempre pase por revisión.

**Coste:** cada interpretación es una llamada a Gemini. El límite de peticiones
del cubo `ia` (20/min) ya cubre esta ruta si se nombra bajo `/api/agenda/`;
verificar en `lib/rate-limit-edge.ts` que `limitePara()` la clasifica bien — si
no, añadir el prefijo.

---

## 11. Contexto técnico útil

- **Permisos:** todas las rutas usan `exigirPermiso` (`lib/auth/permisos-ruta.ts`)
  y los permisos se leen de la base en cada petición, no del token.
- **Validación de entrada:** zod, con los esquemas en `lib/validation.ts`.
  Ojo con los `z.coerce` y las cadenas vacías que mandan los `<select>`.
- **Límites de página:** `limitarPagina()` de `lib/datos/acceso.ts`, tope 200.
- **Auditoría:** `registrarAccesoADatos()` para consultas masivas. La columna
  `auditoria.accion` admite 40 caracteres (se amplió; antes eran 10 y los
  registros fallaban en silencio).
- **Logs:** `lib/logger.ts`. **Nunca** registrar cédulas, teléfonos ni
  contenido de mensajes.
- **Tests:** `npm test` (vitest). Los de `__tests__/api/` necesitan un servidor
  en marcha y credenciales `TEST_USER` / `TEST_PASSWORD`; se omiten solos si no
  están.
- **Build:** `ignoreBuildErrors` está en `false` a propósito. Si el lint falla,
  el build falla.

---

## 12. Resumen para empezar

1. Confirmar el catálogo de tipos de campo con el responsable.
2. Fase 1: tablas, migración `007` y `lib/agenda/reglas.ts` con sus tests.
3. A partir de ahí, en orden.

El criterio que resuelve las dudas de diseño que surjan: **un cupo nunca puede
parecer una reunión confirmada**. Si algo del diseño permite esa confusión,
está mal.
