import re
from typing import Dict, Any, List

def value_at(transitions: List[Dict[str, Any]], t: int) -> str:
    val = "x"
    for tr in transitions:
        if tr["time"] <= t:
            val = tr["value"]
        else:
            break
    return val

def parse_condition(cond_str: str) -> tuple:
    cond_str = cond_str.strip()
    match = re.match(r'^([a-zA-Z0-9_]+)\s*(==|!=)\s*([01])$', cond_str)
    if match:
        sig, op, val = match.groups()
        if op == "!=":
            val = "0" if val == "1" else "1"
        return sig, val
    return cond_str, "1"

def evaluate_assertion(parsed_vcd: Dict[str, Any], assertion_str: str, signal_map: Dict[str, str]) -> Dict[str, Any]:
    transitions = parsed_vcd.get("transitions", {})
    timescale = parsed_vcd.get("timescale", "1ns")
    errors = []
    
    def resolve(sig_name):
        return signal_map.get(sig_name, sig_name)

    # Basic pattern matching
    # Pattern: COND1 -> OP(COND2)
    # OP can be nothing, "next", or "eventually"
    match = re.match(r'^(.*?)->\s*(next|eventually)?\s*\((.*?)\)$', assertion_str.strip())
    if match:
        antecedent_str, op, consequent_str = match.groups()
    else:
        match = re.match(r'^(.*?)->(.*)$', assertion_str.strip())
        if match:
            antecedent_str, consequent_str = match.groups()
            op = None
        else:
            return {"verdict": "Error", "errors": [{"message": "Invalid assertion syntax. Use 'A -> B', 'A -> next(B)', or 'A -> eventually(B)'."}], "summary": {}}

    sig_A, val_A = parse_condition(antecedent_str)
    sig_B, val_B = parse_condition(consequent_str)

    real_A = resolve(sig_A)
    real_B = resolve(sig_B)
    real_clk = resolve("clk")

    if real_A not in transitions:
        return {"verdict": "Error", "errors": [{"message": f"Signal '{real_A}' not found in VCD."}], "summary": {}}
    if real_B not in transitions:
        return {"verdict": "Error", "errors": [{"message": f"Signal '{real_B}' not found in VCD."}], "summary": {}}

    tr_A = transitions[real_A]
    tr_B = transitions[real_B]

    # Find all times where antecedent is true
    # We will only check at times where A transitions TO val_A, to avoid checking every single picosecond
    trigger_times = []
    for tr in tr_A:
        if tr["value"] == val_A:
            trigger_times.append(tr["time"])

    checked_points = 0

    if op is None:
        # Combinational: A -> B
        for t in trigger_times:
            checked_points += 1
            if value_at(tr_B, t) != val_B:
                errors.append({
                    "message": f"Assertion '{assertion_str}' failed at t={t}{timescale}. {real_A} was {val_A} but {real_B} was {value_at(tr_B, t)}.",
                    "time": t,
                    "signal": real_B
                })
    else:
        # Sequential: needs clk
        if real_clk not in transitions:
            return {"verdict": "Error", "errors": [{"message": f"Sequential assertion requires 'clk' signal, but '{real_clk}' was not found in VCD."}], "summary": {}}
        
        tr_clk = transitions[real_clk]
        clk_posedges = [tr["time"] for i, tr in enumerate(tr_clk) if tr["value"] == "1" and (i == 0 or tr_clk[i-1]["value"] == "0")]
        
        for t in trigger_times:
            # Find the next clock posedge strictly after t
            next_edges = [ct for ct in clk_posedges if ct > t]
            if not next_edges:
                break # No more clocks
                
            checked_points += 1
            if op == "next":
                t_check = next_edges[0]
                if value_at(tr_B, t_check) != val_B:
                    errors.append({
                        "message": f"Assertion '{assertion_str}' failed at next cycle (t={t_check}{timescale}) following trigger at t={t}{timescale}. Expected {real_B}=={val_B}, got {value_at(tr_B, t_check)}.",
                        "time": t_check,
                        "signal": real_B
                    })
            elif op == "eventually":
                # Must become val_B at some future clock edge
                found = False
                for t_check in next_edges:
                    if value_at(tr_B, t_check) == val_B:
                        found = True
                        break
                if not found:
                    errors.append({
                        "message": f"Assertion '{assertion_str}' failed. Triggered at t={t}{timescale}, but {real_B}=={val_B} never occurred in the future.",
                        "time": t,
                        "signal": real_B
                    })

    verdict = "Correct" if not errors else "Incorrect"
    return {
        "verdict": verdict,
        "errors": errors,
        "summary": {"checked_timestamps": checked_points},
        "checker": "ASSERTION"
    }
