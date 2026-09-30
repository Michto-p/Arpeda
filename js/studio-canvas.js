'use strict';

// ════════════════════════════════════════════════════════════════
//  ÉDITEUR PC — moteur du plan : vue, accrochage, outils, sélection, rendu
//  Unités : mètres, y vers le bas (comme le reste de l'application).
// ════════════════════════════════════════════════════════════════
const ST = {
  tool:'select', place:null,
  sx:0, sy:0, p:{x:0,y:0}, snap:null,           // souris (écran, monde), point accroché
  poly:[], rectA:null, typed:'', arA:null,        // outils de tracé
  down:null, drag:null, hover:null,               // gestes
  space:false, pan:null,
  measure:null, selV:null, selSeg:null,
  opts:{grid:true, snap:true, ortho:true, dims:true},
  noSnap:false, shift:false, clip:null, keysOn:false, zc:null, hatch:null, lenEdit:null,
};

// ── Géométrie ──
const _d = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
function _unit(dx,dy){ const l=Math.hypot(dx,dy)||1; return {x:dx/l, y:dy/l}; }
function stWallPts(w){ return w.closed ? [...w.pts, w.pts[0]] : w.pts; }
function stWallThick(w){
  const comp = w.comp ? COMP_LIB[w.comp] : null;
  return comp ? compThickness(comp) : (w.kind==='int' ? 0.10 : 0.20);
}
function stSignedArea(pts){ let a=0; for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length; a+=pts[i].x*pts[j].y-pts[j].x*pts[i].y; } return a/2; }
function stCentroid(pts){
  let cx=0,cy=0,a=0;
  for(let i=0;i<pts.length;i++){ const j=(i+1)%pts.length, f=pts[i].x*pts[j].y-pts[j].x*pts[i].y; cx+=(pts[i].x+pts[j].x)*f; cy+=(pts[i].y+pts[j].y)*f; a+=f; }
  if(Math.abs(a)<1e-9) return pts[0];
  return {x:cx/(3*a), y:cy/(3*a)};
}
// Décalage d'une polyligne (coins en onglet). d>0 : côté de la normale gauche (-dy,dx)
function stOffset(pts, closed, d){
  const n=pts.length, out=[];
  for(let i=0;i<n;i++){
    const prev = closed ? pts[(i-1+n)%n] : (i>0?pts[i-1]:null);
    const next = closed ? pts[(i+1)%n] : (i<n-1?pts[i+1]:null);
    const nrm=(a,b)=>{ const u=_unit(b.x-a.x,b.y-a.y); return {x:-u.y, y:u.x}; };
    const n1=prev?nrm(prev,pts[i]):null, n2=next?nrm(pts[i],next):null;
    let m;
    if(!n1) m=n2; else if(!n2) m=n1;
    else {
      const dot=1+n1.x*n2.x+n1.y*n2.y;
      if(dot<0.15) m=n1; else { m={x:(n1.x+n2.x)/dot, y:(n1.y+n2.y)/dot}; const l=Math.hypot(m.x,m.y); if(l>3){ m.x*=3/l; m.y*=3/l; } }
    }
    out.push({x:pts[i].x+m.x*d, y:pts[i].y+m.y*d});
  }
  return out;
}
// Normale unitaire d'un segment orientée vers l'intérieur de la pièce (murs fermés), sinon la gauche
function stInwardNormal(w, si){
  const pts=stWallPts(w), a=pts[si], b=pts[si+1];
  const u=_unit(b.x-a.x,b.y-a.y); let n={x:-u.y,y:u.x};
  if(w.closed){
    const m={x:(a.x+b.x)/2+n.x*0.1, y:(a.y+b.y)/2+n.y*0.1};
    if(!ptInPoly(m.x,m.y,w.pts)) n={x:-n.x,y:-n.y};
  }
  return n;
}

// ── Vue ──
function stCanvas(){ return document.getElementById('cvStudio'); }
function stPos(e){ const r=stCanvas().getBoundingClientRect(); return {sx:e.clientX-r.left, sy:e.clientY-r.top}; }
function stWorld(sx,sy){ return screenToM(sx,sy,VIEWS.studio); }
function stTolM(px){ return px/VIEWS.studio.sc; }
function stGridStep(){ const sc=VIEWS.studio.sc; return sc>=140?0.05 : sc>=50?0.10 : 0.25; }

// ════════════════════════════════
//  ACCROCHAGE
// ════════════════════════════════
// raw : point monde. opt.from : point précédent (contrainte d'angle) ; opt.exclude : [[wi,vi],…] ; opt.edge : accroche sur les murs
function stSnap(raw, opt={}){
  const res={x:raw.x, y:raw.y, kind:null, gx:null, gy:null};
  if(!ST.opts.snap || ST.noSnap) return res;
  const tol=stTolM(11), ex=opt.exclude||[];
  let best=null, bd=tol;
  // 1. sommets et milieux
  SC.walls.forEach((w,wi)=>{
    w.pts.forEach((p,vi)=>{
      if(ex.some(e=>e[0]===wi&&e[1]===vi)) return;
      const d=_d(p,raw); if(d<bd){ bd=d; best={x:p.x,y:p.y,kind:'end'}; }
    });
    const pts=stWallPts(w);
    for(let i=0;i<pts.length-1;i++){
      if(ex.some(e=>e[0]===wi&&(e[1]===i||e[1]===(i+1)%w.pts.length))) continue;
      const m={x:(pts[i].x+pts[i+1].x)/2, y:(pts[i].y+pts[i+1].y)/2};
      const d=_d(m,raw); if(d<bd*0.8){ bd=d*1.25; best={x:m.x,y:m.y,kind:'mid'}; }
    }
  });
  if(best) return {...res, ...best};
  // 2. repère RA (A)
  if(opt.ar){ const a=getArRef().a; if(_d(a,raw)<tol) return {...res,x:a.x,y:a.y,kind:'end'}; }
  let q={x:raw.x,y:raw.y}, kind=null;
  // 3. contrainte d'angle depuis le point précédent
  if(opt.from){
    const dx=q.x-opt.from.x, dy=q.y-opt.from.y, len=Math.hypot(dx,dy);
    if(len>1e-6){
      const ang=Math.atan2(dy,dx), step=Math.PI/4, k=Math.round(ang/step), snapA=k*step;
      const near = Math.abs(ang-snapA)<0.17;   // ≈10°
      const lock = ST.opts.ortho ? (near && !ST.shift) : ST.shift;
      let a2=ang;
      if(lock){ a2=snapA; kind='ortho'; }
      let l2=len;
      if(ST.opts.grid){ const g=stGridStep(); l2=Math.max(g, Math.round(len/g)*g); }
      q={x:opt.from.x+Math.cos(a2)*l2, y:opt.from.y+Math.sin(a2)*l2};
    }
  } else if(ST.opts.grid){
    const g=stGridStep(); q={x:Math.round(q.x/g)*g, y:Math.round(q.y/g)*g};
  }
  // 4. alignement sur les sommets existants
  if(opt.align!==false){
    let gx=null, gy=null, dxm=tol, dym=tol;
    SC.walls.forEach((w,wi)=>w.pts.forEach((p,vi)=>{
      if(ex.some(e=>e[0]===wi&&e[1]===vi)) return;
      if(Math.abs(p.x-q.x)<dxm){ dxm=Math.abs(p.x-q.x); gx=p.x; }
      if(Math.abs(p.y-q.y)<dym){ dym=Math.abs(p.y-q.y); gy=p.y; }
    }));
    if(gx!==null && kind!=='ortho'){ q.x=gx; res.gx=gx; kind=kind||'align'; }
    if(gy!==null && kind!=='ortho'){ q.y=gy; res.gy=gy; kind=kind||'align'; }
  }
  // 5. projection sur un mur
  if(opt.edge){
    let bb=null, bde=tol;
    SC.walls.forEach(w=>{ const pts=stWallPts(w); for(let i=0;i<pts.length-1;i++){
      const r=ptToSeg(q.x,q.y,pts[i],pts[i+1]); if(r.d<bde){ bde=r.d; bb={x:pts[i].x+(pts[i+1].x-pts[i].x)*r.t, y:pts[i].y+(pts[i+1].y-pts[i].y)*r.t}; } } });
    if(bb){ q.x=bb.x; q.y=bb.y; kind='edge'; }
  }
  return {...res, x:q.x, y:q.y, kind};
}
function stFmtKind(k){ return {end:'Extrémité', mid:'Milieu', edge:'Sur le mur', ortho:'Orthogonal', align:'Aligné'}[k]||''; }

