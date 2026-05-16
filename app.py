from typing import Dict, Any, Tuple
from flask import Flask, request, jsonify, send_from_directory

from backend.config import MAX_UPLOAD_BYTES, DEFAULT_TIMESCALE
from backend import parse_vcd_text, verify_logic_function, build_visualization_json, get_supported_checkers

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


@app.route("/", methods=["GET"])
def home():
    return send_from_directory(".", "index.html")


@app.route("/checkers", methods=["GET"])
def checkers():
    supported = get_supported_checkers()
    return jsonify({"default": "AND", "supported": supported})


@app.route("/upload", methods=["POST", "OPTIONS"])
def upload_vcd():
    if request.method == "OPTIONS":
        return jsonify({"ok": True}), 200

    try:
        filename, vcd_text = read_uploaded_vcd_file()
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    checker = get_checker_from_request()
    parsed = parse_vcd_text(vcd_text, default_timescale=DEFAULT_TIMESCALE)
    verify_result = verify_logic_function(parsed, checker=checker)

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
