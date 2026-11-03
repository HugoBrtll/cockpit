const RAW = (window.CK||{}).acts||[];
const META = (window.CK||{}).meta||{};
const SNAP = META.snap;
const STREAK = META.streak;
const BEST = META.best;
const PR_YEAR = META.pr_year;
const RUN_ZONES = META.run_zones;
const HR_ZONES = META.hr_zones;
const SHOES = META.shoes;
const BIKES = META.bikes;
const BIKE_PR = META.bike_pr;
const B5 = BEST.find(b=>b.k==="5 km")||{s:1200,d:SNAP};
const B10 = BEST.find(b=>b.k==="10 km")||{s:2700,d:SNAP};

const actUrl=id=>String(id).startsWith("i")?`https://intervals.icu/activities/${id}`:`https://connect.garmin.com/modern/activity/${id}`;
/* ---------- Plan ---------- */
const TYPES = {
  ef:{l:"Endurance",c:"var(--c1)"},
  sl:{l:"Sortie longue",c:"var(--c3)"},
  vma:{l:"VMA",c:"var(--bad)"},
  seuil:{l:"Seuil",c:"var(--c4)"},
  allure:{l:"Allure 10 km",c:"var(--accent)"},
  test:{l:"Test",c:"var(--c5)"},
  renfo:{l:"Renfo",c:"var(--c6)"},
  repos:{l:"Repos",c:"var(--muted)"}
};
const PD = window.PLAN_DATA||{weeks:[],paces:[],renfo:[],changes:[]};
PD.weeks.forEach((w,i)=>w.w=i);
const PLAN = PD.weeks;
const RENFO = PD.renfo||[];
const PACES = PD.paces||[];

