# Throwdown Tracker

Aplicación estática para horarios de competiciones CrossFit.

## Actualizar horarios
Edita únicamente `data/competition.json`. No necesitas modificar el HTML ni el JavaScript.

Cada competición contiene:
- `competition`: nombre, categoría, equipo, sede, calle, heat y zona horaria.
- `days`: jornadas con fecha `YYYY-MM-DD`.
- `events`: WOD de cada jornada con horas `HH:mm`.

Cada evento admite `briefing`, `warmup`, `corrals`, `arena`, `start` y `end`. Para un día aún sin horarios, deja `events: []`.

## GitHub Pages
En Settings → Pages selecciona Deploy from a branch, rama main y carpeta /(root). La web quedará en https://sanchez-jp.github.io/throwdown-tracker/.

## iPhone
Abre la URL con Safari → Compartir → Añadir a pantalla de inicio.
