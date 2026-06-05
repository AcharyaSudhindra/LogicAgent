"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Play, Sparkles, Download, Terminal, Code2,
  CheckCircle, XCircle, AlertTriangle, Cpu, Bot, Code,
  ChevronDown, RotateCcw, Loader2
} from "lucide-react";
import Link from "next/link";
import WaveformViewer from "@/components/WaveformViewer";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API_BASE = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Built-in examples
// ---------------------------------------------------------------------------
const EXAMPLES: Record<string, { label: string; checker: string; rtl: string; tb: string }> = {
  and_buggy: {
    label: "AND Gate (Buggy)",
    checker: "AND",
    rtl: `module and_gate(a, b, y);
  input a, b;
  output y;
  // BUG: Uses OR instead of AND
  assign y = a | b;
endmodule`,
    tb: `\`timescale 1ns/1ps
module tb_and;
  reg a, b;
  wire y;

  and_gate dut(.a(a), .b(b), .y(y));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_and);
    a=0; b=0; #10;
    a=1; b=0; #10;
    a=1; b=1; #10;
    a=0; b=1; #10;
    a=0; b=0; #10;
    #10; $finish;
  end
endmodule`,
  },
  dff: {
    label: "D Flip-Flop",
    checker: "DFF",
    rtl: `module dff(clk, d, q, rst);
  input clk, d, rst;
  output reg q;
  always @(posedge clk) begin
    if (rst) q <= 1'b0;
    else     q <= d;
  end
endmodule`,
    tb: `\`timescale 1ns/1ps
module tb_dff;
  reg clk, d, rst;
  wire q;

  dff dut(.clk(clk), .d(d), .rst(rst), .q(q));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_dff);
    clk=0; rst=1; d=0;
    #5; clk=1; #5; clk=0;
    rst=0; d=1;
    #5; clk=1; #5; clk=0;
    d=0;
    #5; clk=1; #5; clk=0;
    d=1;
    #5; clk=1; #5; clk=0;
    #10; $finish;
  end

  always #5 clk = ~clk;
endmodule`,
  },
  full_adder: {
    label: "Full Adder",
    checker: "FULL_ADDER",
    rtl: `module full_adder(a, b, cin, sum, cout);
  input a, b, cin;
  output sum, cout;
  assign sum  = a ^ b ^ cin;
  assign cout = (a & b) | (b & cin) | (a & cin);
endmodule`,
    tb: `\`timescale 1ns/1ps
module tb_full_adder;
  reg a, b, cin;
  wire sum, cout;

  full_adder dut(.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_full_adder);
    // All 8 input combinations
    {a,b,cin}=3'b000; #10;
    {a,b,cin}=3'b001; #10;
    {a,b,cin}=3'b010; #10;
    {a,b,cin}=3'b011; #10;
    {a,b,cin}=3'b100; #10;
    {a,b,cin}=3'b101; #10;
    {a,b,cin}=3'b110; #10;
    {a,b,cin}=3'b111; #10;
    $finish;
  end
endmodule`,
  },
  counter: {
    label: "4-bit Counter",
    checker: "AND",
    rtl: `module counter4(clk, rst, count);
  input clk, rst;
  output reg [3:0] count;
  always @(posedge clk or posedge rst) begin
    if (rst) count <= 4'd0;
    else     count <= count + 1;
  end
endmodule`,
    tb: `\`timescale 1ns/1ps
module tb_counter;
  reg clk, rst;
  wire [3:0] count;

  counter4 dut(.clk(clk), .rst(rst), .count(count));

  initial clk = 0;
  always #5 clk = ~clk;

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_counter);
    rst = 1; #20;
    rst = 0; #200;
    $finish;
  end
endmodule`,
  },
  mux: {
    label: "2-to-1 MUX",
    checker: "MUX2",
    rtl: `module mux2(d0, d1, sel, y);
  input d0, d1, sel;
  output y;
  assign y = sel ? d1 : d0;
endmodule`,
    tb: `\`timescale 1ns/1ps
module tb_mux;
  reg d0, d1, sel;
  wire y;

  mux2 dut(.d0(d0), .d1(d1), .sel(sel), .y(y));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_mux);
    d0=0; d1=1; sel=0; #10;
    d0=1; d1=0; sel=0; #10;
    d0=1; d1=0; sel=1; #10;
    d0=0; d1=1; sel=1; #10;
    #10; $finish;
  end
endmodule`,
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SimResult = {
  success: boolean;
  vcd: string | null;
  console_output: string;
  verdict: string;
  errors: { signal?: string; time?: number; message: string }[];
  error_count: number;
  signals_found: string[];
  backend: "iverilog" | "builtin";
  checker: string;
};

type ParsedWaveform = {
  timescale: string;
  transitions: Record<string, { time: number; value: string }[]>;
};

// ---------------------------------------------------------------------------
// Console line renderer
// ---------------------------------------------------------------------------
function ConsoleLine({ line }: { line: string }) {
  const isSuccess = line.startsWith("✓");
  const isWarning = line.startsWith("⚠");
  const isError   = line.startsWith("✗") || line.toLowerCase().includes("error");
  return (
    <div className={`font-mono text-xs leading-5 whitespace-pre-wrap ${
      isSuccess ? "text-emerald-400" :
      isWarning ? "text-amber-400" :
      isError   ? "text-red-400" :
      "text-slate-400"
    }`}>
      {line}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function CodeLab() {
  const [rtlCode, setRtlCode] = useState(EXAMPLES.and_buggy.rtl);
  const [tbCode,  setTbCode]  = useState(EXAMPLES.and_buggy.tb);
  const [checker, setChecker] = useState("AND");
  const [checkers, setCheckers] = useState<string[]>(["AND", "DFF", "FULL_ADDER", "MUX2"]);
  const [apiKey, setApiKey]   = useState("");
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [parsedData, setParsedData] = useState<ParsedWaveform | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingTB, setIsGeneratingTB] = useState(false);
  const [simBackend, setSimBackend] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/checkers`).then(r => r.json()).then(d => {
      if (d.supported) setCheckers(d.supported);
    }).catch(() => {});
    fetch(`${API_BASE}/sim/backend_info`).then(r => r.json()).then(d => {
      setSimBackend(d.backend);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [simResult]);

  const loadExample = useCallback((key: string) => {
    const ex = EXAMPLES[key];
    if (!ex) return;
    setRtlCode(ex.rtl);
    setTbCode(ex.tb);
    setChecker(ex.checker);
    setSimResult(null);
    setParsedData(null);
    setShowExamples(false);
  }, []);

  const runSimulation = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimResult(null);
    setParsedData(null);

    try {
      const res = await fetch(`${API_BASE}/sim/run_custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtl_code: rtlCode, tb_code: tbCode, checker }),
      });
      const data: SimResult = await res.json();
      setSimResult(data);

      if (data.success && data.vcd) {
        // Parse VCD for waveform viewer
        const visRes = await fetch(`${API_BASE}/visualize`, {
          method: "POST",
          body: (() => { const f = new FormData(); f.append("file", new Blob([data.vcd], {type:"text/plain"}), "sim.vcd"); return f; })(),
        });
        const visData = await visRes.json();
        setParsedData({ timescale: visData.timescale || "1ns", transitions: visData.signals || {} });
      }
    } catch (e) {
      setSimResult({
        success: false, vcd: null,
        console_output: `Network error: ${String(e)}\nIs the backend running on port 8000?`,
        verdict: "Error", errors: [], error_count: 0,
        signals_found: [], backend: "builtin", checker,
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const generateTestbench = async () => {
    if (isGeneratingTB) return;
    setIsGeneratingTB(true);
    try {
      const res = await fetch(`${API_BASE}/ai/generate_testbench`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtl_code: rtlCode, checker, api_key: apiKey }),
      });
      const data = await res.json();
      if (data.testbench_code) setTbCode(data.testbench_code);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingTB(false);
    }
  };

  const exportVcd = () => {
    if (!simResult?.vcd) return;
    const blob = new Blob([simResult.vcd], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "output.vcd"; a.click();
    URL.revokeObjectURL(url);
  };

  const verdictColor = simResult?.verdict === "Correct"
    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : simResult?.verdict === "Incorrect"
    ? "text-red-400 border-red-500/30 bg-red-500/10"
    : simResult
    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
    : "text-slate-500 border-white/10 bg-white/5";

  const consoleLines = (simResult?.console_output || "").split("\n");

  // Checker groups for dropdown
  const checkerGroups: Record<string, string[]> = {
    "Logic Gates": ["AND","OR","XOR","NAND","NOR","XNOR"],
    "Arithmetic":  ["HALF_ADDER","FULL_ADDER","MUX2"],
    "Sequential":  ["DFF","T_FF","JK_FF"],
    "Custom":      ["ASSERTION"],
  };

  return (
    <div className="flex flex-col h-screen bg-[#030303] text-slate-100 font-sans overflow-hidden">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="h-14 border-b border-white/5 flex items-center px-6 gap-4 bg-black/30 backdrop-blur-md flex-shrink-0 z-20">
        <Link href="/" className="flex items-center gap-2.5 group">
          <motion.div whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.25)]">
            <Activity className="text-white w-4 h-4" />
          </motion.div>
          <span className="font-bold text-base bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">LogicAgent</span>
        </Link>

        <div className="flex items-center gap-1 ml-2">
          <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <Code2 className="w-3.5 h-3.5" /> Verifier
          </Link>
          <Link href="/agent" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <Bot className="w-3.5 h-3.5" /> Agent Studio
          </Link>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Code className="w-3.5 h-3.5" /> Code Lab
          </div>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* API key for AI generate */}
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="Gemini API key (for ✨ AI Gen)"
            className="w-52 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-400/50 font-mono"
          />
          {simBackend && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono ${
              simBackend === "iverilog"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}>
              <Cpu className="w-3.5 h-3.5" />
              {simBackend === "iverilog" ? "iverilog" : "Built-in Sim"}
            </div>
          )}
        </div>
      </nav>

      {/* ── Editor Row ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0" style={{ maxHeight: "calc(100vh - 56px)" }}>
        <div className="flex flex-col flex-1 min-w-0">

          {/* Editor panels */}
          <div className="flex flex-1 min-h-0 border-b border-white/5" style={{ height: "55%" }}>

            {/* RTL Editor */}
            <div className="flex flex-col w-1/2 border-r border-white/5 min-w-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/20 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.6)]" />
                <span className="text-xs font-semibold text-slate-300 font-mono">rtl.v</span>
                <span className="text-xs text-slate-600 ml-1">— RTL Module</span>
                <button
                  onClick={() => setRtlCode("")}
                  className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
                  title="Clear"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <MonacoEditor
                  height="100%"
                  defaultLanguage="verilog"
                  theme="vs-dark"
                  value={rtlCode}
                  onChange={v => setRtlCode(v || "")}
                  options={{
                    fontSize: 13,
                    fontFamily: "\"Geist Mono\", \"Fira Code\", monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    padding: { top: 10, bottom: 10 },
                    smoothScrolling: true,
                    renderLineHighlight: "all",
                  }}
                />
              </div>
            </div>

            {/* Testbench Editor */}
            <div className="flex flex-col w-1/2 min-w-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/20 flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]" />
                <span className="text-xs font-semibold text-slate-300 font-mono">tb.v</span>
                <span className="text-xs text-slate-600 ml-1">— Testbench</span>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={generateTestbench}
                  disabled={isGeneratingTB || !rtlCode.trim()}
                  className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-all disabled:opacity-40 font-medium"
                >
                  {isGeneratingTB
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                    : <><Sparkles className="w-3 h-3" /> AI Generate</>}
                </motion.button>
              </div>
              <div className="flex-1 min-h-0 relative">
                <AnimatePresence>
                  {isGeneratingTB && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="absolute inset-0 z-10 bg-purple-950/40 backdrop-blur-sm flex items-center justify-center"
                    >
                      <div className="flex items-center gap-3 text-purple-300 text-sm">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                        <span>Gemini is writing your testbench...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <MonacoEditor
                  height="100%"
                  defaultLanguage="verilog"
                  theme="vs-dark"
                  value={tbCode}
                  onChange={v => setTbCode(v || "")}
                  options={{
                    fontSize: 13,
                    fontFamily: "\"Geist Mono\", \"Fira Code\", monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    padding: { top: 10, bottom: 10 },
                    smoothScrolling: true,
                    renderLineHighlight: "all",
                    readOnly: isGeneratingTB,
                  }}
                />
              </div>
            </div>
          </div>

          {/* ── Toolbar ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-black/30 flex-shrink-0">
            {/* Run */}
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(0,229,255,0.3)" }}
              whileTap={{ scale: 0.97 }}
              onClick={runSimulation}
              disabled={isSimulating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-white text-sm font-bold disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.2)]"
            >
              {isSimulating
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Simulating...</>
                : <><Play className="w-4 h-4" /> Simulate</>}
            </motion.button>

            {/* Checker */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Checker:</span>
              <select
                value={checker}
                onChange={e => setChecker(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 transition-all"
              >
                {Object.entries(checkerGroups).map(([group, items]) => (
                  <optgroup key={group} label={group} className="bg-slate-900 text-slate-400">
                    {items.filter(c => checkers.includes(c) || checkers.length < 4).map(c => (
                      <option key={c} value={c} className="bg-slate-900">{c}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Export VCD */}
            <button
              onClick={exportVcd}
              disabled={!simResult?.vcd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-cyan-400/30 transition-all disabled:opacity-30"
            >
              <Download className="w-3.5 h-3.5" /> Export VCD
            </button>

            {/* Examples dropdown */}
            <div className="relative ml-auto">
              <button
                onClick={() => setShowExamples(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all"
              >
                Examples <ChevronDown className="w-3 h-3" />
              </button>
              <AnimatePresence>
                {showExamples && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    className="absolute right-0 bottom-full mb-2 w-52 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                  >
                    {Object.entries(EXAMPLES).map(([key, ex]) => (
                      <button
                        key={key}
                        onClick={() => loadExample(key)}
                        className="w-full text-left px-4 py-2.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2"
                      >
                        <span className="w-2 h-2 rounded-full bg-cyan-400/60 flex-shrink-0" />
                        {ex.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Verdict badge */}
            {simResult && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${verdictColor}`}
              >
                {simResult.verdict === "Correct"
                  ? <CheckCircle className="w-4 h-4" />
                  : simResult.verdict === "Incorrect"
                  ? <XCircle className="w-4 h-4" />
                  : <AlertTriangle className="w-4 h-4" />}
                {simResult.verdict}
              </motion.div>
            )}
          </div>

          {/* ── Results Row ─────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1">

            {/* Console */}
            <div className="w-[380px] flex-shrink-0 border-r border-white/5 flex flex-col">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/20 flex-shrink-0">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-400">Console</span>
                {simResult && (
                  <span className="ml-auto text-xs text-slate-600 font-mono">
                    {simResult.error_count} error{simResult.error_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div ref={consoleRef} className="flex-1 overflow-y-auto p-3 space-y-0.5 bg-black/20">
                {!simResult && !isSimulating && (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <Terminal className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                      <p className="text-slate-600 text-xs">Click Simulate to run</p>
                    </div>
                  </div>
                )}
                {isSimulating && (
                  <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Running simulation...
                  </div>
                )}
                {simResult && consoleLines.map((line, i) => (
                  <ConsoleLine key={i} line={line} />
                ))}
                {simResult?.errors && simResult.errors.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/5">
                    <p className="text-xs text-red-400 font-semibold mb-1.5">
                      Mismatches ({simResult.errors.length}):
                    </p>
                    {simResult.errors.map((err, i) => (
                      <div key={i} className="text-xs text-red-300 font-mono mb-1 leading-4">
                        {err.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Waveform */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-black/20 flex-shrink-0">
                <Code2 className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-slate-400">Waveform Viewer</span>
                {simResult?.signals_found && simResult.signals_found.length > 0 && (
                  <span className="ml-auto text-xs text-slate-600 font-mono">
                    {simResult.signals_found.length} signals
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0 bg-[#050505]">
                <WaveformViewer
                  parsedData={parsedData}
                  errors={(simResult?.errors || []).map(e => ({
                    signal: e.signal || "",
                    time: e.time,
                    message: e.message,
                  }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
