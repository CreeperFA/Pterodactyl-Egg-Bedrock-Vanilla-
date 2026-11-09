# Auditoría del Egg anterior

Base auditada: `egg-vanilla-bedrock-proxy.json` y proxy v1.3.0 (`655658d`). No se modificaron otros Eggs ni
archivos comerciales.

| Área | Hallazgo | Tratamiento experimental |
|---|---|---|
| Startup | Ejecuta siempre `./bedrock-proxy-linux`; no existe selección nativa | Startup único `supercores-start.sh` con modo explícito |
| Instalador | Descarga BDS latest y proxy latest; sólo respaldaba tres JSON/properties; el proxy no tenía hash fijado | URL oficial registrada, checksum observado de BDS, proxy v1.3.0 fijado y verificado, exclusiones de archivos del cliente |
| Variables | `BACKEND_PORT=19140` es interno y puede repetirse por namespace; TURN estaba oculto pero no es secreto | Se conserva sólo en Legacy; la documentación aclara el riesgo de secretos de entorno |
| Red | Proxy público más backend loopback; depende de ICE/TURN y duplica procesamiento | Native elimina ese salto cuando el BDS documenta shared-port |
| Autenticación | El backend Legacy usa `online-mode=false` y confía en el proxy | Native fuerza `online-mode=true`; nunca cambia de modo automáticamente |
| IP pública | Descubrimiento externo puede devolver la salida equivocada en nodos multi-IP/NAT | Native exige IP literal configurada o `SERVER_IP` válido y muestra el valor antes de arrancar |
| Puertos | Publicación principal TCP+UDP correcta; backend no debe publicarse | Native reutiliza exactamente la allocation primaria; sin rangos por jugador |
| Inicio | Detección `Server started` es válida para BDS y proxy, pero no prueba conectividad externa | Se mantiene; el reporte exige `/v1/join` y clientes reales |
| Consola/stop | El proxy administra BDS como hijo; Native deja a Wings hablar directamente con BDS | `stop` permanece como comando del Egg |
| Persistencia | Update Egg no coloca scripts ni ejecuta installer en servidores existentes | Migración separada, dry-run y backup previo |
| Superficie | Proxy añade código, señalización HTTP y dependencias Go adicionales | Native prefiere el binario oficial; Legacy permanece sólo para rollback |

## Riesgos todavía abiertos

- El Egg no fue importado en un Panel real.
- No se verificó carga de complementos de clientes.
- No existe prueba multijugador externa sobre `1.26.63.1` en Wings.
- Un valor incorrecto de `PUBLIC_IP` permite iniciar pero hará fallar ICE desde Internet.
- Los valores ocultos del Egg siguen disponibles para procesos del contenedor; Pterodactyl advierte que no son
  un almacén de secretos en su [documentación de variables](https://docs.pterodactyl.io/v2/guides/egg-creation/egg-variables).
- La señalización de NetherNet es HTTP/TCP. La guía de BDS recomienda protegerla en despliegues públicos, pero
  introducir reverse proxy o rate limiting sería infraestructura global y queda fuera de este cambio.

## Proyectos comunitarios

Se revisaron `itzg/docker-minecraft-bedrock-server`, `PgLESv/bedrock-nethernet` y el upstream
`JoanFo1456/bedrock-proxy`. No se copió código de PgLESv porque el repositorio no declara licencia. El diseño
nativo se basa únicamente en propiedades documentadas por el paquete oficial de BDS y bindings oficiales de Wings.
