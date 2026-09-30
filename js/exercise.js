'use strict';

// ════════════════════════════════════════════════════════════════
//  EXERCICES DE CONTRÔLE (formateur → apprentis)
//  Formateur : construit la pièce, ajuste la correction, publie un lien / QR / fichier.
//  Apprenti  : ouvre l'exercice (lecture seule, verdicts masqués), remplit un rapport,
//              puis compare avec la correction.
//  Le lien contient toute la scène : aucun serveur. La correction se recalcule côté
//  apprenti avec le même moteur de règles (les ajustements du formateur sont dans le lien).
// ════════════════════════════════════════════════════════════════
const MOTIFS = {
  zone:'Volume interdit', dist:"Trop près de l'eau", haut:'Hauteur', ip:'Indice IP', cl:"Classe d'isolation",
};
function motifOf(msg){
  if(/^(Zone|Volume) /.test(msg)) return 'zone';
  if(/près de l'eau/.test(msg)) return 'dist';
  if(/^H /.test(msg)) return 'haut';
  if(/^IP/.test(msg)) return 'ip';
  if(/^Classe/.test(msg)) return 'cl';
  return null;
}

function defaultExercise(){
  return {title:'', consigne:'', showZones:false, overrides:{}};
}
function normalizeExercise(e){
  e = (e && typeof e==='object') ? e : {};
  const ov = {};
  if(e.overrides && typeof e.overrides==='object'){
    for(const [k,v] of Object.entries(e.overrides)){
      if(!v || typeof v!=='object') continue;
      const o = {};
      if(v.s==='c'||v.s==='nc') o.s=v.s;
      if(typeof v.note==='string' && v.note) o.note=v.note.slice(0,300);
      if(o.s||o.note) ov[String(k).slice(0,40)] = o;
    }
  }
  return {
    title: typeof e.title==='string' ? e.title.slice(0,80) : '',
    consigne: typeof e.consigne==='string' ? e.consigne.slice(0,600) : '',
    showZones: e.showZones===true,
    overrides: ov,
  };
}

// ── Éléments à contrôler, avec leur correction automatique ──
function exoItems(){
  const ev = evaluateProject();
  const inst = normalizeInstall(SC.install);
  const yn = v=>v===true?'Oui':v===false?'Non':'Non précisé';
  const items = [];
  let n = 0;
  for(const it of ev.items){
    n++;
    const el = it.el;
    const facts = it.kind==='el'
      ? [`Hauteur ${el.h.toFixed(2)} m`, el.ip, `Classe ${el.cl}`]
      : [`Bas à ${el.z.toFixed(2)} m`, `Haut. ${el.hgt.toFixed(2)} m`, el.ip, `Classe ${el.cl}`];
    items.push({
      key:(it.kind==='el'?'el:':'meu:')+el.id, num:n, kind:it.kind, title:it.cat.label, ico:it.cat.ico,
      facts, motifs:true,
      auto:{s:it.errs.length?'nc':'c', reasons:it.errs, motifs:[...new Set(it.errs.map(motifOf).filter(Boolean))]},
    });
  }
  const conduc = [inst.conducteurs.canalisations&&'canalisations métalliques', inst.conducteurs.huisseries&&'huisseries métalliques', inst.conducteurs.bacMetal&&'bac métallique'].filter(Boolean);
  for(const f of ev.install){
    if(f.id==='vol') continue;
    let facts=[], q=f.title;
    if(f.id==='ddr') facts=[`DDR 30 mA : ${yn(inst.diff30)}`];
    if(f.id==='lel'){
      facts=[`Éléments conducteurs : ${conduc.length?conduc.join(', '):'aucun'}`, `LEL réalisée : ${yn(inst.lel)}`];
      if(inst.lel===true) facts.push(`${inst.lelSection} mm², ${inst.lelProtegee?'protégée':'apparente'}`);
    }
    if(f.id.startsWith('min_')) q = f.title+' : minimum respecté ?';
    items.push({
      key:'inst:'+f.id, kind:'inst', title:q, ico:'📋', facts, motifs:false,
      auto:{s:f.level==='err'?'nc':'c', reasons:f.level==='ok'?[]:[f.detail], detail:f.detail, motifs:[]},
    });
  }
  return items;
}

// Correction finale = automatique + ajustements du formateur
function exoCorrection(items, overrides){
  const out = {};
  for(const it of items){
    const o = (overrides||{})[it.key] || {};
    out[it.key] = {
      s: o.s || it.auto.s,
      motifs: (o.s && o.s!==it.auto.s) ? [] : it.auto.motifs,
      reasons: it.auto.reasons,
      detail: it.auto.detail || '',
      note: o.note || '',
      changed: !!(o.s && o.s!==it.auto.s),
    };
  }
  return out;
}

// Notation : statut juste = 1 pt (2 si « conforme »), motifs exacts = +1 pt pour une non-conformité
function exoScore(items, corr, answers){
  let pts=0, max=0; const detail={};
  for(const it of items){
    const c=corr[it.key], a=answers[it.key]||{};
    const m = c.s==='nc' ? (it.motifs && c.motifs.length ? 2 : 1) : 2;
    let p=0, okS = a.s===c.s, okM=true;
    if(okS){
      if(c.s==='c') p=2;
      else {
        p=1;
        if(it.motifs && c.motifs.length){
          const mine=[...(a.m||[])].sort().join(), good=[...c.motifs].sort().join();
          okM = mine===good;
          if(okM) p=2;
        }
      }
    }
    max+=m; pts+=p; detail[it.key]={p,max:m,okS,okM};
  }
  return {pts,max,pct:max?Math.round(pts/max*100):0,detail};
}

// ════════════════════════════════
//  Codec lien : JSON → (deflate) → base64url
// ════════════════════════════════
function _b64u(bytes){
  let s=''; for(let i=0;i<bytes.length;i+=0x8000) s+=String.fromCharCode.apply(null, bytes.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function _unb64u(str){
  const s=atob(str.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((str.length+3)%4));
  const b=new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i); return b;
}
async function _pipe(bytes, stream){
  const w=stream.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function exoPayload(){
  const ex = normalizeExercise(SC.exercise);
  const round = (k,v)=> typeof v==='number' ? Math.round(v*1000)/1000 : v;
  const scene = JSON.parse(JSON.stringify(SC, (k,v)=> (k==='exercise'||k==='zone'||k==='distCm') ? undefined : round(k,v)));
  return {v:1, t:ex.title, c:ex.consigne, z:ex.showZones?1:0, s:scene, o:ex.overrides};
}

async function encodeExercise(payload){
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if(typeof CompressionStream!=='undefined')
    return 'z'+_b64u(await _pipe(raw, new CompressionStream('deflate-raw')));
  return 'p'+_b64u(raw);
}
async function decodeExercise(code){
  let bytes=_unb64u(code.slice(1));
  if(code[0]==='z'){
    if(typeof DecompressionStream==='undefined') throw new Error('Navigateur trop ancien pour ouvrir ce lien');
    bytes = await _pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if(code[0]!=='p') throw new Error('Lien invalide');
  const p = JSON.parse(new TextDecoder().decode(bytes));
  if(!p || p.v!==1 || !p.s) throw new Error('Exercice invalide');
  p.s = sanitizeScene(p.s);
  p.t = typeof p.t==='string' ? p.t.slice(0,80) : '';
  p.c = typeof p.c==='string' ? p.c.slice(0,600) : '';
  p.o = normalizeExercise({overrides:p.o}).overrides;
  return p;
}
function exoHash(code){ let h=5381; for(let i=0;i<code.length;i++) h=((h*33)^code.charCodeAt(i))>>>0; return h.toString(36); }
function exoBaseUrl(){ return location.href.split('#')[0]; }

// ════════════════════════════════
//  FORMATEUR : écran « Exercice »
// ════════════════════════════════
const _inp = 'width:100%;background:var(--bor2);color:var(--txt);border:1px solid var(--bor);border-radius:8px;padding:9px 10px;font-size:.78rem;font-family:inherit';

function setExoField(k, v){
  SC.exercise = normalizeExercise({...SC.exercise, [k]:v});
  scheduleSave();
}
function flipCorr(key){
  const items=exoItems(); const it=items.find(i=>i.key===key); if(!it) return;
  const ov={...SC.exercise.overrides}; const cur=(ov[key]&&ov[key].s)||it.auto.s;
  const next=cur==='c'?'nc':'c';
  ov[key]={...(ov[key]||{}), s:next===it.auto.s?undefined:next};
  SC.exercise = normalizeExercise({...SC.exercise, overrides:ov});
  scheduleSave(); renderExoBuilder();
}
function setCorrNote(key, v){
  const ov={...SC.exercise.overrides};
  ov[key]={...(ov[key]||{}), note:v};
  SC.exercise = normalizeExercise({...SC.exercise, overrides:ov});
  scheduleSave();
}

function renderExoBuilder(){
  const host=document.getElementById('exoBuildContent');
  const scroll=host.scrollTop;
  const ex=normalizeExercise(SC.exercise); SC.exercise=ex;
  const items=exoItems(), corr=exoCorrection(items, ex.overrides);
  const inst=normalizeInstall(SC.install);
  const unset = inst.diff30===null || inst.lel===null;
  const rows = items.map(it=>{
    const c=corr[it.key], nc=c.s==='nc';
    const why = c.changed ? '<i>(modifié par vous)</i>' : (it.auto.reasons.join(' · ') || 'Conforme');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--bor2)">
      <div style="display:flex;gap:8px;align-items:center">
        <span>${it.ico}</span>
        <span style="flex:1;font-size:.74rem;font-weight:700">${it.num?`<span style="color:var(--mid)">n°${it.num}</span> `:''}${it.title}</span>
        <button onclick="flipCorr('${it.key}')" style="border:none;border-radius:8px;padding:5px 9px;font-size:.66rem;font-weight:700;cursor:pointer;color:#fff;background:${nc?'#ef4444':'#22c55e'}">${nc?'NON CONFORME':'CONFORME'} ⇄</button>
      </div>
      <div style="font-size:.66rem;color:var(--mid);margin:3px 0 5px 26px">${why}</div>
      <input value="${_esc(c.note)}" placeholder="Commentaire pour la correction (facultatif)" onchange="setCorrNote('${it.key}', this.value)" style="${_inp};margin-left:26px;width:calc(100% - 26px)">
    </div>`;
  }).join('');

  host.innerHTML = `
    ${_card(_cardTitle('Exercice') +
      `<input id="exTitle" value="${_esc(ex.title)}" maxlength="80" placeholder="Titre (ex. Salle d'eau n°3)" onchange="setExoField('title',this.value)" style="${_inp};margin-bottom:8px">
       <textarea id="exConsigne" rows="3" maxlength="600" placeholder="Consigne pour les apprentis" onchange="setExoField('consigne',this.value)" style="${_inp};resize:vertical;margin-bottom:8px">${_esc(ex.consigne)}</textarea>
       <label style="display:flex;gap:8px;align-items:center;font-size:.72rem;color:var(--txt2)"><input type="checkbox" ${ex.showZones?'checked':''} onchange="setExoField('showZones',this.checked);renderExoBuilder()" style="accent-color:var(--ac);width:16px;height:16px">Afficher les volumes 0/1/2 aux apprentis (aide)</label>`)}
    ${unset?_card('<div style="font-size:.72rem;color:#f59e0b">⚠️ DDR 30 mA ou LEL non renseignés : renseignez-les à l\'étape Vérification, sinon ils seront considérés conformes dans la correction.</div>'):''}
    ${_card(_cardTitle(`Correction (${items.length} points de contrôle)`) + (rows||'<div style="font-size:.72rem;color:var(--mid)">Aucun appareil à contrôler</div>'))}
    ${_card(_cardTitle('Publier') +
      `<div style="display:flex;gap:8px;margin-bottom:8px">
         <button class="nav-btn next" onclick="publishExercise()">🔗 Lien + QR</button>
         <button class="nav-btn prev" onclick="exportExerciseFile()">💾 Fichier</button>
       </div><div id="exoPublish"></div>`)}
    <div style="height:20px"></div>`;
  host.scrollTop=scroll;
}

async function publishExercise(){
  const box=document.getElementById('exoPublish');
  box.innerHTML='<div style="font-size:.72rem;color:var(--mid)">Génération…</div>';
  try{
    const code=await encodeExercise(exoPayload());
    const url=exoBaseUrl()+'#ex='+code;
    let qr='';
    try{
      const q=qrcode(0,'L'); q.addData(url); q.make();
      qr=`<div style="background:#fff;padding:10px;border-radius:10px;display:inline-block;margin:8px 0;width:min(100%,280px)">${q.createSvgTag({cellSize:4,margin:0,scalable:true})}</div>`;
    }catch(e){
      qr='<div style="font-size:.7rem;color:#f59e0b;margin:6px 0">QR impossible (exercice trop volumineux) : utilisez le lien ou le fichier.</div>';
    }
    box.innerHTML=`${qr}
      <div style="font-size:.66rem;color:var(--mid);margin-bottom:6px">${url.length} caractères${location.protocol==='file:'?' · ⚠️ ouvert en fichier local : le lien ne fonctionnera que s\'il est hébergé (ex. GitHub Pages)':''}</div>
      <textarea readonly rows="3" style="${_inp};font-size:.6rem" onclick="this.select()">${_esc(url)}</textarea>
      <button class="nav-btn prev" style="margin-top:8px;width:100%" onclick="copyText(document.querySelector('#exoPublish textarea').value)">📋 Copier le lien</button>`;
  }catch(e){
    box.innerHTML=`<div style="font-size:.72rem;color:#ef4444">Erreur : ${_esc(e.message)}</div>`;
  }
}
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); toast('Lien copié'); }
  catch(e){ toast('Copie impossible : sélectionnez le texte'); }
}
function exportExerciseFile(){
  const blob=new Blob([JSON.stringify({app:'arpeda', kind:'exercise', ex:exoPayload()})], {type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  const t=(normalizeExercise(SC.exercise).title||'exercice').replace(/[^\w-]+/g,'_').slice(0,40);
  a.download=`arpeda-${t}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Exercice exporté');
}

// ════════════════════════════════
//  APPRENTI
// ════════════════════════════════
const _exoKey = ()=> 'arpeda.exo.'+EXO.id;
function _exoSave(){
  try{ localStorage.setItem(_exoKey(), JSON.stringify({name:EXO.name, answers:EXO.answers, submitted:EXO.submitted})); }catch(e){}
}

async function openExerciseFromCode(code){
  try{
    const p=await decodeExercise(code);
    startExercise(p, exoHash(code));
  }catch(e){ toast('Exercice illisible : '+e.message); }
}

function startExercise(p, id){
  EXO.active=true; EXO.data=p; EXO.id=id; EXO.answers={}; EXO.name=''; EXO.submitted=false; EXO.revealed=false;
  try{
    const saved=JSON.parse(localStorage.getItem(_exoKey())||'null');
    if(saved){ EXO.answers=saved.answers||{}; EXO.name=saved.name||''; EXO.submitted=!!saved.submitted; EXO.revealed=EXO.submitted; }
  }catch(e){}
  applyScene(p.s);
  SC.exercise = normalizeExercise({title:p.t, consigne:p.c, showZones:p.z===1, overrides:p.o});
  document.body.classList.add('exo');
  enterApp();
  document.getElementById('hintEl').textContent='Touchez un appareil pour connaître son numéro';
  goStep(7);
}

// Quitter le mode exercice : recharge la page (retrouve le projet du formateur)
function exitExercise(){
  history.replaceState(null,'',location.pathname+location.search);
  location.reload();
}

function setAnswer(key,s){
  const a=EXO.answers[key]=EXO.answers[key]||{}; a.s=s; if(s==='c') a.m=[];
  _exoSave(); renderExoReport();
}
function toggleMotif(key,m){
  const a=EXO.answers[key]=EXO.answers[key]||{}; a.m=a.m||[];
  const i=a.m.indexOf(m); if(i>=0) a.m.splice(i,1); else a.m.push(m);
  _exoSave(); renderExoReport();
}
function setAnsNote(key,v){ (EXO.answers[key]=EXO.answers[key]||{}).note=v.slice(0,300); _exoSave(); }
function setExoName(v){ EXO.name=v.slice(0,60); _exoSave(); }

async function submitReport(){
  const items=exoItems();
  const missing=items.filter(i=>!(EXO.answers[i.key]&&EXO.answers[i.key].s)).length;
  const msg = missing ? `${missing} point(s) sans réponse. Valider quand même et afficher la correction ?` : 'Valider le rapport et afficher la correction ? Vous ne pourrez plus le modifier.';
  if(!await askConfirm(msg)) return;
  EXO.submitted=true; EXO.revealed=true; _exoSave();
  redraw('el'); renderExoReport();
  toast('Correction affichée : les volumes sont maintenant visibles');
}

function renderExoReport(){
  const host=document.getElementById('exoReportContent');
  const scroll=host.scrollTop;
  const p=EXO.data;
  const items=exoItems(), corr=exoCorrection(items, p.o);
  const res=exoScore(items, corr, EXO.answers);
  const done=EXO.submitted;
  const cards=items.map(it=>{
    const a=EXO.answers[it.key]||{}, c=corr[it.key], r=res.detail[it.key];
    const btn=(s,lbl,col)=>`<button ${done?'disabled':''} onclick="setAnswer('${it.key}','${s}')" style="flex:1;padding:9px;border-radius:9px;font-weight:700;font-size:.72rem;cursor:pointer;border:1.5px solid ${a.s===s?col:'var(--bor)'};background:${a.s===s?col+'33':'var(--bor2)'};color:${a.s===s?col:'var(--txt2)'}">${lbl}</button>`;
    const motifs = (a.s==='nc' && it.motifs) ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">${Object.entries(MOTIFS).map(([m,l])=>{
        const on=(a.m||[]).includes(m);
        return `<button ${done?'disabled':''} onclick="toggleMotif('${it.key}','${m}')" style="padding:5px 9px;border-radius:14px;font-size:.66rem;font-weight:600;cursor:pointer;border:1px solid ${on?'#ef4444':'var(--bor)'};background:${on?'#ef444426':'transparent'};color:${on?'#ef4444':'var(--txt2)'}">${l}</button>`;}).join('')}</div>` : '';
    let verdict='';
    if(done){
      const good = r.okS && r.okM;
      const mot = c.s==='nc' && c.motifs.length ? `<div>Motifs : ${c.motifs.map(m=>MOTIFS[m]).join(', ')}</div>` : '';
      const why = c.reasons.length ? `<div>${c.reasons.map(_esc).join(' · ')}</div>` : (c.s==='c'&&it.kind==='inst'&&c.detail?`<div>${_esc(c.detail)}</div>`:'');
      verdict=`<div style="margin-top:8px;padding:8px 10px;border-radius:8px;font-size:.68rem;line-height:1.5;background:${good?'#22c55e1a':'#ef44441a'};color:var(--txt2)">
        <b style="color:${good?'#22c55e':'#ef4444'}">${good?'✅':'❌'} ${r.p}/${r.max} pt</b> · Correction : <b>${c.s==='nc'?'NON CONFORME':'CONFORME'}</b>${mot}${why}${c.note?`<div style="color:#93c5fd">💬 ${_esc(c.note)}</div>`:''}</div>`;
    }
    return _card(`<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px"><span style="font-size:1.2rem">${it.ico}</span>
      <span style="flex:1;font-weight:700;font-size:.8rem">${it.num?`<span style="color:#60a5fa">n°${it.num}</span> `:''}${it.title}</span></div>
      ${it.facts.length?`<div style="font-size:.68rem;color:var(--mid);margin-bottom:8px">${it.facts.join(' · ')}</div>`:''}
      <div style="display:flex;gap:6px">${btn('c','Conforme','#22c55e')}${btn('nc','Non conforme','#ef4444')}</div>
      ${motifs}
      <input ${done?'disabled':''} value="${_esc(a.note||'')}" placeholder="Remarque (facultatif)" onchange="setAnsNote('${it.key}',this.value)" style="${_inp};margin-top:8px">
      ${verdict}`);
  }).join('');
  const answered=items.filter(i=>EXO.answers[i.key]&&EXO.answers[i.key].s).length;
  host.innerHTML=`
    ${_card(`<div style="font-weight:800;font-size:.95rem;margin-bottom:6px">${_esc(p.t||'Exercice de contrôle')}</div>
      <div style="font-size:.74rem;color:var(--txt2);line-height:1.5;white-space:pre-wrap">${_esc(p.c||'Contrôlez l\'installation électrique de cette salle d\'eau selon la NF C 15-100 : observez le plan, la vue 3D et la réalité augmentée, puis remplissez le rapport.')}</div>
      <input ${done?'disabled':''} value="${_esc(EXO.name)}" placeholder="Votre nom" onchange="setExoName(this.value)" style="${_inp};margin-top:10px">`)}
    ${done?_card(`<div style="text-align:center"><div style="font-size:2.6rem;font-weight:800;color:${res.pct>=80?'#22c55e':res.pct>=50?'#f59e0b':'#ef4444'};line-height:1">${res.pct}<span style="font-size:1.3rem">%</span></div>
      <div style="font-size:.74rem;color:var(--mid);margin-top:4px">${res.pts} / ${res.max} points</div>
      <button class="nav-btn next" style="margin-top:10px;width:100%" onclick="exportMyReport()">📄 Télécharger mon rapport</button></div>`):''}
    ${cards}
    ${done?'':`<button class="nav-btn action" style="width:100%;margin:4px 0 16px" onclick="submitReport()">Valider mon rapport (${answered}/${items.length})</button>`}
    <div style="height:12px"></div>`;
  host.scrollTop=scroll;
}

// Rapport de l'apprenti (fichier HTML à remettre au formateur)
function exportMyReport(){
  const p=EXO.data, items=exoItems(), corr=exoCorrection(items,p.o), res=exoScore(items,corr,EXO.answers);
  const L={c:'Conforme', nc:'Non conforme'};
  const rows=items.map(it=>{
    const a=EXO.answers[it.key]||{}, c=corr[it.key], r=res.detail[it.key];
    return `<tr><td>${it.num||''}</td><td>${_esc(it.title)}</td><td>${L[a.s]||'—'}${a.m&&a.m.length?'<br><small>'+a.m.map(m=>MOTIFS[m]).join(', ')+'</small>':''}${a.note?'<br><small>'+_esc(a.note)+'</small>':''}</td>
      <td>${L[c.s]}${c.motifs.length?'<br><small>'+c.motifs.map(m=>MOTIFS[m]).join(', ')+'</small>':''}${c.note?'<br><small>'+_esc(c.note)+'</small>':''}</td><td style="color:${r.p===r.max?'#16a34a':'#dc2626'};font-weight:700">${r.p}/${r.max}</td></tr>`;
  }).join('');
  const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport — ${_esc(EXO.name||'apprenti')}</title>
<style>body{font-family:-apple-system,'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#0f172a}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:14px}th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:11px;text-transform:uppercase}.mut{color:#64748b;font-size:12px}</style></head><body>
<h1>${_esc(p.t||'Exercice de contrôle')}</h1>
<div class="mut">${_esc(EXO.name||'(nom non renseigné)')} · ${new Date().toLocaleString('fr-FR')} · Arpeda v${APP_VERSION}</div>
<p style="font-size:26px;font-weight:800;margin:14px 0 0">${res.pct}% <span style="font-size:14px;font-weight:400" class="mut">${res.pts} / ${res.max} points</span></p>
<table><thead><tr><th>#</th><th>Point de contrôle</th><th>Ma réponse</th><th>Correction</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  a.download=`rapport-${(EXO.name||'apprenti').replace(/[^\w-]+/g,'_').slice(0,30)}.html`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// Numéro d'un appareil (identique dans le plan et le rapport)
function exoNum(el){
  const list=[...SC.electrique, ...SC.meubles.filter(m=>CAT_MEUBLE[m.type].elec)];
  const i=list.indexOf(el);
  return i<0 ? 0 : i+1;
}
function drawNumBadge(ctx, x, y, n){
  if(!EXO.active || !n) return;
  ctx.save();
  ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fillStyle='#1d4ed8'; ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='bold 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(String(n), x, y+0.5);
  ctx.restore();
}

// Tap sur le plan en mode exercice : identifie l'appareil (sans rien modifier)
function exoTap(p){
  const cands=[...SC.electrique, ...SC.meubles.filter(m=>CAT_MEUBLE[m.type].elec)];
  let best=null, bd=0.30;
  for(const e of cands){ const d=Math.hypot(e.x-p.x,e.y-p.y); if(d<bd){ bd=d; best=e; } }
  if(best){
    const cat = CAT_EL[best.type] || CAT_MEUBLE[best.type];
    toast(`n°${exoNum(best)} — ${cat.label}`);
  }
}
