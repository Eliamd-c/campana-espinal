# Message Builder - Quick Start 🚀

## ¿Qué Necesitas Hacer HOY?

Este es el plan paso a paso para implementar el Message Builder en **3 semanas**.

---

## SEMANA 1: Fundación (Lunes-Viernes)

### Lunes (3 horas)
**Actualiza Prisma Schema**

```bash
# 1. Abre prisma/schema.prisma
# 2. Agrega esto al final (antes de cierre de archivo)

model MessageTemplate {
  id          Int       @id @default(autoincrement())
  nombre      String    @db.VarChar(120)
  descripcion String?   @db.Text
  categoria   String    @db.VarChar(40)
  bloques     Json      // Contenido del mensaje como JSON
  preview_texto String? @db.Text
  imagen_preview String? @db.VarChar(255)
  
  creada_por  String
  fecha_creada DateTime @default(now())
  actualizada DateTime @updatedAt
  veces_usada Int      @default(0)
  
  esPublica   Boolean  @default(false)
  
  @@index([categoria])
  @@index([esPublica])
  @@map("message_templates")
}

model MessageDraft {
  id          Int       @id @default(autoincrement())
  usuario_id  String
  bloques     Json
  titulo      String?
  
  guardado_en DateTime @default(now())
  actualizado DateTime @updatedAt
  
  @@index([usuario_id])
  @@map("message_drafts")
}

# 3. Ejecuta
npx prisma migrate dev --name add_message_templates

# 4. Verifica en BD que las tablas se crearon
```

---

### Lunes/Martes (4 horas)
**Crea Tipos TypeScript**

```typescript
// lib/message-builder/types.ts

export type BlockType = "texto" | "imagen" | "video" | "encuesta" | "boton" | "divisor" | "espaciador";

export interface Bloque {
  id: string;
  tipo: BlockType;
  orden: number;
  config: BlockConfig;
}

export interface BlockConfig {
  // Común
  margen_top?: number;
  margen_bottom?: number;

  // Texto
  contenido?: string;
  tamaño?: "pequeno" | "normal" | "grande";
  peso?: "normal" | "bold";
  color?: string;
  alineacion?: "left" | "center" | "right";
  variables?: string[];

  // Imagen
  url?: string;
  ancho?: string;
  caption?: string;
  enlace?: string;

  // Video
  tipo_video?: "youtube" | "vimeo" | "url";
  descripcion?: string;

  // Encuesta
  pregunta?: string;
  opciones?: Array<{ id: string; texto: string; emoji: string }>;
  tipo_encuesta?: "single" | "multiple";
  permitir_otro?: boolean;

  // Botón
  texto?: string;
  accion?: "url" | "llamada" | "whatsapp" | "formulario";
  valor?: string;

  // Divisor
  espesor?: string;

  // Espaciador
  altura?: string;
}

export interface MessageTemplate {
  id: number;
  nombre: string;
  descripcion?: string;
  categoria: string;
  bloques: Bloque[];
  preview_texto?: string;
  imagen_preview?: string;
  creada_por: string;
  fecha_creada: Date;
  veces_usada: number;
  esPublica: boolean;
}
```

```typescript
// lib/message-builder/utils.ts

export function generarIdBloque(): string {
  return `bloque_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getConfigDefault(tipo: BlockType): BlockConfig {
  const defaults: Record<BlockType, BlockConfig> = {
    texto: {
      contenido: "",
      tamaño: "normal",
      peso: "normal",
      color: "#000000",
      alineacion: "left",
    },
    imagen: {
      url: "",
      ancho: "100%",
      caption: "",
    },
    video: {
      url: "",
      tipo_video: "youtube",
      descripcion: "",
    },
    encuesta: {
      pregunta: "",
      opciones: [
        { id: "1", texto: "Sí", emoji: "👍" },
        { id: "2", texto: "No", emoji: "👎" },
      ],
      tipo_encuesta: "single",
      permitir_otro: false,
    },
    boton: {
      texto: "Botón",
      accion: "url",
      valor: "",
      color: "#007AFF",
    },
    divisor: {
      color: "#EEEEEE",
      espesor: "1px",
    },
    espaciador: {
      altura: "16px",
    },
  };

  return defaults[tipo];
}
```

---

### Martes/Miércoles (6 horas)
**Crea Componentes Base**

```typescript
// app/(dashboard)/mensajes/constructor/page.tsx

