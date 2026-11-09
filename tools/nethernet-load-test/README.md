# SuperCores NetherNet multiplayer laboratory

Herramienta experimental para comprobar 1, 2, 5 o 10 clientes Bedrock simultáneos contra **BDS 1.26.63.1 por NetherNet**, sin tocar el Egg, el nodo ni el mundo. Un cliente sólo cuenta después del evento `spawn`: la señalización `/v1/join` por sí sola nunca se considera una conexión exitosa.

Estado actual: **NOT TESTED contra el servidor real**. Las pruebas locales y de dependencias están documentadas en [RESEARCH.md](RESEARCH.md) y [REPORT.md](REPORT.md).

## Seguridad y alcance

- Límite duro: 10 clientes; no hay reconexiones automáticas.
- Intervalo permitido: 3–5 segundos.
- El destino debe coincidir exactamente con `authorization.target` y requerir `authorization.confirmed=true`.
- `Ctrl+C`/`SIGTERM` cierra todas las sesiones.
- No envía chat, comandos ni acciones de mundo; sólo mantiene el cliente normal conectado.
- Nunca modifica `online-mode`, `server.properties`, Egg, Wings, Docker o firewall.
- El modo offline requiere una aprobación separada y no certifica Xbox/Microsoft.
- Las cachés Microsoft deben estar fuera del repositorio y ser distintas para cada identidad.

## Escenarios

| Nombre CLI | Clientes | Permanencia simultánea |
|---|---:|---:|
| `basic` | 1 | 60 s |
| `multiplex` | 2 | 120 s |
| `medium` | 5 | 180 s |
| `expanded` | 10 | 300 s |

La permanencia empieza después de que todos los intentos hayan llegado a `spawn` o hayan agotado su timeout. Los primeros clientes permanecen conectados durante la rampa más el período simultáneo.

## Preparación de identidades

Para el resultado de referencia use `auth.mode=microsoft`, una cuenta que posea Minecraft por cliente y un `profilesFolder` absoluto y distinto por identidad. La primera ejecución muestra el flujo oficial de device code; los tokens quedan únicamente en esas carpetas externas. No copie tokens al JSON ni al repositorio.

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

## Windows con Docker (recomendado)

No instala nada en el nodo de SuperCores. Requiere Docker Desktop en la PC:

```powershell
Copy-Item config.example.json config.json
# Edite config.json: authorization.confirmed, escenario y 1/2/5/10 identidades.
# En Docker use perfiles /auth/account-01, /auth/account-02, etc.
docker build -t supercores-nethernet-test .
docker run --rm -it `
  -v "${PWD}\config.json:/config/config.json:ro" `
  -v "C:\supercores-secrets\bedboo:/auth" `
  -v "${PWD}\reports:/reports" `
  supercores-nethernet-test --config /config/config.json --scenario basic
```

En el JSON usado por Docker configure `reportDirectory: "/reports"`.

## Windows sin Docker

Requiere Git y Node.js 24 o superior. El script clona el commit fijado de bedboo en `.runtime/`, aplica sus dependencias parcheadas y no toca el nodo:

```powershell
Copy-Item config.example.json config.json
.\scripts\setup.ps1
node .\src\cli.js --config .\config.json --check
.\scripts\run.ps1 -Config .\config.json -Scenario basic
```

`--check` valida y genera un informe `NOT TESTED`; no abre ninguna conexión de red. Ejecute luego, en orden, `basic`, `multiplex`, `medium` y `expanded`. No salte directamente a diez.

## Linux

```bash
cp config.example.json config.json
./scripts/setup.sh
node src/cli.js --config config.json --check
./scripts/run.sh config.json basic
```

## Informes

Cada ejecución crea `reports/<UTC-run-id>/` con:

- `REPORT.md`: resultado y limitaciones legibles.
- `results.json`: eventos, ICE y métricas completas.
- `connections.csv`: una fila resumen por cliente.
- `errors.log`: errores clasificados de señalización, ICE, UDP/red, autenticación o servidor.

`PASS` exige que todos lleguen a `spawn`, alcancen el máximo simultáneo solicitado y permanezcan juntos durante todo el período. Un éxito de bots no prueba por sí solo qué puertos observó el nodo; para certificar el puerto compartido se necesita además captura o inspección en Wings/host.

## Desarrollo

```powershell
node --test tests/*.test.js
```

La dependencia se fija a bedboo `254bfcc4d05ddad767ac95e6208f6e1942dea8f3`; no se usa automáticamente una revisión nueva.
