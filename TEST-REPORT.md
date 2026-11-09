# Reporte de pruebas

Fecha: 9 de noviembre de 2026. Resultado global: **experimental; no candidato a producción todavía**.

## Laboratorio multijugador NetherNet automatizado

- Rama: `nethernet-load-test`, derivada de `native-nethernet-experimental`.
- Herramienta aislada: `tools/nethernet-load-test/`.
- Tests locales de la herramienta: 11/11 PASS.
- Tests seleccionados de transporte/versión de bedboo: 12/12 PASS en el commit
  `254bfcc4d05ddad767ac95e6208f6e1942dea8f3`.
- Servidor autorizado `102.129.137.35:9000`: **NOT TESTED** desde este entorno.
- Escenarios automatizados de 1/2/5/10 clientes: **NOT TESTED**; no había identidades Microsoft/Xbox disponibles.
- Egg, startup, instalador, Wings, Docker, firewall y servidores de clientes: sin cambios.

Consulte `tools/nethernet-load-test/REPORT.md` y `RESEARCH.md` para los requisitos de ejecución y hallazgos.

## Ejecutado y aprobado

- Descarga desde la API oficial e inspección de los paquetes Linux `1.26.63.1` y Preview `1.26.70.23`.
- Registro SHA-256 de ambos ZIP.
- Comparación de `server.properties` y `bedrock_server_how_to.html` incluidos.
- Detección `auto` contra las guías oficiales extraídas: `stable-shared` para `1.26.63.1` y
  `preview-shared` para `1.26.70.23`.
- Validación JSON del Egg `PTDL_v2` generado.
- `bash -n` para instalador y startup.
- Fixture stable-shared: produce `IP:public:local`, mantiene `online-mode=true`, crea backup.
- Fixture preview-shared: usa `server-public-ip`, puerto compartido y elimina `transport` no documentado.
- Check-only: hash de `server.properties` idéntico antes y después.
- Parser de PowerShell para las herramientas de generación, validación e inventario dry-run.
- `go test -count=1 ./...` y `go vet ./...` del publicador Legacy sin regresiones.
- El instalador preserva archivos de configuración existentes, no elimina archivos desconocidos y fija/verifica el
  SHA-256 del binario Legacy v1.3.0.

Comando reproducible:

```powershell
./tools/build-egg.ps1
./tools/validate.ps1
```

## No ejecutado

- Importación real en Panel/Pterodactyl.
- Arranque del BDS Linux oficial dentro de Wings/Docker.
- Consola interactiva y comando `stop` con el Egg nuevo.
- Conexión Minecraft real de 1, 2, 5 o 10 jugadores.
- Redes externas, CGNAT, NAT simétrico, IPv6 o TURN.
- Reinicio de contenedor y persistencia real del mundo.
- Actualización o migración de un servidor existente.
- Prueba de addons/modificaciones de clientes.
- Restore real desde backup.

## Matriz pendiente de aceptación

| Prueba | Criterio | Estado |
|---|---|---|
| Arranque estable | `Server started`, sin error de settings | Pendiente |
| Señalización externa | `/v1/join` desde otra red | Pendiente |
| 1 jugador | autentica, aparece XUID correcto | Pendiente |
| 2 jugadores simultáneos | ambos permanecen conectados en un único UDP | Pendiente crítica |
| 5 y 10 jugadores | sin puertos adicionales ni timeouts | Pendiente crítica |
| Reconexión | libera/reutiliza sesión correctamente | Pendiente |
| Persistencia | mismo mundo y archivos tras reinicio | Pendiente |
| Rollback | Native → Legacy sin allocation nueva | Pendiente |

No se puede declarar resuelto BDS-23121 ni promocionar el Egg hasta completar las pruebas críticas.
