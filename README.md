# JAQUE COMARES

Gestión de torneos escolares de ajedrez por sistema suizo · IES Marqués de Comares – Lucena (Córdoba).

Aplicación web en HTML, CSS y JavaScript puro: sin servidor, sin dependencias y sin APIs externas.

## Uso

- **En local:** abre `index.html` en el navegador.
- **GitHub Pages:** publica la rama (Settings → Pages) y la aplicación funciona tal cual.

Los datos se guardan solos en el `localStorage` del navegador. Usa las copias de seguridad JSON (portada o Informes) para llevarlos a otro equipo.

Flujo habitual: crear torneo → añadir participantes (o importar CSV) → generar ronda 1 → anotar resultados → «Cerrar ronda y generar siguiente» → repetir → clasificación final → imprimir.

## Estructura

| Archivo | Contenido |
|---|---|
| `js/swiss.js` | Motor de emparejamientos (sin dependencias del navegador) |
| `js/tournament.js` | Modelo: jugadores, rondas, resultados, clasificación, copias de seguridad |
| `js/app.js` | Interfaz, diálogos, informes e impresión |
| `css/styles.css` | Estilos (responsive e impresión) |
| `tests/run.js` | Pruebas automatizadas |

## Pruebas

```
node tests/run.js
```

Simula torneos de 20, 21, 24, 25 y 30 participantes y comprueba: nadie repite rival ni descanso, nadie juega dos veces en una ronda, las puntuaciones coinciden con los resultados, los emparejamientos respetan los puntos, los colores quedan equilibrados, corregir un resultado antiguo no rompe nada, y los datos sobreviven a un guardado/recarga. También incluye casos difíciles (4, 5, 6, 3 y 2 jugadores con rondas de más).

## Sobre el algoritmo

Sistema suizo propio **inspirado en el sistema holandés (Dutch)**: grupos de puntuación, mitad superior contra mitad inferior, descenso del jugador sobrante, sin repetir rival, descanso (BYE) al jugador con menos puntos que aún no haya descansado, y colores equilibrados (se evitan tres colores seguidos y diferencias mayores de 2). Si no hay solución perfecta se relajan los criterios por niveles y la aplicación **avisa** de ello en la ronda.

**No está homologado ni verificado íntegramente conforme al reglamento de la FIDE.**

## Limitaciones conocidas

- «PDF» se obtiene con *Imprimir → Guardar como PDF* del navegador (no se genera el PDF directamente).
- Una vez generada la ronda 1 no se pueden añadir/eliminar alumnos (sí retirarlos).
- Corregir un resultado de una ronda cerrada recalcula puntos y clasificación, pero no vuelve a emparejar rondas posteriores.
- Incomparecencias y descansos no cuentan para el Buchholz (no se usan rivales virtuales).
- El historial de «Deshacer» vive en memoria: se pierde al cerrar la página.
