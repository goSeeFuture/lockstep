// 方向枚举
var DIRECTION = {
	STOP: 1,
	UP: 2,
	DOWN: 3,
	LEFT: 4,
	RIGHT: 5
}

// 方向枚举的字符串，仅用于log
var DIRECTION_STR = {
	1: "STOP",
	2: "UP",
	3: "DOWN",
	4: "LEFT",
	5: "RIGH"
}

// 游戏状态枚举
var STATUS = {
	WAIT: 1,
	START: 2
}

// 游戏宽高
var WIDTH = 320
var HEIGHT = 400
var BOX_SIZE = 30

// 游戏对象
var GameObject = function (id) {
	this.id = id
	this.x = 0
	this.y = 0
	this.direction = DIRECTION.STOP
	this.speed = 100
	this.move = function (dt) {
		dt = dt / 1000
		var x = this.x
		var y = this.y
		switch (this.direction) {
			case DIRECTION.UP:
				{
					y -= this.speed * dt
					break
				}
			case DIRECTION.DOWN:
				{
					y += this.speed * dt
					break
				}
			case DIRECTION.LEFT:
				{
					x -= this.speed * dt
					break
				}
			case DIRECTION.RIGHT:
				{
					x += this.speed * dt
					break
				}
		}
		if (x <= (WIDTH - BOX_SIZE) && x >= 0) {
			this.x = x
		}
		if (y <= (HEIGHT - BOX_SIZE) && y >= 0) {
			this.y = y
		}
	}
}