/* ---------- Helpers ---------- */
const $ = s => document.querySelector(s);
const SP = {Run:"Course",TrailRun:"Trail",Ride:"Vélo",VirtualRide:"Home trainer",MountainBikeRide:"VTT",EMountainBikeRide:"VTT élec",Hike:"Rando",Walk:"Marche",WeightTraining:"Muscu",AlpineSki:"Ski",HighIntensityIntervalTraining:"HIIT",Padel:"Padel",Swim:"Natation",Kayaking:"Kayak",Snowshoe:"Raquettes",RockClimbing:"Escalade"};
const SPC = {Run:"var(--accent)",TrailRun:"var(--c3)",Ride:"var(--c1)",VirtualRide:"var(--c6)",MountainBikeRide:"var(--c4)",EMountainBikeRide:"var(--c4)",Hike:"var(--c5)"};
const A = RAW.map(r=>({id:r[0],dt:r[1],day:r[1].slice(0,10),sport:r[2],name:r[3],desc:r[4],km:r[5],mov:r[6],ela:r[7],elev:r[8],re:r[9],kcal:r[10],cad:r[11],kudos:r[12],pr:r[13],gear:r[14],loc:r[15],poly:r[16],temp:r[17],cond:r[18],race:r[19],vmax:r[20]}));
A.forEach(a=>{a.isRun = a.sport==="Run"||a.sport==="TrailRun"; a.pace = a.km>0? (a.race?a.ela:a.mov)/a.km : null;});
const RUNS = A.filter(a=>a.isRun);
const pad = n=>String(n).padStart(2,"0");
function fmtT(s){s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${pad(m)}:${pad(x)}`:`${m}:${pad(x)}`}
function fmtP(s){if(!s||!isFinite(s))return"–";s=Math.round(s);return`${Math.floor(s/60)}:${pad(s%60)}`}
function fmtH(s){const h=Math.floor(s/3600),m=Math.round(s%3600/60);return h?`${h} h ${pad(m)}`:`${m} min`}
const nf1 = new Intl.NumberFormat("fr-FR",{maximumFractionDigits:1,minimumFractionDigits:1});
const nf0 = new Intl.NumberFormat("fr-FR",{maximumFractionDigits:0});
function D(s){const [y,m,d]=s.slice(0,10).split("-").map(Number);return new Date(y,m-1,d,12)}
function iso(d){return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function addD(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function monday(d){const x=new Date(d);const k=(x.getDay()+6)%7;x.setDate(x.getDate()-k);return x}
const JOURS=["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
const MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
function fDate(s,withY){const d=D(s);return`${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}${withY?" "+d.getFullYear():""}`}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
const store={get(k,def){try{const v=localStorage.getItem(k);return v?JSON.parse(v):def}catch(e){return def}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
function toast(t){const el=$("#toast");el.textContent=t;el.classList.add("on");clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove("on"),1600)}
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v.replace(/var\((.*)\)/,"$1")).trim() || v;

const TODAY = (()=>{const n=new Date();const s=iso(n);return s<SNAP.slice(0,10)?SNAP.slice(0,10):s})();

/* ---------- Polyline ---------- */
function decode(str){let i=0,lat=0,lng=0,out=[];while(i<str.length){let b,sh=0,r=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5}while(b>=32);lat+=(r&1)?~(r>>1):(r>>1);sh=0;r=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<sh;sh+=5}while(b>=32);lng+=(r&1)?~(r>>1):(r>>1);out.push([lat/1e5,lng/1e5])}return out}
const polyCache=new Map();
function pts(a){if(!a.poly)return null;if(!polyCache.has(a.id))polyCache.set(a.id,decode(a.poly));return polyCache.get(a.id)}
function drawRoute(cv,a,opt={}){
  const p=pts(a);const dpr=window.devicePixelRatio||1;const w=cv.clientWidth,h=cv.clientHeight;
  cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext("2d");c.scale(dpr,dpr);c.clearRect(0,0,w,h);
  if(!p||p.length<2){c.fillStyle=css("--muted");c.font="11px Figtree, sans-serif";c.textAlign="center";c.fillText(opt.big?"Pas de tracé GPS":"—",w/2,h/2+4);return}
  const k=Math.cos(p[0][0]*Math.PI/180);let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  p.forEach(([la,lo])=>{const x=lo*k,y=-la;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)});
  const m=opt.big?22:7;const s=Math.min((w-2*m)/((x1-x0)||1e-6),(h-2*m)/((y1-y0)||1e-6));
  const ox=(w-(x1-x0)*s)/2,oy=(h-(y1-y0)*s)/2;const P=([la,lo])=>[ox+(lo*k-x0)*s,oy+(-la-y0)*s];
  let based=false;if(opt.big&&BM){const inv=(x,y)=>[-((y-oy)/s+y0),((x-ox)/s+x0)/k];const[nl,wl]=inv(0,0),[sl,el]=inv(w,h);based=drawBase(c,P,[sl,wl,nl,el],s/110540)}
  if(opt.big&&!based){c.strokeStyle=css("--hover");c.lineWidth=1;for(let gx=0;gx<w;gx+=28){c.beginPath();c.moveTo(gx,0);c.lineTo(gx,h);c.stroke()}for(let gy=0;gy<h;gy+=28){c.beginPath();c.moveTo(0,gy);c.lineTo(w,gy);c.stroke()}}
  const col=opt.color||css("--accent");
  c.lineJoin="round";c.lineCap="round";
  if(opt.big){c.strokeStyle=css("--trk-halo");c.lineWidth=8;c.beginPath();p.forEach((q,i)=>{const[x,y]=P(q);i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke()}
  c.strokeStyle=col;c.lineWidth=opt.big?4:2;c.beginPath();p.forEach((q,i)=>{const[x,y]=P(q);i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke();
  const [sx,sy]=P(p[0]),[ex,ey]=P(p[p.length-1]);const r=opt.big?6:3;
  c.fillStyle=css("--good");c.beginPath();c.arc(sx,sy,r,0,7);c.fill();
  c.fillStyle=css("--map-ink");c.beginPath();c.arc(ex,ey,r,0,7);c.fill();c.strokeStyle=css("--bad");c.lineWidth=2;c.stroke();
}

/* ---------- Fond de carte OpenStreetMap (basemap.js, chargé à la demande) ---------- */
let BM=null,bmState="idle",bmWide="idle";
// basemap.js : rues détaillées autour des lieux de course ; basemap_wide.js : routes principales, rivières, forêts sur les zones vélo / rando (chargé si besoin)
function rebuildBM(){const a=prepBasemap(window.BASEMAP_WIDE)||[],b=prepBasemap(window.BASEMAP)||[];BM=(a.length||b.length)?a.concat(b):null;
  if(!BM)return;const cr=$("#osmCredit");if(cr)cr.hidden=false;if((location.hash||"").slice(1)==="journal")drawMap();
  if($("#sheet").classList.contains("on")&&openSheet._a)drawRoute($("#sheetMap"),openSheet._a,{big:true,color:css(SPC[openSheet._a.sport]||"--accent")})}
function loadScript(src,ok){const sc=document.createElement("script");sc.src=src;sc.onload=ok;sc.onerror=()=>{};document.head.appendChild(sc)}
let RL=null,rlState="idle",rlT=0;const rlImg={};
function bmRedraw(){if((location.hash||"").slice(1)==="journal")drawMap();if($("#sheet").classList.contains("on")&&openSheet._a)drawRoute($("#sheetMap"),openSheet._a,{big:true,color:css(SPC[openSheet._a.sport]||"--accent")})}
// relief.js : ombrage + courbes de niveau (une image par zone, chargée seulement quand la zone est visible)
function loadRelief(){if(rlState!=="idle")return;rlState="loading";loadScript("relief.js",()=>{rlState="ok";RL=window.RELIEF||null;bmRedraw()})}
function drawRelief(c,P,hit){if(!RL)return;const done=[];
  for(const r of RL){if(!hit(r.bbox))continue;let im=rlImg[r.src];
    if(!im){im=rlImg[r.src]=new Image();im.onload=()=>{clearTimeout(rlT);rlT=setTimeout(bmRedraw,60)};im.src=r.src}
    if(!(im.complete&&im.naturalWidth))continue;
    const[x0,y0]=P([r.bbox[2],r.bbox[1]]),[x1,y1]=P([r.bbox[0],r.bbox[3]]);
    c.save();c.beginPath();c.rect(x0,y0,x1-x0,y1-y0);
    for(const d of done){c.moveTo(d[0],d[1]);c.lineTo(d[0],d[3]);c.lineTo(d[2],d[3]);c.lineTo(d[2],d[1]);c.closePath()}
    c.clip();c.globalAlpha=css("--scheme")==="light"?1:.9;c.drawImage(im,x0,y0,x1-x0,y1-y0);c.restore();done.push([x0,y0,x1,y1])}}
function loadBasemap(){loadRelief();if(bmState!=="idle")return;bmState="loading";loadScript("basemap.js",()=>{bmState="ok";rebuildBM()})}
function loadBasemapWide(){loadRelief();if(bmWide!=="idle")return;bmWide="loading";loadScript("basemap_wide.js",()=>{bmWide="ok";rebuildBM()})}
function prepBasemap(B){if(!B||!B.areas)return null;const K=["green","water","coast","waterway","rail","path","minor","major"];
  return B.areas.map(a=>{const o={bbox:a.bbox};K.forEach(k=>{o[k]=(a[k]||[]).map(str=>{const p=decode(str);let s=90,w=180,n=-90,e=-180;for(const[la,lo]of p){if(la<s)s=la;if(la>n)n=la;if(lo<w)w=lo;if(lo>e)e=lo}return{p,b:[s,w,n,e]}})});return o})}
// vb = [sud, ouest, nord, est] visibles ; pxm = pixels par mètre
function drawBase(c,P,vb,pxm){
  if(!BM)return false;let any=false;
  const hit=b=>!(b[0]>vb[2]||b[2]<vb[0]||b[1]>vb[3]||b[3]<vb[1]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lay=(arr,poly)=>{c.beginPath();let n=0;for(const g of arr){if(!hit(g.b))continue;n++;g.p.forEach((q,i)=>{const[x,y]=P(q);i?c.lineTo(x,y):c.moveTo(x,y)});if(poly)c.closePath()}return n};
  c.save();c.globalCompositeOperation="source-over";c.lineJoin="round";c.lineCap="round";
  drawRelief(c,P,hit);
  for(const a of BM){if(!hit(a.bbox))continue;any=true;
    if(lay(a.green,true)){c.fillStyle=css("--map-green");c.fill()}
    if(lay(a.water,true)){c.fillStyle=css("--map-water");c.fill();c.strokeStyle=css("--map-river");c.lineWidth=1;c.stroke()}
    if(lay(a.waterway,false)){c.strokeStyle=css("--map-river");c.lineWidth=clamp(pxm*10,1.6,6);c.stroke()}
    if(lay(a.coast,false)){c.strokeStyle=css("--map-coast");c.lineWidth=clamp(pxm*8,1.8,5);c.stroke()}
    if(pxm>.02&&lay(a.rail,false)){c.strokeStyle=css("--map-rail");c.lineWidth=1.2;c.setLineDash([4,4]);c.stroke();c.setLineDash([])}
    if(pxm>.07&&lay(a.path,false)){c.strokeStyle=css("--map-path");c.lineWidth=clamp(pxm*2.5,.6,2);c.setLineDash([3,3]);c.stroke();c.setLineDash([])}
    if(pxm>.018&&lay(a.minor,false)){c.strokeStyle=css("--map-minor");c.lineWidth=clamp(pxm*6,.7,4.5);c.stroke()}
    if(lay(a.major,false)){c.strokeStyle=css("--map-major");c.lineWidth=clamp(pxm*11,1.4,7);c.stroke()}
  }
  c.restore();return any;
}
/* ---------- Charts (SVG maison) ---------- */
const NS="http://www.w3.org/2000/svg";
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);parent&&parent.appendChild(e);return e}
function niceMax(v){if(v<=0)return 4;const st=v/4;const p=Math.pow(10,Math.floor(Math.log10(st)));const n=st/p;const s=(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;return s*4}
function makeTip(box){let t=box.querySelector(".tip");if(!t){t=document.createElement("div");t.className="tip";box.appendChild(t)}return t}
function showTip(box,t,html,x,y){t.innerHTML=html;t.style.opacity=1;const bw=box.clientWidth;const tw=t.offsetWidth;let left=x+12;if(left+tw>bw)left=x-tw-12;if(left<0)left=Math.max(0,Math.min(bw-tw,x-tw/2));t.style.left=left+"px";t.style.top=Math.max(0,y-t.offsetHeight-10)+"px"}
function hideTip(t){t.style.opacity=0}

function barChart(box,data,o={}){
  box.innerHTML="";const W=Math.max(280,box.clientWidth),H=o.h||190,ml=34,mr=6,mt=10,mb=24;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":o.aria||""},box);
  const max=niceMax(Math.max(...data.map(d=>d.v),o.ref||0));const iw=W-ml-mr,ih=H-mt-mb;
  const y=v=>mt+ih-(v/max)*ih;
  for(let i=0;i<=4;i++){const v=max*i/4;el("line",{x1:ml,x2:W-mr,y1:y(v),y2:y(v),class:"gl"},svg);const t=el("text",{x:ml-6,y:y(v)+3.5,"text-anchor":"end",class:"ax"},svg);t.textContent=o.yFmt?o.yFmt(v):nf0.format(v)}
  const n=data.length,bw=iw/n,gap=Math.min(4,Math.max(1,bw*.22));
  const step=Math.ceil(n/(W<420?6:10));
  data.forEach((d,i)=>{const x=ml+i*bw+gap/2,w=Math.max(1,bw-gap),hh=Math.max(d.v>0?2:0,(d.v/max)*ih);
    if(hh>0){const r=Math.min(4,w/2,hh);const top=mt+ih-hh;
      el("path",{d:`M${x},${mt+ih}V${top+r}Q${x},${top} ${x+r},${top}H${x+w-r}Q${x+w},${top} ${x+w},${top+r}V${mt+ih}Z`,fill:d.c||o.color||css("--accent"),opacity:d.dim?.45:1},svg)}
    if(o.labels!==false && (i%step===0||n<=12)){const t=el("text",{x:x+w/2,y:H-7,"text-anchor":"middle",class:"ax"},svg);t.textContent=d.l}
  });
  if(o.ref){el("line",{x1:ml,x2:W-mr,y1:y(o.ref),y2:y(o.ref),stroke:css("--cool"),"stroke-dasharray":"4 4","stroke-width":1.2},svg);const t=el("text",{x:W-mr,y:y(o.ref)-5,"text-anchor":"end",class:"ax",fill:css("--cool")},svg);t.style.fill=css("--cool");t.textContent=o.refLabel||""}
  const hl=el("rect",{x:0,y:mt,width:bw,height:ih,fill:css("--hover"),opacity:0},svg);
  const tip=makeTip(box);
  const move=e=>{const r=svg.getBoundingClientRect();const sx=(e.clientX-r.left)*W/r.width;const i=Math.floor((sx-ml)/bw);if(i<0||i>=n){hl.setAttribute("opacity",0);hideTip(tip);return}
    hl.setAttribute("x",ml+i*bw);hl.setAttribute("opacity",1);const d=data[i];showTip(box,tip,d.tip,(ml+i*bw+bw/2)*r.width/W,(y(d.v))*r.height/H)};
  svg.addEventListener("pointermove",move);svg.addEventListener("pointerdown",move);svg.addEventListener("pointerleave",()=>{hl.setAttribute("opacity",0);hideTip(tip)});
}

function lineChart(box,series,o={}){
  box.innerHTML="";const W=Math.max(280,box.clientWidth),H=o.h||210,ml=38,mr=o.mr||10,mt=12,mb=24;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":o.aria||""},box);
  const xs=series.flatMap(s=>s.pts.map(p=>p[0])),ys=series.flatMap(s=>s.pts.map(p=>p[1])).concat(o.extraY||[]);
  const x0=o.x0??Math.min(...xs),x1=o.x1??Math.max(...xs);let y0=o.y0??Math.min(0,...ys),y1=o.y1??niceMax(Math.max(...ys));
  const iw=W-ml-mr,ih=H-mt-mb;const X=v=>ml+(v-x0)/((x1-x0)||1)*iw;const Y=v=>o.invert? mt+(v-y0)/((y1-y0)||1)*ih : mt+ih-(v-y0)/((y1-y0)||1)*ih;
  const ticks=o.yTicks||[0,1,2,3,4].map(i=>y0+(y1-y0)*i/4);
  ticks.forEach(v=>{el("line",{x1:ml,x2:W-mr,y1:Y(v),y2:Y(v),class:"gl"},svg);const t=el("text",{x:ml-6,y:Y(v)+3.5,"text-anchor":"end",class:"ax"},svg);t.textContent=o.yFmt?o.yFmt(v):nf0.format(v)});
  (o.xTicks||[]).forEach(([v,l])=>{const t=el("text",{x:X(v),y:H-7,"text-anchor":"middle",class:"ax"},svg);t.textContent=l});
  if(o.ref!=null){el("line",{x1:ml,x2:W-mr,y1:Y(o.ref),y2:Y(o.ref),stroke:css("--accent"),"stroke-dasharray":"5 4","stroke-width":1.3},svg);const t=el("text",{x:W-mr,y:Y(o.ref)-5,"text-anchor":"end",class:"ax"},svg);t.style.fill=css("--accent");t.textContent=o.refLabel}
  series.forEach(s=>{
    if(s.dots){s.pts.forEach(p=>el("circle",{cx:X(p[0]),cy:Y(p[1]),r:s.r||2.6,fill:s.c,opacity:s.op||.55},svg));return}
    if(!s.pts.length)return;
    const d=s.pts.map((p,i)=>(i?"L":"M")+X(p[0]).toFixed(1)+","+Y(p[1]).toFixed(1)).join("");
    if(s.area){el("path",{d:d+`L${X(s.pts.at(-1)[0])},${Y(y0)}L${X(s.pts[0][0])},${Y(y0)}Z`,fill:s.c,opacity:.12},svg)}
    el("path",{d,fill:"none",stroke:s.c,"stroke-width":s.w||2,"stroke-linejoin":"round","stroke-linecap":"round",opacity:s.op||1},svg);
    if(s.end){const p=s.pts.at(-1);el("circle",{cx:X(p[0]),cy:Y(p[1]),r:4,fill:s.c,stroke:css("--panel"),"stroke-width":2},svg);
      if(s.label){const t=el("text",{x:X(p[0])+7,y:Y(p[1])+4,class:"ax"},svg);t.style.fill=css("--ink-2");t.textContent=s.label}}
  });
  const cross=el("line",{y1:mt,y2:mt+ih,stroke:css("--ink-2"),"stroke-width":1,opacity:0},svg);
  const tip=makeTip(box);
  const move=e=>{const r=svg.getBoundingClientRect();const sx=(e.clientX-r.left)*W/r.width;if(sx<ml||sx>W-mr){cross.setAttribute("opacity",0);hideTip(tip);return}
    const xv=x0+(sx-ml)/iw*(x1-x0);const html=o.tip(xv);if(!html){hideTip(tip);return}
    const snap=o.snap?o.snap(xv):xv;cross.setAttribute("x1",X(snap));cross.setAttribute("x2",X(snap));cross.setAttribute("opacity",.5);showTip(box,tip,html,X(snap)*r.width/W,(mt+20)*r.height/H+40)};
  svg.addEventListener("pointermove",move);svg.addEventListener("pointerdown",move);svg.addEventListener("pointerleave",()=>{cross.setAttribute("opacity",0);hideTip(tip)});
}

/* ---------- Données dérivées ---------- */
function weekKey(s){return iso(monday(D(s)))}
function runKmBetween(a,b){return RUNS.filter(r=>r.day>=a&&r.day<=b).reduce((s,r)=>s+r.km,0)}
// Charge
const LOAD=(()=>{const byDay={};A.forEach(a=>{if(a.re)byDay[a.day]=(byDay[a.day]||0)+a.re});
  let d=D(A[0].day),end=D(TODAY),ctl=0,atl=0,out=[];
  while(d<=end){const k=iso(d),v=byDay[k]||0;ctl+=(v-ctl)/42;atl+=(v-atl)/7;out.push({d:k,ctl,atl,tsb:ctl-atl,v});d=addD(d,1)}return out})();

/* ---------- ACCUEIL ---------- */
/* Prédiction : estimation Garmin recalculée chaque soir ; META.pred_cal donne les écarts entre distances.
   Entre deux distances : interpolation log-log. */
const PRED_CAL=(META.pred_cal&&META.pred_cal.pts)||[[5000,1],[10000,2.1],[21097.5,4.8],[42195,11]];
const RIEGEL=m=>{const c=PRED_CAL;if(m<=c[0][0])return Math.pow(m/c[0][0],1.06)*c[0][1];
  for(let i=1;i<c.length;i++){if(m<=c[i][0]){const[a,fa]=c[i-1],[b,fb]=c[i];const t=Math.log(m/a)/Math.log(b/a);return Math.exp(Math.log(fa)+t*(Math.log(fb)-Math.log(fa)))}}
  const[a,fa]=c[c.length-1];return fa*Math.pow(m/a,1.06)};
const PH=(META.pred_hist||[]).filter(p=>p[1]>0);
const S5=META.est5k||(PH.at(-1)||[])[1]||B5.s;
function histAt(days){const lim=iso(addD(D(TODAY),-days));let r=null;PH.forEach(p=>{if(p[0]<=lim)r=p});return r}
function peakYear(){const yr=PH.filter(p=>p[0]>=iso(addD(D(TODAY),-365)));return yr.length?yr.reduce((a,b)=>b[1]<a[1]?b:a):null}
const GP=(window.GARMIN&&GARMIN.pred&&GARMIN.pred.length)?GARMIN.pred:null; // [date, 5k, 10k, semi, marathon]
const GV=(window.GARMIN&&GARMIN.vo2&&GARMIN.vo2.length)?GARMIN.vo2:null;
const GS=(window.GARMIN&&GARMIN.status&&GARMIN.status.length)?GARMIN.status:null;
const GSTAT={PRODUCTIVE:["Productif","good"],MAINTAINING:["Maintien","cool"],RECOVERY:["Récupération","cool"],UNPRODUCTIVE:["Improductif","warn"],DETRAINING:["Perte de forme","warn"],OVERREACHING:["Surmenage","bad"],PEAKING:["Pic de forme","good"],STRAINED:["Tendu","warn"],NO_STATUS:["Pas de statut","cool"]};
function renderGoal(){
  const goal=2400, now10=S5*RIEGEL(10000);
  const m1=histAt(28), was10=m1?m1[1]*RIEGEL(10000):null;
  const pk=peakYear(), pk10=pk?pk[1]*RIEGEL(10000):null;
  const rec10=(META.recent||[]).find(r=>r.k==="10 km");
  const rows=[["Forme actuelle (Garmin estimé)",now10,"var(--accent)"]];
  if(was10)rows.push([`Il y a 4 semaines`,was10,"var(--ink-2)"]);
  if(pk10&&pk[0]!==PH.at(-1)?.[0])rows.push([`Pic sur 12 mois (${fDate(pk[0]).replace(/^\S+ /,"")})`,pk10,"var(--cool)"]);
  if(rec10)rows.push(["Meilleur 10 km récent (en séance)",rec10.s,"var(--muted)"]);
  const vals=rows.map(r=>r[1]);
  const lo=Math.min(2340,...vals.map(v=>v-30)), hi=Math.max(2640,...vals.map(v=>v+40)); const pos=v=>((hi-v)/(hi-lo)*100).toFixed(1)+"%";
  const ok=now10<goal;
  const dTr=was10?was10-now10:0;
  const trend=was10&&Math.abs(dTr)>=3?`<span class="pill ${dTr>0?"good":"warn"}">${dTr>0?"▲":"▼"} ${fmtT(Math.abs(dTr))} ${dTr>0?"gagnées":"perdues"} en 4 semaines</span>`:(was10?`<span class="pill cool">Stable sur 4 semaines</span>`:"");
  $("#goalCard").innerHTML=`
   <div class="eyebrow">Objectif · février–mars 2027</div>
   <h2 style="margin:4px 0 8px">10 km sous 40 minutes</h2>
   <div class="row">
     <div><div class="big num">${fmtT(now10)}<small>prédit</small></div>
       <div class="sub" style="margin-top:6px">D'après tes données Garmin, recalculées chaque soir : 5 km en ${fmtT(S5)}.</div></div>
     <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
       <span class="pill ${ok?"good":"warn"}">${ok?"Dans les clous":"Encore un effort"} · ${fmtT(Math.abs(goal-now10))} ${ok?"de marge":"à gagner"}</span>
       ${trend}
     </div>
   </div>
   <div class="ladder">${rows.map(r=>`
     <div class="lrow"><span class="ll">${r[0]}</span><div class="lt"><i class="lg" style="left:${pos(goal)}"></i><i class="ld" style="left:${pos(r[1])};background:${r[2]}"></i></div><b class="num" style="color:${r[2]}">${fmtT(r[1])}</b></div>`).join("")}
     <div class="lrow"><span class="ll"></span><div class="lt" style="background:none;height:14px"><span class="lgl" style="left:${pos(goal)}">40:00</span></div><b></b></div>
   </div>
   <div class="note" style="margin-top:10px">Vers la droite = plus rapide. Pour mémoire, ton record 5 km (${fmtT(B5.s)}, ${fDate(B5.d,true)}) donnerait ${fmtT(B5.s*RIEGEL(10000))}.</div>`;
}
function nextSessions(){const all=PLAN.flatMap(w=>w.items);return all.filter(s=>s.d>=TODAY)}
function renderNext(){
  const nx=nextSessions();const s=nx.find(x=>x.t!=="repos")||nx[0];
  if(!s){$("#nextCard").innerHTML=`<h2>Bloc terminé</h2><p class="sub">Demande un nouveau bloc à Claude.</p>`;return}
  const t=TYPES[s.t];const isToday=s.d===TODAY;
  const after=nx.filter(x=>x!==s).slice(0,3);
  $("#nextCard").innerHTML=`
   <div class="weekhead"><div class="eyebrow">${isToday?"Aujourd'hui":"Prochaine séance"} · ${fDate(s.d)}</div><a href="#plan" class="sub">Tout le plan →</a></div>
   <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="type" style="background:${t.c}">${t.l}</span><h2 style="margin:0">${esc(s.title)}</h2>${s.adj?'<span class="adj">ajustée</span>':""}</div>${s.adj?`<div class="sub" style="margin-top:6px">↻ ${esc(s.adj)}</div>`:""}
   <div class="tiles" style="margin-top:12px;grid-template-columns:repeat(2,1fr)">
     <div class="tile"><div class="v num">${s.km||"–"}<small>km</small></div><div class="l">Distance totale</div></div>
     <div class="tile"><div class="v num" style="font-size:${s.pace.length>14?17:s.pace.length>8?21:28}px">${esc(s.pace||"–")}</div><div class="l">Allure</div></div>
   </div>
   <ol style="margin:12px 0 0;padding-left:18px">${s.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>
   <div class="list" style="margin-top:12px">${after.map(x=>`<div class="sub"><span class="dot" style="background:${TYPES[x.t].c}"></span>${fDate(x.d)} · ${esc(x.title)}</div>`).join("")}</div>`;
}
function renderWeek(){
  const m=monday(D(TODAY));const a=iso(m),b=iso(addD(m,6));const pm=addD(m,-7);
  const rs=RUNS.filter(r=>r.day>=a&&r.day<=b);const prev=runKmBetween(iso(pm),iso(addD(pm,6)));
  const km=rs.reduce((s,r)=>s+r.km,0),t=rs.reduce((s,r)=>s+r.mov,0),dp=rs.reduce((s,r)=>s+r.elev,0);
  const planLeft=PLAN.flatMap(w=>w.items).filter(s=>s.d>=a&&s.d<=b&&s.d>=TODAY&&!(s.d<=SNAP.slice(0,10)&&RUNS.some(r=>r.day===s.d))).reduce((s,x)=>s+x.km,0);
  const days=[...Array(7)].map((_,i)=>{const d=iso(addD(m,i));return{d,v:RUNS.filter(r=>r.day===d).reduce((s,r)=>s+r.km,0)}});
  const mx=Math.max(10,...days.map(d=>d.v));
  // dernière semaine complète (si semaine en cours vide)
  const lw=monday(addD(D(TODAY),-7));const lwKm=runKmBetween(iso(lw),iso(addD(lw,6)));
  $("#weekCard").innerHTML=`
   <div class="eyebrow">Semaine du ${D(a).getDate()} ${MOIS[D(a).getMonth()]}</div>
   <h2 style="margin:4px 0 10px">Cette semaine</h2>
   <div class="tiles">
     <div class="tile"><div class="v num">${nf1.format(km)}<small>km</small></div><div class="l">Course${planLeft?` · +${planLeft} km prévus`:""}</div></div>
     <div class="tile"><div class="v num">${rs.length}</div><div class="l">Sorties · ${fmtH(t)}</div></div>
   </div>
   <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:end;height:70px;margin-top:12px">
     ${days.map(d=>`<div title="${fDate(d.d)} : ${nf1.format(d.v)} km" style="display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:4px;align-items:center">
        <div style="width:70%;height:${Math.max(d.v?6:2,d.v/mx*48)}px;border-radius:4px 4px 2px 2px;background:${d.v?"var(--accent)":"var(--panel-2)"};${d.d===TODAY?"outline:2px solid var(--cool);outline-offset:2px":""}"></div>
        <small style="font-size:10px;color:var(--muted)">${JOURS[D(d.d).getDay()].slice(0,1).toUpperCase()}</small></div>`).join("")}
   </div>
   <div class="note">Semaine dernière : ${nf1.format(lwKm)} km ${prev? "":""}· D+ cette semaine ${nf0.format(dp)} m</div>`;
}
function renderForm(){
  const L=LOAD.at(-1),last=LOAD.slice(-90);
  const tsb=L.tsb;let st,cl;
  if(tsb>5){st="Frais";cl="good"}else if(tsb>-10){st="Équilibré";cl="cool"}else if(tsb>-25){st="En charge";cl="warn"}else{st="Très chargé";cl="bad"}
  $("#formCard").innerHTML=`
   <div class="eyebrow">Forme du jour · estimation</div>
   <div class="weekhead" style="margin-top:4px"><h2 style="margin:0">Forme</h2><span class="pill ${cl}">${st}</span></div>
   <div class="tiles" style="grid-template-columns:repeat(3,1fr)">
    <div class="tile"><div class="v num">${Math.round(L.ctl)}</div><div class="l">Condition</div></div>
    <div class="tile"><div class="v num">${Math.round(L.atl)}</div><div class="l">Fatigue</div></div>
    <div class="tile"><div class="v num">${tsb>0?"+":""}${Math.round(tsb)}</div><div class="l">Fraîcheur</div></div>
   </div>
   <div class="chart" id="miniLoad" style="margin-top:6px"></div>
   <div class="note">Calculé depuis la charge de tes activités, 90 derniers jours.${GS?(()=>{const z=(window.GARMIN.status_last||GS.at(-1));return` Statut d'entraînement Garmin : <b>${(GSTAT[z[1]]||[z[1]])[0]}</b> (${fDate(z[0]).replace(/^\S+ /,"")}).`})():""}</div>`;
  const pts=last.map((p,i)=>[i,p.ctl]),pa=last.map((p,i)=>[i,p.atl]);
  lineChart($("#miniLoad"),[{pts:pa,c:css("--c2"),w:1.6,op:.85},{pts,c:css("--c1"),w:2.2,area:true,end:true}],{h:120,tip:xv=>{const p=last[Math.round(xv)];return p&&`<div class="k">${fDate(p.d)}</div>Condition <b>${Math.round(p.ctl)}</b><br>Fatigue <b>${Math.round(p.atl)}</b>`},snap:xv=>Math.round(xv),xTicks:[[0,fDate(last[0].d).slice(5)],[89,"auj."]]});
}
function renderRec(){
  const W=WELL;const box=$("#recCard");
  const head=`<div class="eyebrow">Garmin · via intervals.icu</div>`;
  if(!W.length){box.innerHTML=head+`<div class="weekhead" style="margin:4px 0 8px"><h2 style="margin:0">Récupération</h2><a href="#recup" class="sub">Détails →</a></div><p class="sub">Ton sommeil, ta HRV et ta fréquence cardiaque au repos s'afficheront ici dès que Garmin les aura envoyés à intervals.icu, en général après une nuit avec ta montre.</p>`;return}
  const mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1), sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
  const last=k=>{for(let i=W.length-1;i>=0;i--)if(W[i][k]!=null)return W[i];return null};
  const W60=W.filter(r=>r[0]>=iso(addD(D(TODAY),-60)));
  const hv=W60.map(r=>r[1]).filter(v=>v!=null),rv=W60.map(r=>r[2]).filter(v=>v!=null);
  const hb=mean(hv),hs=sd(hv),rb=mean(rv);const h=last(1),rh=last(2),sl=last(3);
  let warn=0;const why=[];
  if(h&&hv.length>=7&&h[1]<hb-hs){warn++;why.push("HRV sous ta base")}
  if(rh&&rv.length>=7&&rh[2]>rb+5){warn++;why.push("FC repos haute")}
  if(sl&&sl[3]<6*3600){warn++;why.push("nuit courte")}
  const st=warn>=2?["À surveiller","bad"]:warn===1?["Un peu juste","warn"]:["Bien récupéré","good"];
  const hm=s=>`${Math.floor(s/3600)} h ${pad(Math.round(s%3600/60))}`;
  const tiles=[];
  if(h)tiles.push(`<div class="tile"><div class="v num">${Math.round(h[1])}<small>ms</small></div><div class="l">HRV${hv.length>=7?` · base ${Math.round(hb)}`:""}</div></div>`);
  if(rh)tiles.push(`<div class="tile"><div class="v num">${rh[2]}<small>bpm</small></div><div class="l">FC repos ${fDate(rh[0]).replace(/ \S+$/,"")}${rv.length>=7?` · base ${Math.round(rb)}`:""}</div></div>`);
  if(sl)tiles.push(`<div class="tile"><div class="v num">${Math.floor(sl[3]/3600)}<small>h</small>${pad(Math.round(sl[3]%3600/60))}</div><div class="l">Sommeil ${nightLbl(sl[0],true).replace(/ \d+ \S+$/,"")}${sl[4]?` · score ${sl[4]}`:""}</div></div>`);
  box.innerHTML=head+`<div class="weekhead" style="margin-top:4px"><h2 style="margin:0">Récupération</h2><span style="display:flex;gap:10px;align-items:center"><span class="pill ${st[1]}">${st[0]}</span><a href="#recup" class="sub">Détails →</a></span></div>
   <div class="tiles" style="grid-template-columns:repeat(${tiles.length},1fr)">${tiles.join("")}</div>
   <div class="chart" id="miniHrv" style="margin-top:6px"></div>
   <div class="note">${why.length?why.join(" · ")+". ":""}Dernière mesure : ${fDate((h||rh||sl)[0])} · ${W60.some(r=>r[1]!=null)?"Courbe : HRV (variabilité cardiaque nocturne)":"Courbe : FC au repos"}, ligne = moyenne sur 7 jours.</div>`;
  const useH=W60.filter(r=>r[1]!=null).length>=3;
  metricLine($("#miniHrv"),W60,useH?1:2,useH?{h:120,ref:hv.length>=7?hb:null,refLabel:"base",step:5,unit:"ms"}:{h:120,ref:rv.length>=7?rb:null,refLabel:"base",step:2,unit:"bpm",c:css("--c2"),dot:css("--c5")});
}
function renderYear(){
  const y=TODAY.slice(0,4),py=String(+y-1);const md=TODAY.slice(5);
  const cur=RUNS.filter(r=>r.day.startsWith(y)),prv=RUNS.filter(r=>r.day.startsWith(py)&&r.day.slice(5)<=md);
  const sum=(arr,f)=>arr.reduce((s,r)=>s+f(r),0);
  const km=sum(cur,r=>r.km),pkm=sum(prv,r=>r.km),h=sum(cur,r=>r.mov),ph=sum(prv,r=>r.mov),dp=sum(cur,r=>r.elev),pdp=sum(prv,r=>r.elev);
  const all=A.filter(a=>a.day.startsWith(y));const allH=sum(all,a=>a.mov);
  const delta=(a,b)=>{if(!b)return"";const p=(a-b)/b*100;return`<div class="d ${p>=0?"up":"down"}">${p>=0?"▲":"▼"} ${nf0.format(Math.abs(p))} % vs ${py} à date</div>`};
  $("#yearCard").innerHTML=`
   <div class="weekhead"><h2 style="margin:0">${y} en course à pied</h2><span class="sub">au ${fDate(TODAY)}</span></div>
   <div class="tiles t4">
     <div class="tile"><div class="v num">${nf0.format(km)}<small>km</small></div><div class="l">Distance</div>${delta(km,pkm)}</div>
     <div class="tile"><div class="v num">${Math.round(h/3600)}<small>h</small></div><div class="l">Temps</div>${delta(h,ph)}</div>
     <div class="tile"><div class="v num">${nf0.format(dp)}<small>m</small></div><div class="l">Dénivelé +</div>${delta(dp,pdp)}</div>
     <div class="tile"><div class="v num">${cur.length}</div><div class="l">Sorties</div>${delta(cur.length,prv.length)}</div>
   </div>
   <div class="note">Toutes activités confondues en ${y} : ${all.length} séances, ${Math.round(allH/3600)} h.</div>`;
}

