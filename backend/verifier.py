from typing import Dict, List, Any, Callable
import re


CHECKER_FUNCTIONS: Dict[str, Callable[[str, str], str]] = {
    "AND": lambda a, b: "1" if (a == "1" and b == "1") else "0",
    "OR": lambda a, b: "1" if (a == "1" or b == "1") else "0",
    "XOR": lambda a, b: "1" if (a != b) else "0",
    "NAND": lambda a, b: "0" if (a == "1" and b == "1") else "1",
    "NOR": lambda a, b: "0" if (a == "1" or b == "1") else "1",
    "XNOR": lambda a, b: "0" if (a != b) else "1",
}


def value_at_time(signal_transitions: List[Dict[str, Any]], t: int, default: str = "x") -> str:
    value = default
    for tr in signal_transitions:
        if tr["time"] <= t:
            value = tr["value"]
        else:
            break
    return value


def format_time(t: int, timescale: str) -> str:
    m = re.match(r"^\s*1\s*([a-zA-Z]+)\s*$", timescale)
    return f"{t}{m.group(1)}" if m else f"{t} ticks"


def get_supported_checkers() -> List[str]:
    return sorted(CHECKER_FUNCTIONS.keys())


def verify_logic_function(parsed: Dict[str, Any], checker: str = "AND") -> Dict[str, Any]:
    checker_name = checker.upper().strip()
    if checker_name not in CHECKER_FUNCTIONS:
        checker_name = "AND"

    logic_fn = CHECKER_FUNCTIONS[checker_name]

    transitions = parsed["transitions"]
    timescale = parsed["timescale"]
    required = ["a", "b", "y"]
    errors: List[Dict[str, Any]] = []

    for sig in required:
        if sig not in transitions or not transitions[sig]:
            errors.append({
                "type": "missing_signal",
                "signal": sig,
                "time": None,
                "expected": None,
                "actual": None,
                "message": f"Missing required signal '{sig}' or no transitions found."
            })

    if errors:
        return {
            "checker": f"{checker_name}_TRUTH_TABLE",
            "verdict": "Incorrect",
            "error_count": len(errors),
            "errors": errors,
            "summary": {
                "checked_timestamps": 0,
                "required_signals": required,
            }
        }

    time_axis = {0}
    for sig in required:
        for tr in transitions[sig]:
            time_axis.add(tr["time"])
    sorted_times = sorted(time_axis)

    expected_transition_times = {0}
    prev_expected = None
    compared_points = 0

    for t in sorted_times:
        a_val = value_at_time(transitions["a"], t)
        b_val = value_at_time(transitions["b"], t)
        y_val = value_at_time(transitions["y"], t)

        expected = "x"
        if a_val in ("0", "1") and b_val in ("0", "1"):
            expected = logic_fn(a_val, b_val)

        if prev_expected is None:
            prev_expected = expected
        elif expected != prev_expected:
            expected_transition_times.add(t)
            prev_expected = expected

        if expected in ("0", "1"):
            compared_points += 1
            if y_val not in ("0", "1") or y_val != expected:
                errors.append({
                    "type": "mismatch",
                    "signal": "y",
                    "time": t,
                    "expected": expected,
                    "actual": y_val,
                    "message": f"Signal mismatch at t={format_time(t, timescale)}: expected y={expected}, got y={y_val}."
                })

    y_transitions = transitions["y"]
    for i in range(1, len(y_transitions)):
        t = y_transitions[i]["time"]
        if t not in expected_transition_times:
            errors.append({
                "type": "timing_violation",
                "signal": "y",
                "time": t,
                "expected": "no_transition",
                "actual": "transition",
                "message": f"Timing violation: y changed unexpectedly at t={format_time(t, timescale)}."
            })

    verdict = "Correct" if not errors else "Incorrect"
    return {
        "checker": f"{checker_name}_TRUTH_TABLE",
        "verdict": verdict,
        "error_count": len(errors),
        "errors": errors,
        "summary": {
            "checked_timestamps": compared_points,
            "required_signals": required,
        }
    }
