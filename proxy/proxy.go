package main

import (
	"context"
	"crypto/ecdsa"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/df-mc/go-nethernet"
	"github.com/df-mc/go-nethernet/endpoint"
	"github.com/pion/ice/v4"
	"github.com/pion/webrtc/v4"
	"github.com/sandertv/gophertunnel/minecraft"
	"github.com/sandertv/gophertunnel/minecraft/protocol/login"
	"github.com/sandertv/gophertunnel/minecraft/protocol/packet"
)

// The shared-UDP-port NetherNet listener below follows the approach used by Portal
// (github.com/MEMOxiiii/portal, Apache-2.0): one pion UDP mux serves every WebRTC session.

const (
	transportRakNet    = "raknet"
	transportNetherNet = "nethernet"
)

// netherNetServer owns the HTTP signaling endpoint and the UDP mux backing the single media port.
type netherNetServer struct {
	http *http.Server
	tcp  net.Listener
	mux  *ice.MultiUDPMuxDefault
}

// singleHeaderWriter tolerates handlers that call WriteHeader after Write. net/http has already
// sent 200 at that point and otherwise emits a misleading "superfluous response.WriteHeader" line.
type singleHeaderWriter struct {
	http.ResponseWriter
	wroteHeader bool
}

func (w *singleHeaderWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func (w *singleHeaderWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *singleHeaderWriter) Write(p []byte) (int, error) {
	w.wroteHeader = true
	return w.ResponseWriter.Write(p)
}

func (s *netherNetServer) Close() error {
	err := s.http.Close()
	if e := s.tcp.Close(); e != nil && !errors.Is(e, net.ErrClosed) {
		err = errors.Join(err, e)
	}
	return errors.Join(err, s.mux.Close())
}

// newNetherNet builds the signaling endpoint on TCP host:port and a minecraft.Network whose WebRTC media
// all flows through UDP port (the same number), so a single allocated port is enough.
func newNetherNet(host string, publicIP string, port int, creds *nethernet.Credentials, key *ecdsa.PrivateKey, log *slog.Logger) (minecraft.Network, *netherNetServer, error) {
	// Link-local addresses (fe80::/10, 169.254/16) often cannot be bound inside containers, so skip them.
	mux, err := ice.NewMultiUDPMuxFromPort(port, ice.UDPMuxFromPortWithIPFilter(func(ip net.IP) bool {
		return !ip.IsLinkLocalUnicast() && !ip.IsLinkLocalMulticast()
	}))
	if err != nil {
		return nil, nil, fmt.Errorf("udp mux on port %d: %w", port, err)
	}
	settings := webrtc.SettingEngine{}
	settings.SetICEUDPMux(mux)
	// A regular server-reflexive candidate gathered through STUN uses another ephemeral socket in
	// Pion. Pterodactyl does not publish that socket. Rewriting the mux host candidate makes the SDP
	// advertise the node's public IP with the one allocated UDP port instead.
	settings.SetNAT1To1IPs([]string{publicIP}, webrtc.ICECandidateTypeHost)

	handler := endpoint.HandlerConfig{
		Logger:      log,
		Credentials: func(context.Context) (*nethernet.Credentials, error) { return creds, nil },
	}.New()

	tcp, err := net.Listen("tcp", net.JoinHostPort(host, fmt.Sprint(port)))
	if err != nil {
		_ = mux.Close()
		return nil, nil, fmt.Errorf("signaling listener: %w", err)
	}

	network := minecraft.NetherNet{
		Signaling: handler,
		Log:       log,
		ListenConfig: nethernet.ListenConfig{
			API:                 webrtc.NewAPI(webrtc.WithSettingEngine(settings)),
			IssueServerIdentity: issueIdentity(key),
		},
	}
	srv := &netherNetServer{
		http: &http.Server{
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				handler.ServeHTTP(&singleHeaderWriter{ResponseWriter: w}, r)
			}),
			ReadHeaderTimeout: 10 * time.Second,
		},
		tcp: tcp,
		mux: mux,
	}
	return network, srv, nil
}

