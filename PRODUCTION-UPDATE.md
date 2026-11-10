# Actualización del Egg en SuperCores Hosting

La importación y el piloto deben ser ejecutados por el administrador. Esta release no modifica servidores.

## Respaldo previo

1. Exporta el Egg v1.3.0 actual desde Pterodactyl y registra su ID.
2. Descarga y verifica `worlds/`, `server.properties`, JSON de permisos/allowlist, packs, complementos y `keys/`.
3. Registra startup, imagen Docker, variables y allocation primaria actuales.
4. Verifica restauración del backup en una ubicación separada.

## Importación segura

1. Importa `egg-supercores-bedrock-nethernet.json` como Egg nuevo; no reemplaces todavía el Egg productivo.
2. Prueba un servidor piloto nuevo.
3. Para un servidor existente, detén con `stop`; no uses **Reinstall**.
4. Asocia el Egg nuevo mediante el procedimiento administrativo del Panel y sincroniza manualmente:

   ```text
   Startup: bash ./supercores-start.sh
   Docker image: ghcr.io/ptero-eggs/yolks:debian
   BEDROCK_NETWORK_MODE=native
   NATIVE_PROFILE=auto
   PUBLIC_IP=<IP pública literal si SERVER_IP no es publicable>
   BEDROCK_CHANNEL=stable
   BEDROCK_VERSION=1.26.63.1 (o una versión exacta aprobada posteriormente)
   SUPERCORES_RELEASE=v2.0.0-beta.2 (fijar el tag aprobado; latest queda para laboratorios/pilotos)
   ALLOW_LIST=<valor actual>
   MAX_PLAYERS=<valor actual>
   EXECUTABLE=./bedrock_server
   LD_LIBRARY_PATH=.
   ```

5. En una instalación nueva, Install descarga el startup y lo verifica automáticamente. En un servidor existente,
   el simple **Update Egg** no ejecuta Install ni coloca archivos: sincroniza el script durante una ventana controlada
   o reinstala sólo después de confirmar el backup y la política de preservación.
6. Mantén la allocation actual si el mismo número funciona por TCP y UDP; no asignes rangos ni publiques
   `BACKEND_PORT`.
7. Ejecuta check-only y revisa el plan antes de iniciar.
8. Inicia el piloto, valida clientes reales y conserva una ventana de rollback.

No reinicies Wings, no reinstales BDS, no cambies allocations y no migres en lote como parte de esta actualización.

## Sincronización manual

Pterodactyl no aplica automáticamente todas las nuevas variables/startup a servidores ya creados. Compara cada
servidor con la lista anterior; los valores de nombre, modo de juego, dificultad, cheats, allowlist y max players
deben conservarse. TURN y `BACKEND_PORT` sólo son relevantes si se elige `legacy_proxy`.
