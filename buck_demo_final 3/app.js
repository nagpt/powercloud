// Buck Converter interactive demo (v1.0)
// - White theme, larger text
// - Two plots (voltage/current) with colorful traces
// - Sliders + numbers update live
// - Click a component to add its voltage, Cmd/Ctrl+Click to add its current

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const params = {
  Vi: 12,
  fsw: 300,
  D: 0.5,
  L: 10,
  C: 100,
  R: 5,
  periods: 2,
};

// ---------- UI helpers ----------
function bindParam(id, key) {
  const range = $("#" + id);
  const num   = $("#" + id + "_num");
  const set = (v)=>{ range.value=v; num.value=v; };
  set(params[key]);

  const onRange = ()=>{ params[key] = parseFloat(range.value); num.value = range.value; updateWaveforms(); };
  const onNum   = ()=>{ const v=parseFloat(num.value); if(!isFinite(v)) return; params[key]=v; range.value=v; updateWaveforms(); };
  range.addEventListener("input", onRange);
  num.addEventListener("input", onNum);
  num.addEventListener("change", onNum);
}

function initUI(){
  bindParam("Vi","Vi");
  bindParam("fsw","fsw");
  bindParam("duty","D");
  bindParam("Lval","L");
  bindParam("Cval","C");
  bindParam("Rval","R");
  $("#twoPeriods").addEventListener("change", updateWaveforms);
  $("#reset-btn").addEventListener("click", ()=>{
    Object.assign(params, {Vi:12, fsw:300, D:0.5, L:10, C:100, R:5, periods:2});
    initUI(); updateWaveforms();
  });

  // checkbox changes
  $$(".wf-v, .wf-i").forEach(cb=> cb.addEventListener("change", updateWaveforms));

  // Probe clicks on SVG (Cmd/Ctrl adds current, Click adds voltage)
  $("#buck-svg").addEventListener("click", (e)=>{
    const comp = e.target.closest(".component");
    if(!comp) return;
    const isCurrent = e.metaKey || e.ctrlKey;
    const key = isCurrent ? comp.dataset.current : comp.dataset.voltage;
    toggleSelection(key);
    comp.classList.add("highlight");
    setTimeout(()=>comp.classList.remove("highlight"), 400);
  });
}

function toggleSelection(key){
  // toggle any checkbox with matching value; search both voltage and current groups
  const cb = $$('.wf-v, .wf-i').find(x=>x.value===key);
  if (cb){ cb.checked = !cb.checked; updateWaveforms(); }
}

// ---------- Model ----------
function compute(){
  const Vi = params.Vi;
  const D  = Math.min(0.95, Math.max(0.05, params.D));
  const fsw = params.fsw*1e3;
  const Ts  = 1/fsw;
  const L   = params.L*1e-6;
  const C   = params.C*1e-6;
  const R   = Math.max(params.R, 1e-6);

  const periods = Math.max(1, Math.min(10, Math.round(params.periods)));
  const N = 1600;
  const t = new Float64Array(N);
  const Vo = D*Vi;
  const Io = Vo/R;

  const il = new Float64Array(N);
  const ic = new Float64Array(N);
  const vout = new Float64Array(N);
  const vsw  = new Float64Array(N);
  const isw  = new Float64Array(N);
  const id   = new Float64Array(N);
  const vl   = new Float64Array(N);

  const di_on  = (Vi-Vo)/L * (D*Ts);
  const di_off = (-Vo)/L   * ((1-D)*Ts);
  const dIL    = di_on;
  const ILavg  = Io;
  const ILmin  = ILavg - dIL/2;
  const ILmax  = ILavg + dIL/2;

  for (let k=0;k<N;k++){
    const tt = k/(N-1) * (periods*Ts);
    t[k]=tt;
    const ph = (tt % Ts)/Ts;

    if (ph < D){
      const local = ph/D;
      il[k] = ILmin + dIL*local;
      vsw[k] = Vi;
      isw[k] = il[k];
      id[k]  = 0;
    } else {
      const local = (ph-D)/(1-D);
      il[k] = ILmax + di_off*local;
      vsw[k] = 0;
      isw[k] = 0;
      id[k]  = il[k];
    }
    vl[k] = vsw[k] - Vo;
    ic[k] = il[k] - Io;
  }

  // integrate capacitor current to get output ripple (zero-mean over trace)
  const dt = (periods*Ts)/(N-1);
  let vc=0;
  for (let k=0;k<N;k++){ vc += (ic[k]/C)*dt; vout[k]=Vo+vc; }
  const mean = vout.reduce((a,b)=>a+b,0)/N;
  for (let k=0;k<N;k++) vout[k]+= (Vo-mean);

  return { t, v_o:vout, v_sw:vsw, v_l:vl, v_in:new Float64Array(N).fill(Vi),
           i_l:il, i_c:ic, i_d:id, i_sw:isw };
}

