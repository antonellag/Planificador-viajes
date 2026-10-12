# Córdoba 2026 · Planificador del viaje

Web para que Javi, Bel, Facu y Anto armen juntos el viaje a Córdoba (25/12/2026 → 7/1/2027).

- **Explorar**: todo el catálogo de la planilla, con resumen de cada lugar, fotos libres de Wikimedia, videos y fotos que comparte el grupo, y votos "Quiero ir" / "Paso".
- **Espera y mapa**: lo que junta 3 de 4 votos pasa a lista de espera. En el mapa se ve dónde queda cada lugar y se decide "Lo hacemos" o "No conviene".
- **Cronograma**: lo confirmado se reparte por día. Arriba aparece la propuesta de Claude, que Anto puede aplicar con un botón.
- **Gastos**: se cargan, se dividen y se calcula quién le debe a quién.
- **Necesarios**: checklist de la valija con quién lleva cada cosa.

Todo se guarda en la planilla de Google Sheets del viaje, así que si la web falla se puede seguir anotando ahí.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `styles.css`, `app.js` | La web (HTML + JS, sin build) |
| `config.js` | URL de la planilla y datos del viaje. **Hay que pegar `API_URL`.** |
| `enrich.js` | Ubicación, mood y resumen de cada lugar del catálogo |
| `apps-script/Code.gs` | Backend: va pegado dentro de la planilla |

## Puesta en marcha (una sola vez)

1. Abrí la planilla del viaje → **Extensiones → Apps Script**.
2. Borrá lo que haya y pegá todo `apps-script/Code.gs`. Guardá.
3. Elegí la función `setup` arriba y tocá **Ejecutar**. Google te pide permisos: aceptalos (es tu propia cuenta). Esto crea las hojas ocultas `app_*`, prepara la hoja "Gastos" (borra las filas de ejemplo que traía la plantilla) e importa tu lista de "Necesarios".
4. **Implementar → Nueva implementación** → tipo **Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Copiá la URL que termina en `/exec` y pegala en `config.js` en `API_URL`. Commit y push: Vercel publica solo.

Si después cambiás el código de Apps Script: **Implementar → Administrar implementaciones → editar → Nueva versión**, para que la URL siga siendo la misma.

## Cómo funciona la propuesta de Claude

Cuando la lista de espera esté revisada, Anto le pide a Claude en el chat "armá la propuesta del viaje". Claude lee los votos y estados de la planilla y escribe en la hoja oculta `app_propuesta`:

- `texto`: la recomendación (orden por días, distancias, alojamiento, costos, alertas), en markdown simple.
- `fecha`: cuándo se actualizó.
- `plan`: JSON `{"2026-12-26": ["id-actividad", ...], ...}` que el botón **Aplicar al cronograma** usa para ubicar las actividades.

## Notas

- Cualquiera con el link puede votar y cargar cosas (no hay login). Es un link para el grupo, no lo publiques.
- La app no lee la sección "Datos importantes" de la hoja "Necesarios" (DNI, contactos): eso queda solo en la planilla.
- Los votos de los demás se actualizan cada 25 segundos.
