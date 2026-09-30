'use strict';

// ════════════════════════════════
//  MEUBLES ET APPAREILS (étape Sanitaires)
// ════════════════════════════════
function addMeuble(type){
  const c=CAT_MEUBLE[type];
  let cx=1.5, cy=1.2;
  if(SC.walls.length){
    let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
    for(const w of SC.walls)for(const p of w.pts){
      mnx=Math.min(mnx,p.x);mxx=Math.max(mxx,p.x);mny=Math.min(mny,p.y);mxy=Math.max(mxy,p.y);
    }
    cx=(mnx+mxx)/2; cy=(mny+mxy)/2;
  }
  const id=++SC.idSeq;
  SC.meubles.push({id, type, x:cx, y:cy, rot:0, z:c.z, hgt:c.hgt, ip:c.ip||null, cl:c.cl||null});
  selSanId=-1; selMeuId=id;
  openMeubleProp(id);
  redraw('san');
}

// Volume le plus contraignant occupé par le meuble (centre + 4 coins, à mi-hauteur)
function meubleZone(m){
  const c=CAT_MEUBLE[m.type];
  const h=Math.min(2.2, m.z + m.hgt/2);
  const cos=Math.cos(m.rot||0), sin=Math.sin(m.rot||0);
  const pts=[[0,0],[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
    const lx=a*c.w/2*0.9, ly=b*c.d/2*0.9;
    return [m.x+lx*cos-ly*sin, m.y+lx*sin+ly*cos];
  });
  let best='hors';
  for(const [x,y] of pts){
    const z=getZone(x,y,h);
    if(z!=='hors' && (best==='hors' || z<best)) best=z;
  }
  return best;
}

function checkMeuble(m){
  const c=CAT_MEUBLE[m.type]; if(!c||!c.elec) return {errs:[],warns:[]};
  const errs=[], warns=[];
  const z=meubleZone(m);
  if(!c.zonesOk.includes(z)){
    if((c.zonesWarn||[]).includes(z)) warns.push(`Volume ${z} : conditions particulières, à vérifier`);
    else errs.push(`Volume ${z} interdit pour ce matériel`);
  }
  const ipN=v=>parseInt((v||'IP21').replace('IP',''))||0;
  if((z===1||z===2) && ipN(m.ip)<44) errs.push(`IP insuffisant : ${m.ip}`);
  if((z===1||z===2) && m.cl==='I') errs.push('Classe I interdit en volume humide');
  return {errs,warns,zone:z};
}

function openMeubleProp(id){
  const m=SC.meubles.find(x=>x.id===id); if(!m) return;
  const c=CAT_MEUBLE[m.type];
  document.getElementById('psSan').classList.add('open');
  document.getElementById('psSanIco').textContent=c.ico;
  document.getElementById('psSanTitle').textContent=c.label;
  updateMeubleProp(id);
}

function updateMeubleProp(id){
  const m=SC.meubles.find(x=>x.id===id); if(!m) return;
  const c=CAT_MEUBLE[m.type];
  const rotDeg=Math.round((m.rot||0)*180/Math.PI);
  const r=checkMeuble(m);
  const st=r.errs.length?'er':r.warns.length?'wn':'ok';
  const elecBlock = c.elec ? `
    <div class="pf-grid">
      <div class="pf"><div class="pf-l">Indice IP</div>
        <select onchange="setMeubleProp(${id},'ip',this.value)">
          ${['IP21','IP24','IP25','IP44','IP55','IP65'].map(v=>`<option${m.ip===v?' selected':''}>${v}</option>`).join('')}
        </select></div>
      <div class="pf"><div class="pf-l">Classe</div>
        <select onchange="setMeubleProp(${id},'cl',this.value)">
          ${['I','II','III'].map(v=>`<option${m.cl===v?' selected':''}>${v}</option>`).join('')}
        </select></div>
    </div>
    <div class="status-info"><span>Volume</span><b>${r.zone==='hors'?'Hors volume':'Volume '+r.zone}</b></div>
    <div class="status-badge ${st}">${st==='ok'?'✅ Conforme NF C 15-100':st==='wn'?'⚠️ '+r.warns[0]:'❌ '+r.errs[0]}</div>
    ${r.errs.slice(1).map(e=>`<div class="status-badge er" style="margin-top:4px">❌ ${e}</div>`).join('')}` : '';
  document.getElementById('psSanBody').innerHTML=`
    <div class="pf-grid">
      <div class="pf"><div class="pf-l">Élévation du bas (m)</div>
        <input type="number" value="${m.z.toFixed(2)}" step="0.05" min="0" max="2.5" onchange="setMeubleProp(${id},'z',+this.value)"></div>
      <div class="pf"><div class="pf-l">Hauteur objet (m)</div>
        <input type="number" value="${m.hgt.toFixed(2)}" step="0.05" min="0.05" max="2.5" onchange="setMeubleProp(${id},'hgt',+this.value)"></div>
    </div>
    <div class="status-info"><span>Dimensions</span><b>${c.w.toFixed(2)} × ${c.d.toFixed(2)} m</b></div>
    <div class="pf">
      <div class="pf-l">Rotation : ${rotDeg}°</div>
      <input type="range" min="0" max="360" step="15" value="${rotDeg}" oninput="setMeubleRot(${id}, +this.value)" style="accent-color:var(--ac)">
    </div>
    ${elecBlock}
    <button class="del-btn" onclick="delMeuble(${id})">🗑 Supprimer</button>`;
}

function setMeubleProp(id,k,v){
  const m=SC.meubles.find(x=>x.id===id); if(!m) return;
  if((k==='z'||k==='hgt') && !(v>=0)) return;
  m[k]=v;
  updateMeubleProp(id); redraw('san');
}
function setMeubleRot(id,deg){
  const m=SC.meubles.find(x=>x.id===id); if(!m) return;
  m.rot=deg*Math.PI/180; redraw('san');
}
function delMeuble(id){
  SC.meubles=SC.meubles.filter(m=>m.id!==id);
  selMeuId=-1; closePS('san');
}

// Rendu 2D (vue de dessus)
function drawMeubles(ctx, v, name){
  for(const m of SC.meubles){
    const c=CAT_MEUBLE[m.type];
    const cp=mToScreen(m.x,m.y,v);
    const w=c.w*v.sc, h=c.d*v.sc;
    const sel=(name==='san' && m.id===selMeuId);
    const r=checkMeuble(m);
    const col=r.errs.length?'#ef4444':r.warns.length?'#f59e0b':null;
    ctx.save();
    ctx.translate(cp.x,cp.y); ctx.rotate(m.rot||0);
    if(sel){ ctx.shadowColor='rgba(96,165,250,.7)'; ctx.shadowBlur=14; }
    const f=c.col.map(x=>Math.round(x*255));
    ctx.fillStyle=`rgba(${f[0]},${f[1]},${f[2]},.55)`;
    ctx.strokeStyle=sel?'#60a5fa':(col||'#8a7a5a');
    ctx.lineWidth=sel?2.5:(col?2:1.5);
    ctx.setLineDash(m.z>0.05?[5,3]:[]);      // pointillé = objet surélevé
    rr(ctx,-w/2,-h/2,w,h,3); ctx.fill(); ctx.stroke();
    ctx.restore();
    if(name==='san'||sel){
      ctx.font='bold 9px ui-monospace,monospace';
      ctx.fillStyle=sel?'#60a5fa':'rgba(200,180,140,.85)';
      ctx.textAlign='center';
      ctx.fillText(`${c.ico} ${c.label}`, cp.x, cp.y+Math.max(c.w,c.d)*v.sc/2+12);
    }
  }
}
