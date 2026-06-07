import json
import uuid
import os
import asyncio
import xml.etree.ElementTree as ET
from typing import Dict, Any, List

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import engine, Base, get_db
from backend.models import VerificationSession, VCDUpload
from backend.config import DEFAULT_TIMESCALE
from backend import (
    parse_vcd_text,
    verify_waveform,
    build_visualization_json,
    get_supported_checkers,
    get_checker_definitions,
)
from backend.smart_engine import suggest_signal_mapping, explain_verification_errors, analyze_debug_artifact, chat_with_agent, generate_testbench_with_ai
from backend.agent_engine import RTLVerificationAgent
from backend.sim_engine import is_iverilog_available, get_iverilog_version, simulate_with_custom_tb

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LogicAgent AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LAST_PARSED: Dict[str, Any] = {"filename": None, "parsed": None}

@app.get("/checkers")
async def checkers():
    return {
        "default": "AND",
        "supported": get_supported_checkers(),
        "definitions": get_checker_definitions(),
    }


@app.get("/sim/backend_info")
async def sim_backend_info():
    """Returns which simulation backend is active (iverilog or built-in)."""
    if is_iverilog_available():
        return {
            "backend": "iverilog",
            "version": get_iverilog_version(),
            "description": "Icarus Verilog — full IEEE 1364 Verilog simulator",
        }
    return {
        "backend": "builtin",
        "version": None,
        "description": "Built-in behavioral simulator (no iverilog found on PATH)",
    }