/* ---------- Activités (lignes) ---------- */
const GENERIC=/^(Course à pied|Trail en|Morning|Afternoon|Evening|Lunch|Night|Sortie vélo (le|dans|en)|Randonnée (le|dans|en)|Marche|Entraînement)/i;
function title(a){if(a.desc&&GENERIC.test(a.name)){const f=a.desc.split("\n")[0].trim();if(f.length>2)return f}return a.name}
function actRow(a){
  const b=document.createElement("button");b.className="act";b.type="button";
  const kmTxt=a.km>0?`${nf1.format(a.km)}<small>km</small>`:`${fmtH(a.mov)}<small>durée</small>`;
  const meta=[fDate(a.day,true), a.isRun&&a.pace?fmtP(a.pace)+"/km":"", a.elev?`${a.elev} m D+`:""].filter(Boolean).join(" · ");
  b.innerHTML=`<canvas aria-hidden="true"></canvas><div style="min-width:0"><div class="n">${esc(title(a))}</div><div class="s"><span class="dot" style="background:${SPC[a.sport]||"var(--muted)"}"></span>${SP[a.sport]||a.sport} · ${meta}</div></div><div class="k num">${kmTxt}</div>`;
  b.onclick=()=>openSheet(a);
  requestAnimationFrame(()=>drawRoute(b.querySelector("canvas"),a,{color:css(SPC[a.sport]||"--ink-2")}));
  return b;
}
function renderLast(){const box=$("#lastActs");box.innerHTML="";A.slice(-4).reverse().forEach(a=>box.appendChild(actRow(a)))}

/* ---------- Sheet ---------- */
function openSheet(a){
  openSheet._a=a;loadBasemap();if(!a.isRun)loadBasemapWide();
  const shoe=SHOES.find(s=>s.id===a.gear);
  const cells=[];
  if(a.km>0)cells.push([nf1.format(a.km)+" km","Distance"]);
  cells.push([fmtT(a.mov),"Temps mouvement"]);
  if(a.isRun&&a.pace)cells.push([fmtP(a.pace)+"/km","Allure moy."]);
  else if(a.km>0)cells.push([nf1.format(a.km/(a.mov/3600))+" km/h","Vitesse moy."]);
  cells.push([nf0.format(a.elev)+" m","Dénivelé +"]);
  if(a.re!=null)cells.push([a.re,"Charge"]);
  if(a.cad)cells.push([a.cad+(a.isRun?" ppm":" rpm"),a.isRun?"Cadence (pas/min)":"Cadence"]);
  if(a.kcal)cells.push([nf0.format(a.kcal),"Calories"]);
  if(a.temp!=null)cells.push([Math.round(a.temp)+" °C","Météo"]);
  if(a.kudos)cells.push([a.kudos,"Kudos"]);
  $("#sheetIn").innerHTML=`
   <div class="eyebrow">${SP[a.sport]||a.sport} · ${fDate(a.day,true)} · ${a.dt.slice(11)} ${a.loc?"· "+esc(a.loc):""}</div>
   <h2 style="font-family:var(--f-display);font-size:26px;margin:4px 0 10px">${esc(a.name)}</h2>
   <canvas id="sheetMap"></canvas>
   <div class="kv num">${cells.map(c=>`<div><b>${c[0]}</b><span>${c[1]}</span></div>`).join("")}</div>
   ${a.pr?`<p><span class="pill acc">${a.pr} record${a.pr>1?"s":""} perso sur cette sortie</span></p>`:""}
   ${a.desc?`<div class="desc">${esc(a.desc)}</div>`:""}
   ${shoe?`<p class="sub">Chaussures : ${esc(shoe.n)}</p>`:""}
   <div class="btnrow"><a class="btn" href="${actUrl(a.id)}" target="_blank" rel="noopener">Ouvrir l'activité ↗</a><button class="btn" id="closeSheet">Fermer</button></div>`;
  $("#sheet").classList.add("on");$("#sheetBg").classList.add("on");
  requestAnimationFrame(()=>drawRoute($("#sheetMap"),a,{big:true,color:css(SPC[a.sport]||"--accent")}));
  $("#closeSheet").onclick=closeSheet;
}
function closeSheet(){$("#sheet").classList.remove("on");$("#sheetBg").classList.remove("on")}
$("#sheetBg").onclick=closeSheet;
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});

/* ---------- PLAN ---------- */
/* semaines encore en cours ou à venir : une semaine terminée disparaît des onglets */
const LIVEW=(()=>{const L=PLAN.filter(w=>w.items.length&&w.items.at(-1).d>=TODAY).slice(0,3);return L.length?L:PLAN.slice(-1)})(); // semaine en cours + les 2 suivantes
let curWeek=(()=>{const w=PLAN.find(w=>w.items.some(s=>s.d>=TODAY));return w?w.w:0})();
const done=new Set(store.get("hb-done",[]));
function sessDone(s){return done.has(s.d)||(s.t!=="repos"&&s.t!=="renfo"&&s.d<=SNAP.slice(0,10)&&RUNS.some(r=>r.day===s.d))}
function realised(s){const rs=RUNS.filter(r=>r.day===s.d);if(!rs.length)return null;
  const km=rs.reduce((a,r)=>a+r.km,0),mov=rs.reduce((a,r)=>a+r.mov,0);return{km,pace:mov/km,n:rs.length}}
function renderCoach(){
  const all=LIVEW.flatMap(w=>w.items);
  $("#planTitle").textContent=`${PD.title||"Plan"} · ${LIVEW.length} semaine${LIVEW.length>1?"s":""}`;
  $("#planSub").textContent=all.length?`Du ${fDate(all[0].d)} au ${fDate(all.at(-1).d)} · objectif ${PD.goal||"10 km sous 40:00"}. Le plan est réajusté chaque soir d'après tes séances.`:"";
  const ch=(PD.changes||[]).slice().reverse().slice(0,4);
  $("#coachCard").innerHTML=`<div class="weekhead"><h2 style="margin:0">Ajustements du coach</h2><span class="sub" style="white-space:nowrap">màj ${PD.updated?fDate(PD.updated).replace(/^\S+ /,""):""}</span></div>`+
   (ch.length?ch.map(c=>`<div class="chg"><b>${fDate(c.d).replace(/^\S+ /,"")}</b><span>${esc(c.t)}</span></div>`).join(""):`<p class="sub">Aucun ajustement pour l'instant.</p>`);
}
function realTxt(s){const past=s.d<=SNAP.slice(0,10);if(!past||s.t==="repos"||s.t==="renfo")return"";const r=realised(s);
  return r?`<div class="real ok">Réalisé : ${nf1.format(r.km)} km à ${fmtP(r.pace)}/km</div>`:(s.d<SNAP.slice(0,10)?`<div class="real miss">Pas de sortie ce jour-là</div>`:"")}
function renderPlan(){
  renderCoach();
  $("#weekChips").innerHTML=LIVEW.map(w=>`<button class="chip ${w.w===curWeek?"on":""}" data-w="${w.w}">${w.name}</button>`).join("");
  $("#weekChips").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{curWeek=+c.dataset.w;renderPlan()});
  const W=PLAN[curWeek];if(!W){$("#weekSummary").innerHTML="<p class=\"sub\">Pas de plan en cours.</p>";$("#sessList").innerHTML="";return}const tot=W.items.reduce((s,x)=>s+x.km,0);
  const byT={};W.items.forEach(s=>{if(s.km)byT[s.t]=(byT[s.t]||0)+s.km});
  const nd=W.items.filter(sessDone).length;
  $("#weekSummary").innerHTML=`
   <div class="weekhead"><div><div class="eyebrow">${fDate(W.items[0].d)} → ${fDate(W.items.at(-1).d)}</div><h2 style="margin:2px 0 0">${W.name} · ${W.goal}</h2></div>
   <div style="text-align:right"><div class="num" style="font-family:var(--f-display);font-size:28px;font-weight:700">${tot}<small style="font-size:14px;color:var(--ink-2)"> km</small></div><div class="sub">${nd}/${W.items.length} faites</div></div></div>
   <div class="vol">${Object.entries(byT).map(([t,k])=>`<span title="${TYPES[t].l} ${k} km" style="width:${k/tot*100}%;background:${TYPES[t].c}"></span>`).join("")}</div>
   <div class="legend">${Object.entries(byT).map(([t,k])=>`<span><i style="background:${TYPES[t].c}"></i>${TYPES[t].l} ${k} km</span>`).join("")}</div>`;
  const list=$("#sessList");list.innerHTML="";
  W.items.forEach(s=>{const t=TYPES[s.t];const d=D(s.d);const isD=sessDone(s);
    const div=document.createElement("div");div.className=`sess ${s.d===TODAY?"today":""} ${isD?"done":""}`;div.style.setProperty("--tc",t.c);div.tabIndex=0;
    div.innerHTML=`<div class="day"><small>${JOURS[d.getDay()]}</small><b class="num">${d.getDate()}</b><small>${MOIS[d.getMonth()]}</small></div>
     <div><span class="type" style="background:${t.c}">${t.l}</span><div class="t" style="margin-top:4px">${isD?"✓ ":""}${esc(s.title)}${s.adj?'<span class="adj">ajustée</span>':""}</div><div class="m">${esc(s.pace||"")}</div>${realTxt(s)}</div>
     <div class="km num">${s.km?s.km:"–"}<small>${s.km?"km":""}</small></div>
     <div class="sess-detail"><ol>${s.steps.map(x=>`<li>${esc(x)}</li>`).join("")}</ol><div class="why">${esc(s.why)}</div>${s.adj?`<div class="why" style="margin-top:6px;border-left:3px solid var(--cool)">↻ ${esc(s.adj)}</div>`:""}
     <div class="btnrow"><button class="btn primary" data-a="done">${isD?"Marquer non faite":"C'est fait ✓"}</button><button class="btn" data-a="copy">Copier la séance</button></div></div>`;
    div.addEventListener("click",e=>{const act=e.target.closest("[data-a]");
      if(act){e.stopPropagation();if(act.dataset.a==="done"){done.has(s.d)?done.delete(s.d):done.add(s.d);store.set("hb-done",[...done]);renderPlan();renderNext();toast(done.has(s.d)?"Bien joué 💪":"Séance remise à faire")}
        else{const txt=`${fDate(s.d)} – ${s.title}${s.pace?" ("+s.pace+")":""}\n`+s.steps.map(x=>"• "+x).join("\n");navigator.clipboard?.writeText(txt).then(()=>toast("Séance copiée"),()=>toast("Copie impossible ici"))}return}
      div.classList.toggle("open")});
    div.addEventListener("keydown",e=>{if(e.key==="Enter")div.classList.toggle("open")});
    if(s.d===TODAY||(s===nextSessions()[0]&&curWeek===PLAN.find(w=>w.items.includes(s))?.w))div.classList.add("open");
    list.appendChild(div)});
  $("#paceTable").innerHTML=`<tr><th>Zone</th><th class="r">Allure</th><th>Repère</th></tr>`+PACES.map(p=>`<tr><td>${p[0]}</td><td class="r"><b>${p[1]}</b></td><td class="sub">${p[2]}</td></tr>`).join("");
  $("#renfoList").innerHTML=RENFO.map(r=>`<p style="margin:0 0 8px"><b style="color:var(--ink)">${r[0]}</b> · ${r[1]}</p>`).join("");
}

