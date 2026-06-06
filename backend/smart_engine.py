import os
import difflib
from typing import List, Dict, Any

try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

def suggest_signal_mapping(available_signals: List[str], checker: str) -> Dict[str, str]:
    """
    Given a list of available signals from the VCD, guess the mapping to the
    expected inputs for the given checker using fuzzy matching and heuristics.
    """
    mapping = {}
    
    # Common synonyms for typical signal names
    synonyms = {
        "clk": ["clk", "clock", "sys_clk", "ck", "c"],
        "rst": ["rst", "reset", "rst_n", "reset_n", "clear", "clr"],
        "d": ["d", "data", "din", "d_in", "in_d"],
        "q": ["q", "out", "dout", "d_out", "out_q"],
        "t": ["t", "toggle"],
        "j": ["j"],
        "k": ["k"],
        "a": ["a", "in1", "in_a", "x"],
        "b": ["b", "in2", "in_b", "y"],
        "y": ["y", "out", "dout", "z", "res", "result"]
    }
    
    # Required signals by checker type
    required = []
    if checker in ["DFF", "T_FF", "JK_FF"]:
        required = ["clk", "q", "rst"]
        if checker == "DFF": required.append("d")
        elif checker == "T_FF": required.append("t")
        elif checker == "JK_FF": required.extend(["j", "k"])
    else:
        required = ["a", "b", "y"]

    # Simple base name extractor (e.g. "tb/dut/sys_clk" -> "sys_clk")
    def get_basename(sig: str) -> str:
        return sig.replace("/", ".").split(".")[-1].lower()

    for req in required:
        best_match = None
        best_score = 0.0
        
        # Check synonyms first using fuzzy matching on the basename
        req_synonyms = synonyms.get(req, [req])
        
        for sig in available_signals:
            base = get_basename(sig)
            
            # Direct exact match on basename has highest priority
            if base == req or base in req_synonyms:
                best_match = sig
                best_score = 1.0
                break
                
            # Fuzzy match
            for syn in req_synonyms:
                seq = difflib.SequenceMatcher(None, base, syn)
                ratio = seq.ratio()
                if ratio > best_score and ratio > 0.75:  # Threshold for similarity
                    best_score = ratio
                    best_match = sig
        
        if best_match:
            mapping[req] = best_match

    return mapping


def explain_verification_errors(checker: str, errors: List[Dict[str, Any]]) -> str:
    """
    Generates a human-readable explanation of verification errors.
    """
    if not errors:
        return "The verification passed successfully. No errors found."
    
    lines = []
    lines.append(f"Found {len(errors)} error(s) during {checker} verification.")
    
    # Categorize errors
    missing_signals = [e for e in errors if "Missing" in e.get("message", "")]
    timing_violations = [e for e in errors if "Timing violation" in e.get("message", "")]
    mismatches = [e for e in errors if "mismatch" in e.get("message", "").lower()]
    
    if missing_signals:
        lines.append("\n**Missing Signals:**")
        for e in missing_signals:
            lines.append(f"- {e.get('message')}. Please check your signal mapping.")
            
    if timing_violations:
        lines.append("\n**Timing Violations:**")
        lines.append("The output changed when it wasn't supposed to (e.g., outside an active clock edge).")
        for e in timing_violations[:3]:  # Show up to 3
            lines.append(f"- {e.get('message')}")
        if len(timing_violations) > 3:
            lines.append(f"- ...and {len(timing_violations) - 3} more timing violations.")
            
    if mismatches:
        lines.append("\n**Logic/Value Mismatches:**")
        lines.append("The expected logical value did not match the actual waveform.")
        for e in mismatches[:3]:
            lines.append(f"- {e.get('message')}")
        if len(mismatches) > 3:
            lines.append(f"- ...and {len(mismatches) - 3} more value mismatches.")
            
    # Add heuristic context
    if checker in ["DFF", "T_FF", "JK_FF"] and (mismatches or timing_violations):
        lines.append("\n*Smart Hint for Sequential Logic*: For flip-flops, ensure that the clock is mapped correctly, and that data inputs meet setup/hold times around the positive edge of the clock.")
    elif mismatches:
        lines.append(f"\n*Smart Hint for Combinational Logic*: For the {checker} gate, double-check that the inputs transition exactly when the output does, or account for propagation delays if this is a gate-level simulation.")

    return "\n".join(lines)


