# Migración de servidores existentes

No ejecutar esta migración hasta completar las pruebas reales descritas en `TEST-REPORT.md`.

## Lo que Update Egg sí y no hace

Actualizar el archivo del Egg cambia su definición y variables. Los servidores existentes conservan su startup
y su imagen Docker; el instalador tampoco se vuelve a ejecutar automáticamente. Por eso importar el JSON no
migra 80 contenedores ni coloca `supercores-start.sh` en sus volúmenes.

## Fase 1: inventario dry-run

La herramienta sólo hace `GET` a la Application API y escribe un plan; no contiene llamadas PATCH, reinstalación,
reinicio ni cambios de allocation:

```powershell
./tools/plan-pterodactyl-migration.ps1 `
  -PanelUrl https://panel.example.com `
  -ApiKey $env:PTERODACTYL_APPLICATION_KEY `
  -SourceEggId 12 -TargetEggId 34 `
  -OutputPath ./migration-plan.json
```

El plan propone inicialmente `legacy_proxy` para impedir un cambio silencioso de autenticación. El archivo puede
contener nombres/UUID de servidores y debe tratarse como información administrativa.

## Fase 2: prechecks por servidor

1. Confirmar nodo, asignación primaria y publicación TCP+UDP.
2. Confirmar espacio para el backup.
3. Detener limpiamente con `stop` y verificar que el proceso terminó.
4. Respaldar fuera del volumen:
   - `worlds/`
   - `server.properties`
   - `permissions.json`, `allowlist.json`
   - `resource_packs/`, `behavior_packs/` y desarrollos
   - `keys/`, si existe después de `serveridentity save`
   - complementos y archivos personalizados
5. Registrar hash/tamaño del backup y realizar una restauración de prueba separada.
6. Copiar `supercores-start.sh` y verificar permisos, sin reinstalar BDS.
7. Ejecutar check-only. Si no detecta perfil compartido, detener la migración.

## Fase 3: piloto reversible

Elegir un servidor de prueba sin clientes productivos. Mantener la allocation existente, cambiar explícitamente a
`native`, iniciar y ejecutar las pruebas 1/2/5/10. No migrar en lote hasta que dos redes externas distintas pasen.

## Fase 4: propuesta futura de automatización

Sólo después del piloto se puede agregar una herramienta PATCH separada. Deberá exigir: plan firmado/revisado,
backup confirmado, servidor detenido, script presente, lote pequeño, health check y rollback automático. La versión
actual deliberadamente no implementa Apply.
