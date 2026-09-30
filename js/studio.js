'use strict';

// ════════════════════════════════════════════════════════════════
//  ÉDITEUR PC (studio) — coque : outils, catalogue, onglets, panneaux
//  Le moteur du plan (souris, accrochage, rendu) est dans studio-canvas.js.
//  Les panneaux de propriétés existants (mur, ouverture, sanitaire, appareil) sont déplacés
//  dans le panneau de droite : leurs fonctions restent inchangées.
// ════════════════════════════════════════════════════════════════
const ST_TOOLS = [
  {id:'select', ico:'🖱️', key:'V', label:'Sélection / déplacement'},
  {id:'wall',   ico:'🧱', key:'W', label:'Mur ou cloison (clic = point, chiffres = longueur)'},
  {id:'rect',   ico:'⬜', key:'R', label:'Pièce rectangulaire (2 clics ou « 320x240 »)'},
  {id:'door',   ico:'🚪', key:'D', label:'Porte'},
  {id:'window', ico:'🪟', key:'F', label:'Fenêtre'},
  {id:'measure',ico:'📏', key:'M', label:'Mesurer'},
  {id:'arref',  ico:'📍', key:'A', label:'Repère RA : point A et direction (B à 1 m)'},
  {id:'pan',    ico:'✋', key:'H', label:'Déplacer la vue (ou Espace + glisser)'},
];

// Catalogue : [kind, type, icône, libellé, options]
function studioCatalog(){
  const san = Object.entries(CAT_SAN).map(([t,c])=>['san',t,c.ico,c.label]);
  const meu = Object.entries(CAT_MEUBLE).map(([t,c])=>['meu',t,c.ico,c.label]);
  const el  = Object.entries(CAT_EL).map(([t,c])=>['el',t,c.ico,c.label]);
  const ops = [
    ['op','door',  '🚪','Porte 0,80',{w:0.80}],
    ['op','door',  '🚪','Porte 0,90',{w:0.90}],
    ['op','wide',  '🚪','Double 1,40',{w:1.40}],
    ['op','window','🪟','Fenêtre 1,00',{w:1.00}],
    ['op','window','🪟','Fenêtre 1,40',{w:1.40}],
  ];
  return [['Ouvertures',ops],['Sanitaires',san],['Meubles et appareils',meu],['Électricité',el]];
}

function buildTools(){
  const host=document.getElementById('stTools');
  host.innerHTML = ST_TOOLS.map((t,i)=>`${i===1||i===5?'<div class="st-tool-sep"></div>':''}
    <button class="st-tool${t.id===ST.tool?' on':''}" data-tool="${t.id}" title="${t.label} — ${t.key}" onclick="setStudioTool('${t.id}')">${t.ico}<kbd>${t.key}</kbd></button>`).join('');
}

function buildCatalog(){
  const host=document.getElementById('stCatalog');
  host.innerHTML = studioCatalog().map(([title,items])=>`
    <h4>${title}</h4>
    <div class="st-cat-grid">${items.map((it,i)=>`
      <div class="st-item" draggable="true" data-kind="${it[0]}" data-type="${it[1]}" data-w="${(it[4]&&it[4].w)||''}" title="${it[3]}"
        onclick="studioPickItem(this)" ondragstart="studioDragStart(event,this)">
        <span class="i">${it[2]}</span>${it[3]}</div>`).join('')}
    </div>`).join('');
}

function studioPickItem(el){
  const kind=el.dataset.kind, type=el.dataset.type, w=el.dataset.w?+el.dataset.w:null;
  setStudioTool('place', {kind, type, w});
  document.querySelectorAll('.st-item').forEach(e=>e.classList.toggle('on', e===el));
}
function studioDragStart(ev, el){
  ev.dataTransfer.setData('text/plain', JSON.stringify({kind:el.dataset.kind, type:el.dataset.type, w:el.dataset.w?+el.dataset.w:null}));
  ev.dataTransfer.effectAllowed='copy';
}

function setStudioTool(id, place){
  ST.tool=id; ST.place=place||null;
  ST.poly=[]; ST.rectA=null; ST.typed=''; ST.arA=null; ST.drag=null;
  if(id!=='measure') ST.measure=null;
  document.querySelectorAll('.st-tool').forEach(b=>b.classList.toggle('on', b.dataset.tool===id));
  if(id!=='place') document.querySelectorAll('.st-item').forEach(e=>e.classList.remove('on'));
  const w=document.getElementById('wStudio');
  w.classList.toggle('tool-draw', id!=='select' && id!=='pan');
  w.classList.toggle('pan', id==='pan');
  stUpdateHint();
  redraw('studio');
}

