BUDGET = {
    "mode": "capped",
    "attempts": 17,
}

RESERVE = {
    "mode": "open",
    "attempts": 2,
}

def budget_mode():
    return BUDGET["mode"]
