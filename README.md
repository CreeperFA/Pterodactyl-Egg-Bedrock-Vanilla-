# SuperCores Bedrock para Pterodactyl

Repositorio del Egg experimental de Minecraft Bedrock Dedicated Server para SuperCores Hosting y del
modo proxy anterior usado como rollback. La variante nativa ejecuta `bedrock_server` directamente,
mantiene `online-mode=true` y usa una única asignación de Pterodactyl publicada como TCP y UDP.

> Estado: **experimental, no aprobado para producción**. La configuración fue validada localmente,
> pero todavía no se ejecutaron pruebas reales de 2, 5 y 10 clientes en un nodo Wings externo.

## Artefactos

- `egg-supercores-bedrock-nethernet.json`: Egg dual, Native NetherNet o Legacy Proxy.
- `scripts/supercores-start.sh`: detección conservadora de capacidades y configuración idempotente.
- `scripts/install.sh`: fuente del instalador embebido en el Egg.
- `tools/build-egg.ps1`: genera el Egg desde las fuentes anteriores.
- `tools/validate.ps1`: valida JSON, Bash, perfiles stable/preview, backup y check-only.
- `tools/plan-pterodactyl-migration.ps1`: inventario API exclusivamente dry-run; nunca modifica servidores.
- `proxy/`: publicador Legacy de la release v1.3.0.

## Modos

### Native NetherNet

```text
Jugador -- TCP+UDP mismo puerto --> BDS oficial
```

No termina la sesión del jugador en un proxy y conserva autenticación Xbox/XUID. El script sólo habilita
este modo si el paquete oficial documenta un puerto UDP compartido. Wings publica cada asignación en ambos
protocolos con el mismo número según su implementación de bindings.

### Legacy Proxy

```text
Jugador -- NetherNet público --> bedrock-proxy -- NetherNet loopback --> BDS
```

Es un rollback explícito. No se selecciona automáticamente y conserva las limitaciones documentadas de la
release v1.3.0.

## Hallazgo principal, 9 de noviembre de 2026

- La estable disponible es BDS Linux `1.26.63.1`. Su guía incluida admite un puerto compartido y exige
  anunciar NAT con `server-udp-ports=IP:public:local`.
- Preview `1.26.70.23` usa `server-public-ip` separado y hace que el UDP predeterminado coincida con
  `server-port`. Mojang advierte que Preview puede ser inestable.
- El Egg detecta esas capacidades leyendo `bedrock_server_how_to.html`; no supone que una sintaxis sirve
  para todas las versiones.
- BDS-23121 figura cerrado como “Awaiting Response”, no como una prueba pública de corrección. La aceptación
  final depende de pruebas externas reales.

Fuentes primarias: [Preview 26.70.23](https://www.minecraft.net/da-dk/article/minecraft-preview-26-70-23),
[changelog estable 26.60](https://feedback.minecraft.net/hc/en-us/articles/49852828563853-Minecraft-Bedrock-Edition-26-60-Changelog),
[propiedades BDS](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/server-properties),
[bindings de Wings](https://github.com/pterodactyl/wings/blob/develop/environment/allocations.go) y
[Egg oficial vigente](https://github.com/pterodactyl/game-eggs/blob/main/minecraft/bedrock/bedrock/egg-vanilla-bedrock.json).

Consulta [AUDIT.md](AUDIT.md), [COMPATIBILITY.md](COMPATIBILITY.md), [INSTALLATION.md](INSTALLATION.md),
[MIGRATION.md](MIGRATION.md), [TEST-REPORT.md](TEST-REPORT.md) y [ROLLBACK.md](ROLLBACK.md) antes de usarlo.

## Desarrollo

```powershell
./tools/build-egg.ps1
./tools/validate.ps1
```

El Egg raíz y sus herramientas se distribuyen bajo MIT. El código de `proxy/` conserva su licencia
original en `proxy/LICENSE`.
