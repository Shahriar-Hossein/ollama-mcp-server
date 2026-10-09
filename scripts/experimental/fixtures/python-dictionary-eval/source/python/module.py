POLICY = {
    "mode": "queued",
    "attempts": 13,
}

def direct_policy():
    POLICY = {
        "mode": "direct",
        "attempts": 2,
    }
    return POLICY["mode"]

def module_policy():
    return POLICY["mode"]
