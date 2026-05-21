from typing import Dict, List, Any, Callable, Optional, Tuple
import re


LOGIC_CHECKERS: Dict[str, Callable[..., Dict[str, str]]] = {
    "AND": lambda a, b: {"y": "1" if (a == "1" and b == "1") else "0"},
    "OR": lambda a, b: {"y": "1" if (a == "1" or b == "1") else "0"},
    "XOR": lambda a, b: {"y": "1" if (a != b) else "0"},
    "NAND": lambda a, b: {"y": "0" if (a == "1" and b == "1") else "1"},
    "NOR": lambda a, b: {"y": "0" if (a == "1" or b == "1") else "1"},
    "XNOR": lambda a, b: {"y": "0" if (a != b) else "1"},
    "HALF_ADDER": lambda a, b: {"sum": "1" if a != b else "0", "carry": "1" if (a == "1" and b == "1") else "0"},
    "FULL_ADDER": lambda a, b, cin: {
        "sum": "1" if ((1 if a=="1" else 0) + (1 if b=="1" else 0) + (1 if cin=="1" else 0)) % 2 != 0 else "0",
        "cout": "1" if ((1 if a=="1" else 0) + (1 if b=="1" else 0) + (1 if cin=="1" else 0)) >= 2 else "0"
    },
    "MUX2": lambda d0, d1, sel: {"y": d1 if sel == "1" else (d0 if sel == "0" else "x")},
}

CHECKER_METADATA: Dict[str, Dict[str, Any]] = {
    "AND": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["y"], "required": ["a", "b", "y"], "description": "y = a AND b"},
    "OR": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["y"], "required": ["a", "b", "y"], "description": "y = a OR b"},
    "XOR": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["y"], "required": ["a", "b", "y"], "description": "y = a XOR b"},
    "NAND": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["y"], "required": ["a", "b", "y"], "description": "y = NOT(a AND b)"},
    "NOR": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["y"], "required": ["a", "b", "y"], "description": "y = NOT(a OR b)"},
    "XNOR": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["y"], "required": ["a", "b", "y"], "description": "y = NOT(a XOR b)"},
    "HALF_ADDER": {"kind": "logic", "inputs": ["a", "b"], "outputs": ["sum", "carry"], "required": ["a", "b", "sum", "carry"], "description": "sum = a XOR b; carry = a AND b"},
    "FULL_ADDER": {"kind": "logic", "inputs": ["a", "b", "cin"], "outputs": ["sum", "cout"], "required": ["a", "b", "cin", "sum", "cout"], "description": "1-bit full adder"},
    "MUX2": {"kind": "logic", "inputs": ["d0", "d1", "sel"], "outputs": ["y"], "required": ["d0", "d1", "sel", "y"], "description": "y = d1 if sel else d0"},
    "DFF": {"kind": "sequential", "required": ["clk", "d", "q"], "optional": ["rst"], "description": "q captures d at clk rising edge; optional rst forces q=0"},
}


def normalize_bit(value: str) -> str:
    if not value:
        return "x"
    v = value.strip().lower()
    if v in ("0", "1", "x", "z"):
        return v
    return "x"


def value_at_time(signal_transitions: List[Dict[str, Any]], t: int, default: str = "x") -> str:
    value = default
    for tr in signal_transitions:
        if tr["time"] <= t:
            value = tr["value"]
        else:
            break
    return normalize_bit(value)


def format_time(t: int, timescale: str) -> str:
    m = re.match(r"^\s*1\s*([a-zA-Z]+)\s*$", timescale)
    return f"{t}{m.group(1)}" if m else f"{t} ticks"


def _tokenize(name: str) -> List[str]:
    return [tok for tok in re.split(r"[\./\[\]_\\]+", name.lower()) if tok]


def resolve_signal_name(available_signals: List[str], canonical: str, mapped_hint: Optional[str] = None) -> Tuple[Optional[str], List[str]]:
    """
    Resolve a canonical signal (a/b/y/clk/d/q/rst) to an actual VCD signal name.

    Priority:
      1. exact mapping hint
      2. case-insensitive exact
      3. suffix match for hierarchical names (e.g. tb/dut/a)
      4. token match
    """
    if not available_signals:
        return None, []

    candidates = []
    if mapped_hint and mapped_hint.strip():
        candidates.append(mapped_hint.strip())
    candidates.append(canonical)

    lower_to_original = {s.lower(): s for s in available_signals}

    for cand in candidates:
        if cand in available_signals:
            return cand, [cand]
        if cand.lower() in lower_to_original:
            return lower_to_original[cand.lower()], [lower_to_original[cand.lower()]]

    for cand in candidates:
        c = cand.lower()
        suffix_hits = [s for s in available_signals if s.lower().endswith(f"/{c}") or s.lower().endswith(f".{c}") or s.lower().endswith(f"_{c}") or s.lower().endswith(f"[{c}]")]
        if len(suffix_hits) == 1:
            return suffix_hits[0], suffix_hits
        if len(suffix_hits) > 1:
            return None, suffix_hits

    for cand in candidates:
        c = cand.lower()
        token_hits = [s for s in available_signals if c in _tokenize(s)]
        if len(token_hits) == 1:
            return token_hits[0], token_hits
        if len(token_hits) > 1:
            return None, token_hits

    return None, []


