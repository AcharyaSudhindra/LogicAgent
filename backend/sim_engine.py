import re
import os
import shutil
import subprocess
import tempfile
from typing import Dict, Any, List, Tuple, Optional

class RTLSimulator:
    """
    A lightweight, zero-dependency behavioral Verilog simulator.
    Capable of parsing and executing simple Verilog modules and compiling them into VCD traces.
    """
    def __init__(self, code: str):
        self.code = code
        self.inputs: List[str] = []
        self.outputs: List[str] = []
        self.registers: List[str] = []
        self.assigns: List[Tuple[str, str]] = []  # (output, expression)
        self.always_blocks: List[Dict[str, Any]] = []  # List of sequential rules
        self.state: Dict[str, str] = {}  # Holds current signal values ('0', '1', 'x')
        self._parse()

    def _clean_code(self) -> str:
        # Strip comments
        code = re.sub(r'//.*', '', self.code)
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
        return code

    def _parse(self):
        cleaned = self._clean_code()
        
        # Parse inputs
        for match in re.finditer(r'\binput\b\s*(?:reg|wire)?\s*([^;]+);', cleaned):
            signals = [s.strip() for s in match.group(1).split(',')]
            self.inputs.extend(signals)
            
        # Parse outputs
        for match in re.finditer(r'\boutput\b\s*(reg|wire)?\s*([^;]+);', cleaned):
            signals = [s.strip() for s in match.group(2).split(',')]
            self.outputs.extend(signals)
            if match.group(1) == 'reg':
                self.registers.extend(signals)
                
        # Parse internal registers
        for match in re.finditer(r'\breg\b\s*([^;]+);', cleaned):
            signals = [s.strip() for s in match.group(1).split(',')]
            self.registers.extend(signals)

        # Parse assign statements
        for match in re.finditer(r'\bassign\b\s+([a-zA-Z0-9_]+)\s*=\s*([^;]+);', cleaned):
            self.assigns.append((match.group(1).strip(), match.group(2).strip()))

        # Parse always blocks (simple behavioral sequential blocks)
        always_headers = list(re.finditer(r'\balways\s*@\s*\(\s*(posedge|negedge)\s+([a-zA-Z0-9_]+)\s*\)', cleaned))
        for i, header in enumerate(always_headers):
            edge, clk_name = header.groups()
            start_idx = header.end()
            
            end_idx = len(cleaned)
            if i + 1 < len(always_headers):
                end_idx = always_headers[i + 1].start()
            else:
                endmodule_match = re.search(r'\bendmodule\b', cleaned[start_idx:])
                if endmodule_match:
                    end_idx = start_idx + endmodule_match.start()
                    
            raw_body = cleaned[start_idx:end_idx].strip()
            
            if raw_body.startswith("begin"):
                body = raw_body[5:].strip()
                if body.endswith("end"):
                    body = body[:-3].strip()
            else:
                body = raw_body
                
            self.always_blocks.append({
                "edge": edge,
                "clk": clk_name.strip(),
                "body": body.strip()
            })

        # Initialize state
        for sig in self.inputs + self.outputs + self.registers:
            self.state[sig] = 'x'

    def eval_expr(self, expr: str, local_state: Dict[str, str]) -> str:
        """
        Evaluate a simple Verilog expression based on current signal values.
        Supports: &, |, ^, ~, !, variables, 1'b0, 1'b1, 0, 1.
        """
        # Clean up Verilog constants
        expr = expr.replace("1'b0", "0").replace("1'b1", "1")
        expr = expr.replace("==", " == ").replace("!=", " != ")
        expr = expr.replace("~", " not ")
        expr = re.sub(r'!(?!=)', ' not ', expr)
        expr = expr.replace("&", " and ").replace("|", " or ").replace("^", " ^ ")
        expr = expr.replace("(", " ( ").replace(")", " ) ")
        
        # Replace variable names with their state values
        # Sort keys by length descending to avoid replacing prefixes (e.g. 'a' in 'ack')
        sorted_keys = sorted(local_state.keys(), key=len, reverse=True)
        
        # We tokenise or use regex boundary checks to safely replace
        for key in sorted_keys:
            val = local_state[key]
            # Replace as independent word
            expr = re.sub(rf'\b{key}\b', f' {val} ', expr)

        # Cleanup whitespace and evaluation safety
        expr = expr.strip()
        
        # Parse simple logical expression
        def eval_clean_python(clean_expr: str) -> str:
            # Re-map clean_expr tokens
            tokens = clean_expr.split()
            parsed_tokens = []
            for t in tokens:
                if t in ('0', '1'):
                    parsed_tokens.append(t == '1')
                elif t in ('and', 'or', 'not', '(', ')', '==', '!='):
                    parsed_tokens.append(t)
                elif t == '^':
                    parsed_tokens.append('!=')  # XOR
                else:
                    return 'x'  # Unsupported token or contains 'x'
            
            # Join and evaluate
            try:
                py_expr = " ".join(str(x) for x in parsed_tokens)
                res = eval(py_expr)
                return '1' if res else '0'
            except Exception:
                return 'x'

        return eval_clean_python(expr)

    def execute_seq_block(self, body: str, trigger_state: Dict[str, str]) -> Dict[str, str]:
        """
        Execute simple sequential assignments inside a sequential always block.
        Supports simple if-else blocks and non-blocking assignments (<=).
        """
        updates = {}
        
        # Extract if-else constructs
        # Supports: if (rst) q <= 0; else q <= d;
        if_match = re.search(r'if\s*\((.*?)\)\s*(?:begin)?\s*(.*?);?\s*(?:end)?\s*else\s*(?:begin)?\s*(.*?);?\s*(?:end)?\s*$', body, flags=re.DOTALL)
        if if_match:
            cond, then_body, else_body = if_match.groups()
            cond_val = self.eval_expr(cond, trigger_state)
            if cond_val == '1':
                active_body = then_body
            elif cond_val == '0':
                active_body = else_body
            else:
                active_body = "" # indeterminate clock trigger if condition is x
        else:
            active_body = body

        # Parse assignments (e.g. q <= d;)
        assign_matches = re.finditer(r'([a-zA-Z0-9_]+)\s*<=\s*([^;]+);?', active_body)
        for match in assign_matches:
            target, expr = match.groups()
            target = target.strip()
            expr = expr.strip()
            updates[target] = self.eval_expr(expr, trigger_state)

        return updates


