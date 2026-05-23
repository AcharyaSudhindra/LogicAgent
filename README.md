# AI Testbench Verifier

Powerful VCD waveform verification platform for logic and sequential checks, with Vivado-compatible signal mapping.

## Features
- Multi-checker engine:
  - `AND`, `OR`, `XOR`, `NAND`, `NOR`, `XNOR`
  - `DFF` (posedge D flip-flop check)
- Vivado-friendly hierarchical signal resolution:
  - Auto-resolves `a` to names like `tb/dut/a` or `tb.dut.a`
  - Optional explicit signal mapping inputs
- JSON APIs:
  - `GET /checkers`
  - `POST /upload`
  - `POST /visualize`
  - `GET /health`
- Frontend waveform viewer with mismatch highlighting

## Run

### Option 1: Single Click (Windows)
Just double-click the `run.bat` file! It will install dependencies, prompt you for an optional API key, start the server, and open your browser automatically.

### Option 2: Manual
```powershell
pip install flask google-genai
python app.py
```
Open: `http://127.0.0.1:5000/`

## API Usage

### 1. List supported checkers
```powershell
curl http://127.0.0.1:5000/checkers
```

### 2. Verify waveform
```powershell
curl -X POST -F "file=@sample.vcd" -F "checker=AND" http://127.0.0.1:5000/upload
```

### 3. Verify with Vivado signal mapping
```powershell
curl -X POST ^
  -F "file=@vivado_dump.vcd" ^
  -F "checker=DFF" ^
  -F "map_clk=tb/dut/clk" ^
  -F "map_d=tb/dut/d" ^
  -F "map_q=tb/dut/q" ^
  -F "map_rst=tb/dut/rst" ^
  http://127.0.0.1:5000/upload
```

### 4. Get visualization JSON
```powershell
curl -X POST -F "file=@sample.vcd" http://127.0.0.1:5000/visualize
```

## Project Structure
- `app.py` - Flask API routes
- `backend/vcd_parser.py` - VCD parser
- `backend/verifier.py` - checker engine + signal resolution
- `backend/visualizer.py` - waveform JSON builder
- `index.html` - frontend shell
- `static/css/styles.css` - frontend styles
- `static/js/app.js` - frontend logic
