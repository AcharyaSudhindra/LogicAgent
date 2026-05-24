from typing import Dict, List, Any


def append_transition(transitions: Dict[str, List[Dict[str, Any]]], signal: str, t: int, value: str) -> None:
    transitions.setdefault(signal, [])
    if not transitions[signal]:
        transitions[signal].append({"time": t, "value": value})
        return

    last = transitions[signal][-1]
    if last["time"] == t:
        last["value"] = value
    elif last["value"] != value:
        transitions[signal].append({"time": t, "value": value})


def parse_vcd_text(vcd_text: str, default_timescale: str = "1ns") -> Dict[str, Any]:
    id_to_signal: Dict[str, str] = {}
    transitions: Dict[str, List[Dict[str, Any]]] = {}
    current_time = 0
    timescale = default_timescale

    lines = vcd_text.splitlines()
    collecting_timescale = False
    timescale_buf: List[str] = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue

        if line.startswith("$timescale"):
            if "$end" in line:
                ts = line.replace("$timescale", "").replace("$end", "").strip()
                if ts:
                    timescale = ts
            else:
                collecting_timescale = True
                timescale_buf = []
            continue

        if collecting_timescale:
            if "$end" in line:
                collecting_timescale = False
                ts_part = line.replace("$end", "").strip()
                if ts_part:
                    timescale_buf.append(ts_part)
                ts = " ".join(timescale_buf).strip()
                if ts:
                    timescale = ts
            else:
                timescale_buf.append(line)
            continue

        if line.startswith("$var"):
            parts = line.split()
            if len(parts) >= 5:
                identifier = parts[3]
                signal_name = parts[4]
                id_to_signal[identifier] = signal_name
                transitions.setdefault(signal_name, [])
            continue

        if line.startswith("#"):
            try:
                current_time = int(line[1:].strip())
            except ValueError:
                pass
            continue

        if line[0] in "01xXzZ" and len(line) >= 2:
            value = line[0].lower()
            identifier = line[1:].strip()
            signal = id_to_signal.get(identifier)
            if signal:
                append_transition(transitions, signal, current_time, value)
            continue

        if line[0] in "bBrR":
            parts = line.split()
            if len(parts) == 2:
                value = parts[0][1:].lower()
                identifier = parts[1]
                signal = id_to_signal.get(identifier)
                if signal:
                    append_transition(transitions, signal, current_time, value)
            continue

    return {
        "timescale": timescale,
        "identifiers": id_to_signal,
        "transitions": transitions,
    }
