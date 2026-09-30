'use strict';

// ════════════════════════════════
//  STEP 4 : NORMES
// ════════════════════════════════
const LVL = {
  err: {col:'#ef4444', ico:'❌', tag:'ERREUR'},
  warn:{col:'#f59e0b', ico:'⚠️', tag:'VÉRIFIER'},
  ok:  {col:'#22c55e', ico:'✅', tag:'CONFORME'},
};

const _card = (inner)=>`<div style="background:var(--sur);border-radius:12px;border:1px solid var(--bor);padding:12px;margin-bottom:12px">${inner}</div>`;
const _cardTitle = t=>`<div style="font-size:.62rem;font-weight:700;color:var(--mid);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${t}</div>`;
const _sel = (label, onchange, opts)=>`
  <label style="display:flex;align-items:center;gap:8px;font-size:.72rem;color:var(--txt2);margin-bottom:8px">
    <span style="flex:1">${label}</span>
    <select onchange="${onchange}" style="background:var(--bor2);color:var(--txt);border:1px solid var(--bor);border-radius:7px;padding:6px 8px;font-size:.72rem">
      ${opts.map(([v,t,on])=>`<option value="${v}"${on?' selected':''}>${t}</option>`).join('')}
    </select>
  </label>`;
const _chk = (label, key, on)=>`
  <label style="display:flex;align-items:center;gap:8px;font-size:.72rem;color:var(--txt2);margin-bottom:6px">
    <input type="checkbox" ${on?'checked':''} onchange="setInstall('conducteurs.${key}', this.checked)" style="accent-color:var(--ac);width:16px;height:16px">
    <span>${label}</span>
  </label>`;

// Mise à jour d'un paramètre d'installation (clé 'a' ou 'a.b'), valeur brute d'un <select> ou d'une case
function setInstall(path, val){
  if(val==='null') val=null; else if(val==='true') val=true; else if(val==='false') val=false;
  else if(typeof val==='string' && val!=='' && !isNaN(val)) val=+val;
  const parts = path.split('.');
  const inst = SC.install;
  if(parts.length===2) inst[parts[0]][parts[1]] = val; else inst[parts[0]] = val;
  SC.install = normalizeInstall(inst);
  scheduleSave();
  renderNorms();
}

function _installForm(){
  const i = normalizeInstall(SC.install);
  const tri = v => v===true?'true':v===false?'false':'null';
  const t = tri(i.diff30), l = tri(i.lel);
  return _card(_cardTitle('Paramètres de l\'installation') +
    _sel('Protection différentielle 30 mA', "setInstall('diff30', this.value)", [
      ['null','Non renseigné',t==='null'],['true','Oui',t==='true'],['false','Non',t==='false']]) +
    `<div style="font-size:.66rem;color:var(--mid);margin:4px 0 6px">Éléments conducteurs dans la pièce</div>` +
    _chk('Canalisations métalliques (eau, chauffage, évacuation)','canalisations',i.conducteurs.canalisations) +
    _chk('Huisseries / menuiseries métalliques','huisseries',i.conducteurs.huisseries) +
    _chk('Baignoire ou receveur métallique','bacMetal',i.conducteurs.bacMetal) +
    `<div style="height:6px"></div>` +
    _sel('Liaison équipotentielle locale (LEL)', "setInstall('lel', this.value)", [
      ['null','Non renseignée',l==='null'],['true','Réalisée',l==='true'],['false','Non réalisée',l==='false']]) +
    (i.lel===true ? _sel('Conducteur protégé mécaniquement', "setInstall('lelProtegee', this.value)", [
        ['true','Oui (sous conduit / encastré)',i.lelProtegee],['false','Non (apparent)',!i.lelProtegee]]) +
      _sel('Section du conducteur LEL', "setInstall('lelSection', this.value)",
        [1.5,2.5,4,6,10].map(s=>[s,s+' mm²',s===i.lelSection])) : ''));
}

function _finding(f){
  const s = LVL[f.level];
  return `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--bor2);font-size:.72rem">
    <span>${s.ico}</span>
    <div style="flex:1"><div style="font-weight:700;color:var(--txt)">${f.title}</div>
    <div style="color:var(--txt2);line-height:1.5">${f.detail}</div></div></div>`;
}

