# Rollback

El rollback no cambia allocations, no reinstala y no elimina mundos.

## Native a Legacy Proxy

1. Detén BDS con `stop` y confirma que quedó offline.
2. Respalda el estado actual antes de sustituir archivos.
3. Confirma que existen `bedrock-proxy-linux` y `config.json` de v1.3.0.
4. Restaura las properties previas si el backup existe:

   ```bash
   cp -p .supercores/backups/server.properties.pre-native server.properties
   ```

5. Establece `BEDROCK_NETWORK_MODE=legacy_proxy` desde administración.
6. Ejecuta `SUPERCORES_CHECK_ONLY=1 ./supercores-start.sh --check`.
7. Inicia y comprueba `proxy listening`, backend ready y una conexión real.

`BACKEND_PORT` permanece interno al contenedor y puede repetirse entre servidores; no debe agregarse como
allocation pública.

## Volver al Egg anterior

Si también falla Legacy, conserva el servidor detenido, restaura la definición exportada del Egg v1.3.0 y el
backup externo verificado. Restaura primero en una ubicación separada y comprueba hashes antes de sustituir el
volumen. No uses **Reinstall** ni sobrescribas la única copia del mundo.

## Abortá la migración si

- El perfil `auto` no reconoce la guía del BDS.
- La IP anunciada es privada o no coincide con la ruta pública.
- `/v1/join` no responde desde otra red.
- Aparece `start ICE: context deadline exceeded` repetidamente.
- Un segundo jugador no puede entrar mientras el primero permanece conectado.
- Cambian XUID, permisos, allowlist o contenido del mundo.
