import json
from typing import Dict, Any, Tuple
from flask import Flask, request, jsonify, send_from_directory

from backend.config import MAX_UPLOAD_BYTES, DEFAULT_TIMESCALE
from backend import (
    parse_vcd_text,
    verify_waveform,
    build_visualization_json,
    get_supported_checkers,
    get_checker_definitions,
)

from backend.smart_engine import suggest_signal_mapping, explain_verification_errors, analyze_debug_artifact

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
        
    analysis = analyze_debug_artifact(file_bytes, mime_type)
    return jsonify({"analysis": analysis})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "max_upload_bytes": app.config["MAX_CONTENT_LENGTH"],
        "last_uploaded_file": LAST_PARSED["filename"],
        "supported_checkers": get_supported_checkers(),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