function renderNorms(){
  const host = document.getElementById('normContent');
  const scroll = host.scrollTop;
  const v = calcVols();
  const ev = evaluateProject();
  const sc = ev.score, te = ev.errs, tw = ev.warns;

  let cards='';
  for(const {el, errs, warns, cat:c, kind} of ev.items){
    const st=errs.length?'er':warns.length?'wn':'ok';
    const zone = kind==='meuble' ? meubleZone(el) : el.zone;
    const zL=zone==='hors'?'Hors zone':'Zone '+zone;
    const hTxt = kind==='meuble' ? `z ${el.z.toFixed(2)}m` : `${el.h.toFixed(2)}m`;
    const col={er:'#ef4444',wn:'#f59e0b',ok:'#22c55e'}[st];
    cards += `
      <div style="background:var(--sur);border-radius:10px;border:1px solid var(--bor);overflow:hidden;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--bor2)">
          <span style="font-size:1.2rem">${c.ico}</span>
          <span style="font-weight:700;font-size:.82rem;flex:1">${c.label}</span>
          <span style="font-size:.6rem;font-weight:700;padding:3px 8px;border-radius:8px;background:${col}22;color:${col}">
            ${st==='ok'?'CONFORME':st==='wn'?'VÉRIFIER':'ERREUR'}
          </span>
        </div>
        <div style="padding:8px 12px;font-size:.7rem;line-height:1.9;color:var(--txt2)">
          ${zL} · ${hTxt} · ${el.ip} · Cl.${el.cl}
        </div>
        ${[...errs.map(m=>`<div style="padding:0 12px 4px;color:#ef4444;font-size:.7rem">❌ ${m}</div>`),
           ...warns.map(m=>`<div style="padding:0 12px 4px;color:#f59e0b;font-size:.7rem">⚠️ ${m}</div>`)].join('')}
      </div>`;
  }
  const scCol = sc>=80?'#22c55e':sc>=50?'#f59e0b':'#ef4444';

  const circuits = ev.circuits.length
    ? ev.circuits.map(c=>`
      <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--bor2);font-size:.72rem;align-items:baseline">
        <span style="flex:1;font-weight:700">${c.label} <span style="color:var(--mid);font-weight:400">× ${c.count}</span></span>
        <span style="font-family:ui-monospace,monospace;color:var(--txt2)">${c.spec}</span>
      </div>
      ${c.note?`<div style="font-size:.66rem;color:${c.status==='warn'?'#f59e0b':'var(--mid)'};padding:2px 0 4px">${c.status==='warn'?'⚠️ ':''}${c.note}</div>`:''}`).join('')
    : '<div style="font-size:.72rem;color:var(--mid)">Aucun circuit à dimensionner</div>';

  host.innerHTML=`
    <div style="background:var(--sur);border-radius:12px;border:1px solid var(--bor);padding:16px;text-align:center;margin-bottom:12px">
      <div style="font-size:3rem;font-weight:800;color:${scCol};line-height:1">${sc}<span style="font-size:1.5rem">%</span></div>
      <div style="font-size:.78rem;color:var(--mid);margin-top:4px">
        ${sc>=80?'✅ Conforme NF C 15-100':sc>=50?'⚠️ Corrections à apporter':'❌ Erreurs graves'}
      </div>
      <div style="display:flex;justify-content:center;gap:6px;margin-top:10px">
        ${te?`<span style="padding:3px 10px;border-radius:14px;font-size:.65rem;font-weight:700;background:#ef444420;color:#ef4444">${te} err.</span>`:''}
        ${tw?`<span style="padding:3px 10px;border-radius:14px;font-size:.65rem;font-weight:700;background:#f59e0b20;color:#f59e0b">${tw} alerte${tw>1?'s':''}</span>`:''}
        ${!te&&!tw?'<span style="padding:3px 10px;border-radius:14px;font-size:.65rem;font-weight:700;background:#22c55e20;color:#22c55e">Aucun problème</span>':''}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="nav-btn prev" onclick="exportReport()">📄 Rapport</button>
        <button class="nav-btn prev" onclick="exportProject()">💾 Exporter</button>
      </div>
    </div>
    ${_card(_cardTitle('Installation') + ev.install.map(_finding).join(''))}
    ${_installForm()}
    ${_card(_cardTitle('Circuits (indicatif)') + circuits)}
    ${_card(_cardTitle('Volumes NF C 15-100') + `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        ${[
          ['Pièce', '#7d8aa3', v.roomVol],
          ['Zone 0', '#ef4444', v.z0],
          ['Zone 1 H≤2,25m', '#f59e0b', v.z1],
          ['Zone 2 H≤2,25m', '#3b82f6', v.z2],
          ['Hors zone', '#22c55e', v.hors],
        ].map(([k,col,val])=>`
          <div style="background:${col}15;border-radius:8px;padding:8px 10px">
            <div style="font-size:.6rem;color:${col};margin-bottom:2px">${k}</div>
            <div style="font-family:ui-monospace,monospace;font-weight:700;font-size:.82rem">${val.toFixed(2)} m³</div>
          </div>`).join('')}
      </div>`)}
    ${SC.electrique.length?cards:'<div style="text-align:center;padding:20px;color:var(--mid);font-size:.8rem">Aucun appareil électrique placé</div>'}
    <div style="font-size:.62rem;color:var(--mid);line-height:1.5;text-align:center;padding:4px 8px">Aide à la conception, indicative. Ne remplace pas le contrôle d'un électricien qualifié ni le texte de la norme NF C 15-100.</div>
    <div style="height:20px"></div>`;
  host.scrollTop = scroll;
}
