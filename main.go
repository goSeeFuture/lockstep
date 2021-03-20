package main

import (
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"wslockstep/lockstep"

	"github.com/rs/zerolog/log"

	"github.com/goSeeFuture/hotpot/codec"
	"github.com/goSeeFuture/hotpot/network"
)

func main() {
	const addr = "http://localhost:3000"
	fs := http.FileServer(http.Dir("./static"))
	am := network.Serve(
		addr+"/game",
		network.TextMsg(false),
		network.Keepalived(60, 80),
		network.Serialize(codec.MessagePackExtJS),
		network.HTTPHandlers(network.HTTPHandler{Pattern: "/", Handler: fs}),
	)
	lockstep.Setup()
	am.Start()

	log.Info().Str("addr", addr).Msg("游戏服启动成功")

	// 等待关服信号，如 Ctrl+C、kill -2、kill -3、kill -15
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGTERM, syscall.SIGQUIT, syscall.SIGINT)
	<-ch
}
