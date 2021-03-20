const msgpkit = {}

// js消息支持 msgpack-lite 库
// https://github.com/kawanet/msgpack-lite#extension-types
// 0x1B	Buffer
msgpkit._codec = {
    codec: msgpack.createCodec({
        binarraybuffer: true,
        int64: true,
        preset: true
    })
}

// js发送消息
// type(String): 消息类型
// data(Object): 消息内容
msgpkit.Send = function (type, data) {
    var values = Object.values(data)
    var data = msgpack.encode(values, msgpkit._codec)
    data = msgpack.encode([type, data], msgpkit._codec)
    ws.send(data)
}

msgpkit.ws = undefined
msgpkit.NewWebSocket = function (url, dispatcher) {
    ws = new WebSocket(url)
    ws.binaryType = "arraybuffer"

    ws.onopen = dispatcher.onopen
    ws.onclose = dispatcher.onclose
    ws.onerror = dispatcher.onerror

    // 接收消息处理
    ws.onmessage = function (event) {
        if (typeof event.data == 'object') {
            // 解开包装
            data = new Uint8Array(event.data)
            if (!data.length) {
                return
            }

            array = msgpack.decode(data)
            if (array.length != 2) {
                console.error("msg warpper not 2")
                return
            }

            var msg = {
                type: array[0],
                data: msgpack.decode(array[1], msgpkit._codec)
            }

            var handle = dispatcher[msg.type]
            if (!handle) {
                console.warn(`没有注册 ${msg.type} 消息处理函数`)
                return
            }
            handle(msgpkit._formatMessage(proto[msg.type], msg.data))
        }
    }

    return ws
}




/*
格式化消息，方便使用
 
例如：go发送
    type Custom struct {
        None bool
    }
    type foo struct {
        Int int
        Array []int
        String string
        Custom Custom
        Customs []Custom
    }
    data = foo{Int: 11, Array: []int{1, 2, 3}, String: "bala", Custom: Custom{None: true}, Customs: []Customs{
        Custom{None: false}, Custom{None: true}
    }}
 
    js格式化消息
    var msg = formatMessage(["Int", "Array", "String", ["Custom", ["None"]], ["Customs", ["None"], "array"]], data)
    console.log(msg.Int, msg.Array, msg.String, msg.Custom, msg.Customs)
    输出：11 [1,2,3] bala {None: true} [{None: false}, {None: true}]
*/

msgpkit._formatMessage = function (struct, data) {
    if (struct.length != data.length) {
        console.error(`length not equal (struct.len=${struct.length},data.len=${data.length}): struct=` + struct + " data=" + data)
        return
    }

    const regexarray = /^#array\d{0,1}$/
    const regexn = /\d$/

    var msg = {}
    struct.forEach(function (item, index) {
        if (typeof item == 'string') {
            msg[item] = data[index]
        } else if (item instanceof Array) {
            if (item.length < 2 || item.length > 3) {
                console.error("struct format wrong:\n\tformat1: ['ArrayName', ['ArrayItemName' ...]]\n\tformat2: ['ArrayName', ['ArrayItemName' ...], 'array']")
                return
            }

            if (item.length == 3 && item[2].match(regexarray) == null) {
                console.error("struct format wrong: only support array\n\t['ArrayName', ['ArrayItemName' ...], '#array']")
                return
            }

            if (item.length == 3) {
                var n = parseInt(item[2].match(regexn))
                if (n < 2) {
                    var array = []
                    data[index].forEach(function (dataItem) {
                        var tmp = msgpkit._formatMessage(item[1], dataItem)
                        array.push(tmp)
                    })
                    msg[item[0]] = array
                } else if (n == 2) {
                    var array = []
                    data[index].forEach(function (e) {
                        var array2 = []
                        e.forEach(function (dataItem) {
                            var tmp = msgpkit._formatMessage(item[1], dataItem)
                            array2.push(tmp)
                        })
                        array.push(array2)
                    })
                    msg[item[0]] = array
                }
            } else {
                msg[item[0]] = msgpkit._formatMessage(item[1], data[index])
            }
        }
    })
    return msg
}
