# Evaluación técnica de clientes NetherNet

Fecha: 2026-11-09.

## Decisión

Se eligió [LiteLDev/bedboo](https://github.com/LiteLDev/bedboo) fijado al commit [`254bfcc`](https://github.com/LiteLDev/bedboo/commit/254bfcc4d05ddad767ac95e6208f6e1942dea8f3). No se copió ni modificó su código: la herramienta se instala como consumidor dentro de su monorepo para conservar los parches de dependencias requeridos.

## Hallazgos de bedboo

- Licencia: `LGPL-3.0-only`, declarada en `COPYING.LESSER`, README y `package.json` del proyecto.
- Runtime: Node.js 24 o superior; NetherNet usa una implementación WebRTC JavaScript.
- Compatibilidad declarada: familia `1.26.60`, protocolo 2225, incluyendo BDS `1.26.63.1`. El repositorio contiene datos de protocolo y una sonda registrada para esa versión.
- Transporte: `transport: 'nethernet'` con señalización HTTP sobre el puerto público del BDS. Su parche de `bedrock-protocol`/`node-nethernet` implementa `GET/POST /v1/join`.
- Autenticación: `offline` y `microsoft` mediante `bedrock-protocol`/`prismarine-auth`. Microsoft admite caché externa y device code; cada bot de esta herramienta exige identidad/caché independiente.
- Entrada real: el evento `spawn` ocurre después de `start_game`, posición real, respuesta de respawn, `play_status player_spawn` y ACK de loading screen. Por eso es el umbral de éxito y no la respuesta HTTP.
- Sesiones: cada `createBot()` construye su propio cliente, conexión WebRTC, identidad y estado de mundo. Esta herramienta crea una instancia independiente por definición.
- ICE: la conexión subyacente expone `RTCPeerConnection.connectionState`, `iceConnectionState`, `iceGatheringState` y, cuando existe, estadísticas de candidate pair.

La documentación del repositorio afirma pruebas live smoke sobre las cuatro builds 1.26.60–1.26.63.1. En este trabajo no se toma esa afirmación como sustituto de nuestra prueba externa: el servidor autorizado todavía figura `NOT TESTED`.

## Validación ejecutada localmente

- Instalación reproducible del monorepo con pnpm 12.14.0 y lockfile: PASS.
- Tests upstream seleccionados de transporte HTTP NetherNet, firma de identidad, opciones de autenticación y familias de versión: 12/12 PASS.
- Tests propios de seguridad/configuración, diagnósticos, informes, conteo posterior a `spawn` y continuidad tras desconexión: 12/12 PASS.
- Sintaxis de JavaScript y scripts Bash: PASS.
- Build/ejecución de la imagen Docker: NOT TESTED; Docker no estaba instalado en este entorno.
- Conexión a `102.129.137.35:9000`: NOT TESTED.
- 1/2/5/10 clientes reales: NOT TESTED.
- Microsoft/Xbox: NOT TESTED; no había identidades/tokens disponibles en este entorno.

## Alternativas revisadas

- [df-mc/go-nethernet](https://github.com/df-mc/go-nethernet): MIT y adecuado para WebRTC/NetherNet, pero es una capa de transporte; por sí solo no implementa el ingreso completo y estado de cliente Bedrock.
- [Sandertv/gophertunnel](https://github.com/Sandertv/gophertunnel): MIT y contiene cliente/protocolo Bedrock además de integración NetherNet, pero exige construir y mantener explícitamente el ciclo completo de login/spawn. Es una buena alternativa si bedboo falla, con mayor costo de implementación.
- [cinnabar-mc/cinnabar](https://github.com/cinnabar-mc/cinnabar): cliente completo, pero su licencia principal es PolyForm Noncommercial 1.0.0 y su objetivo no es un harness liviano de diez sesiones para hosting comercial.

## Riesgos conocidos

- bedboo aún no está publicado en npm y depende de parches internos; por eso se fija el commit y se usa el lockfile original.
- Unpinning de la identidad del servidor sobre HTTP tiene confianza similar a RakNet. `target.serverKey` permite fijar el fingerprint `sha256:` cuando se capture de forma confiable.
- Un `PASS` desde una sola red no cubre clientes detrás de NAT/CGNAT distintos.
- Sin observabilidad del nodo no se puede afirmar que no hubo puertos auxiliares; sólo que las sesiones usaron el mismo endpoint configurado.