def analyze_debug_artifact(file_bytes: bytes, mime_type: str, user_api_key: str = "") -> str:
    """
    Sends the provided artifact (image or text) to Gemini to analyze and suggest debug steps.
    """
    if not HAS_GENAI:
        return "Error: The `google-genai` library is not installed. Please run `pip install google-genai` to use this feature."
        
    api_key = user_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "Error: GEMINI_API_KEY environment variable is not set. Please set it to use the Debug Assistant."
        
    try:
        client = genai.Client(api_key=api_key)
        
        prompt = (
            "You are an expert RTL Debug Assistant. Analyze the provided waveform screenshot or error log. "
            "Provide likely root causes, testbench hints, and next debug steps. Keep your response concise and technical, formatted in Markdown."
        )
        
        # We pass the bytes directly to Gemini 
        # using the types.Part.from_bytes utility
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                types.Part.from_bytes(
                    data=file_bytes,
                    mime_type=mime_type,
                ),
                prompt
            ]
        )
        return response.text
    except Exception as e:
        return f"Error communicating with Gemini: {str(e)}"

def chat_with_agent(message: str, user_api_key: str = "") -> str:
    """
    Sends a chat message to Gemini and returns the response.
    """
    if not HAS_GENAI:
        return "Error: The `google-genai` library is not installed. Please run `pip install google-genai` to use this feature."
        
    api_key = user_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "Error: GEMINI_API_KEY environment variable is not set. Please set it to use the Chatbot."
        
    try:
        client = genai.Client(api_key=api_key)
        
        # simple stateless chat
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=message
        )
        return response.text
    except Exception as e:
        return f"Error communicating with Gemini: {str(e)}"


def generate_testbench_with_ai(rtl_code: str, checker: str = "", user_api_key: str = "") -> str:
    """
    Uses Gemini to generate a complete, simulation-ready Verilog testbench
    for the given RTL module. The testbench includes $dumpfile/$dumpvars so
    it produces a VCD when run through iverilog/vvp.
    """
    if not HAS_GENAI:
        return "// Error: google-genai not installed."

    api_key = user_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "// Error: GEMINI_API_KEY not set."

    checker_hint = f"\nThe checker used to verify this design is: {checker.upper()}." if checker else ""

    system_prompt = (
        "You are an expert Verilog verification engineer. "
        "Generate a complete, simulation-ready Verilog testbench for the provided RTL module.\n\n"
        "STRICT RULES:\n"
        "1. Output ONLY valid Verilog code — no markdown, no explanations, no code fences.\n"
        "2. The testbench MUST include:\n"
        "   - `$dumpfile(\"dump.vcd\")` and `$dumpvars(0, <tb_module_name>)` at the start of the initial block.\n"
        "   - Stimulus covering all meaningful input combinations.\n"
        "   - `$finish` at the end.\n"
        "3. Instantiate the DUT using named port connections (e.g. .port(signal)).\n"
        "4. Use `\\`timescale 1ns/1ps` at the top.\n"
        "5. Declare all inputs as `reg` and all outputs as `wire`."
    )

    prompt = f"Generate a testbench for this Verilog module:{checker_hint}\n\n{rtl_code}"

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.1,
            )
        )
        tb_text = response.text.strip()
        # Strip any accidental markdown code fences
        if tb_text.startswith("```"):
            lines = tb_text.split("\n")
            tb_text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return tb_text
    except Exception as e:
        return f"// Error generating testbench: {str(e)}"

def generate_inline_edit_with_ai(code: str, selection: str, instruction: str, user_api_key: str = "") -> str:
    """
    Uses Gemini to perform an inline edit on the Verilog code based on the user's instruction.
    Returns the modified code block to replace the selection.
    """
    if not HAS_GENAI:
        return "// Error: google-genai not installed."

    api_key = user_api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return "// Error: GEMINI_API_KEY not set."

    system_prompt = (
        "You are an expert Verilog engineer acting as an inline AI Copilot. "
        "You will be given the full file context, the user's selected code block, and their instruction. "
        "Your task is to output ONLY the replacement code for the selected block. "
        "STRICT RULES:\n"
        "1. Do not output markdown fences (```verilog) around the result.\n"
        "2. Do not explain your changes.\n"
        "3. Output ONLY the exact replacement text that will substitute the selection."
    )

    prompt = (
        f"Context (full file):\n{code}\n\n"
        f"Selected block to modify:\n{selection}\n\n"
        f"Instruction: {instruction}"
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.1,
            )
        )
        edit_text = response.text.strip()
        if edit_text.startswith("```"):
            lines = edit_text.split("\n")
            edit_text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return edit_text
    except Exception as e:
        return f"// Error generating inline edit: {str(e)}"
