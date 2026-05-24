const API_BASE = "";

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

const LOCAL_SUPPORTED_CHECKERS = ["AND", "OR", "XOR", "NAND", "NOR", "XNOR", "DFF", "T_FF", "JK_FF"];
let checkerDefinitions = {};
let currentText = "";
let currentParsed = null;
let currentErrors = [];
let timeScale = 1.0;
let timeOffset = 0;
let isPanning = false;
let startPanX = 0;

function initSpotlight() {
  const captures = document.querySelectorAll('.glow-capture');
  captures.forEach(capture => {
    capture.addEventListener('mousemove', (e) => {
      const elements = capture.querySelectorAll('.glow-element');
      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        el.style.setProperty('--mouse-x', `${x}px`);
        el.style.setProperty('--mouse-y', `${y}px`);
      });
    });
  });
}

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

  if (["DFF", "T_FF", "JK_FF"].includes(checker)) {
    const clk = resolve("clk");
    const q = resolve("q");
    const rst = resolve("rst");

    const reqs = { DFF: ["d"], T_FF: ["t"], JK_FF: ["j", "k"] }[checker];
    const inputs = {};
    for (const r of reqs) {
      inputs[r] = resolve(r);
      if (!inputs[r]) errors.push({ message: `Missing ${r} signal for ${checker} check`, signal: r });
    }

    if (!clk || !q || errors.length > 0) {
      if (!clk) errors.push({ message: `Missing clk signal for ${checker} check`, signal: "clk" });
      if (!q) errors.push({ message: `Missing q signal for ${checker} check`, signal: "q" });
      return { verdict: "Incorrect", errors, summary: { checked_edges: 0 } };
    }

    const clkTr = transitions[clk];
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
        const qValBefore = valueAt(qTr, t - 1);
        
        const rstVal = rstTr ? valueAt(rstTr, t) : "0";
        let expected = "x";
        
        if (rstVal === "1") {
          expected = "0";
        } else {
          if (checker === "DFF") {
            expected = valueAt(transitions[inputs["d"]], t);
          } else if (checker === "T_FF") {
            const tVal = valueAt(transitions[inputs["t"]], t);
            if (tVal === "1") expected = qValBefore === "0" ? "1" : (qValBefore === "1" ? "0" : "x");
            else if (tVal === "0") expected = qValBefore;
          } else if (checker === "JK_FF") {
            const jVal = valueAt(transitions[inputs["j"]], t);
            const kVal = valueAt(transitions[inputs["k"]], t);
            if (jVal === "0" && kVal === "0") expected = qValBefore;
            else if (jVal === "0" && kVal === "1") expected = "0";
            else if (jVal === "1" && kVal === "0") expected = "1";
            else if (jVal === "1" && kVal === "1") expected = qValBefore === "0" ? "1" : (qValBefore === "1" ? "0" : "x");
          }
        }
        
        if (expected === "0" || expected === "1") {
          checkedEdges += 1;
          const qValAfter = valueAt(qTr, t);
          if (qValAfter !== expected) {
            errors.push({ message: `${checker} mismatch at t=${t}${timescale.replace("1", "")}: expected q=${expected}, got q=${qValAfter}.`, signal: "q", time: t });
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
  currentParsed = parsed;
  currentErrors = errors;
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

  const plotW = (width - left - right) * timeScale;
  const xOf = (t) => left + (t / maxTime) * plotW - timeOffset;
  const errSignals = new Set(errors.map(e => e.signal).filter(Boolean));

  signals.forEach((sig, idx) => {
    const yBase = top + idx * rowH + 28;
    const yHigh = yBase - 18;
    const yLow = yBase;
    const sigErr = errSignals.has(sig);

    svg.appendChild(createSvgEl("text", {
      x: 14, y: yBase - 4,
      fill: sigErr ? "var(--status-err)" : "var(--text-main)",
      "font-size": 13,
      "font-weight": sigErr ? 700 : 500
    })).textContent = sig;

    svg.appendChild(createSvgEl("line", {
      x1: left, y1: yLow, x2: width - right, y2: yLow,
      stroke: "var(--panel-border)", "stroke-width": 1
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
        stroke: sigErr ? "var(--svg-line-err)" : "var(--svg-line-ok)",
        "stroke-width": 2,
        class: "waveform-line"
      }));

      if (y1 !== y0) {
        svg.appendChild(createSvgEl("line", {
          x1: xOf(t1), y1: y0, x2: xOf(t1), y2: y1,
          stroke: sigErr ? "var(--svg-line-err)" : "var(--svg-line-ok)",
          "stroke-width": 2,
          class: "waveform-line"
        }));
      }
    }
  });

  const catchArea = createSvgEl("rect", { x: 0, y: 0, width: width, height: height, fill: "transparent" });
  svg.appendChild(catchArea);

  const crosshairGroup = createSvgEl("g", { id: "crosshair", style: "display: none;" });
  const crosshairLine = createSvgEl("line", { x1: 0, y1: 0, x2: 0, y2: height, stroke: "var(--accent-primary)", "stroke-width": 1, "stroke-dasharray": "4 4" });
  const crosshairText = createSvgEl("text", { x: 5, y: 15, fill: "var(--text-main)", "font-size": 12, "font-weight": "bold" });
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
      const t = ((ex - left + timeOffset) / plotW) * maxTime;
      if (t >= 0 && t <= maxTime) {
        crosshairText.setAttribute("x", ex + 5);
        crosshairText.textContent = `t=${Math.round(t)}`;
      }
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
  const verdictBanner = document.getElementById("verdictBanner");
  const errorList = document.getElementById("errorList");
  const errorListContainer = document.getElementById("errorListContainer");
  const metrics = document.getElementById("metrics");
  const explainBtn = document.getElementById("explainBtn");
  const explanationBox = document.getElementById("explanationBox");

  verdictEl.textContent = `${data.verdict}`;
  if (verdictBanner) {
    verdictBanner.className = "verdict-banner " + (data.verdict === "Correct" ? "ok" : "bad");
  }

  if (explanationBox) {
    explanationBox.style.display = "none";
    explanationBox.textContent = "";
  }

  errorList.innerHTML = "";
  const errors = data.errors || [];
  
  if (explainBtn) {
    explainBtn.style.display = errors.length > 0 ? "flex" : "none";
  }

  if (errorListContainer) {
    errorListContainer.style.display = errors.length > 0 ? "block" : "none";
  }

  if (!errors.length) {
    // No errors
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

  metrics.innerHTML = `<span><strong>Checker:</strong> ${data.checker || "LOCAL"}</span><span><strong>Errors:</strong> ${errors.length}</span><span><strong>Checked:</strong> ${checked}</span><span><strong>Signals:</strong> ${signalCount}</span>`;
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
  
  if (checker === "ASSERTION") {
    uploadForm.append("assertion_str", document.getElementById("customAssertion").value);
  }
  
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
  if (checker === "ASSERTION") {
    showResult({ verdict: "Incorrect", errors: [{ message: "Local verification is not supported for custom assertions. Please use 'Run Backend Verify'." }], summary: { checked_timestamps: 0 } });
    return;
  }
  
  const signalMap = getSignalMapFromInputs();
  const parsed = parseVCD(currentText);
  const result = localCheck(parsed, checker, signalMap);
  showResult({ ...result, checker: `LOCAL_${checker}`, signals: parsed.transitions });
  renderWaveform(parsed, result.errors || []);
}

async function init() {
  initSpotlight();
  const fileInput = document.getElementById("fileInput");
  const sampleBox = document.getElementById("sampleBox");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  const savedTheme = localStorage.getItem("theme") || "dark";
  if (savedTheme === "light") {
    document.body.setAttribute("data-theme", "light");
    themeToggleBtn.textContent = "Light";
  }

  themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.getAttribute("data-theme") === "light";
    if (isLight) {
      document.body.removeAttribute("data-theme");
      themeToggleBtn.textContent = "Dark";
      localStorage.setItem("theme", "dark");
    } else {
      document.body.setAttribute("data-theme", "light");
      themeToggleBtn.textContent = "Light";
      localStorage.setItem("theme", "light");
    }
  });

  const globalApiKeyInput = document.getElementById("globalApiKey");
  if (globalApiKeyInput) {
    globalApiKeyInput.value = localStorage.getItem("geminiApiKey") || "";
    globalApiKeyInput.addEventListener("input", (e) => {
      localStorage.setItem("geminiApiKey", e.target.value.trim());
    });
  }

  const wrap = document.getElementById("waveformWrap");
  wrap.addEventListener("wheel", (e) => {
    if (!currentParsed) return;
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) timeScale *= zoomFactor;
    else timeScale /= zoomFactor;
    timeScale = Math.max(0.1, Math.min(timeScale, 100));
    renderWaveform(currentParsed, currentErrors);
  });

  wrap.addEventListener("mousedown", (e) => {
    isPanning = true;
    startPanX = e.clientX;
    wrap.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!isPanning || !currentParsed) return;
    const dx = e.clientX - startPanX;
    timeOffset -= dx;
    startPanX = e.clientX;
    // Keep offset bounds reasonable
    timeOffset = Math.max(-500, timeOffset);
    renderWaveform(currentParsed, currentErrors);
  });

  window.addEventListener("mouseup", () => {
    isPanning = false;
    wrap.style.cursor = "default";
  });

  await loadCheckers();

  sampleBox.textContent = SAMPLE_VCD;
  currentText = SAMPLE_VCD;
  runLocal();

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const btnText = document.querySelector(".file-upload-btn");
    if(btnText) btnText.textContent = file.name;
    currentText = await file.text();
  });

  document.getElementById("checkerSelect").addEventListener("change", () => {
    const isAssertion = selectedChecker() === "ASSERTION";
    document.getElementById("customAssertion").style.display = isAssertion ? "block" : "none";
    updateMappingGrid();
    if (!currentText.trim()) return;
    if (!isAssertion) runLocal();
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

  const autoMapBtn = document.getElementById("autoMapBtn");
  if (autoMapBtn) {
    autoMapBtn.addEventListener("click", async () => {
      if (!currentParsed || !currentParsed.transitions) {
        return alert("Upload or load a VCD file first.");
      }
      const signals = Object.keys(currentParsed.transitions);
      const checker = selectedChecker();
      
      autoMapBtn.textContent = "Auto Map";
      try {
        const res = await fetch(`${API_BASE}/smart/map_signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals, checker, api_key: document.getElementById("globalApiKey")?.value.trim() })
        });
        const data = await res.json();
        if (data.mapping) {
          Object.entries(data.mapping).forEach(([k, v]) => {
            const input = document.getElementById(`map_${k}`);
            if (input) input.value = v;
          });
          runLocal();
        }
      } catch (err) {
        console.error(err);
        alert("Failed to auto map signals");
      } finally {
        autoMapBtn.textContent = "Auto Map";
      }
    });
  }

  const uploadWcfgBtn = document.getElementById("uploadWcfgBtn");
  const wcfgInput = document.getElementById("wcfgInput");

  if (uploadWcfgBtn && wcfgInput) {
    uploadWcfgBtn.addEventListener("click", () => {
      wcfgInput.click();
    });

    wcfgInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);

      uploadWcfgBtn.textContent = "Loading...";
      try {
        const res = await fetch(`${API_BASE}/upload_wcfg`, {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        if (!data.signals || data.signals.length === 0) {
          throw new Error("No signals found in the WCFG file.");
        }

        const checker = selectedChecker();
        const mapRes = await fetch(`${API_BASE}/smart/map_signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signals: data.signals, checker, api_key: document.getElementById("globalApiKey")?.value.trim() })
        });
        
        const mapData = await mapRes.json();
        if (mapData.mapping) {
          Object.entries(mapData.mapping).forEach(([k, v]) => {
            const input = document.getElementById(`map_${k}`);
            if (input) input.value = v;
          });
          runLocal();
        } else {
          alert("Parsed WCFG but failed to auto-map the signals.");
        }
      } catch (err) {
        console.error(err);
        alert(`Failed to load .wcfg: ${err.message}`);
      } finally {
        uploadWcfgBtn.textContent = "Load .wcfg";
        wcfgInput.value = ""; // Reset input
      }
    });
  }

  const explainBtn = document.getElementById("explainBtn");
  if (explainBtn) {
    explainBtn.addEventListener("click", async () => {
      const explanationBox = document.getElementById("explanationBox");
      
      explainBtn.textContent = "Explaining...";
      try {
        const res = await fetch(`${API_BASE}/smart/explain_error`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checker: selectedChecker(), errors: currentErrors, api_key: document.getElementById("globalApiKey")?.value.trim() })
        });
        const data = await res.json();
        explanationBox.style.display = "block";
        explanationBox.textContent = data.explanation || "No explanation available.";
      } catch (err) {
        console.error(err);
        alert("Failed to fetch explanation");
      } finally {
        explainBtn.textContent = "Explain Error";
      }
    });
  }

  const debugAnalyzeBtn = document.getElementById("debugAnalyzeBtn");
  if (debugAnalyzeBtn) {
    debugAnalyzeBtn.addEventListener("click", async () => {
      const fileInput = document.getElementById("debugArtifactInput");
      const outputBox = document.getElementById("debugOutputBox");
      const file = fileInput.files?.[0];
      
      if (!file) {
        alert("Please select an image or text file first.");
        return;
      }
      
      const btnText = document.querySelector(".debug-file-input");
      if(btnText && file.name) btnText.title = file.name;

      debugAnalyzeBtn.textContent = "Analyzing...";
      outputBox.style.display = "none";
      
      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", document.getElementById("globalApiKey")?.value.trim() || "");
      
      try {
        const res = await fetch(`${API_BASE}/smart/debug_assistant`, {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        
        outputBox.style.display = "block";
        if (res.ok) {
          outputBox.textContent = data.analysis || "No analysis returned.";
        } else {
          outputBox.textContent = `Error: ${data.error || "Failed to analyze artifact."}`;
        }
      } catch (err) {
        console.error(err);
        outputBox.style.display = "block";
        outputBox.textContent = `Error: ${err.message}`;
      } finally {
        debugAnalyzeBtn.textContent = "Ask Debug Assistant";
      }
    });
  }

  // --- Tab Switching Logic ---
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll("[data-tab-content]");

  // Default to dashboard
  tabContents.forEach(content => {
    if (content.getAttribute("data-tab-content") === "dashboard") {
      content.classList.add("active-tab");
    } else {
      content.classList.remove("active-tab");
    }
  });

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // Remove active class from all tabs
      tabBtns.forEach(b => b.classList.remove("active"));
      // Add active class to clicked tab
      btn.classList.add("active");
      
      const targetTab = btn.getAttribute("data-tab");
      
      // Show/Hide content based on data-tab-content
      tabContents.forEach(content => {
        if (content.getAttribute("data-tab-content") === targetTab) {
          content.classList.add("active-tab");
        } else {
          content.classList.remove("active-tab");
        }
      });
      
      // If switching to dashboard, re-render waveform to fix potential SVG dimension issues
      if (targetTab === "dashboard" && currentParsed) {
        setTimeout(() => {
          renderWaveform(currentParsed, currentErrors);
        }, 50);
      }
    });
  });

  // --- AI Chatbot Logic ---
  const sendChatBtn = document.getElementById("sendChatBtn");
  const chatInput = document.getElementById("chatInput");
  const chatHistory = document.getElementById("chatHistory");

  if (sendChatBtn && chatInput && chatHistory) {
    const appendChatMsg = (text, isUser) => {
      const msgDiv = document.createElement("div");
      msgDiv.className = `chat-msg ${isUser ? 'user-msg' : 'bot-msg'}`;
      if (typeof marked !== 'undefined') {
        msgDiv.innerHTML = marked.parse(text);
      } else {
        msgDiv.textContent = text;
      }
      
      chatHistory.appendChild(msgDiv);
      chatHistory.scrollTop = chatHistory.scrollHeight;
    };

    const handleChatSend = async () => {
      const msg = chatInput.value.trim();
      if (!msg) return;
      
      appendChatMsg(msg, true);
      chatInput.value = "";
      sendChatBtn.disabled = true;
      sendChatBtn.textContent = "...";
      
      try {
        const res = await fetch(`${API_BASE}/smart/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, api_key: document.getElementById("globalApiKey")?.value.trim() })
        });
        const data = await res.json();
        
        if (res.ok) {
          appendChatMsg(data.response, false);
        } else {
          appendChatMsg(`Error: ${data.error}`, false);
        }
      } catch (err) {
        appendChatMsg(`Error: ${err.message}`, false);
      } finally {
        sendChatBtn.disabled = false;
        sendChatBtn.textContent = "Send";
      }
    };

    sendChatBtn.addEventListener("click", handleChatSend);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleChatSend();
    });
  }

  // Initialize the Autonomous Agent Console bindings
  await initAgentConsole();
}

let agentTemplates = {};
let originalVerilog = "";

async function initAgentConsole() {
  const runAgentBtn = document.getElementById("runAgentBtn");
  const agentLogs = document.getElementById("agentLogs");
  const agentCodeEditor = document.getElementById("agentCodeEditor");
  const agentGoal = document.getElementById("agentGoal");
  const agentConsoleCard = document.getElementById("agentConsoleCard");
  const agentDiffPanel = document.getElementById("agentDiffPanel");
  const diffOriginal = document.getElementById("diffOriginal");
  const diffCorrected = document.getElementById("diffCorrected");
  const resetCodeTemplate = document.getElementById("resetCodeTemplate");
  
  // Load templates from endpoint
  try {
    const res = await fetch(`${API_BASE}/agent/templates`);
    if (res.ok) {
      agentTemplates = await res.json();
    }
  } catch(e) {
    console.error("Failed to load agent templates", e);
  }
  
  // Setup quick selects
  document.querySelectorAll(".template-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-template");
      const tmpl = agentTemplates[type];
      if (tmpl) {
        agentCodeEditor.value = tmpl.code;
        agentGoal.value = tmpl.goal;
        originalVerilog = tmpl.code;
        
        // Auto-select corresponding checker in selector dropdown
        const select = document.getElementById("checkerSelect");
        if (select) {
          select.value = type;
          // Trigger change event to update matching checker parameters
          select.dispatchEvent(new Event("change"));
        }
        
        // Hide previous diff panel
        agentDiffPanel.style.display = "none";
        
        // Clear logs to default template status
        agentLogs.innerHTML = `
          <div class="agent-log-item" style="color: var(--text-muted);">
            <span class="log-bullet" style="color: var(--status-waiting);">*</span>
            <span class="log-text">Template loaded. Ready to initiate autonomous debug verification loop.</span>
          </div>`;
      }
    });
  });

  resetCodeTemplate.addEventListener("click", () => {
    const checker = selectedChecker();
    const tmpl = agentTemplates[checker];
    if (tmpl) {
      agentCodeEditor.value = tmpl.code;
      originalVerilog = tmpl.code;
      agentDiffPanel.style.display = "none";
    }
  });

  runAgentBtn.addEventListener("click", async () => {
    const goal = agentGoal.value.trim();
    const code = agentCodeEditor.value.trim();
    const checker = selectedChecker();
    const apiKey = document.getElementById("globalApiKey")?.value.trim() || "";
    
    if (!goal || !code) {
      alert("Please define a verification goal and write or select Verilog code first.");
      return;
    }
    
    // Clear existing logs
    agentLogs.innerHTML = "";
    agentDiffPanel.style.display = "none";
    originalVerilog = code; // Lock original code for comparison
    
    // Add pulsing neon agent state glow
    agentConsoleCard.classList.add("agent-running-glow");
    runAgentBtn.disabled = true;
    runAgentBtn.innerHTML = `<span>Running</span> Verification loop active...`;
    
    const appendLog = (type, text) => {
      const item = document.createElement("div");
      item.className = `agent-log-item ${type}`;
      
      let bulletColor = "var(--accent-primary)";
      if (type === "log-thought") bulletColor = "var(--accent-primary)";
      else if (type === "log-tool") bulletColor = "var(--accent-secondary)";
      else if (type === "log-code") bulletColor = "var(--status-ok)";
      else if (type === "log-error") bulletColor = "var(--status-err)";
      else if (type === "log-finish") bulletColor = "var(--status-ok)";
      
      item.innerHTML = `
        <span class="log-bullet" style="color: ${bulletColor};">*</span>
        <span class="log-text">${text}</span>
      `;
      agentLogs.appendChild(item);
      // Auto-scroll log viewport
      agentLogs.parentElement.scrollTop = agentLogs.parentElement.scrollHeight;
    };
    
    appendLog("log", "Establishing session with autonomous verifier agent...");
    
    try {
      const sessionRes = await fetch(`${API_BASE}/agent/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, checker, goal, api_key: apiKey })
      });
      
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) {
        throw new Error(sessionData.error || "Failed to initialize agent session");
      }
      
      const sessionId = sessionData.session_id;
      appendLog("log", `Session established (ID: ${sessionId}). Connecting EventSource stream...`);
      
      const eventSource = new EventSource(`${API_BASE}/agent/run/${sessionId}`);
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case "start":
            appendLog("log", `Agent Core: ${data.message}`);
            break;
            
          case "log":
            appendLog("log", `[Step ${data.step}] ${data.message}`);
            break;
            
          case "thought":
            appendLog("log-thought", `<strong>Reasoning & Plan:</strong><br>${data.message}`);
            break;
            
          case "tool_call":
            appendLog("log-tool", `Executing tool: <strong>${data.tool}</strong>`);
            break;
            
          case "tool_response":
            const isSuccess = data.response.includes("SUCCESS") || data.response.includes("passed");
            const classType = isSuccess ? "log-code" : (data.response.includes("FAILURE") || data.response.includes("COMPLETED WITH MISMATCHES") ? "log-error" : "log");
            appendLog(classType, `Tool Output (${data.tool}):<br><pre style="margin: 4px 0 0 0; font-size: 0.8rem; overflow-x: auto; font-family: monospace;">${data.response}</pre>`);
            break;
            
          case "code_change":
            appendLog("log-code", `Code updated. Diff generated in editor.`);
            agentCodeEditor.value = data.code;
            break;
            
          case "error":
            appendLog("log-error", `Execution Failure: ${data.message}`);
            eventSource.close();
            cleanup();
            break;
            
          case "finish":
            appendLog("log-finish", `${data.message}`);
            eventSource.close();
            
            // Populate and expose code diff structures
            diffOriginal.textContent = originalVerilog;
            diffCorrected.textContent = data.code;
            agentDiffPanel.style.display = "block";
            
            // Force editor updates
            agentCodeEditor.value = data.code;
            
            // Auto-refresh main waveform viewer
            const sim = data.sim_result || {};
            if (sim.success && sim.vcd) {
              const parsedVcd = parseVCD(sim.vcd);
              renderWaveform(parsedVcd, sim.verify_results?.errors || []);
              showResult(sim.verify_results || {});
            }
            
            cleanup();
            break;
        }
      };
      
      eventSource.onerror = (err) => {
        console.error("SSE Disconnect:", err);
        appendLog("log-error", "Connection lost. Checking for agent exit code...");
        eventSource.close();
        cleanup();
      };
      
    } catch (err) {
      appendLog("log-error", `Error: ${err.message}`);
      cleanup();
    }
    
    function cleanup() {
      agentConsoleCard.classList.remove("agent-running-glow");
      runAgentBtn.disabled = false;
      runAgentBtn.innerHTML = `<span>Start</span> Initiate Autonomous Debug Loop`;
    }
  });
  
  // Set default buggy example
  setTimeout(() => {
    const andBtn = document.querySelector('.template-btn[data-template="AND"]');
    if (andBtn) andBtn.click();
  }, 500);
}

window.addEventListener("DOMContentLoaded", init);

