# Message Builder - Plan Completo de Implementación 🎨

## Visión General

Convertir el Paso 1 (Redacción simple) en un **constructor visual profesional** donde construyes mensajes con:
- ✅ Texto + variables
- ✅ Imágenes
- ✅ Videos
- ✅ Encuestas (polls)
- ✅ Botones/CTA
- ✅ Divisores y espaciadores
- ✅ Todo drag & drop visual
- ✅ Preview en tiempo real (celular)
- ✅ Plantillas pre-hechas

---

## ARQUITECTURA

### 1. Modelo de Datos

```prisma
// prisma/schema.prisma

model MessageTemplate {
  id          Int       @id @default(autoincrement())
  nombre      String    @db.VarChar(120)
  descripcion String?   @db.Text
  categoria   String    @db.VarChar(40) // evento, encuesta, recordatorio, cta
  bloques     Json      // Array de bloques (estructura normalizada)
  preview_texto String? @db.Text // Versión en texto para preview rápido
  imagen_preview String? @db.VarChar(255) // URL de screenshot
  
  creada_por  String
  fecha_creada DateTime @default(now())
  actualizada DateTime @updatedAt
  veces_usada Int      @default(0)
  
  esPublica   Boolean  @default(false) // Para plantillas pre-hechas
  
  @@index([categoria])
  @@index([esPublica])
  @@map("message_templates")
}

// Guardar borradores mientras construyes
model MessageDraft {
  id          Int       @id @default(autoincrement())
  campanaId   Int?      // Relacionado con campaña si aplica
  usuario_id  String
  bloques     Json
  titulo      String?
  media_uploads Json? // {bloque_id: file_url}
  
  guardado_en DateTime @default(now())
  actualizado DateTime @updatedAt
  
  @@index([usuario_id])
  @@map("message_drafts")
}

// Estructura de un Bloque (almacenado en JSON)
/*
{
  "id": "bloque_1_1716387600000",
  "tipo": "texto|imagen|video|encuesta|boton|divisor|espaciador",
  "orden": 1,
  "config": {
    // Común a todos
    "margen_top": 0,
    "margen_bottom": 8,
    
    // Si tipo = "texto"
    "contenido": "¡Hola {{nombre}}!",
    "tamaño": "pequeno|normal|grande",
    "peso": "normal|bold",
    "color": "#000000",
    "alineacion": "left|center|right",
    "variables": ["nombre"] // Para track de qué variables usa
    
    // Si tipo = "imagen"
    "url": "https://...",
    "ancho": "100%|300px",
    "caption": "Descripción",
    "enlace": "https://...",
    
    // Si tipo = "video"
    "url": "https://youtube.com/...",
    "tipo_video": "youtube|vimeo|url",
    "descripcion": "...",
    
    // Si tipo = "encuesta"
    "pregunta": "¿Cómo te sientes?",
    "opciones": [
      { "id": "opt_1", "texto": "Muy bien", "emoji": "😊" },
      { "id": "opt_2", "texto": "Bien", "emoji": "🙂" },
      { "id": "opt_3", "texto": "Neutral", "emoji": "😐" }
    ],
    "tipo_encuesta": "single|multiple",
    "permitir_otro": true,
    
    // Si tipo = "boton"
    "texto": "Ver evento",
    "accion": "url|llamada|whatsapp|formulario",
    "valor": "https://...",
    "color": "#007AFF",
    "ancho": "100%|auto",
    
    // Si tipo = "divisor"
    "color": "#EEEEEE",
    "espesor": "1px|2px|3px",
    
    // Si tipo = "espaciador"
    "altura": "16px|24px|32px"
  }
}
*/
```

---

## ESTRUCTURA DE CARPETAS

