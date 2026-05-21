const API_BASE = "http://127.0.0.1:5000";

const SAMPLE_VCD = `$timescale 1ns $end
$scope module tb $end
$var wire 1 ! clk $end
$var wire 1 " a $end
$var wire 1 # b $end
$var wire 1 $ y $end
$enddefinitions $end
#0
0!
0"
0#
0$
#10
1"
#20
1#
#30
0$
#40
1$
#50
0"
#60
0#`;

const LOCAL_SUPPORTED_CHECKERS = ["AND", "OR", "XOR", "NAND", "NOR", "XNOR", "DFF"];
let checkerDefinitions = {};
let currentText = "";

function appendTransition(transitions, signal, time, value) {
  if (!transitions[signal]) transitions[signal] = [];
  const arr = transitions[signal];
  if (arr.length === 0) return arr.push({ time, value });
  const last = arr[arr.length - 1];
  if (last.time === time) last.value = value;
  else if (last.value !== value) arr.push({ time, value });
}

function parseVCD(text) {
  const lines = text.split(/\r?\n/);
  const idToSignal = {};
  const transitions = {};
  let currentTime = 0;
  let timescale = "1ns";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("$timescale") && line.includes("$end")) {
      timescale = line.replace("$timescale", "").replace("$end", "").trim() || "1ns";
      continue;
    }

    if (line.startsWith("$var")) {
      const p = line.split(/\s+/);
      if (p.length >= 5) {
        idToSignal[p[3]] = p[4];
        transitions[p[4]] = transitions[p[4]] || [];
      }
      continue;
    }

    if (line.startsWith("#")) {
      const t = Number(line.slice(1).trim());
      if (!Number.isNaN(t)) currentTime = t;
      continue;
    }

    if (/^[01xXzZ].+/.test(line)) {
      const value = line[0].toLowerCase();
      const id = line.slice(1).trim();
      const sig = idToSignal[id];
      if (sig) appendTransition(transitions, sig, currentTime, value);
      continue;
    }

    if (/^[bBrR][01xXzZ]+/.test(line)) {
      const p = line.split(/\s+/);
      if (p.length === 2) {
        const value = p[0].slice(1).toLowerCase();
        const id = p[1];
        const sig = idToSignal[id];
        if (sig) appendTransition(transitions, sig, currentTime, value);
      }
    }
  }

  return { timescale, transitions };
}

function valueAt(arr, t) {
  let value = "x";
  for (const tr of arr || []) {
    if (tr.time <= t) value = tr.value;
    else break;
  }
  return value;
}

function expectedLogic(a, b, checker) {
  if (!(a === "0" || a === "1") || !(b === "0" || b === "1")) return "x";
  switch (checker) {
    case "AND": return (a === "1" && b === "1") ? "1" : "0";
    case "OR": return (a === "1" || b === "1") ? "1" : "0";
    case "XOR": return (a !== b) ? "1" : "0";
    case "NAND": return (a === "1" && b === "1") ? "0" : "1";
    case "NOR": return (a === "1" || b === "1") ? "0" : "1";
    case "XNOR": return (a !== b) ? "0" : "1";
    default: return "x";
  }
}

function getSignalMapFromInputs() {
  const out = {};
  const inputs = document.querySelectorAll("#mappingGrid input");
  inputs.forEach(input => {
    const k = input.id.replace("map_", "");
    const val = input.value.trim();
    if (val) out[k] = val;
  });
  return out;
}

function updateMappingGrid() {
  const checker = selectedChecker();
  const def = checkerDefinitions[checker] || {};
  const req = def.required || [];
  const opt = def.optional || [];
  
  const grid = document.getElementById("mappingGrid");
  if (!grid) return;
  grid.innerHTML = "";
  
  const allSignals = [...req, ...opt];
  if (allSignals.length === 0) {
    allSignals.push("a", "b", "y", "clk", "d", "q", "rst");
  }
  
  allSignals.forEach(k => {
    const isOpt = opt.includes(k);
    const label = document.createElement("label");
    label.innerHTML = `${k} <input id="map_${k}" placeholder="${isOpt ? 'optional' : 'auto'} signal for ${k}" />`;
    grid.appendChild(label);
    
    label.querySelector("input").addEventListener("input", () => {
      if (!currentText.trim()) return;
      runLocal();
    });
  });
}

