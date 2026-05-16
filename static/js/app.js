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

function localCheckAndRule(parsed) {
  const transitions = parsed.transitions;
  const timescale = parsed.timescale || "1ns";
  const errors = [];
  const required = ["a", "b", "y"];

  for (const sig of required) {
    if (!transitions[sig] || transitions[sig].length === 0) {
      errors.push({ message: `Missing required signal '${sig}'.`, signal: sig, time: null });
    }
  }
  if (errors.length) return { verdict: "Incorrect", errors, summary: { checked_timestamps: 0 } };

  const timeSet = new Set([0]);
  required.forEach(sig => transitions[sig].forEach(tr => timeSet.add(tr.time)));
  const times = [...timeSet].sort((a, b) => a - b);

  let checked = 0;
  for (const t of times) {
    const a = valueAt(transitions.a, t);
    const b = valueAt(transitions.b, t);
    const y = valueAt(transitions.y, t);
    if ((a === "0" || a === "1") && (b === "0" || b === "1")) {
      checked += 1;
      const expected = (a === "1" && b === "1") ? "1" : "0";
      if (y !== expected) {
        errors.push({
          message: `Signal mismatch at t=${t}${timescale.replace("1", "")}: expected y=${expected}, got y=${y}.`,
          signal: "y",
          time: t
        });
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
  if (allSignals.length === 0) return;

  const preferred = ["clk", "a", "b", "y"];
  const signals = preferred.filter(s => allSignals.includes(s)).concat(allSignals.filter(s => !preferred.includes(s)));

  let maxTime = 1;
  signals.forEach(sig => {
    const arr = transitions[sig] || [];
    if (arr.length) maxTime = Math.max(maxTime, arr[arr.length - 1].time);
  });

  const width = 1100;
  const rowH = 56;
  const top = 28;
  const left = 120;
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

  const checked = data.summary?.checked_timestamps ?? 0;
  const signalCount = data.signals_found?.length ?? Object.keys(data.signals || {}).length ?? 0;
  metrics.innerHTML = `<span>Checker: ${data.checker || "LOCAL_AND_RULE"}</span><span>Errors: ${errors.length}</span><span>Checked points: ${checked}</span><span>Signals: ${signalCount}</span>`;
}

async function runBackend(file) {
  const uploadForm = new FormData();
  uploadForm.append("file", file);

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
  const parsed = parseVCD(currentText);
  const result = localCheckAndRule(parsed);
  showResult({ ...result, checker: "LOCAL_AND_RULE", signals: parsed.transitions });
  renderWaveform(parsed, result.errors || []);
}

async function init() {
  const fileInput = document.getElementById("fileInput");
  const sampleBox = document.getElementById("sampleBox");

  sampleBox.textContent = SAMPLE_VCD;
  currentText = SAMPLE_VCD;
  runLocal();

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    currentText = await file.text();
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
      await runBackend(file);
    } catch (err) {
      showResult({ verdict: "Incorrect", errors: [{ message: err.message }], summary: { checked_timestamps: 0 } });
    }
  });
}

window.addEventListener("DOMContentLoaded", init);
