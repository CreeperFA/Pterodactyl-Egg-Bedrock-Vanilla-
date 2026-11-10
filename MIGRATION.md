# Migración controlada

Actualizar una definición de Egg no cambia automáticamente startup, imagen ni variables guardadas en los
servidores existentes. El instalador tampoco se ejecuta hasta una reinstalación, que no debe usarse para migrar
servidores con mundos de clientes.

## Inventario dry-run

`tools/plan-pterodactyl-migration.ps1` sólo realiza consultas GET a la Application API y genera un plan. No
contiene PATCH, reinstalación, reinicio ni cambios de allocations.

```powershell
./tools/plan-pterodactyl-migration.ps1 `
  -PanelUrl https://panel.example.com `
  -ApiKey $env:PTERODACTYL_APPLICATION_KEY `
  -SourceEggId 12 -TargetEggId 34 `
  -OutputPath ./migration-plan.json
```

El plan propone inicialmente `legacy_proxy` para impedir una transición silenciosa. Puede contener nombres y
UUID administrativos; no debe publicarse.

## Orden recomendado

1. Inventariar nodo, versión BDS, allocation e IP pública de cada servidor.
2. Respaldar y verificar mundo, properties, JSON, packs, complementos y `keys/`.
3. Migrar primero un servidor piloto sin clientes productivos.
4. Sincronizar manualmente las variables indicadas en [PRODUCTION-UPDATE.md](PRODUCTION-UPDATE.md).
5. Copiar `supercores-start.sh`, ejecutar check-only y sólo después iniciar Native.
6. Validar dos clientes reales simultáneos desde redes distintas.
7. Mantener lotes pequeños y una ventana de rollback; no automatizar los demás servidores hasta validar el piloto.
