'use strict';

function addEl(type){
  const c=CAT_EL[type];
  let cx=1.5, cy=1.2;
  if(SC.walls.length){
    let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
    for(const w of SC.walls)for(const p of w.pts){
      mnx=Math.min(mnx,p.x);mxx=Math.max(mxx,p.x);
      mny=Math.min(mny,p.y);mxy=Math.max(mxy,p.y);
    }
    cx=(mnx+mxx)/2; cy=(mny+mxy)/2;
  }
  const id=++SC.idSeq;
  const el={id, type, x:cx, y:cy, h:c.defH||1.0, ip:c.ip, cl:c.cl};
  if(c.mount==='wall') elMountToWall(el, 99);
  el.zone=getZone(el.x,el.y,el.h);
  el.distCm=distToV0(el.x,el.y);
  SC.electrique.push(el);
  selElId=id;
  openElProp(id);
  redraw('el');
}

function checkEl(el){
  const c=CAT_EL[el.type]; if(!c) return {errs:[],warns:[]};
  const errs=[], warns=[];
  if(c.zones && !c.zones.includes(el.zone))
    errs.push(`Zone ${el.zone} interdite`);
  if(c.minDist && el.distCm<c.minDist)
    errs.push(`Trop près de l'eau: ${Math.round(el.distCm)}cm`);
  if(c.minH && el.h<c.minH)
    errs.push(`H trop bas: ${el.h.toFixed(2)}m (min ${c.minH}m)`);
  if(c.maxH && el.h>c.maxH)
    warns.push(`H élevée: ${el.h.toFixed(2)}m`);
  const ipN=v=>parseInt((v||'IP21').replace('IP',''))||0;
  if(ipN(el.ip)<ipN((el.zone===1||el.zone===2)?'IP44':'IP21'))
    errs.push(`IP insuffisant: ${el.ip}`);
  if((el.zone===1||el.zone===2) && el.cl==='I')
    errs.push('Classe I interdit en zone humide');
  return {errs, warns};
}

function openElProp(id){
  const el=SC.electrique.find(x=>x.id===id); if(!el) return;
  const c=CAT_EL[el.type];
  document.getElementById('psEl').classList.add('open');
  document.getElementById('psElIco').textContent=c.ico;
  document.getElementById('psElTitle').textContent=c.label;
  updateElProp(id);
}

function updateElProp(id){
  const el=SC.electrique.find(x=>x.id===id); if(!el) return;
  const {errs,warns}=checkEl(el);
  const st=errs.length?'er':warns.length?'wn':'ok';
  const zL=el.zone==='hors'?'Hors zone':'Zone '+el.zone;
  document.getElementById('psElBody').innerHTML=`
    <div class="pf-grid">
      <div class="pf">
        <div class="pf-l">Hauteur (m)</div>
        <input type="number" value="${el.h.toFixed(2)}" step="0.05" min="0" max="4"
          onchange="setElProp(${id},'h',+this.value)">
      </div>
      <div class="pf">
        <div class="pf-l">Indice IP</div>
        <select onchange="setElProp(${id},'ip',this.value)">
          ${['IP21','IP44','IP55','IP65'].map(v=>`<option${el.ip===v?' selected':''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="pf">
      <div class="pf-l">Classe isolation</div>
      <select onchange="setElProp(${id},'cl',this.value)">
        ${['I','II','III'].map(v=>`<option${el.cl===v?' selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="status-info" style="margin-top:8px">
      <span>Zone</span><b>${zL}</b>
    </div>
    <div class="status-info">
      <span>Distance eau</span><b>${el.distCm===Infinity?'—':Math.round(el.distCm)+' cm'}</b>
    </div>
    <div class="status-badge ${st}">${st==='ok'?'✅ Conforme NF C 15-100':st==='wn'?'⚠️ '+warns[0]:'❌ '+errs[0]}</div>
    ${errs.slice(1).map(e=>`<div class="status-badge er" style="margin-top:4px">❌ ${e}</div>`).join('')}
    <button class="del-btn" onclick="delEl(${id})">🗑 Supprimer</button>`;
}

function setElProp(id,k,v){
  const el=SC.electrique.find(x=>x.id===id); if(!el) return;
  el[k]=v;
  el.zone=getZone(el.x,el.y,el.h);
  el.distCm=distToV0(el.x,el.y);
  updateElProp(id); redraw('el');
}

function delEl(id){
  SC.electrique=SC.electrique.filter(e=>e.id!==id);
  selElId=-1; closePS('el'); redraw('el');
}

function closePS(name){
  const id = 'ps'+name[0].toUpperCase()+name.slice(1);
  const el = document.getElementById(id);
  if(el) el.classList.remove('open');
  if(name==='san'){ selSanId=-1; selMeuId=-1; redraw('san'); }
  if(name==='el'){ selElId=-1; redraw('el'); }
  if(name==='wall'){ selWallIdx=-1; redraw('draw'); }
  if(name==='op'){ selOpId=-1; redraw('open'); }
  if(STUDIO.active) studioPanelRefresh();
}

// ── Appareillage mural : plaqué contre la face intérieure d'un mur ──
// el.rot = angle tel que l'axe local +y (profondeur) pointe vers l'intérieur de la pièce :
// la plaque occupe x∈[-pw/2, pw/2], y∈[0, pd] autour de (el.x, el.y) = point de la face du mur.
function elMountToWall(el, maxD=0.6){
  const c=CAT_EL[el.type]; if(!c || c.mount!=='wall') return false;
  let best=null;
  SC.walls.forEach(w=>{
    const pts = w.closed ? [...w.pts, w.pts[0]] : w.pts;
    const comp = w.comp ? COMP_LIB[w.comp] : null;
    const T = comp ? compThickness(comp) : (w.kind==='int' ? 0.10 : 0.20);
    for(let si=0; si<pts.length-1; si++){
      const a=pts[si], b=pts[si+1], len=Math.hypot(b.x-a.x,b.y-a.y); if(len<0.05) continue;
      const ux=(b.x-a.x)/len, uy=(b.y-a.y)/len;
      const along=Math.max(0,Math.min(len,(el.x-a.x)*ux+(el.y-a.y)*uy));
      const px=a.x+ux*along, py=a.y+uy*along;
      let nx=-uy, ny=ux;
      if(w.closed){
        if(!ptInPoly(px+nx*0.1, py+ny*0.1, w.pts)){ nx=-nx; ny=-ny; }       // vers l'intérieur
      } else if((el.x-px)*nx+(el.y-py)*ny < 0){ nx=-nx; ny=-ny; }             // cloison : côté de l'appareil
      const fx=px+nx*T/2, fy=py+ny*T/2, d=Math.hypot(el.x-fx, el.y-fy);
      if(d<maxD && (!best || d<best.d)) best={d,fx,fy,nx,ny};
    }
  });
  if(!best) return false;
  el.x=best.fx; el.y=best.fy;
  el.rot=Math.atan2(best.ny,best.nx)-Math.PI/2;
  return true;
}
