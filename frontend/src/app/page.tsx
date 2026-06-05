"use client";
import React, { useState } from 'react';
import { Terminal, Activity, MessageSquare, Code2, Play, Settings } from 'lucide-react';
import axios from 'axios';
import { motion } from 'framer-motion';
import WaveformViewer from '@/components/WaveformViewer';

const API_BASE = "http://localhost:8000";

export default function Home() {
  const [parsedData, setParsedData] = useState(null);
  const [errors, setErrors] = useState([]);
  const [verdict, setVerdict] = useState("Waiting for input");
  const [checker, setChecker] = useState("AND");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const runVerification = async () => {
    if (!selectedFile) {
      alert("Please select a VCD file first.");
      return;
    }

    setVerdict("Running verification...");
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("checker", checker);
    formData.append("signal_map", "{}");

    try {
      const uploadRes = await axios.post(`${API_BASE}/upload`, formData);
      const data = uploadRes.data;
      
      setVerdict(data.verdict);
      setErrors(data.errors || []);

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
      alert("Failed to communicate with FastAPI backend.");
    }
  };

  return (
    <div className="flex h-screen bg-[#030303] text-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-80 bg-slate-900/40 backdrop-blur-2xl border-r border-white/5 flex flex-col shadow-2xl z-10"
      >
        <div className="p-8 border-b border-white/5 flex items-center gap-4">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.3)]"
          >
            <Activity className="text-white w-6 h-6" />
          </motion.div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">LogicAgent</h1>
        </div>
        
        <div className="p-6 flex flex-col gap-8 overflow-y-auto">
          {/* Controls */}
          <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold">1. Upload Waveform</h3>
            <label className="block w-full p-4 text-center border border-dashed border-white/10 rounded-xl bg-white/5 hover:bg-cyan-400/10 hover:border-cyan-400/50 hover:shadow-[0_0_15px_rgba(0,229,255,0.15)] cursor-pointer transition-all">
              <span className="text-sm font-medium">{selectedFile ? selectedFile.name : "Browse VCD File"}</span>
              <input type="file" className="hidden" accept=".vcd" onChange={handleFileUpload} />
            </label>
          </div>
          
          <div className="space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold">2. Select Checker</h3>
            <select 
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 transition-all text-slate-200"
              value={checker}
              onChange={(e) => setChecker(e.target.value)}
            >
              <option value="AND" className="bg-slate-900">AND Checker</option>
              <option value="DFF" className="bg-slate-900">DFF Checker</option>
              <option value="FULL_ADDER" className="bg-slate-900">FULL ADDER Checker</option>
            </select>
          </div>
        </div>

        <div className="mt-auto p-6 flex flex-col gap-3">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={runVerification}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:shadow-[0_0_20px_rgba(189,0,255,0.4)] transition-all text-sm font-semibold text-white"
          >
            Run Backend Verification
          </motion.button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none -z-10"></div>
        
        <nav className="h-20 border-b border-white/5 flex items-center justify-between px-10 bg-black/20 backdrop-blur-md">
          <span className="text-sm font-medium text-slate-400">Vivado-ready verification with smart multi-checker engine</span>
          <button className="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:border-cyan-400 transition-all">
            <Settings className="w-5 h-5" />
          </button>
        </nav>

        <div className="flex-1 overflow-y-auto p-10">
          <div className="grid grid-cols-2 gap-6 max-w-[1400px] mx-auto">
            
            {/* Verdict Banner */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className={`col-span-2 border rounded-3xl p-8 backdrop-blur-md flex items-center justify-between shadow-xl transition-colors ${verdict === 'Correct' ? 'bg-emerald-500/10 border-emerald-500/30' : verdict === 'Incorrect' ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}
            >
              <div className="flex items-center gap-6">
                <div className={`w-4 h-4 rounded-full shadow-[0_0_15px_rgba(245,158,11,0.6)] ${verdict === 'Correct' ? 'bg-emerald-500' : verdict === 'Incorrect' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'}`}></div>
                <h2 className={`text-2xl font-bold ${verdict === 'Correct' ? 'text-emerald-500' : verdict === 'Incorrect' ? 'text-red-500' : 'text-amber-500'}`}>{verdict}</h2>
              </div>
            </motion.div>

            {/* Error List */}
            {errors.length > 0 && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="col-span-2 bg-red-500/5 border border-red-500/20 rounded-3xl p-8 backdrop-blur-md shadow-xl border-t-4 border-t-red-500"
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-3 text-red-500">
                  <Terminal className="w-5 h-5" />
                  Mismatches & Errors
                </h3>
                <ul className="list-disc pl-5 space-y-2 text-sm text-red-400 font-mono">
                  {errors.map((err: any, idx) => (
                    <li key={idx}>{err.message || JSON.stringify(err)}</li>
                  ))}
                </ul>
              </motion.div>
            )}

            {/* Waveform Canvas */}
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="col-span-2 bg-[#050505] border border-white/10 rounded-3xl overflow-hidden shadow-xl"
            >
              <div className="p-6 border-b border-white/5">
                <h3 className="text-lg font-semibold flex items-center gap-3">
                  <Code2 className="w-5 h-5 text-cyan-400" />
                  Logic Analyzer (Canvas Rendered)
                </h3>
              </div>
              <div className="h-[400px] w-full relative">
                <WaveformViewer parsedData={parsedData} errors={errors} />
              </div>
            </motion.div>

          </div>
        </div>
      </main>
    </div>
  );
}