def generate_test_stimuli(checker: str) -> List[Dict[str, str]]:
    """
    Generates test sequences (list of input stimulus states) based on the target checker.
    """
    chk = checker.upper()
    stimuli = []
    
    if chk in ["AND", "OR", "XOR", "NAND", "NOR", "XNOR", "HALF_ADDER"]:
        # Logic verification transitions
        inputs = [
            {"a": "0", "b": "0"},
            {"a": "1", "b": "0"},
            {"a": "1", "b": "1"},
            {"a": "0", "b": "1"},
            {"a": "0", "b": "0"}
        ]
        return inputs
        
    elif chk == "FULL_ADDER":
        inputs = []
        for a in ("0", "1"):
            for b in ("0", "1"):
                for cin in ("0", "1"):
                    inputs.append({"a": a, "b": b, "cin": cin})
        return inputs
        
    elif chk == "MUX2":
        return [
            {"d0": "0", "d1": "1", "sel": "0"},
            {"d0": "1", "d1": "0", "sel": "0"},
            {"d0": "1", "d1": "0", "sel": "1"},
            {"d0": "0", "d1": "1", "sel": "1"},
            {"d0": "0", "d1": "0", "sel": "0"},
        ]
        
    elif chk in ["DFF", "T_FF", "JK_FF", "COUNTER"]:
        # Sequential simulations require a clock cycle loop
        # We generate raw stimuli for each clock transition or reset toggling.
        seq = []
        # Ticks: reset period, then data transitions
        if chk == "DFF":
            seq = [
                {"clk": "0", "rst": "1", "d": "0"}, # reset active
                {"clk": "1", "rst": "1", "d": "0"},
                {"clk": "0", "rst": "0", "d": "1"}, # release reset, d=1
                {"clk": "1", "rst": "0", "d": "1"}, # posedge triggers q=1
                {"clk": "0", "rst": "0", "d": "0"}, # d=0
                {"clk": "1", "rst": "0", "d": "0"}, # posedge triggers q=0
                {"clk": "0", "rst": "0", "d": "1"}, 
                {"clk": "1", "rst": "0", "d": "1"}, 
            ]
        elif chk == "T_FF":
            seq = [
                {"clk": "0", "rst": "1", "t": "0"},
                {"clk": "1", "rst": "1", "t": "0"},
                {"clk": "0", "rst": "0", "t": "1"}, # toggle enabled
                {"clk": "1", "rst": "0", "t": "1"}, # posedge: q transitions to 1
                {"clk": "0", "rst": "0", "t": "1"},
                {"clk": "1", "rst": "0", "t": "1"}, # posedge: q transitions to 0
                {"clk": "0", "rst": "0", "t": "0"}, # toggle disabled
                {"clk": "1", "rst": "0", "t": "0"}, # posedge: q remains 0
            ]
        elif chk == "JK_FF":
            seq = [
                {"clk": "0", "rst": "1", "j": "0", "k": "0"},
                {"clk": "1", "rst": "1", "j": "0", "k": "0"},
                {"clk": "0", "rst": "0", "j": "1", "k": "0"}, # J=1, K=0 (set)
                {"clk": "1", "rst": "0", "j": "1", "k": "0"}, # posedge: q=1
                {"clk": "0", "rst": "0", "j": "0", "k": "1"}, # J=0, K=1 (reset)
                {"clk": "1", "rst": "0", "j": "0", "k": "1"}, # posedge: q=0
                {"clk": "0", "rst": "0", "j": "1", "k": "1"}, # J=1, K=1 (toggle)
                {"clk": "1", "rst": "0", "j": "1", "k": "1"}, # posedge: q=1
            ]
        return seq
        
    return []


