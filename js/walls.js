'use strict';

// ════════════════════════════════
//  STEP 0 : MURS
// ════════════════════════════════
function setTool(t){
  drawTool=t;
  ['Poly','Rect','Pan'].forEach(k=>{
    const el=document.getElementById('t'+k);
    if(el) el.classList.toggle('on', t===k.toLowerCase());
  });
  const hints={poly:'Tap pour poser un coin · Double-tap ou retour au 1er pour fermer',
               rect:'Tap 2 coins opposés',
               pan:'Glissez pour déplacer · Pinch pour zoomer'};
  document.getElementById('hintDraw').textContent = hints[t]||'';
}

function closePoly(){
  if(curPoly.length>=3) SC.walls.push({pts:[...curPoly],closed:true,kind:"ext",comp:"mur_brique_classique"});
  curPoly=[];
  redraw('draw');
}

function undo(){
  if(curPoly.length){ curPoly.pop(); }
  else if(SC.walls.length){ SC.walls.pop(); }
  redraw('draw');
}

async function clearAll(){
  if(!await askConfirm('Effacer tout le tracé ?')) return;
  SC.walls=[]; curPoly=[]; SC.openings=[]; SC.sanitaires=[]; SC.electrique=[]; SC.meubles=[];
  redraw('draw');
}

// ════════════════════════════════
//  STEP 1 : OUVERTURES
// ════════════════════════════════
function setOpenType(t){
  openType=t;
  ['Door','Win','Wide'].forEach((k,i)=>{
    const el=document.getElementById('t'+k);
    if(el) el.classList.toggle('on', t===['door','window','wide'][i]);
  });
}

function placeOpening(x,y){
  let best=null, bestD=0.30;
  for(let wi=0; wi<SC.walls.length; wi++){
    const w=SC.walls[wi];
    const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
    for(let si=0; si<pts.length-1; si++){
      const r=ptToSeg(x,y, pts[si], pts[si+1]);
      if(r.d<bestD){ bestD=r.d; best={wi,si,t:r.t}; }
    }
  }
  if(!best) return;
  const w={door:0.80, window:1.00, wide:1.40}[openType] || 0.80;
  const defMenui = openType==='window' ? 'fenetre_pvc_dv' : 'porte_bois_iso';
  const id=++SC.idSeq;
  SC.openings.push({id, type:openType, wi:best.wi, si:best.si, t:best.t, w, menui:defMenui, openDeg:30});
  selOpId=id;
  openOpProp(id);
}

let selWallIdx=-1, selOpId=-1;

// Sélection mur par tap (utilisé en mode Pan/Sélect)
function hitWall(x, y){
  let best=null, bestD=0.20;
  for(let i=0; i<SC.walls.length; i++){
    const w=SC.walls[i];
    const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
    for(let s=0; s<pts.length-1; s++){
      const r=ptToSeg(x,y, pts[s], pts[s+1]);
      if(r.d<bestD){ bestD=r.d; best=i; }
    }
  }
  return best;
}

function hitOp(x, y){
  for(let i=SC.openings.length-1; i>=0; i--){
    const op=SC.openings[i];
    const w=SC.walls[op.wi]; if(!w) continue;
    const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
    if(op.si>=pts.length-1) continue;
    const a=pts[op.si], b=pts[op.si+1];
    const cx=a.x+(b.x-a.x)*op.t, cy=a.y+(b.y-a.y)*op.t;
    if(Math.hypot(x-cx, y-cy) < 0.25) return op;
  }
  return null;
}

function openWallProp(idx){
  const w=SC.walls[idx]; if(!w) return;
  if(!w.comp) w.comp = w.kind==='int' ? 'cloison_72_48' : 'mur_brique_classique';
  document.getElementById('psWall').classList.add('open');
  document.getElementById('psWallTitle').textContent = `Mur ${idx+1}`;
  updateWallProp(idx);
}