// ════════════════════════════════
//  RECHERCHE (hit-test)
// ════════════════════════════════
function stInMeuble(m,p,pad=0.05){
  const c=CAT_MEUBLE[m.type]; if(!c) return false;
  const cs=Math.cos(-(m.rot||0)), sn=Math.sin(-(m.rot||0));
  const dx=p.x-m.x, dy=p.y-m.y, lx=dx*cs-dy*sn, ly=dx*sn+dy*cs;
  return Math.abs(lx)<=c.w/2+pad && Math.abs(ly)<=c.d/2+pad;
}
function stObjHandle(){   // poignée de rotation de l'objet sélectionné
  const o = selSanId>0 ? SC.sanitaires.find(s=>s.id===selSanId) : selMeuId>0 ? SC.meubles.find(m=>m.id===selMeuId) : null;
  if(!o) return null;
  const c = selSanId>0 ? CAT_SAN[o.type] : CAT_MEUBLE[o.type];
  const r=c.d/2+stTolM(34), cs=Math.cos(o.rot||0), sn=Math.sin(o.rot||0);
  return {o, x:o.x+(0*cs-(-r)*sn), y:o.y+(0*sn+(-r)*cs), kind:selSanId>0?'san':'meu'};
}
function stNearestSeg(p, maxD){
  let best=null;
  SC.walls.forEach((w,wi)=>{ const pts=stWallPts(w); for(let si=0;si<pts.length-1;si++){
    const r=ptToSeg(p.x,p.y,pts[si],pts[si+1]);
    if(r.d<maxD && (!best||r.d<best.d)) best={wi,si,t:r.t,d:r.d};
  }});
  return best;
}
function stHit(p){
  const tol=stTolM(9);
  // poignées de l'élément sélectionné
  const rh=stObjHandle();
  if(rh && _d(rh,p)<tol*1.3) return {kind:'rot', of:rh.kind, id:rh.o.id};
  const ref=getArRef(), refB={x:ref.a.x+(ref.b.x-ref.a.x), y:ref.a.y+(ref.b.y-ref.a.y)};
  if(_d(refB,p)<tol*1.3) return {kind:'arB'};
  if(_d(ref.a,p)<tol*1.3) return {kind:'arA'};
  if(selWallIdx>=0 && SC.walls[selWallIdx]){
    const w=SC.walls[selWallIdx];
    for(let vi=0;vi<w.pts.length;vi++) if(_d(w.pts[vi],p)<tol*1.2) return {kind:'vertex',wi:selWallIdx,vi};
    const pts=stWallPts(w);
    for(let si=0;si<pts.length-1;si++){
      const m={x:(pts[si].x+pts[si+1].x)/2,y:(pts[si].y+pts[si+1].y)/2};
      if(_d(m,p)<tol*1.1 && _d(pts[si],pts[si+1])>0.4) return {kind:'mid',wi:selWallIdx,si};
    }
  }
  // objets : le plus petit sous le curseur d'abord
  const cands=[];
  for(const e of SC.electrique) if(_d(e,p)<Math.max(0.16,tol)) cands.push({kind:'el',id:e.id,area:0.03});
  for(const m of SC.meubles) if(stInMeuble(m,p)){ const c=CAT_MEUBLE[m.type]; cands.push({kind:'meu',id:m.id,area:c.w*c.d}); }
  for(const s of SC.sanitaires) if(inSanitaire(p.x,p.y,s)){ const c=CAT_SAN[s.type]; cands.push({kind:'san',id:s.id,area:c.w*c.d+0.5}); }
  const op=hitOp(p.x,p.y);
  if(op) cands.push({kind:'op',id:op.id,area:0.001});
  if(cands.length){ cands.sort((a,b)=>a.area-b.area); return cands[0]; }
  for(let wi=0;wi<SC.walls.length;wi++) for(let vi=0;vi<SC.walls[wi].pts.length;vi++)
    if(_d(SC.walls[wi].pts[vi],p)<tol*1.2) return {kind:'vertex',wi,vi};
  // murs : sur la bande d'épaisseur
  let bw=null;
  SC.walls.forEach((w,wi)=>{ const pts=stWallPts(w), lim=Math.max(stWallThick(w)/2, tol*0.8);
    for(let si=0;si<pts.length-1;si++){ const r=ptToSeg(p.x,p.y,pts[si],pts[si+1]); if(r.d<=lim && (!bw||r.d<bw.d)) bw={kind:'wall',wi,si,t:r.t,d:r.d}; } });
  return bw;
}

// ════════════════════════════════
//  SÉLECTION
// ════════════════════════════════
function stClearSel(){
  selWallIdx=-1; selOpId=-1; selSanId=-1; selMeuId=-1; selElId=-1; ST.selV=null; ST.selSeg=null;
  studioClosePanels();
}
function stSelect(hit){
  stClearSel();
  if(!hit){ studioPanelRefresh(); return; }
  switch(hit.kind){
    case 'wall':   selWallIdx=hit.wi; ST.selSeg=hit.si; openWallProp(hit.wi); break;
    case 'vertex': selWallIdx=hit.wi; ST.selV=hit.vi; openWallProp(hit.wi); break;
    case 'mid':    selWallIdx=hit.wi; ST.selSeg=hit.si; openWallProp(hit.wi); break;
    case 'op':     selOpId=hit.id; openOpProp(hit.id); break;
    case 'san':    selSanId=hit.id; openSanProp(hit.id); break;
    case 'meu':    selMeuId=hit.id; openMeubleProp(hit.id); break;
    case 'el':     selElId=hit.id; openElProp(hit.id); break;
  }
  studioPanelRefresh();
}
function stSelObj(){
  if(selSanId>0) return {list:SC.sanitaires, o:SC.sanitaires.find(s=>s.id===selSanId), kind:'san'};
  if(selMeuId>0) return {list:SC.meubles, o:SC.meubles.find(m=>m.id===selMeuId), kind:'meu'};
  if(selElId>0)  return {list:SC.electrique, o:SC.electrique.find(e=>e.id===selElId), kind:'el'};
  return null;
}

// ════════════════════════════════
//  OPÉRATIONS SUR LES MURS
// ════════════════════════════════
function stOpCenter(op){
  const w=SC.walls[op.wi]; if(!w) return null; const pts=stWallPts(w);
  if(op.si>=pts.length-1) return null;
  const a=pts[op.si], b=pts[op.si+1];
  return {x:a.x+(b.x-a.x)*op.t, y:a.y+(b.y-a.y)*op.t};
}
// Après un changement de topologie (sommet ajouté / supprimé), rattache les ouvertures au segment le plus proche
function stRemapOpenings(wi, centers){
  for(const [id,c] of centers){
    const op=SC.openings.find(o=>o.id===id); if(!op||!c) continue;
    const w=SC.walls[wi], pts=stWallPts(w); let best=null;
    for(let si=0;si<pts.length-1;si++){ const r=ptToSeg(c.x,c.y,pts[si],pts[si+1]); if(!best||r.d<best.d) best={si,t:r.t,d:r.d}; }
    if(best && best.d<0.3){ op.si=best.si; op.t=best.t; } else SC.openings=SC.openings.filter(o=>o.id!==id);
  }
}
function stWallCenters(wi){
  return SC.openings.filter(o=>o.wi===wi).map(o=>[o.id, stOpCenter(o)]);
}
function stInsertVertex(wi, si, pt){
  const centers=stWallCenters(wi);
  SC.walls[wi].pts.splice(si+1,0,{x:pt.x,y:pt.y});
  stRemapOpenings(wi, centers);
}
function stDeleteWall(wi){
  SC.walls.splice(wi,1);
  SC.openings=SC.openings.filter(o=>o.wi!==wi);
  for(const o of SC.openings) if(o.wi>wi) o.wi--;
}
function stRemoveVertex(wi, vi){
  const w=SC.walls[wi]; if(!w) return;
  if((w.closed && w.pts.length<=3) || (!w.closed && w.pts.length<=2)){ stDeleteWall(wi); return; }
  const centers=stWallCenters(wi);
  w.pts.splice(vi,1);
  stRemapOpenings(wi, centers);
}
function stCreateWall(pts, closed){
  const clean=[];
  for(const p of pts){ if(!clean.length || _d(p,clean[clean.length-1])>0.01) clean.push({x:p.x,y:p.y}); }
  if(closed && clean.length>1 && _d(clean[0],clean[clean.length-1])<0.01) clean.pop();
  if(clean.length<(closed?3:2)) return -1;
  SC.walls.push({pts:clean, closed, kind:closed?'ext':'int', comp:closed?'mur_brique_classique':'cloison_72_48'});
  return SC.walls.length-1;
}

