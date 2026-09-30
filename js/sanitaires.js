'use strict';

// ════════════════════════════════
//  STEP 2 : SANITAIRES
// ════════════════════════════════
function addSan(type){
  const c=CAT_SAN[type];
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
  SC.sanitaires.push({id, type, x:cx, y:cy, rot:0});
  selSanId=id;
  openSanProp(id);
  redraw('san');
}

function openSanProp(id){
  const s=SC.sanitaires.find(x=>x.id===id); if(!s) return;
  const c=CAT_SAN[s.type];
  document.getElementById('psSan').classList.add('open');
  document.getElementById('psSanIco').textContent=c.ico;
  document.getElementById('psSanTitle').textContent=c.label;
  updateSanProp(id);
}

function updateSanProp(id){
  const s=SC.sanitaires.find(x=>x.id===id); if(!s) return;
  const c=CAT_SAN[s.type];
  const rotDeg=Math.round((s.rot||0)*180/Math.PI);

  // Section pommeau (douche italienne seulement)
  let pommeauSection = '';
  if(s.type === 'douche_it'){
    const pp = pommeauPos(s);
    const isCustom = typeof s.pommeauLx === 'number';
    pommeauSection = `
    <div style="margin-top:8px;padding:8px 10px;background:rgba(34,211,238,.10);border:1px solid rgba(34,211,238,.30);border-radius:8px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:.9rem">⊕</span>
        <span style="font-weight:700;font-size:.72rem;color:#22d3ee">Pommeau de douche</span>
      </div>
      <div style="font-size:.65rem;color:var(--mid);margin-bottom:4px">
        Position : ${pp.x.toFixed(2)} · ${pp.y.toFixed(2)} m
        ${isCustom?' <span style="color:#22d3ee">(personnalisée)</span>':' <span style="color:var(--mid)">(auto coin)</span>'}
      </div>
      <div style="font-size:.62rem;color:var(--mid);margin-bottom:6px;font-style:italic">
        Le V1 s'étend de 1,20 m horizontalement autour du pommeau.<br>
        Glissez le point ⊕ sur le plan pour le déplacer.
      </div>
      ${isCustom?`<button onclick="resetPommeau(${id})" style="width:100%;padding:7px;border-radius:6px;border:1px solid rgba(34,211,238,.30);background:transparent;color:#22d3ee;font-weight:600;font-size:.7rem;cursor:pointer">↺ Position auto</button>`:''}
    </div>`;
  }

  document.getElementById('psSanBody').innerHTML=`
    <div class="status-info">
      <span>Dimensions</span>
      <b>${c.w.toFixed(2)} × ${c.d.toFixed(2)} m</b>
    </div>
    <div class="status-info">
      <span>Position</span>
      <b>X: ${s.x.toFixed(2)} · Y: ${s.y.toFixed(2)} m</b>
    </div>
    <div class="pf">
      <div class="pf-l">Rotation : ${rotDeg}°</div>
      <input type="range" min="0" max="360" step="15" value="${rotDeg}"
        oninput="setSanRot(${id}, +this.value)" style="accent-color:var(--ac)">
    </div>
    <div class="action-grp" style="display:flex;gap:6px;margin-top:8px">
      <button class="action-btn" style="flex:1;padding:9px;border-radius:8px;border:1.5px solid var(--bor);background:var(--bor2);color:var(--txt2);font-weight:600;font-size:.7rem;cursor:pointer" onclick="rotSan(${id},-90)">↺ -90°</button>
      <button class="action-btn" style="flex:1;padding:9px;border-radius:8px;border:1.5px solid var(--bor);background:var(--bor2);color:var(--txt2);font-weight:600;font-size:.7rem;cursor:pointer" onclick="rotSan(${id},90)">↻ +90°</button>
    </div>
    ${pommeauSection}
    ${c.water?'<div class="status-badge ok" style="margin-top:8px">💧 ' + (c.genZone?'Génère des zones NF C 15-100':'Sanitaire d\'eau (sans zone)') + '</div>':
              '<div class="status-badge wn" style="margin-top:8px">Pas d\'eau</div>'}
    <button class="del-btn" onclick="delSan(${id})">🗑 Supprimer</button>`;
}

function resetPommeau(id){
  const s=SC.sanitaires.find(x=>x.id===id); if(!s) return;
  delete s.pommeauLx;
  delete s.pommeauLy;
  updateSanProp(id);
  redraw('san');
}

function setSanRot(id, deg){
  const s=SC.sanitaires.find(x=>x.id===id); if(!s) return;
  s.rot = deg*Math.PI/180;
  redraw('san');
}
function rotSan(id, deg){
  const s=SC.sanitaires.find(x=>x.id===id); if(!s) return;
  s.rot = (s.rot||0) + deg*Math.PI/180;
  while(s.rot<0) s.rot += 2*Math.PI;
  while(s.rot>=2*Math.PI) s.rot -= 2*Math.PI;
  updateSanProp(id);
  redraw('san');
}

function delSan(id){
  SC.sanitaires=SC.sanitaires.filter(s=>s.id!==id);
  selSanId=-1;
  closePS('san');
  redraw('san');
}
