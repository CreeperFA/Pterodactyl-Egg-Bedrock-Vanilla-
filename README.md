# Minecraft Bedrock Vanilla para Pterodactyl

Beta pública del Egg de Minecraft Bedrock Dedicated Server con NetherNet nativo. Ejecuta el BDS oficial
directamente, conserva la autenticación Xbox (`online-mode=true`) y utiliza una sola asignación de
Pterodactyl publicada con el mismo número en TCP y UDP.

> La configuración y las rutas de actualización están validadas localmente. La compatibilidad multijugador
> en distintos nodos, NAT y redes de jugadores todavía requiere validación comunitaria.

## Modos

- `native` (predeterminado): cliente → BDS oficial mediante NetherNet, sin proxy de juego intermedio.
- `legacy_proxy`: rollback explícito al publicador de la release v1.3.0. Nunca se activa automáticamente.

## Instalación rápida

1. Descarga `egg-supercores-bedrock-nethernet.json` desde la release beta.
2. Impórtalo como un Egg nuevo en **Nests → Import Egg**.
3. Asigna un único puerto; el firewall debe permitir ese mismo número por TCP y UDP.
4. Usa `BEDROCK_CHANNEL=stable`, `BEDROCK_NETWORK_MODE=native` y `NATIVE_PROFILE=auto`.
5. Si `SERVER_IP` no es la IP pública alcanzable, define `PUBLIC_IP` desde administración.
6. El instalador descarga automáticamente el startup y los assets verificados de la release indicada por
   `SUPERCORES_RELEASE` (por defecto `latest`). Para producción, fija un tag aprobado.
7. Prueba primero en un servidor nuevo o piloto. No reinstales servidores de clientes para actualizar el Egg.

Consulta [INSTALLATION.md](INSTALLATION.md) para instalaciones nuevas y
[PRODUCTION-UPDATE.md](PRODUCTION-UPDATE.md) para actualizar una instalación existente de forma reversible.

## Comportamiento de seguridad

- Native fuerza `online-mode=true` en cada arranque.
- No contiene identidades offline, marcadores de laboratorio ni herramientas de carga.
- Rechaza IP privadas, loopback y link-local como dirección pública anunciada.
- No modifica mundos, permisos ni complementos.
- Crea una copia única de `server.properties` antes de la primera configuración Native.
- Descarga `supercores-start.sh` mediante la API de GitHub Releases y verifica su SHA-256 contra `SHA256SUMS`.
- `BACKEND_PORT` sólo pertenece al rollback Legacy y nunca debe publicarse.

## Compatibilidad

BDS estable `1.26.63.1` documenta el perfil compartido
`server-udp-ports=IP_PUBLICA:PUERTO_PUBLICO:PUERTO_LOCAL`. El startup inspecciona la guía incluida en cada
paquete y aborta si no reconoce una capacidad compartida; no adivina propiedades para versiones desconocidas.

Más información: [COMPATIBILITY.md](COMPATIBILITY.md), [TEST-REPORT.md](TEST-REPORT.md),
[COMMUNITY-TESTING.md](COMMUNITY-TESTING.md) y [ROLLBACK.md](ROLLBACK.md).

## Desarrollo y validación

```powershell
./tools/build-egg.ps1
./tools/validate.ps1
```

El Egg y sus herramientas están bajo MIT. El publicador Legacy conserva su licencia en `proxy/LICENSE`.
