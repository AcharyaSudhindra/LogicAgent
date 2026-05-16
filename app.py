"""
VCD Waveform Verification Backend
===================================
Flask API for parsing, verifying, and visualizing VCD waveform files.

Endpoints:
  POST /upload     - Upload a VCD file, parse it, and compare against truth table
  GET  /visualize  - Return waveform data as JSON for frontend plotting
  GET  /health     - Health check

Run:
  pip install flask flask-cors
  python app.py

Test with curl:
  curl -X POST http://localhost:5000/upload -F "file=@test.vcd"
  curl http://localhost:5000/visualize
"""

import os
import re
import json
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS

# ─────────────────────────────────────────────
# App Initialization
# ─────────────────────────────────────────────

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the frontend

# Global store for the last parsed waveform (simple in-memory cache)
_last_waveform: dict = {}

# ─────────────────────────────────────────────
# TRUTH TABLE / EXPECTED BEHAVIOR
# ─────────────────────────────────────────────
# This is a hardcoded D-Flip-Flop truth table.
# Format: { time_ns: { signal_name: expected_value } }
# Only signals listed here are checked; others are ignored.

EXPECTED_TRUTH_TABLE = {
    0:  {"clk": "0", "d": "0", "q": "0"},
    10: {"clk": "1", "d": "0", "q": "0"},  # rising edge, D=0 → Q should stay 0
    20: {"clk": "0", "d": "1", "q": "0"},  # falling edge
    30: {"clk": "1", "d": "1", "q": "1"},  # rising edge, D=1 → Q should become 1
    40: {"clk": "0", "d": "0", "q": "1"},  # falling edge, Q holds
    50: {"clk": "1", "d": "0", "q": "0"},  # rising edge, D=0 → Q=0
    60: {"clk": "0", "d": "0", "q": "0"},
}

# ─────────────────────────────────────────────
# SECTION 1: VCD PARSER
# ─────────────────────────────────────────────

def parse_vcd(filepath: str) -> dict:
    """
    Parse a VCD (Value Change Dump) file.

    Returns a dict:
      {
        "timescale": "1ns",
        "signals": {
          "clk": [(time_ns, value), ...],
          "d":   [(time_ns, value), ...],
          ...
        }
      }

    Supports scalar signals (0/1/x/z) only (covers 99% of digital verification).
    """
    signals = {}          # id_code → signal_name
    transitions = {}      # signal_name → list of (time, value)
    timescale = "1ns"
    current_time = 0

    # Regex patterns
    re_timescale = re.compile(r'\$timescale\s+(.*?)\s*\$end', re.DOTALL)
    re_var = re.compile(r'\$var\s+\S+\s+\d+\s+(\S+)\s+(\S+).*?\$end')
    re_time = re.compile(r'^#(\d+)')
    re_value = re.compile(r'^([01xzXZ])(\S+)')  # e.g.  0clk  or  1#

    with open(filepath, 'r', errors='replace') as f:
        content = f.read()

    # Extract timescale
    ts_match = re_timescale.search(content)
    if ts_match:
        timescale = ts_match.group(1).strip()

    # Extract variable declarations
    for m in re_var.finditer(content):
        id_code, name = m.group(1), m.group(2)
        signals[id_code] = name
        transitions[name] = []

    # Walk through simulation section line by line
    in_dumpvars = False
    for line in content.splitlines():
        line = line.strip()

        if line == '$dumpvars':
            in_dumpvars = True
            continue
        if line == '$end' and in_dumpvars:
            in_dumpvars = False
            continue

        # Timestamp
        t_match = re_time.match(line)
        if t_match:
            current_time = int(t_match.group(1))
            continue

        # Value change: e.g. "0clk" or "1#"
        v_match = re_value.match(line)
        if v_match:
            value, id_code = v_match.group(1), v_match.group(2)
            if id_code in signals:
                name = signals[id_code]
                transitions[name].append((current_time, value.lower()))

    return {"timescale": timescale, "signals": transitions}


# ─────────────────────────────────────────────
# SECTION 2: WAVEFORM CHECKER
# ─────────────────────────────────────────────

def get_signal_value_at(transitions: list, time: int) -> str:
    """
    Given a list of (time, value) transitions for a signal,
    return the signal's value at the requested time using
    the most recent transition at or before `time`.
    Returns 'x' if no transition has occurred yet.
    """
    value = 'x'
    for t, v in transitions:
        if t <= time:
            value = v
        else:
            break
    return value


def check_waveform(parsed: dict, truth_table: dict) -> dict:
    """
    Compare parsed waveform against the truth table.

    Returns:
      {
        "verdict": "Correct" | "Incorrect",
        "errors": [
          {"time": 30, "signal": "q", "expected": "1", "actual": "0"},
          ...
        ],
        "checked_points": 6
      }
    """
    errors = []
    signals = parsed.get("signals", {})

    for time_ns, expected_signals in sorted(truth_table.items()):
        for sig_name, expected_val in expected_signals.items():
            if sig_name not in signals:
                errors.append({
                    "time": time_ns,
                    "signal": sig_name,
                    "expected": expected_val,
                    "actual": "MISSING",
                    "message": f"Signal '{sig_name}' not found in VCD at t={time_ns}ns"
                })
                continue

            actual_val = get_signal_value_at(signals[sig_name], time_ns)

            if actual_val != expected_val:
                errors.append({
                    "time": time_ns,
                    "signal": sig_name,
                    "expected": expected_val,
                    "actual": actual_val,
                    "message": f"Signal mismatch: '{sig_name}' at t={time_ns}ns — expected '{expected_val}', got '{actual_val}'"
                })

    total_checks = sum(len(sigs) for sigs in truth_table.values())
    verdict = "Correct" if not errors else "Incorrect"

    return {
        "verdict": verdict,
        "errors": errors,
        "checked_points": total_checks,
        "error_count": len(errors)
    }


