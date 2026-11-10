# Instalación de la beta

Estas instrucciones son para un servidor nuevo o piloto. Importar el Egg no actualiza ni reinicia servidores
existentes.

## Requisitos

1. Pterodactyl Panel y Wings con una asignación primaria exclusiva.
2. El mismo número de puerto permitido por TCP y UDP en firewall, NAT y proveedor.
3. Una IP pública literal para anunciar a los clientes.
4. BDS estable `1.26.63.1` o posterior cuya guía incluida documente un puerto NetherNet compartido.

No se necesita un rango por jugador. Wings publica cada allocation como TCP y UDP con el mismo host port.

## Instalación nueva

1. Respalda la definición del Egg actual desde el Panel.
2. Importa `egg-supercores-bedrock-nethernet.json` como Egg nuevo.
3. Crea un servidor piloto con una única allocation.
4. Conserva estos valores:

   ```text
   BEDROCK_NETWORK_MODE=native
   NATIVE_PROFILE=auto
   BEDROCK_CHANNEL=stable
   BEDROCK_VERSION=1.26.63.1
   SUPERCORES_RELEASE=v2.0.0-beta.2 (o latest para seguir la última release publicada)
   ```

5. Configura `PUBLIC_IP` si `SERVER_IP` es `0.0.0.0`, privada o no coincide con la IP pública que recibe el
   tráfico. No uses una IP Docker `172.x.x.x`.
6. Instala el servidor. El instalador obtiene BDS desde la API oficial, descarga `supercores-start.sh` desde la
   release seleccionada, verifica `SHA256SUMS`, conserva archivos del cliente y registra versión, release y hashes
   en `.supercores/`. No hace falta subir el startup por SFTP.
7. Antes del primer arranque ejecuta:

   ```bash
   SUPERCORES_CHECK_ONLY=1 ./supercores-start.sh --check
   ```

8. Arranca y confirma `mode=native`, `profile=stable-shared`, la IP/puerto correctos y `Server started`.
9. Desde otra red prueba `http://IP:PUERTO/v1/join`; una respuesta sólo valida señalización TCP, no ICE/UDP.
10. Conecta clientes Bedrock reales y registra los resultados mediante [COMMUNITY-TESTING.md](COMMUNITY-TESTING.md).
11. Ejecuta `serveridentity save` y respalda `keys/` para mantener estable la identidad del servidor.

## Propiedades administradas en BDS estable

```properties
server-port=PUERTO_PRINCIPAL
server-ip=
server-udp-ports=IP_PUBLICA:PUERTO_PRINCIPAL:PUERTO_PRINCIPAL
transport=nethernet
online-mode=true
allow-list=VALOR_DEL_EGG
max-players=VALOR_DEL_EGG
enable-lan-visibility=false
```

No abras UDP 7551: corresponde al descubrimiento LAN y se desactiva para evitar conflictos entre contenedores.
Para instalaciones existentes sigue [PRODUCTION-UPDATE.md](PRODUCTION-UPDATE.md); no uses **Reinstall**.