// ── Longueur d'un segment (saisie) ──
function stParseLen(str){
  const s=String(str).trim().replace(',','.'); if(!s) return NaN;
  const v=parseFloat(s); if(!isFinite(v)) return NaN;
  return /[.]/.test(s) ? v : v/100;    // sans point : centimètres
}
function stEditLength(wi, si){
  const w=SC.walls[wi]; if(!w) return;
  const pts=stWallPts(w), a=pts[si], b=pts[si+1];
  const v=VIEWS.studio, m=mToScreen((a.x+b.x)/2,(a.y+b.y)/2,v);
  const inp=document.getElementById('stLen');
  inp.style.left=m.x+'px'; inp.style.top=m.y+'px'; inp.style.display='block';
  inp.value=_d(a,b).toFixed(2); ST.lenEdit={wi,si}; inp.focus(); inp.select();
}
function stApplyLength(){
  const inp=document.getElementById('stLen'), le=ST.lenEdit; ST.lenEdit=null; inp.style.display='none';
  if(!le) return;
  const w=SC.walls[le.wi]; if(!w) return;
  const L=stParseLen(inp.value); if(!(L>0.05&&L<50)){ toast('Longueur invalide'); return; }
  const n=w.pts.length, i0=le.si, i1=(le.si+1)%n;
  const a=w.pts[i0], b=w.pts[i1], u=_unit(b.x-a.x,b.y-a.y);
  b.x=a.x+u.x*L; b.y=a.y+u.y*L;
  histCommit(); redraw('studio'); studioPanelRefresh();
}

// ════════════════════════════════
//  OBJETS : placement, aimantation aux murs
// ════════════════════════════════
function stObjHalfAlong(o, cat, n){
  const dot=n.x*Math.cos(o.rot||0)+n.y*Math.sin(o.rot||0);
  return Math.abs(dot)*cat.w/2 + Math.sqrt(Math.max(0,1-dot*dot))*cat.d/2;
}
// Colle l'objet contre la face d'un mur proche (translation le long de la normale)
function stMagnet(o, cat){
  if(!ST.opts.snap || ST.noSnap) return;
  let best=null;
  SC.walls.forEach(w=>{
    const pts=stWallPts(w), th=stWallThick(w)/2;
    for(let si=0;si<pts.length-1;si++){
      const a=pts[si], b=pts[si+1], len=_d(a,b); if(len<0.05) continue;
      const u=_unit(b.x-a.x,b.y-a.y), n={x:-u.y,y:u.x};
      const along=(o.x-a.x)*u.x+(o.y-a.y)*u.y;
      if(along<-0.1||along>len+0.1) continue;
      const ds=(o.x-a.x)*n.x+(o.y-a.y)*n.y, sgn=ds>=0?1:-1;
      const gap=Math.abs(ds)-(stObjHalfAlong(o,cat,n)+th);
      if(Math.abs(gap)<0.10 && (!best||Math.abs(gap)<Math.abs(best.gap))) best={gap,n,sgn};
    }
  });
  if(best){ o.x-=best.n.x*best.sgn*best.gap; o.y-=best.n.y*best.sgn*best.gap; }
}

function stPlaceItem(it, p){
  histCommit();
  let id=null;
  if(it.kind==='san'){
    addSan(it.type); const o=SC.sanitaires[SC.sanitaires.length-1]; o.x=p.x; o.y=p.y; stMagnet(o,CAT_SAN[o.type]); id=o.id;
    refreshElements(); openSanProp(id);
  } else if(it.kind==='meu'){
    addMeuble(it.type); const o=SC.meubles[SC.meubles.length-1]; o.x=p.x; o.y=p.y; stMagnet(o,CAT_MEUBLE[o.type]); id=o.id;
    refreshElements(); openMeubleProp(id);
  } else if(it.kind==='el'){
    addEl(it.type); const o=SC.electrique[SC.electrique.length-1]; o.x=p.x; o.y=p.y; id=o.id;
    refreshElements(); openElProp(id);
  } else if(it.kind==='op'){
    const hit=stNearestSeg(p, 0.45);
    if(!hit){ toast("Placez l'ouverture sur un mur"); return; }
    const w=it.w||(it.type==='window'?1.0:it.type==='wide'?1.4:0.8);
    const pts=stWallPts(SC.walls[hit.wi]), len=_d(pts[hit.si],pts[hit.si+1]), hw=w/2/len;
    const t = len>=w ? Math.min(1-hw,Math.max(hw,hit.t)) : 0.5;
    const op={id:++SC.idSeq, type:it.type, wi:hit.wi, si:hit.si, t, w, menui:it.type==='window'?'fenetre_pvc_dv':'porte_bois_iso', openDeg:30};
    SC.openings.push(op); id=op.id;
    stClearSel(); selOpId=id; openOpProp(id);
  }
  studioPanelRefresh(); redraw('studio'); histCommit();
  return id;
}

function stDeleteSelection(){
  histCommit();
  if(selWallIdx>=0){
    if(ST.selV!==null) stRemoveVertex(selWallIdx, ST.selV); else stDeleteWall(selWallIdx);
  } else if(selOpId>0){ SC.openings=SC.openings.filter(o=>o.id!==selOpId); }
  else if(selSanId>0){ SC.sanitaires=SC.sanitaires.filter(s=>s.id!==selSanId); }
  else if(selMeuId>0){ SC.meubles=SC.meubles.filter(m=>m.id!==selMeuId); }
  else if(selElId>0){ SC.electrique=SC.electrique.filter(e=>e.id!==selElId); }
  else return;
  stClearSel(); refreshElements(); studioPanelRefresh(); redraw('studio'); histCommit();
}

function stDuplicate(){
  const s=stSelObj(); if(!s||!s.o) return;
  histCommit();
  const c=JSON.parse(JSON.stringify(s.o)); c.id=++SC.idSeq; c.x+=0.3; c.y+=0.3;
  s.list.push(c);
  stSelect({kind:s.kind, id:c.id}); refreshElements(); redraw('studio'); histCommit();
}

// ════════════════════════════════
//  SOURIS
// ════════════════════════════════
function stTyped(){ return ST.typed; }
function stUpdateHint(){
  const h={
    select:'Clic : sélectionner · Glisser : déplacer · Poignées : sommets, rotation · Double-clic sur un mur : longueur · Suppr : effacer',
    wall:'Clic : poser un point · Chiffres + Entrée : longueur exacte (cm, ou m avec un point) · Entrée : fermer · Retour arrière : annuler le point · Échap : terminer',
    rect:'Clic : 1er coin, puis 2e coin · ou tapez « 320x240 » (cm) puis Entrée',
    door:'Survolez un mur puis cliquez pour poser la porte', window:'Survolez un mur puis cliquez pour poser la fenêtre',
    measure:'Cliquez deux points pour mesurer · Échap pour effacer',
    arref:ST.arA?'Cliquez pour fixer la direction A→B (B est à 1 m de A)':'Cliquez le point A : coin ou repère physique facile à retrouver au sol',
    pan:'Glissez pour déplacer la vue',
    place:'Cliquez pour poser · Échap pour arrêter · R : pivoter de 90°',
  }[ST.tool]||'';
  document.getElementById('stHint').textContent=h;
}

function setupStudioEvents(cv){
  cv.addEventListener('mousedown', stMouseDown);
  window.addEventListener('mousemove', stMouseMove);
  window.addEventListener('mouseup', stMouseUp);
  cv.addEventListener('dblclick', stDblClick);
  cv.addEventListener('contextmenu', e=>{ e.preventDefault(); });
  cv.addEventListener('wheel', stWheel, {passive:false});
  cv.addEventListener('mouseleave', ()=>{ ST.snap=null; ST.hover=null; redraw('studio'); });
  cv.addEventListener('dragover', e=>{ e.preventDefault(); const q=stPos(e); ST.p=stWorld(q.sx,q.sy); ST.sx=q.sx; ST.sy=q.sy; });
  cv.addEventListener('drop', e=>{
    e.preventDefault();
    let it; try{ it=JSON.parse(e.dataTransfer.getData('text/plain')); }catch(err){ return; }
    const q=stPos(e), p=stWorld(q.sx,q.sy), s=stSnap(p,{});
    stPlaceItem(it, it.kind==='op'?p:{x:s.x,y:s.y});
  });
  const inp=document.getElementById('stLen');
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); stApplyLength(); }
    else if(e.key==='Escape'){ ST.lenEdit=null; inp.style.display='none'; }
    e.stopPropagation();
  });
  inp.addEventListener('blur', ()=>{ if(ST.lenEdit){ ST.lenEdit=null; inp.style.display='none'; } });
  if(window.ResizeObserver) new ResizeObserver(()=>{ if(STUDIO.active&&STUDIO.tab==='plan'&&VIEWS.studio.init) initCanvas('studio'); }).observe(document.getElementById('wStudio'));
}

function stWheel(e){
  e.preventDefault();
  const q=stPos(e), v=VIEWS.studio, before=screenToM(q.sx,q.sy,v);
  const f=Math.exp(-e.deltaY*(e.deltaMode===1?0.05:0.0015));
  v.sc=Math.max(15,Math.min(800,v.sc*f));
  v.px=q.sx-before.x*v.sc; v.py=q.sy-before.y*v.sc;
  redraw('studio');
}

function stSnapOpts(){
  const t=ST.tool;
  if(t==='wall') return {from:ST.poly.length?ST.poly[ST.poly.length-1]:null, edge:true, ar:false};
  if(t==='rect') return {from:null};
  if(t==='arref') return {edge:false, ar:false};
  if(t==='measure') return {from:null, edge:true};
  return {};
}

