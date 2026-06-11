# Plan: Calificaciones de Workers + Reportes (Cliente/Worker) en Admin y App

> Objetivo: (1) revisar y reforzar el sistema de calificaciones de workers, (2) que los reportes
> de workers y clientes se vean en el admin dentro del detalle de cada usuario (quién reportó,
> a quién, por qué), y (3) que en la app el botón de reportar exista en el punto exacto del
> estado de la solicitud — durante el trabajo en progreso y al terminar — para cliente y worker.
>
> Regla general: **todo es aditivo**. No se cambia ninguna firma, endpoint, tabla ni flujo
> existente; solo se agregan columnas/endpoints/botones nuevos.

---

## 0. Lo que YA existe (no tocar, solo reusar)

### Backend (`backend-chamba`, NestJS)
| Pieza | Dónde | Estado |
|---|---|---|
| Calificaciones | tabla `worker_reviews` + `POST /mobile/reviews` (`createReview`, `mobile.service.ts:2752`) | Funciona: guarda stars/comment y recalcula `users.average_rating` |
| Reportes/Disputas | tabla `disputes` + `dispute_messages`, `POST /mobile/disputes`, chat y resolve (`mobile.service.ts:4467+`) | Funciona: guarda `reported_by`, `reported_user`, `reason`, `description`, estado open/resolved |
| Reporte de solicitud (worker en radar) | tabla `request_reports` + `POST /mobile/requests/:id/report` | Funciona (es otro tipo de reporte: solicitud inapropiada) |
| Tracking | `GET /mobile/tracking` ya devuelve `client.id` y `worker.id` | Clave: ambos lados pueden saber a quién reportar sin cambios |

### Admin (`admin-chamba`, React)
- `workers-page.tsx`: ficha de worker con stats, "Ver Trabajos", "Mapa", **"Ver Reseñas"** (modal con stars + comentario + nombre del cliente).
- `disputes-page.tsx`: lista global de disputas con chat de soporte y resolución. **No está enlazada al detalle del usuario.**
- `clients-page.tsx`: solo tabla con editar/bloquear/eliminar. **No tiene ficha de detalle.**

### App (`app-chamba`, Flutter)
- **Cliente en progreso** (`tracking_screen.dart:821`): ya tiene botón `Reportar problema` → `SupportScreen(requestId, reportedUserId: worker.id)` → crea disputa + chat de soporte. ✅
- **Worker en progreso** (`job_in_progress_screen.dart`): solo tiene "Cancelar trabajo". ❌ **No puede reportar.**
- **Cliente al terminar**: evento `job.completed` → `AppFlows.goToRating()` → `RatingScreen` (califica o "Omitir"). ❌ **No puede reportar desde ahí.**
- **Worker al terminar** (`job_in_progress_screen.dart:107` y `:317`): diálogo "¡Trabajo completado!" → Aceptar → home. ❌ **No puede reportar desde ahí.** Además limpia `SessionStore.activeRequestId` ANTES del diálogo (importante para el fix).
- `SupportScreen` (`support_screen.dart`): pantalla de razones + chat de disputa, ya con estilo de la app (GlassCard, AppTheme). **Se reusa tal cual para todo.**

---

## FASE 1 — Revisión/refuerzo de calificaciones de workers (backend)

Archivo: `backend-chamba/src/modules/mobile/mobile.service.ts` (`createReview`, línea ~2752)

1. **Evitar calificación duplicada del mismo trabajo**
   - Hoy un cliente puede calificar el mismo `request_id` N veces (no hay UNIQUE).
   - En `ensureSchema()` agregar: `CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_reviews_request ON worker_reviews(request_id);`
   - En `createReview`: usar `ON CONFLICT (request_id) DO NOTHING` y devolver `{ saved: false, alreadyReviewed: true }` si ya existía (la app hoy ignora el detalle del response, no rompe nada).

2. **Validar que la calificación es legítima**
   - Verificar que el request esté en estado `completed`.
   - Verificar que `clientUserId` sea el `client_user_id` del request y que el worker calificado sea el de la oferta aceptada. Hoy no se valida nada de esto.

3. **Bug a corregir: `completed_jobs` se pisa con el conteo de reseñas**
   - `createReview` hace `SET completed_jobs = COUNT(worker_reviews)`. Si un cliente omite calificar, el contador queda menor que los trabajos reales (y la ficha admin/los listados usan ese campo).
   - Fix: calcular `completed_jobs` desde `job_requests` completados del worker (join con oferta aceptada), no desde las reseñas. Solo se cambia el SELECT interno; el response no cambia.

