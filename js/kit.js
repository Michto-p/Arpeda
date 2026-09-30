'use strict';

// ════════════════════════════════════════════════════════════════
//  ÉQUIPEMENT TYPE D'UNE SALLE D'EAU (un clic)
//  Pose un point d'éclairage, un interrupteur et une prise 16 A aux emplacements qui passent
//  les règles (volumes, distance à l'eau, hauteur, IP) : le moteur checkEl() valide chaque candidat.
//  Les types déjà présents ne sont pas dupliqués.
// ════════════════════════════════════════════════════════════════

// Points le long des faces intérieures des murs de pièces fermées : hors coins et hors ouvertures
function kitWallPoints(){
  const out=[];
  SC.walls.forEach((w,wi)=>{
    if(!w.closed) return;
    const pts=stWallPts(w), T=stWallThick(w);
    for(let si=0;si<pts.length-1;si++){
      const a=pts[si], b=pts[si+1], len=_d(a,b);
      if(len<0.6) continue;
      const u=_unit(b.x-a.x,b.y-a.y), n=stInwardNormal(w,si);
      const ops=SC.openings.filter(o=>o.wi===wi&&o.si===si);
      for(let d=0.30; d<=len-0.30+1e-9; d+=0.05){
        if(ops.some(o=>Math.abs(o.t*len-d) < o.w/2+0.15)) continue;
        out.push({x:a.x+u.x*d+n.x*(T/2), y:a.y+u.y*d+n.y*(T/2), wi, si, d});
      }
    }
  });
  return out;
}

function kitTry(type, x, y){
  const c=CAT_EL[type];
  const el={type, x, y, h:c.defH||1.0, ip:c.ip, cl:c.cl};
  el.zone=getZone(x,y,el.h); el.distCm=distToV0(x,y);
  const r=checkEl(el);
  return {el, errs:r.errs, ok:r.errs.length===0};
}

// Occupé par un sanitaire ou un meuble ?
function kitBlocked(x,y){
  return SC.sanitaires.some(s=>inSanitaire(x,y,s)) || SC.meubles.some(m=>stInMeuble(m,{x,y},0.05));
}

function kitPush(el){
  el.id=++SC.idSeq;
  elMountToWall(el, 0.3);       // plaqué contre le mur, orienté vers la pièce
  SC.electrique.push(el);
  return el;
}

// Point d'éclairage : au plafond, au centre de la pièce (le point le plus proche à l'intérieur)
function kitPlaceLight(){
  const room=SC.walls.find(w=>w.closed); if(!room) return null;
  const ring=stInnerRing(room);
  let c=stCentroid(ring);
  if(!ptInPoly(c.x,c.y,ring)){
    let best=null;
    for(const p of ring) for(let t=0.1;t<=0.9;t+=0.1){ const q={x:p.x+(c.x-p.x)*t,y:p.y+(c.y-p.y)*t}; if(ptInPoly(q.x,q.y,ring)){ best=q; break; } }
    if(best) c=best;
  }
  const r=kitTry('dcl',c.x,c.y);
  return {...r, el:kitPush(r.el)};
}

// Interrupteur : contre le mur de la porte, côté poignée (côté opposé à la charnière), hors du débattement
function kitPlaceSwitch(){
  const cands=kitWallPoints(); if(!cands.length) return null;
  const doors=SC.openings.filter(o=>o.type!=='window');
  let target=null;
  if(doors.length){
    const op=doors[0], w=SC.walls[op.wi], pts=stWallPts(w), a=pts[op.si], b=pts[op.si+1];
    const len=_d(a,b), u=_unit(b.x-a.x,b.y-a.y), side=(op.hinge||'l')==='l'?1:-1;
    const s=op.t*len+side*(op.w/2+0.22);
    const n=stInwardNormal(w,op.si), T=stWallThick(w);
    target={x:a.x+u.x*s+n.x*(T/2), y:a.y+u.y*s+n.y*(T/2)};
  }
  const ref=target || {x:cands[0].x, y:cands[0].y};
  return kitBest('inter', cands, p=>-_d(p,ref), true);
}

// Prise : contre un mur, de préférence à environ 0,9 m d'un lavabo / meuble vasque
function kitPlaceSocket(taken){
  const cands=kitWallPoints(); if(!cands.length) return null;
  const basins=[...SC.sanitaires.filter(s=>s.type==='lavabo'||s.type==='vasque'), ...SC.meubles.filter(m=>m.type==='meuble_vasque')];
  const score=p=>{
    let s=0;
    if(basins.length) s-=Math.min(...basins.map(b=>Math.abs(_d(p,b)-0.9)));
    for(const t of taken) if(_d(p,t)<0.5) s-=5;      // pas collé à un autre appareil
    return s;
  };
  return kitBest('prise', cands, score, true);
}

// Meilleur candidat conforme (score max) ; à défaut, celui qui a le moins d'erreurs
function kitBest(type, cands, score, wall){
  let bestOk=null, bestAny=null;
  for(const p of cands){
    if(wall && kitBlocked(p.x,p.y)) continue;
    const r=kitTry(type,p.x,p.y), s=score(p);
    if(r.ok && (!bestOk || s>bestOk.s)) bestOk={...r,s};
    const ss = s - r.errs.length*100;
    if(!bestAny || ss>bestAny.s) bestAny={...r,s:ss};
  }
  const pick=bestOk||bestAny;
  if(!pick) return null;
  return {...pick, el:kitPush(pick.el)};
}

function studioAutoKit(){
  if(!SC.walls.some(w=>w.closed)){ toast("Tracez d'abord la pièce (R ou W)"); return; }
  histCommit();
  const has=t=>SC.electrique.some(e=>e.type===t);
  const done=[], problems=[], taken=SC.electrique.map(e=>({x:e.x,y:e.y}));
  const want=[
    ['dcl',   'point d\'éclairage', ()=>kitPlaceLight()],
    ['inter', 'interrupteur',       ()=>kitPlaceSwitch()],
    ['prise', 'prise 16 A',         ()=>kitPlaceSocket(taken)],
  ];
  for(const [type,label,fn] of want){
    if(has(type)) continue;
    const r=fn();
    if(!r){ problems.push(`${label} : aucun mur disponible`); continue; }
    taken.push({x:r.el.x,y:r.el.y});
    done.push(label);
    if(!r.ok) problems.push(`${label} : ${r.errs[0]}`);
  }
  refreshElements();
  stClearSel(); studioPanelRefresh();
  redraw('studio'); histCommit();
  if(!done.length){ toast('Équipement type déjà complet'); return; }
  toast(problems.length ? `Posé : ${done.join(', ')} — à revoir : ${problems.join(' ; ')}` : `Posé : ${done.join(', ')} — conformes`);
}
