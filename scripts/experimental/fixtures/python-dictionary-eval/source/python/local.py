SETTINGS = {
    "mode": "stored",
    "attempts": 21,
}

def local_setting():
    SETTINGS = {
        "mode": "ephemeral",
        "attempts": 5,
    }
    return SETTINGS["mode"]

def other_setting():
    return SETTINGS["mode"]