4. **Exponer reseñas para admin de forma estable (opcional pero recomendado)**
   - El admin hoy usa `GET /mobile/workers/:id/profile` y toma `data.reviews`. Funciona; dejarlo.
   - Si se quiere paginación/fechas: nuevo `GET /mobile/admin/workers/:workerId/reviews` (no rompe lo existente).

**Resultado de fase:** las calificaciones quedan confiables (1 por trabajo, solo de trabajos completados reales) sin tocar la app.

---

## FASE 2 — Backend: reportes por usuario (para fichas del admin)

Archivo: `mobile.controller.ts` + `mobile.service.ts`

1. **Nuevo endpoint** `GET /mobile/admin/users/:userId/disputes`
   - Devuelve `{ made: [...], received: [...] }`:
     - `made`: disputas donde `reported_by = userId` (reportes que ÉL hizo).
     - `received`: disputas donde `reported_user = userId` (reportes EN SU CONTRA).
   - Cada item con el mismo shape que `listDisputes` (id, reason, description, status, resolution, createdAt, `reporterName`/`reporterType`, `reportedName`/`reportedType`, `requestTitle`). Reusar el SQL de `listDisputes` agregando el filtro; no modificar `listDisputes` existente.

2. **(Opcional, mismo endpoint)** incluir también los `request_reports` que el usuario hizo
   (`reporter_user_id = userId`) bajo una clave `requestReports`, para que la ficha muestre
   absolutamente todo lo que reportó.

3. **Sin migraciones**: las tablas `disputes` ya tienen todo (`reported_by`, `reported_user`).
   `ensureSchema()` es idempotente; solo se agrega el índice de la Fase 1.

---

## FASE 3 — Admin: ver reportes y calificación en detalle de worker y de cliente

### 3.1 `admin-chamba/src/lib/admin-api.ts`
- Agregar `fetchUserDisputes(userId): Promise<{ made: Dispute[]; received: Dispute[] }>` → llama al endpoint nuevo.
- (Tipos en `lib/types.ts`: reusar el type `Dispute` existente.)

### 3.2 Ficha de worker (`workers-page.tsx`)
- **Stats**: agregar una 4.ª tarjeta con `averageRating` (estrella ámbar, mismo estilo glass de las tarjetas Trabajos/Dinero/Cuenta) — hoy el promedio no se ve en la ficha.
- **Botones de acción**: agregar un 4.º botón "Ver Reportes" (gradiente rojo/rose, icono `Flag` o `AlertTriangle`, mismo patrón que "Ver Reseñas").
- **Nuevo modal "Reportes"** (mismo patrón del modal de reseñas):
  - Dos pestañas o dos secciones: **"Recibidos (en su contra)"** y **"Hechos por él"**.
  - Cada tarjeta muestra: razón, descripción, estado (Abierto/Resuelto con los mismos badges de `disputes-page`), fecha, y **quién lo hizo / contra quién** ("Reportado por Juan Pérez (cliente)" / "Reportó a María (cliente)"), título de la solicitud si existe.
  - Botón "Abrir chat" que abre el componente `DisputeChat` ya existente (exportarlo desde `disputes-page.tsx` o moverlo a `components/` — mover es seguro, solo lo importa esa página).
  - Badge con contador de reportes abiertos en el botón "Ver Reportes" para que el admin lo note de un vistazo.

### 3.3 Ficha de cliente (`clients-page.tsx`) — **nueva**
- Hoy no existe detalle de cliente. Crear un modal de ficha siguiendo exactamente el patrón de la ficha de worker (header con avatar/nombre/email, stats básicos: solicitudes creadas si están disponibles, fecha de cuenta), y dentro:
  - Sección **Reportes** idéntica a la del worker (recibidos / hechos), reusando el mismo componente.
  - Hacer clickeable el nombre del cliente en la tabla (igual que en workers).
- Recomendación: extraer el modal de reportes a un componente compartido `user-reports-modal.tsx` para usarlo en ambas páginas sin duplicar.

---

## FASE 4 — App Flutter: botón de reportar en el punto exacto del estado

Principio: **reusar `SupportScreen` siempre** (ya crea la disputa con `requestId` + `reportedUserId` y abre el chat). Solo se agregan puntos de entrada. Estilo: mismo `TextButton.icon` con `Icons.flag_outlined` y `AppTheme.colorMuted` que ya usa el cliente en tracking.

### 4.1 Worker — trabajo en progreso (`job_in_progress_screen.dart`)
- En la fila inferior (donde está "Cancelar trabajo", línea ~957): convertirla en `Row` con
  `mainAxisAlignment: spaceBetween` (igual que hace `tracking_screen.dart:808`) y agregar:
  ```dart
  TextButton.icon(
    icon: Icons.flag_outlined,
    label: 'Reportar problema',
    onPressed: () => SupportScreen(
      requestId: widget.requestId,
      reportedUserId: _tracking?['client']?['id'],  // ya viene en el payload de tracking
    ),
  )
  ```
