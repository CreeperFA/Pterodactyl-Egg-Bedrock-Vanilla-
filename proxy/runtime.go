package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

var publicIPDiscoveryURLs = []string{
	"https://api4.ipify.org",
	"https://checkip.amazonaws.com",
}

func usableIP(value string, requirePublic bool) string {
	ip := net.ParseIP(strings.TrimSpace(value))
	if ip == nil || ip.IsUnspecified() || ip.IsLoopback() || ip.IsMulticast() {
		return ""
	}
	if requirePublic && (ip.IsPrivate() || ip.IsLinkLocalUnicast()) {
		return ""
	}
	return ip.String()
}

// resolvePublicIP finds the address that must be written into the public ICE host candidate. The
// explicit config/environment forms also permit a private address for deliberate LAN deployments;
// automatically supplied SERVER_IP and discovered addresses must be publicly routable.
func resolvePublicIP(ctx context.Context, cfg Config) (ip, source string, err error) {
	for _, candidate := range []struct {
		value  string
		source string
	}{
		{cfg.PublicIP, "config.public_ip"},
		{os.Getenv("PUBLIC_IP"), "PUBLIC_IP"},
	} {
		if strings.TrimSpace(candidate.value) == "" {
			continue
		}
		if parsed := usableIP(candidate.value, false); parsed != "" {
			return parsed, candidate.source, nil
		}
		return "", "", fmt.Errorf("%s is not a valid advertisable IP address: %q", candidate.source, candidate.value)
	}
	if parsed := usableIP(os.Getenv("SERVER_IP"), true); parsed != "" {
		return parsed, "SERVER_IP", nil
	}

	client := &http.Client{Timeout: 3 * time.Second}
	for _, endpoint := range publicIPDiscoveryURLs {
		req, requestErr := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if requestErr != nil {
			continue
		}
		resp, requestErr := client.Do(req)
		if requestErr != nil {
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 128))
		_ = resp.Body.Close()
		if readErr == nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if parsed := usableIP(string(body), true); parsed != "" {
				return parsed, endpoint, nil
			}
		}
	}
	return "", "", errors.New("could not determine a public IP; set PUBLIC_IP to the node's public IPv4 address")
}

// effectivePublicTransport migrates configurations created before Bedrock 1.26.60, when clients
// could still fall back to RakNet. The environment escape hatch is deliberately explicit so an old
// config cannot silently strand updated clients.
func effectivePublicTransport(configured string) (transport string, migrated bool) {
	if configured == transportRakNet && os.Getenv("BEDROCK_PROXY_LEGACY_RAKNET") != "1" {
		return transportNetherNet, true
	}
	return configured, false
}

func validateConfig(cfg *Config) error {
	cfg.PublicTransport = strings.ToLower(strings.TrimSpace(cfg.PublicTransport))
	cfg.BackendTransport = strings.ToLower(strings.TrimSpace(cfg.BackendTransport))
	if cfg.PublicTransport != transportRakNet && cfg.PublicTransport != transportNetherNet {
		return fmt.Errorf("public_transport must be %q or %q, got %q", transportRakNet, transportNetherNet, cfg.PublicTransport)
	}
	if cfg.BackendTransport != transportRakNet && cfg.BackendTransport != transportNetherNet {
		return fmt.Errorf("backend_transport must be %q or %q, got %q", transportRakNet, transportNetherNet, cfg.BackendTransport)
	}
	if p := cfg.publicPort(); p < 1 || p > 65535 {
		return fmt.Errorf("public port must be between 1 and 65535, got %d", p)
	}
	if cfg.BackendPort < 0 || cfg.BackendPort > 65535 {
		return fmt.Errorf("backend_port must be between 0 and 65535, got %d", cfg.BackendPort)
	}
	if cfg.MaxPlayers < 1 {
		return fmt.Errorf("max_players must be at least 1, got %d", cfg.MaxPlayers)
	}
	if len(cfg.ServerCommand) == 0 && strings.TrimSpace(cfg.BackendAddress) == "" {
		return errors.New("backend_address is required when server_command is empty")
	}
	return nil
}

// backendAddress deliberately uses loopback for a managed server. Container bridge addresses are
// ephemeral and must never be copied into a config that is deployed across multiple Pterodactyl nodes.
func backendAddress(cfg Config, backendPort int) (address string, ignoredConfiguredAddress bool, err error) {
	if len(cfg.ServerCommand) > 0 {
		host := fmt.Sprintf("127.0.0.1:%d", backendPort)
		if cfg.BackendTransport == transportNetherNet {
			host = "http://" + host
		}
		return host, strings.TrimSpace(cfg.BackendAddress) != "", nil
	}

	address = strings.TrimSpace(cfg.BackendAddress)
	if cfg.BackendTransport == transportNetherNet && !strings.Contains(address, "://") {
		address = "http://" + address
	}
	if cfg.BackendTransport == transportNetherNet {
		u, parseErr := url.Parse(address)
		if parseErr != nil || u.Hostname() == "" {
			return "", false, fmt.Errorf("invalid NetherNet backend_address %q", cfg.BackendAddress)
		}
	}
	return address, false, nil
}

// waitForBackend waits for the actual NetherNet discovery endpoint, not merely for a TCP socket.
// This prevents players from being accepted by the public proxy while BDS is still loading.
func waitForBackend(ctx context.Context, cfg Config, backend string, log *slog.Logger) error {
	if cfg.BackendTransport != transportNetherNet {
		return nil
	}
	timeout := time.Duration(cfg.BackendReadyTimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	endpoint := strings.TrimRight(backend, "/") + "/v1/join"
	client := &http.Client{Timeout: 3 * time.Second}
	started := time.Now()
	log.Info("waiting for managed backend", "endpoint", endpoint, "timeout", timeout)
	var lastErr error
	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return err
		}
		resp, err := client.Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				log.Info("managed backend ready", "endpoint", endpoint, "wait", time.Since(started).Round(time.Millisecond))
				return nil
			}
			lastErr = fmt.Errorf("HTTP status %s", resp.Status)
		} else {
			lastErr = err
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("backend did not become ready within %s (last result: %v): %w", timeout, lastErr, ctx.Err())
		case <-time.After(500 * time.Millisecond):
		}
	}
}
