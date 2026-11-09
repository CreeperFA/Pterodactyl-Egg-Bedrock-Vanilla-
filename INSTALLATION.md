# Instalación aislada

Estas instrucciones son sólo para un servidor nuevo de laboratorio. No importar sobre un Egg productivo
ni ejecutar Reinstall en servidores de clientes.

## Requisitos

1. Una asignación primaria con IP y puerto exclusivos para el servidor.
2. El mismo número permitido en TCP y UDP en el firewall del nodo y del proveedor.
3. BDS estable `1.26.63.1` o una versión posterior cuya guía incluida documente “Single shared port”.
4. Una IPv4/IPv6 pública literal. Si la asignación del Panel es `0.0.0.0`, completar `PUBLIC_IP`.

Wings crea bindings TCP y UDP para cada asignación; no hace falta agregar otra asignación para el mismo
número. Esto está confirmado en [Allocations.Bindings](https://github.com/pterodactyl/wings/blob/develop/environment/allocations.go).

## Pasos

1. Ejecutar `tools/build-egg.ps1` y `tools/validate.ps1`.
2. Importar `egg-supercores-bedrock-nethernet.json` como Egg nuevo, no actualizar todavía el productivo.
3. Crear un servidor de laboratorio con `BEDROCK_CHANNEL=stable`, `BEDROCK_VERSION=latest` y
   `BEDROCK_NETWORK_MODE=native`.
4. Configurar `PUBLIC_IP` cuando `SERVER_IP` no sea la IP pública alcanzable.
5. Instalar sólo el servidor de laboratorio. El instalador obtiene BDS desde la API oficial, registra URL,
   versión y SHA-256 en `.supercores/`, y verifica el binario Legacy v1.3.0 contra un hash fijado.
6. Antes de arrancar, usar por consola/terminal:

   ```bash
   SUPERCORES_CHECK_ONLY=1 ./supercores-start.sh --check
   ```

7. Arrancar y comprobar una línea equivalente a:

   ```text
   [SuperCores] mode=native profile=stable-shared ... public=203.0.113.10:19132
   ```

8. Desde otra red, `curl http://IP:PUERTO/v1/join` debe responder. Esto sólo valida señalización TCP;
   todavía se necesitan clientes Minecraft para validar ICE/UDP y multijugador.
9. En la consola del primer arranque ejecutar `serveridentity save` y respaldar `keys/`. Sin una clave guardada,
   BDS cambia de identidad en cada reinicio y los jugadores deben volver a aceptar la confianza del servidor.

## Propiedades aplicadas

El script no cambia mundos, permisos ni complementos. En funcionamiento normal administra `online-mode=true` y restaura `allow-list` desde la variable `ALLOW_LIST`. En estable shared aplica:

```properties
server-port=PUERTO_PRINCIPAL
server-ip=
server-udp-ports=IP_PUBLICA:PUERTO_PRINCIPAL:PUERTO_PRINCIPAL
transport=nethernet
online-mode=true
enable-lan-visibility=false
```

En Preview shared elimina `transport`, usa `server-public-ip=IP_PUBLICA` y
`server-udp-ports=PUERTO_PRINCIPAL`, conforme a la guía incluida en `1.26.70.23`.

No abrir UDP 7551: es descubrimiento LAN y se desactiva para evitar conflictos entre contenedores.
