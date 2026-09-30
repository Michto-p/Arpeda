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
  if(name==='san'){ selSanId=-1; redraw('san'); }
  if(name==='el'){ selElId=-1; redraw('el'); }
  if(name==='wall'){ selWallIdx=-1; redraw('draw'); }
  if(name==='op'){ selOpId=-1; redraw('open'); }
}