/* ---------- CHARGE D'ENTRAÎNEMENT (montre Garmin, export) ---------- */
const FOCUS_REF={low:[45,65],high:[25,40],ana:[5,15]}; // repère du coach pour une préparation 10 km (en % de la charge)
function renderLoad(){
  const G=window.GARMIN;const has=G&&G.atl&&G.atl.length;$("#loadGrid").hidden=!has;if(!has)return;
  const until=G.until,L=G.atl.at(-1),sl=G.status_last;const st=sl?(GSTAT[sl[1]]||[sl[1],"cool"]):null;
  const ratio=L[2]?L[1]/L[2]:null;const acwr={OPTIMAL:["Optimal","good"],HIGH:["Élevé","warn"],VERY_HIGH:["Très élevé","bad"],LOW:["Faible","cool"]}[L[3]]||[L[3]||"–","cool"];
  $("#loadHead").innerHTML=G.est_from?`Données de ta montre Garmin jusqu'au ${fDate(G.export_until,true)}, puis <b>recalculées chaque soir par le coach</b> (jusqu'au ${fDate(until,true)}) à partir de la fréquence cardiaque de tes sorties et de ta récup, avec les formules de Garmin recalées sur ton historique : ce sont des estimations.`:`Données de ta montre Garmin (export du ${fDate(until,true)}). Elles se mettent à jour quand tu m'envoies un nouvel export.`;
  const A=G.atl.filter(r=>r[0]>=iso(addD(D(until),-182)));const t0=D(A[0][0]).getTime(),x=d=>(D(d).getTime()-t0)/864e5;
  const pa=A.map(r=>[x(r[0]),r[1]]),pc=A.filter(r=>r[2]).map(r=>[x(r[0]),r[2]]);
  const bandHi=A.filter(r=>r[2]).map(r=>[x(r[0]),r[2]*1.5]),bandLo=A.filter(r=>r[2]).map(r=>[x(r[0]),r[2]*.8]);
  $("#loadCard").innerHTML=`<div class="weekhead"><h2 style="margin:0">Charge et statut d'entraînement</h2>${st?`<span class="pill ${st[1]}">${st[0]}</span>`:""}</div>
    <div class="tiles t4" style="margin-top:8px">
      <div class="tile"><div class="v num">${L[1]}</div><div class="l">Charge aiguë (7 j)</div></div>
      <div class="tile"><div class="v num">${L[2]??"–"}</div><div class="l">Charge chronique (4 sem.)</div></div>
      <div class="tile"><div class="v num">${ratio?nf1.format(ratio):"–"}</div><div class="l">Ratio aiguë / chronique · <span class="pill ${acwr[1]}" style="padding:0 6px">${acwr[0]}</span></div></div>
      <div class="tile"><div class="v num" style="font-size:20px;line-height:1.4">${st?st[0]:"–"}</div><div class="l">Statut ${G.est_from&&sl&&sl[0]>=G.est_from?"estimé":"Garmin"} au ${fDate(sl?sl[0]:until).replace(/^\S+ /,"")}</div></div>
    </div>
    <div class="chart" id="chLoadG" style="margin-top:8px"></div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Charge aiguë</span><span><i style="background:var(--cool)"></i>Charge chronique</span><span><i style="background:var(--c3);opacity:.5"></i>Zone optimale (0,8 à 1,5 × la chronique)</span></div>`;
  const span=pa.at(-1)[0]||1;const xt=[0,.25,.5,.75,1].map(f=>{const d=addD(D(A[0][0]),Math.round(span*f));return[span*f,`${d.getDate()} ${MOIS[d.getMonth()]}`]});
  lineChart($("#chLoadG"),[{pts:bandHi,c:css("--c3"),w:1,op:.45},{pts:bandLo,c:css("--c3"),w:1,op:.45},{pts:pc,c:css("--cool"),w:2},{pts:pa,c:css("--accent"),w:2.4,area:true,end:true}],{h:210,x0:0,x1:span,xTicks:xt,
    snap:xv=>Math.round(xv),tip:xv=>{const d=iso(addD(D(A[0][0]),Math.round(xv)));const r=A.find(q=>q[0]===d);return r&&`<div class="k">${fDate(d,true)}</div>Aiguë <b>${r[1]}</b><br>Chronique <b>${r[2]??"–"}</b>`}});
  // Focus de la charge (4 semaines)
  const lim=iso(addD(D(until),-27));const W=(G.acts||[]).filter(a=>a[0]>=lim&&a[0]<=until);
  const sum=i=>W.reduce((s,a)=>s+a[i],0);const tot=sum(2)||1;
  const rows=[["Aérobie faible","low",sum(7),"var(--c1)","Endurance fondamentale, sorties longues tranquilles"],["Aérobie élevé","high",sum(8),"var(--c4)","Seuil, allure 10 km, tempo"],["Anaérobie","ana",sum(9),"var(--bad)","VMA courte, 30/30, sprints"]];
  const verdict=rows.map(r=>{const p=r[2]/tot*100,[a,b]=FOCUS_REF[r[1]];return p<a?`${r[0].toLowerCase()} un peu bas`:p>b?`${r[0].toLowerCase()} au-dessus du repère`:null}).filter(Boolean);
  $("#focusCard").innerHTML=`<h2>Focus de la charge · 4 semaines</h2><div class="sub">Du ${fDate(lim)} au ${fDate(until)} · charge totale ${nf0.format(tot)} · ${W.length} séances</div>
    <div style="display:grid;gap:14px;margin-top:12px">${rows.map(r=>{const p=r[2]/tot*100,[a,b]=FOCUS_REF[r[1]];const ok=p>=a&&p<=b;
      return`<div><div style="display:flex;justify-content:space-between;gap:8px"><b>${r[0]}</b><span class="num"><b>${nf0.format(r[2])}</b> <span class="sub">· ${nf0.format(p)} %</span></span></div>
      <div style="position:relative;height:12px;border-radius:6px;background:var(--panel-2);margin-top:6px;overflow:hidden">
        <span style="position:absolute;left:${a}%;width:${b-a}%;top:0;bottom:0;background:color-mix(in srgb,var(--ink) 12%,transparent);border-left:1px dashed var(--muted);border-right:1px dashed var(--muted)"></span>
        <span style="position:absolute;left:0;top:3px;bottom:3px;width:${Math.min(100,p)}%;border-radius:4px;background:${r[3]}"></span></div>
      <div class="sub" style="font-size:12px;margin-top:3px">${r[4]} · repère ${a}–${b} % ${ok?"✓":""}</div></div>`}).join("")}</div>
    <div class="note">${verdict.length?"À noter : "+verdict.join(", ")+". ":"Répartition dans les repères. "}Répartition estimée à partir du temps passé dans chaque zone cardio et de l'effet d'entraînement Garmin. Les zones grisées sont un repère du coach pour préparer un 10 km, pas les cibles calculées par Garmin.</div>`;
  // Calories
  const D30=(G.days||[]).filter(r=>r[0]>=iso(addD(D(until),-30))&&r[13]);const kc=D30.map(r=>r[13]),ka=D30.map(r=>r[14]||0);
  const m0=monday(D(TODAY));const weeks=[];for(let i=11;i>=0;i--){const a=addD(m0,-7*i),b=addD(a,6);const k=A_KCAL(iso(a),iso(b));weeks.push({l:`${a.getDate()}/${a.getMonth()+1}`,v:k,dim:i===0,c:css("--c2"),tip:`<div class="k">Semaine du ${a.getDate()} ${MOIS[a.getMonth()]}</div><b>${nf0.format(k)}</b> kcal en activité${i===0?"<br><span class='k'>semaine en cours</span>":""}`})}
  const wk=weeks.at(-1).v,prev=weeks.at(-2).v;
  $("#kcalCard").innerHTML=`<h2>Calories dépensées</h2>
    <div class="tiles" style="margin-top:8px">
      <div class="tile"><div class="v num">${kc.length?nf0.format(wMean(kc)):"–"}<small>kcal</small></div><div class="l">Dépense totale moyenne / jour (montre, 30 j)</div></div>
      <div class="tile"><div class="v num">${ka.length?nf0.format(wMean(ka)):"–"}<small>kcal</small></div><div class="l">dont activité / jour</div></div>
      <div class="tile"><div class="v num">${nf0.format(wk)}<small>kcal</small></div><div class="l">En sorties cette semaine</div></div>
      <div class="tile"><div class="v num">${nf0.format(prev)}<small>kcal</small></div><div class="l">Semaine dernière</div></div>
    </div>
    <div class="chart" id="chKcal" style="margin-top:8px"></div>
    <div class="note">Barres : calories de tes activités par semaine (tous sports), mises à jour chaque soir. Dépense totale par jour : montre Garmin${G.est_from?` jusqu'au ${fDate(G.export_until)}, puis estimée d'après tes pas et tes activités`:`, jusqu'au ${fDate(until)}`}</div>`;
  barChart($("#chKcal"),weeks,{h:170,aria:"Calories en activité par semaine"});
}
function A_KCAL(a,b){return A.filter(x=>x.day>=a&&x.day<=b).reduce((s,x)=>s+(x.kcal||0),0)}
/* ---------- STATS ---------- */
let range=store.get("hb-range","6m");
const RANGES=[["3m","3 mois",13],["6m","6 mois",26],["1a","1 an",52],["tout","Tout",999]];
function renderStats(){
  $("#rangeChips").innerHTML=RANGES.map(r=>`<button class="chip ${r[0]===range?"on":""}" data-r="${r[0]}">${r[1]}</button>`).join("");
  $("#rangeChips").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{range=c.dataset.r;store.set("hb-range",range);renderStats()});
  const nW=RANGES.find(r=>r[0]===range)[2];
  // semaines
  const m0=monday(D(TODAY));const first=monday(D(RUNS[0].day));
  const weeks=[];for(let i=0;;i++){const m=addD(m0,-7*i);if(m<first||i>=nW)break;weeks.unshift(m)}
  const wk=weeks.map(m=>{const a=iso(m),b=iso(addD(m,6));const rs=RUNS.filter(r=>r.day>=a&&r.day<=b);const km=rs.reduce((s,r)=>s+r.km,0);
    return{l:weeks.length>60?(m.getMonth()===0&&m.getDate()<=7?String(m.getFullYear()):""):`${m.getDate()}/${m.getMonth()+1}`,v:km,dim:a===iso(m0),
      tip:`<div class="k">Semaine du ${m.getDate()} ${MOIS[m.getMonth()]} ${m.getFullYear()}</div><b>${nf1.format(km)} km</b><br>${rs.length} sortie${rs.length>1?"s":""} · ${fmtH(rs.reduce((s,r)=>s+r.mov,0))}${a===iso(m0)?"<br><span class='k'>semaine en cours</span>":""}`}});
  const full=wk.filter(w=>!w.dim);const avg=full.reduce((s,w)=>s+w.v,0)/(full.length||1);const best=Math.max(...wk.map(w=>w.v));
  $("#wkSub").innerHTML=`Moyenne ${nf1.format(avg)} km/sem · meilleure semaine ${nf1.format(best)} km`;
  barChart($("#chWeekly"),wk,{ref:avg,refLabel:`moy. ${nf0.format(avg)} km`,labels:true,aria:"Kilomètres par semaine"});
  // allure
  const since=iso(addD(m0,-7*Math.min(nW,520)));
  const pr=RUNS.filter(r=>r.sport==="Run"&&r.km>=3&&r.pace>180&&r.pace<480&&r.day>=since);
  const t0=D(pr[0]?.day||TODAY).getTime();const xd=r=>(D(r.day).getTime()-t0)/864e5;
  const pts=pr.map(r=>[xd(r),r.pace]);const roll=pr.map((r,i)=>{const s=pr.slice(Math.max(0,i-9),i+1);return[xd(r),s.reduce((a,b)=>a+b.pace,0)/s.length]});
  const ymin=Math.floor(Math.min(...pts.map(p=>p[1]),230)/30)*30, ymax=Math.ceil(Math.max(...pts.map(p=>p[1]))/30)*30;
  const span=pts.length?pts.at(-1)[0]:1;const xt=[];const nT=4;for(let i=0;i<=nT;i++){const v=span*i/nT;const d=addD(D(pr[0]?.day||TODAY),Math.round(v));xt.push([v,`${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`])}
  const yT=[];for(let v=ymin;v<=ymax;v+=30)yT.push(v);
  lineChart($("#chPace"),[{pts,dots:true,c:css("--cool"),op:.5},{pts:roll,c:css("--accent"),w:2.4,end:true}],{h:230,invert:true,y0:ymin,y1:ymax,yTicks:yT,yFmt:fmtP,xTicks:xt,x0:0,x1:span||1,ref:240,refLabel:"4:00 = allure sub-40",
    snap:xv=>{let b=pts[0];pts.forEach(p=>{if(Math.abs(p[0]-xv)<Math.abs(b[0]-xv))b=p});return b?b[0]:xv},
    tip:xv=>{let bi=0;pts.forEach((p,i)=>{if(Math.abs(p[0]-xv)<Math.abs(pts[bi][0]-xv))bi=i});const r=pr[bi];return r&&`<div class="k">${fDate(r.day,true)}</div><b>${fmtP(r.pace)}/km</b> · ${nf1.format(r.km)} km<br><span class="k">${esc(r.name.slice(0,28))}</span><br>moy. glissante ${fmtP(roll[bi][1])}`}});
  // charge
  const LL=LOAD.filter(p=>p.d>=since);const lpC=LL.map((p,i)=>[i,p.ctl]),lpA=LL.map((p,i)=>[i,p.atl]);
  const lxt=[];for(let i=0;i<=4;i++){const k=Math.round((LL.length-1)*i/4);const d=D(LL[k].d);lxt.push([k,`${d.getDate()} ${MOIS[d.getMonth()]}`])}
  lineChart($("#chLoad"),[{pts:lpA,c:css("--c2"),w:1.6,op:.9},{pts:lpC,c:css("--c1"),w:2.4,area:true,end:true}],{h:200,xTicks:lxt,snap:xv=>Math.round(xv),
    tip:xv=>{const p=LL[Math.round(xv)];return p&&`<div class="k">${fDate(p.d,true)}</div>Condition <b>${Math.round(p.ctl)}</b><br>Fatigue <b>${Math.round(p.atl)}</b><br><span class="k">Effort du jour ${Math.round(p.v)}</span>`}});
  renderCumul();renderDow();renderGear();renderSports();
}
function renderCumul(){
  const yrs=[...new Set(RUNS.map(r=>r.day.slice(0,4)))].sort();const cols=["--c6","--c5","--c4","--c3","--c1","--c2"];
  const doy=s=>{const d=D(s);return Math.round((d-new Date(d.getFullYear(),0,1,12))/864e5)};
  const ser=yrs.map((y,i)=>{let c=0;const p=[[0,0]];RUNS.filter(r=>r.day.startsWith(y)).forEach(r=>{c+=r.km;p.push([doy(r.day),c])});
    if(y!==TODAY.slice(0,4))p.push([364,c]);else p.push([doy(TODAY),c]);
    const cur=y===TODAY.slice(0,4);return{y,pts:p,c:cur?css("--accent"):css(cols[(yrs.length-1-i)%cols.length]),w:cur?3:1.6,op:cur?1:.85,end:true,label:i>=yrs.length-2?`${y} · ${nf0.format(c)} km`:""}});
  const mt=[0,90,181,273,364].map(v=>[v,["janv.","avr.","juil.","oct.","déc."][[0,90,181,273,364].indexOf(v)]]);
  lineChart($("#chCumul"),ser,{h:240,x0:0,x1:364,mr:92,xTicks:mt,
    tip:xv=>{const d=Math.round(xv);const dt=new Date(2026,0,1+d);return`<div class="k">au ${dt.getDate()} ${MOIS[dt.getMonth()]}</div>`+ser.slice().reverse().map(s=>{let v=0;s.pts.forEach(p=>{if(p[0]<=d)v=p[1]});const isFut=s.y===TODAY.slice(0,4)&&d>doy(TODAY);return isFut?"":`<span class="dot" style="background:${s.c}"></span>${s.y} <b>${nf0.format(v)}</b> km<br>`}).join("")}});
  $("#cumulLegend").innerHTML=ser.map(s=>`<span><i style="background:${s.c}"></i>${s.y}</span>`).join("");
}
function renderHeat(){
  const box=$("#chHeat");box.innerHTML="";const end=D(TODAY);const start=monday(addD(end,-364));
  const byDay={};RUNS.forEach(r=>byDay[r.day]=(byDay[r.day]||0)+r.km);
  const cols=Math.ceil(((end-start)/864e5+1)/7);const cs=13,g=3,ml=22,mt=16;const W=ml+cols*(cs+g),H=mt+7*(cs+g)+2;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,style:`min-width:${W}px`,role:"img","aria-label":"Calendrier des kilomètres courus"},box);
  const ramp=[0,1,2,3,4,5].map(i=>css("--heat"+i));const lv=v=>!v?0:v<6?1:v<10?2:v<15?3:v<20?4:5;
  ["L","","M","","V","","D"].forEach((t,i)=>{if(t){const x=el("text",{x:0,y:mt+i*(cs+g)+10,class:"ax"},svg);x.textContent=t}});
  let lastM=-1;const tip=makeTip(box);
  for(let c=0;c<cols;c++)for(let r=0;r<7;r++){const d=addD(start,c*7+r);if(d>end)continue;const k=iso(d),v=byDay[k]||0;
    if(r===0&&d.getMonth()!==lastM&&d.getDate()<=7){lastM=d.getMonth();const t=el("text",{x:ml+c*(cs+g),y:10,class:"ax"},svg);t.textContent=MOIS[d.getMonth()]}
    const rc=el("rect",{x:ml+c*(cs+g),y:mt+r*(cs+g),width:cs,height:cs,rx:3,fill:ramp[lv(v)]},svg);
    if(k===TODAY){rc.setAttribute("stroke",css("--cool"));rc.setAttribute("stroke-width",1.5)}
    rc.addEventListener("pointerenter",e=>{const b=box.getBoundingClientRect(),q=rc.getBoundingClientRect();showTip(box,tip,`<div class="k">${fDate(k,true)}</div><b>${v?nf1.format(v)+" km":"Pas de course"}</b>`,q.left-b.left+box.scrollLeft,q.top-b.top)});
    rc.addEventListener("pointerdown",e=>rc.dispatchEvent(new Event("pointerenter")));
  }
  box.addEventListener("pointerleave",()=>hideTip(tip));
  box.scrollLeft=box.scrollWidth;
  $("#heatLegend").innerHTML=["0","< 6","6–10","10–15","15–20","20 +"].map((t,i)=>`<span><i style="background:${ramp[i]}"></i>${t} km</span>`).join("");
  const n=Object.keys(byDay).filter(k=>k>=iso(start)).length;$("#heatLegend").insertAdjacentHTML("beforeend",`<span style="margin-left:auto">${n} jours de course sur 12 mois</span>`);
}
function renderDow(){
  const since=iso(addD(D(TODAY),-365));const rs=RUNS.filter(r=>r.day>=since);const c=[0,0,0,0,0,0,0],k=[0,0,0,0,0,0,0];
  rs.forEach(r=>{const i=(D(r.day).getDay()+6)%7;c[i]++;k[i]+=r.km});
  const L=["lun.","mar.","mer.","jeu.","ven.","sam.","dim."];
  barChart($("#chDow"),c.map((v,i)=>({l:L[i],v,c:css("--c1"),tip:`<div class="k">${L[i]} · 12 derniers mois</div><b>${v} sorties</b><br>${nf0.format(k[i])} km`})),{h:170,aria:"Sorties par jour de la semaine"});
  const b=[[0,5,"< 5"],[5,8,"5–8"],[8,11,"8–11"],[11,15,"11–15"],[15,19,"15–19"],[19,99,"19 +"]];
  barChart($("#chDist"),b.map(x=>{const n=rs.filter(r=>r.km>=x[0]&&r.km<x[1]).length;return{l:x[2],v:n,c:css("--c3"),tip:`<div class="k">${x[2]} km · 12 derniers mois</div><b>${n} sorties</b>`}}),{h:170,aria:"Répartition des distances"});
}
let sportYear=TODAY.slice(0,4);
function renderSports(){
  const yrs=[...new Set(A.map(a=>a.day.slice(0,4)))].sort().reverse();
  $("#sportYearChips").innerHTML=yrs.map(y=>`<button class="chip ${y===sportYear?"on":""}" data-y="${y}">${y}</button>`).join("");
  $("#sportYearChips").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{sportYear=c.dataset.y;renderSports()});
  const g={};A.filter(a=>a.day.startsWith(sportYear)).forEach(a=>{const s=g[a.sport]||(g[a.sport]={n:0,km:0,t:0,dp:0});s.n++;s.km+=a.km;s.t+=a.mov;s.dp+=a.elev});
  const rows=Object.entries(g).sort((a,b)=>b[1].t-a[1].t);const tt=rows.reduce((s,r)=>s+r[1].t,0);
  $("#sportTable").innerHTML=`<tr><th>Sport</th><th class="r">Séances</th><th class="r">Km</th><th class="r">D+</th><th class="r">Heures</th><th style="width:30%"></th></tr>`+
   rows.map(([s,v])=>`<tr><td><span class="dot" style="background:${SPC[s]||"var(--muted)"}"></span>${SP[s]||s}</td><td class="r">${v.n}</td><td class="r">${v.km?nf0.format(v.km):"–"}</td><td class="r">${v.dp?nf0.format(v.dp):"–"}</td><td class="r">${nf1.format(v.t/3600)}</td><td><div class="meter"><span style="width:${v.t/tt*100}%;background:${SPC[s]||"var(--muted)"}"></span></div></td></tr>`).join("")+
   `<tr><td><b>Total</b></td><td class="r"><b>${rows.reduce((s,r)=>s+r[1].n,0)}</b></td><td></td><td></td><td class="r"><b>${nf1.format(tt/3600)}</b></td><td></td></tr>`;
}

