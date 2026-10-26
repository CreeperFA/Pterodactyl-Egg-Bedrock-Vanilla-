package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

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
