from typing import Dict, Any


def build_visualization_json(parsed: Dict[str, Any]) -> Dict[str, Any]:
    transitions = parsed.get("transitions", {})
    max_time = 0
    signal_count = len(transitions)

    for sig in transitions:
        if transitions[sig]:
            max_time = max(max_time, transitions[sig][-1]["time"])

    return {
        "timescale": parsed.get("timescale", "1ns"),
        "signals": transitions,
        "meta": {
            "signal_count": signal_count,
            "max_time": max_time,
        }
    }