/* ---------- RECORDS ---------- */
function renderPredChart(){
  const box=$("#chPred");if(PH.length<2){box.innerHTML='<p class="sub">Pas encore assez d\'historique.</p>';return}
  const t0=D(PH[0][0]).getTime();const xd=s=>(D(s).getTime()-t0)/864e5;
  const p=PH.map(q=>[xd(q[0]),q[1]*RIEGEL(10000)]);const span=p.at(-1)[0]||1;
  const ys=p.map(q=>q[1]).concat(2400);const y0=Math.floor((Math.min(...ys)-20)/60)*60,y1=Math.ceil((Math.max(...ys)+20)/60)*60;
  const yT=[];for(let v=y0;v<=y1;v+=60)yT.push(v);
  const xt=[];for(let i=0;i<=4;i++){const v=span*i/4;const d=addD(D(PH[0][0]),Math.round(v));xt.push([v,`${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`])}
  const gp=[];
  if(gp.length)ys.push(...gp.map(q=>q[1]));
  const Y0=Math.floor((Math.min(...ys)-20)/60)*60,Y1=Math.ceil((Math.max(...ys)+20)/60)*60;const YT=[];for(let v=Y0;v<=Y1;v+=60)YT.push(v);
  const ser=[{pts:p,c:css("--cool"),w:2.2,area:false,end:true},{pts:p,dots:true,c:css("--cool"),r:3,op:.9}];
  if(gp.length)ser.unshift({pts:gp,c:css("--c2"),w:1.6,op:.85,end:true});
  lineChart(box,ser,{h:210,invert:true,y0:Y0,y1:Y1,yTicks:YT,yFmt:fmtT,xTicks:xt,x0:0,x1:span,ref:2400,refLabel:"40:00",
    snap:xv=>{let b=p[0];p.forEach(q=>{if(Math.abs(q[0]-xv)<Math.abs(b[0]-xv))b=q});return b[0]},
    tip:xv=>{let bi=0;p.forEach((q,i)=>{if(Math.abs(q[0]-xv)<Math.abs(p[bi][0]-xv))bi=i});const g=GP?GP.filter(q=>q[0]<=PH[bi][0]).at(-1):null;return`<div class="k">${fDate(PH[bi][0],true)}</div>10 km <b>${fmtT(p[bi][1])}</b>${g&&g[2]?``:""}`}});
}

function renderPrYear(){
  const box=$("#chPrYear");box.innerHTML="";
  const yrs=[...new Set(Object.values(PR_YEAR).flatMap(o=>Object.keys(o)))].map(Number).sort();
  if(!yrs.length){box.innerHTML='<p class="sub">Pas encore de records annuels.</p>';return}
  const S=[["5 km",5000,css("--c1")],["10 km",10000,css("--c2")]].map(([k,m,c])=>({k,m,c,p:yrs.map(y=>PR_YEAR[k]&&PR_YEAR[k][y]?[y,PR_YEAR[k][y],PR_YEAR[k][y]/(m/1000)]:null).filter(Boolean)}));
  const W=Math.max(300,box.clientWidth),H=250,ml=64,mr=70,mt=24,mb=30;
  const svg=el("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":"Meilleur 5 km et 10 km par année"},box);
  const pc=S.flatMap(s=>s.p.map(q=>q[2]));const lo=Math.floor((Math.min(...pc)-10)/15)*15,hi=Math.ceil((Math.max(...pc)+10)/15)*15;
  const X=y=>yrs.length<2?ml+(W-ml-mr)/2:ml+(y-yrs[0])/(yrs.at(-1)-yrs[0])*(W-ml-mr);const Y=v=>mt+(v-lo)/(hi-lo)*(H-mt-mb);
  for(let v=lo;v<=hi;v+=15){el("line",{x1:ml,x2:W-mr,y1:Y(v),y2:Y(v),class:"gl"},svg);const t=el("text",{x:ml-8,y:Y(v)+3.5,"text-anchor":"end",class:"ax"},svg);t.textContent=fmtP(v)+"/km"}
  yrs.forEach(y=>{const t=el("text",{x:X(y),y:H-8,"text-anchor":"middle",class:"ax"},svg);t.textContent=y;t.style.fontWeight=600});
  S.forEach((s,si)=>{if(!s.p.length)return;
    el("path",{d:s.p.map((q,i)=>(i?"L":"M")+X(q[0])+","+Y(q[2])).join(""),fill:"none",stroke:s.c,"stroke-width":3,"stroke-linecap":"round","stroke-linejoin":"round"},svg);
    s.p.forEach((q,i)=>{el("circle",{cx:X(q[0]),cy:Y(q[2]),r:6,fill:s.c,stroke:css("--panel"),"stroke-width":2.5},svg);
      const t=el("text",{x:X(q[0]),y:Y(q[2])+(si?20:-12),"text-anchor":i===s.p.length-1&&yrs.length>1?"end":i===0&&yrs.length>1?"start":"middle"},svg);
      t.textContent=fmtT(q[1]);t.setAttribute("style",`fill:${css("--ink")};font:600 13px var(--f-num)`)});
    const q=s.p.at(-1);const t=el("text",{x:W-mr+10,y:Y(q[2])+4},svg);t.textContent=s.k;t.setAttribute("style",`fill:${s.c};font:700 13px var(--f-body)`)});
  const gains=S.filter(s=>s.p.length>1).map(s=>{const g=s.p[0][1]-s.p.at(-1)[1];return`<span class="pill ${g>0?"good":"warn"}">${s.k} : ${g>0?"−":"+"}${fmtT(Math.abs(g))} depuis ${s.p[0][0]}</span>`});
  if(gains.length)box.insertAdjacentHTML("beforeend",`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${gains.join("")}</div>`);
}
function renderRecords(){
  $("#prs").innerHTML=BEST.map(b=>`<a class="pr ${b.hot?"hot":""}" href="${actUrl(b.id)}" target="_blank" rel="noopener"><div class="d">${b.k}</div><div class="v num">${fmtT(b.s)}</div><div class="p num">${fmtP(b.s/(b.m/1000))}/km</div><div class="y">${fDate(b.d,true)}</div></a>`).join("");
  renderPrYear();
  const pk=peakYear();const pr=[["5 km",5000],["10 km",10000],["15 km",15000],["Semi",21097.5],["Marathon",42195]];
  $("#predSub").innerHTML=`Estimation Garmin du ${fDate(PH.at(-1)?.[0]||TODAY)} : 5 km en <b>${fmtT(S5)}</b>.`;
  const gl=null,gIdx={};
  $("#predTable").innerHTML=`<tr><th>Distance</th><th class="r">Estimation</th><th class="r">Allure</th>${gl?`<th class="r">Garmin</th>`:""}${pk?`<th class="r">Pic 12 mois</th>`:""}</tr>`+pr.map(([n,m])=>{const t=S5*RIEGEL(m);return`<tr><td>${n}${n==="10 km"?' <span class="pill acc" style="margin-left:4px">objectif</span>':""}</td><td class="r"><b>${fmtT(t)}</b></td><td class="r">${fmtP(t/(m/1000))}/km</td>${gl?`<td class="r">${gIdx[n]&&gl[gIdx[n]]?fmtT(gl[gIdx[n]]):"–"}</td>`:""}${pk?`<td class="r sub">${fmtT(pk[1]*RIEGEL(m))}</td>`:""}</tr>`}).join("");
  if(GV)$("#predSub").insertAdjacentHTML("beforeend",` VO2max <b>${GV.at(-1)[1]}</b>.`);
  renderPredChart();
}
function renderZones(){
  const zc=["var(--c1)","var(--c3)","var(--c4)","var(--c2)","var(--bad)","var(--c5)"];const zn=["Récup","Endurance","Tempo","Seuil","VMA","Anaérobie"];
  $("#paceZones").innerHTML=RUN_ZONES.map((z,i)=>{const slow=z[0]?1000/z[0]:null,fast=z[1]?1000/z[1]:null;const txt=!z[0]?`> ${fmtP(fast)}`:!z[1]?`< ${fmtP(slow)}`:`${fmtP(fast)} – ${fmtP(slow)}`;
    return`<div class="zone"><b>Z${i+1}</b><div><div style="display:flex;justify-content:space-between"><span>${zn[i]}</span><span class="num">${txt}/km</span></div><div class="zb" style="background:${zc[i]};width:${30+i*14}%;margin-top:3px"></div></div></div>`}).join("");
  $("#hrZones").innerHTML=HR_ZONES.map((z,i)=>`<div class="zone"><b>Z${i+1}</b><div><div style="display:flex;justify-content:space-between"><span>${["Récup","Endurance","Tempo","Seuil","Max"][i]}</span><span class="num">${z[1]?`${z[0]}–${z[1]}`:`${z[0]} +`} bpm</span></div><div class="zb" style="background:${zc[i]};width:${30+i*17}%;margin-top:3px"></div></div></div>`).join("");
}
function renderGear(){
  $("#shoes").closest(".card").hidden=!SHOES.length;$("#bikeTiles").closest(".card").hidden=!BIKES.length&&!BIKE_PR.length;
  $("#shoes").innerHTML=SHOES.map(s=>{const p=Math.min(1,s.km/700);const c=p>.85?"var(--bad)":p>.6?"var(--warn)":"var(--good)";
    return`<div class="gear"><div class="top"><span>${esc(s.n)} ${s.ret?'<span class="pill" style="background:var(--panel-2);color:var(--muted)">retirées</span>':""}</span><b class="num">${nf0.format(s.km)} km</b></div><div class="meter"><span style="width:${p*100}%;background:${s.ret?"var(--muted)":c}"></span></div></div>`}).join("");
  $("#bikeTiles").innerHTML=BIKE_PR.map(b=>`<div class="tile"><div class="v num">${b.v}<small>${b.u}</small></div><div class="l">${b.l}</div></div>`).join("");
  $("#bikes").innerHTML=BIKES.map(b=>`<div class="gear"><div class="top"><span>${esc(b.n)} ${b.ret?'<span class="pill" style="background:var(--panel-2);color:var(--muted)">retiré</span>':""}</span><b class="num">${nf0.format(b.km)} km</b></div></div>`).join("")+(META.climb?`<div class="note">Plus grosse montée : ${nf0.format(META.climb.v)} m (${fDate(META.climb.d,true)}).</div>`:"");
}

/* ---------- RÉCUPÉRATION (Garmin via intervals.icu) ---------- */
// META.well : [date, hrv, fcRepos, sommeilSec, scoreSommeil, fcNuit, pas, poids, spO2, respiration, readiness]
// Historique de l'export Garmin (garmin.js, fixe) complété par intervals.icu (META.well, mis à jour chaque soir).
// Ligne : 0 date, 1 hrv, 2 fcRepos, 3 sommeil(s), 4 score, 5 fcNuit, 6 pas, 7 poids, 8 spO2, 9 respiration, 10 readiness,
//         11 stress moyen, 12 Body Battery max, 13 Body Battery min, 14 sommeil profond(s), 15 sommeil paradoxal(s),
//         16 coucher, 17 réveil. La date d'une nuit = le matin du réveil (convention Garmin).
const GH=window.GARMIN||null;
const WELL=(()=>{const m=new Map();const blank=d=>{const o=new Array(18).fill(null);o[0]=d;return o};
  if(GH&&GH.days)GH.days.forEach(r=>{const o=blank(r[0]);[o[2],o[3],o[4],o[14],o[15],o[9],o[6],o[11],o[12],o[13],o[16],o[17]]=r.slice(1);m.set(r[0],o)});
  (META.well||[]).forEach(r=>{const o=m.get(r[0])||blank(r[0]);const after=!GH||r[0]>=GH.until; // dernier jour de l'export = journée incomplète : intervals.icu prime
    for(let i=1;i<r.length;i++)if(r[i]!=null&&(after||o[i]==null))o[i]=r[i];m.set(r[0],o)});
  return[...m.values()].sort((a,b)=>a[0]<b[0]?-1:1)})();