def build_vcd_string(signals: List[str], timeline: List[Tuple[int, Dict[str, str]]], timescale: str = "1ns") -> str:
    """
    Compiles simulation transition data into a standard formatted VCD string.
    """
    lines = []
    lines.append(f"$timescale {timescale} $end")
    lines.append("$scope module tb $end")
    
    # Map signals to unique single-character identifiers
    sig_ids = {}
    ascii_code = 33 # Starting from '!'
    for sig in signals:
        sig_ids[sig] = chr(ascii_code)
        ascii_code += 1
        lines.append(f"$var wire 1 {sig_ids[sig]} {sig} $end")
        
    lines.append("$enddefinitions $end")
    
    # Write historical transition dump
    prev_state = {}
    for time, state in timeline:
        lines.append(f"#{time}")
        for sig, val in state.items():
            if sig in sig_ids and prev_state.get(sig) != val:
                lines.append(f"{val}{sig_ids[sig]}")
                prev_state[sig] = val
                
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Icarus Verilog (iverilog) Real Simulator Integration
# ---------------------------------------------------------------------------

def is_iverilog_available() -> bool:
    """Returns True if Icarus Verilog is installed and accessible on PATH."""
    return shutil.which("iverilog") is not None


def get_iverilog_version() -> Optional[str]:
    """Returns the iverilog version string, or None if not available."""
    try:
        result = subprocess.run(
            ["iverilog", "-V"],
            capture_output=True, text=True, timeout=5
        )
        # iverilog prints version to stderr
        output = result.stderr or result.stdout or ""
        first_line = output.strip().splitlines()[0] if output.strip() else None
        return first_line
    except Exception:
        return None


def _extract_module_name(code: str) -> str:
    """Extract the top-level module name from Verilog source."""
    match = re.search(r'\bmodule\s+([a-zA-Z0-9_]+)', code)
    return match.group(1) if match else "dut_module"