```
lib/
  ├─ message-builder/
  │  ├─ schemas.ts          # Zod schemas para validación
  │  ├─ types.ts            # TypeScript types
  │  ├─ converters.ts       # JSON → WhatsApp format
  │  ├─ validators.ts       # Validar bloques
  │  ├─ templates-default.ts # Plantillas pre-hechas
  │  └─ utils.ts            # Helpers (generar ID único, etc)
  │
  └─ storage/
     └─ file-upload.ts      # Subir a Supabase

app/api/
  ├─ message-builder/
  │  ├─ bloques/route.ts           # CRUD individual de bloques
  │  ├─ preview/route.ts           # Convertir JSON a texto/HTML
  │  ├─ plantillas/route.ts        # CRUD plantillas
  │  └─ plantillas-default/route.ts # GET plantillas pre-hechas
  │
  └─ drafts/
     └─ route.ts            # Guardar/cargar borradores

app/(dashboard)/
  ├─ mensajes/
  │  ├─ constructor/
  │  │  └─ page.tsx         # Página principal del builder
  │  │
  │  └─ components/
  │     ├─ MessageBuilder.tsx           # Componente raíz
  │     ├─ BlocksPalette.tsx           # Panel izquierdo (bloques disponibles)
  │     ├─ Canvas.tsx                  # Centro (editor visual)
  │     ├─ Preview.tsx                 # Derecha (vista previa celular)
  │     │
  │     ├─ BlockEditor/
  │     │  ├─ BlockEditorPanel.tsx     # Panel propiedades
  │     │  ├─ TextBlockEditor.tsx
  │     │  ├─ ImageBlockEditor.tsx
  │     │  ├─ VideoBlockEditor.tsx
  │     │  ├─ PollBlockEditor.tsx
  │     │  ├─ ButtonBlockEditor.tsx
  │     │  ├─ DividerBlockEditor.tsx
  │     │  └─ SpacerBlockEditor.tsx
  │     │
  │     ├─ Blocks/
  │     │  ├─ TextBlock.tsx
  │     │  ├─ ImageBlock.tsx
  │     │  ├─ VideoBlock.tsx
  │     │  ├─ PollBlock.tsx
  │     │  ├─ ButtonBlock.tsx
  │     │  ├─ DividerBlock.tsx
  │     │  └─ SpacerBlock.tsx
  │     │
  │     └─ hooks/
  │        ├─ useMessageBuilder.ts    # Estado global
  │        ├─ useBlockEditor.ts       # Editar bloque
  │        └─ usePreview.ts           # Actualizar preview
  │
  └─ templates/
     └─ page.tsx            # Gestor de plantillas
```

---

## COMPONENTES PRINCIPALES

### 1. **MessageBuilder.tsx** (Contenedor)

```typescript
"use client";

import { useState, useCallback } from "react";
import BlocksPalette from "./BlocksPalette";
import Canvas from "./Canvas";
import Preview from "./Preview";
import BlockEditorPanel from "./BlockEditor/BlockEditorPanel";
import SaveTemplate from "./SaveTemplate";

export default function MessageBuilder() {
  const [bloques, setBloques] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const agregarBloque = useCallback((tipo: string) => {
    const nuevoBloque = {
      id: `bloque_${Date.now()}`,
      tipo,
      orden: bloques.length,
      config: getConfigDefault(tipo),
    };
    setBloques([...bloques, nuevoBloque]);
    setSelectedBlockId(nuevoBloque.id);
    setIsDirty(true);
  }, [bloques]);

  const actualizarBloque = useCallback((id: string, config: any) => {
    setBloques(bloques.map(b => 
      b.id === id ? { ...b, config } : b
    ));
    setIsDirty(true);
  }, [bloques]);

  const eliminarBloque = useCallback((id: string) => {
    setBloques(bloques.filter(b => b.id !== id));
    setSelectedBlockId(null);
    setIsDirty(true);
  }, [bloques]);

  const moverBloque = useCallback((id: string, direccion: 'up' | 'down') => {
    const index = bloques.findIndex(b => b.id === id);
    if ((direccion === 'up' && index === 0) || 
        (direccion === 'down' && index === bloques.length - 1)) return;

    const nuevoBloques = [...bloques];
    if (direccion === 'up') {
      [nuevoBloques[index], nuevoBloques[index - 1]] = 
      [nuevoBloques[index - 1], nuevoBloques[index]];
    } else {
      [nuevoBloques[index], nuevoBloques[index + 1]] = 
      [nuevoBloques[index + 1], nuevoBloques[index]];
    }
    setBloques(nuevoBloques);
    setIsDirty(true);
  }, [bloques]);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Constructor de Mensaje</h1>
        <div className="flex gap-3">
          <button
            onClick={() => setShowSaveTemplate(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700"
          >
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
        {/* Left: Palette */}
        <BlocksPalette onAgregarBloque={agregarBloque} />

        {/* Center: Canvas */}
        <Canvas
          bloques={bloques}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onDeleteBlock={eliminarBloque}
          onMoveBlock={moverBloque}
        />

        {/* Right: Preview + Properties */}
        <div className="w-80 bg-white border-l flex flex-col">
          <Preview bloques={bloques} />
          
          {selectedBlockId && (
            <BlockEditorPanel
              bloque={bloques.find(b => b.id === selectedBlockId)!}
              onActualizar={(config) => actualizarBloque(selectedBlockId, config)}
            />
          )}
        </div>
      </div>

      {/* Modal: Guardar Plantilla */}
      {showSaveTemplate && (
        <SaveTemplate
          bloques={bloques}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
    </div>
  );
}
```

