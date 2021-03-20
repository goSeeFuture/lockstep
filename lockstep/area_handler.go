package lockstep

import (
	"time"
	"wslockstep/msg"

	"github.com/goSeeFuture/hotpot/hotpot"
	"github.com/rs/zerolog/log"
)

func handleTimeSync(data []byte, a hotpot.IAgent) {
	var req msg.TimeSync
	err := serial.Unmarshal(data, &req)
	if err != nil {
		log.Error().Err(err).Msg("synctime msg protocol unmarshal")
		return
	}

	m := &msg.TimeSyncReply{Client: req.Client}
	m.Server.AsInt(time.Now().Unix())
	a.WriteMsg(m)
}

func handleMessage(data []byte, a hotpot.IAgent) {
	acc := a.Data()
	if acc == nil {
		log.Info().Interface("account", acc).Msg("not join")
		return
	}

	var req msg.Message
	err := serial.Unmarshal(data, &req)
	if err != nil {
		log.Error().Err(err).Msg("message msg protocol unmarshal")
		return
	}

	account := acc.(string)
	val, exist := onlines.Load(account)
	if !exist {
		log.Info().Str("account", account).Msg("not join")
		return
	}

	p := val.(player)
	req.ID = account
	err = p.Area.message(req)
	if err != nil {
		log.Error().Err(err).Msg("area handle message")
		return
	}
}

func handleQuit(data []byte, a hotpot.IAgent) {
	acc := a.Data()
	if acc == nil {
		log.Info().Interface("account", acc).Msg("not join")
		return
	}

	account := acc.(string)
	val, exist := onlines.Load(account)
	if !exist {
		log.Info().Str("account", account).Msg("not join")
		return
	}

	val.(player).Area.quit(account)
}
