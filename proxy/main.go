// bedrock-proxy is a launcher and proxy for Minecraft: Bedrock servers. Pterodactyl or Pelican starts this
// one executable: it exposes NetherNet over one panel allocation (TCP signaling and multiplexed UDP)
// and relays players to a NetherNet BDS running inside the same container.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	cfg, err := loadConfig("config.json")
	if err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(1)
	}
	if err := validateConfig(&cfg); err != nil {
		fmt.Fprintln(os.Stderr, "config:", err)
		os.Exit(1)
	}
	level := slog.LevelInfo
	if cfg.Debug {
		level = slog.LevelDebug
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
	if transport, migrated := effectivePublicTransport(cfg.PublicTransport); migrated {
		log.Warn("public_transport=raknet is obsolete for Bedrock 1.26.60+; automatically migrating the public listener to nethernet", "override", "set BEDROCK_PROXY_LEGACY_RAKNET=1 only for old clients")
		cfg.PublicTransport = transport
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	backendPort := int(cfg.BackendPort)
	if len(cfg.ServerCommand) > 0 && backendPort == 0 {
		if backendPort, err = freePort(); err != nil {
			log.Error("no free backend port", "err", err)
			os.Exit(1)
		}
	}
	backend, ignoredAddress, err := backendAddress(cfg, backendPort)
	if err != nil {
		log.Error("invalid backend configuration", "err", err)
		os.Exit(1)
	}
	if ignoredAddress {
		log.Warn("ignoring backend_address for managed server; using stable container loopback", "configured", cfg.BackendAddress, "backend", backend)
	}

	// serverDone stays nil without a managed server; a nil channel blocks forever in the select below.
	var serverDone chan error
	if len(cfg.ServerCommand) > 0 {
		serverDone = make(chan error, 1)
		go func() { serverDone <- runServer(ctx, cfg, backendPort, log) }()
		readyDone := make(chan error, 1)
		go func() { readyDone <- waitForBackend(ctx, cfg, backend, log) }()
		select {
		case err := <-readyDone:
			if err != nil {
				log.Error("managed backend unavailable", "err", err)
				stop()
				<-serverDone
				os.Exit(1)
			}
		case err := <-serverDone:
			log.Error("server exited before its backend became ready", "err", err)
			stop()
			os.Exit(1)
		case <-ctx.Done():
			<-serverDone
			return
		}
	} else {
		log.Info("no server_command set, proxying to an externally managed backend", "backend", backend)
	}

	proxyCtx, cancelProxy := context.WithCancel(ctx)
	proxyErr := make(chan error, 1)
	go func() { proxyErr <- runProxy(proxyCtx, cfg, backend, log) }()

	var exit int
	serverExited := false
	select {
	case err := <-proxyErr:
		if err != nil {
			log.Error("proxy stopped", "err", err)
			exit = 1
		}
		stop()
	case err := <-serverDone:
		if err != nil {
			log.Error("server exited", "err", err)
			exit = 1
		} else {
			log.Info("server exited")
		}
		serverExited = true
		stop()
	case <-ctx.Done():
	}
	cancelProxy()
	if len(cfg.ServerCommand) > 0 && !serverExited {
		<-serverDone
	}
	os.Exit(exit)
}
