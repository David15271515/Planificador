# Mi Plan PWA · versión JSON

Agenda PWA en verde agua, con **usuario + contraseña sin correo** y almacenamiento sencillo en archivos JSON.

## Qué cambia en esta versión

- Sin Supabase ni base de datos SQL.
- Login solo con `usuario` y `contraseña`.
- Contraseñas guardadas como hash `scrypt`, nunca en texto plano.
- Un JSON independiente por usuario.
- La sesión se recuerda en cada dispositivo.
- Móvil/PC se sincronizan consultando el servidor cada 5 segundos.
- PWA instalable.
- GitHub Pages preparado con GitHub Actions.

## Probar TODO en el PC

Necesitas Node.js 20+.

```powershell
npm install
npm run dev
```

Abre `http://localhost:5173`.

El frontend usa el servidor JSON de `http://localhost:8787` automáticamente. Crea un usuario, añade tareas y prueba otro navegador.

Los datos se crean en:

```text
server/data/users.json
server/data/users/*.json
```

Esos archivos están excluidos de Git para no subir usuarios ni contraseñas.

## Probar la PWA desde GitHub Pages

1. Crea un repositorio de GitHub.
2. Sube **todo el contenido de esta carpeta** a la rama `main`.
3. En GitHub entra en `Settings > Pages` y selecciona **GitHub Actions** como origen.
4. Haz un push a `main`.
5. La acción `Publicar Mi Plan en GitHub Pages` construye la PWA automáticamente.

En GitHub Pages, si todavía no has publicado el servidor JSON, la app entra en **Modo local**. Sirve para probar diseño, calendario e instalación PWA, pero los datos de ese modo solo viven en ese dispositivo.

## Para que GitHub Pages sincronice entre dispositivos

GitHub Pages es estático y no puede escribir archivos JSON. Por eso hay que ejecutar la pequeña carpeta `server/` en cualquier hosting Node que permita una carpeta persistente.

Configura allí:

```env
SESSION_SECRET=un-secreto-largo-y-aleatorio
DATA_DIR=/ruta/persistente/mi-plan-data
```

Después, en tu repositorio de GitHub:

`Settings > Secrets and variables > Actions > Variables > New repository variable`

Crea:

```text
VITE_API_URL = https://URL-DE-TU-SERVIDOR
```

Vuelve a ejecutar la acción de Pages. Desde ese momento aparecerá la pantalla de usuario/contraseña y los mismos datos se verán en todos los dispositivos.

## Alternativa todavía más sencilla

En vez de separar GitHub Pages + servidor, puedes desplegar **este repositorio completo** como un único servicio Node/Docker. El servidor sirve tanto la PWA como `/api`, así que no necesitas `VITE_API_URL`.

Comandos de producción:

```powershell
npm install
npm run build
npm start
```

La app queda en `http://localhost:8787`.

## Estructura de datos

```text
server/data/
├── users.json
└── users/
    ├── <id-seguro-1>.json
    └── <id-seguro-2>.json
```

Cada archivo de usuario contiene únicamente:

```json
{
  "subjects": [],
  "items": [],
  "stickers": []
}
```

## Nota importante

No borres la carpeta indicada por `DATA_DIR`: ahí está la agenda. Haz una copia periódica si empiezas a usar la app de verdad.