// iceCredentials combines unauthenticated STUN with an optional authenticated TURN fallback.
// Environment variables intentionally take precedence so an imported egg can enable TURN for old
// installations without overwriting their config.json.
func iceCredentials(cfg Config) (*nethernet.Credentials, bool, error) {
	servers := make([]nethernet.ICEServer, 0, 2)
	if len(cfg.ICEServers) > 0 {
		servers = append(servers, nethernet.ICEServer{URLs: cfg.ICEServers})
	}

	turnURLs := cfg.TURNURLs
	if value := strings.TrimSpace(os.Getenv("TURN_URLS")); value != "" {
		turnURLs = strings.FieldsFunc(value, func(r rune) bool { return r == ',' || r == ';' })
	}
	username := cfg.TURNUsername
	if value := os.Getenv("TURN_USERNAME"); value != "" {
		username = value
	}
	password := cfg.TURNPassword
	if value := os.Getenv("TURN_PASSWORD"); value != "" {
		password = value
	}
	for i := range turnURLs {
		turnURLs[i] = strings.TrimSpace(turnURLs[i])
	}
	turnEnabled := len(turnURLs) > 0
	if turnEnabled && (strings.TrimSpace(username) == "" || password == "") {
		return nil, false, errors.New("TURN_URLS requires both TURN_USERNAME and TURN_PASSWORD")
	}
	if !turnEnabled && (strings.TrimSpace(username) != "" || password != "") {
		return nil, false, errors.New("TURN_USERNAME/TURN_PASSWORD require TURN_URLS")
	}
	if turnEnabled {
		servers = append(servers, nethernet.ICEServer{URLs: turnURLs, Username: username, Password: password})
	}
	return &nethernet.Credentials{ExpirationInSeconds: 86400, ICEServers: servers}, turnEnabled, nil
}

// runProxy accepts players on the public transport and relays each to the backend until ctx is cancelled.
func runProxy(ctx context.Context, cfg Config, backend string, log *slog.Logger) error {
	port := cfg.publicPort()
	addr := net.JoinHostPort(cfg.Host, fmt.Sprint(port))

	key, err := loadIdentityKey(cfg.IdentityKeyFile)
	if err != nil {
		return fmt.Errorf("identity key: %w", err)
	}

	// AuthenticationDisabled must stay false: the proxy is what authenticates players, because the
	// backend runs with online-mode=false and trusts whatever identity the proxy presents.
	lc := minecraft.ListenConfig{
		ErrorLog:       log,
		MaximumPlayers: int(cfg.MaxPlayers),
		StatusProvider: status{motd: cfg.Motd},
	}
	if os.Getenv("BEDROCK_PROXY_INSECURE_TEST_NO_AUTH") == "1" {
		// For automated tests only: lets clients without an Xbox account join, with any name.
		log.Warn("PLAYER AUTHENTICATION IS DISABLED (BEDROCK_PROXY_INSECURE_TEST_NO_AUTH=1); never use this on a public server")
		lc.AuthenticationDisabled = true
	}

	var l *minecraft.Listener
	switch cfg.PublicTransport {
	case transportNetherNet:
		publicIP, source, err := resolvePublicIP(ctx, cfg)
		if err != nil {
			return fmt.Errorf("public NetherNet address: %w", err)
		}
		creds, turnEnabled, err := iceCredentials(cfg)
		if err != nil {
			return fmt.Errorf("ICE configuration: %w", err)
		}
		network, nn, err := newNetherNet(cfg.Host, publicIP, port, creds, key, log)
		if err != nil {
			return err
		}
		defer nn.Close()
		if l, err = lc.ListenNetwork(network, addr); err != nil {
			return fmt.Errorf("listen: %w", err)
		}
		// The signaling handler rejects offers until the listener is registered, so serve only now.
		go func() { _ = nn.http.Serve(nn.tcp) }()
		log.Info("proxy listening", "public", "nethernet", "tcp", port, "udp", port, "advertised_ip", publicIP, "ip_source", source, "turn_fallback", turnEnabled, "backend", backend)
	default:
		if l, err = lc.Listen(transportRakNet, addr); err != nil {
			return fmt.Errorf("listen: %w", err)
		}
		log.Info("proxy listening", "public", "raknet", "udp", port, "backend", backend)
	}
	defer l.Close()

	go func() { <-ctx.Done(); _ = l.Close() }()
	for {
		c, err := l.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		go handlePlayer(ctx, c.(*minecraft.Conn), cfg, backend, key, log)
	}
}

