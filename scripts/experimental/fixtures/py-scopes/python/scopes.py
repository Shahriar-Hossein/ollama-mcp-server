OPTIONS = {
    "mode": "batch",
    "attempts": 11,
}


def process_inline():
    OPTIONS = {
        "mode": "inline",
        "attempts": 4,
    }
    return OPTIONS["mode"]


async def process_background():
    return OPTIONS["mode"]
