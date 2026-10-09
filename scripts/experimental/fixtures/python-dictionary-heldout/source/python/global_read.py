STATE = {
    "mode": "idle",
    "attempts": 8,
}

def read_state():
    global STATE
    return STATE["mode"]
