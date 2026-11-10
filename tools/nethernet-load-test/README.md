# SuperCores NetherNet multiplayer laboratory

Herramienta experimental para comprobar 1, 10, 30 o 50 clientes Bedrock simultáneos contra **BDS 1.26.63.1 por NetherNet**, sin tocar el Egg, el nodo ni el mundo. Un cliente sólo cuenta después del evento `spawn`: la señalización `/v1/join` o una conexión WebRTC incompleta nunca se consideran un ingreso exitoso.

Estado actual: **NOT TESTED contra el servidor real**. Las pruebas locales y de dependencias están documentadas en [RESEARCH.md](RESEARCH.md) y [REPORT.md](REPORT.md).

## Seguridad y alcance

- Límite duro: 50 clientes; no hay reconexiones automáticas.
- Intervalo permitido: 3–5 segundos.
- El destino debe coincidir exactamente con `authorization.target` y requerir `authorization.confirmed=true`.
- `Ctrl+C`/`SIGTERM` cierra todas las sesiones.
- No envía chat, comandos ni acciones de mundo; sólo mantiene el cliente normal conectado.
- Nunca modifica `online-mode`, `server.properties`, Egg, Wings, Docker o firewall.
- El modo offline exige `offlineApproved`, constancia administrativa `networkRestrictionVerified` y los dos marcadores del startup; ninguno demuestra por sí solo que la ACL funciona.
- Los escenarios de 30 y 50 exigen aprobación de escala separada, capacidad declarada suficiente y PASS del escenario anterior.
- Las cachés Microsoft deben estar fuera del repositorio y ser distintas para cada identidad.

## Escenarios

| Nombre CLI | Clientes | Permanencia simultánea |
|---|---:|---:|
| `basic` | 1 | 180 s |
| `medium` | 10 | 180 s |
| `high` | 30 | 180 s |
| `maximum` | 50 | 180 s |

La permanencia comienza únicamente cuando todos los clientes requeridos alcanzaron `spawn`. Una desconexión intermedia invalida el período continuo y nunca puede terminar en PASS.

## Preparación de identidades

Para el resultado de referencia use `auth.mode=microsoft`, una cuenta que posea Minecraft por cliente y un `profilesFolder` absoluto y distinto por identidad. La primera ejecución muestra el flujo oficial de device code; los tokens quedan únicamente en esas carpetas externas. No copie tokens al JSON ni al repositorio.

Para el laboratorio offline, `"generateOfflineClients": true` crea exactamente `SCBot01` a `SCBot50`, con id y sesión independientes. Esto no elimina la obligación de aislar el endpoint público.

El servidor de laboratorio permanece con `online-mode=true`. No ejecute el perfil offline hasta recibir autorización expresa para cambiar temporalmente el laboratorio; esta herramienta no hace ni revierte ese cambio.

### Alternar solamente el laboratorio

El startup experimental exige dos marcadores. La aprobación offline debe contener exactamente:

```text
I_ACKNOWLEDGE_THIS_IS_AN_ISOLATED_OFFLINE_LAB
```

La constancia `.supercores/lab-network-restriction-approved` debe existir solamente después de verificar una ACL externa para TCP+UDP y contener:

```text
I_CONFIRM_NETWORK_ACCESS_IS_RESTRICTED_TO_AUTHORIZED_TEST_ORIGINS
```

Con ambos marcadores, el próximo arranque aplica `online-mode=false` y `allow-list=false`. BDS 1.26.63.1 rechaza `online-mode=false` con `allow-list=true`; si falta una confirmación, el preflight termina antes de modificar `server.properties`. Al retirar los marcadores y reiniciar, aplica `online-mode=true` y restaura `ALLOW_LIST`. En una copia local del directorio puede gestionarse con:

```powershell
.\scripts\lab-auth.ps1 -Mode offline -ServerDirectory C:\ruta\del\servidor `
  -NetworkRestrictionConfirmed -AuthorizedOrigins '198.51.100.25/32 (bot runner)'
