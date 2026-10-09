SCALE = {
    "mode": "linear",
    "attempts": 5,
}

class Meter:
    SCALE = {
        "mode": "log",
        "attempts": 3,
    }

    def mode(self):
        return SCALE["mode"]