---

### 2. **Canvas.tsx** (Editor Visual)

```typescript
"use client";

import { Draggable, Droppable } from "react-beautiful-dnd";
import TextBlock from "./Blocks/TextBlock";
import ImageBlock from "./Blocks/ImageBlock";
import PollBlock from "./Blocks/PollBlock";
import ButtonBlock from "./Blocks/ButtonBlock";

const BLOCK_COMPONENTS = {
  texto: TextBlock,
  imagen: ImageBlock,
  video: VideoBlock,
  encuesta: PollBlock,
  boton: ButtonBlock,
  divisor: DividerBlock,
  espaciador: SpacerBlock,
};

export default function Canvas({
  bloques,
  selectedBlockId,
  onSelectBlock,
  onDeleteBlock,
  onMoveBlock,
}) {
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6 space-y-3">
        {bloques.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-lg font-bold">Comienza agregando un bloque</p>
            <p className="text-sm">Arrastra desde la izquierda o haz clic en "+"</p>
          </div>
        ) : (
          bloques.map((bloque, index) => {
            const BlockComponent = BLOCK_COMPONENTS[bloque.tipo];
            const isSelected = bloque.id === selectedBlockId;

            return (
              <Draggable key={bloque.id} draggableId={bloque.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    onClick={() => onSelectBlock(bloque.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-purple-500 bg-purple-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    } ${snapshot.isDragging ? "shadow-lg" : ""}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase">
                        {bloque.tipo}
                      </span>
                      {isSelected && (
                        <div className="flex gap-1">
                          {index > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveBlock(bloque.id, "up");
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              ↑
                            </button>
                          )}
                          {index < bloques.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onMoveBlock(bloque.id, "down");
                              }}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              ↓
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteBlock(bloque.id);
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    <BlockComponent config={bloque.config} />
                  </div>
                )}
              </Draggable>
            );
          })
        )}
      </div>
    </div>
  );
}
```

---

### 3. **Preview.tsx** (Celular)

```typescript
"use client";

export default function Preview({ bloques }) {
  return (
    <div className="border-b p-4">
      <h3 className="text-sm font-bold mb-3">Vista Previa (WhatsApp)</h3>
      
      {/* Simulación de celular */}
      <div className="w-full mx-auto bg-gray-900 rounded-3xl p-3 shadow-xl">
        {/* Notch */}
        <div className="bg-black rounded-b-2xl h-6 mx-auto w-32 mb-1"></div>
        
        {/* Pantalla */}
        <div className="bg-white rounded-2xl p-4 h-80 overflow-y-auto text-sm">
          {/* WhatsApp Header */}
          <div className="bg-teal-700 text-white px-3 py-2 rounded-lg mb-3">
            <p className="text-xs font-bold">Ciudadano</p>
            <p className="text-xs opacity-75">en línea</p>
          </div>

          {/* Mensaje Preview */}
          <div className="space-y-2">
            {bloques.length === 0 ? (
              <p className="text-center text-gray-400 py-8">Sin contenido</p>
            ) : (
              bloques.map((bloque) => (
                <PreviewBloque key={bloque.id} bloque={bloque} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBloque({ bloque }) {
  const { tipo, config } = bloque;

  if (tipo === "texto") {
    const tamano = {
      pequeno: "text-xs",
      normal: "text-sm",
      grande: "text-base",
    }[config.tamaño || "normal"];

    const peso = config.peso === "bold" ? "font-bold" : "font-normal";

    return (
      <div
        className={`${tamano} ${peso} text-gray-800`}
        style={{ color: config.color || "#000" }}
      >
        {config.contenido}
      </div>
    );
  }

  if (tipo === "imagen") {
    return (
      <div className="bg-gray-200 rounded-lg h-24 flex items-center justify-center overflow-hidden">
        {config.url ? (
          <img
            src={config.url}
            alt="preview"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-gray-400 text-xs">Imagen</span>
        )}
      </div>
    );
  }

  if (tipo === "encuesta") {
    return (
      <div className="bg-gray-50 p-3 rounded-lg">
        <p className="text-xs font-bold mb-2">{config.pregunta}</p>
        <div className="space-y-1">
          {config.opciones.map((opt, i) => (
            <div
              key={opt.id}
              className="flex items-center gap-2 text-xs p-2 bg-white rounded border"
            >
              <span>{opt.emoji || "●"}</span>
              <span>{opt.texto}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tipo === "boton") {
    return (
      <div
        className="px-4 py-2 rounded-lg text-white text-center text-xs font-bold"
        style={{ backgroundColor: config.color || "#007AFF" }}
      >
        {config.texto}
      </div>
    );
  }

  if (tipo === "divisor") {
    return (
      <div
        style={{
          height: config.espesor || "1px",
          backgroundColor: config.color || "#EEEEEE",
        }}
      />
    );
  }

  if (tipo === "espaciador") {
    return (
      <div
        style={{
          height: config.altura === "pequeno" ? "8px" : config.altura === "grande" ? "32px" : "16px",
        }}
      />
    );
  }

  return null;
}
```

