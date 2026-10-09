LEVEL = {
    "mode": "info",
    "attempts": 40,
}

def make_level():
    LEVEL = {
        "mode": "debug",
        "attempts": 4,
    }

    def read_level():
        nonlocal LEVEL
        return LEVEL["mode"]

    return read_level
