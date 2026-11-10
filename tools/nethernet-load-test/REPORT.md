# Estado del laboratorio multijugador NetherNet

Estado: **NOT TESTED**

La herramienta y sus pruebas locales están preparadas, pero todavía no se ejecutó ninguna conexión contra `102.129.137.35:9000`. BDS 1.26.63.1 confirmó que rechaza `online-mode=false` junto con `allow-list=true` y termina con código 2. El modo corregido `false/false` queda bloqueado hasta verificar una restricción externa de TCP+UDP 9000 a los orígenes autorizados. El perfil final seguirá exigiendo autenticación Microsoft/Xbox legítima.

## Ejecutado

- Validación del diseño y configuración: PASS.
- Tests propios: 23/23 PASS después de la ampliación a 50 bots.
- Tests upstream seleccionados de bedboo: 28/28 PASS.
- Sintaxis JavaScript/Bash: PASS.
- Preflight de seguridad: PASS; una aprobación offline sin constancia de red no modifica propiedades.
- Transición reversible: PASS local para OFFLINE `false/false` y Xbox `true/true`.

## Pendiente, en orden

1. Aplicar y verificar una ACL externa sobre TCP+UDP 9000 para los orígenes de prueba.
2. Activar los marcadores de OFFLINE LAB y red, después autorizar el marcador de capacidad 50.
3. Comprobar que BDS arranca con `online-mode=false`, `allow-list=false`, `max-players=50`.
4. `basic`: 1 bot, 180 segundos.
5. `medium`: 10 bots, 180 segundos.
6. Revisar métricas/capacidad y autorizar `high`: 30 bots, 180 segundos.
7. Revisar métricas/capacidad y autorizar `maximum`: 50 bots, 180 segundos.
8. Cerrar bots, restaurar capacidad, retirar marcadores, reiniciar y comprobar Xbox antes de retirar la ACL.
9. Correlacionar cada run con logs BDS y, si se autoriza, captura/inspección TCP+UDP del nodo.

El Egg experimental fue regenerado sólo en esta rama para reconocer el marcador reversible de capacidad. No se importó en Pterodactyl ni se generó una release. Tampoco se considera estable por las dos conexiones manuales previas ni por las pruebas unitarias.