def _build_missing_signal_error(canonical: str, hint: Optional[str], matched_candidates: List[str]) -> Dict[str, Any]:
    hint_txt = f" (hint: {hint})" if hint else ""
    cand_txt = f" Candidates matched ambiguously: {matched_candidates}." if matched_candidates else ""
    return {
        "type": "missing_signal",
        "signal": canonical,
        "time": None,
        "expected": None,
        "actual": None,
        "message": f"Unable to resolve required signal '{canonical}'{hint_txt}.{cand_txt}".strip()
    }


def _resolve_required_signals(transitions: Dict[str, List[Dict[str, Any]]], required: List[str], signal_map: Optional[Dict[str, str]]) -> Tuple[Dict[str, str], List[Dict[str, Any]]]:
    resolved: Dict[str, str] = {}
    errors: List[Dict[str, Any]] = []
    available = list(transitions.keys())
    signal_map = signal_map or {}

    for canonical in required:
        hint = signal_map.get(canonical)
        resolved_name, matched_candidates = resolve_signal_name(available, canonical, hint)
        if not resolved_name:
            errors.append(_build_missing_signal_error(canonical, hint, matched_candidates))
            continue

        if not transitions.get(resolved_name):
            errors.append({
                "type": "missing_signal",
                "signal": canonical,
                "time": None,
                "expected": None,
                "actual": None,
                "message": f"Resolved '{canonical}' to '{resolved_name}', but no transitions exist."
            })
            continue

        resolved[canonical] = resolved_name

    return resolved, errors


def _logic_expected(input_vals: Dict[str, str], checker_name: str, outputs: List[str]) -> Dict[str, str]:
    normalized_inputs = {k: normalize_bit(v) for k, v in input_vals.items()}
    if any(v not in ("0", "1") for v in normalized_inputs.values()):
        return {out: "x" for out in outputs}
    return LOGIC_CHECKERS[checker_name](**normalized_inputs)