function stMouseDown(e){
  if(!STUDIO.active) return;
  e.preventDefault();
  const q=stPos(e); ST.sx=q.sx; ST.sy=q.sy; ST.p=stWorld(q.sx,q.sy);
  ST.shift=e.shiftKey; ST.noSnap=e.altKey;
  document.getElementById('stLen').blur();
  if(e.button===1 || (e.button===0 && (ST.space||ST.tool==='pan'))){
    ST.pan={sx:q.sx, sy:q.sy, px:VIEWS.studio.px, py:VIEWS.studio.py};
    document.getElementById('wStudio').classList.add('grabbing'); return;
  }
  if(e.button===2){ stCancelOrFinish(); return; }
  if(e.button!==0) return;
  const s=stSnap(ST.p, stSnapOpts());
  const t=ST.tool;

  if(t==='select'){
    const hit=stHit(ST.p);
    ST.down={sx:q.sx,sy:q.sy,hit,moved:false};
    if(hit && hit.kind==='mid'){       // poignée « + » : nouveau sommet aussitôt saisi
      histCommit();
      const pts=stWallPts(SC.walls[hit.wi]), a=pts[hit.si], b=pts[hit.si+1];
      stInsertVertex(hit.wi, hit.si, {x:(a.x+b.x)/2,y:(a.y+b.y)/2});
      ST.down.hit={kind:'vertex',wi:hit.wi,vi:hit.si+1}; ST.selV=hit.si+1;
    }
    const h=ST.down.hit;
    if(h && h.kind!=='rot' && h.kind!=='arA' && h.kind!=='arB' && h.kind!=='mid') stSelect(h);
    else if(!h){ stSelect(null); }
    if(h && h.kind==='vertex'){ ST.selV=h.vi; }
    redraw('studio'); return;
  }
  if(t==='wall'){
    if(ST.poly.length>=3 && _d(s,ST.poly[0])<stTolM(12)){ stFinishWall(true); return; }
    if(!ST.poly.length || _d(s,ST.poly[ST.poly.length-1])>0.02) ST.poly.push({x:s.x,y:s.y});
    ST.typed=''; stUpdateHint(); redraw('studio'); return;
  }
  if(t==='rect'){
    if(!ST.rectA){ ST.rectA={x:s.x,y:s.y}; }
    else { stFinishRect({x:s.x,y:s.y}); return; }
    ST.typed=''; redraw('studio'); return;
  }
  if(t==='door'||t==='window'){
    stPlaceItem({kind:'op', type:t, w:t==='window'?1.0:0.9}, ST.p); return;
  }
  if(t==='place'){
    const it=ST.place; if(!it) return;
    stPlaceItem(it, it.kind==='op'?ST.p:{x:s.x,y:s.y}); return;
  }
  if(t==='measure'){
    if(!ST.measure || ST.measure.b) ST.measure={a:{x:s.x,y:s.y},b:null};
    else ST.measure.b={x:s.x,y:s.y};
    redraw('studio'); return;
  }
  if(t==='arref'){
    if(!ST.arA){ ST.arA={x:s.x,y:s.y}; stUpdateHint(); }
    else {
      histCommit();
      const u=_unit(s.x-ST.arA.x, s.y-ST.arA.y), old=getArRef();
      SC.arRef={a:ST.arA, b:{x:ST.arA.x+u.x,y:ST.arA.y+u.y}, label:old.label};
      ST.arA=null; histCommit(); setStudioTool('select'); studioPanelRefresh();
    }
    redraw('studio'); return;
  }
}

function stMouseMove(e){
  if(!STUDIO.active || STUDIO.tab!=='plan') return;
  const cv=stCanvas(), r=cv.getBoundingClientRect();
  const inside = e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
  const q={sx:e.clientX-r.left, sy:e.clientY-r.top};
  ST.shift=e.shiftKey; ST.noSnap=e.altKey;
  if(ST.pan){
    const v=VIEWS.studio; v.px=ST.pan.px+(q.sx-ST.pan.sx); v.py=ST.pan.py+(q.sy-ST.pan.sy); redraw('studio'); return;
  }
  if(!inside && !ST.drag && !ST.down) return;
  ST.sx=q.sx; ST.sy=q.sy; ST.p=stWorld(q.sx,q.sy);
  document.getElementById('stCoord').textContent=`x ${ST.p.x.toFixed(2)} · y ${ST.p.y.toFixed(2)} m`;
  const t=ST.tool;

  if(t==='select'){
    if(ST.down && !ST.drag){
      if(Math.hypot(q.sx-ST.down.sx,q.sy-ST.down.sy)>3 && ST.down.hit){ stBeginDrag(ST.down.hit); }
    }
    if(ST.drag){ stDragTo(ST.p); redraw('studio'); return; }
    const h=stHit(ST.p); ST.hover=h;
    cv.style.cursor = h ? (h.kind==='vertex'||h.kind==='mid'||h.kind==='rot'||h.kind==='arA'||h.kind==='arB' ? 'pointer' : 'move') : 'default';
    ST.snap=null; redraw('studio'); return;
  }
  if(t==='door'||t==='window'||t==='place'&&ST.place&&ST.place.kind==='op'){
    ST.snap=null; ST.hover=stNearestSeg(ST.p,0.45); redraw('studio'); return;
  }
  ST.snap=stSnap(ST.p, stSnapOpts());
  redraw('studio');
}

function stMouseUp(e){
  if(ST.pan){ ST.pan=null; document.getElementById('wStudio').classList.remove('grabbing'); return; }
  if(ST.drag){ ST.drag=null; ST.down=null; histCommit(); studioPanelRefresh(); redraw('studio'); return; }
  ST.down=null;
}

function stDblClick(e){
  if(ST.tool!=='select') return;
  const q=stPos(e), p=stWorld(q.sx,q.sy), h=stHit(p);
  if(h && (h.kind==='wall')){ selWallIdx=h.wi; stEditLength(h.wi,h.si); }
}

// ── Glisser ──
function stBeginDrag(h){
  histCommit();
  const p=ST.p;
  if(h.kind==='vertex'){ ST.drag={kind:'vertex', wi:h.wi, vi:h.vi}; }
  else if(h.kind==='wall'){
    const w=SC.walls[h.wi], n=w.pts.length, i0=h.si, i1=(h.si+1)%n;
    ST.drag={kind:'wall', wi:h.wi, i0, i1, start:p, a:{...w.pts[i0]}, b:{...w.pts[i1]}};
  }
  else if(h.kind==='op'){ ST.drag={kind:'op', id:h.id}; }
  else if(h.kind==='rot'){ ST.drag={kind:'rot', of:h.of, id:h.id}; }
  else if(h.kind==='arA'){ ST.drag={kind:'arA'}; }
  else if(h.kind==='arB'){ ST.drag={kind:'arB'}; }
  else if(h.kind==='san'||h.kind==='meu'||h.kind==='el'){
    const list=h.kind==='san'?SC.sanitaires:h.kind==='meu'?SC.meubles:SC.electrique;
    const o=list.find(x=>x.id===h.id); if(!o) return;
    ST.drag={kind:'obj', of:h.kind, id:h.id, off:{x:o.x-p.x, y:o.y-p.y}};
  }
}

