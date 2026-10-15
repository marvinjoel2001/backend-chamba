# Backend en Railway

El servicio usa `railway.json` en la raíz de este repositorio.

- Build: `npm ci --include=dev && npm run build`
- Start: `node dist/main`

`@nestjs/cli`, TypeScript y `@nestjs/testing` son dependencias de desarrollo:
se necesitan para compilar y para la verificación `postbuild`. Si la instalación
omite esas dependencias, `npm run build` falla con `nest: not found`.
`--include=dev` las incluye incluso con `NODE_ENV=production`,
`NPM_CONFIG_PRODUCTION=true` o `NPM_CONFIG_OMIT=dev`. La instalación usa las
versiones exactas de `package-lock.json`; no necesita Nest instalado globalmente.

La instalación explícita forma parte del comando de build para no depender de
cómo se haya configurado la fase de instalación automática del servicio. Esto
puede repetir esa fase, pero garantiza que las herramientas estén disponibles al
compilar. No ejecutar `npm prune --omit=dev` antes de `npm run build`: también
eliminaría las dependencias usadas por `postbuild`.

Si el servicio no está usando este archivo de configuración, configura su ruta
como `/railway.json` y el directorio raíz como el de `backend-chamba`. Comprueba
en los detalles del despliegue que el comando efectivo de build coincide con el
anterior. Si se configura manualmente, usar exactamente ese mismo comando.

Para publicar la corrección, subir el commit y desplegar ese commit en Railway.
Un despliegue anterior no incorpora el cambio al reintentar su misma revisión.
Mantener las variables de producción existentes; esta corrección no cambia el
comando de arranque ni ejecuta migraciones adicionales.

Referencias: [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/),
[configuración como código de Railway](https://docs.railway.com/config-as-code).

## Validación de la corrección (2026-10-15)

En Windows con Node 22.23.1 y npm 10.9.8, instalación limpia con
`NODE_ENV=production`, `NPM_CONFIG_PRODUCTION=true` y `NPM_CONFIG_OMIT=dev`:

- `npm ci --include=dev`: OK; Nest CLI, TypeScript y Nest Testing instalados.
- `npm run build`: OK; existe `dist/main.js` y pasa la verificación de módulos
  compilados de Nest (`postbuild`).
- `npm test -- --runInBand`: 212 pruebas y 24 suites pasan.

Esta comprobación valida el código y las dependencias; el resultado del
despliegue en Railway debe confirmarse en sus logs después de publicarlo.