// ---------- Plotting ----------
function niceStep(min, max, targetCount=5){
  const span = Math.max(1e-12, max - min);
  const raw = span / targetCount;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 2.5, 5, 10].map(c=>c*pow);
  // preference to 5-ish
  let best = candidates[0], bestDiff = Math.abs(raw - best);
  for (const c of candidates){
    const d = Math.abs(raw - c);
    if (c===5*pow) { best=c; break; }
    if (d < bestDiff){ best = c; bestDiff = d; }
  }
  return best;
}
function makeTicks(min, max, step){
  const start = Math.ceil(min/step)*step;
  const ticks = [];
  for(let v=start; v<=max+1e-12; v+=step){ ticks.push(+v.toFixed(10)); }
  return ticks;
}
const VCOLORS = { v_o:"#ef4444", v_sw:"#3b82f6", v_l:"#10b981", v_in:"#7c3aed"};
const ICOLORS = { i_l:"#f59e0b", i_c:"#06b6d4", i_d:"#ec4899", i_sw:"#8b5cf6"};

let HOVER_KEY = null;
function drawPlot(ctx, canvas, series, yMin, yMax, t){
  const W = canvas.width, H=canvas.height;
  const padL=48, padR=12, padT=12, padB=28;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  ctx.clearRect(0,0,W,H);
  // bg
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);

  // grid + ticks
  ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=1;
  // vertical time grid
  const xStep = (t[t.length-1]-t[0]) / 8;
  for(let i=0;i<=8;i++){ const x=padL+plotW*i/8; ctx.beginPath(); ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH); ctx.stroke();
    const tt = t[0] + xStep*i; ctx.fillStyle="#475569"; ctx.font="12px system-ui"; ctx.textAlign="center"; ctx.textBaseline="top"; ctx.fillText(tt.toExponential(1).replace("e-6","µs"), x, H-24);
  }
  // y grid using nice 5s step
  const yStep = niceStep(yMin, yMax, 5);
  const yticks = makeTicks(yMin, yMax, yStep);
  yticks.forEach(v=>{ const y = y2px(v); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y); ctx.stroke();
    ctx.fillStyle="#475569"; ctx.font="12px system-ui"; ctx.textAlign="right"; ctx.textBaseline="middle"; ctx.fillText(v.toFixed( (Math.abs(yStep)<1)? 2:0 ), padL-6, y);
  });

  const xmin=0, xmax=t[t.length-1];
  const x2px=(x)=> padL + (x-xmin)/(xmax-xmin)*plotW;
  const y2px=(y)=> padT + (1-(y-yMin)/(yMax-yMin))*plotH;

  // zero line
  if (yMin<0 && yMax>0){ ctx.strokeStyle="#94a3b8"; ctx.beginPath(); const zy=y2px(0); ctx.moveTo(padL,zy); ctx.lineTo(padL+plotW,zy); ctx.stroke(); }

  // series
  Object.entries(series).forEach(([name, arr])=>{
    if(!arr) return;
    const color = VCOLORS[name] || ICOLORS[name] || "#111827";
    ctx.strokeStyle=color; ctx.lineWidth=(name===HOVER_KEY?3:2); ctx.shadowColor=(name===HOVER_KEY?color:"transparent"); ctx.shadowBlur=(name===HOVER_KEY?8:0);
    ctx.beginPath();
    for(let k=0;k<arr.length;k++){
      const x=x2px(t[k]), y=y2px(arr[k]);
      if(k===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  });

  // axes labels
  ctx.fillStyle="#334155"; ctx.font="12.5px system-ui, -apple-system";
  ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText("t (s)", padL+plotW/2, H-22);

  // hover -> pick nearest series
  canvas.onmousemove = (ev)=>{
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    if (mx<padL || mx>padL+plotW || my<padT || my>padT+plotH){ HOVER_KEY=null; return; }
    const x = (mx - padL)/plotW * (t[t.length-1]-t[0]) + t[0];
    const idx = Math.max(0, Math.min(t.length-1, Math.round( (x - t[0])/(t[t.length-1]-t[0]) * (t.length-1) )));
    let bestKey=null, bestDist=Infinity;
    for (const [name, arr] of Object.entries(series)){ if(!arr) continue; const d = Math.abs( y2px(arr[idx]) - my ); if (d<bestDist){ bestDist=d; bestKey=name; } }
    HOVER_KEY = bestKey;
    const items = document.querySelectorAll('#legend .item'); items.forEach(i=>{ i.classList.toggle('glow', i.dataset.key===HOVER_KEY); });
    drawPlot(ctx, canvas, series, yMin, yMax, t);
  };
  canvas.onmouseleave = ()=>{ HOVER_KEY=null; const items = document.querySelectorAll('#legend .item'); items.forEach(i=>i.classList.remove('glow')); drawPlot(ctx, canvas, series, yMin, yMax, t); };

}

function updateWaveforms(){
  const wf = compute();
  const t = wf.t;

  const chosenV = $$(".wf-v:checked").map(x=>x.value);
  const chosenI = $$(".wf-i:checked").map(x=>x.value);

  const seriesV = {}; const seriesI = {};
  chosenV.forEach(k=> seriesV[k]=wf[k]);
  chosenI.forEach(k=> seriesI[k]=wf[k]);

  // y ranges
  const valsV = Object.values(seriesV).flatMap(a => Array.from(a));
let vMin = valsV.length? Math.min(...valsV, 0)*1.1 : 0;
let vMax = valsV.length? Math.max(...valsV, params.Vi)*1.1 : params.Vi;
if (!isFinite(vMin) || !isFinite(vMax)) { vMin = 0; vMax = Math.max(1, params.Vi); }
if (vMin>=vMax) vMax=vMin+1;

  const valsI = Object.values(seriesI).flatMap(a => Array.from(a));
let iMin = valsI.length? Math.min(...valsI, -1)*1.1 : -1;
let iMax = valsI.length? Math.max(...valsI,  1)*1.1 :  1;
if (!isFinite(iMin) || !isFinite(iMax)) { iMin = -1; iMax = 1; }
if (iMin>=iMax) iMax=iMin+1;

  // canvases
  const vctx = $("#plot-voltage").getContext("2d");
  const ictx = $("#plot-current").getContext("2d");
  drawPlot(vctx, $("#plot-voltage"), seriesV, vMin, vMax, t);
  drawPlot(ictx, $("#plot-current"), seriesI, iMin, iMax, t);

  // legend
  const legend = $("#legend");
  legend.innerHTML = "";
  [...chosenV, ...chosenI].forEach(name=>{
    const item=document.createElement("div"); item.className="item"; item.dataset.key=name;
    const sw = document.createElement("div"); sw.className="swatch";
    const color = VCOLORS[name] || ICOLORS[name] || "#111827"; sw.style.background = color; item.style.color=color;
    const lbl=document.createElement("div"); lbl.textContent = name;
    item.appendChild(sw); item.appendChild(lbl);
    item.onmouseenter = ()=>{ HOVER_KEY=name; legend.querySelectorAll('.item').forEach(i=>i.classList.toggle('glow', i===item)); updateWaveforms(); };
    item.onmouseleave = ()=>{ HOVER_KEY=null; legend.querySelectorAll('.item').forEach(i=>i.classList.remove('glow')); updateWaveforms(); };
    legend.appendChild(item);
  });
}

// init
initUI();
updateWaveforms();
