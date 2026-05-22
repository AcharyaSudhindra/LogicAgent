import difflib
from typing import List, Dict, Any

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
