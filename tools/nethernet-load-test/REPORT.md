# Estado del laboratorio multijugador NetherNet

Estado: **NOT TESTED**

La herramienta y sus pruebas locales están preparadas, pero todavía no se ejecutó ninguna conexión contra `102.129.137.35:9000`. BDS 1.26.63.1 confirmó que rechaza `online-mode=false` junto con `allow-list=true` y termina con código 2. El modo corregido `false/false` queda bloqueado hasta verificar una restricción externa de TCP+UDP 9000 a los orígenes autorizados. El perfil final seguirá exigiendo autenticación Microsoft/Xbox legítima.

## Ejecutado

- Validación del diseño y configuración: PASS.
- Tests propios: 12/12 PASS.
- Tests upstream seleccionados de bedboo: 12/12 PASS.
- Sintaxis JavaScript/Bash: PASS.
- Preflight de seguridad: PASS; una aprobación offline sin constancia de red no modifica propiedades.
- Transición reversible: PASS local para OFFLINE `false/false` y Xbox `true/true`.

## Pendiente, en orden

1. Aplicar y verificar una ACL externa sobre TCP+UDP 9000 para los orígenes de prueba.
2. Activar ambos marcadores y comprobar que BDS arranca con `online-mode=false`, `allow-list=false`.
3. `basic`: 1 bot, 60 segundos.
4. `medium`: 5 bots, 180 segundos.
5. Retirar ambos marcadores, reiniciar y comprobar restauración Xbox.
6. Correlacionar el run con logs BDS y, si se autoriza, captura/inspección TCP+UDP del nodo.

No se modificó el Egg experimental ni se generó una release. Tampoco se considera estable por las dos conexiones manuales previas ni por las pruebas unitarias.
