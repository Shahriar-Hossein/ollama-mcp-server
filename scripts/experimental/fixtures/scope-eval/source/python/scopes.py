DEFAULTS = {
    "mode": "shared",
    "retries": 9,
}


def execute():
    DEFAULTS = {
        "mode": "local",
        "retries": 2,
    }
    return DEFAULTS["mode"]


async def execute_async():
    return DEFAULTS["mode"]
