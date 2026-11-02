# Registro con teléfono y publicación desde la web

## Comportamiento

La landing dirige a `/es/publicar-trabajo` (también existe bajo los otros idiomas). Antes de mostrar el formulario exige cuenta de cliente. Acepta cuentas existentes de la app con correo o celular y contraseña. Una cuenta de trabajador no puede publicar como cliente. La web permite publicar pedidos de precio fijo, presupuesto en Bs y pago en efectivo, y ver los últimos treinta pedidos, incluidos los que buscan trabajador. Ofertas, chat y confirmación se continúan desde la app con la misma cuenta.

La nueva alta web y la app actualizada verifican el teléfono una vez por Firebase Phone Authentication antes de registrar. También se verifica en el alta nueva mediante Google; los ingresos posteriores de una cuenta existente mantienen su mecanismo de acceso y no solicitan SMS.

El navegador envía `phoneIdToken` emitido por Firebase después del código. El backend usa Firebase Admin SDK para verificar firma, proyecto, emisor y vencimiento. Exige proveedor `phone`, coincidencia exacta del número E.164 y autenticación de menos de diez minutos. No confía en un booleano del cliente. Esta comprobación de certificados públicos no necesita exponer ni agregar una clave privada de servicio a la web.

La migración `VerifiedPhones1793656000000` agrega `phone_e164`, `phone_verified_at` y `firebase_phone_uid`, con unicidad de teléfono y UID. El alta guarda la prueba y el hash de contraseña en una transacción. Las colisiones concurrentes responden 409. Un cambio de formato conserva la verificación; un cambio de número la invalida mediante trigger. Los números heredados no se marcan como verificados retroactivamente.

## Despliegue gradual

`PHONE_VERIFICATION_REQUIRED=false` es el valor inicial: mantiene compatibles los registros de versiones móviles instaladas. **Las altas con `source=web` ya exigen prueba**, y toda alta que incluya `phoneIdToken` se valida. El servidor debe activar `PHONE_VERIFICATION_REQUIRED=true` en Railway para cerrar también el registro sin prueba en clientes antiguos, una vez que el proveedor SMS, facturación y actualización móvil estén listos. La configuración inicial no representa una aplicación universal de la nueva política.

Firebase de Chamba: `chamba-9f6db`. La web usa su configuración pública existente; la clave API web no es una credencial administrativa. Firebase requiere:

1. Proveedor de Teléfono habilitado.
2. Dominios autorizados `www.chambatrabajo.com` y `chambatrabajo.com` (y el dominio Vercel de producción solo si se usará para registro).
3. Política de regiones SMS que permita Bolivia. No habilitar todos los países por omisión.
4. Plan Blaze con cuenta de facturación vinculada para SMS reales. El plan Spark no permite enviar códigos SMS reales.
5. Android: SHA-1 y SHA-256 del certificado con que se firma la app instalada; el certificado de Play App Signing puede diferir de la clave local. Registrar ambos cuando corresponda. iOS necesita configuración APNs y reCAPTCHA específica; no se ha probado una compilación iOS en Windows.

Fuentes: [Firebase web phone auth](https://firebase.google.com/docs/auth/web/phone-auth), [límites](https://firebase.google.com/docs/auth/limits), [precios](https://cloud.google.com/identity-platform/pricing). Consultados 2/11/2026: Bolivia USD 0,14 por SMS enviado; la tabla de Identity Platform indica los primeros diez SMS diarios sin facturación. La consola y las condiciones de la cuenta determinan el importe aplicable. No vincular una cuenta de pago sin autorización del propietario.

## Sesión web

La web usa `/api/chamba/auth` como intermediario. El JWT de Chamba queda en una cookie HttpOnly, Secure en producción y SameSite=Lax; no se entrega en el JSON al navegador ni se guarda en localStorage. Mutaciones exigen `Origin` del propio sitio. La sesión se consulta en `GET /api/chamba/auth` bajo el dominio de la landing y se valida contra `GET /api/auth/session` en Railway.

El intermediario valida sesión contra `GET /api/auth/session` del backend y deriva el `clientUserId` del usuario autenticado. No acepta una identidad, modalidad o instrucción de pago arbitraria del navegador. `GET /api/mobile/client/web-jobs` obtiene el usuario exclusivamente del principal autenticado y devuelve solo sus pedidos.

## Verificación

- Backend: `npm run build`; `npx jest phone-verification mobile-registration --runInBand`.
- Integración real PostgreSQL: base local desechable cuyo nombre termina en `_verification`, variable `PHONE_TEST_DATABASE_URL`, luego `npx jest mobile-phone.integration --runInBand`. Incluye altas de contraseña y Google, unicidad concurrente, formatos de números heredados e ingreso por teléfono sin otra verificación SMS.
- Web: `npm run test:web`, `npm run lint`, `npm run build`, `npm run check:seo` contra la publicación.
- App: `flutter analyze` sobre autenticación y `flutter test`. APK de prueba con URLs reales mediante `--dart-define=API_BASE_URL=https://web-production-f0db6d.up.railway.app/api --dart-define=SOCKET_BASE_URL=https://web-production-f0db6d.up.railway.app` y el cliente web público de Google de `google-services.json`.

No se considera comprobada la entrega de un SMS real hasta completar una prueba con un número del propietario, su consentimiento y el código introducido por él. Nunca guardar códigos de prueba permanentes para teléfonos reales ni usar la cuenta admin para suplantar usuarios.
