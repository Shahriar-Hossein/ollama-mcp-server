from .settings import OPTIONS as DEFAULT_OPTIONS

def execute(options):
    DEFAULT_OPTIONS = {"mode": "local"}  # shadows the imported alias locally
    if options.get("enabled", False):
        return {"status": "ready", "mode": DEFAULT_OPTIONS["mode"]}
    return {"status": "idle"}

async def execute_async(options):
    if options.get("enabled", False):
        return {"status": "async-ready", "mode": DEFAULT_OPTIONS["mode"]}
    return {"status": "async-idle"}
