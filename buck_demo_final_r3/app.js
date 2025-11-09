// Buck Converter interactive demo (v1.1)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const params = { Vi:12, fsw:300, D:0.5, L:10, C:100, R:5, periods:2 };

function bindParam(id, key){
  const range = $("#"+id);
  const num = $("#"+id+"_num");
  const set = (v)=>{ range.value=v; num.value=v; };
  set(params[key]);
  const onRange=()=>{ params[key]=parseFloat(range.value); num.value=range.value; updateWaveforms();};
  const onNum=()=>{ const v=parseFloat(num.value); if(!isFinite(v)) return; params[key]=v; range.value=v; updateWaveforms();};
  range.addEventListener("input", onRange); num.addEventListener("input", onNum); num.addEventListener("change", onNum);
}
function initUI(){
  bindParam("Vi","Vi"); bindParam("fsw","fsw"); bindParam("duty","D"); bindParam("Lval","L"); bindParam("Cval","C"); bindParam("Rval","R"); bindParam("periods","periods");
  $$(".wf-v, .wf-i").forEach(cb=> cb.addEventListener("change", updateWaveforms));
  // Hotspots: click = voltage, Cmd/Ctrl-click = current
  $$(".hotspot").forEach(h => {
    h.addEventListener("click", (e)=>{
      const isCurrent = e.metaKey || e.ctrlKey;
      const key = isCurrent ? h.dataset.current : h.dataset.voltage;
      const cb = $$('.wf-v, .wf-i').find(x=>x.value===key);
      if (cb){ cb.checked = !cb.checked; updateWaveforms(); }
    });
  });
  $("#reset-btn").addEventListener("click", ()=>{
    Object.assign(params, {Vi:12, fsw:300, D:0.5, L:10, C:100, R:5, periods:2});
    initUI(); updateWaveforms();
  });
}

// --------- Model (ideal CCM) ----------
function compute(){
  const Vi=params.Vi, D=Math.min(0.95,Math.max(0.05,params.D)), fsw=params.fsw*1e3, Ts=1/fsw;
  const L=params.L*1e-6, C=params.C*1e-6, R=Math.max(params.R,1e-6);
  const periods=Math.max(1,Math.min(10,Math.round(params.periods)));
  const N=1600, t=new Float64Array(N);
  const Vo=D*Vi, Io=Vo/R;
  const il=new Float64Array(N), ic=new Float64Array(N), vout=new Float64Array(N), vsw=new Float64Array(N), isw=new Float64Array(N), id=new Float64Array(N), vl=new Float64Array(N);
  const di_on=(Vi-Vo)/L*(D*Ts), di_off=(-Vo)/L*((1-D)*Ts), dIL=di_on, ILavg=Io, ILmin=ILavg-dIL/2, ILmax=ILavg+dIL/2;
  for(let k=0;k<N;k++){
    const tt=k/(N-1)*(periods*Ts); t[k]=tt; const ph=(tt%Ts)/Ts;
    if (ph < D){ const local=ph/D; il[k]=ILmin+dIL*local; vsw[k]=Vi; isw[k]=il[k]; id[k]=0; }
    else       { const local=(ph-D)/(1-D); il[k]=ILmax+di_off*local; vsw[k]=0;  isw[k]=0;   id[k]=il[k]; }
    vl[k]=vsw[k]-Vo; ic[k]=il[k]-Io;
  }
  // integrate capacitor ripple
  const dt=(periods*Ts)/(N-1); let vc=0;
  for(let k=0;k<N;k++){ vc += (ic[k]/C)*dt; vout[k]=Vo+vc; }
  const mean = vout.reduce((a,b)=>a+b,0)/N; for(let k=0;k<N;k++) vout[k]+= (Vo-mean);

  return { t, v_o:vout, v_sw:vsw, v_l:vl, v_in:new Float64Array(N).fill(Vi), i_l:il, i_c:ic, i_d:id, i_sw:isw };
}

// ---------- Plotting ---------
const VCOLORS={v_o:"#ef4444", v_sw:"#3b82f6", v_l:"#10b981", v_in:"#7c3aed"};
const ICOLORS={i_l:"#f59e0b", i_c:"#06b6d4", i_d:"#ec4899", i_sw:"#8b5cf6"};

function niceStep(min, max, targetCount=5){
  const span=Math.max(1e-12, max-min);
  const raw=span/targetCount;
  const pow=Math.pow(10,Math.floor(Math.log10(raw)));
  const c=[1,2,2.5,5,10].map(x=>x*pow);
  let best=c[0],bd=Math.abs(raw-best);
  for(const x of c){ const d=Math.abs(raw-x); if (x===5*pow){best=x;break;} if (d<bd){best=x;bd=d;} }
  return best;
}
function makeTicks(min,max,step){ const s=Math.ceil(min/step)*step; const arr=[]; for(let v=s; v<=max+1e-12; v+=step) arr.push(+v.toFixed(10)); return arr; }
function engTime(val){ // format seconds with engineering prefixes
  const abs=Math.abs(val);
  if(abs<1e-6) return (val*1e9).toFixed(0)+" ns";
  if(abs<1e-3) return (val*1e6).toFixed(1)+" µs";
  if(abs<1)   return (val*1e3).toFixed(1)+" ms";
  return val.toFixed(3)+" s";
}

