# Investigación: modelo jerárquico de atribución (concejal → líder → reunión → votante)

> Documento de estudio, **no de implementación**. Reúne fuentes externas, buenas
> prácticas de plataformas serias y una evaluación honesta de la idea, para
> decidir *antes* de tocar la base de datos. Nada de esto está programado aún.

---

## 1. Qué quieres hacer (tu idea, en una frase)

Que **la planilla** —no la cuenta de un usuario— sea la unidad que registra los
datos. Al escanearla se extraen los contactos y se le asigna **barrio, fecha y
líder** de la reunión. Y como cada **líder cuelga de un candidato al concejo**,
todo ese trabajo (reunión + personas) **se le acredita automáticamente a ese
concejal**. Si el líder no cuelga de nadie, cuenta para el alcalde.

Ejemplo que diste:

```
Candidato al Concejo:  Juan Martínez — Cambio Radical (CR6)
        └── Líder: Julián Alcalá
                 └── Reunión: Barrio Arcabal · fecha · 45 asistentes
                          └── 45 contactos (cédulas)
```

---

## 2. Esto ya existe y tiene nombre: **organización relacional / de campo**

No estás inventando algo raro; estás reconstruyendo el modelo clásico de
**organización de campo** y **organización relacional** (*relational
organizing*), que es la columna vertebral de las campañas modernas.

- **Qué es:** aprovechar las **relaciones personales ya existentes** para
  contactar y movilizar votantes. Un votante al que **le pide el voto alguien
  que conoce** vota más que uno contactado por un desconocido. Esa es,
  literalmente, la lógica de tus "líderes".
- **La jerarquía estándar** de campo es una pirámide igual a la tuya:
  `candidato → director de campo → organizadores → voluntarios/líderes → votantes`.
  Cada nivel tiene metas y responde al de arriba. Tu `concejal → líder →
  reunión → contacto` es exactamente este patrón aplicado a una coalición.

**Conclusión:** tu intuición es correcta y está alineada con cómo se organizan
las campañas que ganan. Vas bien.

---

## 3. Cómo lo modelan las plataformas profesionales (NGP VAN, NationBuilder)

Las herramientas que usan las campañas grandes (NGP VAN / VoteBuilder,
NationBuilder) coinciden en varias decisiones de diseño que conviene copiar:

1. **El votante es la entidad central y única.** Todo cuelga de un registro de
   persona identificado de forma única. En tu caso el identificador natural y
   perfecto es la **cédula** (ya la usas como `@id`). Esto es lo que evita el
   doble conteo (ver §5).
2. **La persona se liga a entidades compartidas:** hogar, territorio
   (*jurisdiction*), listas, **eventos y actividades**. Tu "reunión" es
   justamente una *actividad* ligada a personas.
3. **"Turf" (territorio):** se le entrega a cada voluntario un paquete de
   nombres+direcciones en un mapa. Es tu "barrio de la reunión", pero ellos lo
   llevan a nivel geográfico fino.
4. **Control de acceso por rol (RBAC) + registro de auditoría** sobre datos
   sensibles de votantes. — Tu proyecto **ya hace esto** (permisos por cuenta y
   tabla `Auditoria`). Vas por delante de muchos.
5. **Deduplicación como función de primera clase:** detectar y **fusionar**
   registros repetidos para que nadie aparezca dos veces en listas ni en
   conteos.

**Conclusión:** tu modelo encaja con el de las plataformas serias. Las dos cosas
que ellos tratan como *núcleo* y que a tu idea le conviene reforzar son: **(a)
persona única** y **(b) atribución sin doble conteo**.

---

## 4. La realidad colombiana (y el punto que debes decidir a conciencia)

Aquí está el hallazgo más valioso de la investigación, porque es donde tu
pirámide *estricta* roza con cómo funciona de verdad la política territorial en
Colombia:

- En elecciones territoriales (alcaldía, concejo, asamblea) es **común que un
  mismo líder/operador maneje un "paquete" de candidatos** a la vez, no uno
  solo. Presenta listados con nombres, cédulas y puesto de votación, y esa
  estructura se capitaliza para *varios* cargos.
- La política colombiana se caracteriza por **personalización en el candidato**,
  influencia del **clientelismo** y **falta de una estructura central clara**.

**Qué significa para tu diseño:** tu regla "**un líder pertenece a un solo
concejal**" es más limpia para reportar, pero puede **no reflejar la realidad**
si un líder, en la práctica, mueve gente para dos o tres concejales. Tienes dos
caminos legítimos:

- **Pirámide estricta (1 líder → 1 concejal):** simple, reportes nítidos,
  disciplina la estructura. Riesgo: si la realidad es mixta, "fuerzas" el dato.
