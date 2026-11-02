# Bots de simulación de Chamba

## Entrega

Backend NestJS y panel `/bots` del admin. Veinte actores persistentes: `CLIENT-01…10` y `WORKER-01…10`, con avatares ilustrados, nombre, oficio/categoría, disponibilidad, ubicación y trabajos. Aprovisionar es una operación administrativa repetible que no duplica ni restablece perfiles editados. No se crean cuentas con credenciales de acceso móvil.

Los perfiles, pedidos y acciones viven en el esquema **`chamba_simulation` de la misma base PostgreSQL en la nube**. No se insertan en las tablas `users`, `job_requests`, ofertas, pagos o reseñas. Este motor reproduce el recorrido de una contratación para administración; no prueba el flujo móvil real ni presenta actividad ficticia como contratación real. No envía notificaciones, mensajes externos ni pagos. La ilustración del avatar se dibuja en el admin con el color persistido, sin servicios de imágenes externos.

## Zona única

- Centro manual: clic en el mapa o coordenadas; radio entre 0,25 y 50 km.
- Centro automático: cliente real no bloqueado ni eliminado que más recientemente comunicó su ubicación. Se excluye la cuenta demo heredada `cliente.demo@chamba.app`.
- `users.location_updated_at` y su trigger capturan INSERT/UPDATE de `current_location`, incluso al reenviar la misma ubicación. Editar el nombre o perfil no cambia esta fecha. Las ubicaciones anteriores a esta entrega no se ordenan por `updated_at` porque no indica cuándo cambió la ubicación; el modo automático espera la siguiente actualización real.
- El centro automático sigue las nuevas actualizaciones. Cada escenario guarda su centro, radio y referencia de cliente al nacer; terminará en esa zona aunque cambie el centro global. La ubicación del cliente de referencia no se comunica a una app ni a un trabajador.
- Puntos aleatorios distribuidos sobre el área del círculo. Se reserva una pareja libre, habilitada y del mismo oficio **antes** de publicar el escenario. Ambos son actores de simulación.
- Solo pueden editarse zona, reglas y perfiles cuando el sistema no está encendido ni pausando y no tiene trabajos activos.

## Motor y control

Programador `@Interval(5000)` en el backend. Las fechas `due_at` y el estado se guardan en PostgreSQL. Cada tick hace pasos cortos; no depende del navegador, de temporizadores en memoria para cada trabajo ni de otro servicio contratado. Un bloqueo transaccional de la fila de configuración serializa todas las réplicas, los controles y las reservas. Reiniciar continúa desde el último paso confirmado, respetando el estado guardado.

Recorrido: publicado → ofertado → aceptado → en camino → llegada → confirmación → terminado. Presupuesto de plantilla Bs 80 y efectivo **simulado**, sin obligación de pago. Cuatro oficios iniciales: limpieza, plomería, electricidad y pintura. No interviene un modelo de IA.

- **Encender:** crea escenarios según intervalo y límites. Es idempotente. Requiere zona guardada, veinte perfiles y al menos una pareja compatible habilitada.
- **Pausar:** no crea nuevos; termina los actuales y pasa a `paused`.
- **Apagar:** espera el bloqueo, incrementa la generación y cancela los escenarios pendientes en la misma transacción. No hay acciones posteriores de esa generación después de la confirmación del comando.
- **Probar 1 trabajo:** admite ejecución con el modo continuo apagado. Usa un UUID idempotente aportado por el admin; todos sus pasos corren en el servidor. Apagar también cancela estas pruebas.
- Límites iniciales: 600 s entre nuevos escenarios, 20 s por paso, tres simultáneos y treinta por día según `America/La_Paz`. Límites manuales y automáticos compartidos.

## API protegida

Todos requieren el `AdminAccessGuard` existente y JWT de un administrador activo:

```text
GET   /api/admin/bots
PATCH /api/admin/bots/settings
PATCH /api/admin/bots/profiles/:id
POST  /api/admin/bots/provision
POST  /api/admin/bots/start
POST  /api/admin/bots/pause
POST  /api/admin/bots/stop
POST  /api/admin/bots/run-once       {"requestId":"UUID"}
```

Configuración validada con DTO: `centerMode`, `latitude`, `longitude`, `radiusKm`, `intervalSeconds`, `stepSeconds`, `maxConcurrent`, `dailyLimit`. No acepta una identidad de administrador en el cuerpo. Auditoría de comandos y pasos en `actions`; la respuesta incluye los últimos cien escenarios y cien eventos, con totales completos. El panel consulta cada ocho segundos mientras es visible y conserva los cambios locales sin guardar.

## Despliegue y verificación

Migración `BotSimulation1793652000000`, registrada en `DatabaseModule` (`migrationsRun: true` en el arranque Railway). El CLI de migraciones también la descubre. No necesita nuevas variables de entorno. El admin reutiliza `VITE_API_URL` y `VITE_MAPBOX_TOKEN`; sin token Mapbox permite coordenadas manuales.

Desplegar primero backend y comprobar que `GET /api/admin/bots` autenticado responde. Desplegar admin. Llamar a `POST /provision` para crear los veinte perfiles en esa base; el estado inicial es apagado, sin una zona confirmada. Guardar la zona antes de iniciar.

Pruebas reales de PostgreSQL/PostGIS en una base local desechable cuyo nombre termina en `_verification`:

```powershell
$env:BOTS_TEST_DATABASE_URL='postgres://USER:PASS@127.0.0.1:PORT/chamba_bots_verification'
npx jest bots.integration --runInBand
```

Cubren idempotencia, distribución geográfica, límite diario y simultáneo, reserva exclusiva de bots, múltiples réplicas, recuperación de estado, pausa, apagado concurrente, aislamiento de usuarios reales y fecha de ubicación. Sin esa variable se ejecuta la prueba de geometría y se omiten las de PostgreSQL. Las pruebas del admin renderizan el componente real y verifican controles, edición del círculo, conservación de cambios y ausencia de cliente para el modo automático.

No incluye limpieza de historial, chat simulado, configuración de presupuestos, horarios semanales ni exposición en la app móvil. El historial permanece en la nube y está limitado en su lectura, sin borrado automático.
