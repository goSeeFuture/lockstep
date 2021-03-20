package lockstep

import (
	"sync"
	"wslockstep/msg"

	"github.com/goSeeFuture/hotpot/codec"
	"github.com/goSeeFuture/hotpot/hotpot"
	"github.com/rs/zerolog/log"
)

const (
	// 每个step的间隔ms
	stepInterval = 100
)

type player struct {
	Agent  hotpot.IAgent
	Online bool
	Area   *Area
}

var (
	serial = codec.Get(codec.MessagePackExtJS)
	// 区域，同一个区域的玩家才会同步
	area *Area
	// 所有在线玩家
	onlines sync.Map
)

func Setup() {

	// 监听建立连接
	hotpot.Global.ListenEvent(hotpot.EventAgentOpen, onConnected)
	// 消息处理
	hotpot.Route.Set("Join", handleJoin)
	hotpot.Route.Set("TimeSync", handleTimeSync)

	// 创建区域
	area = newArea()
	area.g.ListenCall("join", area.join)
	area.g.ListenEvent("broadcast", area.broadcast)
}

func onConnected(arg interface{}) {
	log.Info().Msg("客户端连接")

	a := arg.(hotpot.IAgent)
	m := &msg.Open{StepInterval: stepInterval}
	m.ID.AsInt(a.ID())
	a.WriteMsg(m)
}

func onDisconnect(arg interface{}) {
	if arg == nil {
		return
	}

	account := arg.(string)
	log.Info().Str("account", account).Msg("断线")

	val, exist := onlines.Load(account)
	if !exist {
		log.Info().Str("account", account).Msg("not join")
		return
	}

	p := val.(player)
	p.Online = false
	onlines.Store(account, p)
}

func handleJoin(data []byte, a hotpot.IAgent) {
	req := msg.Join{}
	err := serial.Unmarshal(data, &req)
	if err != nil {
		log.Error().Err(err).Msg("join msg protocol unmarshal")
		return
	}

	// 顶号
	other, exist := onlines.Load(req.Account)
	if exist {
		// 顶号
		p := other.(player)
		p.Agent.WriteMsg(&msg.System{Message: "被顶号了"})
		p.Agent.SoftClose() // 软断开
	}

	// 交给区域处理消息请求
	a.Delegate(area.g)
	waitResult, _ := area.g.Call("join", req.Account)
	ret := waitResult()
	if _, ok := ret.Value.(*msg.System); ok {
		a.WriteMsg(ret.Value)
		return
	}

	// 连接绑定帐号
	a.SetData(req.Account)
	onlines.Store(req.Account, player{Agent: a, Online: true, Area: area})

	area.g.Emit("broadcast", ret.Value)
}

func sendMessage(account string, v interface{}) {
	val, exist := onlines.Load(account)
	if !exist {
		return
	}

	val.(player).Agent.WriteMsg(v)
}