- **Atribución por reunión (flexible):** el líder puede existir sin dueño fijo, y
  **es cada reunión la que dice para qué concejal fue**. Más fiel a la realidad
  del "paquete", a costa de un clic más al capturar.

> Mi recomendación (ver §6): **guardar el concejal en la reunión** (no solo
> deducirlo del líder). Te da lo mejor de ambos: normalmente se autocompleta
> desde el líder, pero puedes corregirlo por reunión cuando la realidad no sea
> 1-a-1. Y, clave, **conserva la historia** aunque el líder cambie de bando.

---

## 5. Evaluación honesta: lo bueno y los puntos ciegos

### Lo que está muy bien
- La **jerarquía** es la correcta y estándar.
- Usar la **planilla como unidad de registro** (no la cuenta) es acertado: en la
  práctica quien captura es el equipo, no cada líder con su login.
- Ya tienes **cédula como identificador único**, **permisos** y **auditoría**:
  cimientos que muchas campañas no tienen.

### Puntos ciegos a resolver *antes* de construir

1. **Doble conteo (el más importante).** La misma persona puede ir a dos
   reuniones, o ser "traída" por dos líderes. Si cuentas contactos sumando
   planillas, inflas cifras. **Solución:** la cédula manda. Distingue
   **"personas únicas"** de **"toques/asistencias"**. Tu tabla ya separa
   `nuevos_unicos` vs `repetidos` en `Reunion`: hay que llevar esa misma lógica
   al nivel del **concejal**.

2. **¿A quién se le acredita una persona repetida?** Si Pedro aparece en una
   reunión de un líder de Juan Martínez y luego en otra de un líder de otro
   concejal, ¿de quién es Pedro? Hay que fijar una **regla**: por ejemplo "cuenta
   para quien lo registró primero", o "puede sumar como contacto a varios, pero
   como *voto único* a uno". Decisión de negocio, no técnica.

3. **El líder cambia de concejal con el tiempo.** Si mañana Julián se pasa a otro
   concejal y tú solo guardas "el concejal actual del líder", **se te reescribe
   la historia** de las reuniones viejas. Por eso conviene **congelar el concejal
   en la reunión** al momento de escanearla.

4. **Contactos ≠ votos.** 45 asistentes no son 45 votos. Lo que de verdad
   predice resultado es cruzar con **intención de voto** y **puesto/mesa de
   votación** (campos que ya tienes en `Contacto`). Mide **conversión y
   movilización**, no solo volumen de planillas.

5. **Calidad del dato.** El OCR falla, hay cédulas mal escritas, nombres
   duplicados. Necesitas verificación/normalización para que los reportes por
   concejal no se basen en basura.

6. **Legal — Ley 1581 (habeas data).** La Superintendencia de Industria y
   Comercio (Circular 001 de 2022) fue explícita: **en campaña NO se suspende la
   ley de datos personales**. Recoger cédulas y teléfonos exige **finalidad,
   consentimiento y seguridad**. Tu proyecto ya tiene buena postura de seguridad;
   conviene documentar la **finalidad** y cómo se pide/registra el consentimiento
   en la planilla.

---

## 6. Modelo recomendado (conceptual, sin código)

Entidades y la decisión clave de cada una:

| Entidad | Campos nuevos / clave | Por qué |
|---|---|---|
| **Candidato al Concejo** *(nuevo)* | nombre, partido, número de tarjetón (CR6), estado | El vértice de la pirámide. Catálogo editable desde el panel. |
| **Líder** *(ya existe)* | + `concejal_id` (a quién pertenece por defecto, puede ser nulo = del alcalde) | Autocompleta la atribución, pero no la congela. |
| **Reunión / planilla** *(ya existe)* | + `barrio`, asegurar `fecha` y `lider_id`, **+ `concejal_id` (copiado del líder al escanear, editable)** | **Congela la atribución**: así la historia no se reescribe y permite el caso "paquete". |
| **Contacto** *(ya existe)* | cédula única (ya la tienes) | Evita doble conteo de personas. |

**Reglas de atribución recomendadas:**
- Al escanear, la reunión **hereda el concejal del líder**, pero el capturador
  puede cambiarlo (para el caso real del "paquete").
- **Persona única = cédula.** Los reportes por concejal muestran dos números:
  *contactos únicos* y *asistencias totales*.
- El "trabajo del concejal X" = reuniones + personas **únicas** cuyas reuniones
  tienen `concejal_id = X`.

**Métricas que de verdad importan (no solo volumen):**
- Personas **únicas** por concejal / por líder / por barrio.
- % con **intención de voto positiva**.
- Cobertura por **puesto de votación** (dónde tienes fuerza real).
- **Tasa de repetición** (señal de "relleno" de planillas o de doble conteo).

---

## 7. Decisiones que dependen de ti (para cerrar el diseño)

1. **¿Pirámide estricta (1 líder → 1 concejal) o atribución por reunión
   (flexible)?** → Recomiendo flexible con autocompletado.