function stDragTo(p){
  const d=ST.drag;
  if(d.kind==='vertex'){
    const w=SC.walls[d.wi]; if(!w) return;
    const n=w.pts.length, prev=w.closed||d.vi>0 ? w.pts[(d.vi-1+n)%n] : null;
    const s=stSnap(p,{exclude:[[d.wi,d.vi]], from:prev, edge:false});
    w.pts[d.vi].x=s.x; w.pts[d.vi].y=s.y; ST.snap=s;
    if(selWallIdx===d.wi) updateWallProp(d.wi);
  } else if(d.kind==='wall'){
    const w=SC.walls[d.wi]; if(!w) return;
    let dx=p.x-d.start.x, dy=p.y-d.start.y;
    if(ST.opts.snap&&!ST.noSnap&&ST.opts.grid){ const g=stGridStep(); dx=Math.round(dx/g)*g; dy=Math.round(dy/g)*g; }
    w.pts[d.i0].x=d.a.x+dx; w.pts[d.i0].y=d.a.y+dy; w.pts[d.i1].x=d.b.x+dx; w.pts[d.i1].y=d.b.y+dy;
  } else if(d.kind==='op'){
    const op=SC.openings.find(o=>o.id===d.id); if(!op) return;
    const hit=stNearestSeg(p,0.6); if(!hit||hit.wi!==op.wi) return;
    const pts=stWallPts(SC.walls[hit.wi]), len=_d(pts[hit.si],pts[hit.si+1]), hw=op.w/2/len;
    op.si=hit.si; op.t=len>=op.w?Math.min(1-hw,Math.max(hw,hit.t)):0.5;
    updateOpProp(op.id);
  } else if(d.kind==='rot'){
    const o=(d.of==='san'?SC.sanitaires:SC.meubles).find(x=>x.id===d.id); if(!o) return;
    let a=Math.atan2(p.y-o.y,p.x-o.x)+Math.PI/2;
    const step=ST.shift?Math.PI/180:Math.PI/12;   // 15° (Maj : libre)
    a=Math.round(a/step)*step; while(a<0) a+=2*Math.PI; while(a>=2*Math.PI) a-=2*Math.PI;
    o.rot=a; d.of==='san'?updateSanProp(o.id):updateMeubleProp(o.id);
  } else if(d.kind==='obj'){
    const list=d.of==='san'?SC.sanitaires:d.of==='meu'?SC.meubles:SC.electrique;
    const o=list.find(x=>x.id===d.id); if(!o) return;
    let x=p.x+d.off.x, y=p.y+d.off.y;
    if(ST.opts.snap&&!ST.noSnap&&ST.opts.grid){ const g=stGridStep()/ (d.of==='el'?1:2); x=Math.round(x/g)*g; y=Math.round(y/g)*g; }
    o.x=x; o.y=y;
    if(d.of==='san') stMagnet(o,CAT_SAN[o.type]); else if(d.of==='meu') stMagnet(o,CAT_MEUBLE[o.type]);
    if(d.of==='el'){ o.zone=getZone(o.x,o.y,o.h); o.distCm=distToV0(o.x,o.y); }
    else refreshElements();
    if(d.of==='san') updateSanProp(o.id); else if(d.of==='meu') updateMeubleProp(o.id); else updateElProp(o.id);
  } else if(d.kind==='arA'){
    const r=getArRef(), s=stSnap(p,{ar:false});
    const dx=r.b.x-r.a.x, dy=r.b.y-r.a.y;
    SC.arRef={a:{x:s.x,y:s.y}, b:{x:s.x+dx,y:s.y+dy}, label:r.label}; ST.snap=s;
  } else if(d.kind==='arB'){
    const r=getArRef(); let u=_unit(p.x-r.a.x,p.y-r.a.y);
    // aimantation sur les directions des murs et sur 0/90°
    let ang=Math.atan2(u.y,u.x), bestA=null, bd=0.09;
    const dirs=[0,Math.PI/2,Math.PI,-Math.PI/2];
    SC.walls.forEach(w=>{ const pts=stWallPts(w); for(let i=0;i<pts.length-1;i++){ const a=Math.atan2(pts[i+1].y-pts[i].y,pts[i+1].x-pts[i].x); dirs.push(a,a+Math.PI); } });
    if(!ST.noSnap) for(const a of dirs){ let df=Math.atan2(Math.sin(ang-a),Math.cos(ang-a)); if(Math.abs(df)<bd){ bd=Math.abs(df); bestA=a; } }
    if(bestA!==null) ang=bestA;
    SC.arRef={a:r.a, b:{x:r.a.x+Math.cos(ang), y:r.a.y+Math.sin(ang)}, label:r.label};
  }
}

// ── Fin de tracé ──
function stFinishWall(closed){
  const wi=stCreateWall(ST.poly, closed);
  ST.poly=[]; ST.typed='';
  if(wi<0){ redraw('studio'); return; }
  histCommit();
  if(closed) setStudioTool('select');
  stSelect({kind:'wall', wi, si:0});
  if(SC.walls.length===1) fitView('studio');
  redraw('studio'); histCommit();
}
function stFinishRect(b){
  const a=ST.rectA; ST.rectA=null; ST.typed='';
  const w=Math.abs(b.x-a.x), h=Math.abs(b.y-a.y);
  if(w<0.3||h<0.3){ toast('Pièce trop petite'); redraw('studio'); return; }
  const x0=Math.min(a.x,b.x), y0=Math.min(a.y,b.y);
  const wi=stCreateWall([{x:x0,y:y0},{x:x0+w,y:y0},{x:x0+w,y:y0+h},{x:x0,y:y0+h}], true);
  histCommit(); setStudioTool('select'); stSelect({kind:'wall',wi,si:0}); if(SC.walls.length===1) fitView('studio'); redraw('studio'); histCommit();
}
function stCancelOrFinish(){
  if(ST.tool==='wall' && ST.poly.length>=2){ stFinishWall(false); return; }
  if(ST.tool!=='select') setStudioTool('select'); else { stSelect(null); redraw('studio'); }
}

// ════════════════════════════════
//  CLAVIER
// ════════════════════════════════
function setupStudioKeys(){
  if(ST.keysOn) return; ST.keysOn=true;
  window.addEventListener('keydown', stKeyDown);
  window.addEventListener('keyup', e=>{ if(e.code==='Space'){ ST.space=false; document.getElementById('wStudio').classList.remove('pan'); if(ST.tool==='pan') document.getElementById('wStudio').classList.add('pan'); } ST.shift=e.shiftKey; ST.noSnap=e.altKey; });
}

function stKeyDown(e){
  if(!STUDIO.active || STUDIO.tab!=='plan') return;
  const tag=(e.target.tagName||''), inField = tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA';
  if(inField) return;
  ST.shift=e.shiftKey; ST.noSnap=e.altKey;
  const k=e.key, ctrl=e.ctrlKey||e.metaKey;
  if(ctrl){
    if(k==='z'||k==='Z'){ e.preventDefault(); e.shiftKey?histRedo():histUndo(); return; }
    if(k==='y'||k==='Y'){ e.preventDefault(); histRedo(); return; }
    if(k==='d'||k==='D'){ e.preventDefault(); stDuplicate(); return; }
    if(k==='c'||k==='C'){ const s=stSelObj(); if(s&&s.o){ ST.clip={kind:s.kind, data:JSON.parse(JSON.stringify(s.o))}; toast('Copié'); } return; }
    if(k==='v'||k==='V'){ if(ST.clip){ e.preventDefault(); const list=ST.clip.kind==='san'?SC.sanitaires:ST.clip.kind==='meu'?SC.meubles:SC.electrique;
        histCommit(); const c=JSON.parse(JSON.stringify(ST.clip.data)); c.id=++SC.idSeq; c.x=ST.p.x; c.y=ST.p.y; list.push(c); stSelect({kind:ST.clip.kind,id:c.id}); refreshElements(); redraw('studio'); histCommit(); } return; }
    if(k==='s'||k==='S'){ e.preventDefault(); saveNow(); toast('Projet enregistré'); return; }
    return;
  }
  if(e.code==='Space'){ e.preventDefault(); ST.space=true; document.getElementById('wStudio').classList.add('pan'); return; }
  // saisie numérique (longueur / dimensions)
  if((ST.tool==='wall'&&ST.poly.length) || (ST.tool==='rect')){
    if(/^[0-9.,xX*]$/.test(k)){ e.preventDefault(); ST.typed+=k; redraw('studio'); return; }
    if(k==='Backspace' && ST.typed){ e.preventDefault(); ST.typed=ST.typed.slice(0,-1); redraw('studio'); return; }
    if(k==='Enter'){ e.preventDefault(); stEnter(); return; }
  }
  if(k==='Enter' && ST.tool==='wall' && ST.poly.length>=2){ e.preventDefault(); stFinishWall(ST.poly.length>=3); return; }
  if(k==='Escape'){ if(ST.typed){ ST.typed=''; redraw('studio'); } else if(ST.measure){ ST.measure=null; redraw('studio'); } else stCancelOrFinish(); return; }
  if(k==='Backspace' && ST.tool==='wall' && ST.poly.length){ e.preventDefault(); ST.poly.pop(); redraw('studio'); return; }
  if(k==='Delete'||k==='Backspace'){ e.preventDefault(); stDeleteSelection(); return; }
  if(k==='Home'){ e.preventDefault(); studioFit(); return; }
  if(k==='+'||k==='='){ zoom('studio',1.25); return; }
  if(k==='-'){ zoom('studio',0.8); return; }
  if(k.startsWith('Arrow')){
    const step=e.shiftKey?0.10:0.01, dx=k==='ArrowLeft'?-step:k==='ArrowRight'?step:0, dy=k==='ArrowUp'?-step:k==='ArrowDown'?step:0;
    const s=stSelObj();
    if(s&&s.o){ e.preventDefault(); s.o.x+=dx; s.o.y+=dy; refreshElements(); redraw('studio'); histSoon(); }
    else if(selWallIdx>=0 && ST.selV!==null){ e.preventDefault(); const p=SC.walls[selWallIdx].pts[ST.selV]; p.x+=dx; p.y+=dy; redraw('studio'); histSoon(); }
    return;
  }
  if(ST.tool==='place' && (k==='r'||k==='R')){ /* rotation à la pose : gérée par la poignée après pose */ }
  const t=ST_TOOLS.find(x=>x.key.toLowerCase()===k.toLowerCase());
  if(t){ e.preventDefault(); setStudioTool(t.id); }
}

