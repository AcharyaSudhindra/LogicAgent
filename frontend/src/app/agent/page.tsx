"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Play, Square, ChevronRight, Terminal, Code2,
  Cpu, Zap, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  Bot, Wrench, MessageSquare, ArrowRight, Info
} from "lucide-react";
import Link from "next/link";

// Monaco editor loaded client-side only (no SSR)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const API_BASE = "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SimBackend = { backend: "iverilog" | "builtin"; version: string | null; description: string };
type CheckerDef = { kind: string; description: string };
type AgentEvent = {
  id: number;
  type: "start" | "log" | "thought" | "tool_call" | "tool_response" | "code_change" | "finish" | "error";
  step?: number;
  message?: string;
  tool?: string;
  args?: Record<string, string>;
  response?: string;
  code?: string;
  prevCode?: string;
};

const TEMPLATES: Record<string, { goal: string; code: string; checker: string }> = {
  AND: {
    checker: "AND",
    goal: "Fix the AND gate logic: the output y should represent a AND b.",
    code: `module and_gate(a, b, y);
  input a, b;
  output y;
  // BUG: Used OR instead of AND
  assign y = a | b;
endmodule`,
  },
  DFF: {
    checker: "DFF",
    goal: "Fix the D Flip-Flop: q captures d at posedge clk, with an active-high reset rst that forces q to 0.",
    code: `module dff(clk, d, q, rst);
  input clk, d, rst;
  output reg q;
  // BUG: Triggers on negedge and reset sets to 1
  always @(negedge clk) begin
    if (rst) q <= 1'b1;
    else q <= d;
  end
endmodule`,
  },
  FULL_ADDER: {
    checker: "FULL_ADDER",
    goal: "Fix the 1-bit Full Adder: calculate correct sum and cout outputs from a, b, and cin.",
    code: `module full_adder(a, b, cin, sum, cout);
  input a, b, cin;
  output sum, cout;
  // BUG: sum logic is missing cin, cout logic is incorrect
  assign sum = a ^ b;
  assign cout = (a & b) | cin;
endmodule`,
  },
};

