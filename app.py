import json
import uuid
import os
import xml.etree.ElementTree as ET
from typing import Dict, Any, Tuple
from flask import Flask, request, jsonify, send_from_directory, Response

from backend.config import MAX_UPLOAD_BYTES, DEFAULT_TIMESCALE
from backend import (
    parse_vcd_text,
    verify_waveform,
    build_visualization_json,
    get_supported_checkers,
    get_checker_definitions,
)

from backend.smart_engine import suggest_signal_mapping, explain_verification_errors, analyze_debug_artifact, chat_with_agent
from backend.agent_engine import RTLVerificationAgent
from backend.sim_engine import simulate_verilog

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

LAST_PARSED: Dict[str, Any] = {"filename": None, "parsed": None}


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


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


def get_checker_from_request() -> str:
    checker = request.form.get("checker") or request.args.get("checker") or "AND"
    return checker.upper().strip()


def parse_signal_map_from_request() -> Dict[str, str]:
    signal_map: Dict[str, str] = {}

    map_json = request.form.get("signal_map") or request.args.get("signal_map")
    if map_json:
        try:
            parsed = json.loads(map_json)
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    if isinstance(v, str) and v.strip():
                        signal_map[k.strip().lower()] = v.strip()
        except json.JSONDecodeError:
            pass

    for key in ["a", "b", "y", "clk", "d", "q", "rst"]:
        val = request.form.get(f"map_{key}") or request.args.get(f"map_{key}")
        if val and val.strip():
            signal_map[key] = val.strip()

    return signal_map


@app.route("/", methods=["GET"])
def home():
    return send_from_directory(".", "index.html")


@app.route("/checkers", methods=["GET"])
def checkers():
    return jsonify({
        "default": "AND",
        "supported": get_supported_checkers(),
        "definitions": get_checker_definitions(),
    })


@app.route("/upload", methods=["POST", "OPTIONS"])
def upload_vcd():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200

    try:
        filename, vcd_text = read_uploaded_vcd_file()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    checker = get_checker_from_request()
    signal_map = parse_signal_map_from_request()
    assertion_str = request.form.get("assertion_str") or request.args.get("assertion_str") or ""
    parsed = parse_vcd_text(vcd_text, default_timescale=DEFAULT_TIMESCALE)
    verify_result = verify_waveform(parsed, checker=checker, signal_map=signal_map, assertion_str=assertion_str)

    LAST_PARSED["filename"] = filename
    LAST_PARSED["parsed"] = parsed

    return jsonify({
        "filename": filename,
        "timescale": parsed["timescale"],
        "signals_found": sorted(parsed["transitions"].keys()),
        "verdict": verify_result["verdict"],
        "error_count": verify_result["error_count"],
        "errors": verify_result["errors"],
        "summary": verify_result["summary"],
        "checker": verify_result["checker"],
        "requested_checker": checker,
        "signal_map": signal_map,
        "supported_checkers": get_supported_checkers(),
    })
@app.route("/upload_wcfg", methods=["POST", "OPTIONS"])
def upload_wcfg():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200

    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    uploaded = request.files["file"]
    if uploaded.filename == "":
        return jsonify({"error": "No selected file."}), 400

    text = uploaded.read().decode("utf-8", errors="ignore")
    if not text.strip():
        return jsonify({"error": "Uploaded file is empty or unreadable."}), 400

    signals = []
    try:
        root = ET.fromstring(text)
        for wvobj in root.findall(".//wvobject"):
            fp_name = wvobj.get("fp_name")
            if fp_name:
                signals.append(fp_name)
    except Exception as e:
        return jsonify({"error": f"Failed to parse WCFG: {str(e)}"}), 400

    return jsonify({"signals": signals})


@app.route("/visualize", methods=["POST", "OPTIONS"])
def visualize_vcd():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200

    if "file" in request.files and request.files["file"].filename:
        try:
            filename, vcd_text = read_uploaded_vcd_file()
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

        parsed = parse_vcd_text(vcd_text, default_timescale=DEFAULT_TIMESCALE)
        LAST_PARSED["filename"] = filename
        LAST_PARSED["parsed"] = parsed
        return jsonify(build_visualization_json(parsed))

    if LAST_PARSED["parsed"] is not None:
        return jsonify(build_visualization_json(LAST_PARSED["parsed"]))

    return jsonify({
        "error": "No waveform available. Upload a VCD to /upload or send a file to /visualize."
    }), 400