function localCheck(parsed, checker, signalMap) {
  const transitions = parsed.transitions;
  const timescale = parsed.timescale || "1ns";
  const errors = [];

  const resolve = (name) => {
    const hint = signalMap[name];
    if (hint && transitions[hint]) return hint;
    return transitions[name] ? name : null;
  };

  if (checker === "DFF") {
    const clk = resolve("clk");
    const d = resolve("d");
    const q = resolve("q");
    const rst = resolve("rst");

    if (!clk || !d || !q) {
      if (!clk) errors.push({ message: "Missing clk signal for DFF check", signal: "clk" });
      if (!d) errors.push({ message: "Missing d signal for DFF check", signal: "d" });
      if (!q) errors.push({ message: "Missing q signal for DFF check", signal: "q" });
      return { verdict: "Incorrect", errors, summary: { checked_edges: 0 } };
    }

    const clkTr = transitions[clk];
    const dTr = transitions[d];
    const qTr = transitions[q];
    const rstTr = rst ? transitions[rst] : null;

    let checkedEdges = 0;
    const allowed = new Set();

    for (let i = 1; i < clkTr.length; i++) {
      const p = clkTr[i - 1].value;
      const c = clkTr[i].value;
      if (p === "0" && c === "1") {
        const t = clkTr[i].time;
        allowed.add(t);
        const dVal = valueAt(dTr, t);
        const qVal = valueAt(qTr, t);
        const rstVal = rstTr ? valueAt(rstTr, t) : "0";
        const expected = rstVal === "1" ? "0" : dVal;
        if (expected === "0" || expected === "1") {
          checkedEdges += 1;
          if (qVal !== expected) {
            errors.push({ message: `DFF mismatch at t=${t}${timescale.replace("1", "")}: expected q=${expected}, got q=${qVal}.`, signal: "q", time: t });
          }
        }
      }
    }

    for (let i = 1; i < qTr.length; i++) {
      const t = qTr[i].time;
      if (!allowed.has(t)) {
        errors.push({ message: `Timing violation: q changed outside posedge at t=${t}${timescale.replace("1", "")}.`, signal: "q", time: t });
      }
    }

    return { verdict: errors.length ? "Incorrect" : "Correct", errors, summary: { checked_edges: checkedEdges } };
  }

  const a = resolve("a");
  const b = resolve("b");
  const y = resolve("y");

  if (!a || !b || !y) {
    if (!a) errors.push({ message: "Missing a signal", signal: "a" });
    if (!b) errors.push({ message: "Missing b signal", signal: "b" });
    if (!y) errors.push({ message: "Missing y signal", signal: "y" });
    return { verdict: "Incorrect", errors, summary: { checked_timestamps: 0 } };
  }

  const timeSet = new Set([0]);
  [a, b, y].forEach(sig => transitions[sig].forEach(tr => timeSet.add(tr.time)));
  const times = [...timeSet].sort((x, y2) => x - y2);

  let checked = 0;
  for (const t of times) {
    const expected = expectedLogic(valueAt(transitions[a], t), valueAt(transitions[b], t), checker);
    if (expected === "0" || expected === "1") {
      checked += 1;
      const actual = valueAt(transitions[y], t);
      if (actual !== expected) {
        errors.push({ message: `Signal mismatch at t=${t}${timescale.replace("1", "")}: expected y=${expected}, got y=${actual}.`, signal: "y", time: t });
      }
    }
  }

  return { verdict: errors.length ? "Incorrect" : "Correct", errors, summary: { checked_timestamps: checked } };
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}

