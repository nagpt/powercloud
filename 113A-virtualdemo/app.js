// Basic waveform engine for an ideal Buck in CCM.
// We render with a custom canvas plotter for zero dependencies.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const params = {
  Vi: 12,        // V
  fsw: 300,      // kHz
  D: 0.5,        // 0..1
  L: 10,         // uH
  C: 100,        // uF
  R: 5,          // ohm
  twoPeriods: true
};

// UI binding helpers
function bindParam(id, key, scale=1) {
  const range = $("#" + id);
  const num   = $("#" + id + "_num");
  const setBoth = (val) => { const v = isFinite(val)? val : 0; range.value = v; num.value = v; };

  // initialize
  setBoth(params[key]);

  range.addEventListener("input", e => {
    params[key] = parseFloat(range.value);
    num.value = range.value;
    render();
  });
  const onNumber = () => {
    const v = parseFloat(num.value);
    if (!isFinite(v)) return;
    params[key] = v;
    range.value = v;
    render();
  };
  num.addEventListener("input", onNumber);
  num.addEventListener("change", onNumber);
}

function initUI() {
  bindParam("Vi","Vi");
  bindParam("fsw","fsw");
  bindParam("D","D");
  bindParam("L","L");
  bindParam("C","C");
  bindParam("R","R");
  $("#twoPeriods").checked = params.twoPeriods;
  $("#twoPeriods").addEventListener("change", e=>{ params.twoPeriods = e.target.checked; render(); });
  $("#reset-btn").addEventListener("click", () => { Object.assign(params, {Vi:12, fsw:300, D:0.5, L:10, C:100, R:5, twoPeriods:true}); initUI(); render(); });

  // waveform selection checkboxes
  $$(".wf").forEach(cb => cb.addEventListener("change", render));

  // probe clicks on SVG
  const svg = $("#buck-svg");
  svg.addEventListener("click", (e) => {
    const targetComp = e.target.closest(".component");
    if (!targetComp) return;
    const comp = targetComp.id;
    const addKey = e.ctrlKey ? targetComp.dataset.current : targetComp.dataset.voltage;
    toggleWaveform(addKey);
    targetComp.classList.add("highlight");
    setTimeout(()=> targetComp.classList.remove("highlight"), 400);
  });
}

function toggleWaveform(key){
  // find checkbox with that value or make a temp one
  let cb = $$('.wf').find(x => x.value === key);
  if (cb) { cb.checked = !cb.checked; render(); }
  else {
    // create an ephemeral item in legend selection
    const phantom = document.createElement('input');
    phantom.type = 'checkbox'; phantom.className='wf'; phantom.value = key; phantom.checked = true;
    phantom.style.display='none';
    document.body.appendChild(phantom);
    phantom.addEventListener('change', render);
    render();
  }
}

// Color cycle
const COLORS = ["#4aa3ff","#38d39f","#ffb454","#ff6b6b","#c792ea","#b3e5ff","#ffd166"];

// Compute waveforms for (0..T*periods)
function compute() {
  const Vi = params.Vi;
  const D = Math.min(0.95, Math.max(0.05, params.D));
  const fsw = params.fsw*1e3; // kHz -> Hz
  const Ts = 1/fsw;
  const L = params.L * 1e-6;
  const C = params.C * 1e-6;
  const R = Math.max(1e-6, params.R);

  const periods = params.twoPeriods ? 2 : 1;
  const N = 1600; // resolution
  const t = new Float64Array(N);
  const v_o = new Float64Array(N);
  const i_l = new Float64Array(N);
  const i_c = new Float64Array(N);
  const v_sw = new Float64Array(N);
  const i_d = new Float64Array(N);
  const i_sw = new Float64Array(N);
  const v_l  = new Float64Array(N);

  const Vo = D*Vi; // Ideal CCM
  const Iout = Vo/R;

  // Inductor ripple (triangular)
  const di_on  = (Vi-Vo)/L * (D*Ts);
  const di_off = (-Vo)/L   * ((1-D)*Ts);
  // enforce volt-second balance -> di_on + di_off ≈ 0 (numerically close).
  const dIL = di_on; // peak-vale magnitude during on time

  const ILavg = Iout;
  const ILmin = ILavg - dIL/2;
  const ILmax = ILavg + dIL/2;

  for (let k=0;k<N;k++){
    const tt = k/(N-1) * (periods*Ts);
    t[k]=tt;

    const ph = (tt % Ts)/Ts; // phase 0..1
    if (ph < D){
      // ON
      const local = ph/D;
      i_l[k] = ILmin + dIL*local;
      v_sw[k] = Vi;
      i_sw[k] = i_l[k];
      i_d[k] = 0;
    } else {
      // OFF
      const local = (ph-D)/(1-D);
      i_l[k] = ILmax + di_off*local;
      v_sw[k] = 0;
      i_sw[k] = 0;
      i_d[k] = i_l[k];
    }
    v_l[k] = v_sw[k] - Vo;

    // Capacitor and output
    const i_o = Vo/R;
    i_c[k] = i_l[k] - i_o;
  }

  // Integrate i_c/C to get v_o ripple with zero-mean over a period
  const dt = periods*Ts/(N-1);
  let vc = 0; let vomin=1e9, vomax=-1e9;
  for (let k=0;k<N;k++){
    vc += (i_c[k]/C)*dt;
    v_o[k] = Vo + vc;
    if (v_o[k]<vomin) vomin=v_o[k];
    if (v_o[k]>vomax) vomax=v_o[k];
  }
  // Remove DC drift by subtracting mean
  const mean = v_o.reduce((a,b)=>a+b,0)/N;
  for (let k=0;k<N;k++) v_o[k] += (Vo-mean);

  return {t, v_o, i_l, i_c, v_sw, i_d, i_sw, v_l, Ts, Vo, ILmin, ILmax};
}

