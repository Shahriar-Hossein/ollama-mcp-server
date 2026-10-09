BUDGET = {
    "mode": "shared",
    "attempts": 30,
}

async def local_budget():
    BUDGET = {
        "mode": "private",
        "attempts": 4,
    }
    return BUDGET["mode"]

async def shared_budget():
    return BUDGET["mode"]
