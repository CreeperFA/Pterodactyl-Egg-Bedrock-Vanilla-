package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestManagedBackendAlwaysUsesLoopback(t *testing.T) {
	cfg := defaultConfig()
	cfg.ServerCommand = []string{"./bedrock_server"}
	cfg.BackendAddress = "http://172.18.0.46:19140"
	got, ignored, err := backendAddress(cfg, 19140)
	if err != nil {
		t.Fatal(err)
	}
	if got != "http://127.0.0.1:19140" || !ignored {
		t.Fatalf("got address %q, ignored=%v", got, ignored)
	}
}

func TestExternalNetherNetBackendGetsHTTPScheme(t *testing.T) {
	cfg := defaultConfig()
	cfg.ServerCommand = nil
	cfg.BackendAddress = "bedrock.internal:19140"
	got, ignored, err := backendAddress(cfg, 0)
	if err != nil || ignored || got != "http://bedrock.internal:19140" {
		t.Fatalf("got address %q, ignored=%v, err=%v", got, ignored, err)
	}
}

func TestManagedPropertiesNeedNoAllocatedUDPRange(t *testing.T) {
	cfg := defaultConfig()
	cfg.Properties = map[string]string{
		"server-port":      "9999",
		"server-udp-ports": "30000-30010",
		"online-mode":      "true",
	}
	props := managedProperties(cfg, 19140)
	if props["server-port"] != "19140" || props["server-udp-ports"] != "" || props["online-mode"] != "false" {
		t.Fatalf("managed properties were not enforced: %#v", props)
	}
	if props["enable-lan-visibility"] != "false" || props["transport"] != "nethernet" {
		t.Fatalf("unexpected managed properties: %#v", props)
	}
}

func TestWaitForBackendChecksDiscoveryEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/join" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.BackendReadyTimeoutSeconds = 1
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if err := waitForBackend(context.Background(), cfg, server.URL, log); err != nil {
		t.Fatal(err)
	}
}

func TestValidateConfigRejectsMissingExternalBackend(t *testing.T) {
	cfg := defaultConfig()
	err := validateConfig(&cfg)
	if err == nil || !strings.Contains(err.Error(), "backend_address") {
		t.Fatalf("expected backend_address error, got %v", err)
	}
}

func TestLegacyRakNetConfigMigratesToNetherNet(t *testing.T) {
	t.Setenv("BEDROCK_PROXY_LEGACY_RAKNET", "")
	transport, migrated := effectivePublicTransport(transportRakNet)
	if transport != transportNetherNet || !migrated {
		t.Fatalf("transport=%q migrated=%v", transport, migrated)
	}

	t.Setenv("BEDROCK_PROXY_LEGACY_RAKNET", "1")
	transport, migrated = effectivePublicTransport(transportRakNet)
	if transport != transportRakNet || migrated {
		t.Fatalf("legacy override: transport=%q migrated=%v", transport, migrated)
	}
}

func TestResolvePublicIPPrecedence(t *testing.T) {
	t.Setenv("PUBLIC_IP", "198.51.100.20")
	t.Setenv("SERVER_IP", "198.51.100.30")
	ip, source, err := resolvePublicIP(context.Background(), Config{PublicIP: "192.0.2.10"})
	if err != nil || ip != "192.0.2.10" || source != "config.public_ip" {
		t.Fatalf("ip=%q source=%q err=%v", ip, source, err)
	}
}

func TestResolvePublicIPUsesPterodactylAllocation(t *testing.T) {
	t.Setenv("PUBLIC_IP", "")
	t.Setenv("SERVER_IP", "203.0.113.40")
	ip, source, err := resolvePublicIP(context.Background(), Config{})
	if err != nil || ip != "203.0.113.40" || source != "SERVER_IP" {
		t.Fatalf("ip=%q source=%q err=%v", ip, source, err)
	}
}

func TestICECredentialsAddOptionalTURNFallback(t *testing.T) {
	t.Setenv("TURN_URLS", "turn:relay.example.com:3478?transport=udp, turns:relay.example.com:5349?transport=tcp")
	t.Setenv("TURN_USERNAME", "bedrock")
	t.Setenv("TURN_PASSWORD", "secret")
	creds, enabled, err := iceCredentials(defaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	if !enabled || len(creds.ICEServers) != 2 {
		t.Fatalf("enabled=%v servers=%+v", enabled, creds.ICEServers)
	}
	turn := creds.ICEServers[1]
	if turn.Username != "bedrock" || turn.Password != "secret" || len(turn.URLs) != 2 {
		t.Fatalf("unexpected TURN configuration: %+v", turn)
	}
}

func TestICECredentialsRejectIncompleteTURN(t *testing.T) {
	t.Setenv("TURN_URLS", "turn:relay.example.com:3478")
	t.Setenv("TURN_USERNAME", "")
	t.Setenv("TURN_PASSWORD", "")
	if _, _, err := iceCredentials(defaultConfig()); err == nil || !strings.Contains(err.Error(), "TURN_USERNAME") {
		t.Fatalf("expected missing credentials error, got %v", err)
	}
}