const wMean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1), wSd=a=>{const m=wMean(a);return Math.sqrt(wMean(a.map(x=>(x-m)**2)))};
function recStatus(){
  const W=WELL;if(!W.length)return null;
  const last=k=>{for(let i=W.length-1;i>=0;i--)if(W[i][k]!=null)return W[i];return null};
  const W60=W.filter(r=>r[0]>=iso(addD(D(TODAY),-60)));
  const hv=W60.map(r=>r[1]).filter(v=>v!=null),rv=W60.map(r=>r[2]).filter(v=>v!=null);
  const o={h:last(1),rh:last(2),sl:last(3),hv,rv,hb:wMean(hv),hs:wSd(hv),rb:wMean(rv),why:[]};
  let warn=0;
  if(o.h&&hv.length>=7&&o.h[1]<o.hb-o.hs){warn++;o.why.push("HRV sous ta base")}
  if(o.rh&&rv.length>=7&&o.rh[2]>o.rb+5){warn++;o.why.push("FC repos haute")}
  if(o.sl&&o.sl[3]<6*3600){warn++;o.why.push("nuit courte")}
  o.st=warn>=2?["À surveiller","bad"]:warn===1?["Un peu juste","warn"]:["Bien récupéré","good"];
  return o;
}
const hmS=s=>`${Math.floor(s/3600)} h ${pad(Math.round(s%3600/60))}`;
// une nuit est datée du matin du réveil : « nuit du ven. 30 au sam. 31 oct. »
function nightLbl(d,short){const b=D(d),a=addD(b,-1);return short?`${JOURS[a.getDay()]} ${a.getDate()} → ${JOURS[b.getDay()]} ${b.getDate()} ${MOIS[b.getMonth()]}`:`nuit du ${JOURS[a.getDay()]} ${a.getDate()}${a.getMonth()!==b.getMonth()?" "+MOIS[a.getMonth()]:""} au ${JOURS[b.getDay()]} ${b.getDate()} ${MOIS[b.getMonth()]}`}
const bedTxt=r=>r&&r[16]&&r[17]?`${r[16].replace(":","h")} → ${r[17].replace(":","h")}`:"";
let recRange=store.get("hb-rec-range",30);
function metricLine(box,R,idx,o){
  const P=R.filter(r=>r[idx]!=null);if(P.length<2){box.innerHTML='<p class="sub">Pas encore assez de mesures.</p>';return}
  const t0=D(R[0][0]).getTime(),x=r=>(D(r[0]).getTime()-t0)/864e5;const span=Math.max(1,x(R.at(-1)));
  const pts=P.map(r=>[x(r),r[idx]]),roll=P.map((r,i)=>{const s=P.slice(Math.max(0,i-6),i+1);return[x(r),wMean(s.map(q=>q[idx]))]});
  const ys=pts.map(p=>p[1]).concat(o.ref!=null?[o.ref]:[]);const st=o.step||5;
  const y0=Math.floor((Math.min(...ys)-st/2)/st)*st,y1=Math.ceil((Math.max(...ys)+st/2)/st)*st;const yT=[];for(let v=y0;v<=y1+1e-9;v+=st*Math.max(1,Math.round((y1-y0)/st/5)))yT.push(v);
  const xt=[0,.25,.5,.75,1].map(f=>{const d=addD(D(R[0][0]),Math.round(span*f));return[span*f,`${d.getDate()} ${MOIS[d.getMonth()]}`]});
  lineChart(box,[{pts,dots:true,c:o.dot||css("--cool"),op:.65,r:2.4},{pts:roll,c:o.c||css("--accent"),w:2.4,end:true}],{h:o.h||190,y0,y1,yTicks:yT,yFmt:o.fmt||(v=>nf0.format(v)),xTicks:xt,x0:0,x1:span,
    ref:o.ref,refLabel:o.refLabel,invert:o.invert,
    snap:xv=>{let b=pts[0];pts.forEach(q=>{if(Math.abs(q[0]-xv)<Math.abs(b[0]-xv))b=q});return b[0]},
    tip:xv=>{let bi=0;pts.forEach((q,i)=>{if(Math.abs(q[0]-xv)<Math.abs(pts[bi][0]-xv))bi=i});const r=P[bi];return`<div class="k">${fDate(r[0],true)}</div><b>${(o.fmt||(v=>nf0.format(v)))(r[idx])}</b> ${o.unit||""}<br><span class="k">moy. 7 j ${(o.fmt||(v=>nf0.format(v)))(roll[bi][1])}</span>`}});
}
function renderRecup(){
  renderHealth();
  const has=WELL.length>0;$("#recGrid").hidden=!has;$("#recRange").hidden=!has;
  if(!has){$("#recEmpty").innerHTML=`<div class="card"><h2>Les données arrivent</h2><p class="sub" style="max-width:62ch">Ton sommeil, ta HRV, ta fréquence cardiaque au repos et tes pas viennent de ta montre Garmin, via intervals.icu. Ils s'afficheront ici après la prochaine synchronisation, en général après une nuit avec la montre. La mise à jour se fait chaque soir.</p></div>`;$("#recSub").textContent="";return}
  $("#recEmpty").innerHTML="";
  const R0=[[7,"7 j"],[30,"30 j"],[90,"3 mois"],[365,"1 an"],[9999,"Tout"]];
  $("#recRange").innerHTML=R0.map(r=>`<button class="chip ${r[0]===recRange?"on":""}" data-r="${r[0]}">${r[1]}</button>`).join("");
  $("#recRange").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{recRange=+c.dataset.r;store.set("hb-rec-range",recRange);renderRecup()});
  const lim=iso(addD(D(TODAY),-recRange+1));const R=WELL.filter(r=>r[0]>=lim);
  const S=recStatus();
  $("#recSub").textContent=`Données Garmin du ${fDate(WELL[0][0],true)} au ${fDate(WELL.at(-1)[0],true)} : export Garmin pour l'historique, puis mise à jour chaque soir via intervals.icu.`;
  const tile=(v,l)=>`<div class="tile"><div class="v num">${v}</div><div class="l">${l}</div></div>`;
  const tiles=[];
  if(S.h)tiles.push(tile(`${Math.round(S.h[1])}<small>ms</small>`,`HRV · base 60 j ${S.hv.length>=7?Math.round(S.hb):"–"}`));
  if(S.rh)tiles.push(tile(`${S.rh[2]}<small>bpm</small>`,`FC repos ${fDate(S.rh[0]).replace(/ \S+$/,"")} · base ${S.rv.length>=7?Math.round(S.rb):"–"}`));
  if(S.sl)tiles.push(tile(`${Math.floor(S.sl[3]/3600)}<small>h</small>${pad(Math.round(S.sl[3]%3600/60))}`,`${nightLbl(S.sl[0])}${bedTxt(S.sl)?` · ${bedTxt(S.sl)}`:""}${S.sl[4]?` · score ${S.sl[4]}`:""}`));
  const sl7=WELL.slice(-7).map(r=>r[3]).filter(v=>v);if(sl7.length)tiles.push(tile(`${Math.floor(wMean(sl7)/3600)}<small>h</small>${pad(Math.round(wMean(sl7)%3600/60))}`,"Sommeil moyen · 7 nuits"));
  $("#recSummary").innerHTML=`<div class="weekhead"><h2 style="margin:0">Ce matin</h2><span class="pill ${S.st[1]}">${S.st[0]}</span></div>
    <div class="tiles t4" style="margin-top:8px">${tiles.join("")}</div>
    <div class="note">${S.why.length?S.why.join(" · ")+" · ":""}« Base » = ta moyenne des 60 derniers jours. Le coach n'allège une séance que si plusieurs signaux sont mauvais en même temps.</div>`;
  // Sommeil
  const SL=R.filter(r=>r[3]);
  const col=s=>s<6*3600?css("--bad"):s<7*3600?css("--warn"):css("--accent");
  const avg=wMean(SL.map(r=>r[3]))/3600;
  $("#slSub").innerHTML=SL.length?`Moyenne ${hmS(avg*3600)} par nuit · ${SL.filter(r=>r[3]>=7*3600).length}/${SL.length} nuits à 7 h ou plus`:"";
  if(SL.length){const step=R.length>60?7:1;
    const lab=r=>{const d=D(r[0]);return SL.length>120?`${MOIS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`:`${d.getDate()}/${d.getMonth()+1}`};
    barChart($("#chSleep"),SL.map(r=>({l:lab(r),v:r[3]/3600,c:col(r[3]),
      tip:`<div class="k">${nightLbl(r[0])}${SL.length>120?" "+r[0].slice(0,4):""}</div><b>${hmS(r[3])}</b>${bedTxt(r)?`<br>${bedTxt(r)}`:""}${r[4]?`<br>Score ${r[4]}`:""}${r[14]?`<br>Profond ${hmS(r[14])} · paradoxal ${hmS(r[15]||0)}`:""}${r[5]?`<br>FC moy. ${r[5]} bpm`:""}`})),{h:200,ref:avg,refLabel:`moy. ${hmS(avg*3600)}`,yFmt:v=>`${nf1.format(v).replace(",0","")} h`,aria:"Durée de sommeil par nuit"});
  }else $("#chSleep").innerHTML='<p class="sub">Pas de mesure de sommeil sur cette période.</p>';
  $("#slLegend").innerHTML=`<span><i style="background:var(--accent)"></i>7 h et plus</span><span><i style="background:var(--warn)"></i>6 à 7 h</span><span><i style="background:var(--bad)"></i>moins de 6 h</span>`;
  // HRV, FC repos
  $("#hrvSub").textContent=S.hv.length>=7?`Base 60 j : ${Math.round(S.hb)} ms (± ${Math.round(S.hs)}). Plus haut = mieux récupéré.`:"Mesurée pendant la nuit. Plus haut = mieux récupéré.";
  if(!R.some(r=>r[1]!=null))$("#hrvSub").textContent="L'export Garmin ne contient pas la HRV : elle s'affiche à partir des mesures reçues via intervals.icu (depuis le 31 oct. 2026).";
  metricLine($("#chHrv"),R,1,{ref:S.hv.length>=7?S.hb:null,refLabel:"base",step:5,unit:"ms"});
  $("#rhrSub").textContent=S.rv.length>=7?`Base 60 j : ${Math.round(S.rb)} bpm. Plus bas = mieux récupéré.`:"Plus bas = mieux récupéré.";
  metricLine($("#chRhr"),R,2,{ref:S.rv.length>=7?S.rb:null,refLabel:"base",step:2,unit:"bpm",c:css("--c2"),dot:css("--c5")});
  // Body Battery et stress
  $("#bbSub").textContent="Niveau le plus haut de la journée (recharge pendant la nuit). Plus haut = mieux rechargé."+(GH&&GH.est_from?` Après le ${fDate(GH.export_until)} : estimation du matin d'après ton sommeil, ta FC au repos et la charge de la veille (± 6 points).`:"");
  metricLine($("#chBB"),R,12,{step:10,unit:"",c:css("--accent"),dot:css("--c3")});
  $("#stressSub").textContent="Stress moyen de la journée mesuré par la montre (0–100). Plus bas = plus calme."+(GH&&GH.est_from?` Pas d'estimation après le ${fDate(GH.export_until)} : sans la montre, ce ne serait pas fiable.`:"");
  metricLine($("#chStress"),R,11,{step:5,unit:"",c:css("--c2"),dot:css("--c5")});
  // Pas
  const ST=R.filter(r=>r[6]);$("#stepsCard").hidden=!ST.length;
  if(ST.length){const a=wMean(ST.map(r=>r[6]));$("#stSub").textContent=`Moyenne ${nf0.format(a)} pas par jour`;
    barChart($("#chSteps"),ST.map(r=>({l:ST.length>120?`${MOIS[D(r[0]).getMonth()]} ${String(D(r[0]).getFullYear()).slice(2)}`:`${D(r[0]).getDate()}/${D(r[0]).getMonth()+1}`,v:r[6],c:css("--c1"),tip:`<div class="k">${fDate(r[0])}</div><b>${nf0.format(r[6])}</b> pas`})),{h:170,ref:a,refLabel:"moy.",aria:"Pas par jour"})}
  // Tableau
  const T=WELL.slice(-14).reverse();
  $("#recTable").innerHTML=`<tr><th>Nuit</th><th>Coucher → réveil</th><th class="r">Sommeil</th><th class="r">Score</th><th class="r">HRV</th><th class="r">FC repos</th><th class="r">FC nuit</th><th class="r">Pas</th></tr>`+
    T.map(r=>`<tr><td>${nightLbl(r[0],true)}</td><td class="sub">${bedTxt(r)||"–"}</td><td class="r">${r[3]?`<span class="dot" style="background:${col(r[3])}"></span>${hmS(r[3])}`:"–"}</td><td class="r">${r[4]??"–"}</td><td class="r">${r[1]!=null?Math.round(r[1])+" ms":"–"}</td><td class="r">${r[2]?r[2]+" bpm":"–"}</td><td class="r">${r[5]?r[5]+" bpm":"–"}</td><td class="r">${r[6]?nf0.format(r[6]):"–"}</td></tr>`).join("");
}
/* ---------- JOURNAL ---------- */
let sportF="run",q="",shown=30;
const SF=[["run","Course + trail",a=>a.isRun],["bike","Vélo",a=>/Ride/.test(a.sport)],["hike","Rando",a=>a.sport==="Hike"||a.sport==="Walk"],["other","Autres",a=>!a.isRun&&!/Ride/.test(a.sport)&&a.sport!=="Hike"&&a.sport!=="Walk"],["all","Tout",()=>true]];
function renderJournal(){
  $("#sportChips").innerHTML=SF.map(s=>`<button class="chip ${s[0]===sportF?"on":""}" data-s="${s[0]}">${s[1]}</button>`).join("");
  $("#sportChips").querySelectorAll(".chip").forEach(c=>c.onclick=()=>{sportF=c.dataset.s;shown=30;renderJournal();if(sportF!=="run")loadBasemapWide();view.s=1;view.tx=0;view.ty=0;renderCityChips();drawMap()});
  const f=SF.find(s=>s[0]===sportF)[2];const qq=q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const norm=s=>(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  const L=A.filter(a=>f(a)&&(!qq||norm(a.name+" "+a.desc+" "+a.loc+" "+(SP[a.sport]||"")).includes(qq))).reverse();
  const km=L.reduce((s,a)=>s+a.km,0);
  $("#actCount").textContent=`${L.length} activité${L.length>1?"s":""} · ${nf0.format(km)} km`;
  const box=$("#actList");box.innerHTML="";L.slice(0,shown).forEach(a=>box.appendChild(actRow(a)));
  $("#moreBtn").style.display=L.length>shown?"":"none";
}
$("#moreBtn").onclick=()=>{shown+=30;renderJournal()};
let qT;$("#q").addEventListener("input",e=>{clearTimeout(qT);qT=setTimeout(()=>{q=e.target.value.trim();shown=30;renderJournal()},180)});

// Carte superposée
// La carte suit le filtre de sport du journal (les sorties virtuelles, type Zwift, sont exclues).
const mapActs=()=>{const f=SF.find(s=>s[0]===sportF)[2];return A.filter(a=>f(a)&&a.poly&&a.loc&&!/^Virtual/.test(a.sport))};
const mapCities=()=>{const c={};mapActs().forEach(r=>c[r.loc]=(c[r.loc]||0)+1);return Object.entries(c).sort((a,b)=>b[1]-a[1])};
let cities=mapCities();
let city=store.get("hb-city",META.ville||"");if(!cities.some(c=>c[0]===city))city=cities[0]?.[0];
const view={s:1,tx:0,ty:0};
function renderCityChips(){
  cities=mapCities();if(!cities.some(c=>c[0]===city))city=cities[0]?.[0];
  const lbl=SF.find(s=>s[0]===sportF)[1].toLowerCase();$("#mapWhat").textContent=sportF==="all"?"Tous tes tracés (tous sports)":`Tous tes tracés ${lbl}`;
  if(!cities.length){$("#cityChips").innerHTML='<span class="sub">Aucun tracé GPS pour ce filtre.</span>';return}
  const top=cities.slice(0,6);
  $("#cityChips").innerHTML=top.map(([c,n])=>`<button class="chip ${c===city?"on":""}" data-c="${esc(c)}">${esc(c)} <span style="opacity:.6">${n}</span></button>`).join("");
  $("#cityChips").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{city=b.dataset.c;store.set("hb-city",city);view.s=1;view.tx=0;view.ty=0;renderCityChips();drawMap()});
}
function drawMap(){
  const cv=$("#routeMap");const dpr=window.devicePixelRatio||1;const w=cv.clientWidth,h=cv.clientHeight;if(!w)return;
  cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext("2d");c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle=css("--map-bg");c.fillRect(0,0,w,h);
  const rs=mapActs().filter(r=>r.loc===city);$("#mapCount").textContent=`${rs.length} tracés`;
  const all=rs.map(pts);const flat=all.flat();if(!flat.length)return;
  // centre robuste (médiane) pour ignorer les tracés lointains
  const med=arr=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
  const la0=med(flat.map(p=>p[0])),lo0=med(flat.map(p=>p[1]));const k=Math.cos(la0*Math.PI/180);
  const dx=flat.map(p=>Math.abs((p[1]-lo0)*k)),dy=flat.map(p=>Math.abs(p[0]-la0));
  const q95=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length*.97)]||1e-3};
  const sx=(w/2-12)/q95(dx),sy=(h/2-12)/q95(dy);const s=Math.min(sx,sy)*view.s;
  const P=([la,lo])=>[w/2+view.tx+(lo-lo0)*k*s,h/2+view.ty-(la-la0)*s];
  const vb=[la0+(view.ty-h/2)/s,lo0+(-w/2-view.tx)/(k*s),la0+(h/2+view.ty)/s,lo0+(w/2-view.tx)/(k*s)];
  const based=drawBase(c,P,vb,s/110540);
  const recent=iso(addD(D(TODAY),-30));const zf=Math.min(2.2,1+Math.log2(Math.max(1,view.s))*.4);
  const line=p=>{c.beginPath();p.forEach((q,j)=>{const[x,y]=P(q);j?c.lineTo(x,y):c.moveTo(x,y)});c.stroke()};
  c.lineJoin="round";c.lineCap="round";
  c.globalAlpha=based?.55:.35;c.strokeStyle=css("--trk-halo");c.lineWidth=5*zf;all.forEach(line);c.globalAlpha=1;
  c.globalCompositeOperation="source-over";
  c.strokeStyle=css("--trk-old");c.lineWidth=2.4*zf;all.forEach((p,i)=>{if(rs[i].day<recent)line(p)});
  const rec=all.filter((p,i)=>rs[i].day>=recent);
  c.strokeStyle=css("--trk-halo");c.lineWidth=6.5*zf;rec.forEach(line);
  c.strokeStyle=css("--trk-new");c.lineWidth=3.2*zf;rec.forEach(line);
  c.fillStyle=css("--map-plate");c.fillRect(8,h-28,Math.min(w-16,320),20);c.font="600 11px Figtree, sans-serif";c.fillStyle=css("--trk-new");c.fillText("━ 30 derniers jours",14,h-14);c.fillStyle=css("--trk-key");c.fillText("━ avant (plus intense = plus souvent)",120,h-14);
  // échelle 1 km
  const px1k=s/111.32;let L=1;while(px1k*L>w/3)L/=2;while(px1k*L<40)L*=2;
  c.strokeStyle=css("--map-ink");c.lineWidth=2;c.beginPath();c.moveTo(w-14-px1k*L,h-16);c.lineTo(w-14,h-16);c.stroke();c.fillStyle=css("--map-ink");c.textAlign="right";c.fillText(`${L<1?L*1000+" m":L+" km"}`,w-14,h-22);if(based){c.font="500 10px Figtree, sans-serif";c.fillStyle=css("--muted");c.fillText(RL?"© OpenStreetMap · relief AWS Terrain Tiles":"© OpenStreetMap",w-10,14)}c.textAlign="left";
}
(function mapGestures(){const cv=$("#routeMap");const pts=new Map();let last=null;
  cv.addEventListener("wheel",e=>{e.preventDefault();const f=e.deltaY<0?1.15:1/1.15;zoomAt(f,e.offsetX,e.offsetY)},{passive:false});
  function zoomAt(f,x,y){const w=cv.clientWidth,h=cv.clientHeight;const ns=Math.max(.5,Math.min(30,view.s*f));f=ns/view.s;view.tx=(view.tx-(x-w/2))*f+(x-w/2);view.ty=(view.ty-(y-h/2))*f+(y-h/2);view.s=ns;drawMap()}
  cv.addEventListener("pointerdown",e=>{cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.offsetX,e.offsetY])});
  cv.addEventListener("pointermove",e=>{if(!pts.has(e.pointerId))return;const prev=pts.get(e.pointerId);
    if(pts.size===1){view.tx+=e.offsetX-prev[0];view.ty+=e.offsetY-prev[1];pts.set(e.pointerId,[e.offsetX,e.offsetY]);drawMap()}
    else if(pts.size===2){const [a,b]=[...pts.values()];const d0=Math.hypot(a[0]-b[0],a[1]-b[1]);pts.set(e.pointerId,[e.offsetX,e.offsetY]);const [c2,d2]=[...pts.values()];const d1=Math.hypot(c2[0]-d2[0],c2[1]-d2[1]);if(d0>0)zoomAt(d1/d0,(c2[0]+d2[0])/2,(c2[1]+d2[1])/2)}});
  const up=e=>pts.delete(e.pointerId);cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
  cv.addEventListener("dblclick",()=>{view.s=1;view.tx=0;view.ty=0;drawMap()});
  $("#zIn").onclick=()=>zoomAt(1.5,cv.clientWidth/2,cv.clientHeight/2);$("#zOut").onclick=()=>zoomAt(1/1.5,cv.clientWidth/2,cv.clientHeight/2);
  $("#zReset").onclick=()=>{view.s=1;view.tx=0;view.ty=0;drawMap()};
})();


