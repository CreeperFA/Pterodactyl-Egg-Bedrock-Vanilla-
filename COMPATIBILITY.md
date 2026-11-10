# Compatibilidad

Estado investigado el 9 de noviembre de 2026. “Candidato” describe compatibilidad de configuración, no una
certificación multijugador real.

| BDS | Transporte / propiedades | Estado del Egg |
|---|---|---|
| `1.26.52.3` y anteriores afectadas | NetherNet abre puertos por conexión; el caso reportado falla al reutilizar uno | Native no permitido automáticamente; usar Legacy o rango aislado |
| `1.26.60`–`1.26.62` | NetherNet obligatorio desde 26.60, pero no inspeccionamos cada artefacto histórico | No certificado; `auto` decide por la guía instalada y las pruebas reales siguen pendientes |
| `1.26.63.1` estable | `server-udp-ports=IP:public:local`; un solo puerto puede compartirse | Objetivo de la beta Native; validación comunitaria pendiente |
| `1.26.70.23` Preview | `server-public-ip`; UDP predeterminado a `server-port`; configuración inválida impide iniciar | Experimental, nunca producción |
| Posteriores | Desconocido hasta inspeccionar artefacto y changelog | `auto` sólo acepta capacidades documentadas; requiere nueva validación |

## Evidencia directa de artefactos oficiales

Descargados desde la API oficial de Minecraft:

| Artefacto Linux | SHA-256 observado | Resultado |
|---|---|---|
| `bedrock-server-1.26.63.1.zip` | `B40B04C8F5A7C42A19EE685C22FC593E66116B9C22741B8C75489306B252FF62` | La guía y properties describen puerto compartido e IP prefijada |
| `bedrock-server-1.26.70.23.zip` Preview | `9E789AB977020F2681F6A1E96F14953C458F74E254AB745CDFF5B8504DB01619` | La guía introduce `server-public-ip` y default UDP compartido |

Los hashes son un registro de los archivos obtenidos por HTTPS, no una firma publicada por Mojang.

## BDS-23121

El reporte afecta 26.52 y documenta que el segundo jugador no podía reutilizar el único puerto. El tracker
público lo cerró temporalmente el 30 de octubre como “Awaiting Response” por falta de información; no contiene
una fix version. Por eso no se usa el estado del ticket como prueba de solución. Véase
[BDS-23121](https://bugs.mojang.com/browse/BDS-23121).

## Docker y Pterodactyl

- Wings publica cada allocation como `<puerto>/tcp` y `<puerto>/udp` con el mismo host port.
- `SERVER_PORT` es la asignación primaria.
- `SERVER_IP` puede ser una IP de binding, `0.0.0.0` o una dirección no publicable; `PUBLIC_IP` tiene que
  representar la dirección alcanzable desde Internet.
- Actualizar un Egg no modifica automáticamente el startup ni la imagen ya guardados en servidores existentes,
  según la [documentación de Pterodactyl](https://docs.pterodactyl.io/v2/guides/egg-creation/creating-custom-egg).

## Implementaciones comunitarias auditadas

- `itzg/docker-minecraft-bedrock-server`: documentación útil para versiones previas con rangos; no sustituye
  las pruebas del binario Mojang actual.
- `PgLESv/bedrock-nethernet`: multiplexer SDP/STUN sin licencia declarada y con binario versionado; no se reutiliza.
- `JoanFo1456/bedrock-proxy`: ofrece proxy y mux comunitarios. Se mantiene nuestro fork v1.3.0 sólo como rollback.
- Egg oficial Pterodactyl: inicia `./bedrock_server` pero, al momento de la auditoría, no configura los nuevos
  perfiles de NAT/shared-port.
