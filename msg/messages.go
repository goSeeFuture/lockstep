package msg

import (
	"github.com/tinylib/msgp/msgp"
)

//go:generate msgp
//msgp:tuple Open Join JoinReply System Start TimeSync TimeSyncReply Message MessageReply

type Open struct {
	ID           msgp.Number
	StepInterval int
}

type Join struct {
	Account string
}

type JoinReply struct {
	Result  bool
	Message string
}

type System struct {
	Message string
}

type Start struct {
	Players []string
}

type TimeSync struct {
	Client msgp.Number
}

type TimeSyncReply struct {
	Client msgp.Number
	Server msgp.Number
}

type Direction int

const (
	DIRECTION_NONE Direction = iota
	STOP
	UP
	DOWN
	LEFT
	RIGHT
)

var (
	dirct = map[Direction]string{
		STOP:  "STOP",
		UP:    "UP",
		DOWN:  "DOWN",
		LEFT:  "LEFT",
		RIGHT: "RIGHT",
	}
)

func (d Direction) String() string {
	return dirct[d]
}

func parseString(s string) Direction {
	switch s {
	case "STOP":
		return STOP
	case "UP":
		return UP
	case "LEFT":
		return LEFT
	case "RIGHT":
		return RIGHT
	default:
		return DIRECTION_NONE
	}
}

type Message struct {
	Step      int64
	Direction Direction
	ID        string // account
}

type MessageReply struct {
	Commands [][]*Message
}

type Quit struct{}

type QuitReply struct{}