/* ---------- COURSES (races.js : courses officielles + calendrier d'alternance) ---------- */
const RC=window.RACES||{weeks:[],races:[],bases:{}};
const WKL={};(RC.weeks||[]).forEach(([m,l])=>WKL[m]=l);
const LOCN=Object.assign({V:"Ville 1",H:"Ville 2",I:"Ailleurs"},META.lieux_alternance||{});
const LOCC={V:"var(--c1)",H:"var(--c2)",I:"var(--c6)"};
function whereOn(day){const d=D(day),m=iso(monday(d)),l=WKL[m];
  if(d.getDay()===0){const n=WKL[iso(addD(D(m),7))];if(l&&n&&n!==l)return{k:"T",a:l,b:n}}
  return{k:l||"?"}}
function fitOf(r){if(r.date.length<10)return"mois";const w=whereOn(r.date);if(w.k===r.z)return"ici";if(w.k==="T"&&(w.a===r.z||w.b===r.z))return"trajet";return"ailleurs"}
function locLabel(w){return w.k==="T"?`entre ${LOCN[w.a]} et ${LOCN[w.b]}`:(LOCN[w.k]||"calendrier inconnu")}
const crSt=Object.assign({fit:"ok",dist:"all",wk:null},store.get("ck_courses",{}));crSt.wk=null;
const DISTF={all:["Toutes",()=>true],d5:["5 km",r=>r.d.some(m=>m<6500)],d10:["10 km",r=>r.d.some(m=>m>=9500&&m<=10600)],o:["Autres distances",r=>r.d.some(m=>(m>=6500&&m<9500)||(m>10600&&m<20000))],semi:["Semi",r=>r.d.some(m=>m>20000)],rel:["Relais",r=>r.dl.some(x=>/relais|ekiden|duo/i.test(x))]};
if(!DISTF[crSt.dist])crSt.dist="all";
function crEst(r){const tgt=m=>2400/RIEGEL(10000)*RIEGEL(m);
  const ds=r.d.filter(m=>m>=4500).slice(0,2);
  return ds.map(m=>{const now=S5*RIEGEL(m),lab=m>20000?"Semi":m%1000?nf1.format(m/1000)+" km":(m/1000)+" km";
    return`<div><span>${lab} · ta forme</span> <b>${fmtT(now)}</b> <span>(${fmtP(now/(m/1000))}/km)</span>${r.date>="2027-01-01"?` · <span>si sub-40</span> <b>${fmtT(tgt(m))}</b>`:""}</div>`}).join("")}
function raceCard(r){const mo=r.date.length<10,d=D(mo?r.date+"-01":r.date),w=mo?{k:"?"}:whereOn(r.date),f=fitOf(r);
  const ses=mo?null:PLAN.flatMap(x=>x.items).find(s=>s.d===r.date);
  const st=f==="mois"?`<span class="pill warn">Jour pas encore publié</span>`:f==="ici"?`<span class="pill good">Tu es à ${esc(LOCN[r.z])}</span>`:f==="trajet"?`<span class="pill warn">Week-end ${esc(locLabel(w))}</span>`:`<span class="pill cool">Tu seras ${w.k==="T"?esc(locLabel(w)):"à "+esc(LOCN[w.k]||"?")}</span>`;
  return`<div class="race${r.pick?" pick":""}${f==="ailleurs"?" away":""}" id="race-${r.date}-${r.n.replace(/\W+/g,"").slice(0,20)}">
    <div class="rd"><small>${mo?"date":JOURS[d.getDay()]}</small><b>${mo?"?":d.getDate()}</b><small>${MOIS[d.getMonth()]}</small></div>
    <div>
      <div class="rn">${esc(r.n)}${r.pick?` <span class="pill acc" style="vertical-align:2px">${esc(r.pick)}</span>`:""}</div>
      <div class="rm"><span class="locdot" style="background:${LOCC[r.z]}"></span>${esc(r.c)} · ${r.km} km de ${esc(LOCN[r.z]||"")}${r.pr&&r.pr!=="inconnu"?" · "+esc(r.pr):""}</div>
      <div class="pl">${r.dl.map(x=>`<span class="pill cool">${esc(x)}</span>`).join("")}${r.lab?`<span class="pill acc">${esc(r.lab)}</span>`:""}${st}${r.ok||mo?"":`<span class="pill warn">Date à confirmer</span>`}</div>
      <div class="est num">${crEst(r)}</div>
      ${r.why?`<div class="why">${esc(r.why)}</div>`:""}
      ${ses&&ses.t!=="repos"?`<div class="sub" style="margin-top:6px">Au plan ce jour-là : <span class="dot" style="background:${TYPES[ses.t].c}"></span>${esc(ses.title)}</div>`:""}
      <div class="rnote">${esc(r.note)} <a href="${esc(r.url)}" target="_blank" rel="noopener">Site de la course ↗</a></div>
    </div></div>`}
function renderCourses(){
  const up=(RC.races||[]).filter(r=>r.date>=(r.date.length<10?TODAY.slice(0,7):TODAY));
  $("#crSub").textContent=`${up.length} courses officielles sur route et relais (5 km à semi), à environ 100 km de tes deux villes, jusqu'à fin mai. Quand l'organisateur n'a pas encore publié le jour, seul le mois est indiqué. Chronos estimés d'après ta forme du jour (estimation Garmin 5 km : ${fmtT(S5)}).`;
  // choix du coach
  const pk=up.filter(r=>r.pick);
  $("#crPicks").innerHTML=`<div class="eyebrow">Le choix du coach</div><h2 style="margin:4px 0 6px">Mes courses pour toi</h2>`+
    pk.map(r=>{const d=D(r.date.length<10?r.date+"-01":r.date);return`<div class="pickrow" data-d="${r.date}"><b>${d.getDate()} ${MOIS[d.getMonth()]}</b><div><div style="font-weight:600">${esc(r.n)} <span class="pill acc">${esc(r.pick)}</span></div><div class="sub" style="margin-top:3px">${esc(r.why)}</div></div></div>`}).join("")+
    `<div class="note">Une course choisie remplace la séance de qualité de la semaine : dis-moi laquelle tu retiens et j'adapte le plan (affûtage, séance courte à allure course 3 jours avant).</div>`;
  document.querySelectorAll("#crPicks .pickrow").forEach(el=>el.onclick=()=>{crSt.fit="all";crSt.dist="all";crSt.wk=iso(addD(monday(D(el.dataset.d)),5));draw("courses");const t=document.querySelector(`#crList .race[id^="race-${el.dataset.d}"]`);t&&t.scrollIntoView({behavior:"smooth",block:"center"})});
  // week-ends
  const sats=[];let s=addD(monday(D(TODAY)),5);const last=up.length?up.at(-1).date:TODAY;
  while(iso(s)<=last){sats.push(iso(s));s=addD(s,7)}
  $("#crLegend").innerHTML=`<span class="locdot" style="background:var(--c1)"></span>${esc(LOCN.V)} <span class="locdot" style="background:var(--c2);margin-left:8px"></span>${esc(LOCN.H)}`;
  $("#crWeeks").innerHTML=sats.map(sa=>{const su=iso(addD(D(sa),1)),w1=whereOn(sa),w2=whereOn(su);
    const k=w2.k==="T"?"T":w1.k;const n=up.filter(r=>(r.date===sa||r.date===su)&&fitOf(r)!=="ailleurs").length;
    const a=D(sa),b=D(su);
    return`<button class="wk ${k}${crSt.wk===sa?" on":""}" data-s="${sa}"><b>${a.getDate()}–${b.getDate()} ${MOIS[b.getMonth()]}</b>${w2.k==="T"?`${esc(LOCN[w2.a])} → ${esc(LOCN[w2.b])}`:esc(LOCN[k]||"–")}<div class="n">${n?n+" course"+(n>1?"s":""):"—"}</div></button>`}).join("");
  document.querySelectorAll("#crWeeks .wk").forEach(b=>b.onclick=()=>{crSt.wk=crSt.wk===b.dataset.s?null:b.dataset.s;renderCourses()});
  // filtres
  $("#crFit").innerHTML=[["ok","Compatibles avec ton calendrier"],["all","Toutes les courses"]].map(([k,l])=>`<button class="chip${crSt.fit===k?" on":""}" data-k="${k}">${l}</button>`).join("");
  $("#crDist").innerHTML=Object.entries(DISTF).map(([k,[l]])=>`<button class="chip${crSt.dist===k?" on":""}" data-k="${k}">${l}</button>`).join("");
  document.querySelectorAll("#crFit .chip").forEach(b=>b.onclick=()=>{crSt.fit=b.dataset.k;store.set("ck_courses",{fit:crSt.fit,dist:crSt.dist});renderCourses()});
  document.querySelectorAll("#crDist .chip").forEach(b=>b.onclick=()=>{crSt.dist=b.dataset.k;store.set("ck_courses",{fit:crSt.fit,dist:crSt.dist});renderCourses()});
  // liste
  let L=up.filter(DISTF[crSt.dist][1]);
  if(crSt.fit==="ok")L=L.filter(r=>fitOf(r)!=="ailleurs");
  if(crSt.wk){const su=iso(addD(D(crSt.wk),1));L=L.filter(r=>r.date===crSt.wk||r.date===su)}
  $("#crCount").innerHTML=`${L.length} course${L.length>1?"s":""}${crSt.wk?` le week-end du ${fDate(crSt.wk)} · <a href="#courses" id="crAllW">tous les week-ends</a>`:""}`;
  const ca=$("#crAllW");if(ca)ca.onclick=e=>{e.preventDefault();crSt.wk=null;renderCourses()};
  const grp=[];L.forEach(r=>{const m=r.date.slice(0,7);if(!grp.length||grp.at(-1).m!==m)grp.push({m,rs:[]});grp.at(-1).rs.push(r)});
  $("#crList").innerHTML=grp.length?grp.map(g=>{const d=D(g.m+"-01");return`<div class="mhead">${d.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</div><div class="list">${g.rs.map(raceCard).join("")}</div>`}).join(""):`<div class="card sub">Aucune course avec ces filtres.</div>`;
}


/* ---------- SANTÉ : poids et tension (saisies gardées dans la base de l'artefact, lisibles par toi seul) ---------- */
const HS={db:null,state:"loading",w:[],bp:[],bpMoment:null,bpEdit:null};
(async()=>{
  await null;
  const t=setTimeout(()=>{if(HS.state==="loading"){HS.state="slow";healthRefresh()}},10000);
  let db=null;try{db=await claude.use("db")}catch(e){}
  if(!db){clearTimeout(t);HS.state="off";healthRefresh();return}
  HS.db=db;let got=0;const done=()=>{if(++got>=2){clearTimeout(t);HS.state="ok";healthRefresh()}};
  let f1=false,f2=false;
  db.collection("sante_poids").onSnapshot(s=>{HS.w=s.docs.map(d=>Object.assign({id:d.id},d.data()));if(!f1&&!s.metadata.fromCache){f1=true;done()}else healthRefresh()},e=>{clearTimeout(t);HS.state="err";healthRefresh()});
  db.collection("sante_tension").onSnapshot(s=>{HS.bp=s.docs.map(d=>Object.assign({id:d.id},d.data()));if(!f2&&!s.metadata.fromCache){f2=true;done()}else healthRefresh()},e=>{clearTimeout(t);HS.state="err";healthRefresh()});
})();
function healthRefresh(){if((location.hash||"").slice(1)==="recup")renderHealth()}
function hNote(){return HS.state==="off"?`<div class="note">La saisie n'est pas disponible pour l'instant.</div>`:HS.state==="slow"?`<div class="note">Tes mesures n'arrivent pas encore : elles peuvent être incomplètes.</div>`:HS.state==="err"?`<div class="note">Tes mesures n'ont pas pu être chargées. Recharge la page plus tard.</div>`:""}
function canSave(){return!!HS.db&&HS.state!=="err"}
function num(v){const x=parseFloat(String(v).replace(",","."));return isFinite(x)?x:null}
function dayX(d0,d){return(D(d).getTime()-D(d0).getTime())/864e5}
function monthTicks(a,b){const span=Math.max(1,dayX(a,b));return[0,.25,.5,.75,1].map(f=>{const d=addD(D(a),Math.round(span*f));return[span*f,`${d.getDate()} ${MOIS[d.getMonth()]}${span>300?" "+String(d.getFullYear()).slice(2):""}`]})}
/* --- Poids --- */
function renderWeight(){
  const man=HS.w.filter(r=>r.d&&r.kg).map(r=>({d:r.d,kg:r.kg,id:r.id,src:"toi"}));
  const md=new Set(man.map(r=>r.d));
  const gar=WELL.filter(r=>r[7]&&!md.has(r[0])).map(r=>({d:r[0],kg:r[7],src:"Garmin"}));
  const P=man.concat(gar).sort((a,b)=>a.d<b.d?-1:1);
  const last=P.at(-1);
  const near=(days)=>{const lim=iso(addD(D(TODAY),-days));let r=null;P.forEach(p=>{if(p.d<=lim)r=p});return r};
  const m30=near(30)||P.find(p=>p.d>=iso(addD(D(TODAY),-30))&&p!==last),m90=P.filter(p=>p.d>=iso(addD(D(TODAY),-90)));
  const tile=(v,l)=>`<div class="tile"><div class="v num">${v}</div><div class="l">${l}</div></div>`;
  const dlt=last&&m30?last.kg-m30.kg:null;
  $("#wtCard").innerHTML=`<div class="weekhead"><h2 style="margin:0">Poids</h2>${last?`<span class="sub">Dernière pesée ${fDate(last.d,true)}</span>`:""}</div>
    ${P.length?`<div class="tiles t4" style="margin-top:8px">${tile(`${nf1.format(last.kg)}<small>kg</small>`,"Dernière pesée")}${tile(dlt==null?"–":`${dlt>0?"+":""}${nf1.format(dlt)}<small>kg</small>`,m30?`Depuis le ${fDate(m30.d).replace(/^\S+ /,"")}`:"Sur 30 jours")}${m90.length?tile(`${nf1.format(Math.min(...m90.map(p=>p.kg)))}<small>kg</small>`,"Mini 90 j"):""}${m90.length?tile(`${nf1.format(Math.max(...m90.map(p=>p.kg)))}<small>kg</small>`,"Maxi 90 j"):""}</div>
    <div class="chart" id="chWt" style="margin-top:10px"></div>`:`<p class="sub">Aucune pesée pour l'instant : entre la première ci-dessous.</p>`}
    <form class="hform" id="wtForm"><label>Date<input class="inp d" type="date" name="d" value="${TODAY}" max="${TODAY}" required></label><label>Poids (kg)<input class="inp n" type="text" inputmode="decimal" name="kg" placeholder="72,4" required></label><button class="btn primary" type="submit" ${canSave()?"":"disabled"}>Enregistrer</button></form>
    <div class="hmsg sub" id="wtMsg">${esc(HS.wtMsg||"")}</div>${hNote()}
    ${man.length?`<details class="hd"><summary>Mes pesées saisies (${man.length})</summary><div class="hlist">${man.slice().reverse().slice(0,30).map(r=>`<div class="hrow"><span>${fDate(r.d,true)}</span><b class="num">${nf1.format(r.kg)} kg</b><button class="xbtn" data-id="${esc(r.id)}" title="Supprimer" aria-label="Supprimer la pesée du ${fDate(r.d,true)}">✕</button></div>`).join("")}</div></details>`:""}
    <div class="note">Les pesées venues de ta balance ou de Garmin s'ajoutent automatiquement ; une pesée saisie remplace celle de Garmin le même jour.</div>`;
  if(P.length>=2){const a=P[0].d;const pts=P.map(p=>[dayX(a,p.d),p.kg]);
    const roll=P.map((p,i)=>{const s=P.filter(q=>q.d<=p.d&&q.d>=iso(addD(D(p.d),-13)));return[dayX(a,p.d),s.reduce((x,q)=>x+q.kg,0)/s.length]});
    const ys=P.map(p=>p.kg);const y0=Math.floor(Math.min(...ys)-1),y1=Math.ceil(Math.max(...ys)+1);const st=Math.max(1,Math.round((y1-y0)/4));const yT=[];for(let v=y0;v<=y1;v+=st)yT.push(v);
    lineChart($("#chWt"),[{pts,dots:true,c:css("--c6"),op:.75,r:3},{pts:roll,c:css("--accent"),w:2.4,end:true}],{h:190,y0,y1,yTicks:yT,yFmt:v=>nf0.format(v),xTicks:monthTicks(a,P.at(-1).d),x0:0,x1:Math.max(1,dayX(a,P.at(-1).d)),aria:"Évolution du poids",
      snap:xv=>{let b=pts[0];pts.forEach(q=>{if(Math.abs(q[0]-xv)<Math.abs(b[0]-xv))b=q});return b[0]},
      tip:xv=>{let bi=0;pts.forEach((q,i)=>{if(Math.abs(q[0]-xv)<Math.abs(pts[bi][0]-xv))bi=i});const p=P[bi];return`<div class="k">${fDate(p.d,true)} · ${p.src}</div><b>${nf1.format(p.kg)}</b> kg<br><span class="k">moy. 14 j ${nf1.format(roll[bi][1])}</span>`}})}
  $("#wtForm").onsubmit=async e=>{e.preventDefault();const f=e.target,d=f.d.value,kg=num(f.kg.value),msg=$("#wtMsg");
    if(!d||d>TODAY){msg.textContent="Choisis une date passée.";return}
    if(kg==null||kg<30||kg>200){msg.textContent="Entre un poids entre 30 et 200 kg (ex. 72,4).";return}
    msg.textContent="Enregistrement…";
    try{await HS.db.collection("sante_poids").doc(d).set({d,kg:Math.round(kg*10)/10,t:Date.now()});HS.wtMsg=`Pesée du ${fDate(d)} enregistrée.`;msg.textContent=HS.wtMsg;f.kg.value=""}
    catch(err){msg.textContent=err&&err.code==="quota_exceeded"?"La base est pleine : supprime d'anciennes pesées.":"Pas pu enregistrer : réessaie dans un moment."}};
  $("#wtCard").querySelectorAll(".xbtn").forEach(b=>b.onclick=async()=>{if(!confirm("Supprimer cette pesée ?"))return;try{await HS.db.collection("sante_poids").doc(b.dataset.id).delete()}catch(e){$("#wtMsg").textContent="Pas pu supprimer : réessaie."}});
}
/* --- Tension : séances matin / soir de 1 à 3 mesures, regroupées en séries (jours proches) --- */
function bpSessions(){return HS.bp.filter(r=>r.d&&Array.isArray(r.r)&&r.r.length).map(r=>{const v=r.r.filter(x=>x&&x[0]&&x[1]);const m=i=>v.reduce((a,x)=>a+x[i],0)/v.length;const pv=v.filter(x=>x[2]);
  return{id:r.id,d:r.d,m:r.m,r:v,s:m(0),di:m(1),p:pv.length?pv.reduce((a,x)=>a+x[2],0)/pv.length:null}}).filter(x=>x.r.length).sort((a,b)=>(a.d+a.m)<(b.d+b.m)?-1:1)}