# ─────────────────────────────────────────────
# SECTION 3: VISUALIZE FORMATTER
# ─────────────────────────────────────────────

def format_for_visualization(parsed: dict, truth_table: dict) -> dict:
    """
    Convert parsed waveform into a JSON structure suitable for frontend plotting.

    Returns:
      {
        "timescale": "1ns",
        "signals": {
          "clk": [{"time": 0, "value": "0"}, {"time": 10, "value": "1"}, ...],
          ...
        },
        "expected": { ... },       ← the truth table for overlay
        "time_range": [0, 60]
      }
    """
    signals_out = {}
    all_times = []

    for name, transitions in parsed.get("signals", {}).items():
        signals_out[name] = [{"time": t, "value": v} for t, v in transitions]
        all_times.extend([t for t, _ in transitions])

    time_range = [min(all_times), max(all_times)] if all_times else [0, 0]

    # Flatten truth table for overlay
    expected_flat = {}
    for t, sigs in truth_table.items():
        for sig, val in sigs.items():
            if sig not in expected_flat:
                expected_flat[sig] = []
            expected_flat[sig].append({"time": t, "value": val})

    return {
        "timescale": parsed.get("timescale", "1ns"),
        "signals": signals_out,
        "expected": expected_flat,
        "time_range": time_range
    }


# ─────────────────────────────────────────────
# SECTION 4: DEMO VCD GENERATOR
# ─────────────────────────────────────────────

def generate_demo_vcd(introduce_error: bool = False) -> str:
    """
    Generate a minimal VCD file string for demo/testing.
    If introduce_error=True, Q is wrong at t=30 (stays 0 instead of going 1).
    """
    q_at_30 = "0" if introduce_error else "1"

    return f"""$timescale 1ns $end
$scope module dff $end
$var wire 1 ! clk $end
$var wire 1 @ d $end
$var wire 1 # q $end
$upscope $end
$enddefinitions $end
$dumpvars
0!
0@
0#
$end
#0
0!
0@
0#
#10
1!
#20
0!
1@
#30
1!
{q_at_30}#
#40
0!
0@
#50
1!
0#
#60
0!
"""


# ─────────────────────────────────────────────
# SECTION 5: API ROUTES
# ─────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "VCD Verifier Backend"})


@app.route('/demo-vcd', methods=['GET'])
def demo_vcd():
    """
    Return a demo VCD file as plain text.
    Query param: ?error=true to introduce a deliberate mismatch.
    """
    introduce_error = request.args.get('error', 'false').lower() == 'true'
    vcd_content = generate_demo_vcd(introduce_error=introduce_error)
    from flask import Response
    return Response(vcd_content, mimetype='text/plain',
                    headers={"Content-Disposition": "attachment; filename=demo.vcd"})


@app.route('/upload', methods=['POST'])
def upload():
    """
    POST /upload
    Accept a VCD file via multipart form upload.
    Parse it, check against truth table, return JSON verdict.

    curl example:
      curl -X POST http://localhost:5000/upload -F "file=@test.vcd"
    """
    if 'file' not in request.files:
        return jsonify({"error": "No file part in request. Use field name 'file'."}), 400

    vcd_file = request.files['file']
    if vcd_file.filename == '':
        return jsonify({"error": "No file selected."}), 400

    if not vcd_file.filename.lower().endswith('.vcd'):
        return jsonify({"error": "Only .vcd files are accepted."}), 400

    # Save to a temp file for parsing
    with tempfile.NamedTemporaryFile(suffix='.vcd', delete=False) as tmp:
        vcd_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        # Step 1: Parse
        parsed = parse_vcd(tmp_path)

        # Step 2: Cache for /visualize
        global _last_waveform
        _last_waveform = parsed

        # Step 3: Check against truth table
        result = check_waveform(parsed, EXPECTED_TRUTH_TABLE)

        # Step 4: Build response
        response = {
            "verdict": result["verdict"],
            "errors": result["errors"],
            "summary": {
                "checked_points": result["checked_points"],
                "error_count": result["error_count"],
                "signals_found": list(parsed["signals"].keys()),
                "timescale": parsed["timescale"]
            }
        }
        return jsonify(response), 200

    except Exception as e:
        return jsonify({"error": f"Failed to parse VCD: {str(e)}"}), 500

    finally:
        os.unlink(tmp_path)  # Clean up temp file


@app.route('/visualize', methods=['GET'])
def visualize():
    """
    GET /visualize
    Return the last uploaded waveform as JSON for frontend plotting.
    Also returns expected truth table for overlay.

    curl example:
      curl http://localhost:5000/visualize
    """
    if not _last_waveform:
        return jsonify({"error": "No waveform loaded. Please POST to /upload first."}), 404

    vis_data = format_for_visualization(_last_waveform, EXPECTED_TRUTH_TABLE)
    return jsonify(vis_data), 200


@app.route('/truth-table', methods=['GET'])
def truth_table():
    """GET /truth-table — Return the hardcoded expected truth table."""
    return jsonify({"truth_table": EXPECTED_TRUTH_TABLE}), 200


# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 55)
    print("  VCD Waveform Verification Backend")
    print("  Running at http://localhost:5000")
    print("=" * 55)
    print("  Endpoints:")
    print("    POST /upload        → Upload & verify a VCD file")
    print("    GET  /visualize     → Get last waveform as JSON")
    print("    GET  /truth-table   → View expected truth table")
    print("    GET  /demo-vcd      → Download a sample VCD file")
    print("    GET  /demo-vcd?error=true → Sample VCD with errors")
    print("=" * 55)
    app.run(debug=True, host='0.0.0.0', port=5000)
