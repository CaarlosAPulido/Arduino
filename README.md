# Arduino

## Arduino Esplora Fighter

Esta aplicación web es un prototipo de juego de pelea que utiliza datos de sensores de Arduino Esplora.

### Archivos principales

- `index.html` — Interfaz del juego y canvas de renderizado.
- `styles.css` — Estilos para la página y paneles.
- `script.js` — Lógica de conexión a sensores, motor básico de juego y renderizado.

### Cómo ejecutar

1. Abre el proyecto en un servidor local.
   - Por ejemplo, con Python 3:
     - `python3 -m http.server 8000`
2. Abre `http://localhost:8000` en tu navegador.

### Control de juego

- Joystick: movimiento horizontal y salto.
- Botones 1-4: ataques ligeros y pesados.
- Slider: potencia de ataque.
- Acelerómetro Z: golpe especial.

### Notas

La aplicación intenta usar un WebSocket en `wss://arduino.arroyocreativa.com` y, si falla, poll REST en `https://arduino.arroyocreativa.com/api/sensors`.