function updateWallProp(idx){
  const w=SC.walls[idx]; if(!w) return;
  const comp = COMP_LIB[w.comp];
  const thick = compThickness(comp);
  const u = compU(comp);

  // Filtrer compositions selon kind (ext/int)
  const compChoices = Object.entries(COMP_LIB)
    .filter(([k,c])=>!w.kind || c.kind===w.kind || !c.kind)
    .map(([k,c])=>`<option value="${k}"${k===w.comp?' selected':''}>${c.label}</option>`)
    .join('');

  let layersHtml = '<div style="margin-top:10px"><div class="pf-l">Couches</div>';
  if(comp && comp.layers){
    for(let i=0; i<comp.layers.length; i++){
      const l = comp.layers[i];
      const m = MAT_LIB[l.mat];
      if(!m) continue;
      const colHex = '#' + m.col.map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
      layersHtml += `
        <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:var(--bor2);border-radius:6px;margin-bottom:4px;font-size:.7rem">
          <div style="width:14px;height:14px;background:${colHex};border:1px solid rgba(255,255,255,.2);border-radius:3px"></div>
          <div style="flex:1">${m.label}</div>
          <div style="font-family:ui-monospace,monospace;color:var(--mid)">${(l.e*1000).toFixed(0)}mm</div>
        </div>`;
    }
  }
  layersHtml += '</div>';

  const html = `
    <div class="pf">
      <div class="pf-l">Type de mur</div>
      <select onchange="setWallProp(${idx},'kind',this.value);updateWallProp(${idx})">
        <option value="ext"${w.kind==='ext'?' selected':''}>Mur extérieur</option>
        <option value="int"${w.kind==='int'?' selected':''}>Cloison intérieure</option>
      </select>
    </div>
    <div class="pf" style="margin-top:8px">
      <div class="pf-l">Composition</div>
      <select onchange="setWallProp(${idx},'comp',this.value);updateWallProp(${idx})">
        ${compChoices}
      </select>
    </div>
    ${comp ? `<div style="font-size:.65rem;color:var(--mid);font-style:italic;margin-top:4px">${comp.desc||''}</div>` : ''}
    <div class="status-info" style="margin-top:10px">
      <span>Épaisseur totale</span><b>${(thick*100).toFixed(1)} cm</b>
    </div>
    <div class="status-info">
      <span>Coef. U (W/m²·K)</span><b>${u.toFixed(2)}</b>
    </div>
    ${layersHtml}
    <button class="del-btn" onclick="delWall(${idx})">🗑 Supprimer ce mur</button>`;
  document.getElementById('psWallBody').innerHTML = html;
}

function setWallProp(idx, k, v){
  const w=SC.walls[idx]; if(!w) return;
  w[k] = v;
  // Si on change le kind, basculer vers une composition compatible
  if(k==='kind'){
    const cur = COMP_LIB[w.comp];
    if(!cur || cur.kind !== v){
      w.comp = v==='int' ? 'cloison_72_48' : 'mur_brique_classique';
    }
  }
  redraw('draw');
}

async function delWall(idx){
  if(!await askConfirm('Supprimer ce mur ?')) return;
  SC.walls.splice(idx, 1);
  // Nettoyer les ouvertures sur ce mur
  SC.openings = SC.openings.filter(op => op.wi !== idx);
  // Décaler les wi des ouvertures sur les murs suivants
  SC.openings.forEach(op => { if(op.wi > idx) op.wi--; });
  selWallIdx=-1;
  closePS('wall');
  redraw('draw');
}

// ── Ouverture : prop sheet ──
function openOpProp(id){
  const op = SC.openings.find(o=>o.id===id); if(!op) return;
  document.getElementById('psOp').classList.add('open');
  document.getElementById('psOpIco').textContent = op.type==='window' ? '🪟' : '🚪';
  document.getElementById('psOpTitle').textContent = {door:'Porte',wide:'Double porte',window:'Fenêtre'}[op.type] || 'Ouverture';
  updateOpProp(id);
}

