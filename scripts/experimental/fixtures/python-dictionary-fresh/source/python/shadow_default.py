RETRY = {
    "mode": "fixed",
    "attempts": 17,
}

def retry_mode(RETRY="backoff"):
    return RETRY["mode"]
