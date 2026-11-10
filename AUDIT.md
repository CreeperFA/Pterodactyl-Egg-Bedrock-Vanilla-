# Auditoría de publicación

Base comparada: Egg/proxy v1.3.0 (`655658d`) y rama experimental `nethernet-load-test`.

| Área | Decisión de la beta |
|---|---|
| Startup | Native directo como predeterminado; Legacy sólo por selección administrativa explícita |
| Autenticación | Native fuerza `online-mode=true`; no existe modo offline público |
| Red | Una allocation TCP+UDP; el startup configura la sintaxis compartida documentada por el BDS instalado |
| IP pública | Exige dirección literal y rechaza rangos privados, loopback y link-local |
| Variables | Sincroniza allowlist y límite de jugadores; perfiles forzados no son editables por usuarios |
| Instalación | Conserva archivos del cliente, registra origen/hash de BDS y fija/verifica el rollback v1.3.0 |
| Persistencia | No toca mundos, packs, permisos ni allocations; crea backup previo de properties |
| Actualización | Definición, variables y startup de servidores existentes requieren sincronización manual |
| Laboratorio | bedboo, identidades offline, marcadores, capacidad 50 y endpoints concretos quedan excluidos |

## Riesgos abiertos

- Falta validación comunitaria multijugador sobre distintos nodos y redes.
- Una IP pública válida pero equivocada puede iniciar correctamente y aun así impedir ICE.
- La señalización NetherNet usa HTTP/TCP; protección o rate limiting externo depende de la infraestructura.
- Variables ocultas son legibles por procesos dentro del contenedor y no constituyen un almacén de secretos.
- Preview puede cambiar properties sin compatibilidad previa; se recomienda exclusivamente `stable`.

No se copió código de proyectos comunitarios sin licencia. El diseño Native se basa en propiedades del paquete
oficial BDS; el código Legacy existente conserva su licencia separada.
