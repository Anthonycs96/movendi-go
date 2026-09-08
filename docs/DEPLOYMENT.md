# Ejecución local y arquitectura de producción

## Localhost e IP de red

Requisitos: Node.js 22.13 o superior y npm.

```powershell
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run dev
```

El seed local crea `nova-studio`, `brasa-norte` y `andes-cargo`. Es destructivo para la base indicada por `DATABASE_URL`; no se usa en producción. Las pruebas automatizadas crean `e2e.db` a partir de una copia y no reconstruyen `dev.db`.

`npm run dev` levanta:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`
- Salud frontend: `http://localhost:3000/api/frontend-health`
- Salud backend y base: `http://localhost:3001/api/health`

Para otros equipos de la red usa `npm run dev:network` y abre `http://IP_DE_ESTA_PC:3000`. El backend también escucha en el puerto 3001, pero los usuarios deben entrar por el frontend. Obtén la IP con `ipconfig` y limita el firewall al perfil de red privada.

Validación del artefacto de producción:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Backup local no destructivo de SQLite:

```powershell
npm run db:backup:local
```

El archivo se guarda en `backups/sqlite/`. `SQLITE_BACKUP_SOURCE` y `SQLITE_BACKUP_DIR` permiten cambiar origen y destino. El comando no elimina copias anteriores; en PostgreSQL deben habilitarse además los backups administrados y comprobar periódicamente una restauración.

## Base de datos

- Local: `apps/backend/prisma/schema.prisma`, SQLite y `DATABASE_URL="file:./dev.db"`.
- Producción: `npm run db:schema:prod` genera el mismo modelo con provider PostgreSQL en `apps/backend/prisma/postgresql/schema.prisma`.
- `npm run db:deploy:prod` sincroniza el esquema y se detiene si Prisma detecta pérdida de datos.
- `npm run db:bootstrap:prod` crea de forma idempotente la primera empresa, sede, plan, rol y Super Admin.
- `npm run db:seed` borra/reconstruye datos demo y nunca debe ejecutarse en producción.

## Railway

Railway aloja únicamente el servicio `backend`. El frontend público se despliega
en Google Cloud Run y `DATABASE_URL` apunta al PostgreSQL de Supabase. No deben
crearse en Railway servicios de frontend, workers, bases de datos ni buckets.

| Servicio | Config file | Dominio público |
| --- | --- | --- |
| Backend | `/railway.json` | Sí, desplegado automáticamente por Railway |

Variables de Backend:

```text
PORT=8080
APP_PUBLIC_URL=https://DOMINIO_PUBLICO_DEL_FRONTEND
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=${{STRIPE_SECRET_KEY}}
STRIPE_WEBHOOK_SECRET=${{STRIPE_WEBHOOK_SECRET}}
EMAIL_PROVIDER=webhook
EMAIL_WEBHOOK_URL=${{EMAIL_WEBHOOK_URL}}
EMAIL_WEBHOOK_TOKEN=${{EMAIL_WEBHOOK_TOKEN}}
DATABASE_URL=<cadena de conexión de Supabase almacenada como secreto>
SESSION_COOKIE_NAME=movendi_go_session
SESSION_TTL_HOURS=12
LOGIN_RATE_MAX_ATTEMPTS=5
LOGIN_RATE_WINDOW_MINUTES=15
LOGIN_RATE_BLOCK_MINUTES=15
SLOW_WORKSPACE_MS=500
JOB_RUNNER_SECRET=una-clave-aleatoria-de-32-o-mas-caracteres
OBJECT_STORAGE_PROVIDER=local-o-proveedor-externo-configurado
SIGNED_URL_TTL_SECONDS=300
DOCUMENT_MAX_MB=10
BOOTSTRAP_TENANT_SLUG=mi-empresa
BOOTSTRAP_TENANT_NAME=Mi Empresa
BOOTSTRAP_TENANT_TYPE=TRANSPORT
BOOTSTRAP_BRANCH_NAME=Sede principal
BOOTSTRAP_ADMIN_NAME=Administrador de plataforma
BOOTSTRAP_ADMIN_EMAIL=correo-real@example.com
BOOTSTRAP_ADMIN_PASSWORD=una-clave-unica-de-12-o-mas-caracteres
```

`BOOTSTRAP_TENANT_TYPE` acepta `BARBERSHOP`, `RESTAURANT` o `TRANSPORT`.

`railway.json` ejecuta las migraciones y comprueba `/api/ready`. En Cloud
Run, `API_INTERNAL_URL` debe usar la URL HTTPS pública del backend de Railway.
`APP_PUBLIC_URL` debe ser `https://web.movendi-go.com` para cookies, redirecciones
y CORS coherentes.

