"use client";
import React, { useState, useEffect } from 'react';
import { Terminal, Activity, Code2, Play, Settings, Bot, Cpu, Upload, Sparkles, AlertCircle, FileText, CheckCircle2, XCircle } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import WaveformViewer from '@/components/WaveformViewer';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API_BASE = "http://localhost:8000";

const TEMPLATES: Record<string, { rtl: string; tb: string }> = {
  AND: {
    rtl: `module and_gate(a, b, y);
  input a, b;
  output y;
  // BUG: Used OR instead of AND
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
    #10; $finish;
  end
endmodule`
  },
  DFF: {
    rtl: `module dff(clk, d, q, rst);
  input clk, d, rst;
  output reg q;
  // BUG: Triggers on negedge and reset sets to 1
  always @(negedge clk) begin
    if (rst) q <= 1'b1;
    else q <= d;
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
    #10; $finish;
  end

  always #5 clk = ~clk;
endmodule`
  },
  FULL_ADDER: {
    rtl: `module full_adder(a, b, cin, sum, cout);
  input a, b, cin;
  output sum, cout;
  // BUG: sum logic is missing cin, cout logic is incorrect
  assign sum = a ^ b;
  assign cout = (a & b) | cin;
endmodule`,
    tb: `\`timescale 1ns/1ps
module tb_full_adder;
  reg a, b, cin;
  wire sum, cout;

  full_adder dut(.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_full_adder);
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
endmodule`
  }
};

type Transition = { time: number; value: string };
type ParsedData = { timescale: string; transitions: Record<string, Transition[]> } | null;