let HOVER_KEY=null;
function drawPlot(ctx, canvas, series, yMin, yMax, t){
  const W=canvas.width, H=canvas.height;
  const padL=56,padR=12,padT=10,padB=30;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const xmin=0, xmax=t[t.length-1];
  const x2px=(x)=> padL + (x-xmin)/(xmax-xmin)*plotW;
  const y2px=(y)=> padT + (1-(y-yMin)/(yMax-yMin))*plotH;
  const ctxClear = canvas.getContext('2d'); ctxClear.clearRect(0,0,W,H);
  // background
  ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H);
  // grid: vertical time ticks
  ctx.strokeStyle="#e5e7eb"; ctx.lineWidth=1;
  const xCount=8;
  for(let i=0;i<=xCount;i++){ const x=padL+plotW*i/xCount; ctx.beginPath(); ctx.moveTo(x,padT); ctx.lineTo(x,padT+plotH); ctx.stroke();
    const tt = xmin + (xmax-xmin)*i/xCount; ctx.fillStyle="#475569"; ctx.font="12px system-ui"; ctx.textAlign="center"; ctx.textBaseline="top"; ctx.fillText(engTime(tt), x, H-22);
  }
  // y ticks with nice step
  const yStep=niceStep(yMin,yMax,5); const yt=makeTicks(yMin,yMax,yStep);
  yt.forEach(v=>{ const y=y2px(v); ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+plotW,y); ctx.stroke();
    ctx.fillStyle="#475569"; ctx.font="12px system-ui"; ctx.textAlign="right"; ctx.textBaseline="middle"; ctx.fillText( (Math.abs(yStep)<1)? v.toFixed(2): v.toFixed(0), padL-6, y);
  });
  // zero line
  if (yMin<0 && yMax>0){ ctx.strokeStyle="#94a3b8"; ctx.beginPath(); const zy=y2px(0); ctx.moveTo(padL,zy); ctx.lineTo(padL+plotW,zy); ctx.stroke(); }
  // series
  Object.entries(series).forEach(([name, arr])=>{
    if(!arr) return;
    const color=VCOLORS[name]||ICOLORS[name]||"#111827";
    ctx.strokeStyle=color; ctx.lineWidth=(name===HOVER_KEY?3:2); ctx.shadowColor=(name===HOVER_KEY?color:"transparent"); ctx.shadowBlur=(name===HOVER_KEY?8:0);
    ctx.beginPath();
    for(let k=0;k<arr.length;k++){ const x=x2px(t[k]), y=y2px(arr[k]); if(k===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }
    ctx.stroke();
  });

  // hover -> closest series
  canvas.onmousemove = (ev)=>{
    const rect=canvas.getBoundingClientRect(); const mx=ev.clientX-rect.left,my=ev.clientY-rect.top;
    if(mx<padL||mx>padL+plotW||my<padT||my>padT+plotH){ HOVER_KEY=null; drawPlot(ctx, canvas, series, yMin, yMax, t); return; }
    const x = (mx-padL)/plotW * (xmax-xmin) + xmin;
    const idx=Math.max(0,Math.min(t.length-1, Math.round((x-xmin)/(xmax-xmin)*(t.length-1))));
    let best=null,dist=1e9;
    for(const [name,arr] of Object.entries(series)){ if(!arr) continue; const d=Math.abs( (padT + (1-(arr[idx]-yMin)/(yMax-yMin))*plotH) - my ); if(d<dist){dist=d;best=name;} }
    HOVER_KEY=best; const items=$$("#legend .item"); items.forEach(i=>i.classList.toggle('glow', i.dataset.key===HOVER_KEY)); drawPlot(ctx, canvas, series, yMin, yMax, t);
  };
  canvas.onmouseleave = ()=>{ HOVER_KEY=null; $$("#legend .item").forEach(i=>i.classList.remove('glow')); drawPlot(ctx, canvas, series, yMin, yMax, t); };
}

function updateWaveforms(){
  const wf=compute(); const t=wf.t;
  const chosenV=$$(".wf-v:checked").map(x=>x.value);
  const chosenI=$$(".wf-i:checked").map(x=>x.value);
  const seriesV={}, seriesI={};
  chosenV.forEach(k=> seriesV[k]=wf[k]);
  chosenI.forEach(k=> seriesI[k]=wf[k]);
  const valsV=Object.values(seriesV).flatMap(a=>Array.from(a));
  const valsI=Object.values(seriesI).flatMap(a=>Array.from(a));
  let vMin=valsV.length? Math.min(...valsV, 0)*1.1 : 0;
  let vMax=valsV.length? Math.max(...valsV, params.Vi)*1.1 : params.Vi;
  if(!isFinite(vMin)||!isFinite(vMax)||vMin===vMax){ vMin=0; vMax=Math.max(1,params.Vi); }
  let iMin=valsI.length? Math.min(...valsI, -1)*1.1 : -1;
  let iMax=valsI.length? Math.max(...valsI,  1)*1.1 :  1;
  if(!isFinite(iMin)||!isFinite(iMax)||iMin===iMax){ iMin=-1; iMax=1; }
  drawPlot($("#plot-voltage").getContext("2d"), $("#plot-voltage"), seriesV, vMin, vMax, t);
  drawPlot($("#plot-current").getContext("2d"), $("#plot-current"), seriesI, iMin, iMax, t);
  // legend (color-coded & hover)
  const legend=$("#legend"); legend.innerHTML="";
  [...chosenV,...chosenI].forEach(name=>{
    const item=document.createElement("div"); item.className="item"; item.dataset.key=name;
    const sw=document.createElement("div"); sw.className="swatch"; const color=VCOLORS[name]||ICOLORS[name]||"#111827"; sw.style.background=color; item.style.color=color;
    const lbl=document.createElement("div"); lbl.textContent=name;
    item.appendChild(sw); item.appendChild(lbl);
    item.onmouseenter=()=>{ HOVER_KEY=name; item.classList.add('glow'); updateWaveforms(); };
    item.onmouseleave=()=>{ HOVER_KEY=null; item.classList.remove('glow'); updateWaveforms(); };
    legend.appendChild(item);
  });
}

// init
initUI();
updateWaveforms();