"use client";

import { useState } from "react";
import MessageBuilder from "../components/MessageBuilder";

export default function ConstructorPage() {
  return <MessageBuilder />;
}
```

```typescript
// app/(dashboard)/mensajes/components/MessageBuilder.tsx

"use client";

import { useState, useCallback } from "react";
import BlocksPalette from "./BlocksPalette";
import Canvas from "./Canvas";
import Preview from "./Preview";
import BlockEditorPanel from "./BlockEditor/BlockEditorPanel";
import { generarIdBloque, getConfigDefault } from "@/lib/message-builder/utils";
import type { Bloque, BlockType } from "@/lib/message-builder/types";

export default function MessageBuilder() {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const agregarBloque = useCallback((tipo: BlockType) => {
    const nuevoBloque: Bloque = {
      id: generarIdBloque(),
      tipo,
      orden: bloques.length,
      config: getConfigDefault(tipo),
    };
    setBloques([...bloques, nuevoBloque]);
    setSelectedBlockId(nuevoBloque.id);
    setIsDirty(true);
  }, [bloques]);

  const actualizarBloque = useCallback((id: string, config: any) => {
    setBloques(bloques.map((b) => (b.id === id ? { ...b, config } : b)));
    setIsDirty(true);
  }, [bloques]);

  const eliminarBloque = useCallback((id: string) => {
    setBloques(bloques.filter((b) => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
    setIsDirty(true);
  }, [bloques, selectedBlockId]);

  const moverBloque = useCallback(
    (id: string, direccion: "up" | "down") => {
      const index = bloques.findIndex((b) => b.id === id);
      if ((direccion === "up" && index === 0) || (direccion === "down" && index === bloques.length - 1))
        return;

      const nuevoBloques = [...bloques];
      if (direccion === "up") {
        [nuevoBloques[index], nuevoBloques[index - 1]] = [nuevoBloques[index - 1], nuevoBloques[index]];
      } else {
        [nuevoBloques[index], nuevoBloques[index + 1]] = [nuevoBloques[index + 1], nuevoBloques[index]];
      }
      setBloques(nuevoBloques);
      setIsDirty(true);
    },
    [bloques]
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">🎨 Constructor de Mensaje</h1>
        <div className="flex gap-3">
          <button className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700">
            💾 Guardar como Plantilla
          </button>
          <button
            onClick={() => {
              setBloques([]);
              setSelectedBlockId(null);
              setIsDirty(false);
            }}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-300"
          >
            🔄 Limpiar
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        <BlocksPalette onAgregarBloque={agregarBloque} />
        <Canvas
          bloques={bloques}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onDeleteBlock={eliminarBloque}
          onMoveBlock={moverBloque}
        />
        
        <div className="w-80 bg-white border-l flex flex-col overflow-hidden">
          <Preview bloques={bloques} />
          {selectedBlockId && (
            <BlockEditorPanel
              bloque={bloques.find((b) => b.id === selectedBlockId)!}
              onActualizar={(config) => actualizarBloque(selectedBlockId, config)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
```

```typescript
// app/(dashboard)/mensajes/components/BlocksPalette.tsx

"use client";

export default function BlocksPalette({ onAgregarBloque }) {
  const bloques = [
    { tipo: "texto", label: "Texto", icon: "📝" },
    { tipo: "imagen", label: "Imagen", icon: "🖼️" },
    { tipo: "video", label: "Video", icon: "🎥" },
    { tipo: "encuesta", label: "Encuesta", icon: "📋" },
    { tipo: "boton", label: "Botón", icon: "🔘" },
    { tipo: "divisor", label: "Divisor", icon: "──" },
    { tipo: "espaciador", label: "Espacio", icon: "⬆️" },
  ];

  return (
    <div className="w-40 bg-white border-r p-4 space-y-2 overflow-y-auto">
      <h3 className="text-xs font-bold text-gray-600 uppercase mb-4">Bloques</h3>
      {bloques.map((bloque) => (
        <button
          key={bloque.tipo}
          onClick={() => onAgregarBloque(bloque.tipo)}
          className="w-full text-left px-3 py-2 rounded-lg border hover:bg-purple-50 hover:border-purple-300 transition-colors text-sm font-bold"
        >
          {bloque.icon} {bloque.label}
        </button>
      ))}
    </div>
  );
}
```

---

### Miércoles/Jueves (6 horas)
**Canvas y Preview**

Ver `MESSAGE_BUILDER_COMPLETO.md` secciones "Canvas.tsx" y "Preview.tsx"

(Son componentes largos, copiar tal cual)

---

### Viernes (2 horas)
**Editors Básicos**

Ver `MESSAGE_BUILDER_COMPLETO.md` sección "TextBlockEditor.tsx"

(Copiar y adaptar para ImageBlockEditor.tsx, PollBlockEditor.tsx)

---

## SEMANA 2: Funcionalidad (Lunes-Viernes)

### Lunes/Martes (4 horas)
**Drag & Drop**

```bash
npm install react-beautiful-dnd
npm install --save-dev @types/react-beautiful-dnd
```

Implementar en Canvas.tsx (ver documento completo).

---

### Martes/Miércoles (4 horas)
**Converters (JSON → WhatsApp)**

```typescript
// lib/message-builder/converters.ts

export function convertBlocksToWhatsApp(bloques: any[]): string {
  let mensaje = "";

  for (const bloque of bloques) {
    if (bloque.tipo === "texto") {
      mensaje += bloque.config.contenido + "\n\n";
    }

    if (bloque.tipo === "encuesta") {
      mensaje += `${bloque.config.pregunta}\n`;
      bloque.config.opciones?.forEach((opt, i) => {
        mensaje += `${i + 1}. ${opt.emoji || "●"} ${opt.texto}\n`;
      });
      mensaje += "\n";
    }

    if (bloque.tipo === "boton") {
      mensaje += `👉 ${bloque.config.texto}\n${bloque.config.valor}\n\n`;
    }

    if (bloque.tipo === "divisor") {
      mensaje += "─".repeat(30) + "\n\n";
    }
  }

  return mensaje.trim();
}

export function convertBlocksToHTML(bloques: any[]): string {
  let html = "<div>";

  for (const bloque of bloques) {
    if (bloque.tipo === "texto") {
      const size = bloque.config.tamaño === "grande" ? "1.5em" : "1em";
      const weight = bloque.config.peso === "bold" ? "bold" : "normal";
      html += `<p style="font-size:${size};font-weight:${weight};color:${bloque.config.color}">${bloque.config.contenido}</p>`;
    }

    if (bloque.tipo === "imagen" && bloque.config.url) {
      html += `<img src="${bloque.config.url}" style="max-width:${bloque.config.ancho}" />`;
    }

    if (bloque.tipo === "encuesta") {
      html += `<div style="background:#f5f5f5;padding:10px;border-radius:5px;">`;
      html += `<strong>${bloque.config.pregunta}</strong><br>`;
      bloque.config.opciones?.forEach((opt) => {
        html += `<label><input type="radio"> ${opt.emoji} ${opt.texto}</label><br>`;
      });
      html += `</div>`;
    }
  }

  html += "</div>";
  return html;
}
```

---

### Miércoles/Jueves (4 horas)
**APIs**

```typescript
// app/api/message-builder/preview/route.ts

import { NextRequest, NextResponse } from "next/server";
import { convertBlocksToWhatsApp } from "@/lib/message-builder/converters";

export async function POST(req: NextRequest) {
  const { bloques } = await req.json();

  const texto = convertBlocksToWhatsApp(bloques);

  return NextResponse.json({ texto });
}
```

```typescript
// app/api/message-builder/plantillas/route.ts

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  const { nombre, categoria, bloques, descripcion } = await req.json();

  const plantilla = await prisma.messageTemplate.create({
    data: {
      nombre,
      categoria,
      bloques,
      descripcion,
      creada_por: "user@example.com", // TODO: obtener del usuario actual
      preview_texto: bloques[0]?.config?.contenido?.substring(0, 100),
    },
  });

  return NextResponse.json({ success: true, plantilla });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");

  const plantillas = await prisma.messageTemplate.findMany({
    where: categoria ? { categoria } : undefined,
    select: { id: true, nombre: true, categoria: true, veces_usada: true },
  });

  return NextResponse.json({ plantillas });
}
```

---

### Viernes (3 horas)
**Plantillas Pre-hechas**

```typescript
// lib/message-builder/templates-default.ts

export const PLANTILLAS_DEFAULT = [
  {
    nombre: "Encuesta de Intención",
    categoria: "encuesta",
    bloques: [
      {
        tipo: "texto",
        config: {
          contenido: "¡Hola {{nombre}}!",
          tamaño: "grande",
          peso: "bold",
        },
      },
      {
        tipo: "texto",
        config: {
          contenido: "Queremos saber tu intención para las próximas elecciones.",
        },
      },
      {
        tipo: "encuesta",
        config: {
          pregunta: "¿Cuál es tu intención?",
          opciones: [
            { id: "1", texto: "Positivo", emoji: "👍" },
            { id: "2", texto: "Indeciso", emoji: "🤔" },
            { id: "3", texto: "Negativo", emoji: "👎" },
          ],
          tipo_encuesta: "single",
        },
      },
    ],
  },
  {
    nombre: "Invitación a Evento",
    categoria: "evento",
    bloques: [
      {
        tipo: "texto",
        config: {
          contenido: "¡Te invitamos!",
          tamaño: "grande",
          peso: "bold",
        },
      },
      {
        tipo: "texto",
        config: {
          contenido: "📅 {{fecha}}\n📍 {{ubicacion}}",
        },
      },
      {
        tipo: "boton",
        config: {
          texto: "Ver más",
          accion: "url",
          color: "#007AFF",
        },
      },
    ],
  },
];
```

---

## SEMANA 3: Polish & Integración (Lunes-Viernes)

### Lunes/Martes (4 horas)
**Testing**

- Crear bloque y verificar en preview
- Editar propiedades
- Drag & drop
- Guardar como plantilla

### Miércoles (2 horas)
**Integración con Paso 2**

Cuando usuario presiona "Continuar", convertir bloques a mensaje de texto.

### Jueves/Viernes (3 horas)
**Optimizaciones**

- Auto-save de borrador cada 30 seg
- Validación de campos requeridos
- Mensajes de error/éxito

---

## CHECKLIST DIARIO

### Día 1
- [ ] Schema Prisma creado y migrado
- [ ] Tipos TypeScript definidos

### Día 2
- [ ] Componente MessageBuilder render
- [ ] BlocksPalette funciona (agrega bloques)

### Día 3
- [ ] Canvas muestra bloques
- [ ] Preview en celular visible

### Día 4
- [ ] Editor de texto funciona
- [ ] Cambios se ven en preview en tiempo real

### Día 5
- [ ] Encuesta funciona
- [ ] Drag & drop OK

### Día 6-8
- [ ] Imagen, Video, Botón OK
- [ ] Conversor a WhatsApp funciona

### Día 9-10
- [ ] Guardar plantilla funciona
- [ ] Cargar plantilla funciona

### Día 11-15
- [ ] Testing completo
- [ ] Integración con flujo actual

---

## PRUEBA RÁPIDA

Una vez implementado, prueba esto:

1. Abre `/mensajes/constructor`
2. Click "+ Texto"
3. Escribe "¡Hola {{nombre}}!"
4. Click "+ Encuesta"
5. Agrega pregunta y 2 opciones
6. Mira preview en celular a la derecha
7. Click "Guardar como Plantilla"
8. Nombre: "Mi Primera Encuesta"
9. Guardar
10. Abre `/mensajes/` → Paso 1 debe mostrar "Usar plantilla"

✅ Si todo funciona, ¡el Message Builder está listo!

---

## PROBLEMAS COMUNES

**"Canvas no actualiza cuando edito bloque"**
→ Asegúrate de que `actualizarBloque` crea un nuevo array: `[...bloques, ...]`

**"Preview no se ve bonito"**
→ Agrega estilos CSS de WhatsApp (fondo teal, burbujas, etc)

**"Drag & drop no funciona"**
→ Asegúrate de importar `Draggable` y `Droppable` correctamente

**"Las imágenes no suben"**
→ Necesitas endpoint `/api/upload` a Supabase

---

## PRÓXIMO PASO

Abre `MESSAGE_BUILDER_COMPLETO.md` y copia los componentes completos.

¿Empezamos mañana?

