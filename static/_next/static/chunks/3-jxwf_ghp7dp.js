(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,48161,53138,e=>{"use strict";var t=e.i(56420);let l=(0,t.default)("circle-check-big",[["path",{d:"M21.801 10A10 10 0 1 1 17 3.335",key:"yps3ct"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);e.s(["CheckCircle",0,l],48161);let s=(0,t.default)("triangle-alert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);e.s(["AlertTriangle",0,s],53138)},28623,10252,e=>{"use strict";let t=(0,e.i(56420).default)("sparkles",[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]]);e.s(["Sparkles",0,t],28623);var l=e.i(43476),s=e.i(71645);e.s(["default",0,function({parsedData:e,errors:t=[]}){let n=(0,s.useRef)(null),a=(0,s.useRef)(null),[i,r]=(0,s.useState)(1),[o,d]=(0,s.useState)(0),[c,m]=(0,s.useState)(!1),[u,x]=(0,s.useState)(0);(0,s.useEffect)(()=>{if(!e||!n.current||!a.current)return;let l=n.current,s=l.getContext("2d");if(!s)return;let r=a.current.getBoundingClientRect();l.width=r.width*window.devicePixelRatio,l.height=r.height*window.devicePixelRatio,s.scale(window.devicePixelRatio,window.devicePixelRatio),s.clearRect(0,0,r.width,r.height),s.strokeStyle="rgba(255, 255, 255, 0.05)",s.lineWidth=1;for(let e=0;e<r.width;e+=50)s.beginPath(),s.moveTo(e,0),s.lineTo(e,r.height),s.stroke();for(let e=0;e<r.height;e+=50)s.beginPath(),s.moveTo(0,e),s.lineTo(r.width,e),s.stroke();let d=e.transitions,c=Object.keys(d);if(!c.length)return;let m=["clk","d","q","a","b","y","rst"],u=m.filter(e=>c.includes(e)).concat(c.filter(e=>!m.includes(e))),x=1;u.forEach(e=>{let t=d[e]||[];t.length&&(x=Math.max(x,t[t.length-1].time))});let h=(r.width-120-40)*i,p=e=>120+e/x*h-o,b=new Set(t.map(e=>e.signal));u.forEach((e,t)=>{let l=30+60*t+30,n=l-24,a=b.has(e),i="#38bdf8",o=e.toLowerCase();o.includes("clk")?i="#10b981":o.includes("rst")||"d"===o||"a"===o||"b"===o||"cin"===o||o.includes("sel")?i="#06b6d4":("q"===o||"y"===o||"sum"===o||"cout"===o||o.includes("out"))&&(i="#c084fc"),a&&(i="#f43f5e"),s.fillStyle=i,s.font="bold 13px var(--font-geist-mono), monospace",s.fillText(e,20,l-8),s.strokeStyle="rgba(255, 255, 255, 0.04)",s.lineWidth=1,s.beginPath(),s.moveTo(120,l),s.lineTo(r.width-40,l),s.stroke();let c=d[e]||[];if(!c.length)return;let m=new Set([0,x]);c.forEach(e=>m.add(e.time));let u=Array.from(m).sort((e,t)=>e-t),h=e=>{let t="x";for(let l of c)if(l.time<=e)t=l.value;else break;return t};s.strokeStyle=i,s.lineWidth=a?2.5:2,s.shadowColor=i,s.shadowBlur=8;for(let e=0;e<u.length-1;e++){let t=u[e],a=u[e+1],i="1"===h(t)?n:l,r="1"===h(a)?n:l;s.beginPath(),s.moveTo(p(t),i),s.lineTo(p(a),i),s.stroke(),i!==r&&(s.beginPath(),s.moveTo(p(a),i),s.lineTo(p(a),r),s.stroke())}s.shadowBlur=0})},[e,i,o,t]);let h=()=>m(!1);return(0,l.jsx)("div",{ref:a,className:"w-full h-full relative cursor-grab active:cursor-grabbing",onWheel:e=>{e.preventDefault(),e.deltaY<0?r(e=>Math.min(1.1*e,50)):r(e=>Math.max(e/1.1,.1))},onMouseDown:e=>{m(!0),x(e.clientX)},onMouseMove:e=>{if(!c)return;let t=e.clientX-u;d(e=>Math.max(-500,e-t)),x(e.clientX)},onMouseUp:h,onMouseLeave:h,children:e?(0,l.jsx)("canvas",{ref:n,style:{width:"100%",height:"100%"}}):(0,l.jsx)("div",{className:"absolute inset-0 flex items-center justify-center text-slate-500 font-mono text-sm",children:"No waveform loaded. Upload a VCD file to view the canvas plot."})})}],10252)},35879,e=>{"use strict";var t=e.i(43476),l=e.i(71645),s=e.i(70703),n=e.i(46932),a=e.i(88653),i=e.i(79432),r=e.i(21357),o=e.i(28623),d=e.i(56420);let c=(0,d.default)("download",[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]]);var m=e.i(4139),u=e.i(52330),x=e.i(48161),h=e.i(83967),p=e.i(53138),b=e.i(97142),f=e.i(71567);let g=(0,d.default)("code",[["path",{d:"m16 18 6-6-6-6",key:"eg8j8"}],["path",{d:"m8 6-6 6 6 6",key:"ppft3o"}]]),w=(0,d.default)("chevron-down",[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]]),v=(0,d.default)("loader-circle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);var y=e.i(22016),j=e.i(10252);let k=(0,s.default)(()=>e.A(53096),{loadableGenerated:{modules:[67211]},ssr:!1}),N="http://localhost:8000",_={and_buggy:{label:"AND Gate (Buggy)",checker:"AND",rtl:`module and_gate(a, b, y);
  input a, b;
  output y;
  // BUG: Uses OR instead of AND
  assign y = a | b;
endmodule`,tb:`\`timescale 1ns/1ps
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
    a=0; b=0; #10;
    #10; $finish;
  end
endmodule`},dff:{label:"D Flip-Flop",checker:"DFF",rtl:`module dff(clk, d, q, rst);
  input clk, d, rst;
  output reg q;
  always @(posedge clk) begin
    if (rst) q <= 1'b0;
    else     q <= d;
  end
endmodule`,tb:`\`timescale 1ns/1ps
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
    d=1;
    #5; clk=1; #5; clk=0;
    #10; $finish;
  end

  always #5 clk = ~clk;
endmodule`},full_adder:{label:"Full Adder",checker:"FULL_ADDER",rtl:`module full_adder(a, b, cin, sum, cout);
  input a, b, cin;
  output sum, cout;
  assign sum  = a ^ b ^ cin;
  assign cout = (a & b) | (b & cin) | (a & cin);
endmodule`,tb:`\`timescale 1ns/1ps
module tb_full_adder;
  reg a, b, cin;
  wire sum, cout;

  full_adder dut(.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_full_adder);
    // All 8 input combinations
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
endmodule`},counter:{label:"4-bit Counter",checker:"AND",rtl:`module counter4(clk, rst, count);
  input clk, rst;
  output reg [3:0] count;
  always @(posedge clk or posedge rst) begin
    if (rst) count <= 4'd0;
    else     count <= count + 1;
  end
endmodule`,tb:`\`timescale 1ns/1ps
module tb_counter;
  reg clk, rst;
  wire [3:0] count;

  counter4 dut(.clk(clk), .rst(rst), .count(count));

  initial clk = 0;
  always #5 clk = ~clk;

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_counter);
    rst = 1; #20;
    rst = 0; #200;
    $finish;
  end
endmodule`},mux:{label:"2-to-1 MUX",checker:"MUX2",rtl:`module mux2(d0, d1, sel, y);
  input d0, d1, sel;
  output y;
  assign y = sel ? d1 : d0;
endmodule`,tb:`\`timescale 1ns/1ps
module tb_mux;
  reg d0, d1, sel;
  wire y;

  mux2 dut(.d0(d0), .d1(d1), .sel(sel), .y(y));

  initial begin
    $dumpfile("dump.vcd");
    $dumpvars(0, tb_mux);
    d0=0; d1=1; sel=0; #10;
    d0=1; d1=0; sel=0; #10;
    d0=1; d1=0; sel=1; #10;
    d0=0; d1=1; sel=1; #10;
    #10; $finish;
  end
endmodule`}};function C({line:e}){let l=e.startsWith("✓"),s=e.startsWith("⚠"),n=e.startsWith("✗")||e.toLowerCase().includes("error");return(0,t.jsx)("div",{className:`font-mono text-xs leading-5 whitespace-pre-wrap ${l?"text-emerald-400":s?"text-amber-400":n?"text-red-400":"text-slate-400"}`,children:e})}e.s(["default",0,function(){let[e,s]=(0,l.useState)([{name:"rtl.v",content:_.and_buggy.rtl},{name:"tb.v",content:_.and_buggy.tb}]),[d,S]=(0,l.useState)(0),[A,z]=(0,l.useState)("AND"),[T,M]=(0,l.useState)(["AND","DFF","FULL_ADDER","MUX2"]),[R,$]=(0,l.useState)(""),[L,D]=(0,l.useState)(null),[F,O]=(0,l.useState)(null),[P,E]=(0,l.useState)(!1),[I,U]=(0,l.useState)(!1),[W,q]=(0,l.useState)(null),[B,X]=(0,l.useState)(!1),G=(0,l.useRef)(null);(0,l.useEffect)(()=>{fetch(`${N}/checkers`).then(e=>e.json()).then(e=>{e.supported&&M(e.supported)}).catch(()=>{}),fetch(`${N}/sim/backend_info`).then(e=>e.json()).then(e=>{q(e.backend)}).catch(()=>{})},[]),(0,l.useEffect)(()=>{G.current&&(G.current.scrollTop=G.current.scrollHeight)},[L]);let H=(0,l.useCallback)(e=>{let t=_[e];t&&(s([{name:"rtl.v",content:t.rtl},{name:"tb.v",content:t.tb}]),S(0),z(t.checker),D(null),O(null),X(!1))},[]),V=async()=>{if(!P){E(!0),D(null),O(null);try{let t=await fetch(`${N}/sim/run_custom`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({files:e,checker:A})}),l=await t.json();if(D(l),l.success&&l.vcd){let e,t=await fetch(`${N}/visualize`,{method:"POST",body:((e=new FormData).append("file",new Blob([l.vcd],{type:"text/plain"}),"sim.vcd"),e)}),s=await t.json();O({timescale:s.timescale||"1ns",transitions:s.signals||{}})}}catch(e){D({success:!1,vcd:null,console_output:`Network error: ${String(e)}
Is the backend running on port 8000?`,verdict:"Error",errors:[],error_count:0,signals_found:[],backend:"builtin",checker:A})}finally{E(!1)}}},K=async()=>{if(!I){U(!0);try{let t=await fetch(`${N}/ai/generate_testbench`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rtl_code:e.find(e=>e.name.endsWith(".v")&&!e.name.startsWith("tb"))?.content||"",checker:A,api_key:R})}),l=await t.json();l.testbench_code&&(s(e=>{let t=[...e],s=t.findIndex(e=>"tb.v"===e.name);return s>=0?t[s].content=l.testbench_code:t.push({name:"tb.v",content:l.testbench_code}),t}),S(e.findIndex(e=>"tb.v"===e.name)>=0?e.findIndex(e=>"tb.v"===e.name):e.length))}catch(e){console.error(e)}finally{U(!1)}}},J=L?.verdict==="Correct"?"text-emerald-400 border-emerald-500/30 bg-emerald-500/10":L?.verdict==="Incorrect"?"text-red-400 border-red-500/30 bg-red-500/10":L?"text-amber-400 border-amber-500/30 bg-amber-500/10":"text-slate-500 border-white/10 bg-white/5",Y=(L?.console_output||"").split("\n");return(0,t.jsxs)("div",{className:"flex flex-col h-screen bg-[#030304] text-slate-100 font-sans overflow-hidden",children:[(0,t.jsxs)("nav",{className:"h-14 border-b border-white/5 flex items-center px-6 gap-4 bg-black/30 backdrop-blur-md flex-shrink-0 z-20",children:[(0,t.jsxs)(y.default,{href:"/",className:"flex items-center gap-2.5 group",children:[(0,t.jsx)(n.motion.div,{whileHover:{scale:1.05,rotate:5},className:"w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.25)]",children:(0,t.jsx)(i.Activity,{className:"text-white w-4 h-4"})}),(0,t.jsx)("span",{className:"font-bold text-base bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent",children:"LogicAgent"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-1.5 ml-2",children:[(0,t.jsxs)(y.default,{href:"/",className:"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all",children:[(0,t.jsx)(u.Code2,{className:"w-3.5 h-3.5"})," Verifier"]}),(0,t.jsxs)(y.default,{href:"/agent",className:"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all",children:[(0,t.jsx)(f.Bot,{className:"w-3.5 h-3.5"})," Agent Studio"]}),(0,t.jsxs)("div",{className:"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium",children:[(0,t.jsx)(g,{className:"w-3.5 h-3.5"})," Code Lab"]})]}),(0,t.jsxs)("div",{className:"ml-auto flex items-center gap-3",children:[(0,t.jsx)("input",{id:"api-key-input",type:"password",value:R,onChange:e=>$(e.target.value),placeholder:"Gemini API key (for ✨ AI Gen)",className:"w-52 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-400/50 font-mono"}),W&&(0,t.jsxs)("div",{className:`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono ${"iverilog"===W?"bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.05)]":"bg-amber-500/10 border-amber-500/20 text-amber-400"}`,children:[(0,t.jsx)(b.Cpu,{className:"w-3.5 h-3.5"}),"iverilog"===W?"iverilog":"Built-in Sim"]})]})]}),(0,t.jsx)("div",{className:"flex flex-1 min-h-0",style:{maxHeight:"calc(100vh - 56px)"},children:(0,t.jsxs)("div",{className:"flex flex-col flex-1 min-w-0",children:[(0,t.jsxs)("div",{className:"flex flex-1 min-h-0 border-b border-white/5",style:{height:"55%"},children:[(0,t.jsxs)("div",{className:"w-48 flex flex-col border-r border-white/5 bg-[#030304]",children:[(0,t.jsxs)("div",{className:"flex items-center justify-between px-3 py-2 border-b border-white/5 bg-zinc-950/60",children:[(0,t.jsx)("span",{className:"text-[10px] font-bold text-zinc-400 uppercase tracking-wider",children:"Workspace"}),(0,t.jsx)("button",{onClick:()=>{let t=prompt("Enter file name (e.g., new_module.v):","new_module.v");t&&(s([...e,{name:t,content:""}]),S(e.length))},className:"text-zinc-500 hover:text-cyan-400 transition-colors",title:"New File",children:(0,t.jsx)(o.Sparkles,{className:"w-3.5 h-3.5"})})]}),(0,t.jsx)("div",{className:"flex-1 overflow-y-auto p-2 space-y-1",children:e.map((l,n)=>(0,t.jsxs)("div",{onClick:()=>S(n),className:`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs font-mono transition-colors ${n===d?"bg-cyan-500/10 text-cyan-400 font-semibold":"text-zinc-400 hover:bg-white/5 hover:text-zinc-200"}`,children:[(0,t.jsx)("div",{className:`w-1.5 h-1.5 rounded-full ${l.name.startsWith("tb")?"bg-purple-400":"bg-cyan-400"}`}),l.name,e.length>1&&(0,t.jsx)("button",{onClick:t=>{t.stopPropagation(),confirm(`Delete ${l.name}?`)&&(s(e.filter((e,t)=>t!==n)),d>=n&&d>0&&S(d-1))},className:"ml-auto text-zinc-600 hover:text-red-400 opacity-0 hover:opacity-100 transition-opacity",children:(0,t.jsx)(h.XCircle,{className:"w-3 h-3"})})]},n))})]}),(0,t.jsxs)("div",{className:"flex flex-col flex-1 min-w-0",children:[(0,t.jsxs)("div",{className:"flex items-center gap-4 px-4 py-3 border-b border-white/5 bg-zinc-950/60 flex-shrink-0",children:[(0,t.jsxs)("div",{className:"flex items-center gap-1.5",children:[(0,t.jsx)("span",{className:"w-2.5 h-2.5 rounded-full window-dot-red block"}),(0,t.jsx)("span",{className:"w-2.5 h-2.5 rounded-full window-dot-yellow block"}),(0,t.jsx)("span",{className:"w-2.5 h-2.5 rounded-full window-dot-green block"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-300",children:[(0,t.jsx)("div",{className:`w-1.5 h-1.5 rounded-full ${e[d]?.name.startsWith("tb")?"bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.6)]":"bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.6)]"}`}),e[d]?.name]}),e[d]?.name==="tb.v"&&(0,t.jsx)(n.motion.button,{whileHover:{scale:1.03},whileTap:{scale:.97},onClick:K,disabled:I||0===e.length,className:"ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-all disabled:opacity-40 font-semibold text-[11px] cursor-pointer",children:I?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(v,{className:"w-3.5 h-3.5 animate-spin"})," Writing..."]}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(o.Sparkles,{className:"w-3.5 h-3.5"})," AI Generate Testbench"]})})]}),(0,t.jsxs)("div",{className:"flex-1 min-h-0 relative bg-[#050507]",children:[(0,t.jsx)(a.AnimatePresence,{children:I&&e[d]?.name==="tb.v"&&(0,t.jsx)(n.motion.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},className:"absolute inset-0 z-10 bg-purple-950/30 backdrop-blur-sm flex items-center justify-center",children:(0,t.jsxs)("div",{className:"flex items-center gap-3 text-purple-300 text-xs font-semibold bg-black/60 px-5 py-3 rounded-2xl border border-purple-500/20 shadow-2xl",children:[(0,t.jsx)(o.Sparkles,{className:"w-4 h-4 animate-pulse text-purple-400"}),(0,t.jsx)("span",{children:"Gemini is generating your testbench..."})]})})}),e.length>0&&(0,t.jsx)(k,{height:"100%",defaultLanguage:"verilog",theme:"vs-dark",value:e[d].content,onChange:t=>{let l=[...e];l[d].content=t||"",s(l)},onMount:(e,t)=>{e.addAction({id:"inline-ai-edit",label:"AI Inline Edit",keybindings:[t.KeyMod.CtrlCmd|t.KeyCode.KeyI],run:async e=>{let l=e.getSelection(),s=e.getModel();if(!l||!s)return;let n=l,a=s.getValueInRange(l);""===a.trim()&&(n=new t.Range(l.startLineNumber,1,l.endLineNumber,s.getLineMaxColumn(l.endLineNumber)),a=s.getValueInRange(n));let i=prompt("✨ AI Copilot:\nWhat do you want to change in this code?","Optimize this module");if(!i)return;let r=document.getElementById("api-key-input"),o=r?r.value:"";try{let t=await fetch(`${N}/ai/inline_edit`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({code:s.getValue(),selection:a,instruction:i,api_key:o})}),l=await t.json();l.new_code?e.executeEdits("ai-copilot",[{range:n,text:l.new_code,forceMoveMarkers:!0}]):alert("Failed to generate code.")}catch(e){console.error(e),alert("Error contacting AI server.")}}})},options:{fontSize:13,fontFamily:'"Geist Mono", "Fira Code", monospace',minimap:{enabled:!1},scrollBeyondLastLine:!1,lineNumbers:"on",padding:{top:12,bottom:12},smoothScrolling:!0,renderLineHighlight:"all",readOnly:I}},d)]})]})]}),(0,t.jsxs)("div",{className:"flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-zinc-950/25 flex-shrink-0",children:[(0,t.jsx)(n.motion.button,{whileHover:{scale:1.02,boxShadow:"0 0 20px rgba(6,182,212,0.3)"},whileTap:{scale:.97},onClick:V,disabled:P,className:"flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.2)]",children:P?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(v,{className:"w-4 h-4 animate-spin"})," Simulating..."]}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(r.Play,{className:"w-4 h-4 fill-current"})," Run Simulation"]})}),(0,t.jsxs)("div",{className:"flex items-center gap-2",children:[(0,t.jsx)("span",{className:"text-[11px] text-zinc-500 font-semibold font-mono",children:"Checker:"}),(0,t.jsx)("select",{value:A,onChange:e=>z(e.target.value),className:"bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 transition-all font-semibold",children:Object.entries({"Logic Gates":["AND","OR","XOR","NAND","NOR","XNOR"],Arithmetic:["HALF_ADDER","FULL_ADDER","MUX2"],Sequential:["DFF","T_FF","JK_FF"],Custom:["ASSERTION"]}).map(([e,l])=>(0,t.jsx)("optgroup",{label:e,className:"bg-zinc-950 text-zinc-500",children:l.filter(e=>T.includes(e)||T.length<4).map(e=>(0,t.jsx)("option",{value:e,className:"bg-zinc-950 text-slate-200",children:e},e))},e))})]}),(0,t.jsxs)("button",{onClick:()=>{if(!L?.vcd)return;let e=new Blob([L.vcd],{type:"text/plain"}),t=URL.createObjectURL(e),l=document.createElement("a");l.href=t,l.download="output.vcd",l.click(),URL.revokeObjectURL(t)},disabled:!L?.vcd,className:"flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-cyan-400/30 transition-all disabled:opacity-30 cursor-pointer",children:[(0,t.jsx)(c,{className:"w-3.5 h-3.5"})," Export VCD"]}),(0,t.jsxs)("div",{className:"relative ml-auto",children:[(0,t.jsxs)("button",{onClick:()=>X(e=>!e),className:"flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all cursor-pointer font-semibold",children:["Load Examples ",(0,t.jsx)(w,{className:"w-3 h-3 text-zinc-500"})]}),(0,t.jsx)(a.AnimatePresence,{children:B&&(0,t.jsx)(n.motion.div,{initial:{opacity:0,y:-4,scale:.97},animate:{opacity:1,y:0,scale:1},exit:{opacity:0,y:-4,scale:.97},className:"absolute right-0 bottom-full mb-2 w-52 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 p-1",children:Object.entries(_).map(([e,l])=>(0,t.jsxs)("button",{onClick:()=>H(e),className:"w-full text-left px-3 py-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2 rounded-lg cursor-pointer font-semibold font-mono",children:[(0,t.jsx)("span",{className:"w-1.5 h-1.5 rounded-full bg-cyan-400/60 flex-shrink-0"}),l.label]},e))})})]}),L&&(0,t.jsxs)(n.motion.div,{initial:{opacity:0,x:10},animate:{opacity:1,x:0},className:`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${J}`,children:["Correct"===L.verdict?(0,t.jsx)(x.CheckCircle,{className:"w-4 h-4"}):"Incorrect"===L.verdict?(0,t.jsx)(h.XCircle,{className:"w-4 h-4"}):(0,t.jsx)(p.AlertTriangle,{className:"w-4 h-4"}),L.verdict]})]}),(0,t.jsxs)("div",{className:"flex min-h-0 flex-1",children:[(0,t.jsxs)("div",{className:"w-[380px] flex-shrink-0 border-r border-white/5 flex flex-col bg-[#07070a]",children:[(0,t.jsxs)("div",{className:"flex items-center gap-4 px-4 py-3 border-b border-white/5 bg-zinc-950/60 flex-shrink-0",children:[(0,t.jsxs)("div",{className:"flex items-center gap-1",children:[(0,t.jsx)("span",{className:"w-2 h-2 rounded-full window-dot-red block animate-pulse"}),(0,t.jsx)("span",{className:"w-2 h-2 rounded-full window-dot-yellow block"}),(0,t.jsx)("span",{className:"w-2 h-2 rounded-full window-dot-green block"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-400",children:[(0,t.jsx)(m.Terminal,{className:"w-3.5 h-3.5 text-cyan-400"}),"Console Logs"]}),L&&(0,t.jsxs)("span",{className:"ml-auto text-[10px] text-zinc-500 font-mono font-semibold bg-white/2 px-2 py-0.5 rounded-md border border-white/5",children:[L.error_count," error",1!==L.error_count?"s":""]})]}),(0,t.jsxs)("div",{ref:G,className:"flex-1 overflow-y-auto p-4 space-y-0.5 bg-black/10 select-text",children:[!L&&!P&&(0,t.jsx)("div",{className:"flex items-center justify-center h-full text-center select-none",children:(0,t.jsxs)("div",{children:[(0,t.jsx)(m.Terminal,{className:"w-7 h-7 text-zinc-700 mx-auto mb-2"}),(0,t.jsx)("p",{className:"text-zinc-600 text-xs font-semibold",children:"Simulate to start execution log"})]})}),P&&(0,t.jsxs)("div",{className:"flex items-center gap-2 text-cyan-400 text-xs font-mono",children:[(0,t.jsx)(v,{className:"w-3.5 h-3.5 animate-spin"}),"Running compilation & checks..."]}),L&&Y.map((e,l)=>(0,t.jsx)(C,{line:e},l)),L?.errors&&L.errors.length>0&&(0,t.jsxs)("div",{className:"mt-3 pt-3 border-t border-white/5",children:[(0,t.jsxs)("p",{className:"text-xs text-rose-400 font-bold mb-2 flex items-center gap-1.5",children:[(0,t.jsx)(p.AlertTriangle,{className:"w-3.5 h-3.5"})," Assertion Mismatches (",L.errors.length,"):"]}),L.errors.map((e,l)=>(0,t.jsx)("div",{className:"text-xs text-rose-300/80 font-mono mb-1.5 leading-4 pl-1 border-l border-rose-500/20",children:e.message},l))]})]})]}),(0,t.jsxs)("div",{className:"flex-1 flex flex-col min-w-0 bg-[#050507]",children:[(0,t.jsxs)("div",{className:"flex items-center gap-4 px-4 py-3 border-b border-white/5 bg-zinc-950/60 flex-shrink-0",children:[(0,t.jsxs)("div",{className:"flex items-center gap-1.5",children:[(0,t.jsx)("span",{className:"w-2.5 h-2.5 rounded-full window-dot-red block"}),(0,t.jsx)("span",{className:"w-2.5 h-2.5 rounded-full window-dot-yellow block"}),(0,t.jsx)("span",{className:"w-2.5 h-2.5 rounded-full window-dot-green block"})]}),(0,t.jsxs)("div",{className:"flex items-center gap-1.5 text-xs font-mono font-semibold text-zinc-400",children:[(0,t.jsx)(u.Code2,{className:"w-3.5 h-3.5 text-purple-400"}),"Waveform Analyzer View"]}),L?.signals_found&&L.signals_found.length>0&&(0,t.jsxs)("span",{className:"ml-auto text-[10px] text-zinc-500 font-mono font-semibold bg-white/2 px-2 py-0.5 rounded-md border border-white/5",children:[L.signals_found.length," signals"]})]}),(0,t.jsx)("div",{className:"flex-1 min-h-0 bg-[#050507]",children:(0,t.jsx)(j.default,{parsedData:F,errors:(L?.errors||[]).map(e=>({signal:e.signal||"",time:e.time,message:e.message}))})})]})]})]})})]})}],35879)},53096,e=>{e.v(t=>Promise.all(["static/chunks/231-n4jgd5al1.js"].map(t=>e.l(t))).then(()=>t(67211)))}]);