def _generate_iverilog_testbench(module_name: str, inputs: List[str], outputs: List[str], checker: str) -> str:
    """
    Generate a complete Verilog testbench for the given module and checker type.
    Produces VCD output to 'dump.vcd' in the working directory.
    """
    chk = checker.upper()

    # Declare regs for inputs, wires for outputs
    decls = []
    for sig in inputs:
        decls.append(f"  reg {sig};")
    for sig in outputs:
        decls.append(f"  wire {sig};")

    # Build port connection list from known signals
    all_ports = inputs + outputs
    port_connections = ", ".join(f".{p}({p})" for p in all_ports)

    # Build stimulus body for each checker type
    if chk in ("AND", "OR", "XOR", "NAND", "NOR", "XNOR"):
        a = inputs[0] if len(inputs) > 0 else "a"
        b = inputs[1] if len(inputs) > 1 else "b"
        stim = (
            f"    {a}=0; {b}=0; #10;\n"
            f"    {a}=1; {b}=0; #10;\n"
            f"    {a}=1; {b}=1; #10;\n"
            f"    {a}=0; {b}=1; #10;\n"
            f"    {a}=0; {b}=0; #10;"
        )
        inits = f"    {a}=0; {b}=0;"

    elif chk == "HALF_ADDER":
        a = inputs[0] if len(inputs) > 0 else "a"
        b = inputs[1] if len(inputs) > 1 else "b"
        stim = (
            f"    {a}=0; {b}=0; #10;\n"
            f"    {a}=1; {b}=0; #10;\n"
            f"    {a}=1; {b}=1; #10;\n"
            f"    {a}=0; {b}=1; #10;\n"
            f"    {a}=0; {b}=0; #10;"
        )
        inits = f"    {a}=0; {b}=0;"

    elif chk == "FULL_ADDER":
        a = inputs[0] if len(inputs) > 0 else "a"
        b = inputs[1] if len(inputs) > 1 else "b"
        cin = inputs[2] if len(inputs) > 2 else "cin"
        stim = "\n".join(
            f"    {a}={av}; {b}={bv}; {cin}={cv}; #10;"
            for av in ("0", "1") for bv in ("0", "1") for cv in ("0", "1")
        )
        inits = f"    {a}=0; {b}=0; {cin}=0;"

    elif chk == "MUX2":
        d0 = inputs[0] if len(inputs) > 0 else "d0"
        d1 = inputs[1] if len(inputs) > 1 else "d1"
        sel = inputs[2] if len(inputs) > 2 else "sel"
        stim = (
            f"    {d0}=0; {d1}=1; {sel}=0; #10;\n"
            f"    {d0}=1; {d1}=0; {sel}=0; #10;\n"
            f"    {d0}=1; {d1}=0; {sel}=1; #10;\n"
            f"    {d0}=0; {d1}=1; {sel}=1; #10;\n"
            f"    {d0}=0; {d1}=0; {sel}=0; #10;"
        )
        inits = f"    {d0}=0; {d1}=0; {sel}=0;"

    elif chk == "DFF":
        clk = "clk" if "clk" in inputs else (inputs[0] if inputs else "clk")
        rst = "rst" if "rst" in inputs else ""
        d   = "d"   if "d"   in inputs else ""
        rst_init = f"{rst}=1; " if rst else ""
        d_init   = f"{d}=0;"   if d   else ""
        inits    = f"    {clk}=0; {rst_init}{d_init}"
        rst_rel  = f"{rst}=0; " if rst else ""
        d_set    = lambda v: (f"{d}={v}; " if d else "")
        stim = (
            f"    // Reset phase\n"
            f"    #5; {clk}=1; #5; {clk}=0;\n"
            f"    {rst_rel}{d_set('1')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // posedge: q=1\n"
            f"    {d_set('0')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // posedge: q=0\n"
            f"    {d_set('1')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // posedge: q=1"
        )

    elif chk == "T_FF":
        clk = "clk" if "clk" in inputs else (inputs[0] if inputs else "clk")
        rst = "rst" if "rst" in inputs else ""
        t   = "t"   if "t"   in inputs else ""
        rst_init = f"{rst}=1; " if rst else ""
        t_init   = f"{t}=0;"   if t   else ""
        inits    = f"    {clk}=0; {rst_init}{t_init}"
        rst_rel  = f"{rst}=0; " if rst else ""
        t_set    = lambda v: (f"{t}={v}; " if t else "")
        stim = (
            f"    #5; {clk}=1; #5; {clk}=0; // reset\n"
            f"    {rst_rel}{t_set('1')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // toggle\n"
            f"    #5; {clk}=1; #5; {clk}=0; // toggle back\n"
            f"    {t_set('0')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // hold"
        )

    elif chk == "JK_FF":
        clk = "clk" if "clk" in inputs else (inputs[0] if inputs else "clk")
        rst = "rst" if "rst" in inputs else ""
        j   = "j"   if "j"   in inputs else ""
        k   = "k"   if "k"   in inputs else ""
        rst_init = f"{rst}=1; " if rst else ""
        jk_init  = (f"{j}=0; {k}=0;" if j and k else "")
        inits    = f"    {clk}=0; {rst_init}{jk_init}"
        rst_rel  = f"{rst}=0; " if rst else ""
        jk_set   = lambda jv, kv: (f"{j}={jv}; {k}={kv}; " if j and k else "")
        stim = (
            f"    #5; {clk}=1; #5; {clk}=0; // reset\n"
            f"    {rst_rel}{jk_set('1','0')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // set q=1\n"
            f"    {jk_set('0','1')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // reset q=0\n"
            f"    {jk_set('1','1')}\n"
            f"    #5; {clk}=1; #5; {clk}=0; // toggle q=1"
        )

    else:
        # Fallback: just toggle all inputs
        inits = "    " + "; ".join(f"{s}=0" for s in inputs) + ";"
        stim = "    #10; " + "; ".join(f"{s}=1" for s in inputs) + ";\n    #10;"

    tb_name = f"tb_{module_name}"
    decl_block = "\n".join(decls)
    tb = f"""`timescale 1ns/1ps
module {tb_name};
{decl_block}

  {module_name} dut({port_connections});

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, {tb_name});
{inits}
{stim}
    #20;
    $finish;
  end
endmodule
"""
    return tb