- Visible en TODOS los sub-estados de la pantalla (en camino, llegó, esperando confirmación, trabajando), igual que en el lado cliente.

### 4.2 Worker — al terminar (diálogo "¡Trabajo completado!")
- Hay dos lugares que muestran este diálogo: `_completeJob()` (~línea 317) y `_onJobCompleted` (~línea 107).
- **Capturar antes de limpiar la sesión**: guardar `requestId` y `clientId` en variables locales ANTES de `SessionStore.activeRequestId = null`.
- Agregar al diálogo una acción secundaria:
  - `TextButton('Reportar problema')` (color muted) junto al `Aceptar` → cierra el diálogo y navega a `SupportScreen(requestId: capturedRequestId, reportedUserId: capturedClientId)`; al volver de soporte, `popUntil(isFirst)` como hoy.

### 4.3 Cliente — al terminar (`rating_screen.dart`)
- `RatingScreen` se abre con `SessionStore.activeRequestId` aún seteado (se limpia al enviar u omitir) — perfecto para reportar.
- En `initState`, resolver y guardar `requestId` y el `workerId` aceptado (mover la lógica de búsqueda de oferta aceptada que hoy está en `_submit` a un helper, para tener el workerId disponible también para el reporte; `_submit` la reusa — sin cambiar su comportamiento).
- Debajo de "Omitir por ahora", agregar:
  ```dart
  TextButton.icon(
    icon: Icons.flag_outlined,            // mismo estilo muted de la app
    label: '¿Tuviste un problema? Repórtalo',
    onPressed: () => SupportScreen(requestId: ..., reportedUserId: workerId),
  )
  ```
- Importante: al ir a reportar NO limpiar `activeRequestId` todavía (se limpia al salir del flujo como hoy), y el usuario puede volver y calificar igual.

### 4.4 Cliente — trabajo en progreso
- **Ya existe** (`tracking_screen.dart` → "Reportar problema"). No tocar. Solo verificar en QA que sigue visible en todos los sub-estados (en camino / llegó / confirmado / trabajando).

### 4.5 Sin cambios en datasources
- `MobileBackendService.createDispute / sendDisputeMessage / getDisputeMessages` ya existen y son los que usa `SupportScreen`. Cero cambios de red en la app.

---

## FASE 5 — QA / verificación de que nada se rompe

1. **Backend**
   - `npm run build` + levantar y verificar `ensureSchema()` (índice nuevo idempotente).
   - Regresión: `POST /mobile/reviews` con app actual (mismo body) → sigue 200; duplicado → no inserta y no revienta. `POST /mobile/disputes` igual que antes. `GET /mobile/admin/disputes` sin cambios.
   - Nuevo: `GET /mobile/admin/users/:id/disputes` devuelve made/received correctos para un worker y un cliente.
2. **Admin**
   - Ficha worker: reseñas (modal existente) sigue igual; nuevo botón Reportes muestra quién reportó y contra quién; chat de disputa abre y permite responder/resolver.
   - Ficha cliente nueva: abre desde la tabla, muestra reportes; editar/bloquear/eliminar siguen funcionando.
   - `disputes-page` global sigue funcionando (si `DisputeChat` se movió de archivo, verificar import).
3. **App** (flutter analyze + prueba manual de los 4 puntos)
   - Cliente en progreso → reporta (flujo viejo, regresión).
   - Worker en progreso → reporta al cliente (nuevo).
   - Worker completa → diálogo permite reportar (nuevo) y "Aceptar" sigue volviendo al home.
   - Cliente al calificar → puede reportar, volver y calificar; "Omitir" sigue limpiando sesión.
   - Verificar que la disputa creada en cada caso llega al admin con `reportedUser` correcto (para que aparezca en la ficha del reportado).

---

## Orden de implementación y archivos a tocar

| # | Qué | Archivos |
|---|---|---|
| 1 | Fase 1: refuerzo de reviews | `mobile.service.ts` (createReview + ensureSchema) |
| 2 | Fase 2: endpoint disputas por usuario | `mobile.controller.ts`, `mobile.service.ts` |
| 3 | Fase 3: admin | `admin-api.ts`, `workers-page.tsx`, `clients-page.tsx`, nuevo `components/user-reports-modal.tsx`, (mover `DisputeChat`) |
| 4 | Fase 4: app | `job_in_progress_screen.dart`, `rating_screen.dart` (solo puntos de entrada; `SupportScreen` intacta) |
| 5 | Fase 5: QA | — |

Las fases 1–2 (backend) van primero porque el admin depende del endpoint nuevo; la fase 4 (app)
es independiente y puede hacerse en paralelo porque solo usa endpoints que ya existen.