function stEnter(){
  const typed=ST.typed;
  if(ST.tool==='wall'){
    if(typed){
      const L=stParseLen(typed); ST.typed='';
      if(!(L>0.05&&L<100)){ toast('Longueur invalide'); redraw('studio'); return; }
      const last=ST.poly[ST.poly.length-1], s=ST.snap||{x:ST.p.x,y:ST.p.y};
      const u=_unit(s.x-last.x, s.y-last.y);
      ST.poly.push({x:last.x+u.x*L, y:last.y+u.y*L});
      redraw('studio');
    } else if(ST.poly.length>=2) stFinishWall(ST.poly.length>=3);
    return;
  }
  if(ST.tool==='rect'){
    const m=typed.replace(/,/g,'.').split(/[xX*]/);
    if(m.length===2){
      const w=stParseLen(m[0]), h=stParseLen(m[1]);
      if(w>0.3&&h>0.3){
        const a=ST.rectA||{x:ST.snap?ST.snap.x:ST.p.x, y:ST.snap?ST.snap.y:ST.p.y};
        ST.rectA=a; ST.typed=''; stFinishRect({x:a.x+w,y:a.y+h}); return;
      }
    }
    toast('Format : 320x240 (cm) ou 3.2x2.4 (m)'); ST.typed=''; redraw('studio');
  }
}

// ════════════════════════════════
//  RENDU
// ════════════════════════════════
function stHatch(ctx){
  if(ST.hatch) return ST.hatch;
  const c=document.createElement('canvas'); c.width=c.height=8;
  const g=c.getContext('2d');
  g.fillStyle='#2a3447'; g.fillRect(0,0,8,8);
  g.strokeStyle='rgba(180,195,215,.45)'; g.lineWidth=1;
  g.beginPath(); g.moveTo(-1,9); g.lineTo(9,-1); g.moveTo(-1,1); g.lineTo(1,-1); g.moveTo(7,9); g.lineTo(9,7); g.stroke();
  ST.hatch=ctx.createPattern(c,'repeat'); return ST.hatch;
}
function _path(ctx, pts, v, close){
  ctx.beginPath();
  pts.forEach((p,i)=>{ const s=mToScreen(p.x,p.y,v); i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); });
  if(close) ctx.closePath();
}

function stDrawGrid(ctx, W, H, v){
  const minor = v.sc>=50 ? 0.1 : 0.5, major=1;
  const x0=-v.px/v.sc, y0=-v.py/v.sc, x1=(W-v.px)/v.sc, y1=(H-v.py)/v.sc;
  const draw=(step,col,lw)=>{
    ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.beginPath();
    for(let x=Math.floor(x0/step)*step; x<=x1; x+=step){ const sx=Math.round(v.px+x*v.sc)+0.5; ctx.moveTo(sx,0); ctx.lineTo(sx,H); }
    for(let y=Math.floor(y0/step)*step; y<=y1; y+=step){ const sy=Math.round(v.py+y*v.sc)+0.5; ctx.moveTo(0,sy); ctx.lineTo(W,sy); }
    ctx.stroke();
  };
  if(minor*v.sc>=6) draw(minor,'rgba(120,150,200,.07)',1);
  draw(major,'rgba(120,150,200,.17)',1);
  // axes
  ctx.strokeStyle='rgba(239,68,68,.35)'; ctx.beginPath(); ctx.moveTo(0,Math.round(v.py)+.5); ctx.lineTo(W,Math.round(v.py)+.5); ctx.stroke();
  ctx.strokeStyle='rgba(34,197,94,.35)'; ctx.beginPath(); ctx.moveTo(Math.round(v.px)+.5,0); ctx.lineTo(Math.round(v.px)+.5,H); ctx.stroke();
}

// Volumes 0/1/2 (vue de dessus à 1 m) — mis en cache tant que murs et sanitaires ne changent pas
function stZones(){
  if(!SC.sanitaires.some(s=>CAT_SAN[s.type]?.genZone)) return null;
  const coarse = !!ST.drag;
  const sig=JSON.stringify([SC.walls.map(w=>w.pts),SC.sanitaires,SC.openings.map(o=>[o.wi,o.si,o.t,o.w]),coarse]);
  if(ST.zc && ST.zc.sig===sig) return ST.zc;
  const cells=[]; const step=coarse?0.12:0.06;
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
  for(const w of SC.walls) for(const p of w.pts){ mnx=Math.min(mnx,p.x);mxx=Math.max(mxx,p.x);mny=Math.min(mny,p.y);mxy=Math.max(mxy,p.y); }
  const poly=SC.walls.length&&SC.walls[0].closed?SC.walls[0].pts:null;
  if(isFinite(mnx)) for(let x=mnx;x<mxx;x+=step) for(let y=mny;y<mxy;y+=step){
    const cx=x+step/2, cy=y+step/2;
    if(poly && !ptInPoly(cx,cy,poly)) continue;
    const z=getZone(cx,cy,1.0); if(z!=='hors') cells.push([x,y,z]);
  }
  ST.zc={sig,cells,step}; return ST.zc;
}
function stDrawZones(ctx, v){
  const zc=stZones(); if(!zc) return;
  const col={0:'rgba(220,38,38,.32)',1:'rgba(245,158,11,.24)',2:'rgba(37,99,235,.20)'};
  const s=zc.step*v.sc+0.6;
  for(const z of [2,1,0]){ ctx.fillStyle=col[z]; for(const c of zc.cells){ if(c[2]!==z) continue; const p=mToScreen(c[0],c[1],v); ctx.fillRect(p.x,p.y,s,s); } }
  for(const s2 of SC.sanitaires){ if(s2.type!=='douche_it') continue;
    const p=mToScreen(...Object.values(pommeauPos(s2)),v);
    ctx.beginPath(); ctx.arc(p.x,p.y,7,0,Math.PI*2); ctx.fillStyle='#22d3ee'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
  }
}

function stDrawFloors(ctx, v){
  for(const w of SC.walls){
    if(!w.closed) continue;
    _path(ctx,w.pts,v,true); ctx.fillStyle='#152036'; ctx.fill();
  }
}

function stDrawWalls(ctx, v){
  const hatch=stHatch(ctx);
  SC.walls.forEach((w,wi)=>{
    const T=stWallThick(w), sel=(wi===selWallIdx), hov=ST.hover&&ST.hover.kind==='wall'&&ST.hover.wi===wi;
    const o1=stOffset(w.pts,w.closed,T/2), o2=stOffset(w.pts,w.closed,-T/2);
    ctx.beginPath();
    const ring=(pts,close)=>{ pts.forEach((p,i)=>{ const s=mToScreen(p.x,p.y,v); i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); if(close) ctx.closePath(); };
    if(w.closed){ ring(o1,true); ring(o2,true); }
    else { ring([...o1,...o2.slice().reverse()],true); }
    ctx.fillStyle=hatch; ctx.fill('evenodd');
    ctx.lineWidth=sel?2.2:1.3; ctx.strokeStyle=sel?'#60a5fa':(hov?'#93c5fd':'#cbd5e1'); ctx.lineJoin='miter';
    if(sel){ ctx.shadowColor='rgba(96,165,250,.6)'; ctx.shadowBlur=10; }
    ctx.stroke(); ctx.shadowBlur=0;
    // segment sélectionné
    if(sel && ST.selSeg!==null){
      const pts=stWallPts(w), a=pts[ST.selSeg], b=pts[ST.selSeg+1];
      if(a&&b){ _path(ctx,[a,b],v,false); ctx.strokeStyle='rgba(96,165,250,.9)'; ctx.lineWidth=3; ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]); }
    }
  });
}