// dialBackend connects to the backend as the given player. For a NetherNet backend the proxy signs its own
// identity token, which a backend with online-mode=false accepts.
func dialBackend(ctx context.Context, cfg Config, backend string, key *ecdsa.PrivateKey, id login.IdentityData, cd login.ClientData, log *slog.Logger) (*minecraft.Conn, error) {
	d := minecraft.Dialer{IdentityData: id, ClientData: cd, ErrorLog: log}
	if cfg.BackendTransport == transportRakNet {
		return d.DialContext(ctx, transportRakNet, backend)
	}
	ident, err := nethernet.GenerateServerIdentity(key, "self")
	if err != nil {
		return nil, fmt.Errorf("create identity: %w", err)
	}
	n := minecraft.NetherNet{Log: log, Signaling: endpoint.NewClient()}
	n.Dialer.Identity = ident
	return d.DialContextNetwork(ctx, n, backend)
}

// handlePlayer connects one player to the backend, presenting the identity the proxy already verified.
func handlePlayer(ctx context.Context, client *minecraft.Conn, cfg Config, backend string, key *ecdsa.PrivateKey, log *slog.Logger) {
	started := time.Now()
	id := client.IdentityData()
	log.Info("player connecting", "player", id.DisplayName, "xuid", id.XUID, "addr", client.RemoteAddr(), "backend", backend)
	log = log.With("player", id.DisplayName, "xuid", id.XUID)
	defer client.Close()

	dctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	server, err := dialBackend(dctx, cfg, backend, key, id, client.ClientData(), log)
	cancel()
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			log.Error("backend signaling answered but the local NetherNet/WebRTC session did not become ready; managed servers use automatic ephemeral UDP ports, so do not allocate or publish a manual server-udp-ports range", "err", err)
		} else {
			log.Error("could not join the backend; check the preceding NetherNet error code and the BDS console", "backend", backend, "err", err)
		}
		_ = client.WritePacket(&packet.Disconnect{Message: "Server is unavailable, try again shortly."})
		return
	}
	defer server.Close()
	log.Info("backend transport connected", "dial_time", time.Since(started).Round(time.Millisecond))

	var wg sync.WaitGroup
	var startErr, spawnErr error
	wg.Add(2)
	go func() { defer wg.Done(); startErr = client.StartGame(server.GameData()) }()
	go func() { defer wg.Done(); spawnErr = server.DoSpawn() }()
	wg.Wait()
	if err := errors.Join(startErr, spawnErr); err != nil {
		log.Error("join failed", "err", err)
		return
	}
	log.Info("player joined", "join_time", time.Since(started).Round(time.Millisecond))
	var clientPackets, serverPackets atomic.Uint64
	defer func() {
		log.Info("player left", "session_duration", time.Since(started).Round(time.Second), "client_packets", clientPackets.Load(), "server_packets", serverPackets.Load())
	}()

	done := make(chan struct{}, 2)
	relay := func(from, to *minecraft.Conn, packets *atomic.Uint64) {
		defer func() { done <- struct{}{} }()
		for {
			pk, err := from.ReadPacket()
			if err != nil {
				var dc minecraft.DisconnectError
				if errors.As(err, &dc) {
					_ = to.WritePacket(&packet.Disconnect{Message: dc.Error()})
				}
				return
			}
			if err := to.WritePacket(pk); err != nil {
				return
			}
			packets.Add(1)
		}
	}
	go relay(client, server, &clientPackets)
	go relay(server, client, &serverPackets)
	select {
	case <-done:
	case <-ctx.Done():
	}
}