@app.route("/smart/map_signals", methods=["POST", "OPTIONS"])
def smart_map_signals():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200
        
    data = request.json or {}
    signals = data.get("signals", [])
    checker = data.get("checker", "AND").upper()
    
    mapping = suggest_signal_mapping(signals, checker)
    return jsonify({"mapping": mapping})


@app.route("/smart/explain_error", methods=["POST", "OPTIONS"])
def smart_explain_error():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200
        
    data = request.json or {}
    checker = data.get("checker", "UNKNOWN")
    errors = data.get("errors", [])
    
    explanation = explain_verification_errors(checker, errors)
    return jsonify({"explanation": explanation})


@app.route("/smart/debug_assistant", methods=["POST", "OPTIONS"])
def smart_debug_assistant():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200
        
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    uploaded = request.files["file"]
    if uploaded.filename == "":
        return jsonify({"error": "No selected file."}), 400
        
    file_bytes = uploaded.read()
    mime_type = uploaded.mimetype
    if not mime_type:
        mime_type = "text/plain" # fallback
        
    api_key = request.form.get("api_key", "")
    analysis = analyze_debug_artifact(file_bytes, mime_type, api_key)
    return jsonify({"analysis": analysis})


@app.route("/smart/chat", methods=["POST", "OPTIONS"])
def smart_chat():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200
        
    data = request.json or {}
    message = data.get("message", "")
    api_key = data.get("api_key", "")
    if not message:
        return jsonify({"error": "No message provided."}), 400
        
    response = chat_with_agent(message, api_key)
    return jsonify({"response": response})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "max_upload_bytes": app.config["MAX_CONTENT_LENGTH"],
        "last_uploaded_file": LAST_PARSED["filename"],
        "supported_checkers": get_supported_checkers(),
    })


# --- Autonomous RTL Agent Routes ---

AGENT_SESSIONS: Dict[str, RTLVerificationAgent] = {}

TEMPLATES = {
    "AND": {
        "goal": "Fix the AND gate logic: the output y should represent a AND b.",
        "code": "module and_gate(a, b, y);\n  input a, b;\n  output y;\n  // BUG: Used OR instead of AND\n  assign y = a | b;\nendmodule"
    },
    "DFF": {
        "goal": "Fix the D Flip-Flop: q captures d at posedge clk, with an active-high reset rst that forces q to 0.",
        "code": "module dff(clk, d, q, rst);\n  input clk, d, rst;\n  output reg q;\n  // BUG: Triggers on negedge and reset sets to 1\n  always @(negedge clk) begin\n    if (rst) q <= 1'b1;\n    else q <= d;\n  end\nendmodule"
    },
    "FULL_ADDER": {
        "goal": "Fix the 1-bit Full Adder: calculate correct sum and cout outputs from a, b, and cin.",
        "code": "module full_adder(a, b, cin, sum, cout);\n  input a, b, cin;\n  output sum, cout;\n  // BUG: sum logic is missing cin, cout logic is incorrect\n  assign sum = a ^ b;\n  assign cout = (a & b) | cin;\nendmodule"
    }
}


@app.route("/agent/templates", methods=["GET"])
def get_templates():
    return jsonify(TEMPLATES)


@app.route("/agent/session", methods=["POST", "OPTIONS"])
def create_agent_session():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200
        
    data = request.json or {}
    code = data.get("code", "")
    checker = data.get("checker", "AND").upper()
    goal = data.get("goal", "")
    
    api_key = os.environ.get("GEMINI_API_KEY") or data.get("api_key", "")
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY environment variable or user API key is not set. Please supply it to start."}), 400

    session_id = str(uuid.uuid4())
    agent = RTLVerificationAgent(code, checker, goal, api_key)
    AGENT_SESSIONS[session_id] = agent
    
    return jsonify({
        "session_id": session_id,
        "checker": checker,
        "goal": goal
    })


@app.route("/agent/run/<session_id>", methods=["GET"])
def run_agent_loop(session_id):
    agent = AGENT_SESSIONS.get(session_id)
    if not agent:
        return jsonify({"error": "Invalid or expired session ID."}), 404
        
    def stream():
        for event_data in agent.execute_loop():
            yield f"data: {event_data}\n\n"
            
    return Response(stream(), mimetype="text/event-stream")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=os.environ.get("FLASK_DEBUG", "0") == "1")