export default function Home() {
  const [inputMode, setInputMode] = useState<"vcd" | "code">("vcd");
  
  // VCD Mode State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Code Mode State
  const [rtlCode, setRtlCode] = useState(TEMPLATES.AND.rtl);
  const [tbCode, setTbCode] = useState(TEMPLATES.AND.tb);
  const [activeEditorTab, setActiveEditorTab] = useState<"rtl" | "tb">("rtl");
  const [apiKey, setApiKey] = useState("");
  const [isGeneratingTB, setIsGeneratingTB] = useState(false);
  
  // Universal Verification State
  const [checker, setChecker] = useState("AND");
  const [verdict, setVerdict] = useState("Waiting for input");
  const [errors, setErrors] = useState<{ signal: string; time?: number; message: string }[]>([]);
  const [parsedData, setParsedData] = useState<ParsedData>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<string>("");
  const [simBackend, setSimBackend] = useState<{ backend: string; version: string | null } | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/sim/backend_info`)
      .then(r => r.json())
      .then(setSimBackend)
      .catch(() => {});
  }, []);

  // Update code templates when checker changes in Code Mode
  const handleCheckerChange = (newChecker: string) => {
    setChecker(newChecker);
    if (TEMPLATES[newChecker]) {
      setRtlCode(TEMPLATES[newChecker].rtl);
      setTbCode(TEMPLATES[newChecker].tb);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setVerdict("Ready to verify");
    }
  };

  // 1. Verify VCD Upload File
  const verifyUploadedVCD = async () => {
    if (!selectedFile) {
      alert("Please select a VCD file first.");
      return;
    }

    setIsVerifying(true);
    setVerdict("Running verification...");
    setConsoleOutput("Initializing verifier...\nParsing VCD file...\nRunning assertions...\n");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("checker", checker);
    formData.append("signal_map", "{}");

    try {
      const uploadRes = await axios.post(`${API_BASE}/upload`, formData);
      const data = uploadRes.data;
      
      setVerdict(data.verdict);
      setErrors(data.errors || []);
      setConsoleOutput(prev => prev + `Verification completed.\nVerdict: ${data.verdict}\nErrors found: ${data.error_count}\n` + (data.summary?.message || ""));

      // Get waveform visualization transitions
      const visForm = new FormData();
      visForm.append("file", selectedFile);
      const visRes = await axios.post(`${API_BASE}/visualize`, visForm);
      const visData = visRes.data;

      setParsedData({
        timescale: visData.timescale || "1ns",
        transitions: visData.signals || {}
      });

    } catch (error) {
      console.error(error);
      setVerdict("Verification Failed");
      setConsoleOutput(prev => prev + "ERROR: Failed to communicate with FastAPI backend.\n");
    } finally {
      setIsVerifying(false);
    }
  };

  // 2. Verify custom code via backend simulation
  const verifyCustomCode = async () => {
    if (!rtlCode.trim()) {
      alert("RTL code cannot be empty.");
      return;
    }
    if (!tbCode.trim()) {
      alert("Testbench code cannot be empty. You can write your own or click 'AI Generate'.");
      return;
    }

    setIsVerifying(true);
    setVerdict("Simulating design...");
    setConsoleOutput("Launching simulator...\nCompiling modules...\n");

    try {
      const simRes = await fetch(`${API_BASE}/sim/run_custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtl_code: rtlCode, tb_code: tbCode, checker }),
      });
      const data = await simRes.json();
      
      setVerdict(data.verdict);
      setErrors(data.errors || []);
      setConsoleOutput(data.console_output || "Simulation executed.");

      if (data.success && data.vcd) {
        // Parse simulated VCD for visualization
        const visRes = await fetch(`${API_BASE}/visualize`, {
          method: "POST",
          body: (() => {
            const f = new FormData();
            f.append("file", new Blob([data.vcd], { type: "text/plain" }), "sim.vcd");
            return f;
          })(),
        });
        const visData = await visRes.json();
        setParsedData({
          timescale: visData.timescale || "1ns",
          transitions: visData.signals || {}
        });
      } else {
        setParsedData(null);
      }
    } catch (error) {
      console.error(error);
      setVerdict("Simulation Failed");
      setConsoleOutput("Network Error: Could not reach verification server.");
    } finally {
      setIsVerifying(false);
    }
  };

  // AI Gen Testbench helper
  const handleAIGenTestbench = async () => {
    if (isGeneratingTB) return;
    setIsGeneratingTB(true);
    try {
      const res = await fetch(`${API_BASE}/ai/generate_testbench`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtl_code: rtlCode, checker, api_key: apiKey }),
      });
      const data = await res.json();
      if (data.testbench_code) {
        setTbCode(data.testbench_code);
        setActiveEditorTab("tb");
      }
    } catch (e) {
      console.error(e);
      alert("Failed to generate testbench. Please verify Gemini API Key configuration.");
    } finally {
      setIsGeneratingTB(false);
    }
  };

  const getVerdictStyle = () => {
    switch (verdict) {
      case "Correct":
        return {
          bg: "bg-emerald-500/10 border-emerald-500/20 emerald-glow",
          text: "text-emerald-400",
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        };
      case "Incorrect":
        return {
          bg: "bg-rose-500/10 border-rose-500/20 rose-glow",
          text: "text-rose-400",
          icon: <XCircle className="w-6 h-6 text-rose-400" />
        };
      case "Running verification...":
      case "Simulating design...":
        return {
          bg: "bg-cyan-500/10 border-cyan-500/20 cyan-glow",
          text: "text-cyan-400 animate-pulse",
          icon: <Cpu className="w-6 h-6 text-cyan-400 animate-spin" />
        };
      default:
        return {
          bg: "bg-zinc-900/40 border-zinc-800/80 glass-panel",
          text: "text-zinc-400",
          icon: <AlertCircle className="w-6 h-6 text-zinc-500" />
        };
    }
  };

  const currentVerdict = getVerdictStyle();

  return (
    <div className="flex h-screen bg-[#030304] text-slate-100 font-sans overflow-hidden flex-col">
      {/* Navigation Bar */}
      <nav className="h-14 border-b border-white/5 flex items-center px-6 gap-4 bg-black/30 backdrop-blur-md z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.25)]"
          >
            <Activity className="text-white w-4 h-4" />
          </motion.div>
          <span className="font-bold text-base bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">LogicAgent</span>
        </div>
        <div className="flex items-center gap-1.5 ml-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
            <Code2 className="w-3.5 h-3.5" />
            Verifier Studio
          </div>
          <Link href="/agent" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <Bot className="w-3.5 h-3.5" />
            Agent Studio
          </Link>
          <Link href="/lab" className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <Code2 className="w-3.5 h-3.5" />
            Code Lab
          </Link>
        </div>
        {simBackend && (
          <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono ${
            simBackend.backend === 'iverilog'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.05)]'
              : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
          }`}>
            <Cpu className="w-3.5 h-3.5" />
            {simBackend.backend === 'iverilog' ? `iverilog ${simBackend.version?.split(' ')[2] ?? ''}` : 'Built-in Sim'}
          </div>
        )}
      </nav>

      {/* Workspace Area */}
      <div className="flex flex-1 min-h-0">
        
        {/* Sidebar Config Panel */}
        <motion.aside
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="w-80 bg-zinc-950/40 backdrop-blur-2xl border-r border-white/5 flex flex-col z-10 select-none"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/5 flex items-center gap-3">
            <Settings className="w-4 h-4 text-cyan-400" />
            <span className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Verification Engine</span>
          </div>

          <div className="p-5 flex flex-col gap-6 overflow-y-auto flex-1">
            {/* Input Switch Mode */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">Input Source Mode</label>
              <div className="grid grid-cols-2 p-1 bg-black/40 rounded-xl border border-white/5">
                <button
                  onClick={() => setInputMode("vcd")}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    inputMode === "vcd"
                      ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 text-cyan-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  VCD Upload
                </button>
                <button
                  onClick={() => {
                    setInputMode("code");
                    handleCheckerChange(checker);
                  }}
                  className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                    inputMode === "code"
                      ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 text-cyan-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Write Code
                </button>
              </div>
            </div>

            {/* Checker Selector */}
            <div className="space-y-2">
              <label className="text-xs text-zinc-400 font-medium">Validation Checker</label>
              <select
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all text-slate-200"
                value={checker}
                onChange={(e) => handleCheckerChange(e.target.value)}
              >
                <option value="AND" className="bg-zinc-950">AND Gate Checker</option>
                <option value="DFF" className="bg-zinc-950">D Flip-Flop Checker</option>
                <option value="FULL_ADDER" className="bg-zinc-950">1-bit Full Adder Checker</option>
              </select>
            </div>

            {/* AI Generator Key (Shown only in Code Mode) */}
            {inputMode === "code" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-2"
              >
                <label className="text-xs text-zinc-400 font-medium">Gemini API Key (Optional)</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza... (Blank uses env variable)"
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all text-slate-200 font-mono"
                />
              </motion.div>
            )}

            {/* File Upload Box (Shown only in VCD Mode) */}
            {inputMode === "vcd" && (
              <div className="space-y-3">
                <label className="text-xs text-zinc-400 font-medium">Upload Waveform File</label>
                <label className="flex flex-col items-center justify-center w-full h-32 border border-dashed border-white/10 rounded-2xl bg-black/10 hover:bg-cyan-500/5 hover:border-cyan-500/30 cursor-pointer transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-8 h-8 text-zinc-500 group-hover:text-cyan-400 mb-2 transition-colors" />
                    <p className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors font-medium">
                      {selectedFile ? selectedFile.name : "Select VCD file"}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-1">Accepts .vcd only</p>
                  </div>
                  <input type="file" className="hidden" accept=".vcd" onChange={handleFileUpload} />
                </label>
              </div>
            )}
          </div>

          {/* Action Trigger Button */}
          <div className="p-5 border-t border-white/5 bg-zinc-950/20">
            {inputMode === "vcd" ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={verifyUploadedVCD}
                disabled={isVerifying || !selectedFile}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Verify Waveform
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={verifyCustomCode}
                disabled={isVerifying}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                Verify & Simulate Code
              </motion.button>
            )}
          </div>
        </motion.aside>

        {/* Main Content Pane */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          
          <div className="p-6 space-y-6 max-w-6xl mx-auto w-full">
            {/* Verdict Banner */}
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`border rounded-2xl p-6 transition-all ${currentVerdict.bg}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {currentVerdict.icon}
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block">Verification Verdict</span>
                    <h2 className={`text-xl font-bold ${currentVerdict.text}`}>{verdict}</h2>
                  </div>
                </div>
                {errors.length > 0 && (
                  <span className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-semibold">
                    {errors.length} Mismatches
                  </span>
                )}
              </div>
            </motion.div>

            {/* Split Code Editors / Visuals */}
            {inputMode === "code" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Monaco Code Mock-IDE container */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl border border-white/5 bg-zinc-950/40 glass-panel overflow-hidden h-[420px] flex flex-col shadow-xl"
                >
                  {/* IDE Titlebar */}
                  <div className="h-11 border-b border-white/5 px-4 bg-zinc-950/60 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-6 h-full">
                      {/* Window Controls */}
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full window-dot-red block" />
                        <span className="w-3 h-3 rounded-full window-dot-yellow block" />
                        <span className="w-3 h-3 rounded-full window-dot-green block" />
                      </div>
                      
                      {/* File Tabs */}
                      <div className="flex items-center gap-1.5 h-full text-xs font-mono font-medium">
                        <button
                          onClick={() => setActiveEditorTab("rtl")}
                          className={`px-3 h-full border-b-2 flex items-center gap-1.5 transition-all ${
                            activeEditorTab === "rtl"
                              ? "border-cyan-400 text-cyan-300 bg-white/2"
                              : "border-transparent text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <FileText className="w-3 h-3 text-cyan-500" />
                          rtl.v
                        </button>
                        <button
                          onClick={() => setActiveEditorTab("tb")}
                          className={`px-3 h-full border-b-2 flex items-center gap-1.5 transition-all ${
                            activeEditorTab === "tb"
                              ? "border-purple-400 text-purple-300 bg-white/2"
                              : "border-transparent text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <FileText className="w-3 h-3 text-purple-500" />
                          tb.v
                        </button>
                      </div>
                    </div>

                    {/* AI Gen Testbench Trigger */}
                    {activeEditorTab === "tb" && (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleAIGenTestbench}
                        disabled={isGeneratingTB}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[11px] font-semibold hover:bg-purple-500/20 transition-all disabled:opacity-40"
                      >
                        {isGeneratingTB ? (
                          <>
                            <Cpu className="w-3 h-3 animate-spin" />
                            Writing...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3 h-3" />
                            AI Gen Testbench
                          </>
                        )}
                      </motion.button>
                    )}
                  </div>

                  {/* Monaco Workspace */}
                  <div className="flex-1 min-h-0 bg-[#050507]">
                    <MonacoEditor
                      height="100%"
                      defaultLanguage="verilog"
                      theme="vs-dark"
                      value={activeEditorTab === "rtl" ? rtlCode : tbCode}
                      onChange={(val) => {
                        if (activeEditorTab === "rtl") setRtlCode(val || "");
                        else setTbCode(val || "");
                      }}
                      options={{
                        fontSize: 13,
                        fontFamily: "\"Geist Mono\", \"Fira Code\", monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        padding: { top: 12, bottom: 12 },
                        smoothScrolling: true,
                        renderLineHighlight: "all",
                        readOnly: isVerifying || isGeneratingTB
                      }}
                    />
                  </div>
                </motion.div>

                {/* Console Log Terminal */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl border border-white/5 bg-zinc-950/40 glass-panel overflow-hidden h-[420px] flex flex-col shadow-xl"
                >
                  <div className="h-11 border-b border-white/5 px-4 bg-zinc-950/60 flex items-center gap-2 flex-shrink-0">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-zinc-300 font-mono">Telemetry Console</span>
                  </div>
                  <div className="flex-1 p-4 bg-black/35 font-mono text-[11px] leading-5 text-zinc-400 overflow-y-auto whitespace-pre-wrap select-text">
                    {consoleOutput || "Simulator is idle. Run verification to start compilation logs."}
                  </div>
                </motion.div>

              </div>
            )}

            {/* Waveform Logic Analyzer Card */}
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl border border-white/5 bg-zinc-950/40 glass-panel overflow-hidden shadow-xl"
            >
              {/* Analyzer Header */}
              <div className="h-12 border-b border-white/5 px-5 bg-zinc-950/60 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-zinc-300">Logic Analyzer Output</span>
                </div>
                {parsedData && (
                  <span className="text-[10px] text-zinc-500 font-mono">
                    Timescale: {parsedData.timescale}
                  </span>
                )}
              </div>

              {/* Canvas Waveform viewport */}
              <div className="h-80 w-full relative bg-[#050507]">
                <WaveformViewer parsedData={parsedData} errors={errors} />
              </div>
            </motion.div>

            {/* Verification Errors Warning panel */}
            <AnimatePresence>
              {errors.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 space-y-3"
                >
                  <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Waveform Verification Assertion Mismatches
                  </h3>
                  <motion.div
                    className="text-xs font-mono text-rose-300/80 space-y-2 mt-2"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: { opacity: 0 },
                      visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
                    }}
                  >
                    {errors.map((err, idx) => (
                      <motion.div 
                        key={idx} 
                        className="flex gap-2 p-2 bg-rose-500/10 rounded-lg border border-rose-500/10"
                        variants={{
                          hidden: { opacity: 0, x: -10 },
                          visible: { opacity: 1, x: 0 }
                        }}
                      >
                        <span className="text-rose-500 font-bold">[{idx + 1}]</span>
                        <span>{err.message || JSON.stringify(err)}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </main>
      </div>
    </div>
  );
}
