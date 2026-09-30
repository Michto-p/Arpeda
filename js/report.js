'use strict';

// ════════════════════════════════
//  RAPPORT DE CONFORMITÉ (HTML autonome, imprimable / PDF depuis le navigateur)
// ════════════════════════════════
const _esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const _ZONE_FILL = {0:'rgba(220,38,38,.35)', 1:'rgba(245,158,11,.30)', 2:'rgba(37,99,235,.22)'};
const _LVL_COL = {err:'#dc2626', warn:'#d97706', ok:'#16a34a'};
const _LVL_TXT = {err:'ERREUR', warn:'À VÉRIFIER', ok:'CONFORME'};

// Plan SVG : murs, ouvertures, zones (vue de dessus à 1 m), sanitaires, appareils numérotés
function reportPlanSVG(statusByEl){
  let mnx=Infinity,mxx=-Infinity,mny=Infinity,mxy=-Infinity;
  for(const w of SC.walls) for(const p of w.pts){
    mnx=Math.min(mnx,p.x); mxx=Math.max(mxx,p.x); mny=Math.min(mny,p.y); mxy=Math.max(mxy,p.y);
  }
  if(!isFinite(mnx)){ mnx=0; mxx=3; mny=0; mxy=2.4; }
  const M=0.8, S=100;                     // marge (m) et échelle (px/m)
  const x0=mnx-M, y0=mny-M, W=(mxx-mnx+2*M)*S, H=(mxy-mny+2*M)*S;
  const X=x=>((x-x0)*S).toFixed(1), Y=y=>((y-y0)*S).toFixed(1);
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" width="100%" style="max-width:640px;background:#fff;border:1px solid #cbd5e1;border-radius:6px">`];

  // Zones : échantillonnage par lignes, cellules contiguës fusionnées
  const roomPoly = SC.walls.length && SC.walls[0].closed ? SC.walls[0].pts : null;
  if(SC.sanitaires.some(s=>CAT_SAN[s.type]?.genZone)){
    const st=0.05;
    for(const z of [2,1,0]){
      let d='';
      for(let y=mny; y<mxy; y+=st){
        let run=null;
        for(let x=mnx; x<=mxx+st; x+=st){
          const hit = x<mxx && (!roomPoly || ptInPoly(x+st/2,y+st/2,roomPoly)) && getZone(x+st/2,y+st/2,1.0)===z;
          if(hit && run===null) run=x;
          if(!hit && run!==null){ d+=`M${X(run)} ${Y(y)}h${((x-run)*S).toFixed(1)}v${(st*S+.5).toFixed(1)}h-${((x-run)*S).toFixed(1)}z`; run=null; }
        }
      }
      if(d) parts.push(`<path d="${d}" fill="${_ZONE_FILL[z]}"/>`);
    }
  }

  // Murs
  for(const w of SC.walls){
    const pts=w.pts.map(p=>`${X(p.x)},${Y(p.y)}`).join(' ');
    parts.push(w.closed
      ? `<polygon points="${pts}" fill="none" stroke="#334155" stroke-width="6" stroke-linejoin="round"/>`
      : `<polyline points="${pts}" fill="none" stroke="#334155" stroke-width="6"/>`);
  }
  // Ouvertures
  for(const op of SC.openings){
    const w=SC.walls[op.wi]; if(!w) continue;
    const pts=w.closed?[...w.pts,w.pts[0]]:w.pts;
    if(op.si>=pts.length-1) continue;
    const a=pts[op.si], b=pts[op.si+1], sl=Math.hypot(b.x-a.x,b.y-a.y)||1, hw=op.w/2/sl;
    const t1=Math.max(0,op.t-hw), t2=Math.min(1,op.t+hw);
    const col=op.type==='window'?'#0891b2':'#2563eb';
    parts.push(`<line x1="${X(a.x+(b.x-a.x)*t1)}" y1="${Y(a.y+(b.y-a.y)*t1)}" x2="${X(a.x+(b.x-a.x)*t2)}" y2="${Y(a.y+(b.y-a.y)*t2)}" stroke="#fff" stroke-width="8"/>`);
    parts.push(`<line x1="${X(a.x+(b.x-a.x)*t1)}" y1="${Y(a.y+(b.y-a.y)*t1)}" x2="${X(a.x+(b.x-a.x)*t2)}" y2="${Y(a.y+(b.y-a.y)*t2)}" stroke="${col}" stroke-width="3"/>`);
  }
  // Sanitaires
  for(const s of SC.sanitaires){
    const c=CAT_SAN[s.type]; if(!c) continue;
    const deg=((s.rot||0)*180/Math.PI).toFixed(1);
    parts.push(`<g transform="rotate(${deg} ${X(s.x)} ${Y(s.y)})"><rect x="${X(s.x-c.w/2)}" y="${Y(s.y-c.d/2)}" width="${(c.w*S).toFixed(1)}" height="${(c.d*S).toFixed(1)}" rx="6" fill="rgba(226,232,240,.55)" stroke="#64748b" stroke-width="2"/>`
      +`<text x="${X(s.x)}" y="${Y(s.y)}" font-size="13" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="sans-serif">${_esc(c.label)}</text></g>`);
  }
  // Meubles
  for(const m of SC.meubles){
    const c=CAT_MEUBLE[m.type]; if(!c) continue;
    const deg=((m.rot||0)*180/Math.PI).toFixed(1);
    parts.push(`<g transform="rotate(${deg} ${X(m.x)} ${Y(m.y)})"><rect x="${X(m.x-c.w/2)}" y="${Y(m.y-c.d/2)}" width="${(c.w*S).toFixed(1)}" height="${(c.d*S).toFixed(1)}" rx="3" fill="rgba(180,150,100,.35)" stroke="#8a7a5a" stroke-width="1.5"${m.z>0.05?' stroke-dasharray="5 3"':''}/></g>`);
  }
  // Appareils
  statusByEl.forEach((st,el)=>{
    const i=[...statusByEl.keys()].indexOf(el);
    const col=_LVL_COL[statusByEl.get(el)]||'#16a34a';
    parts.push(`<circle cx="${X(el.x)}" cy="${Y(el.y)}" r="11" fill="${col}" stroke="#fff" stroke-width="2"/>`
      +`<text x="${X(el.x)}" y="${Y(el.y)}" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff" font-family="sans-serif">${i+1}</text>`);
  });
  parts.push('</svg>');
  return parts.join('');
}

