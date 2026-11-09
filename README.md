# Throwdown Tracker

Aplicación estática para horarios de competiciones CrossFit.

## Actualizar horarios
Edita el archivo de la competición correspondiente en `data/competitions/`. No necesitas modificar el HTML ni el JavaScript para cambiar horarios, WODs o enlaces.

Cada competición contiene:
- `competition`: nombre, categoría, equipo, sede, calle, heat y zona horaria.
- `days`: jornadas con fecha `YYYY-MM-DD`.
- `events`: WOD de cada jornada con horas `HH:mm`.

Cada evento admite `briefing`, `warmup`, `corrals`, `arena`, `start` y `end`. Para un día aún sin horarios, deja `events: []`.

## GitHub Pages
En Settings → Pages selecciona Deploy from a branch, rama main y carpeta /(root). La web quedará en https://sanchez-jp.github.io/throwdown-tracker/.

## Modo sin conexión

La aplicación incorpora una caché local para consultar la información ya descargada cuando no hay cobertura:

- La interfaz, los iconos y la configuración de cada competición visitada se guardan en la caché del navegador.
- La clasificación conserva la última consulta correcta en el dispositivo y muestra que se trata de datos guardados cuando no hay conexión.
- Las notas estratégicas se guardan localmente después de una consulta autenticada correcta. Si se pierde la conexión durante una sesión de equipo o administrador, se puede seguir consultando esa última copia en modo de solo lectura.
- Al recuperar la conexión, la clasificación y las notas vuelven a sincronizarse automáticamente.

La primera apertura de cada competición debe hacerse con conexión para descargar su configuración. Los enlaces externos (por ejemplo, flows alojados en Google Drive) y las operaciones que modifican notas compartidas siguen necesitando conexión. El acceso compartido del equipo también requiere validar las credenciales en línea; no se guardan contraseñas para habilitar un inicio de sesión sin conexión.

La copia local depende del almacenamiento del navegador y puede desaparecer si se borran sus datos. Antes de una competición, abre la app con conexión y comprueba que aparece el estado «EN LÍNEA» para que se descarguen los datos.

## iPhone
Abre la URL con Safari → Compartir → Añadir a pantalla de inicio.

## Varias competiciones
Cada competición tiene su propio archivo en `data/competitions/<id>.json`. La aplicación carga por defecto `badajoz-elvas-2026`; para abrir otra, utiliza `?competition=<id>` en la URL. El identificador solo admite letras minúsculas, números y guiones.

La configuración incluye:
- `id`: identificador único de la competición.
- `competition`: datos generales (nombre, categoría, equipo, sede, carril, heat y zona horaria).
- `days`: jornadas, eventos, horarios, WODs y enlaces a flows.
- `results` (opcional): proveedor de clasificaciones. Para WodBuster se configuran `provider: "wodbuster"`, `teamName`, `competitionId`, `divisionId` y `pages`. Cada página define una clave única (`key`), su etiqueta (`label`), el identificador WodBuster de la prueba (`idw`) y, opcionalmente, el WOD al que pertenece (`event`) para mostrar su puesto junto a la descripción. La clasificación general usa `idw: ""` y `overall: true`.
- Las páginas se consultan mediante el proxy de resultados de Supabase. La URL de consulta queda restringida al dominio oficial de WodBuster; la configuración no admite URLs arbitrarias.

Para crear otra competición, duplica un JSON existente con un nuevo identificador y sustituye sus datos. Si utiliza WodBuster, introduce los identificadores de competición, categoría y cada tabla de resultados. Si utiliza otro proveedor, habrá que añadir su adaptador en la función de resultados; la interfaz ya consume páginas de resultados de forma dinámica.
## Notas estratégicas por competición

Las notas se guardan con una clave compuesta por el identificador de la competición y el WOD, por ejemplo `badajoz-elvas-2026:wod1`. El acceso de equipo solo consulta las notas de la competición abierta; el acceso de administrador utiliza la misma clave en `public.wod_notes`.

La función `team-notes` debe desplegarse desde `supabase/functions/team-notes/index.ts` junto con esta versión de la aplicación. Antes de activar la nueva función, ejecuta una vez el SQL de `supabase/operations/migrate-badajoz-elvas-notes.sql` para conservar las notas existentes de Badajoz-Elvas. El script se detiene si detecta claves nuevas que pudieran provocar una sobrescritura.
