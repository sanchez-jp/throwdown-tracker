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