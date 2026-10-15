# Backend en Railway

El servicio usa `railway.json` y `nixpacks.toml` en la raíz del repositorio.

- Install (`nixpacks.toml`): `npm ci --include=dev`
- Build (`railway.json`): `npm run build`
- Start (`railway.json`): `node dist/main`

`@nestjs/cli`, TypeScript y `@nestjs/testing` son dependencias de desarrollo:
se necesitan para compilar y para la verificación `postbuild`. Si la instalación
omite esas dependencias, `npm run build` falla con `nest: not found`.
`--include=dev` las incluye incluso con `NODE_ENV=production`,
`NPM_CONFIG_PRODUCTION=true` o `NPM_CONFIG_OMIT=dev`. La instalación usa las
versiones exactas de `package-lock.json`; no necesita Nest instalado globalmente.

## Evitar EBUSY al compilar

Nixpacks monta `/app/node_modules/.cache` como caché durante build. `npm ci`
borra `node_modules` antes de instalar, así que ejecutarlo en esa fase falla con
`EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'`.
Debe ejecutarse una sola vez, en **install**, antes de montar esa caché.
No combinar instalación y compilación en el comando de build.

Tampoco ejecutar `npm prune --omit=dev` antes de compilar: elimina las
dependencias usadas por `postbuild`.

## Comprobar la configuración del servicio

1. Usar Nixpacks como builder y `/railway.json` como archivo de configuración.
2. El directorio raíz debe contener `package.json`, `package-lock.json`,
   `railway.json` y `nixpacks.toml` de este backend.
3. Si existe `NIXPACKS_INSTALL_CMD` en las variables del servicio, eliminarlo o
   cambiarlo a `npm ci --include=dev`: las variables tienen prioridad sobre TOML.
4. Si existe `NIXPACKS_BUILD_CMD` o un comando de build manual, usar
   `npm run build`. No incluir un segundo `npm ci`.
5. Desplegar el commit más reciente; reintentar una revisión anterior no
   incorpora esta corrección. En el plan/log deben aparecer las fases indicadas
   arriba, con una sola instalación.

El aviso Docker `UndefinedVar: '$NIXPACKS_PATH'` del log proporcionado no detuvo
la construcción: el proceso continuó hasta el error EBUSY. El Dockerfile
generado por Nixpacks añadía su ruta de ejecutables antes de declarar la
variable. `nixpacks.toml` ahora la inicializa vacía; Nixpacks añade después
`/app/node_modules/.bin`. No hace falta crear esa variable manualmente en
Railway ni modificar credenciales. Los avisos de peer dependencies de
`class-validator` tampoco fueron el fallo que interrumpió ese despliegue.

Esta corrección conserva el comando de arranque y no añade migraciones.

## Validación

La primera corrección se comprobó en Windows (Node 22.23.1, npm 10.9.8):
instalación limpia con las tres opciones de producción indicadas arriba, build,
verificación de módulos compilados y 212 pruebas / 24 suites correctas. Esa
validación no reproducía el montaje de caché de Nixpacks y por eso no detectó
EBUSY. La revisión actual separa install/build para respetar ese montaje.

Validación de la revisión: plan y Dockerfile generados con Nixpacks 1.41.0 en
WSL (mismo nixpkgsArchive que en el log remoto). Install contiene una sola
ejecución de `npm ci --include=dev`, con caché solo en `/root/.npm`; build
monta `/app/node_modules/.cache` y ejecuta únicamente `npm run build`.
La variable `NIXPACKS_PATH` se declara antes de usarse. La compilación local y
la verificación de módulos compilados vuelven a pasar.

Evidencia local: `../build/railway-qa-20261015/validated-plan.json` y
`../build/railway-qa-20261015/generated/.nixpacks/Dockerfile` (generado desde
un fixture con manifiestos/configuración, sin credenciales). No se ejecutó
la imagen completa porque Docker no está arrancado en este equipo.

El resultado remoto debe confirmarse en los logs del nuevo despliegue.

Referencias:
- [Fases y prioridad de configuración de Nixpacks](https://nixpacks.com/docs/configuration/file).
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
- [Aviso UndefinedVar de Docker](https://docs.docker.com/reference/build-checks/undefined-var/).