function buildReportHTML(){
  const ev = evaluateProject();
  const v = calcVols();
  const inst = normalizeInstall(SC.install);
  const statusByEl = new Map();
  for(const {el,errs,warns} of ev.items) statusByEl.set(el, errs.length?'err':warns.length?'warn':'ok');
  const now = new Date();
  const badge = l => `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;color:#fff;background:${_LVL_COL[l]}">${_LVL_TXT[l]}</span>`;

  const rowsEl = ev.items.map((it,i)=>{
    const {el,errs,warns}=it;
    const c=it.cat, st=statusByEl.get(el);
    const zn = it.kind==='meuble' ? meubleZone(el) : el.zone;
    const zone = zn==='hors'?'Hors volume':'Volume '+zn;
    const msgs=[...errs.map(m=>`✖ ${_esc(m)}`),...warns.map(m=>`⚠ ${_esc(m)}`)].join('<br>');
    return `<tr><td>${i+1}</td><td>${_esc(c.label)}</td><td>${zone}</td><td>${(it.kind==='meuble'?el.z:el.h).toFixed(2)} m</td><td>${_esc(el.ip)} · Cl.${_esc(el.cl)}</td><td>${badge(st)}</td><td>${msgs||'—'}</td></tr>`;
  }).join('');

  const rowsInst = ev.install.map(f=>`<tr><td>${badge(f.level)}</td><td><b>${_esc(f.title)}</b></td><td>${_esc(f.detail)}</td></tr>`).join('');
  const rowsCirc = ev.circuits.map(c=>`<tr><td>${_esc(c.label)}</td><td>${c.count}</td><td>${_esc(c.spec)}</td><td>${_esc(c.note||'—')}</td></tr>`).join('');
  const yn = v=>v===true?'Oui':v===false?'Non':'Non renseigné';
  const cond = Object.entries({canalisations:'Canalisations métalliques',huisseries:'Huisseries métalliques',bacMetal:'Baignoire/receveur métallique'})
    .filter(([k])=>inst.conducteurs[k]).map(([,t])=>t).join(', ') || 'Aucun déclaré';
  const scCol = ev.score>=80?'#16a34a':ev.score>=50?'#d97706':'#dc2626';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport Arpeda — ${now.toISOString().slice(0,10)}</title>
<style>
body{font-family:-apple-system,'Segoe UI',sans-serif;color:#0f172a;max-width:800px;margin:0 auto;padding:24px;line-height:1.45}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:26px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1f5f9;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
.score{font-size:40px;font-weight:800;color:${scCol}}.mut{color:#64748b;font-size:12px}
.leg span{display:inline-block;margin-right:14px;font-size:12px}.leg i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;vertical-align:-1px}
@media print{body{padding:0}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>
<h1>Rapport de conformité — salle d'eau</h1>
<div class="mut">Arpeda v${APP_VERSION} · ${now.toLocaleString('fr-FR')} · Référentiel : NF C 15-100 (partie 7-701)</div>

<h2>Synthèse</h2>
<div><span class="score">${ev.score}%</span> &nbsp; ${ev.errs} erreur(s) · ${ev.warns} alerte(s)</div>
<div class="mut">Surface ${roomArea().toFixed(2)} m² · hauteur ${SC.roomH.toFixed(2)} m · volume ${v.roomVol.toFixed(2)} m³ ·
Volume 0 : ${v.z0.toFixed(2)} m³ · Volume 1 : ${v.z1.toFixed(2)} m³ · Volume 2 : ${v.z2.toFixed(2)} m³</div>

<h2>Plan</h2>
${reportPlanSVG(statusByEl)}
<div class="leg" style="margin-top:6px">
<span><i style="background:${_ZONE_FILL[0]}"></i>Volume 0</span><span><i style="background:${_ZONE_FILL[1]}"></i>Volume 1</span><span><i style="background:${_ZONE_FILL[2]}"></i>Volume 2</span>
<span><i style="background:${_LVL_COL.ok}"></i>Appareil conforme</span><span><i style="background:${_LVL_COL.warn}"></i>À vérifier</span><span><i style="background:${_LVL_COL.err}"></i>Erreur</span>
</div>

<h2>Installation</h2>
<table><tbody>${rowsInst}</tbody></table>
<p class="mut">Éléments conducteurs : ${_esc(cond)} · DDR 30 mA : ${yn(inst.diff30)} · LEL : ${yn(inst.lel)}${inst.lel===true?` (${inst.lelSection} mm², ${inst.lelProtegee?'protégée':'apparente'})`:''}</p>

<h2>Circuits (indicatif)</h2>
${rowsCirc?`<table><thead><tr><th>Circuit</th><th>Points</th><th>Section · protection</th><th>Remarque</th></tr></thead><tbody>${rowsCirc}</tbody></table>`:'<p class="mut">Aucun appareil posé.</p>'}

<h2>Appareillage</h2>
${rowsEl?`<table><thead><tr><th>#</th><th>Appareil</th><th>Emplacement</th><th>Hauteur</th><th>IP · Classe</th><th>Statut</th><th>Remarques</th></tr></thead><tbody>${rowsEl}</tbody></table>`:'<p class="mut">Aucun appareil posé.</p>'}

<p class="mut" style="margin-top:28px">Document généré automatiquement, à titre indicatif. Il ne remplace ni le texte de la norme NF C 15-100 ni le contrôle d'un électricien qualifié.</p>
</body></html>`;
}

function exportReport(){
  const blob = new Blob([buildReportHTML()], {type:'text/html'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `arpeda-rapport-${new Date().toISOString().slice(0,10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast('Rapport exporté');
}