---

### 4. **TextBlockEditor.tsx** (Panel de Edición)

```typescript
"use client";

export default function TextBlockEditor({ config, onActualizar }) {
  return (
    <div className="space-y-4 p-4 border-t">
      <div>
        <label className="block text-xs font-bold mb-2">Contenido</label>
        <textarea
          value={config.contenido || ""}
          onChange={(e) => onActualizar({ ...config, contenido: e.target.value })}
          placeholder="Escribe tu texto. Usa {{nombre}} para variables"
          className="w-full border rounded p-2 text-sm h-24 resize-none"
        />
        <p className="text-xs text-gray-500 mt-1">
          Variables disponibles: {{"{nombre}"}} {{"{evento}"}} {{"{fecha}"}}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold mb-1">Tamaño</label>
          <select
            value={config.tamaño || "normal"}
            onChange={(e) => onActualizar({ ...config, tamaño: e.target.value })}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="pequeno">Pequeño</option>
            <option value="normal">Normal</option>
            <option value="grande">Grande</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold mb-1">Peso</label>
          <select
            value={config.peso || "normal"}
            onChange={(e) => onActualizar({ ...config, peso: e.target.value })}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="normal">Normal</option>
            <option value="bold">Bold</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Color</label>
        <input
          type="color"
          value={config.color || "#000000"}
          onChange={(e) => onActualizar({ ...config, color: e.target.value })}
          className="w-full h-10 rounded cursor-pointer"
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Alineación</label>
        <div className="flex gap-2">
          {["left", "center", "right"].map((align) => (
            <button
              key={align}
              onClick={() => onActualizar({ ...config, alineacion: align })}
              className={`flex-1 py-1 rounded text-xs font-bold ${
                config.alineacion === align
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {align === "left" ? "⬅️" : align === "center" ? "⬆️⬇️" : "➡️"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

### 5. **PollBlockEditor.tsx** (Panel Encuestas)

```typescript
"use client";

import { useState } from "react";

export default function PollBlockEditor({ config, onActualizar }) {
  const [newOptionText, setNewOptionText] = useState("");

  const agregarOpcion = () => {
    if (!newOptionText.trim()) return;
    
    const newOption = {
      id: `opt_${Date.now()}`,
      texto: newOptionText,
      emoji: "●",
    };

    onActualizar({
      ...config,
      opciones: [...(config.opciones || []), newOption],
    });
    setNewOptionText("");
  };

  const eliminarOpcion = (id) => {
    onActualizar({
      ...config,
      opciones: config.opciones.filter((o) => o.id !== id),
    });
  };

  return (
    <div className="space-y-4 p-4 border-t">
      <div>
        <label className="block text-xs font-bold mb-2">Pregunta</label>
        <input
          type="text"
          value={config.pregunta || ""}
          onChange={(e) => onActualizar({ ...config, pregunta: e.target.value })}
          placeholder="¿Cuál es tu pregunta?"
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-2">Opciones</label>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {config.opciones?.map((opt, i) => (
            <div key={opt.id} className="flex gap-2 items-center">
              <input
                type="text"
                value={opt.emoji}
                onChange={(e) => {
                  const nuevas = [...config.opciones];
                  nuevas[i].emoji = e.target.value;
                  onActualizar({ ...config, opciones: nuevas });
                }}
                maxLength="2"
                className="w-10 border rounded px-2 py-1 text-sm text-center"
              />
              <input
                type="text"
                value={opt.texto}
                onChange={(e) => {
                  const nuevas = [...config.opciones];
                  nuevas[i].texto = e.target.value;
                  onActualizar({ ...config, opciones: nuevas });
                }}
                className="flex-1 border rounded px-2 py-1 text-sm"
              />
              <button
                onClick={() => eliminarOpcion(opt.id)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newOptionText}
            onChange={(e) => setNewOptionText(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && agregarOpcion()}
            placeholder="Nueva opción"
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={agregarOpcion}
            className="bg-purple-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-purple-700"
          >
            + Opción
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-2">Tipo</label>
        <select
          value={config.tipo_encuesta || "single"}
          onChange={(e) => onActualizar({ ...config, tipo_encuesta: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          <option value="single">Una única respuesta</option>
          <option value="multiple">Múltiples respuestas</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={config.permitir_otro || false}
          onChange={(e) => onActualizar({ ...config, permitir_otro: e.target.checked })}
          className="rounded"
        />
        <span>Permitir "Otro" personalizado</span>
      </label>
    </div>
  );
}
```

---

### 6. **ImageBlockEditor.tsx**

```typescript
"use client";

import { useRef } from "react";

export default function ImageBlockEditor({ config, onActualizar }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    // Subir a Supabase
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const { url } = await response.json();
    onActualizar({ ...config, url });
  };

  return (
    <div className="space-y-4 p-4 border-t">
      <div>
        <label className="block text-xs font-bold mb-2">Imagen</label>

        {config.url ? (
          <div className="mb-3">
            <img
              src={config.url}
              alt="preview"
              className="w-full h-32 object-cover rounded"
            />
            <button
              onClick={() => onActualizar({ ...config, url: "" })}
              className="text-red-500 text-xs mt-2"
            >
              Eliminar imagen
            </button>
          </div>
        ) : null}

        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-purple-300 rounded-lg p-4 text-center text-sm font-bold text-purple-600 hover:bg-purple-50"
        >
          📤 Subir imagen
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          className="hidden"
        />

        <p className="text-xs text-gray-500 mt-2">
          O pega URL: 
          <input
            type="url"
            placeholder="https://..."
            className="w-full border rounded px-2 py-1 mt-1 text-xs"
            onChange={(e) => onActualizar({ ...config, url: e.target.value })}
          />
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Ancho</label>
        <select
          value={config.ancho || "100%"}
          onChange={(e) => onActualizar({ ...config, ancho: e.target.value })}
          className="w-full border rounded px-2 py-1 text-sm"
        >
          <option value="100%">Completo (100%)</option>
          <option value="75%">75%</option>
          <option value="50%">50%</option>
          <option value="300px">300px</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold mb-2">Descripción/Caption</label>
        <textarea
          value={config.caption || ""}
          onChange={(e) => onActualizar({ ...config, caption: e.target.value })}
          placeholder="Texto debajo de la imagen"
          className="w-full border rounded p-2 text-sm h-16 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold mb-2">Enlace (opcional)</label>
        <input
          type="url"
          value={config.enlace || ""}
          onChange={(e) => onActualizar({ ...config, enlace: e.target.value })}
          placeholder="https://ejemplo.com"
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </div>
    </div>
  );
}
```

---

## API ENDPOINTS

### 1. **POST /api/message-builder/preview**
Convierte bloques JSON a texto/HTML para preview

```typescript
// Request
{
  "bloques": [
    { "tipo": "texto", "config": { "contenido": "¡Hola!" } },
    { "tipo": "encuesta", "config": { "pregunta": "¿Cómo vas?" } }
  ]
}

// Response
{
  "texto": "¡Hola!\n\n¿Cómo vas?\n1. Bien\n2. Mal",
  "html": "<p>¡Hola!</p><div>¿Cómo vas?...</div>"
}
```

### 2. **POST /api/message-builder/plantillas**
Guardar plantilla

```typescript
{
  "nombre": "Encuesta de Intención",
  "categoria": "encuesta",
  "bloques": [...],
  "descripcion": "Pregunta qué intención de voto tienen"
}
```

### 3. **GET /api/message-builder/plantillas**
Obtener todas las plantillas

```typescript
// Response
{
  "plantillas": [
    {
      "id": 1,
      "nombre": "Invitación a Evento",
      "categoria": "evento",
      "veces_usada": 5,
      "esPublica": true
    }
  ]
}
```

### 4. **GET /api/message-builder/plantillas-default**
Plantillas pre-hechas

```typescript
// Response
{
  "plantillas": [
    {
      "id": "default_1",
      "nombre": "Encuesta de Intención",
      "bloques": [...]
    },
    {
      "id": "default_2",
      "nombre": "Invitación a Evento",
      "bloques": [...]
    }
  ]
}
```

---

## PLANTILLAS PRE-HECHAS (Ejemplos)

### Plantilla 1: "Encuesta de Intención"
```json
{
  "nombre": "Encuesta de Intención",
  "bloques": [
    {
      "tipo": "texto",
      "config": {
        "contenido": "¡Hola {{nombre}}!",
        "tamaño": "grande",
        "peso": "bold"
      }
    },
    {
      "tipo": "texto",
      "config": {
        "contenido": "Queremos saber tu intención de voto para las próximas elecciones."
      }
    },
    {
      "tipo": "encuesta",
      "config": {
        "pregunta": "¿Cuál es tu intención?",
        "opciones": [
          { "id": "1", "texto": "Positivo", "emoji": "👍" },
          { "id": "2", "texto": "Indeciso", "emoji": "🤔" },
          { "id": "3", "texto": "Negativo", "emoji": "👎" }
        ],
        "tipo_encuesta": "single"
      }
    }
  ]
}
```

### Plantilla 2: "Invitación a Evento"
```json
{
  "nombre": "Invitación a Evento",
  "bloques": [
    {
      "tipo": "texto",
      "config": {
        "contenido": "¡Te invitamos al evento!",
        "tamaño": "grande",
        "peso": "bold",
        "color": "#FF6B6B"
      }
    },
    {
      "tipo": "imagen",
      "config": {
        "url": "https://...",
        "ancho": "100%",
        "caption": "Mitin en la Plaza Principal"
      }
    },
    {
      "tipo": "texto",
      "config": {
        "contenido": "📅 Sábado 15 de Junio\n🕒 3:00 PM\n📍 Plaza Principal"
      }
    },
    {
      "tipo": "boton",
      "config": {
        "texto": "¿Irás?",
        "accion": "url",
        "valor": "https://tuapp.com/rsvp",
        "color": "#007AFF"
      }
    }
  ]
}
```

### Plantilla 3: "Recordatorio de Votación"
```json
{
  "nombre": "Recordatorio de Votación",
  "bloques": [
    {
      "tipo": "texto",
      "config": {
        "contenido": "¡Recuerda votar mañana!",
        "tamaño": "grande",
        "peso": "bold"
      }
    },
    {
      "tipo": "texto",
      "config": {
        "contenido": "Tu puesto es: {{puesto_votacion}}\nMesa: {{mesa_numero}}"
      }
    },
    {
      "tipo": "divisor",
      "config": { "color": "#EEEEEE" }
    },
    {
      "tipo": "texto",
      "config": {
        "contenido": "Si tienes dudas, llámanos al {{telefono_soporte}}"
      }
    },
    {
      "tipo": "boton",
      "config": {
        "texto": "Ver dirección del puesto",
        "accion": "url",
        "valor": "https://maps.google.com",
        "color": "#4CAF50"
      }
    }
  ]
}
```

---

## FLUJO DE INTEGRACIÓN CON CAMPAÑA

```
1. Usuario entra a "Nuevo Mensaje"
   ↓
2. Elige: "Crear desde cero" vs "Usar plantilla"
   ↓
3. Abre Message Builder
   ↓
4. Construye mensaje (arrastra bloques, configura)
   ↓
5. Presiona "Continuar a Audiencia" (Paso 2)
   ↓
6. Bloques se convierten a formato WhatsApp
   ↓
7. Se envían como mensaje masivo
```

---

## CONVERSIÓN A WHATSAPP (Converters)

```typescript
// lib/message-builder/converters.ts

export function convertBlocksToWhatsApp(bloques: any[]): string {
  let mensaje = "";

  for (const bloque of bloques) {
    if (bloque.tipo === "texto") {
      mensaje += bloque.config.contenido + "\n\n";
    }
    
    if (bloque.tipo === "imagen") {
      // Si WhatsApp soporta, agregar URL
      if (bloque.config.caption) {
        mensaje += bloque.config.caption + "\n\n";
      }
    }
    
    if (bloque.tipo === "encuesta") {
      mensaje += `${bloque.config.pregunta}\n`;
      bloque.config.opciones.forEach((opt, i) => {
        mensaje += `${i + 1}. ${opt.emoji} ${opt.texto}\n`;
      });
      mensaje += "\n";
    }
    
    if (bloque.tipo === "boton") {
      mensaje += `${bloque.config.texto}: ${bloque.config.valor}\n\n`;
    }
    
    if (bloque.tipo === "divisor") {
      mensaje += "─".repeat(30) + "\n\n";
    }
  }

  return mensaje.trim();
}
```

---

## TIMELINE ESTIMADO

```
Semana 1:
  Día 1-2: Schema + Tipos TypeScript (3h)
  Día 2-3: Componentes base (Canvas, Preview, BlocksPalette) (6h)
  Día 3-4: Editores de bloques (TextBlock, ImageBlock, PollBlock) (6h)
  
Semana 2:
  Día 1-2: Editores restantes (VideoBlock, ButtonBlock) (4h)
  Día 2-3: Funcionalidad drag & drop (3h)
  Día 3-4: Converters + API endpoints (4h)
  
Semana 3:
  Día 1: Plantillas pre-hechas (2h)
  Día 1-2: Guardar/cargar plantillas (3h)
  Día 2-3: Testing + optimizaciones (4h)
  Día 4: Integración con Paso 1 actual (2h)

TOTAL: ~37 horas
```

---

## ARCHIVOS A CREAR/MODIFICAR

### CREAR
```
lib/message-builder/
  ├─ schemas.ts
  ├─ types.ts
  ├─ converters.ts
  ├─ validators.ts
  ├─ templates-default.ts
  └─ utils.ts

app/api/message-builder/
  ├─ preview/route.ts
  ├─ plantillas/route.ts
  └─ plantillas-default/route.ts

app/(dashboard)/mensajes/
  ├─ constructor/page.tsx
  └─ components/
     ├─ MessageBuilder.tsx
     ├─ BlocksPalette.tsx
     ├─ Canvas.tsx
     ├─ Preview.tsx
     ├─ SaveTemplate.tsx
     ├─ BlockEditor/
     │  ├─ BlockEditorPanel.tsx
     │  ├─ TextBlockEditor.tsx
     │  ├─ ImageBlockEditor.tsx
     │  ├─ VideoBlockEditor.tsx
     │  ├─ PollBlockEditor.tsx
     │  ├─ ButtonBlockEditor.tsx
     │  └─ DividerBlockEditor.tsx
     ├─ Blocks/
     │  ├─ TextBlock.tsx
     │  ├─ ImageBlock.tsx
     │  ├─ VideoBlock.tsx
     │  ├─ PollBlock.tsx
     │  ├─ ButtonBlock.tsx
     │  ├─ DividerBlock.tsx
     │  └─ SpacerBlock.tsx
     └─ hooks/
        ├─ useMessageBuilder.ts
        └─ usePreview.ts
```

### MODIFICAR
```
prisma/schema.prisma
  → Agregar MessageTemplate
  → Agregar MessageDraft

app/(dashboard)/mensajes/page.tsx
  → Paso 1 ahora abre /mensajes/constructor en modal
```

---

## LIBRERÍAS NECESARIAS

```json
{
  "dependencies": {
    "react-beautiful-dnd": "^13.1.1",
    "react-color": "^2.19.3",
    "zustand": "^4.4.0"
  }
}
```

---

## PROXIMOS PASOS

1. ✅ Crear schema en Prisma
2. ✅ Crear tipos TypeScript
3. ✅ Implementar componentes base
4. ✅ Testear cada bloque
5. ✅ Integrar con Paso 2 (Audiencia)
6. ✅ Conversor a WhatsApp
7. ✅ Plantillas pre-hechas
8. ✅ Testing E2E

¿Empezamos?

