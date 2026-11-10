# Changelog

## v2.0.0-beta.1 — Native NetherNet Beta

- Añade ejecución Native directa del BDS oficial con una allocation TCP+UDP.
- Detecta perfiles estable/Preview desde la guía incluida en el paquete.
- Mantiene `online-mode=true` y sincroniza allowlist/límite desde el Egg.
- Rechaza direcciones privadas como IP pública anunciada.
- Añade instalación conservadora, backup previo, check-only y rollback Legacy v1.3.0.
- Añade documentación de instalación, actualización, compatibilidad, pruebas comunitarias y reversión.
- Excluye las herramientas bedboo, identidades offline, marcadores y configuraciones del laboratorio.

Breaking change: Native sustituye al proxy como modo predeterminado del Egg nuevo. Los servidores existentes no
cambian automáticamente y requieren el procedimiento manual documentado.
