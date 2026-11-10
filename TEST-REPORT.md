# Reporte de pruebas

Fecha: 9 de noviembre de 2026. Resultado global: **experimental; no candidato a producción todavía**.

## Laboratorio multijugador NetherNet automatizado

- Rama: `nethernet-load-test`, derivada de `native-nethernet-experimental`.
- Herramienta aislada: `tools/nethernet-load-test/`.
- Tests locales de la herramienta: 23/23 PASS para escenarios 1/10/30/50, suite progresiva, cancelación, timeout/incompleto, pérdida de red, parada por recursos y continuidad tras desconexión.
- Tests seleccionados de transporte/autenticación/versión de bedboo: 28/28 PASS en el commit
  `254bfcc4d05ddad767ac95e6208f6e1942dea8f3`.
- BDS 1.26.63.1 rechazó la preparación inicial `online-mode=false` + `allow-list=true` con código 2; no fue un fallo de NetherNet ni memoria.
- El startup corregido aplica OFFLINE `false/false` sólo con aprobación y constancia separada de restricción de red; sin ambas aborta antes de escribir propiedades.
- Servidor autorizado `102.129.137.35:9000`: pruebas bloqueadas hasta confirmar una ACL externa TCP+UDP a los orígenes de laboratorio.
- Escenarios automatizados de 1/10/30/50 clientes: **NOT TESTED**.
- Wings, Docker, firewall, mundos, allocations y servidores de clientes: sin cambios.

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
- Fixture OFFLINE LAB: `online-mode=false`, `allow-list=false`; no arranca si falta la constancia de red.
- Fixture de reversión Xbox: `online-mode=true`, `allow-list=true` cuando `ALLOW_LIST=true`.
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
- Conexión Minecraft real de 1, 10, 30 o 50 jugadores.
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
