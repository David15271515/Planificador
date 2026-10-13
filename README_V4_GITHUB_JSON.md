# Mi Plan V4 — usuarios reales + JSON privado en GitHub

Arquitectura:

- PWA: GitHub Pages (`Planificador`)
- Datos: repositorio privado `Planificador-data`
- API mínima: Cloudflare Worker `mi-plan-api`
- Login: usuario + contraseña, sin correo
- Contraseñas: PBKDF2 + salt; nunca texto plano
- Sesión: token firmado guardado en el dispositivo

## 1. Crear el repositorio de datos

Crea en GitHub un repositorio **privado** llamado `Planificador-data`.
Sube allí el contenido de `data-repo-template/`:

- `users.json`
- carpeta `data/` (GitHub no conserva carpetas vacías; puedes dejar `data/.gitkeep`)

## 2. Crear token de GitHub

GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens.

Crea uno limitado al repositorio `Planificador-data` con permiso:

- Repository permissions > Contents: Read and write

Copia el token solo una vez.

## 3. Crear Cloudflare Worker

En Cloudflare > Workers & Pages > Create > Worker.

Pega el contenido de `worker/worker.js` y despliega.

En Settings > Variables and Secrets añade:

Variables:
- `GITHUB_OWNER` = `David15271515`
- `GITHUB_DATA_REPO` = `Planificador-data`
- `GITHUB_BRANCH` = `main`
- `ALLOWED_ORIGIN` = `https://david15271515.github.io`

Secrets:
- `GITHUB_TOKEN` = el token fine-grained
- `SESSION_SECRET` = una frase larga aleatoria (por ejemplo 40+ caracteres)

Guarda. Tu Worker tendrá una URL parecida a:
`https://mi-plan-api.<tu-subdominio>.workers.dev`

Prueba abriendo:
`https://...workers.dev/api/health`

y debe responder:
`{"ok":true,"storage":"github-json"}`

## 4. Conectar la PWA

En GitHub abre `Planificador` > Settings > Secrets and variables > Actions > Variables > New repository variable.

Nombre:
`VITE_API_URL`

Valor:
`https://mi-plan-api.<tu-subdominio>.workers.dev`

Después ve a Actions > Publicar Mi Plan > Run workflow, o realiza un commit pequeño.

## 5. Resultado

Al abrir la PWA en un dispositivo nuevo aparecerá login:

- Usuario: por ejemplo `Conso`
- Contraseña
- Entrar / Crear usuario

La sesión queda guardada en ese dispositivo. En otro dispositivo se entra con el mismo usuario y se carga el mismo JSON.
