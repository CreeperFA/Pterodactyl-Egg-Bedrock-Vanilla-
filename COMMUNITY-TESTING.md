# Pruebas comunitarias NetherNet

Prueba únicamente servidores propios o autorizados. Usa BDS estable, autenticación Xbox y un servidor piloto.
No agregues bedboo, cuentas offline ni herramientas de carga a servidores de clientes.

## Secuencia mínima

1. Registra versión BDS, Panel/Wings, distribución del nodo, IP pública y allocation (puedes ocultar el último octeto).
2. Confirma que el mismo puerto está permitido en TCP y UDP.
3. Guarda las líneas `mode=native`, `profile=...`, `Server started` y cualquier error ICE/WebRTC.
4. Prueba un jugador desde fuera del nodo y confirma spawn/XUID.
5. Mantén el primer jugador conectado y prueba un segundo desde otra red.
6. Prueba reconexión y un reinicio limpio; confirma mundo e identidad persistentes.

## Datos del reporte

- Tag/Egg y versión exacta de BDS.
- Nuevo servidor o actualización; perfil detectado.
- Cantidad de jugadores y redes de origen.
- Resultado de señalización, ICE, spawn, permanencia y reconexión.
- Mensaje exacto del cliente y fragmento de consola con timestamps.
- Si el rollback Legacy funcionó.

No publiques IP completa, tokens, credenciales, `identity.key`, claves de Panel ni datos personales. Abre un issue
con la plantilla **NetherNet beta test** del repositorio.