function updateOpProp(id){
  const op=SC.openings.find(o=>o.id===id); if(!op) return;
  if(!op.menui) op.menui = op.type==='window' ? 'fenetre_pvc_dv' : 'porte_bois_iso';

  // Filtrer menuiseries selon type
  const menChoices = Object.entries(MENUI_LIB)
    .filter(([k,m])=>m.type===op.type || (op.type==='wide' && m.type==='door'))
    .map(([k,m])=>`<option value="${k}"${k===op.menui?' selected':''}>${m.label}</option>`)
    .join('');

  const m = MENUI_LIB[op.menui];
  let detail = '';
  if(m){
    if(m.type==='window'){
      const cadre = MAT_LIB[m.cadre];
      const vit = MAT_LIB[m.vitrage];
      detail = `
        <div class="status-info"><span>Cadre</span><b>${cadre?cadre.label:'—'} ${(m.cadreE*1000).toFixed(0)}mm</b></div>
        <div class="status-info"><span>Vitrage</span><b>${vit?vit.label:'—'} ${(m.vitrageE*1000).toFixed(0)}mm</b></div>
        <div class="status-info"><span>U fenêtre (Uw)</span><b>${vit?vit.U.toFixed(2):'—'} W/m²·K</b></div>`;
    } else {
      const c = m.layers && m.layers[0] ? MAT_LIB[m.layers[0].mat] : null;
      detail = `
        <div class="status-info"><span>Matériau</span><b>${c?c.label:'—'}</b></div>
        ${m.layers ? `<div class="status-info"><span>Épaisseur</span><b>${(m.layers[0].e*1000).toFixed(0)}mm</b></div>` : ''}`;
    }
  }

  const html = `
    <div class="pf-grid">
      <div class="pf">
        <div class="pf-l">Largeur (m)</div>
        <input type="number" value="${op.w.toFixed(2)}" step="0.10" min="0.40" max="2.00"
          onchange="setOpProp(${id},'w',+this.value)">
      </div>
      <div class="pf">
        <div class="pf-l">Position (0-1)</div>
        <input type="number" value="${op.t.toFixed(2)}" step="0.05" min="0" max="1"
          onchange="setOpProp(${id},'t',+this.value)">
      </div>
    </div>
    <div class="pf-grid" style="margin-top:8px">
      <div class="pf">
        <div class="pf-l">Allège (m)</div>
        <input type="number" value="${opGeom(op).y0.toFixed(2)}" step="0.05" min="0" max="2" onchange="setOpProp(${id},'sill',+this.value)">
      </div>
      <div class="pf">
        <div class="pf-l">Hauteur (m)</div>
        <input type="number" value="${(opGeom(op).y1-opGeom(op).y0).toFixed(2)}" step="0.05" min="0.3" max="2.6" onchange="setOpProp(${id},'hgt',+this.value)">
      </div>
    </div>
    <div class="pf" style="margin-top:8px">
      <div class="pf-l">Menuiserie</div>
      <select onchange="setOpProp(${id},'menui',this.value);updateOpProp(${id})">${menChoices}</select>
    </div>
    ${m ? `<div style="font-size:.65rem;color:var(--mid);font-style:italic;margin-top:4px">${m.desc||''}</div>` : ''}
    ${detail}
    ${op.type!=='window' ? `
    <div class="pf" style="margin-top:8px">
      <div class="pf-l">Ouverture porte (degrés)</div>
      <input type="range" min="0" max="120" step="5" value="${op.openDeg||30}"
        oninput="setOpProp(${id},'openDeg',+this.value);updateOpProp(${id})" style="accent-color:var(--ac)">
      <div style="text-align:right;font-family:ui-monospace,monospace;font-size:.7rem;color:var(--mid)">${op.openDeg||30}°</div>
    </div>` : ''}
    <button class="del-btn" onclick="delOp(${id})">🗑 Supprimer</button>`;
  document.getElementById('psOpBody').innerHTML = html;
}

function setOpProp(id, k, v){
  const op = SC.openings.find(o=>o.id===id); if(!op) return;
  op[k] = v;
  redraw('open');
}

function delOp(id){
  SC.openings = SC.openings.filter(o=>o.id!==id);
  selOpId=-1;
  closePS('op');
  redraw('open');
}

function ptToSeg(px,py, a, b){
  const dx=b.x-a.x, dy=b.y-a.y, l2=dx*dx+dy*dy;
  if(!l2) return {d:Math.hypot(px-a.x,py-a.y), t:0};
  const t=Math.max(0,Math.min(1, ((px-a.x)*dx+(py-a.y)*dy)/l2));
  return {d:Math.hypot(px-a.x-t*dx, py-a.y-t*dy), t};
}

function undoOpen(){ SC.openings.pop(); redraw('open'); }
