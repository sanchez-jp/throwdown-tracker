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
- `results`: configuración del proveedor de resultados. La integración actual de WodBuster sigue limitada a Badajoz Elvas 2026; otras competiciones no mostrarán clasificaciones hasta configurar su fuente.

Para crear otra competición, duplica un JSON existente con un nuevo identificador y sustituye sus datos. No reutilices la configuración `results` de otra competición.