function renderWaveform(parsed, errors = []) {
  const svg = document.getElementById("waveformSvg");
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const transitions = parsed.transitions || {};
  const allSignals = Object.keys(transitions);
  if (!allSignals.length) return;

  const preferred = ["clk", "d", "q", "a", "b", "y", "rst"];
  const signals = preferred.filter(s => allSignals.includes(s)).concat(allSignals.filter(s => !preferred.includes(s)));

  let maxTime = 1;
  signals.forEach(sig => {
    const arr = transitions[sig] || [];
    if (arr.length) maxTime = Math.max(maxTime, arr[arr.length - 1].time);
  });

  const width = 1100;
  const rowH = 56;
  const top = 28;
  const left = 150;
  const right = 30;
  const height = top + rowH * signals.length + 28;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);

  const plotW = width - left - right;
  const xOf = (t) => left + (t / maxTime) * plotW;
  const errSignals = new Set(errors.map(e => e.signal).filter(Boolean));

  signals.forEach((sig, idx) => {
    const yBase = top + idx * rowH + 28;
    const yHigh = yBase - 18;
    const yLow = yBase;
    const sigErr = errSignals.has(sig);

    svg.appendChild(createSvgEl("text", {
      x: 14, y: yBase - 4,
      fill: sigErr ? "#ff5d73" : "#e5edf8",
      "font-size": 13,
      "font-weight": sigErr ? 700 : 500
    })).textContent = sig;

    svg.appendChild(createSvgEl("line", {
      x1: left, y1: yLow, x2: width - right, y2: yLow,
      stroke: "#2a3a58", "stroke-width": 1
    }));

    const arr = transitions[sig] || [];
    if (!arr.length) return;

    const points = new Set([0, maxTime]);
    arr.forEach(tr => points.add(tr.time));
    const timeline = [...points].sort((a, b) => a - b);

    for (let i = 0; i < timeline.length - 1; i++) {
      const t0 = timeline[i];
      const t1 = timeline[i + 1];
      const v0 = valueAt(arr, t0);
      const y0 = (v0 === "1") ? yHigh : yLow;
      const v1 = valueAt(arr, t1);
      const y1 = (v1 === "1") ? yHigh : yLow;

      svg.appendChild(createSvgEl("line", {
        x1: xOf(t0), y1: y0, x2: xOf(t1), y2: y0,
        stroke: sigErr ? "#ff5d73" : "#4f8cff",
        "stroke-width": 2
      }));

      if (y1 !== y0) {
        svg.appendChild(createSvgEl("line", {
          x1: xOf(t1), y1: y0, x2: xOf(t1), y2: y1,
          stroke: sigErr ? "#ff5d73" : "#4f8cff",
          "stroke-width": 2
        }));
      }
    }
  });

  const catchArea = createSvgEl("rect", { x: 0, y: 0, width: width, height: height, fill: "transparent" });
  svg.appendChild(catchArea);

  const crosshairGroup = createSvgEl("g", { id: "crosshair", style: "display: none;" });
  const crosshairLine = createSvgEl("line", { x1: 0, y1: 0, x2: 0, y2: height, stroke: "#4f8cff", "stroke-width": 1, "stroke-dasharray": "4 4" });
  const crosshairText = createSvgEl("text", { x: 5, y: 15, fill: "#e5edf8", "font-size": 12, "font-weight": "bold" });
  crosshairGroup.appendChild(crosshairLine);
  crosshairGroup.appendChild(crosshairText);
  svg.appendChild(crosshairGroup);

  svg.addEventListener("mousemove", (e) => {
    const rect = svg.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    if (ex >= left && ex <= width - right) {
      crosshairGroup.setAttribute("style", "display: block; pointer-events: none;");
      crosshairLine.setAttribute("x1", ex);
      crosshairLine.setAttribute("x2", ex);
      const t = ((ex - left) / plotW) * maxTime;
      crosshairText.setAttribute("x", ex + 5);
      crosshairText.textContent = `t=${Math.round(t)}`;
    } else {
      crosshairGroup.setAttribute("style", "display: none;");
    }
  });
  svg.addEventListener("mouseleave", () => {
    crosshairGroup.setAttribute("style", "display: none;");
  });
}

