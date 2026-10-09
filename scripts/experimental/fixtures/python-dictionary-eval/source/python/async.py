OPTIONS = {
    "mode": "deferred",
    "attempts": 8,
}

def inline_choice():
    OPTIONS = {
        "mode": "immediate",
        "attempts": 3,
    }
    return OPTIONS["mode"]

async def async_choice():
    return OPTIONS["mode"]