// Canvas plotter
// tiny debounce to keep interaction smooth
let __rf = null;
function render(){ if (__rf) cancelAnimationFrame(__rf); __rf = requestAnimationFrame(_render); }
function _render(){
  const cvs = $("#plot");
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0,0,cvs.width,cvs.height);

  const {t, v_o, i_l, i_c, v_sw, i_d, i_sw, v_l, Ts, Vo, ILmin, ILmax} = compute();

  // which to show
  const chosen = $$(".wf").filter(cb => cb.checked).map(cb => cb.value);

  const series = [];
  chosen.forEach((key)=>{
    let y = null, label = key;
    if (key==="v_o") { y=v_o; label='v_o (V)'; }
    else if (key==="i_l") { y=i_l; label='i_L (A)'; }
    else if (key==="i_c") { y=i_c; label='i_C (A)'; }
    else if (key==="v_sw"){ y=v_sw; label='v_sw (V)'; }
    else if (key==="i_d") { y=i_d; label='i_D (A)'; }
    else if (key==="i_sw"){ y=i_sw; label='i_S (A)'; }
    else if (key==="v_l") { y=v_l; label='v_L (V)'; }
    else if (key==="v_in"){ y=new Float64Array(t.length).fill(params.Vi); label='v_in (V)'; }
    else if (key==="i_in"){ // average equals switch current during on
      // rough: i_in = i_sw
      y = compute().i_sw; label='i_in (A)';
    }
    if (y) series.push({key, x:t, y, label});
  });

  // Axes bounds
  const xmin = 0;
  const xmax = t[t.length-1];
  const allY = series.flatMap(s => Array.from(s.y));
  const ymin = Math.min(-0.05, Math.min(...allY));
  const ymax = Math.max(0.05, Math.max(...allY));

  const padL=60,padR=20,padT=20,padB=40;
  const W=cvs.width, H=cvs.height;
  const plotW=W-padL-padR, plotH=H-padT-padB;

  function x2px(x){ return padL + (x-xmin)/(xmax-xmin) * plotW; }
  function y2px(y){ return padT + (1-(y-ymin)/(ymax-ymin)) * plotH; }

  // Grid
  ctx.fillStyle = "#9fb1c6";
  ctx.font = "12px ui-sans-serif, system-ui";
  ctx.strokeStyle="#1e2a3a"; ctx.lineWidth=1;
  for(let k=0;k<=8;k++){
    const x = padL + plotW*k/8;
    ctx.beginPath(); ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH); ctx.stroke();
    const tt = (xmax-xmin)*k/8;
    ctx.fillText((tt*1e6).toFixed(2)+" µs", x-20, H-18);
  }
  for(let k=0;k<=6;k++){
    const y = padT + plotH*k/6;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y); ctx.stroke();
    const yy = ymax - (ymin+ymax)*k/6 + ymin;
  }

  // Zero line
  if (ymin<0 && ymax>0){
    ctx.strokeStyle="#27364d"; ctx.lineWidth=1.5;
    const zy = y2px(0); ctx.beginPath(); ctx.moveTo(padL,zy); ctx.lineTo(padL+plotW,zy); ctx.stroke();
  }

  // Series
  series.forEach((s, idx)=>{
    const color = COLORS[idx % COLORS.length];
    ctx.strokeStyle=color; ctx.lineWidth=2;
    ctx.beginPath();
    for(let i=0;i<s.x.length;i++){
      const xp = x2px(s.x[i]);
      const yp = y2px(s.y[i]);
      if(i===0) ctx.moveTo(xp,yp);
      else ctx.lineTo(xp,yp);
    }
    ctx.stroke();
  });

  // Legend
  const legend = $("#legend");
  legend.innerHTML = "";
  series.forEach((s, idx)=>{
    const item = document.createElement("div");
    item.className="item";
    const sw = document.createElement("div"); sw.className="swatch"; sw.style.background = COLORS[idx % COLORS.length];
    const lbl = document.createElement("div"); lbl.textContent = s.label;
    item.appendChild(sw); item.appendChild(lbl);
    legend.appendChild(item);
  });
}

// --- Add these global references and waveform properties ---
const plotVoltageCanvas = document.getElementById('plot-voltage');
const plotVoltageCtx = plotVoltageCanvas.getContext('2d');
const plotCurrentCanvas = document.getElementById('plot-current');
const plotCurrentCtx = plotCurrentCanvas.getContext('2d');
const legendEl = document.getElementById('legend');

