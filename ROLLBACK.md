# Rollback

El rollback no cambia allocations, no reinstala y no elimina mundos.

## OFFLINE LAB a Xbox

1. Retirar `.supercores/lab-offline-approved`, `.supercores/lab-network-restriction-approved`, `.supercores/lab-capacity-50-approved` y sus archivos informativos.
2. Reiniciar el laboratorio. El startup aplica `online-mode=true`, restaura `ALLOW_LIST` y vuelve al `MAX_PLAYERS` configurado en Pterodactyl.
3. Confirmar ambas propiedades en consola/archivo antes de retirar la ACL temporal externa.

El helper `tools/nethernet-load-test/scripts/lab-auth.ps1 -Mode xbox` realiza solamente el paso 1 sobre un directorio local; no toca red ni Pterodactyl. `lab-capacity.sh restore` conserva los marcadores retirados dentro de `.supercores/backups/`.

## Native a Legacy Proxy

1. Detener BDS con `stop` y confirmar que quedó offline.
2. Verificar que existen `bedrock-proxy-linux`, `config.json` y `identity.key` si ya se utilizaba Legacy.
3. Restaurar la copia creada antes del primer arranque Native:

   ```bash
   cp -p .supercores/backups/server.properties.pre-native server.properties
   ```

4. Establecer `BEDROCK_NETWORK_MODE=legacy_proxy` desde administración.
5. Ejecutar `SUPERCORES_CHECK_ONLY=1 ./supercores-start.sh --check`.
6. Iniciar y comprobar `proxy listening`, backend ready y una conexión real.

Legacy fuerza las propiedades necesarias para su backend, incluyendo su modelo de autenticación. No publicar
`BACKEND_PORT`; sigue siendo interno al contenedor.

## Restauración completa

Si también falla Legacy, mantener el servidor detenido y restaurar el backup externo verificado durante la
migración. Restaurar en un directorio separado primero, comprobar hashes y sólo entonces coordinar la sustitución.
No sobrescribir el único mundo disponible ni borrar el volumen anterior hasta verificar la restauración.

## Criterios de abortar

- El check detecta una versión/perfil desconocido.
- La IP anunciada es privada, `0.0.0.0` o no coincide con la asignación pública.
- TCP `/v1/join` no responde desde otra red.
- Aparece `start ICE: context deadline exceeded` repetidamente.
- Un segundo jugador no entra mientras el primero sigue conectado.
- Cambian XUID, permissions/allowlist o contenido del mundo.
