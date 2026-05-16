from flask import Flask, request, jsonify
from typing import Dict, List, Any, Tuple
import re

app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    return response

# In-memory cache so /visualize can be called after /upload
LAST_PARSED: Dict[str, Any] = {"filename": None, "parsed": None}


def _append_transition(transitions: Dict[str, List[Dict[str, Any]]], signal: str, t: int, value: str) -> None:
    """Append transition while avoiding duplicate values at the same time."""
    transitions.setdefault(signal, [])
    if not transitions[signal]:
        transitions[signal].append({"time": t, "value": value})
        return

    last = transitions[signal][-1]
    if last["time"] == t:
        last["value"] = value
    elif last["value"] != value:
        transitions[signal].append({"time": t, "value": value})


def parse_vcd_text(vcd_text: str) -> Dict[str, Any]:
    """
    Minimal VCD parser (scalar + vector changes).

    Supports:
      - $var declarations
      - #<time>
      - scalar changes like: 1! 0" x#
      - vector changes like: b1010 $
    """
    id_to_signal: Dict[str, str] = {}
    transitions: Dict[str, List[Dict[str, Any]]] = {}
    current_time = 0
    timescale = "1ns"

    lines = vcd_text.splitlines()
    collecting_timescale = False
    timescale_buf: List[str] = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line.startswith("$timescale"):
            if "$end" in line:
                ts = line.replace("$timescale", "").replace("$end", "").strip()
                if ts:
                    timescale = ts
            else:
                collecting_timescale = True
                timescale_buf = []
            continue

        if collecting_timescale:
            if "$end" in line:
                collecting_timescale = False
                ts = " ".join(timescale_buf).strip()
                if ts:
                    timescale = ts
            else:
                timescale_buf.append(line)
            continue

        # Example: $var wire 1 ! clk $end
        if line.startswith("$var"):
            parts = line.split()
            if len(parts) >= 5:
                identifier = parts[3]
                signal_name = parts[4]
                id_to_signal[identifier] = signal_name
                transitions.setdefault(signal_name, [])
            continue

        # Time marker: #20
        if line.startswith("#"):
            try:
                current_time = int(line[1:].strip())
            except ValueError:
                pass
            continue

        # Scalar value change: 0!, 1", x#
        if line[0] in "01xXzZ" and len(line) >= 2:
            value = line[0].lower()
            identifier = line[1:].strip()
            signal = id_to_signal.get(identifier)
            if signal:
                _append_transition(transitions, signal, current_time, value)
            continue

        # Vector value change: b1010 !
        if line[0] in "bBrR":
            parts = line.split()
            if len(parts) == 2:
                value = parts[0][1:].lower()
                identifier = parts[1]
                signal = id_to_signal.get(identifier)
                if signal:
                    _append_transition(transitions, signal, current_time, value)
            continue

    return {
        "timescale": timescale,
        "identifiers": id_to_signal,
        "transitions": transitions,
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
    # For timescale like "1ns", show "20ns"
    m = re.match(r"^\s*1\s*([a-zA-Z]+)\s*$", timescale)
    if m:
        return f"{t}{m.group(1)}"
    return f"{t} ticks"


def check_waveform_against_truth_table(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """
    Hardcoded expected behavior (demo):
      y = a AND b

    Checked at every timestamp where a, b, or y changes.
    """
    transitions = parsed["transitions"]
    timescale = parsed["timescale"]
    required = ["a", "b", "y"]
    errors: List[str] = []

    for sig in required:
        if sig not in transitions or not transitions[sig]:
            errors.append(f"Missing required signal '{sig}' or no transitions found.")

    if errors:
        return {"verdict": "Incorrect", "errors": errors}

    time_axis = {0}
    for sig in required:
        for tr in transitions[sig]:
            time_axis.add(tr["time"])
    sorted_times = sorted(time_axis)

    # Expected transitions for y based on a AND b
    expected_transition_times = {0}
    prev_expected = None

    for t in sorted_times:
        a_val = value_at_time(transitions["a"], t)
        b_val = value_at_time(transitions["b"], t)
        y_val = value_at_time(transitions["y"], t)

        if a_val in ("0", "1") and b_val in ("0", "1"):
            expected = "1" if (a_val == "1" and b_val == "1") else "0"
        else:
            expected = "x"

        if prev_expected is None:
            prev_expected = expected
        elif expected != prev_expected:
            expected_transition_times.add(t)
            prev_expected = expected

        if expected in ("0", "1"):
            if y_val not in ("0", "1") or y_val != expected:
                errors.append(
                    f"Signal mismatch at t={format_time(t, timescale)}: expected y={expected}, got y={y_val}."
                )

    y_transitions = transitions["y"]
    for i in range(1, len(y_transitions)):
        t = y_transitions[i]["time"]
        if t not in expected_transition_times:
            errors.append(
                f"Timing violation: y changed unexpectedly at t={format_time(t, timescale)}."
            )

    verdict = "Correct" if not errors else "Incorrect"
    return {"verdict": verdict, "errors": errors}


def build_visualization_json(parsed: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "timescale": parsed["timescale"],
        "signals": parsed["transitions"],
    }


def read_uploaded_vcd_file() -> Tuple[str, str]:
    if "file" not in request.files:
        raise ValueError("No file part in request. Use form-data key: file")
    uploaded = request.files["file"]
    if uploaded.filename == "":
        raise ValueError("No selected file.")
    text = uploaded.read().decode("utf-8", errors="ignore")
    if not text.strip():
        raise ValueError("Uploaded file is empty or unreadable.")
    return uploaded.filename, text


@app.route("/upload", methods=["POST"])
def upload_vcd() -> Any:
    try:
        filename, vcd_text = read_uploaded_vcd_file()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    parsed = parse_vcd_text(vcd_text)
    check_result = check_waveform_against_truth_table(parsed)

    LAST_PARSED["filename"] = filename
    LAST_PARSED["parsed"] = parsed

    return jsonify({
        "verdict": check_result["verdict"],
        "errors": check_result["errors"],
        "timescale": parsed["timescale"],
        "signals_found": sorted(parsed["transitions"].keys()),
    })


@app.route("/visualize", methods=["POST"])
def visualize_vcd() -> Any:
    # Option 1: parse fresh file from this request
    if "file" in request.files and request.files["file"].filename:
        try:
            filename, vcd_text = read_uploaded_vcd_file()
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        parsed = parse_vcd_text(vcd_text)
        LAST_PARSED["filename"] = filename
        LAST_PARSED["parsed"] = parsed
        return jsonify(build_visualization_json(parsed))

    # Option 2: return last uploaded waveform
    if LAST_PARSED["parsed"] is not None:
        return jsonify(build_visualization_json(LAST_PARSED["parsed"]))

    return jsonify({
        "error": "No waveform available. Upload a VCD first to /upload or send file to /visualize."
    }), 400


@app.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # Run: python app.py
    app.run(host="0.0.0.0", port=5000, debug=True)