2. **Regla para personas repetidas:** ¿se acreditan al primero, o pueden sumar a
   varios como contacto pero a uno como voto?
3. **¿Los concejales se administran desde el panel** (crear/editar/asignar
   líderes) o se cargan una vez?
4. **Consentimiento/finalidad en la planilla:** ¿agregamos una línea de aviso de
   tratamiento de datos en la planilla impresa? (recomendado por Ley 1581).

---

## 8. Diseño confirmado (decisiones ya tomadas por el candidato)

Esto es lo que quedó **decidido** en la conversación. Es la base para construir
cuando se dé la autorización.

1. **Quién usa la plataforma:** únicamente el **equipo del alcalde**. Los líderes
   y los concejales **no tienen cuenta**: son **datos** dentro del sistema. Por
   eso el sistema se alimenta de **planillas de papel**, no de logins.

2. **La planilla de papel es la unidad de registro.** Flujo real:
   `reunión (el alcalde asiste + su equipo toma asistencia en papel)` →
   `fin de la reunión` → `digitalización/OCR en la oficina` →
   `el sistema reparte en los módulos (Contactos, Reuniones, atribución a líder y
   concejal, totales hacia el alcalde)`.

3. **Pirámide estricta confirmada: 1 líder → 1 concejal.** Para la corporación
   *concejo*, un líder le trabaja a **un solo** candidato al concejo. (Lo que ese
   líder tenga para asamblea o gobernación **queda fuera de este sistema**, que es
   la campaña del **alcalde**; todos los líderes de todos los concejales suman
   hacia el alcalde, que es la cúspide.)

4. **El concejal es opcional ("si corresponde").** Una reunión puede no tener
   concejal → en ese caso cuenta **directo para el alcalde**.

5. **La planilla impresa llevará en el PIE DE PÁGINA** dos espacios para
   diligenciar a mano: **Líder: ____** y **Concejal (si aplica): ____**. Así la
   atribución queda anotada en el papel desde la reunión y en la oficina solo se
   **confirma/selecciona** al digitalizar.

6. **La atribución sube en cadena:**
   `contacto (cédula) → reunión → líder → concejal → alcalde`.

### Decisiones resueltas

7. **Personas repetidas:** la persona es **única por cédula**. El sistema
   **guarda todas las apariciones** y **marca/identifica** cuando una misma
   cédula aparece con **dos líderes distintos**, para poder revisarlo. No se
   borra: se señala. *Regla propuesta de atribución* (corregible a mano): la
   persona queda atribuida a la **primera** reunión/líder que la registró, pero
   la repetición queda **marcada** y se puede reasignar.

8. **Asignación líder → concejal: automática y editable.** Como el líder va
   escrito en la planilla, al digitalizar el concejal se deriva **solo**. La
   relación líder↔concejal es **editable desde el panel** únicamente para
   **corregir** casos puntuales.

9. **Aviso de tratamiento de datos (Ley 1581):** **sí va en la planilla
   impresa.** Es el punto donde la persona **autoriza** que la campaña recoja y
   use sus datos. Debe incluir finalidad y responsable del tratamiento.

### Punto técnico aún abierto (decisión de implementación, no de negocio)
- **Congelar el concejal en la reunión** al digitalizar (recomendado en §6),
  para que, si un líder cambia de concejal más adelante, no se reescriba la
  atribución de las reuniones ya registradas.

---

## Fuentes

- [Relational Organizing 101 — ActBlue](https://www.actblue.com/?p=9909)
- [Give your field program a head start on relational organizing — ActBlue](https://www.actblue.com/?p=9979)
- [Relational organizing campaigns — CallHub](https://callhub.io/blog/campaign-organizing/relational-organizing-campaigns/)
- [Field Director (glosario) — Model Diplomat](https://modeldiplomat.com/learn/glossary/field-director)
- [NationBuilder vs NGP VAN — CallHub](https://callhub.io/blog/political-campaign/nationbuilder-vs-ngp-van/)
- [Best CRM for political campaigns — Vottiv](https://guides.vottiv.com/best-crm-for-political-campaigns)
- [Conoce bien tu territorio para ganar elecciones — NAMR](https://namr.com/?p=2079)
- [Los "nequileros": tecnología al servicio de la compra de votos — El Universal](https://www.eluniversal.com.co/politica/2023/10/26/los-nequileros-la-tecnologia-al-servicio-de-la-compra-de-votos/)
- [Tratamiento de datos personales en época electoral — Asuntos Legales](https://www.asuntoslegales.com.co/consultorio/tratamiento-de-datos-personales-en-epoca-electoral-3311619)
- [Merging Duplicate Records — Lib Dems Tech](https://tech.libdems.org.uk/training/connect/toolkit/duplicate-records)
