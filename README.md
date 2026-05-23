# LogicAgent AI

LogicAgent AI is an automated waveform verification platform and autonomous RTL synthesis agent. The system combines deterministic Verilog behavioral simulation with a large language model (LLM) to iteratively generate, simulate, and formally verify digital logic circuits.

## Core Capabilities

- **Autonomous RTL Synthesis**: Utilizes an LLM-driven feedback loop to iteratively write Verilog code, execute behavioral simulations, and verify the resulting Value Change Dump (VCD) waveforms against backend assertions until success criteria are met.
- **Waveform Analysis & Debugging**: Incorporates an interactive diagnostic interface where the LLM can analyze VCD traces and provide granular root-cause analysis for verification failures.
- **Multi-Checker Verification Engine**:
  - **Combinational Logic**: Supports `AND`, `OR`, `XOR`, `NAND`, `NOR`, `XNOR`, `HALF_ADDER`, `FULL_ADDER`, and `MUX2` verification templates.
  - **Sequential Logic**: Supports `DFF`, `T_FF`, `JK_FF`, and `COUNTER` behavioral verification over synthesized clock cycles.
- **Zero-Dependency RTL Simulation**: Features a lightweight, native Python behavioral Verilog simulator (`sim_engine.py`) capable of parsing logic, propagating signals, and emitting VCD format traces natively without external EDA toolchains.
- **Hierarchical Signal Resolution**: Automatically resolves deep hierarchical path mappings (e.g., `tb/dut/clk` to `clk`), ensuring compatibility with standard EDA tools like Xilinx Vivado and ModelSim.

## Quick Start (Windows)

The repository includes a batch automation script for immediate deployment:

1. Execute the `run.bat` initialization script.
2. The script will initialize a Python environment and resolve required dependencies (`flask`, `google-genai`).
3. You will be prompted to supply a valid Gemini API key to enable the autonomous LLM features.
4. The backend server and frontend interface will be automatically deployed and launched in your default browser.

## Manual Installation

To initialize the environment manually, execute the following commands:

```bash
pip install flask google-genai
python app.py
```
Access the interface at: `http://127.0.0.1:5000/`

## Architecture Overview

- **`app.py`**: The primary Flask application routing and API handler.
- **`backend/agent_engine.py`**: The autonomous execution loop responsible for orchestrating LLM tool calls, invoking the simulator, and asserting outputs.
- **`backend/smart_engine.py`**: API endpoints managing interactive waveform diagnostics and chat context.
- **`backend/sim_engine.py`**: The deterministic Python-based behavioral Verilog parser and simulator.
- **`backend/verifier.py`**: The core verification engine that consumes VCD structures and asserts state correctness.
- **`index.html` & `static/js/app.js`**: The frontend client application utilizing Server-Sent Events (SSE) for asynchronous telemetry streaming.