En Stripe registra el webhook público `https://DOMINIO_PUBLICO_DEL_FRONTEND/api/billing/webhooks/stripe`. El proxy del frontend conserva el cuerpo y la cabecera `stripe-signature` y los reenvía al backend privado. Suscribe `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`. `APP_PUBLIC_URL` debe ser el dominio HTTPS exacto del frontend. Nunca habilites `ALLOW_MOCK_BILLING` ni `ALLOW_LOG_EMAIL` en producción.

Configura backups y recuperación a un punto en el tiempo en Supabase. Las
respuestas del backend exponen `Server-Timing`; envía los eventos
`slow_workspace` y los errores del contenedor a observabilidad.

Tras el primer despliegue, ejecuta una sola vez en el servicio Backend:

```powershell
railway run npm run db:bootstrap:prod
```

No configures el seed demo como pre-deploy.

Referencias oficiales: [monorepos](https://docs.railway.com/deployments/monorepo), [Config as Code](https://docs.railway.com/config-as-code) y [Supabase Database](https://supabase.com/docs/guides/database/overview).

## Despliegue continuo desde GitHub

El repositorio privado `Anthonycs96/movendi-go` usa `main` como rama de
producción. Cada `git push origin main` activa dos despliegues independientes:

- Railway reconstruye el backend con `Dockerfile.backend`, ejecuta
  `npm run db:deploy:prod` contra Supabase y publica el contenedor solo si las
  migraciones terminan correctamente.
- Cloud Build ejecuta `cloudbuild.frontend.yaml`, construye
  `Dockerfile.frontend` y actualiza `movendi-frontend` en Cloud Run.

Railway observa cambios del backend, contratos compartidos, scripts de
construcción y archivos raíz. Cloud Build observa el frontend, contratos
compartidos, su Dockerfile, lockfile y configuración. Los cambios exclusivos de
documentación no generan despliegues.

Antes de publicar ejecuta `npm run release:check`. No ejecutes `db:seed` en
producción; las migraciones versionadas son el único mecanismo automático para
modificar el esquema de Supabase.

## Google Cloud Run + Cloud SQL PostgreSQL

Los contenedores se construyen por separado con `Dockerfile.backend` y `Dockerfile.frontend`. `cloudbuild.yaml` publica ambas imágenes en Artifact Registry con tags `$BUILD_ID` y `latest`.

### 1. Preparar proyecto e imágenes

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com iamcredentials.googleapis.com
gcloud artifacts repositories create movendi-go --repository-format=docker --location=us-central1
gcloud storage buckets create gs://PROJECT_ID-movendi-go-files --location=us-central1 --uniform-bucket-level-access
gcloud builds submit --config cloudbuild.yaml .
```

Imágenes:

```text
us-central1-docker.pkg.dev/PROJECT_ID/movendi-go/backend:latest
us-central1-docker.pkg.dev/PROJECT_ID/movendi-go/frontend:latest
```

### 2. Cloud SQL y secreto

Mantén Cloud SQL y Cloud Run en la misma región. Crea PostgreSQL, base/usuario y guarda el URL Prisma en Secret Manager. Para una conexión por socket administrado:

```text
postgresql://USUARIO:CLAVE_URL_ENCODED@localhost/BASE?host=/cloudsql/PROJECT_ID:us-central1:INSTANCIA&connection_limit=5&pool_timeout=10
```

La cuenta del backend y la del job de migración requieren `roles/cloudsql.client` y `roles/secretmanager.secretAccessor`.

En Cloud SQL habilita backups automáticos, recuperación a un punto en el tiempo y una ventana de retención acorde al negocio. Crea una restauración de prueba en otra instancia antes del lanzamiento.

### 3. Storage e IAM

Usa una cuenta de servicio dedicada para el backend. Concédele `roles/storage.objectUser` sobre el bucket y capacidad de firmar URLs V4 mediante `roles/iam.serviceAccountTokenCreator` sobre esa misma cuenta. No hagas público el bucket. Configura en el backend:

```text
OBJECT_STORAGE_PROVIDER=gcs
GOOGLE_CLOUD_PROJECT=PROJECT_ID
GCS_BUCKET=PROJECT_ID-movendi-go-files
SIGNED_URL_TTL_SECONDS=300
DOCUMENT_MAX_MB=10
APP_PUBLIC_URL=https://DOMINIO_FRONTEND_CLOUD_RUN
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=secret-manager
STRIPE_WEBHOOK_SECRET=secret-manager
EMAIL_PROVIDER=webhook
EMAIL_WEBHOOK_URL=proveedor-transaccional
```

La URL firmada solo se genera después de comprobar sesión, rubro, tenant, actor y permiso. Para documentos de usuario configura además un servicio ClamAV privado y `ANTIVIRUS_MODE=clamav`, `REQUIRE_ANTIVIRUS=true`, `CLAMAV_HOST` y `CLAMAV_PORT=3310`.

### 4. Migrar y desplegar backend privado

```bash
gcloud run jobs create movendi-go-migrate --image=us-central1-docker.pkg.dev/PROJECT_ID/movendi-go/backend:latest --region=us-central1 --command=npm --args=run,db:deploy:prod --set-cloudsql-instances=PROJECT_ID:us-central1:INSTANCIA --set-secrets=DATABASE_URL=movendi-go-database-url:latest
gcloud run jobs execute movendi-go-migrate --region=us-central1 --wait

gcloud run deploy movendi-go-backend --image=us-central1-docker.pkg.dev/PROJECT_ID/movendi-go/backend:latest --region=us-central1 --no-allow-unauthenticated --port=8080 --memory=1Gi --concurrency=40 --max-instances=10 --service-account=BACKEND_SERVICE_ACCOUNT --set-cloudsql-instances=PROJECT_ID:us-central1:INSTANCIA --set-secrets=DATABASE_URL=movendi-go-database-url:latest --set-env-vars=SESSION_COOKIE_NAME=movendi_go_session,SESSION_TTL_HOURS=12,OBJECT_STORAGE_PROVIDER=gcs,GOOGLE_CLOUD_PROJECT=PROJECT_ID,GCS_BUCKET=PROJECT_ID-movendi-go-files,SIGNED_URL_TTL_SECONDS=300
```

Guarda también `JOB_RUNNER_SECRET` en Secret Manager y asígnalo al backend. Para procesar una unidad de trabajo por ejecución crea un Cloud Run Job con la misma imagen:

```bash
gcloud run jobs create movendi-go-transport-worker --image=us-central1-docker.pkg.dev/PROJECT_ID/movendi-go/backend:latest --region=us-central1 --command=node --args=scripts/transport-job-runner.mjs,--once --set-env-vars=JOB_RUNNER_API_URL=BACKEND_URL,GOOGLE_CLOUD_RUN_AUDIENCE=BACKEND_URL --set-secrets=JOB_RUNNER_SECRET=movendi-go-job-runner-secret:latest
gcloud run jobs execute movendi-go-transport-worker --region=us-central1 --wait
```

Programa el Job con Cloud Scheduler según el volumen esperado. El backend continúa privado; concede al job `roles/run.invoker` sobre el backend o usa una URL interna compatible con la política de la organización.

Obtén la URL del backend:

```bash
gcloud run services describe movendi-go-backend --region=us-central1 --format='value(status.url)'
```

### 5. Desplegar frontend e IAM

Crea una cuenta de servicio para el frontend, concédele `roles/run.invoker` únicamente sobre `movendi-go-backend` y despliega:

```bash
gcloud run deploy movendi-go-frontend --image=us-central1-docker.pkg.dev/PROJECT_ID/movendi-go/frontend:latest --region=us-central1 --allow-unauthenticated --port=8080 --memory=1Gi --concurrency=80 --max-instances=10 --service-account=FRONTEND_SERVICE_ACCOUNT --set-env-vars=API_INTERNAL_URL=BACKEND_URL,GOOGLE_CLOUD_RUN_AUDIENCE=BACKEND_URL
```

El frontend obtiene un identity token desde el metadata server y lo envía al backend privado. Verifica `/api/frontend-health`, inicia sesión desde el dominio del frontend y no publiques una ruta alternativa al backend.

El webhook de Stripe usa el dominio público del frontend: `https://DOMINIO_FRONTEND_CLOUD_RUN/api/billing/webhooks/stripe`. Agrega las claves con Secret Manager al backend; no las copies a variables del frontend. La página `/planes` crea la sesión en servidor y Stripe retorna al checkout usando `APP_PUBLIC_URL`.

Cloud Run inyecta `PORT`; ambos contenedores escuchan en `0.0.0.0`. En cada versión: construir, ejecutar el job de migración y desplegar backend/frontend. El bootstrap se ejecuta una sola vez con un Cloud Run Job equivalente y variables `BOOTSTRAP_*`.

Referencias oficiales: [despliegue de contenedores](https://docs.cloud.google.com/run/docs/deploying), [autenticación servicio a servicio](https://docs.cloud.google.com/run/docs/authenticating/service-to-service), [health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks) y [URLs firmadas V4 de Cloud Storage](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers).