# ejecutar pruebas y luego:
.\scripts\lab-auth.ps1 -Mode xbox -ServerDirectory C:\ruta\del\servidor
```

El helper no crea la restricción: sólo registra que un administrador ya la verificó. No modifica firewall, proveedor, Wings ni Docker. No habilite offline sobre una IP pública sin esa protección.

### Capacidad reversible del laboratorio

Pterodactyl vuelve a escribir `max-players` desde `MAX_PLAYERS` antes del arranque. Por eso `lab-capacity.sh` no edita directamente `server.properties`: con confirmación explícita crea `.supercores/lab-capacity-50-approved`, y el startup lo aplica después del parser únicamente cuando OFFLINE LAB también está activo. Registra el valor observado y puede retirar el marcador:

```bash
./scripts/lab-capacity.sh prepare
./scripts/lab-capacity.sh apply --confirm-laboratory-capacity-change
# reiniciar sólo el laboratorio; después de cerrar todos los bots:
./scripts/lab-capacity.sh restore
# reiniciar: vuelve al MAX_PLAYERS configurado en Pterodactyl
```

No se debe ejecutar `apply` hasta autorizar la ventana. El helper no cambia el Panel, el Egg productivo ni servidores de clientes.

## Windows con Docker (recomendado)

No instala nada en el nodo de SuperCores. Requiere Docker Desktop en la PC:

```powershell
Copy-Item config.example.json config.json
# Edite config.json: autorizaciones, ACL verificada, capacidad y escenario.
# En Docker use perfiles /auth/account-01, /auth/account-02, etc.
docker build -t supercores-nethernet-test .
docker run --rm -it `
  -v "${PWD}\config.json:/config/config.json:ro" `
  -v "C:\supercores-secrets\bedboo:/auth" `
  -v "${PWD}\reports:/reports" `
  supercores-nethernet-test --config /config/config.json --suite
```

En el JSON usado por Docker configure `reportDirectory: "/reports"`.

## Windows sin Docker

Requiere Git y Node.js 24 o superior. El script clona el commit fijado de bedboo en `.runtime/`, aplica sus dependencias parcheadas y no toca el nodo:

```powershell
Copy-Item config.example.json config.json
.\scripts\setup.ps1
node .\src\cli.js --config .\config.json --suite --check
.\scripts\run.ps1 -Config .\config.json -Scenario basic
```

`--suite --check` valida los cuatro escenarios y genera informes `NOT TESTED` sin abrir red. La suite real ejecuta `basic`, `medium`, `high` y `maximum`, cierra todas las sesiones y espera `recoverySeconds` entre etapas. Se detiene ante cualquier resultado distinto de PASS. Antes de 30 y 50, el operador debe revisar capacidad y habilitar la aprobación correspondiente en el JSON.

## Linux

```bash
cp config.example.json config.json
./scripts/setup.sh
node src/cli.js --config config.json --suite --check
./scripts/run.sh config.json basic
```

## Informes

Cada ejecución crea `reports/<UTC-run-id>/` con:

- `REPORT.md`: resultado y limitaciones legibles.
- `results.json`: eventos, ICE y métricas completas.
- `connections.csv`: una fila resumen por cliente.
- `errors.log`: errores clasificados de señalización, ICE, UDP/red, autenticación o servidor.

`--suite` crea además un `REPORT.md` y `results.json` consolidados con las cuatro filas. Cada escenario conserva sus cuatro artefactos independientes.

## Observabilidad opcional

Si el operador dispone de un colector autorizado, puede habilitar `observability` y entregar un archivo JSON absoluto actualizado con los campos disponibles, por ejemplo `cpuPercent`, `memoryPercent`, `networkRxBytes`, `networkTxBytes`, `processRunning`, `serverAvailable`, `players`, `tps`, `mspt` o `serverErrors`. No son obligatorios y la herramienta no inventa los ausentes. CPU o RAM en el umbral configurado, proceso detenido, servidor no disponible o pérdida del archivo activan una parada de seguridad. La herramienta no obtiene acceso al nodo ni ejecuta comandos remotos.

`PASS` exige que todos lleguen a `spawn`, alcancen el máximo simultáneo solicitado y permanezcan juntos durante todo el período. Un éxito de bots no prueba por sí solo qué puertos observó el nodo; para certificar el puerto compartido se necesita además captura o inspección en Wings/host.

## Desarrollo

```powershell
node --test tests/*.test.js
```

La dependencia se fija a bedboo `254bfcc4d05ddad767ac95e6208f6e1942dea8f3`; no se usa automáticamente una revisión nueva.