function bpSeries(S){const out=[];S.forEach(x=>{const g=out.at(-1);if(g&&dayX(g.end,x.d)<=3){g.items.push(x);g.end=x.d}else out.push({start:x.d,end:x.d,items:[x]})});
  out.forEach(g=>{const all=g.items.flatMap(x=>x.r);const avg=(L,i)=>L.length?L.reduce((a,x)=>a+x[i],0)/L.length:null;
    g.n=all.length;g.days=new Set(g.items.map(x=>x.d)).size;g.s=avg(all,0);g.di=avg(all,1);const pv=all.filter(x=>x[2]);g.p=pv.length?avg(pv,2):null;
    const mo=g.items.filter(x=>x.m==="matin").flatMap(x=>x.r),so=g.items.filter(x=>x.m==="soir").flatMap(x=>x.r);
    g.mo=mo.length?[avg(mo,0),avg(mo,1)]:null;g.so=so.length?[avg(so,0),avg(so,1)]:null;
    const after=g.items.filter(x=>x.d!==g.start).flatMap(x=>x.r);g.x1=g.days>=4&&after.length?[avg(after,0),avg(after,1)]:null});return out}
function bpClass(s,d){return s>=135||d>=85?["Au-dessus du seuil d'automesure (135/85)","warn"]:["Sous le seuil d'automesure (135/85)","good"]}
function renderBP(){
  const S=bpSessions(),G=bpSeries(S),last=G.at(-1);
  const r0=v=>v==null?"–":Math.round(v);
  const nowM=new Date().getHours()<14?"matin":"soir";if(!HS.bpMoment)HS.bpMoment=nowM;
  const exist=S.find(x=>x.d===TODAY&&x.m===HS.bpMoment);
  $("#bpCard").innerHTML=`<div class="weekhead"><h2 style="margin:0">Tension artérielle</h2>${last?`<span class="sub">${G.length} série${G.length>1?"s":""} · ${S.length} séance${S.length>1?"s":""}</span>`:""}</div>
    ${last?(()=>{const c=bpClass(last.s,last.di);return`<div class="bpbox" style="margin-top:8px"><div class="eyebrow">Dernière série · ${last.start===last.end?fDate(last.start,true):`du ${fDate(last.start)} au ${fDate(last.end,true)}`}</div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:4px"><div class="bpbig">${r0(last.s)}/${r0(last.di)}<small>mmHg</small></div><span class="pill ${c[1]}">${c[0]}</span></div>
      <div class="sub" style="margin-top:6px">Moyenne de ${last.n} mesure${last.n>1?"s":""} sur ${last.days} jour${last.days>1?"s":""}${last.p?` · pouls ${r0(last.p)} bpm`:""}${last.mo?` · matin ${r0(last.mo[0])}/${r0(last.mo[1])}`:""}${last.so?` · soir ${r0(last.so[0])}/${r0(last.so[1])}`:""}${last.x1?` · sans le 1er jour ${r0(last.x1[0])}/${r0(last.x1[1])}`:""}</div></div>`})():`<p class="sub">Aucune mesure pour l'instant. Saisis ta séance du matin ou du soir ci-dessous : jusqu'à 3 mesures à la suite.</p>`}
    ${S.length>=2?`<div class="chart" id="chBp" style="margin-top:10px"></div><div class="legend"><span><i style="background:var(--c2)"></i>Systolique (haute)</span><span><i style="background:var(--c1)"></i>Diastolique (basse)</span><span><i style="background:var(--accent)"></i>Seuils 135 et 85</span></div>`:""}
    <form class="hform" id="bpForm" autocomplete="off">
      <label>Date<input class="inp d" type="date" name="d" value="${HS.bpDate||TODAY}" max="${TODAY}" required></label>
      <label>Moment<span class="seg" id="bpSeg"><button type="button" data-m="matin" class="${HS.bpMoment==="matin"?"on":""}">Matin</button><button type="button" data-m="soir" class="${HS.bpMoment==="soir"?"on":""}">Soir</button></span></label>
    </form>
    <div class="bpgrid" id="bpGrid"><span></span><span class="h">Systolique</span><span class="h">Diastolique</span><span class="h">Pouls</span>
      ${[1,2,3].map(i=>`<span>Mesure ${i}</span><input class="inp n" inputmode="numeric" data-i="${i-1}" data-k="0" placeholder="${i===1?"125":""}" aria-label="Mesure ${i}, systolique"><input class="inp n" inputmode="numeric" data-i="${i-1}" data-k="1" placeholder="${i===1?"78":""}" aria-label="Mesure ${i}, diastolique"><input class="inp n" inputmode="numeric" data-i="${i-1}" data-k="2" placeholder="${i===1?"58":""}" aria-label="Mesure ${i}, pouls">`).join("")}
    </div>
    <div class="btnrow"><button class="btn primary" id="bpSave" ${canSave()?"":"disabled"}>Enregistrer la séance</button></div>
    <div class="hmsg sub" id="bpMsg">${HS.bpMsg?esc(HS.bpMsg):exist?`Tu as déjà une séance ${HS.bpMoment==="matin"?"du matin":"du soir"} ce jour-là : l'enregistrer la remplacera.`:""}</div>${hNote()}
    ${G.length?`<details class="hd"><summary>Détail des séries</summary>${G.slice().reverse().map(g=>`<div style="margin-top:10px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${g.start===g.end?fDate(g.start,true):`${fDate(g.start)} → ${fDate(g.end,true)}`}</b><span class="num">moy. <b>${r0(g.s)}/${r0(g.di)}</b>${g.p?` · ${r0(g.p)} bpm`:""}</span></div><div class="hlist">${g.items.map(x=>`<div class="hrow"><span>${fDate(x.d)} · ${x.m}</span><span class="num sub">${x.r.map(v=>`${v[0]}/${v[1]}${v[2]?` (${v[2]})`:""}`).join(" · ")}</span><button class="xbtn" data-id="${esc(x.id)}" title="Supprimer" aria-label="Supprimer la séance">✕</button></div>`).join("")}</div></div>`).join("")}</details>`:""}
    <div class="note">Méthode conseillée pour l'automesure : assis, au calme depuis 5 min, 3 mesures à 1 min d'intervalle, le matin avant le petit-déjeuner et les médicaments, et le soir avant le coucher, plusieurs jours de suite. Les séances à 3 jours d'écart au plus forment une même série. Le repère 135/85 est le seuil usuel de l'automesure à domicile : ces chiffres ne remplacent pas l'avis de ton médecin.</div>`;
  if(S.length>=2){const a=S[0].d;const xo=x=>dayX(a,x.d)+(x.m==="soir"?.5:0);
    const ps=S.map(x=>[xo(x),x.s]),pd=S.map(x=>[xo(x),x.di]);const ys=S.flatMap(x=>[x.s,x.di]).concat([135,85]);
    const y0=Math.floor((Math.min(...ys)-5)/10)*10,y1=Math.ceil((Math.max(...ys)+5)/10)*10;const yT=[];for(let v=y0;v<=y1;v+=y1-y0>60?20:10)yT.push(v);
    const span=Math.max(1,xo(S.at(-1)));
    lineChart($("#chBp"),[{pts:[[0,85],[span,85]],c:css("--accent"),w:1.2,op:.6},{pts:ps,c:css("--c2"),w:1.6,op:.5},{pts:ps,dots:true,c:css("--c2"),op:.9,r:3},{pts:pd,c:css("--c1"),w:1.6,op:.5},{pts:pd,dots:true,c:css("--c1"),op:.9,r:3}],
      {h:200,y0,y1,yTicks:yT,ref:135,refLabel:"135",xTicks:monthTicks(a,S.at(-1).d),x0:0,x1:span,aria:"Tension par séance",
       snap:xv=>{let b=ps[0];ps.forEach(q=>{if(Math.abs(q[0]-xv)<Math.abs(b[0]-xv))b=q});return b[0]},
       tip:xv=>{let bi=0;ps.forEach((q,i)=>{if(Math.abs(q[0]-xv)<Math.abs(ps[bi][0]-xv))bi=i});const x=S[bi];return`<div class="k">${fDate(x.d,true)} · ${x.m}</div><b>${Math.round(x.s)}/${Math.round(x.di)}</b> mmHg${x.p?`<br>pouls ${Math.round(x.p)} bpm`:""}<br><span class="k">${x.r.length} mesure${x.r.length>1?"s":""}</span>`}})}
  const seg=$("#bpSeg");seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{HS.bpMoment=b.dataset.m;HS.bpMsg="";HS.bpDate=$("#bpForm").d.value;renderBP()});
  $("#bpForm").d.onchange=e=>{HS.bpDate=e.target.value;const ex=S.find(x=>x.d===HS.bpDate&&x.m===HS.bpMoment);$("#bpMsg").textContent=ex?"Une séance existe déjà à ce moment-là : l'enregistrer la remplacera.":""};
  $("#bpSave").onclick=async()=>{const msg=$("#bpMsg"),d=$("#bpForm").d.value;
    if(!d||d>TODAY){msg.textContent="Choisis une date passée.";return}
    const rows=[[],[],[]];$("#bpGrid").querySelectorAll("input").forEach(i=>{rows[+i.dataset.i][+i.dataset.k]=i.value.trim()});
    const R=[];for(const [s,di,p] of rows){if(!s&&!di&&!p)continue;const S_=num(s),D_=num(di),P_=p?num(p):null;
      if(S_==null||D_==null||S_<70||S_>250||D_<40||D_>150||S_<=D_||(p&&(P_==null||P_<30||P_>200))){msg.textContent="Vérifie tes chiffres : systolique 70–250, diastolique 40–150 (plus basse que la systolique), pouls 30–200.";return}
      R.push(P_?[Math.round(S_),Math.round(D_),Math.round(P_)]:[Math.round(S_),Math.round(D_)])}
    if(!R.length){msg.textContent="Entre au moins une mesure.";return}
    msg.textContent="Enregistrement…";
    try{await HS.db.collection("sante_tension").doc(`${d}_${HS.bpMoment}`).set({d,m:HS.bpMoment,r:R,t:Date.now()});HS.bpDate=d;
      $("#bpGrid").querySelectorAll("input").forEach(i=>i.value="");HS.bpMsg=`Séance du ${fDate(d)} (${HS.bpMoment}) enregistrée : ${R.length} mesure${R.length>1?"s":""}.`;msg.textContent=HS.bpMsg}
    catch(err){msg.textContent=err&&err.code==="quota_exceeded"?"La base est pleine.":"Pas pu enregistrer : réessaie dans un moment."}};
  $("#bpCard").querySelectorAll(".xbtn").forEach(b=>b.onclick=async()=>{if(!confirm("Supprimer cette séance ?"))return;try{await HS.db.collection("sante_tension").doc(b.dataset.id).delete()}catch(e){$("#bpMsg").textContent="Pas pu supprimer : réessaie."}});
}
function renderHealth(){
  // ne pas effacer une saisie en cours si une mise à jour arrive
  const busy=document.activeElement&&document.activeElement.closest&&document.activeElement.closest("#wtCard,#bpCard")&&document.activeElement.tagName==="INPUT";
  if(busy&&HS.state==="ok"){clearTimeout(renderHealth._t);renderHealth._t=setTimeout(renderHealth,1500);return}
  renderWeight();renderBP();
}

/* ---------- Routing ---------- */
const VIEWS=["accueil","plan","stats","recup","records","courses","journal"];const rendered={};
function route(){let v=(location.hash||"#accueil").slice(1);if(!VIEWS.includes(v))v="accueil";
  VIEWS.forEach(x=>{$("#v-"+x).classList.toggle("on",x===v)});
  document.querySelectorAll("nav.tabs a").forEach(a=>{a.classList.toggle("on",a.dataset.v===v);a.setAttribute("aria-current",a.dataset.v===v?"page":"false")});
  draw(v);window.scrollTo(0,0)}
function draw(v){
  if(v==="accueil"){renderGoal();renderNext();renderWeek();renderForm();renderRec();renderYear();renderLast()}
  if(v==="plan"){renderPlan();renderZones()}
  if(v==="stats"){renderLoad();renderStats()}
  if(v==="courses")renderCourses();
  if(v==="records")renderRecords();
  if(v==="recup")renderRecup();
  if(v==="journal"){loadBasemap();renderCityChips();drawMap();renderJournal()}
  rendered[v]=true;
}
window.addEventListener("hashchange",route);
function redrawTheme(){const v=(location.hash||"#accueil").slice(1);draw(VIEWS.includes(v)?v:"accueil");if($("#sheet").classList.contains("on")&&openSheet._a)drawRoute($("#sheetMap"),openSheet._a,{big:true,color:css(SPC[openSheet._a.sport]||"--accent")})}
try{matchMedia("(prefers-color-scheme: light)").addEventListener("change",redrawTheme)}catch(e){}
new MutationObserver(redrawTheme).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
let rz;window.addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(()=>{const v=(location.hash||"#accueil").slice(1);draw(VIEWS.includes(v)?v:"accueil")},200)});
$("#streakN").textContent=STREAK;
if(META.owner){$("#brandName").innerHTML=esc(META.owner)+(META.ville?` <span>·</span> ${esc(META.ville)}`:"");document.title=`Cockpit running ${META.owner}`}
$("#sync").textContent=`Données Garmin au ${fDate(SNAP,true)} · ${A.length} activités depuis ${MOIS[D(A[0].day).getMonth()]} ${A[0].day.slice(0,4)}`;
route();
