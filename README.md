# LogicAgent AI

A powerful, AI-driven VCD waveform verification platform and autonomous RTL agent. This tool not only verifies digital logic and sequential circuits against behavioral expectations but also features a built-in **Gemini-powered Autonomous Agent** that can write, simulate, and debug Verilog code entirely on its own!

## ✨ Hackathon Features

- **Autonomous RTL Agent**: 
  - Provide a prompt like "Write a D Flip-Flop", and the agent will write the Verilog code, compile it using a built-in zero-dependency Python simulator, generate a waveform, and verify it against our backend checkers until it succeeds!
- **AI Chatbot & Debug Assistant**: 
  - Chat directly with Gemini 3.1 Pro about your waveforms.
  - Ask the debug assistant to analyze verification errors and explain why your circuit failed.
- **Multi-Checker Verification Engine**:
  - Combinational: `AND`, `OR`, `XOR`, `NAND`, `NOR`, `XNOR`, `HALF_ADDER`, `FULL_ADDER`, `MUX2`
  - Sequential: `DFF`, `T_FF`, `JK_FF`, `COUNTER`
- **Zero-Dependency Verilog Simulator**: 
  - Built-in `sim_engine.py` can parse and simulate behavioral Verilog directly in Python, generating VCD traces on the fly.
- **Vivado-Friendly Signal Resolution**:
  - Auto-resolves hierarchical names (e.g., `tb/dut/clk` to `clk`).
- **Premium UI**: 
  - Beautiful, tabbed, glassmorphism UI for waveform visualization, autonomous agent streaming, and AI chat.

## 🚀 Quick Start (Windows)

Just double-click the `run.bat` file! 
1. It automatically installs dependencies (`flask`, `google-genai`).
2. Prompts you for your **Gemini API Key** (required for AI features).
3. Starts the server and opens your browser automatically.

## 🛠️ Manual Installation

```powershell
pip install flask google-genai
python app.py
```
Open: `http://127.0.0.1:5000/`

## 🧠 Project Architecture

- **`app.py`**: Main Flask backend.
- **`backend/agent_engine.py`**: The brain of the autonomous loop. Connects Gemini to the simulator and verifier tools.
- **`backend/smart_engine.py`**: AI endpoints for waveform debugging and chat.
- **`backend/sim_engine.py`**: Custom lightweight Python Verilog simulator.
- **`backend/verifier.py`**: Core logic engine that analyzes VCD states.
- **`index.html` & `static/js/app.js`**: Dynamic frontend with Server-Sent Events (SSE) for live agent streaming.