@app.post("/upload")
async def upload_vcd(
    file: UploadFile = File(...),
    checker: str = Form("AND"),
    signal_map: str = Form("{}"),
    assertion_str: str = Form(""),
    db: Session = Depends(get_db)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file.")
    
    content = await file.read()
    vcd_text = content.decode("utf-8", errors="ignore")
    
    if not vcd_text.strip():
        raise HTTPException(status_code=400, detail="Uploaded file is empty or unreadable.")
    
    # Save to DB
    upload_record = VCDUpload(filename=file.filename, content=vcd_text)
    db.add(upload_record)
    db.commit()
    
    checker = checker.upper().strip()
    try:
        sig_map_dict = json.loads(signal_map)
    except Exception:
        sig_map_dict = {}

    parsed = parse_vcd_text(vcd_text, default_timescale=DEFAULT_TIMESCALE)
    verify_result = verify_waveform(parsed, checker=checker, signal_map=sig_map_dict, assertion_str=assertion_str)

    LAST_PARSED["filename"] = file.filename
    LAST_PARSED["parsed"] = parsed

    return {
        "filename": file.filename,
        "timescale": parsed["timescale"],
        "signals_found": sorted(parsed["transitions"].keys()),
        "verdict": verify_result["verdict"],
        "error_count": verify_result["error_count"],
        "errors": verify_result["errors"],
        "summary": verify_result["summary"],
        "checker": verify_result["checker"],
        "requested_checker": checker,
        "signal_map": sig_map_dict,
        "supported_checkers": get_supported_checkers(),
    }

@app.post("/upload_wcfg")
async def upload_wcfg(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file.")
    content = await file.read()
    text = content.decode("utf-8", errors="ignore")
    
    signals = []
    try:
        root = ET.fromstring(text)
        for wvobj in root.findall(".//wvobject"):
            fp_name = wvobj.get("fp_name")
            if fp_name:
                signals.append(fp_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse WCFG: {str(e)}")
    
    return {"signals": signals}

@app.post("/visualize")
async def visualize_vcd(file: UploadFile = File(None)):
    if file and file.filename:
        content = await file.read()
        vcd_text = content.decode("utf-8", errors="ignore")
        parsed = parse_vcd_text(vcd_text, default_timescale=DEFAULT_TIMESCALE)
        LAST_PARSED["filename"] = file.filename
        LAST_PARSED["parsed"] = parsed
        return build_visualization_json(parsed)
        
    if LAST_PARSED["parsed"] is not None:
        return build_visualization_json(LAST_PARSED["parsed"])
        
    raise HTTPException(status_code=400, detail="No waveform available.")

class MapSignalsRequest(BaseModel):
    signals: List[str] = []
    checker: str = "AND"
    api_key: str = ""

@app.post("/smart/map_signals")
async def smart_map_signals(req: MapSignalsRequest):
    mapping = suggest_signal_mapping(req.signals, req.checker)
    return {"mapping": mapping}

class ExplainErrorRequest(BaseModel):
    checker: str = "UNKNOWN"
    errors: list = []
    api_key: str = ""

@app.post("/smart/explain_error")
async def smart_explain_error(req: ExplainErrorRequest):
    explanation = explain_verification_errors(req.checker, req.errors)
    return {"explanation": explanation}

@app.post("/smart/debug_assistant")
async def smart_debug_assistant(file: UploadFile = File(...), api_key: str = Form("")):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No selected file.")
    file_bytes = await file.read()
    mime_type = file.content_type or "text/plain"
    analysis = analyze_debug_artifact(file_bytes, mime_type, api_key)
    return {"analysis": analysis}

class ChatRequest(BaseModel):
    message: str
    api_key: str = ""

@app.post("/smart/chat")
async def smart_chat(req: ChatRequest):
    if not req.message:
        raise HTTPException(status_code=400, detail="No message provided.")
    response = chat_with_agent(req.message, req.api_key)
    return {"response": response}

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

@app.get("/agent/templates")
async def get_templates():
    return TEMPLATES

class SessionRequest(BaseModel):
    code: str = ""
    checker: str = "AND"
    goal: str = ""
    api_key: str = ""

@app.post("/agent/session")
async def create_agent_session(req: SessionRequest, db: Session = Depends(get_db)):
    api_key = os.environ.get("GEMINI_API_KEY") or req.api_key
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key not provided.")
        
    session_id = str(uuid.uuid4())
    agent = RTLVerificationAgent(req.code, req.checker, req.goal, api_key)
    AGENT_SESSIONS[session_id] = agent
    
    # Save to DB
    sess_record = VerificationSession(
        session_id=session_id,
        checker=req.checker,
        goal=req.goal,
        code=req.code
    )
    db.add(sess_record)
    db.commit()
    
    return {
        "session_id": session_id,
        "checker": req.checker,
        "goal": req.goal
    }

@app.websocket("/ws/agent/{session_id}")
async def websocket_agent_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    agent = AGENT_SESSIONS.get(session_id)
    if not agent:
        await websocket.send_json({"type": "error", "message": "Invalid session"})
        await websocket.close()
        return
        
    try:
        for event_data in agent.execute_loop():
            await websocket.send_text(event_data)
            await asyncio.sleep(0.01)
    except WebSocketDisconnect:
        print(f"Client disconnected: {session_id}")
    except Exception as e:
        await websocket.send_json({"type": "error", "message": str(e)})


# ---------------------------------------------------------------------------
# Code Lab endpoints
# ---------------------------------------------------------------------------

class FileItem(BaseModel):
    name: str
    content: str

class CustomSimRequest(BaseModel):
    files: List[FileItem]
    checker: str = "AND"


@app.post("/sim/run_custom")
async def run_custom_simulation(req: CustomSimRequest):
    """
    Compile and simulate user-provided RTL + testbench.
    Returns VCD text, console output, and verification results.
    """
    files_dict = [{"name": f.name, "content": f.content} for f in req.files]
    success, vcd, console, verify = simulate_with_custom_tb(
        files_dict, req.checker
    )
    signals_found: List[str] = []
    if success and vcd:
        from backend import parse_vcd_text
        try:
            parsed = parse_vcd_text(vcd)
            signals_found = sorted(parsed["transitions"].keys())
        except Exception:
            pass

    return {
        "success": success,
        "vcd": vcd if success else None,
        "console_output": console,
        "verdict": verify.get("verdict", "Error") if verify else "Error",
        "errors": verify.get("errors", []) if verify else [],
        "error_count": verify.get("error_count", 0) if verify else 0,
        "summary": verify.get("summary", {}) if verify else {},
        "checker": verify.get("checker", req.checker) if verify else req.checker,
        "signals_found": signals_found,
        "backend": "iverilog" if is_iverilog_available() else "builtin",
    }


class GenerateTBRequest(BaseModel):
    rtl_code: str
    checker: str = ""
    api_key: str = ""


@app.post("/ai/generate_testbench")
async def generate_testbench(req: GenerateTBRequest):
    """Use Gemini to generate a simulation-ready Verilog testbench."""
    tb_code = generate_testbench_with_ai(
        req.rtl_code, req.checker, req.api_key
    )
    return {"testbench_code": tb_code}

class InlineEditRequest(BaseModel):
    code: str
    selection: str
    instruction: str
    api_key: str = ""

@app.post("/ai/inline_edit")
async def inline_edit(req: InlineEditRequest):
    """Use Gemini to perform an inline edit on Verilog code."""
    from backend.smart_engine import generate_inline_edit_with_ai
    new_code = generate_inline_edit_with_ai(
        req.code, req.selection, req.instruction, req.api_key
    )
    return {"new_code": new_code}


from fastapi.staticfiles import StaticFiles

import os
from fastapi.responses import FileResponse

# Serve index.html at root
@app.get("/")
async def serve_index():
    return FileResponse("static/index.html")

# Catch-all route to properly serve Next.js .html files even if a directory exists
@app.get("/{full_path:path}")
async def serve_nextjs_paths(full_path: str):
    if os.path.isfile(f"static/{full_path}"):
        return FileResponse(f"static/{full_path}")
    if os.path.isfile(f"static/{full_path}.html"):
        return FileResponse(f"static/{full_path}.html")
    # Fallback to index
    return FileResponse("static/index.html")
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=os.environ.get("UVICORN_RELOAD", "0") == "1")
