LEVELS = {
    "mode": "verbose",
    "attempts": 9,
}

def quiet_levels():
    LEVELS = {
        "mode": "quiet",
        "attempts": 1,
    }
    return LEVELS["mode"]

def loud_levels():
    LEVELS = {
        "mode": "loud",
        "attempts": 7,
    }
    return LEVELS["mode"]

def default_levels():
    return LEVELS["mode"]
