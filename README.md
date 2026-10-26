# Bedrock Vanilla para Pterodactyl

Egg de Pterodactyl/Pelican y proxy integrado para Bedrock Dedicated Server 1.26+.
Resuelve la migración de BDS desde RakNet a NetherNet sin asignar manualmente un
rango UDP diferente a cada servidor.

```text
Jugador -- NetherNet / 1 número de puerto TCP+UDP --> proxy -- NetherNet interno --> BDS
```

## Qué automatiza

- Cada servidor usa una sola asignación pública de Pterodactyl; NetherNet usa TCP y UDP con el mismo número.
- Las configuraciones antiguas con `public_transport=raknet` migran automáticamente a NetherNet.
- El candidato ICE anuncia automáticamente `SERVER_IP` sobre el mismo puerto UDP del panel; si la
  asignación usa `0.0.0.0`, el proxy descubre la IPv4 pública o permite fijarla con `PUBLIC_IP`.
- Admite un relay TURN compartido como fallback para jugadores detrás de CGNAT simétrico o redes
  restrictivas; las conexiones directas siguen siendo la ruta preferida.
- Todos los contenedores pueden reutilizar `BACKEND_PORT=19140`; no se publica en el host.
- El proxy ignora direcciones Docker `172.x.x.x` antiguas y conecta por `127.0.0.1`.
- `server-udp-ports` queda vacío para que BDS use puertos efímeros dentro del contenedor.
- Fuerza las propiedades de red requeridas: `transport=nethernet`, `online-mode=false` y
  `enable-lan-visibility=false`.
- Espera a que `/v1/join` responda antes de aceptar jugadores.
- Mantiene estable `identity.key` entre reinicios.
- Registra por jugador el tiempo de conexión, la duración y los paquetes en cada dirección para
  distinguir demora de handshake, red y saturación del proceso.
- Evita el aviso engañoso `superfluous response.WriteHeader` generado por el endpoint de estado.

## Instalación

1. Descarga `egg-vanilla-bedrock-proxy.json` desde la última release.
2. En Pterodactyl, ve a **Nests → Import Egg** e importa el JSON.
3. Crea el servidor con una sola asignación pública. El nodo debe permitir TCP y UDP para ese número.
4. Conserva `BACKEND_PORT=19140`. No añadas asignaciones para ese puerto ni rangos UDP.

En nodos con una asignación IP real no hace falta completar nada más. Si la asignación del nodo usa
`0.0.0.0`, el proxy intenta descubrir la IPv4 pública. En servidores multi-IP o detrás de NAT configura
`PUBLIC_IP` con la dirección concreta que recibe el tráfico de esa asignación.

### Clientes que reciben `Door` / `InitialConnection-83`

Si el log muestra `start ICE: context deadline exceeded` mientras otros jugadores sí entran, el
backend y la asignación están funcionando: la red de ese cliente no pudo establecer una ruta UDP
directa. Configura en el egg `TURN_URLS`, `TURN_USERNAME` y `TURN_PASSWORD` con un relay TURN propio
o del proveedor. Puede ser un único servicio para todos los contenedores y nodos; no se instala un
rango nuevo dentro de cada Docker. Es recomendable anunciar UDP y también TLS/TCP, por ejemplo:

```text
TURN_URLS=turn:relay.example.com:3478?transport=udp,turns:relay.example.com:5349?transport=tcp
```

Las tres variables son administrativas y quedan ocultas a los usuarios. Al arrancar, la línea
`proxy listening` indica `turn_fallback=true` sin imprimir las credenciales. Un TURN externo es un
servicio adicional: el egg no puede crear de forma segura credenciales o puertos relay públicos por
sí solo. Sólo las conexiones que no logren una ruta directa deberían usarlo, por lo que la mayoría
no incorpora la latencia del relay.

El instalador descarga automáticamente la versión actual de BDS y el binario Linux amd64
del proxy desde esta misma release.

## Actualización de servidores existentes

Reinstala el servidor desde el panel o sustituye `bedrock-proxy-linux` por el binario de la
release. Los mundos, permisos, allowlists y propiedades ajenas a la red se conservan. Una
configuración vieja con `backend_address=http://172...` o un rango manual no bloquea la
migración: el proxy los corrige al arrancar y deja una advertencia clara en consola.

Bedrock 1.26.60+ ya no debe depender del fallback RakNet. Para una reversión temporal con clientes
anteriores puede definirse `BEDROCK_PROXY_LEGACY_RAKNET=1`, pero no se recomienda en producción.

## Desarrollo

El código Go vive en [`proxy/`](proxy/). La release ejecuta `go test ./...`, `go vet ./...`
y compila binarios estáticos para Linux amd64, Linux arm64 y Windows amd64.

El egg y la automatización raíz se distribuyen bajo la licencia MIT de este repositorio.
El proxy conserva su licencia original en [`proxy/LICENSE`](proxy/LICENSE).