$(function () {
	// 画布
	var context = document.getElementById("canvas").getContext("2d")
	// 每个step的间隔ms，服务器返回
	var stepInterval = 0
	// 当前step时间戳
	var stepTime = 0
	// 输入方向
	var inputDirection = null
	// 游戏状态
	var gameStatus = STATUS.WAIT
	// 接受指令
	var recvCommands = new Array()
	// 所有游戏对象
	var gameObjects = {}
	// 是否连接socket
	var isConnected = false
	// 当前执行中的指令
	var runningCommands = null
	// 当前用户
	var currentAccount = null
	// 是否正在加速运行延迟到达的包
	var isFastRunning = false

	// 初始化UI显示
	$("#content").hide()
	$("#login").show()
	$("#tips").hide()

	// socket连接成功
	handleOpen = function (reply) {
		console.log("open", reply)
		isConnected = true
		stepInterval = reply.StepInterval
		id = reply.ID
		console.log("Socket连接成功：", id)
		// 断线重连自动登录
		if (localStorage.account) {
			setTimeout(function () {
				$("#account").val(localStorage.account)
				localStorage.account = ""
				$('#start_btn').click()
			}, 0)
		}
	}

	// 收到游戏开始事件
	handleStart = function (reply) {
		// 初始化GameObject
		for (var i = 0; i < reply.Players.length; ++i) {
			var id = reply.Players[i]
			gameObjects[id] = new GameObject(id)
		}
		gameStatus = STATUS.START
		stepTime = 0
		showTips("游戏开始")
	}

	// 收到加入游戏结果
	handleJoinReply = function (reply) {
		showTips(reply.Message)
		if (reply.Result) {
			$("#login").hide()
			$("#content").show()
		}
	}

	// 收到系统消息
	handleSystem = function (data) {
		showTips(data.Message)
	}

	// 收到指令
	handleMessageReply = function (reply) {
		if (!reply.Commands) {
			return
		}
		
		// 储存收到的指令
		reply.Commands.forEach(function (cmdarray) {
			recvCommands.push(cmdarray)
			var last = cmdarray[cmdarray.length - 1]
			stepTime = last.Step
			console.log(`**** recv ${stepTime} (${cmdarray.length}) ****`)
			// console.log("**** recv " + stepTime + " ****", DIRECTION_STR[last.Direction], " account: ", last.ID)
		})
	}

	// 对时
	var avgDelay = 0
	var avgDelayCount = 0
	var avgDelayMax = 20
	handleTimeSyncReply = function (reply) {
		var client = reply.Client.valueOf()
		var server = reply.Server.valueOf()
		// console.log('reply', client, server)
		var delay = Date.now() - client // 网络延迟
		if (avgDelayCount == avgDelayMax) {
			$("#lag").text("延迟：" + Math.ceil(avgDelay / avgDelayMax) + " ms")
			avgDelay = 0
			avgDelayCount = 0
		}
		avgDelay = avgDelay + delay
		avgDelayCount = avgDelayCount + 1
	}

	handleQuitReply = function (reply) {
		localStorage.account = currentAccount
		location.reload()
	}


	onopen = function (event) {
		console.log("连接到服务器", event)
	}

	onerror = function (event) {
		console.log("与服务器断开错误", event)
	}
	// 断线
	onclose = function (event) {
		console.log("与服务器断开连接!", event)
		clearInterval(syncTimerID)
	}

	// 消息分发
	var dispather = {
		'Open': handleOpen,
		'Start': handleStart,
		'JoinReply': handleJoinReply,
		'System': handleSystem,
		'MessageReply': handleMessageReply,
		'TimeSyncReply': handleTimeSyncReply,
		'QuitReply' : handleQuitReply,

		'onopen': onopen,
		'onclose': onclose,
		'onerror': onerror,
	}
	// 连接socket
	var socket = msgpkit.NewWebSocket('ws://localhost:3000/game', dispather)

	// 发送指令
	function sendCommand(inputDirection) {
		if (isFastRunning) {
			console.log("正在加速执行延迟包，无法发送指令！")
			return
		}
		var direction = inputDirection
		console.log("message:", stepTime, direction)
		msgpkit.Send("Message", {
			Step: stepTime,
			Direction: direction,
			ID: "",
		})
	}

	// step定时器
	function stepUpdate() {
	}

	// frame定时器
	var stepUpdateCounter = 0
	function update(dt) {
		if (gameStatus == STATUS.START) {
			// TODO: 逻辑/UI分离
			stepUpdateCounter += dt
			if (stepUpdateCounter >= stepInterval) {
				stepUpdate()
				stepUpdateCounter -= stepInterval
			}

			// 积攒的包过多时要加速运行
			var scale = Math.ceil(recvCommands.length / 3)
			if (scale > 10) scale = 10
			isFastRunning = (scale > 1)
			// 执行指令
			if (recvCommands.length > 0) {
				var ms = dt * scale
				if (runningCommands == null) {
					runningCommands = recvCommands[0]
					runningCommands.ms = stepInterval
				}
				// console.log("ms: ", runningCommands.ms , ms, " len", runningCommands.length)
				if (runningCommands.ms < ms) {
					ms = runningCommands.ms
				}
				for (var i = 0; i < runningCommands.length; i++) {
					var command = runningCommands[i]
					// if (runningCommands.ms == stepInterval)  console.log('command ==>', command)
					var obj = gameObjects[command.ID]
					if (command.Direction) {
						obj.direction = command.Direction
					}
					obj.move(ms)
				}
				runningCommands.ms = runningCommands.ms - ms
				if (runningCommands.ms == 0) {
					recvCommands.shift()
					runningCommands = null
				}
			}

			// 绘制
			context.clearRect(0, 0, WIDTH, HEIGHT)
			for (var key in gameObjects) {
				var obj = gameObjects[key]
				context.fillStyle = "#000000"
				context.fillRect(obj.x, obj.y, BOX_SIZE, BOX_SIZE)
				context.font = "15px Courier New";
				context.fillStyle = "#FFFFFF";
				context.fillText(key, obj.x, obj.y + BOX_SIZE, BOX_SIZE);
			}
		}
	}


	// 启动定时器
	var lastUpdate = Date.now()
	var syncTimerID = setInterval(function () {
		var now = Date.now()
		var dt = now - lastUpdate
		lastUpdate = now
		update(dt)
		if (isConnected == true) {
			msgpkit.Send("TimeSync", { Client: new Int64BE(now) })
		}
	})

	// 键盘事件
	$('body').keydown(function (e) {
		if (gameStatus != STATUS.START) return
		switch (e.keyCode) {
			case 38:
				{
					inputDirection = DIRECTION.UP
					break
				}
			case 40:
				{
					inputDirection = DIRECTION.DOWN
					break
				}
			case 37:
				{
					inputDirection = DIRECTION.LEFT
					break
				}
			case 39:
				{
					inputDirection = DIRECTION.RIGHT
					break
				}
			case 13:
				{
					inputDirection = DIRECTION.STOP
					break
				}
		}
		sendCommand(inputDirection)
	})

	// 开始游戏
	$('#start_btn').click(function () {
		currentAccount = $("#account").val()
		if (isConnected == false) {
			showTips("连接服务器失败！")
		} else if (currentAccount == "") {
			showTips("账号不能为空！")
		} else {
			msgpkit.Send("Join", { Account: currentAccount })
		}
	})

	// 断线重连
	$('#reconnect_btn').click(function () {
		msgpkit.Send("Quit", {})
	})
})

// 弹一个Tips
function showTips(str) {
	var width = str.length * 20 + 50
	var halfScreenWidth = $(window).width() / 2
	var halfScreenHeight = $(window).height() / 2
	$("#tips").stop()
	$("#tips").show()
	$("#tips").text(str)
	$("#tips").css("width", width)
	$("#tips").css("top", halfScreenHeight)
	$("#tips").css("left", halfScreenWidth - width / 2)
	$("#tips").animate({ top: halfScreenHeight - 100 })
	$("#tips").fadeOut()
	console.log(str)
}