def simulate_with_iverilog(code: str, checker: str) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Full Icarus Verilog simulation pipeline.
    Writes RTL + generated testbench to a temp dir, compiles with iverilog,
    runs vvp to produce a VCD, reads the VCD, then runs verify_waveform.
    Returns: (success, vcd_text_or_error, verify_results)
    """
    from backend import parse_vcd_text, verify_waveform

    # Parse module info using the built-in RTLSimulator parser
    try:
        sim_parser = RTLSimulator(code)
    except Exception as e:
        return False, f"Parse Error: {str(e)}", {}

    module_name = _extract_module_name(code)
    inputs = sim_parser.inputs
    outputs = sim_parser.outputs

    if not inputs and not outputs:
        return False, "Compile Error: No valid module inputs or outputs detected.", {}

    testbench = _generate_iverilog_testbench(module_name, inputs, outputs, checker)

    tmpdir = tempfile.mkdtemp(prefix="logicagent_")
    try:
        rtl_path = os.path.join(tmpdir, "rtl.v")
        tb_path  = os.path.join(tmpdir, "tb.v")
        vvp_path = os.path.join(tmpdir, "sim.vvp")
        vcd_path = os.path.join(tmpdir, "dump.vcd")

        with open(rtl_path, "w") as f:
            f.write(code)
        with open(tb_path, "w") as f:
            f.write(testbench)

        # Step 1: Compile
        compile_result = subprocess.run(
            ["iverilog", "-o", vvp_path, tb_path, rtl_path],
            capture_output=True, text=True, timeout=30, cwd=tmpdir
        )
        if compile_result.returncode != 0:
            err_msg = compile_result.stderr or compile_result.stdout or "Unknown compile error"
            return False, f"iverilog Compile Error:\n{err_msg}", {}

        # Step 2: Simulate
        run_result = subprocess.run(
            ["vvp", vvp_path],
            capture_output=True, text=True, timeout=60, cwd=tmpdir
        )
        if run_result.returncode != 0:
            err_msg = run_result.stderr or run_result.stdout or "Unknown simulation error"
            return False, f"vvp Simulation Error:\n{err_msg}", {}

        # Step 3: Read VCD
        if not os.path.exists(vcd_path):
            return False, "Simulation Error: No VCD file was produced. Check $dumpfile path.", {}

        with open(vcd_path, "r", errors="ignore") as f:
            vcd_text = f.read()

        if not vcd_text.strip():
            return False, "Simulation Error: VCD file is empty.", {}

        # Step 4: Verify
        try:
            parsed = parse_vcd_text(vcd_text)
            verify_results = verify_waveform(parsed, checker=checker)
            return True, vcd_text, verify_results
        except Exception as e:
            return True, vcd_text, {
                "verdict": "Incorrect",
                "errors": [{"message": f"Verification error: {str(e)}"}],
                "summary": {}
            }

    except subprocess.TimeoutExpired:
        return False, "Timeout Error: Simulation took too long (>60s).", {}
    except FileNotFoundError as e:
        return False, f"Tool Error: {str(e)} — is iverilog installed?", {}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Main entry-point — tries iverilog first, falls back to built-in simulator
# ---------------------------------------------------------------------------

def simulate_verilog(code: str, checker: str) -> Tuple[bool, str, Dict[str, Any]]:
    """
    Simulates the provided Verilog block against targeted tests.
    Tries Icarus Verilog first; falls back to the built-in behavioral simulator
    if iverilog is not available.
    Returns: (compile_success, vcd_text_or_error, verify_results)
    """
    if is_iverilog_available():
        return simulate_with_iverilog(code, checker)

    # --- Built-in behavioral simulator (fallback) ---
    try:
        sim = RTLSimulator(code)
    except Exception as e:
        return False, f"Syntax Compile Error: Failed to parse Verilog syntax. {str(e)}", {}

    # Confirm module variables exist
    if not sim.inputs and not sim.outputs:
        return False, "Compile Error: No valid module inputs or outputs defined.", {}

    stimuli = generate_test_stimuli(checker)
    if not stimuli:
        return False, f"Compile Error: Unsupported simulator checker template '{checker}'.", {}

    timeline = []
    current_time = 0
    time_step = 10  # 10ns step sizes

    # Simulation state loop
    for stim in stimuli:
        # Save previous state to accurately compute transition edges
        prev_state = sim.state.copy()

        # 1. Apply inputs
        for inp, val in stim.items():
            if inp in sim.inputs:
                sim.state[inp] = val

        # 2. Evaluate sequential edge events (if any clock transition occurred)
        seq_updates = {}
        for block in sim.always_blocks:
            clk_name = block["clk"]
            edge = block["edge"]

            is_posedge = (edge == "posedge" and stim.get(clk_name) == "1" and prev_state.get(clk_name) == "0")
            is_negedge = (edge == "negedge" and stim.get(clk_name) == "0" and prev_state.get(clk_name) == "1")

            if is_posedge or is_negedge:
                block_updates = sim.execute_seq_block(block["body"], sim.state)
                seq_updates.update(block_updates)

        # Apply sequential register updates
        for reg, val in seq_updates.items():
            if reg in sim.registers or reg in sim.outputs:
                sim.state[reg] = val

        # 3. Evaluate combinational assignments
        for _ in range(5):
            changed = False
            for out, expr in sim.assigns:
                new_val = sim.eval_expr(expr, sim.state)
                if sim.state.get(out) != new_val:
                    sim.state[out] = new_val
                    changed = True
            if not changed:
                break

        # Record snapshot
        timeline.append((current_time, sim.state.copy()))
        current_time += time_step

    # Output VCD file
    all_signals = sorted(list(sim.state.keys()))
    vcd_text = build_vcd_string(all_signals, timeline)

    from backend import parse_vcd_text, verify_waveform
    try:
        parsed = parse_vcd_text(vcd_text)
        verify_results = verify_waveform(parsed, checker=checker)
        return True, vcd_text, verify_results
    except Exception as e:
        return True, vcd_text, {
            "verdict": "Incorrect",
            "errors": [{"message": f"Verification execution error: {str(e)}"}],
            "summary": {}
        }


# ---------------------------------------------------------------------------
# Custom Testbench Simulation — user-supplied RTL + testbench
# ---------------------------------------------------------------------------

def simulate_with_custom_tb(
    files: List[Dict[str, str]],
    checker: str = "",
) -> Tuple[bool, str, str, Dict[str, Any]]:
    """
    Simulate a user-provided multi-file Verilog project.
    If iverilog is available: compiles all files, runs vvp, reads VCD.
    If not: falls back to the built-in simulator (only uses the first file).
    Returns: (success, vcd_text_or_error, console_output, verify_results)
    """
    from backend import parse_vcd_text, verify_waveform

    if is_iverilog_available():
        tmpdir = tempfile.mkdtemp(prefix="logicagent_lab_")
        try:
            vvp_path = os.path.join(tmpdir, "sim.vvp")
            vcd_path = os.path.join(tmpdir, "dump.vcd")

            verilog_files = []
            for f in files:
                filepath = os.path.join(tmpdir, f["name"])
                # Ensure directory exists if there are subdirectories
                os.makedirs(os.path.dirname(filepath), exist_ok=True)
                with open(filepath, "w") as out_f:
                    out_f.write(f["content"])
                if filepath.endswith(".v") or filepath.endswith(".sv"):
                    verilog_files.append(filepath)

            if not verilog_files:
                return False, "Compile Error: No .v or .sv files found.", "No Verilog files provided.", {}

            compile_result = subprocess.run(
                ["iverilog", "-o", vvp_path] + verilog_files,
                capture_output=True, text=True, timeout=30, cwd=tmpdir
            )
            console_lines = []
            if compile_result.stderr:
                console_lines.append(compile_result.stderr.strip())
            if compile_result.stdout:
                console_lines.append(compile_result.stdout.strip())

            if compile_result.returncode != 0:
                err = "\n".join(console_lines) or "Unknown compile error"
                return False, f"Compile Error:\n{err}", err, {}

            console_lines.insert(0, "✓ Compilation successful (iverilog)")

            run_result = subprocess.run(
                ["vvp", vvp_path],
                capture_output=True, text=True, timeout=60, cwd=tmpdir
            )
            if run_result.stdout:
                console_lines.append(run_result.stdout.strip())
            if run_result.stderr:
                console_lines.append(run_result.stderr.strip())

            if run_result.returncode != 0:
                return False, "Simulation Error", "\n".join(console_lines), {}

            console_lines.insert(1, "✓ Simulation complete (vvp)")

            if not os.path.exists(vcd_path):
                msg = "No VCD produced. Ensure testbench has $dumpfile(\"dump.vcd\") and $dumpvars."
                console_lines.append(f"⚠ {msg}")
                return False, msg, "\n".join(console_lines), {}

            with open(vcd_path, "r", errors="ignore") as f:
                vcd_text = f.read()

            verify_results = {}
            
            # Check for custom assertions file
            assertions_file = next((f for f in files if f["name"].lower() == "assertions.txt"), None)
            custom_assertions = []
            if assertions_file:
                custom_assertions = [line.strip() for line in assertions_file["content"].splitlines() if line.strip() and not line.strip().startswith("//")]

            if checker and checker.strip() and checker.upper() != "CUSTOM":
                try:
                    parsed = parse_vcd_text(vcd_text)
                    chk = checker.upper()
                    verify_results = verify_waveform(parsed, checker=chk)
                    console_lines.append(f"✓ Checker ({checker}): {verify_results.get('verdict', 'N/A')}")
                except Exception as e:
                    verify_results = {"verdict": "Error", "errors": [{"message": str(e)}], "summary": {}}
                    console_lines.append(f"✗ Checker error: {str(e)}")
            elif custom_assertions:
                from backend.assertion_engine import evaluate_assertion
                try:
                    parsed = parse_vcd_text(vcd_text)
                    all_errors = []
                    checked_points = 0
                    for ast_str in custom_assertions:
                        res = evaluate_assertion(parsed, ast_str, signal_map={})
                        if res.get("errors"):
                            all_errors.extend(res["errors"])
                        checked_points += res.get("summary", {}).get("checked_timestamps", 0)
                    
                    verdict = "Incorrect" if all_errors else "Correct"
                    verify_results = {
                        "verdict": verdict,
                        "error_count": len(all_errors),
                        "errors": all_errors,
                        "summary": {"checked_timestamps": checked_points},
                        "checker": "CUSTOM_ASSERTIONS"
                    }
                    console_lines.append(f"✓ Custom Assertions: {verdict} ({len(all_errors)} errors)")
                except Exception as e:
                    verify_results = {"verdict": "Error", "errors": [{"message": str(e)}], "summary": {}}
                    console_lines.append(f"✗ Assertion error: {str(e)}")

            return True, vcd_text, "\n".join(console_lines), verify_results

        except subprocess.TimeoutExpired:
            return False, "Timeout", "Timeout: simulation exceeded 60 seconds.", {}
        except FileNotFoundError as e:
            return False, str(e), str(e), {}
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    # Built-in fallback (uses only the first file)
    warning = (
        "⚠ iverilog not found — running built-in simulator (testbench ignored).\n"
        "  Install Icarus Verilog: https://bleyer.org/icarus/\n"
    )
    if not files:
        return False, "No files provided", warning, {}
    first_file_content = files[0]["content"]
    success, vcd_text, verify_results = simulate_verilog(first_file_content, checker or "AND")
    console_out = warning
    if success:
        console_out += f"✓ Built-in simulation complete. Verdict: {verify_results.get('verdict', 'N/A')}"
    else:
        console_out += f"✗ Simulation failed: {vcd_text}"
    return success, vcd_text, console_out, verify_results
