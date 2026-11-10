# Minecraft Bedrock Vanilla — Native NetherNet Beta

Primera beta pública del Egg Native NetherNet para BDS estable `1.26.63.1`.

Descarga `egg-supercores-bedrock-nethernet.json` e impórtalo inicialmente como Egg nuevo. Native usa una sola
allocation publicada con el mismo número por TCP y UDP, ejecuta BDS sin proxy intermedio y mantiene autenticación
Xbox. La release incluye el Egg Legacy v1.3.0 y sus binarios únicamente como rollback explícito.

Antes de actualizar servidores existentes lee `PRODUCTION-UPDATE.md`; **Update Egg no sincroniza por sí solo el
startup, scripts ni todas las variables, y no debe ejecutarse Reinstall sobre mundos de clientes**.

Estado: JSON/startup/instalador y perfiles se validaron automáticamente. Las pruebas formales de 10, 30 y 50
jugadores no se realizaron. La compatibilidad multijugador sigue siendo beta y requiere resultados comunitarios.
