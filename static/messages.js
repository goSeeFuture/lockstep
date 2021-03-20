

var proto = {
    Open: ["ID", "StepInterval"],
    System: ["Message"],
    Start: ["Players"],
    JoinReply: ["Result", "Message"],
    TimeSyncReply: ["Client", "Server"],
    MessageReply: [["Commands", ["Step", "Direction", "ID"], "#array2"]],
    QuitReply: [],
}