def verify_logic_function(parsed: Dict[str, Any], checker: str = "AND", signal_map: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    checker_name = checker.upper().strip()
    if checker_name not in LOGIC_CHECKERS:
        checker_name = "AND"

    transitions = parsed["transitions"]
    timescale = parsed["timescale"]
    meta = CHECKER_METADATA[checker_name]
    required = meta["required"]
    inputs = meta["inputs"]
    outputs = meta["outputs"]

    resolved, errors = _resolve_required_signals(transitions, required, signal_map)
    if errors:
        return {
            "checker": f"{checker_name}_TRUTH_TABLE",
            "verdict": "Incorrect",
            "error_count": len(errors),
            "errors": errors,
            "summary": {
                "checked_timestamps": 0,
                "required_signals": required,
                "resolved_signals": resolved,
            }
        }

    input_trs = {inp: transitions[resolved[inp]] for inp in inputs}
    output_trs = {out: transitions[resolved[out]] for out in outputs}

    time_axis = {0}
    for tr_list in list(input_trs.values()) + list(output_trs.values()):
        for tr in tr_list:
            time_axis.add(tr["time"])
    sorted_times = sorted(time_axis)

    expected_transition_times = {out: {0} for out in outputs}
    prev_expected = None
    compared_points = 0

    for t in sorted_times:
        current_inputs = {inp: value_at_time(input_trs[inp], t) for inp in inputs}
        current_outputs = {out: value_at_time(output_trs[out], t) for out in outputs}
        
        expected = _logic_expected(current_inputs, checker_name, outputs)

        if prev_expected is None:
            prev_expected = expected
        elif expected != prev_expected:
            for out in outputs:
                if expected[out] != prev_expected[out]:
                    expected_transition_times[out].add(t)
            prev_expected = expected

        if any(v in ("0", "1") for v in expected.values()):
            compared_points += 1
            for out in outputs:
                exp_val = expected[out]
                act_val = current_outputs[out]
                if exp_val in ("0", "1"):
                    if act_val not in ("0", "1") or act_val != exp_val:
                        errors.append({
                            "type": "mismatch",
                            "signal": out,
                            "time": t,
                            "expected": exp_val,
                            "actual": act_val,
                            "message": f"Signal mismatch at t={format_time(t, timescale)}: expected {out}={exp_val}, got {out}={act_val}."
                        })

    for out in outputs:
        y_tr = output_trs[out]
        for i in range(1, len(y_tr)):
            t = y_tr[i]["time"]
            if t not in expected_transition_times[out]:
                errors.append({
                    "type": "timing_violation",
                    "signal": out,
                    "time": t,
                    "expected": "no_transition",
                    "actual": "transition",
                    "message": f"Timing violation: {out} changed unexpectedly at t={format_time(t, timescale)}."
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
            "resolved_signals": resolved,
        }
    }


def verify_dff(parsed: Dict[str, Any], signal_map: Optional[Dict[str, str]] = None, rst_active_high: bool = True) -> Dict[str, Any]:
    transitions = parsed["transitions"]
    timescale = parsed["timescale"]

    required = CHECKER_METADATA["DFF"]["required"]
    resolved, errors = _resolve_required_signals(transitions, required, signal_map)

    rst_name = None
    if signal_map and signal_map.get("rst"):
        rst_name, rst_candidates = resolve_signal_name(list(transitions.keys()), "rst", signal_map.get("rst"))
        if rst_candidates and rst_name is None:
            errors.append(_build_missing_signal_error("rst", signal_map.get("rst"), rst_candidates))
    else:
        # best-effort auto resolve optional rst
        rst_name, _ = resolve_signal_name(list(transitions.keys()), "rst", None)

    if errors:
        return {
            "checker": "DFF_POSEDGE",
            "verdict": "Incorrect",
            "error_count": len(errors),
            "errors": errors,
            "summary": {
                "checked_edges": 0,
                "required_signals": required,
                "resolved_signals": resolved,
                "rst_signal": rst_name,
            }
        }

    clk_tr = transitions[resolved["clk"]]
    d_tr = transitions[resolved["d"]]
    q_tr = transitions[resolved["q"]]
    rst_tr = transitions[rst_name] if rst_name else None

    rising_edges: List[int] = []
    for i in range(1, len(clk_tr)):
        prev_val = normalize_bit(clk_tr[i - 1]["value"])
        cur_val = normalize_bit(clk_tr[i]["value"])
        if prev_val == "0" and cur_val == "1":
            rising_edges.append(clk_tr[i]["time"])

    checked_edges = 0
    allowed_q_change_times = set(rising_edges)

    for t in rising_edges:
        d_val = value_at_time(d_tr, t)
        q_val = value_at_time(q_tr, t)

        rst_active = False
        if rst_tr:
            rst_val = value_at_time(rst_tr, t)
            rst_active = (rst_val == "1") if rst_active_high else (rst_val == "0")

        expected = "0" if rst_active else d_val
        if expected in ("0", "1"):
            checked_edges += 1
            if q_val != expected:
                errors.append({
                    "type": "mismatch",
                    "signal": "q",
                    "time": t,
                    "expected": expected,
                    "actual": q_val,
                    "message": f"DFF mismatch at t={format_time(t, timescale)}: expected q={expected}, got q={q_val}."
                })

    for i in range(1, len(q_tr)):
        t = q_tr[i]["time"]
        if t not in allowed_q_change_times:
            errors.append({
                "type": "timing_violation",
                "signal": "q",
                "time": t,
                "expected": "posedge_change_only",
                "actual": "q_changed",
                "message": f"Timing violation: q changed outside posedge at t={format_time(t, timescale)}."
            })

    verdict = "Correct" if not errors else "Incorrect"
    return {
        "checker": "DFF_POSEDGE",
        "verdict": verdict,
        "error_count": len(errors),
        "errors": errors,
        "summary": {
            "checked_edges": checked_edges,
            "required_signals": required,
            "resolved_signals": resolved,
            "rst_signal": rst_name,
        }
    }


def verify_waveform(parsed: Dict[str, Any], checker: str = "AND", signal_map: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    checker_name = checker.upper().strip()
    if checker_name == "DFF":
        return verify_dff(parsed, signal_map=signal_map)
    return verify_logic_function(parsed, checker=checker_name, signal_map=signal_map)


def get_supported_checkers() -> List[str]:
    return sorted(CHECKER_METADATA.keys())


def get_checker_definitions() -> Dict[str, Dict[str, Any]]:
    return CHECKER_METADATA