// Define properties for each waveform (label, color)
const waveformProps = {
  v_o: { label: 'v_o', color: '#FF0000' }, // Red
  v_sw: { label: 'v_sw', color: '#0000FF' }, // Blue
  v_c: { label: 'v_C', color: '#008000' }, // Green
  v_in: { label: 'v_i', color: '#800080' }, // Purple
  i_l: { label: 'i_L', color: '#FFA500' }, // Orange
  i_c: { label: 'i_C', color: '#00CED1' }, // DarkTurquoise
  i_d: { label: 'i_D', color: '#FF1493' }, // DeepPink
  i_sw: { label: 'i_S', color: '#A52A2A' }, // Brown
};

// --- Add this helper function for drawing a single plot ---
function drawPlot(ctx, canvas, selectedWaveforms, allWaveformValues, yMin, yMax, showTwoPeriods) {
  const width = canvas.width;
  const height = canvas.height;
  const padding = 30; // Padding for axes and labels

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff'; // White background for plot area
  ctx.fillRect(0, 0, width, height);

  // Draw grid and axes
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;

  // Y-axis
  ctx.beginPath();
  ctx.moveTo(padding, 0);
  ctx.lineTo(padding, height - padding);
  ctx.stroke();

  // X-axis
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width, height - padding);
  ctx.stroke();

  // Y-axis labels and grid lines
  const numYLabels = 5;
  for (let i = 0; i <= numYLabels; i++) {
    const y = height - padding - (i / numYLabels) * (height - 2 * padding);
    const value = yMin + (i / numYLabels) * (yMax - yMin);
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    ctx.fillStyle = '#555';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(value.toFixed(1), padding - 5, y);
  }

  // X-axis labels (0, Ts, 2Ts)
  ctx.fillStyle = '#555';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('0', padding, height - padding + 5);
  ctx.fillText('Ts', padding + (width - padding) / (showTwoPeriods ? 2 : 1), height - padding + 5);
  if (showTwoPeriods) {
    ctx.fillText('2Ts', width, height - padding + 5);
  }

  // Plot waveforms
  selectedWaveforms.forEach(wfName => {
    const data = allWaveformValues[wfName];
    if (!data || data.length === 0) return;

    ctx.strokeStyle = waveformProps[wfName].color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const xStep = (width - padding) / (data.length - 1);

    for (let i = 0; i < data.length; i++) {
      const x = padding + i * xStep;
      const y = height - padding - ((data[i] - yMin) / (yMax - yMin)) * (height - 2 * padding);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });
}

// --- Modify your existing updateWaveforms function ---
function updateWaveforms() {
  const showTwoPeriods = document.getElementById('twoPeriods').checked;

  // Assuming calculateWaveforms() exists and returns an object like:
  // { v_o: [...], i_l: [...], ... }
  // Make sure calculateWaveforms takes 'params' and 'showTwoPeriods'
  const waveforms = compute();

  // Get selected voltage waveforms from checkboxes
  const selectedVoltages = Array.from(document.querySelectorAll('.wf-v:checked')).map(cb => cb.value);
  // Get selected current waveforms from checkboxes
  const selectedCurrents = Array.from(document.querySelectorAll('.wf-i:checked')).map(cb => cb.value);

  // Determine Y-axis limits for voltages
  let vMin = 0, vMax = params.Vi * 1.1; // Default to input voltage + buffer
  if (selectedVoltages.length > 0) {
    const allVoltageValues = selectedVoltages.flatMap(wf => waveforms[wf] || []);
    if (allVoltageValues.length > 0) {
      vMin = Math.min(...allVoltageValues, 0) * 1.1; // Ensure 0 is included and some buffer
      vMax = Math.max(...allVoltageValues, params.Vi) * 1.1; // Ensure Vi is included and some buffer
    }
  }
  if (vMin >= vMax) { // Prevent inverted or zero range
      vMax = vMin + 1;
  }

  // Determine Y-axis limits for currents
  let iMin = -1, iMax = 1; // Default small range
  if (selectedCurrents.length > 0) {
    const allCurrentValues = selectedCurrents.flatMap(wf => waveforms[wf] || []);
    if (allCurrentValues.length > 0) {
      iMin = Math.min(...allCurrentValues, -1) * 1.1; // Include negative values
      iMax = Math.max(...allCurrentValues, 1) * 1.1;
    }
  }
  if (iMin >= iMax) { // Prevent inverted or zero range
      iMax = iMin + 1;
  }

  // Draw voltage plot on its canvas
  drawPlot(plotVoltageCtx, plotVoltageCanvas, selectedVoltages, waveforms, vMin, vMax, showTwoPeriods);

  // Draw current plot on its canvas
  drawPlot(plotCurrentCtx, plotCurrentCanvas, selectedCurrents, waveforms, iMin, iMax, showTwoPeriods);

  // Update legend
  legendEl.innerHTML = '';
  const allSelected = [...selectedVoltages, ...selectedCurrents];
  allSelected.forEach(wfName => {
    const props = waveformProps[wfName];
    if