// ---------------------------------------------------------------------------
// Diff computation
// ---------------------------------------------------------------------------
function computeDiff(oldCode: string, newCode: string): { type: "+" | "-" | "="; line: string }[] {
  const oldLines = oldCode.split("\n");
  const newLines = newCode.split("\n");
  const result: { type: "+" | "-" | "="; line: string }[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === undefined) result.push({ type: "+", line: n });
    else if (n === undefined) result.push({ type: "-", line: o });
    else if (o !== n) { result.push({ type: "-", line: o }); result.push({ type: "+", line: n }); }
    else result.push({ type: "=", line: o });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Event card components
// ---------------------------------------------------------------------------
function EventCard({ event }: { event: AgentEvent }) {
  const [expanded, setExpanded] = useState(true);

  if (event.type === "start") {
    return (
      <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono py-2 px-3 rounded-lg bg-cyan-950/20 border border-cyan-500/10 mb-2 animate-pulse">
        <Activity className="w-3.5 h-3.5" />
        <span>{event.message}</span>
      </div>
    );
  }

  if (event.type === "log") {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-xs font-mono py-1 px-3">
        <span className="text-cyan-500/50">›</span>
        <span>{event.message}</span>
      </div>
    );
  }

  if (event.type === "thought") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-violet-950/20 via-purple-950/10 to-zinc-950/35 border border-purple-500/20 p-4.5 my-2 purple-glow"
      >
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="w-5 h-5 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <Bot className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest font-sans">AI Agent Thought Process</span>
          {event.step && (
            <span className="ml-auto text-[10px] bg-purple-500/10 border border-purple-500/20 text-purple-300 font-mono px-2 py-0.5 rounded-full">
              step {event.step}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap pl-1.5 border-l-2 border-purple-500/20">
          {event.message}
        </p>
      </motion.div>
    );
  }

  if (event.type === "tool_call") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-xl bg-cyan-950/10 border border-cyan-500/20 p-3 my-2 shadow-[0_4px_12px_rgba(6,182,212,0.05)]"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-lg bg-cyan-500/15 flex items-center justify-center border border-cyan-500/25">
            <Wrench className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <span className="text-xs font-bold text-cyan-400 font-mono">{event.tool}</span>
          <ArrowRight className="w-3 h-3 text-zinc-600" />
          {event.args && Object.keys(event.args).length > 0 && (
            <span className="text-[11px] text-zinc-400 font-mono truncate max-w-[320px] bg-black/30 px-2 py-0.5 rounded">
              {Object.entries(event.args)
                .filter(([k]) => k !== "code")
                .map(([k, v]) => `${k}="${String(v).slice(0, 40)}"`)
                .join(", ")}
            </span>
          )}
          {event.args?.code && (
            <span className="text-[11px] text-zinc-500 font-mono italic bg-black/30 px-2 py-0.5 rounded">code={"<verilog>"}</span>
          )}
        </div>
      </motion.div>
    );
  }

  if (event.type === "tool_response") {
    const isSuccess = event.response?.startsWith("SIMULATION SUCCESS");
    const isError = event.response?.startsWith("SIMULATION FAILURE") || event.response?.startsWith("Error");
    return (
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className={`rounded-xl border p-3 my-2 transition-all ${
          isSuccess ? "bg-emerald-950/10 border-emerald-500/20 shadow-[0_4px_12px_rgba(16,185,129,0.05)]" :
          isError   ? "bg-rose-950/15 border-rose-500/20 shadow-[0_4px_12px_rgba(244,63,94,0.05)]" :
                      "bg-zinc-900/30 border-white/5"
        }`}
      >
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2.5 w-full text-left cursor-pointer"
        >
          {isSuccess ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" /> :
           isError   ? <XCircle   className="w-4 h-4 text-rose-400 flex-shrink-0" /> :
                       <Terminal  className="w-4 h-4 text-zinc-400 flex-shrink-0" />}
          <span className={`text-xs font-semibold font-mono ${isSuccess ? "text-emerald-400" : isError ? "text-rose-400" : "text-zinc-400"}`}>
            {event.tool} execution response
          </span>
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <AnimatePresence>
          {expanded && (
            <motion.pre
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="text-[11px] text-zinc-400 font-mono mt-2.5 whitespace-pre-wrap overflow-hidden leading-relaxed bg-black/20 p-3 rounded-lg border border-white/2"
            >
              {event.response}
            </motion.pre>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (event.type === "code_change") {
    const diff = event.prevCode ? computeDiff(event.prevCode, event.code || "") : [];
    const changes = diff.filter(d => d.type !== "=").length;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-zinc-950/40 glass-panel p-4 my-2"
      >
        <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2.5 w-full text-left cursor-pointer">
          <div className="w-5 h-5 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/25">
            <Code2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-xs font-bold text-emerald-400">Design Code Revised</span>
          <span className="text-[11px] text-zinc-500 ml-1">({changes} line{changes !== 1 ? "s" : ""} modified)</span>
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <AnimatePresence>
          {expanded && diff.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 overflow-hidden"
            >
              <div className="rounded-xl overflow-hidden border border-white/5 bg-black/45 text-[11px] font-mono max-h-64 overflow-y-auto">
                {diff.map((d, i) => (
                  <div
                    key={i}
                    className={`px-3 py-1 leading-5 flex ${
                      d.type === "+" ? "bg-emerald-950/40 text-emerald-300" :
                      d.type === "-" ? "bg-rose-950/40 text-rose-300" :
                      "text-zinc-600/80"
                    }`}
                  >
                    <span className="select-none mr-3 opacity-40 w-4 block text-center">
                      {d.type === "+" ? "+" : d.type === "-" ? "−" : " "}
                    </span>
                    <span className="flex-1 whitespace-pre-wrap">{d.line}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  if (event.type === "finish") {
    const success = event.message?.includes("passed") || event.message?.includes("success");
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl p-5 my-3 border-2 ${
          success
            ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.15)] emerald-glow"
            : "bg-amber-500/10 border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
        }`}
      >
        <div className="flex items-center gap-3.5">
          {success
            ? <CheckCircle className="w-7 h-7 text-emerald-400" />
            : <AlertTriangle className="w-7 h-7 text-amber-400" />}
          <div>
            <p className={`font-bold text-sm ${success ? "text-emerald-300" : "text-amber-300"}`}>
              {success ? "✓ Verification Cycle Success!" : "⚠ Agent Completed Cycle"}
            </p>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{event.message}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (event.type === "error") {
    return (
      <div className="rounded-xl bg-rose-950/15 border border-rose-500/30 p-4.5 my-2 rose-glow">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span className="text-xs font-bold text-rose-400">Agent Exception Error</span>
        </div>
        <p className="text-xs text-rose-300 font-mono mt-2 pl-1 whitespace-pre-wrap">{event.message}</p>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AgentStudio() {
  const [simBackend, setSimBackend] = useState<SimBackend | null>(null);
  const [checkers, setCheckers] = useState<string[]>(["AND", "DFF", "FULL_ADDER"]);
  const [checkerDefs, setCheckerDefs] = useState<Record<string, CheckerDef>>({});
  const [checker, setChecker] = useState("AND");
  const [goal, setGoal] = useState(TEMPLATES.AND.goal);
  const [code, setCode] = useState(TEMPLATES.AND.code);
  const [apiKey, setApiKey] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [iteration, setIteration] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const maxIterations = 6;

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const eventIdRef = useRef(0);
  const lastCodeRef = useRef(code);

  // Scroll console to bottom on new events
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  // Fetch backend info & checkers on mount
  useEffect(() => {
    fetch(`${API_BASE}/sim/backend_info`)
      .then(r => r.json())
      .then(setSimBackend)
      .catch(() => {});

    fetch(`${API_BASE}/checkers`)
      .then(r => r.json())
      .then(data => {
        if (data.supported) setCheckers(data.supported);
        if (data.definitions) setCheckerDefs(data.definitions);
      })
      .catch(() => {});
  }, []);

  const loadTemplate = useCallback((key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    setChecker(t.checker);
    setGoal(t.goal);
    setCode(t.code);
    lastCodeRef.current = t.code;
  }, []);

  const handleCheckerChange = (c: string) => {
    setChecker(c);
    if (TEMPLATES[c]) {
      setGoal(TEMPLATES[c].goal);
      setCode(TEMPLATES[c].code);
      lastCodeRef.current = TEMPLATES[c].code;
    }
  };

  const stopAgent = () => {
    wsRef.current?.close();
    setIsRunning(false);
  };

  const runAgent = async () => {
    if (isRunning) return;
    setEvents([]);
    setIteration(0);
    setIsFinished(false);
    lastCodeRef.current = code;
    setIsRunning(true);

    // 1. Create agent session
    let sessionId: string;
    try {
      const res = await fetch(`${API_BASE}/agent/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, checker, goal, api_key: apiKey }),
      });
      if (!res.ok) {
        const err = await res.json();
        const errId = eventIdRef.current++;
        setEvents(prev => [...prev, { id: errId, type: "error", message: err.detail || "Failed to create session." }]);
        setIsRunning(false);
        return;
      }
      const data = await res.json();
      sessionId = data.session_id;
    } catch (e) {
      const errId = eventIdRef.current++;
      setEvents(prev => [...prev, { id: errId, type: "error", message: `Network error: ${String(e)}` }]);
      setIsRunning(false);
      return;
    }

    // 2. Open WebSocket
    const ws = new WebSocket(`ws://localhost:8000/ws/agent/${sessionId}`);
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        const id = eventIdRef.current++;

        // Track iteration progress
        if (data.step) setIteration(data.step);

        // Handle code_change — attach previous code for diff
        if (data.type === "code_change") {
          const prev = lastCodeRef.current;
          lastCodeRef.current = data.code;
          setCode(data.code);
          setEvents(prev2 => [...prev2, { id, ...data, prevCode: prev }]);
          return;
        }

        if (data.type === "finish") setIsFinished(true);

        setEvents(prev => [...prev, { id, ...data }]);

        if (data.type === "finish" || data.type === "error") {
          setIsRunning(false);
          ws.close();
        }
      } catch { /* ignore malformed */ }
    };

    ws.onerror = () => {
      const errId = eventIdRef.current++;
      setEvents(prev => [...prev, { id: errId, type: "error", message: "WebSocket error. Is the server running on port 8000?" }]);
      setIsRunning(false);
    };

    ws.onclose = () => {
      if (isRunning) setIsRunning(false);
    };
  };

  // Checker group display
  const checkerGroups: Record<string, string[]> = {
    "Logic Gates": ["AND", "OR", "XOR", "NAND", "NOR", "XNOR"],
    "Arithmetic":  ["HALF_ADDER", "FULL_ADDER", "MUX2"],
    "Sequential":  ["DFF", "T_FF", "JK_FF"],
    "Custom":      ["ASSERTION"],
  };

  const progressPct = Math.round((iteration / maxIterations) * 100);

  return (
    <div className="flex flex-col h-screen bg-[#030304] text-slate-100 font-sans overflow-hidden">
      {/* ── Navigation bar ─────────────────────────────────────────────── */}
      <nav className="h-14 border-b border-white/5 flex items-center px-6 gap-4 bg-black/30 backdrop-blur-md flex-shrink-0 z-20">
        <Link href="/" className="flex items-center gap-3 group">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.25)]"
          >
            <Activity className="text-white w-4 h-4" />
          </motion.div>
          <span className="font-bold text-base bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            LogicAgent
          </span>
        </Link>

        <div className="flex items-center gap-1.5 ml-4">
          <Link
            href="/"
            className="px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Verifier
          </Link>
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
            <Bot className="w-3.5 h-3.5" />
            Agent Studio
          </div>
          <Link
            href="/lab"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <Code2 className="w-3.5 h-3.5" />
            Code Lab
          </Link>
        </div>

        {/* Simulator backend badge */}
        <div className="ml-auto flex items-center gap-3">
          {simBackend && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono ${
              simBackend.backend === "iverilog"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.05)]"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}>
              <Cpu className="w-3.5 h-3.5" />
              {simBackend.backend === "iverilog"
                ? `iverilog ${simBackend.version?.split(" ")[2] ?? ""}`
                : "Built-in Sim"}
            </div>
          )}
        </div>
      </nav>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT PANEL: Config and Monaco Editor ─────────────────────── */}
        <div className="w-[420px] flex-shrink-0 border-r border-white/5 flex flex-col bg-zinc-950/45 backdrop-blur-2xl overflow-y-auto">

          {/* Config section */}
          <div className="p-5 space-y-4 border-b border-white/5">
            <h2 className="text-xs uppercase tracking-widest text-zinc-400 font-bold flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-cyan-400" /> Agent Configurations
            </h2>

            {/* Checker selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Target Checker</label>
              <select
                value={checker}
                onChange={e => handleCheckerChange(e.target.value)}
                disabled={isRunning}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all text-slate-200 disabled:opacity-50"
              >
                {Object.entries(checkerGroups).map(([group, items]) => (
                  <optgroup key={group} label={group} className="bg-zinc-950 text-zinc-500">
                    {items.filter(c => checkers.includes(c) || checkers.length === 0).map(c => (
                      <option key={c} value={c} className="bg-zinc-950 text-slate-200">{c}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {checkerDefs[checker] && (
                <p className="text-xs text-zinc-500 flex items-start gap-1.5 mt-1.5 leading-relaxed bg-white/2 p-2.5 rounded-lg border border-white/2 font-mono">
                  <Info className="w-3.5 h-3.5 text-cyan-400/80 flex-shrink-0 mt-0.5" />
                  {checkerDefs[checker].description}
                </p>
              )}
            </div>

            {/* Goal */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider">Verification Goal</label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                disabled={isRunning}
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs resize-none focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all text-slate-200 disabled:opacity-50 leading-relaxed font-mono"
                placeholder="Describe what the circuit should do..."
              />
            </div>

            {/* API Key */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">Gemini API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                disabled={isRunning}
                className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 transition-all text-slate-200 font-mono disabled:opacity-50"
                placeholder="AIza... (leave blank to use env variable)"
              />
            </div>
          </div>

          {/* Templates */}
          <div className="p-5 space-y-3 border-b border-white/5">
            <h2 className="text-xs uppercase tracking-widest text-zinc-400 font-bold">Verification Templates</h2>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(TEMPLATES).map(k => (
                <button
                  key={k}
                  onClick={() => loadTemplate(k)}
                  disabled={isRunning}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 hover:border-cyan-400/30 transition-all disabled:opacity-40 cursor-pointer"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Monaco Editor in Mock IDE frame */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-white/5 bg-[#050507]">
            <div className="flex items-center gap-4 px-4 py-3 border-b border-white/5 bg-zinc-950/60 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full window-dot-red block" />
                <span className="w-2.5 h-2.5 rounded-full window-dot-yellow block" />
                <span className="w-2.5 h-2.5 rounded-full window-dot-green block" />
              </div>
              <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-300">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                rtl.v <span className="text-zinc-600 font-sans font-normal">— source</span>
              </div>
              {isRunning && (
                <span className="ml-auto text-[10px] text-purple-400 animate-pulse flex items-center gap-1 font-mono font-bold">
                  <RefreshCw className="w-3 h-3 animate-spin" /> AGENT RUNNING...
                </span>
              )}
            </div>
            <div className="flex-1 min-h-[240px]">
              <MonacoEditor
                height="100%"
                defaultLanguage="verilog"
                theme="vs-dark"
                value={code}
                onChange={v => { if (!isRunning) { setCode(v || ""); lastCodeRef.current = v || ""; } }}
                options={{
                  fontSize: 13,
                  fontFamily: "\"Geist Mono\", \"Fira Code\", monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  lineNumbers: "on",
                  renderLineHighlight: "all",
                  padding: { top: 12, bottom: 12 },
                  readOnly: isRunning,
                  smoothScrolling: true,
                }}
              />
            </div>
          </div>

          {/* Progress + Run button */}
          <div className="p-5 space-y-4 bg-zinc-950/20">
            {(isRunning || iteration > 0) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-medium">Verification Iterations</span>
                  <span className="font-mono text-cyan-400 font-semibold">{iteration}/{maxIterations}</span>
                </div>
                <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5 p-0.5">
                  <motion.div
                    className={`h-full rounded-full ${isFinished ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500"}`}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            )}

            {isRunning ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={stopAgent}
                className="w-full py-3 rounded-xl bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 transition-all text-sm font-semibold text-rose-400 flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_12px_rgba(244,63,94,0.05)]"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Agent Loop
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02, boxShadow: "0 0 25px rgba(139,92,246,0.3)" }}
                whileTap={{ scale: 0.98 }}
                onClick={runAgent}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-sm font-bold text-white flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.2)] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Execute Verification Loop
              </motion.button>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Streaming Telemetry Console ────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          
          {/* Console Mock IDE header */}
          <div className="h-14 border-b border-white/5 flex items-center px-6 gap-3 bg-zinc-950/60 backdrop-blur-sm flex-shrink-0">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-zinc-300 font-mono tracking-wider">Agent Workspace & Stream Telemetry</span>
            {isRunning && (
              <div className="flex items-center gap-1.5 ml-2.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                <span className="text-[10px] text-cyan-400 uppercase font-mono font-bold tracking-wider">Streaming Live</span>
              </div>
            )}
            {events.length > 0 && !isRunning && (
              <button
                onClick={() => { setEvents([]); setIteration(0); setIsFinished(false); }}
                className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 transition-colors cursor-pointer bg-white/2 border border-white/5 rounded-lg px-2.5 py-1"
              >
                <RefreshCw className="w-3 h-3" /> Clear Console
              </button>
            )}
          </div>

          {/* Console body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-1 bg-black/15">
            {events.length === 0 && !isRunning && (
              <div className="flex flex-col items-center justify-center h-full text-center select-none">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-purple-600/15 border border-white/5 flex items-center justify-center mb-5 shadow-lg">
                  <Bot className="w-8 h-8 text-zinc-400" />
                </div>
                <p className="text-zinc-200 text-sm font-bold">Agent Loop Terminal</p>
                <p className="text-zinc-500 text-xs mt-1.5 max-w-sm leading-relaxed">
                  Configure your check specification and code on the left, then click{" "}
                  <span className="text-cyan-400 font-semibold">Execute Verification Loop</span>. The AI will recursively synthesize testbenches, parse errors, and repair code.
                </p>
              </div>
            )}

            <AnimatePresence>
              {events.map(event => (
                <EventCard key={event.id} event={event} />
              ))}
            </AnimatePresence>

            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