function stDrawOpenings(ctx, v){
  for(const op of SC.openings){
    const w=SC.walls[op.wi]; if(!w) continue;
    const pts=stWallPts(w); if(op.si>=pts.length-1) continue;
    const a=pts[op.si], b=pts[op.si+1], len=_d(a,b)||1, u={x:(b.x-a.x)/len,y:(b.y-a.y)/len};
    const nrm=stInwardNormal(w,op.si), T=stWallThick(w), hw=op.w/2;
    const c={x:a.x+(b.x-a.x)*op.t, y:a.y+(b.y-a.y)*op.t};
    const P=(du,dn)=>mToScreen(c.x+u.x*du+nrm.x*dn, c.y+u.y*du+nrm.y*dn, v);
    const sel=op.id===selOpId;
    // percement du mur
    const q=[P(-hw,-T/2-0.005),P(hw,-T/2-0.005),P(hw,T/2+0.005),P(-hw,T/2+0.005)];
    ctx.beginPath(); q.forEach((s,i)=>i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)); ctx.closePath();
    ctx.fillStyle='#152036'; ctx.fill();
    ctx.strokeStyle=sel?'#60a5fa':'#cbd5e1'; ctx.lineWidth=sel?2:1.2;
    ctx.beginPath(); ctx.moveTo(q[0].x,q[0].y); ctx.lineTo(q[3].x,q[3].y); ctx.moveTo(q[1].x,q[1].y); ctx.lineTo(q[2].x,q[2].y); ctx.stroke();
    if(op.type==='window'){
      ctx.strokeStyle=sel?'#93c5fd':'#7dd3fc'; ctx.lineWidth=1.2;
      for(const dn of [-T/2, 0, T/2]){ const s1=P(-hw,dn), s2=P(hw,dn); ctx.beginPath(); ctx.moveTo(s1.x,s1.y); ctx.lineTo(s2.x,s2.y); ctx.stroke(); }
    } else {
      // porte : battant ouvert à 90° + arc de débattement (charnière à gauche/droite, ouverture côté pièce/extérieur)
      const hingeL=(op.hinge||'l')==='l', dir=(op.swing||'in')==='in'?1:-1;
      const hu=hingeL?-hw:hw, ou=hingeL?hw:-hw;           // charnière / extrémité libre (le long du mur)
      const H=P(hu,0), F=P(ou,0), O=P(hu,dir*op.w);       // O = pointe du battant ouvert
      ctx.strokeStyle=sel?'#93c5fd':'#e2e8f0'; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.moveTo(H.x,H.y); ctx.lineTo(O.x,O.y); ctx.stroke();
      const a0=Math.atan2(F.y-H.y,F.x-H.x), a1=Math.atan2(O.y-H.y,O.x-H.x);
      const cross=(F.x-H.x)*(O.y-H.y)-(F.y-H.y)*(O.x-H.x);
      ctx.strokeStyle='rgba(226,232,240,.55)'; ctx.lineWidth=1; ctx.setLineDash([4,3]);
      ctx.beginPath(); ctx.arc(H.x,H.y,Math.hypot(F.x-H.x,F.y-H.y),a0,a1,cross<0); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

function stDrawDims(ctx, v){
  if(!ST.opts.dims) return;
  ctx.font='11px ui-monospace,monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
  SC.walls.forEach(w=>{
    const pts=stWallPts(w), T=stWallThick(w), sgn=w.closed&&stSignedArea(w.pts)<0?-1:1;
    for(let si=0;si<pts.length-1;si++){
      const a=pts[si], b=pts[si+1], len=_d(a,b);
      if(len<0.15 || len*v.sc<46) continue;
      const u=_unit(b.x-a.x,b.y-a.y);
      // côté extérieur : opposé à l'intérieur pour les pièces fermées, sinon côté gauche
      const inward = w.closed ? stInwardNormal(w,si) : {x:-u.y,y:u.x};
      const out={x:-inward.x*(w.closed?1:-1)*1, y:-inward.y*(w.closed?1:-1)*1};
      const off=T/2+0.32;
      const A=mToScreen(a.x+out.x*off,a.y+out.y*off,v), B=mToScreen(b.x+out.x*off,b.y+out.y*off,v);
      const A0=mToScreen(a.x+out.x*(T/2+0.04),a.y+out.y*(T/2+0.04),v), B0=mToScreen(b.x+out.x*(T/2+0.04),b.y+out.y*(T/2+0.04),v);
      const A1=mToScreen(a.x+out.x*(off+0.08),a.y+out.y*(off+0.08),v), B1=mToScreen(b.x+out.x*(off+0.08),b.y+out.y*(off+0.08),v);
      const sel=(selWallIdx>=0&&SC.walls[selWallIdx]===w&&ST.selSeg===si);
      ctx.strokeStyle=sel?'#fde047':'rgba(125,211,252,.85)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(A0.x,A0.y); ctx.lineTo(A1.x,A1.y); ctx.moveTo(B0.x,B0.y); ctx.lineTo(B1.x,B1.y); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
      const ang=Math.atan2(B.y-A.y,B.x-A.x), tk=4;   // traits obliques aux extrémités
      ctx.beginPath(); for(const P of [A,B]){ ctx.moveTo(P.x-tk,P.y+tk); ctx.lineTo(P.x+tk,P.y-tk); } ctx.stroke();
      const m={x:(A.x+B.x)/2,y:(A.y+B.y)/2}, txt=len.toFixed(2)+' m';
      ctx.save(); ctx.translate(m.x,m.y); ctx.rotate(readableAngle(ang));
      const tw=ctx.measureText(txt).width+10;
      ctx.fillStyle='#0f1623'; ctx.fillRect(-tw/2,-8,tw,16);
      ctx.fillStyle=sel?'#fde047':'#bae6fd'; ctx.fillText(txt,0,0.5); ctx.restore();
    }
    if(w.closed){
      const c=stCentroid(w.pts), s=mToScreen(c.x,c.y,v);
      ctx.fillStyle='rgba(226,232,240,.75)'; ctx.font='bold 12px -apple-system,Segoe UI,sans-serif';
      ctx.fillText(Math.abs(stSignedArea(w.pts)).toFixed(2)+' m²', s.x, s.y-(SC.sanitaires.length?0:0));
      ctx.font='11px ui-monospace,monospace';
    }
  });
}

function stDrawArRef(ctx, v){
  const r=getArRef(), A=mToScreen(r.a.x,r.a.y,v), B=mToScreen(r.b.x,r.b.y,v);
  ctx.strokeStyle='rgba(74,222,128,.8)'; ctx.lineWidth=2; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); ctx.setLineDash([]);
  const dot=(P,col,txt)=>{ ctx.beginPath(); ctx.arc(P.x,P.y,9,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,P.x,P.y+0.5); };
  dot(A,'#2563eb','A'); dot(B,'#16a34a','B');
  ctx.fillStyle='rgba(134,239,172,.9)'; ctx.font='10px ui-monospace,monospace'; ctx.fillText('1 m',(A.x+B.x)/2,(A.y+B.y)/2-10);
}

function stDrawSelection(ctx, v){
  const so=stSelObj();
  if(so && so.o && so.kind!=='el'){
    const o=so.o, c=so.kind==='san'?CAT_SAN[o.type]:CAT_MEUBLE[o.type], P=mToScreen(o.x,o.y,v);
    ctx.save(); ctx.translate(P.x,P.y); ctx.rotate(o.rot||0);
    ctx.strokeStyle='#60a5fa'; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    ctx.strokeRect(-c.w*v.sc/2-4,-c.d*v.sc/2-4,c.w*v.sc+8,c.d*v.sc+8); ctx.setLineDash([]); ctx.restore();
    const h=stObjHandle(); if(h){ const H=mToScreen(h.x,h.y,v);
      ctx.strokeStyle='rgba(96,165,250,.7)'; ctx.beginPath(); ctx.moveTo(P.x,P.y); ctx.lineTo(H.x,H.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(H.x,H.y,7,0,Math.PI*2); ctx.fillStyle='#1d4ed8'; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
      ctx.fillStyle='#fff'; ctx.font='9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⟳',H.x,H.y+0.5); }
  }
  if(so && so.kind==='el'){ const P=mToScreen(so.o.x,so.o.y,v); ctx.beginPath(); ctx.arc(P.x,P.y,Math.max(16,v.sc*0.12),0,Math.PI*2); ctx.strokeStyle='#60a5fa'; ctx.lineWidth=1.5; ctx.setLineDash([4,3]); ctx.stroke(); ctx.setLineDash([]); }
  if(selWallIdx>=0 && SC.walls[selWallIdx]){
    const w=SC.walls[selWallIdx], pts=stWallPts(w);
    for(let si=0;si<pts.length-1;si++){
      if(_d(pts[si],pts[si+1])<0.4) continue;
      const m=mToScreen((pts[si].x+pts[si+1].x)/2,(pts[si].y+pts[si+1].y)/2,v);
      ctx.beginPath(); ctx.arc(m.x,m.y,5,0,Math.PI*2); ctx.fillStyle='rgba(96,165,250,.35)'; ctx.fill(); ctx.strokeStyle='#60a5fa'; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle='#bfdbfe'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('+',m.x,m.y+0.5);
    }
    w.pts.forEach((p,vi)=>{ const s=mToScreen(p.x,p.y,v), on=ST.selV===vi;
      ctx.fillStyle=on?'#fde047':'#fff'; ctx.strokeStyle='#1d4ed8'; ctx.lineWidth=1.5;
      ctx.fillRect(s.x-4.5,s.y-4.5,9,9); ctx.strokeRect(s.x-4.5,s.y-4.5,9,9); });
  }
  if(selOpId>0){ const op=SC.openings.find(o=>o.id===selOpId), c=op&&stOpCenter(op); if(c){ const s=mToScreen(c.x,c.y,v); ctx.beginPath(); ctx.arc(s.x,s.y,5,0,Math.PI*2); ctx.fillStyle='#60a5fa'; ctx.fill(); } }
}

function stDrawPreview(ctx, v){
  const t=ST.tool, s=ST.snap;
  const typedLbl=document.getElementById('stTyped');
  let showTyped=null;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  // tracé de mur
  if(t==='wall' && ST.poly.length){
    const pts=[...ST.poly]; const cur=s||{x:ST.p.x,y:ST.p.y};
    let end=cur;
    if(ST.typed){ const L=stParseLen(ST.typed); if(L>0){ const last=ST.poly[ST.poly.length-1], u=_unit(cur.x-last.x,cur.y-last.y); end={x:last.x+u.x*L,y:last.y+u.y*L}; } }
    const T=0.2;
    const all=[...pts,end];
    _path(ctx,all,v,false); ctx.strokeStyle='#fde047'; ctx.lineWidth=Math.max(3,T*v.sc); ctx.globalAlpha=0.28; ctx.lineJoin='round'; ctx.stroke(); ctx.globalAlpha=1;
    _path(ctx,all,v,false); ctx.lineWidth=1.5; ctx.stroke();
    const last=pts[pts.length-1], L=_d(last,end), a=Math.round(((Math.atan2(end.y-last.y,end.x-last.x)*180/Math.PI)+360)%360);
    const m=mToScreen((last.x+end.x)/2,(last.y+end.y)/2,v);
    ctx.font='bold 11px ui-monospace,monospace'; ctx.fillStyle='#fde047'; ctx.fillText(`${L.toFixed(2)} m · ${a}°`, m.x, m.y-14);
    if(ST.poly.length>=3 && _d(cur,ST.poly[0])<stTolM(12)){ const f=mToScreen(ST.poly[0].x,ST.poly[0].y,v); ctx.beginPath(); ctx.arc(f.x,f.y,10,0,Math.PI*2); ctx.strokeStyle='#4ade80'; ctx.lineWidth=2; ctx.stroke(); }
    if(ST.typed) showTyped=`Longueur : ${ST.typed}`;
  }
  // rectangle
  if(t==='rect' && ST.rectA){
    const a=ST.rectA, b=s||ST.p; let bb=b;
    if(ST.typed){ const m=ST.typed.replace(/,/g,'.').split(/[xX*]/); const w=stParseLen(m[0]), h=m.length>1?stParseLen(m[1]):NaN; if(w>0&&h>0) bb={x:a.x+w,y:a.y+h}; }
    const p1=mToScreen(a.x,a.y,v), p2=mToScreen(bb.x,bb.y,v);
    ctx.fillStyle='rgba(253,224,71,.10)'; ctx.fillRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);
    ctx.strokeStyle='#fde047'; ctx.lineWidth=1.5; ctx.strokeRect(p1.x,p1.y,p2.x-p1.x,p2.y-p1.y);
    ctx.font='bold 11px ui-monospace,monospace'; ctx.fillStyle='#fde047';
    ctx.fillText(`${Math.abs(bb.x-a.x).toFixed(2)} × ${Math.abs(bb.y-a.y).toFixed(2)} m`,(p1.x+p2.x)/2,(p1.y+p2.y)/2);
  }
  if(t==='rect' && ST.typed) showTyped=`Dimensions : ${ST.typed}`;
  // ouverture / objet : fantôme
  if((t==='door'||t==='window'||t==='place') && ST.hover && ST.hover.wi!==undefined && (t!=='place'||ST.place.kind==='op')){
    const h=ST.hover, pts=stWallPts(SC.walls[h.wi]), a=pts[h.si], b=pts[h.si+1];
    const w=(t==='place'?(ST.place.w||(ST.place.type==='window'?1.0:0.8)):(t==='window'?1.0:0.9));
    const len=_d(a,b), hw=w/2/len, tt=Math.min(1-hw,Math.max(hw,h.t)), u=_unit(b.x-a.x,b.y-a.y), c={x:a.x+(b.x-a.x)*tt,y:a.y+(b.y-a.y)*tt};
    const P1=mToScreen(c.x-u.x*w/2,c.y-u.y*w/2,v), P2=mToScreen(c.x+u.x*w/2,c.y+u.y*w/2,v);
    ctx.strokeStyle='#4ade80'; ctx.lineWidth=Math.max(6,0.2*v.sc); ctx.globalAlpha=.45; ctx.beginPath(); ctx.moveTo(P1.x,P1.y); ctx.lineTo(P2.x,P2.y); ctx.stroke(); ctx.globalAlpha=1;
  }
  if(t==='place' && ST.place && ST.place.kind!=='op' && ST.sx){
    const c=ST.place.kind==='san'?CAT_SAN[ST.place.type]:ST.place.kind==='meu'?CAT_MEUBLE[ST.place.type]:null;
    const P=mToScreen((s||ST.p).x,(s||ST.p).y,v);
    ctx.globalAlpha=.6;
    if(c){ ctx.strokeStyle='#4ade80'; ctx.fillStyle='rgba(74,222,128,.15)'; ctx.lineWidth=1.5; ctx.fillRect(P.x-c.w*v.sc/2,P.y-c.d*v.sc/2,c.w*v.sc,c.d*v.sc); ctx.strokeRect(P.x-c.w*v.sc/2,P.y-c.d*v.sc/2,c.w*v.sc,c.d*v.sc); }
    else { const ce=CAT_EL[ST.place.type]; ctx.font='16px sans-serif'; ctx.fillText(ce?ce.ico:'•',P.x,P.y); }
    ctx.globalAlpha=1;
  }
  // mesure
  if(t==='measure' && ST.measure){
    const a=ST.measure.a, b=ST.measure.b||(s||ST.p), A=mToScreen(a.x,a.y,v), B=mToScreen(b.x,b.y,v);
    ctx.strokeStyle='#f472b6'; ctx.lineWidth=1.5; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#f472b6'; ctx.font='bold 12px ui-monospace,monospace'; ctx.fillText(`${_d(a,b).toFixed(3)} m`,(A.x+B.x)/2,(A.y+B.y)/2-12);
  }
  // repère RA en cours
  if(t==='arref' && ST.arA){
    const A=mToScreen(ST.arA.x,ST.arA.y,v), cur=s||ST.p, u=_unit(cur.x-ST.arA.x,cur.y-ST.arA.y), B=mToScreen(ST.arA.x+u.x,ST.arA.y+u.y,v);
    ctx.strokeStyle='#4ade80'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(A.x,A.y,v.sc,0,Math.PI*2); ctx.strokeStyle='rgba(74,222,128,.4)'; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
  }
  // marqueur d'accrochage
  if(s && s.kind){
    if(s.gx!==null&&s.gx!==undefined){ const X=mToScreen(s.gx,0,v).x; ctx.strokeStyle='rgba(253,224,71,.5)'; ctx.setLineDash([3,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(X,0); ctx.lineTo(X,ctx.canvas.clientHeight); ctx.stroke(); ctx.setLineDash([]); }
    if(s.gy!==null&&s.gy!==undefined){ const Y=mToScreen(0,s.gy,v).y; ctx.strokeStyle='rgba(253,224,71,.5)'; ctx.setLineDash([3,4]); ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(0,Y); ctx.lineTo(ctx.canvas.clientWidth,Y); ctx.stroke(); ctx.setLineDash([]); }
    const P=mToScreen(s.x,s.y,v); ctx.strokeStyle='#fde047'; ctx.lineWidth=1.8;
    if(s.kind==='end') ctx.strokeRect(P.x-6,P.y-6,12,12);
    else if(s.kind==='mid'){ ctx.beginPath(); ctx.moveTo(P.x,P.y-7); ctx.lineTo(P.x+7,P.y+6); ctx.lineTo(P.x-7,P.y+6); ctx.closePath(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(P.x-6,P.y); ctx.lineTo(P.x+6,P.y); ctx.moveTo(P.x,P.y-6); ctx.lineTo(P.x,P.y+6); ctx.stroke(); }
    ctx.font='10px sans-serif'; ctx.fillStyle='#fde047'; ctx.textAlign='left'; ctx.fillText(stFmtKind(s.kind),P.x+10,P.y+16);
  }
  if(showTyped){ typedLbl.style.display='block'; typedLbl.textContent=showTyped; typedLbl.style.left=ST.sx+'px'; typedLbl.style.top=ST.sy+'px'; }
  else typedLbl.style.display='none';
}

function studioRender(){
  const cv=stCanvas(); if(!cv||!cv.width) return;
  const ctx=cv.getContext('2d'), v=VIEWS.studio, W=cv.clientWidth, H=cv.clientHeight;
  ctx.fillStyle='#0f1623'; ctx.fillRect(0,0,W,H);
  if(ST.opts.grid) stDrawGrid(ctx,W,H,v);
  stDrawFloors(ctx,v);
  stDrawZones(ctx,v);
  stDrawWalls(ctx,v);
  stDrawOpenings(ctx,v);
  drawSanitaires(ctx,v,'san');
  drawMeubles(ctx,v,'san');
  drawElec(ctx,v);
  stDrawDims(ctx,v);
  stDrawArRef(ctx,v);
  stDrawSelection(ctx,v);
  stDrawPreview(ctx,v);
  const z=document.getElementById('stZoom'); if(z) z.textContent=Math.round(v.sc/80*100)+' %';
}
