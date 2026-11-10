# Estado de validación de v2.0.0-beta.2

Resultado: **beta pública; configuración validada localmente, multijugador comunitario pendiente**.

## Validaciones aprobadas

- JSON PTDL_v2 generado y parseado correctamente.
- El instalador embebe exactamente la versión fuente de `supercores-start.sh`.
- `bash -n` para instalador y startup.
- Fixture estable: produce `IP:public:local`, `transport=nethernet` y conserva `online-mode=true`.
- Fixture Preview: usa `server-public-ip`, puerto compartido y elimina `transport` no documentado.
- Sincronización de `ALLOW_LIST` y `MAX_PLAYERS` desde las variables del Egg.
- Rechazo previo de IP Docker/privadas sin modificar `server.properties`.
- Check-only sin cambios de archivos ni inicio de procesos.
- Backup previo a Native y generación reproducible del Egg.
- `go test ./...` y `go vet ./...` del rollback Legacy sin regresiones.
- Auditoría de secretos y ausencia de herramientas bedboo, identidades offline, marcadores y destino del laboratorio.

## No ejecutado como validación de esta release

- Importación y actualización en un Panel productivo.
- Reinicio real dentro de todos los modelos de Wings/Docker usados por la comunidad.
- Pruebas formales de 10, 30 o 50 jugadores: **no realizadas**.
- Matriz externa de CGNAT, NAT simétrico, IPv6, redes móviles y redes empresariales.
- Restore completo desde backup de un servidor de cliente.

Observaciones informales previas no se contabilizan como certificación de esta release. Cada despliegue debe probarse
primero en un servidor piloto.

## Matriz comunitaria pendiente

| Prueba | Criterio | Estado inicial |
|---|---|---|
| Arranque | `Server started` sin error de properties | Pendiente |
| Señalización | `/v1/join` responde externamente | Pendiente |
| 1 jugador | Xbox/XUID correcto y spawn | Pendiente |
| 2 simultáneos | Ambos permanecen usando una sola allocation | Pendiente crítica |
| 5–10 simultáneos | Sin puertos adicionales ni timeouts ICE | Pendiente crítica |
| Reconexión | Libera y reutiliza sesión correctamente | Pendiente |
| Persistencia | Mismo mundo e identidad tras reinicio | Pendiente |
| Rollback | Native → Legacy sin reinstalación | Pendiente |

Usa [COMMUNITY-TESTING.md](COMMUNITY-TESTING.md) para reportar resultados. No se declara resuelto ningún ticket
upstream hasta completar evidencia reproducible.
