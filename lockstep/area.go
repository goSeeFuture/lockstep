package lockstep

import (
	"errors"
	"time"
	"wslockstep/msg"

	"github.com/goSeeFuture/hotpot/hotpot"
	"github.com/goSeeFuture/hub"
	"github.com/rs/zerolog/log"
)

type gameStatus int

const (
	UNKNOWN gameStatus = iota
	WAIT
	START
)

const (
	// 自动开始游戏人数
	AREA_JOIN_PLAYER = 2
)

type Area struct {
	g                 *hub.Group
	route             hotpot.Router
	status            gameStatus
	players           []string
	commands          []*msg.Message
	commandsHistory   [][]*msg.Message
	lastupdate        time.Time
	stepUpdateCounter time.Duration
	stepTime          int64 // 当前step时间戳
	tick              bool
}

func newArea() *Area {
	area := &Area{
		status: WAIT,
	}

	area.route.Set("Message", handleMessage)
	area.route.Set("TimeSync", handleTimeSync)
	area.route.Set("Quit", handleQuit)
	area.g = hub.NewGroup(hub.GroupHandles(hotpot.RouteRequestMessage(&area.route)))
	area.startFrame()

	return area
}

// 每帧操作
func (area *Area) frame() bool {
	now := time.Now()
	dt := now.Sub(area.lastupdate)
	area.lastupdate = now
	if area.status == START {
		area.stepUpdateCounter += dt
		if area.stepUpdateCounter >= stepInterval {
			area.stepTime++
			area.stepUpdate()
			area.stepUpdateCounter -= stepInterval
		}
	}
	return true
}

// step定时器
func (area *Area) stepUpdate() {
	// 过滤同帧多次指令
	unique := make(map[string]*msg.Message)
	onlines.Range(func(k, v interface{}) bool {
		account := k.(string)
		unique[account] = &msg.Message{ID: account, Step: area.stepTime}
		return true
	})

	for _, command := range area.commands {
		command.Step = area.stepTime
		unique[command.ID] = command
	}

	area.commands = []*msg.Message{}

	// 发送指令
	var commands = []*msg.Message{}
	for _, v := range unique {
		commands = append(commands, v)
	}
	if len(commands) == 0 {
		return
	}

	area.commandsHistory = append(area.commandsHistory, commands)
	area.broadcast(&msg.MessageReply{Commands: [][]*msg.Message{commands}})
}

func (area *Area) broadcast(v interface{}) {
	var ok bool
	var arr []interface{}
	arr, ok = v.([]interface{})
	if !ok {
		arr = []interface{}{v}
	}

	for _, e := range arr {
		for _, account := range area.players {
			sendMessage(account, e)
		}
	}
}

func (area *Area) join(arg interface{}) hub.Return {
	account := arg.(string)

	// 区域玩家满
	if len(area.players) == AREA_JOIN_PLAYER {
		return hub.Return{Value: &msg.System{Message: "房间已满"}}
	}

	// 加入游戏
	area.players = append(area.players, account)
	if len(area.players) < AREA_JOIN_PLAYER {
		log.Info().Str("account", account).Msg("加入游戏")
		return hub.Return{Value: &msg.JoinReply{Result: true, Message: "匹配中..."}}
	}

	// 开始游戏
	area.status = START
	area.lastupdate = time.Now()
	area.commands = []*msg.Message{}
	m := []interface{}{
		&msg.JoinReply{Result: true, Message: "匹配中..."},
		&msg.Start{Players: area.players},
	}
	if len(area.commandsHistory) != 0 {
		m = append(m, &msg.MessageReply{Commands: area.commandsHistory})
	}

	log.Info().Int("recovery", len(area.commandsHistory)).Msg("开始游戏")
	return hub.Return{
		Value: m,
	}
}

// 启动frame
func (area *Area) startFrame() {
	if !area.tick {
		area.tick = true // 防止重入
		area.g.Tick(stepInterval*time.Millisecond, area.frame)
	}
}

func (area *Area) message(req msg.Message) error {
	if area.status != START {
		return errors.New("game not start")
	}

	area.commands = append(area.commands, &req)
	return nil
}

func strIndexOf(a []string, b string) int {
	index := -1
	for i, val := range a {
		if val == b {
			index = i
			break
		}
	}
	return index
}

func (area *Area) quit(account string) {
	index := strIndexOf(area.players, account)
	if index != -1 {
		area.players = append(area.players[:index], area.players[index+1:]...)
	}

	log.Info().Str("account", account).Msg("离开游戏")

	var message string
	if len(area.players) == 0 {
		message = "游戏结束"
		area.stepTime = 0
		area.status = WAIT
		log.Info().Msg("游戏结束")
	} else {
		message = account + "离开了游戏！"
	}

	area.broadcast(&msg.System{Message: message})
	sendMessage(account, &msg.QuitReply{})
}