// ── Onglets ──
function studioTab(t){
  STUDIO.tab=t;
  curStep = t==='3d' ? 4 : t==='verif' ? 5 : t==='exo' ? 6 : 3;   // la boucle 3D ne tourne que sur curStep 4
  document.querySelectorAll('.st-tabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===t));
  const map={plan:'stPlan','3d':'st3D',verif:'stVerif',exo:'stExo'};
  for(const [k,id] of Object.entries(map)) document.getElementById(id).classList.toggle('on', k===t);
  const chrome = t==='plan';
  document.getElementById('stTools').style.display = chrome ? '' : 'none';
  document.getElementById('stCatalog').style.display = chrome ? '' : 'none';
  document.getElementById('stProps').style.display = chrome ? '' : 'none';
  setTimeout(()=>{
    if(t==='plan'){ initCanvas('studio'); }
    if(t==='3d') init3D();
    if(t==='verif') renderNorms();
    if(t==='exo') renderExoBuilder();
  }, 30);
}
function studioGoStep(n){ studioTab(n<=3?'plan':n===4?'3d':n===5?'verif':'exo'); }

// ── Entrée / sortie ──
function _adopt(id, hostId){
  const e=document.getElementById(id), h=document.getElementById(hostId);
  if(e&&h){ e.classList.remove('off'); h.appendChild(e); }
}
function enterStudio(){
  STUDIO.active=true;
  document.body.classList.add('studio');
  document.getElementById('home').style.display='none';
  const host=document.getElementById('stPropsHost');
  for(const id of ['psWall','psOp','psSan','psEl']){ const e=document.getElementById(id); if(e) host.appendChild(e); }
  _adopt('s4','st3D'); _adopt('s5','stVerif'); _adopt('s6','stExo');
  document.getElementById('stName').value=SC.name||'';
  buildTools(); buildCatalog();
  setupStudioKeys();
  histInit();
  studioTab('plan');
  requestAnimationFrame(()=>{ VIEWS.studio.init=false; initCanvas('studio'); studioPanelRefresh(); });
  if(!ST.resizeOn){ ST.resizeOn=true; window.addEventListener('resize', ()=>{ if(STUDIO.active && STUDIO.tab==='plan') initCanvas('studio'); }); }
}
function studioExit(){
  saveNow();
  location.reload();
}

// ── Panneau de droite ──
function studioClosePanels(){
  for(const id of ['psWall','psOp','psSan','psEl']){ const e=document.getElementById(id); if(e) e.classList.remove('open'); }
}
function studioPanelRefresh(){
  const any=['psWall','psOp','psSan','psEl'].some(id=>{ const e=document.getElementById(id); return e&&e.classList.contains('open'); });
  const def=document.getElementById('stPropsDefault');
  def.style.display = any ? 'none' : '';
  if(!any) renderStudioInfo();
}

function renderStudioInfo(){
  const ev=evaluateProject();
  const ref=getArRef();
  const ang=Math.round(Math.atan2(ref.b.y-ref.a.y, ref.b.x-ref.a.x)*180/Math.PI);
  const col = ev.score>=80?'#22c55e':ev.score>=50?'#f59e0b':'#ef4444';
  document.getElementById('stPropsDefault').innerHTML=`<div class="st-info">
    <h3>Projet</h3>
    <div class="pf" style="margin-bottom:8px"><div class="pf-l">Hauteur sous plafond (m)</div>
      <input type="number" value="${SC.roomH.toFixed(2)}" step="0.05" min="2" max="3.5" onchange="setRoomH(Math.min(3.5,Math.max(2,+this.value||2.5)));histCommit();renderStudioInfo()"></div>
    <div class="st-kv"><span>Surface (axes)</span><b>${roomArea().toFixed(2)} m²</b></div>
    <div class="st-kv"><span>Murs</span><b>${SC.walls.length}</b></div>
    <div class="st-kv"><span>Ouvertures</span><b>${SC.openings.length}</b></div>
    <div class="st-kv"><span>Sanitaires / meubles</span><b>${SC.sanitaires.length} / ${SC.meubles.length}</b></div>
    <div class="st-kv"><span>Appareillage</span><b>${SC.electrique.length}</b></div>
    <h3>Conformité NF C 15-100</h3>
    <div class="st-kv"><span>Score</span><b style="color:${col}">${ev.score} %</b></div>
    <div class="st-kv"><span>Erreurs · alertes</span><b>${ev.errs} · ${ev.warns}</b></div>
    <button class="nav-btn prev" style="width:100%;margin-top:8px" onclick="studioTab('verif')">Voir le détail</button>
    <h3>Repère RA</h3>
    <div style="font-size:.68rem;color:var(--mid);line-height:1.5;margin-bottom:6px">Sur le chantier : point A au sol, puis un point à 1 m. Le modèle s'aligne en 1:1.</div>
    <div class="st-kv"><span>Point A</span><b>${ref.a.x.toFixed(2)} ; ${ref.a.y.toFixed(2)}</b></div>
    <div class="st-kv"><span>Direction A→B</span><b>${ang}°</b></div>
    <div class="pf" style="margin:8px 0"><div class="pf-l">Repère physique (aide sur site)</div>
      <input value="${_esc(ref.label)}" maxlength="60" placeholder="ex. angle mur fond / gauche" onchange="stSetArLabel(this.value)"></div>
    <button class="nav-btn prev" style="width:100%" onclick="setStudioTool('arref')">📍 Placer le repère (A)</button>
  </div>`;
}
function stSetArLabel(v){
  const r=getArRef();
  SC.arRef={a:r.a,b:r.b,label:v.slice(0,60)};
  histCommit(); scheduleSave();
}

function studioAfterRestore(){
  studioClosePanels();
  ST.selV=null; ST.selSeg=null;
  document.getElementById('stName').value=SC.name||'';
  redraw('studio'); studioPanelRefresh();
}
function studioFit(){ fitView('studio'); redraw('studio'); }

// ── Envoi vers le téléphone (RA) : lien + QR ──
function arPayload(){
  const scene = JSON.parse(JSON.stringify(SC, (k,v)=> (k==='exercise'||k==='zone'||k==='distCm') ? undefined : (typeof v==='number' ? Math.round(v*1000)/1000 : v)));
  return {v:1, t:SC.name||'', c:'', z:1, s:scene, o:{}, m:'ar'};
}
async function studioShareAR(){
  const dlg=document.getElementById('dlgShare'), body=document.getElementById('shareBody');
  dlg.style.display='flex';
  body.innerHTML='<div style="font-size:.72rem;color:var(--mid)">Génération…</div>';
  try{
    const code=await encodeExercise(arPayload());
    const url=exoBaseUrl()+'#ar='+code;
    let qr='';
    try{
      const q=qrcode(0,'L'); q.addData(url); q.make();
      qr=`<div style="background:#fff;padding:10px;border-radius:10px;width:min(100%,300px);margin:0 auto 8px">${q.createSvgTag({cellSize:4,margin:0,scalable:true})}</div>`;
    }catch(e){ qr='<div style="font-size:.7rem;color:#f59e0b;margin:6px 0">QR impossible (projet trop volumineux) : utilisez « Exporter » et importez le fichier sur le téléphone.</div>'; }
    body.innerHTML=`${qr}
      <div style="font-size:.66rem;color:var(--mid);margin-bottom:6px">${url.length} caractères${location.protocol==='file:'?' · ⚠️ page ouverte en local : le lien ne marchera que si l\'application est hébergée en HTTPS':''}</div>
      <textarea readonly rows="3" style="width:100%;background:var(--bor2);color:var(--txt);border:1px solid var(--bor);border-radius:8px;padding:8px;font-size:.6rem;user-select:text" onclick="this.select()">${_esc(url)}</textarea>
      <button class="nav-btn prev" style="margin-top:8px;width:100%" onclick="copyText(document.querySelector('#shareBody textarea').value)">📋 Copier le lien</button>`;
  }catch(e){ body.innerHTML=`<div style="font-size:.72rem;color:#ef4444">Erreur : ${_esc(e.message)}</div>`; }
}

// PC (grand écran + souris) → éditeur ; sinon assistant mobile. Forçable : ?studio=1 / ?mobile=1
function isDesktop(){
  const q=new URLSearchParams(location.search);
  if(q.has('mobile')) return false;
  if(q.has('studio')) return true;
  return window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
}
function openEditor(){ if(isDesktop()) enterStudio(); else enterApp(); }

// ── Téléphone : ouverture d'un projet reçu (#ar=…) et démarrage de la RA ──
function startViewer(p){
  VIEWER.active=true;
  applyScene(p.s);
  SC.name=p.t||'';
  document.getElementById('homeMain').style.display='none';
  document.getElementById('homeViewer').style.display='flex';
  document.getElementById('viewerTitle').textContent=p.t||'Projet';
  document.getElementById('viewerInfo').textContent=`${SC.walls.length} mur(s) · ${SC.sanitaires.length} sanitaire(s) · ${SC.meubles.length} meuble(s) · ${SC.electrique.length} appareil(s)`;
  document.getElementById('home').style.display='flex';
}
function exitViewer(){
  history.replaceState(null,'',location.pathname+location.search);
  location.reload();
}
async function openViewerFromCode(code){
  try{ startViewer(await decodeExercise(code)); }
  catch(e){ toast('Lien illisible : '+e.message); }
}
// « Voir en RA » depuis l'accueil du téléphone : dernier projet enregistré, sinon consigne
function startARFromHome(){
  if(!SC.walls.length){
    const snap=readSaved();
    if(!snap){ toast("Aucun projet : scannez le QR de l'éditeur ou ouvrez un fichier"); return; }
    applyScene(snap.scene);
  }
  startAR();
}