function showResult(data) {
  const verdictEl = document.getElementById("verdict");
  const errorList = document.getElementById("errorList");
  const metrics = document.getElementById("metrics");

  verdictEl.textContent = `Verdict: ${data.verdict}`;
  verdictEl.className = data.verdict === "Correct" ? "ok" : "bad";

  errorList.innerHTML = "";
  const errors = data.errors || [];
  if (!errors.length) {
    const li = document.createElement("li");
    li.textContent = "No mismatches found.";
    li.className = "ok";
    errorList.appendChild(li);
  } else {
    errors.forEach(err => {
      const li = document.createElement("li");
      li.textContent = err.message || JSON.stringify(err);
      errorList.appendChild(li);
    });
  }

  const checked = data.summary?.checked_timestamps ?? data.summary?.checked_edges ?? 0;
  const signalCount = data.signals_found?.length ?? Object.keys(data.signals || {}).length ?? 0;
  const resolved = data.summary?.resolved_signals ? JSON.stringify(data.summary.resolved_signals) : "{}";

  metrics.innerHTML = `<span>Checker: ${data.checker || "LOCAL"}</span><span>Errors: ${errors.length}</span><span>Checked points/edges: ${checked}</span><span>Signals: ${signalCount}</span><span>Resolved: ${resolved}</span>`;
}

function selectedChecker() {
  const checkerSelect = document.getElementById("checkerSelect");
  return (checkerSelect.value || "AND").toUpperCase();
}

async function loadCheckers() {
  const checkerSelect = document.getElementById("checkerSelect");
  checkerSelect.innerHTML = "";
  let checkers = [...LOCAL_SUPPORTED_CHECKERS];

  try {
    const res = await fetch(`${API_BASE}/checkers`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.supported) && data.supported.length) {
        checkers = data.supported;
      }
      checkerDefinitions = data.definitions || {};
    }
  } catch (_) {
    checkerDefinitions = {};
  }

  checkers.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    const desc = checkerDefinitions[name]?.description;
    opt.textContent = desc ? `${name} - ${desc}` : `${name} checker`;
    checkerSelect.appendChild(opt);
  });

  checkerSelect.value = "AND";
  updateMappingGrid();
}

async function runBackend(file, checker, signalMap) {
  const uploadForm = new FormData();
  uploadForm.append("file", file);
  uploadForm.append("checker", checker);
  uploadForm.append("signal_map", JSON.stringify(signalMap));
  Object.entries(signalMap).forEach(([k, v]) => uploadForm.append(`map_${k}`, v));

  const uploadRes = await fetch(`${API_BASE}/upload`, { method: "POST", body: uploadForm });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(uploadData.error || "Upload API failed");

  const visForm = new FormData();
  visForm.append("file", file);
  const visRes = await fetch(`${API_BASE}/visualize`, { method: "POST", body: visForm });
  const visData = await visRes.json();
  if (!visRes.ok) throw new Error(visData.error || "Visualize API failed");

  showResult(uploadData);
  renderWaveform({ transitions: visData.signals || {}, timescale: visData.timescale || "1ns" }, uploadData.errors || []);
}

function runLocal() {
  const checker = selectedChecker();
  const signalMap = getSignalMapFromInputs();
  const parsed = parseVCD(currentText);
  const result = localCheck(parsed, checker, signalMap);
  showResult({ ...result, checker: `LOCAL_${checker}`, signals: parsed.transitions });
  renderWaveform(parsed, result.errors || []);
}

async function init() {
  const fileInput = document.getElementById("fileInput");
  const sampleBox = document.getElementById("sampleBox");

  await loadCheckers();

  sampleBox.textContent = SAMPLE_VCD;
  currentText = SAMPLE_VCD;
  runLocal();

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    currentText = await file.text();
  });

  document.getElementById("checkerSelect").addEventListener("change", () => {
    updateMappingGrid();
    if (!currentText.trim()) return;
    runLocal();
  });

  document.getElementById("loadSampleBtn").addEventListener("click", () => {
    currentText = SAMPLE_VCD;
    runLocal();
  });

  document.getElementById("runLocalBtn").addEventListener("click", () => {
    if (!currentText.trim()) return alert("Select a VCD file or load sample first.");
    runLocal();
  });

  document.getElementById("runBackendBtn").addEventListener("click", async () => {
    const file = fileInput.files?.[0];
    if (!file) return alert("Select a VCD file first.");
    try {
      await runBackend(file, selectedChecker(), getSignalMapFromInputs());
    } catch (err) {
      showResult({ verdict: "Incorrect", errors: [{ message: err.message }], summary: { checked_timestamps: 0 } });
    }
  });
}

window.addEventListener("DOMContentLoaded", init);
