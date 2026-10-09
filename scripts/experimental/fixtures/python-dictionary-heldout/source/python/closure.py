QUEUE = {
    "mode": "fifo",
    "attempts": 15,
}

def make_reader():
    QUEUE = {
        "mode": "lifo",
        "attempts": 2,
    }

    def read_mode():
        return QUEUE["mode"]

    return read_mode
