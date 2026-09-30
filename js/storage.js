'use strict';

// ════════════════════════════════
//  PERSISTANCE : autosave localStorage + export/import JSON
// ════════════════════════════════
const APP_VERSION = '5.0';
const STORE_KEY = 'arpeda.project';
const STORE_FORMAT = 1;

let _saveTimer = null;
let _lastSaved = '';

function toast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2600);
}

function projectSnapshot(){
  return {
    app: 'arpeda',
    format: STORE_FORMAT,
    appVersion: APP_VERSION,
    savedAt: new Date().toISOString(),
    scene: JSON.parse(JSON.stringify(SC)),
  };
}

// ── Validation d'un projet importé / restauré ──
const _isNum = v => typeof v === 'number' && Number.isFinite(v);

function sanitizeScene(sc){
  if(!sc || typeof sc !== 'object') throw new Error('Fichier invalide');
  const arr = k => {
    if(!Array.isArray(sc[k])) throw new Error('Champ manquant : '+k);
    return sc[k];
  };
  if(!Array.isArray(sc.meubles)) sc.meubles = [];
  const walls = arr('walls'), openings = arr('openings');
  const sanitaires = arr('sanitaires'), electrique = arr('electrique');

  for(const w of walls){
    if(!w || !Array.isArray(w.pts) || w.pts.length<2 || !w.pts.every(p=>p && _isNum(p.x) && _isNum(p.y)))
      throw new Error('Mur invalide');
  }
  for(const o of openings){
    if(!o || !_isNum(o.wi) || !walls[o.wi] || !_isNum(o.si) || !_isNum(o.t) || !_isNum(o.w))
      throw new Error('Ouverture invalide');
  }
  for(const s of sanitaires){
    if(!s || !CAT_SAN[s.type] || !_isNum(s.x) || !_isNum(s.y)) throw new Error('Sanitaire invalide');
  }
  for(const e of electrique){
    if(!e || !CAT_EL[e.type] || !_isNum(e.x) || !_isNum(e.y) || !_isNum(e.h)) throw new Error('Appareil invalide');
  }
  for(const m of sc.meubles){
    if(!m || !CAT_MEUBLE[m.type] || !_isNum(m.x) || !_isNum(m.y) || !_isNum(m.z) || !_isNum(m.hgt)) throw new Error('Meuble invalide');
  }
  const roomH = _isNum(sc.roomH) ? Math.min(3.5, Math.max(2.0, sc.roomH)) : 2.5;
  const maxId = Math.max(0, ...[...openings, ...sanitaires, ...electrique, ...sc.meubles].map(x=>_isNum(x.id)?x.id:0));
  const idSeq = Math.max(maxId, _isNum(sc.idSeq) ? sc.idSeq : 0);
  return {walls, openings, sanitaires, electrique, meubles: sc.meubles, roomH, idSeq, install: normalizeInstall(sc.install)};
}

function applyScene(sc){
  const clean = sanitizeScene(sc);
  Object.assign(SC, clean);
  curPoly = [];
  selSanId = -1; selElId = -1; selMeuId = -1; selWallIdx = -1; selOpId = -1;
  for(const k in VIEWS) VIEWS[k].init = false;
  refreshElements();
  const rng = document.getElementById('rngH');
  if(rng) rng.value = SC.roomH;
  const lbl = document.getElementById('lblH');
  if(lbl) lbl.textContent = SC.roomH.toFixed(2)+'m';
}

// Recalcule zone / distance à l'eau (champs dérivés, non fiables après import)
function refreshElements(){
  for(const el of SC.electrique){
    el.zone = getZone(el.x, el.y, el.h);
    el.distCm = distToV0(el.x, el.y);
  }
}

// ── localStorage ──
function saveNow(){
  clearTimeout(_saveTimer); _saveTimer = null;
  try{
    const snap = projectSnapshot();
    const json = JSON.stringify(snap.scene);
    if(json === _lastSaved) return;
    localStorage.setItem(STORE_KEY, JSON.stringify(snap));
    _lastSaved = json;
  }catch(e){ /* stockage indisponible (mode privé, quota) : on continue sans */ }
}

function scheduleSave(){
  if(_saveTimer) return;
  _saveTimer = setTimeout(saveNow, 500);
}

function readSaved(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    const snap = JSON.parse(raw);
    sanitizeScene(snap.scene);
    return snap;
  }catch(e){ return null; }
}

function resumeProject(){
  const snap = readSaved();
  if(!snap){ toast('Aucun projet sauvegardé'); refreshHome(); return; }
  applyScene(snap.scene);
  _lastSaved = JSON.stringify(snap.scene);
  enterApp();
}

async function newProject(){
  const snap = readSaved();
  if(snap && !await askConfirm('Un projet sauvegardé existe. Le remplacer par un nouveau projet ?')) return;
  Object.assign(SC, {walls:[], openings:[], sanitaires:[], electrique:[], meubles:[], roomH:2.5, idSeq:0, install:normalizeInstall(null)});
  applyScene(SC);
  enterApp();
}

function refreshHome(){
  const snap = readSaved();
  const btn = document.getElementById('btnResume');
  if(btn){
    btn.style.display = snap ? '' : 'none';
    if(snap){
      const d = new Date(snap.savedAt);
      btn.textContent = '↻ Reprendre le projet' + (isNaN(d) ? '' : ' · ' + d.toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
    }
  }
  const ver = document.getElementById('hVer');
  if(ver) ver.textContent = 'v'+APP_VERSION;
}

// ── Export / import fichier ──
function exportProject(){
  const snap = projectSnapshot();
  const blob = new Blob([JSON.stringify(snap, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = `arpeda-projet-${d}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  toast('Projet exporté');
}

function importProject(){
  document.getElementById('fileImport').click();
}

function onImportFile(input){
  const f = input.files && input.files[0];
  input.value = '';
  if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const snap = JSON.parse(reader.result);
      if(snap.app !== 'arpeda' || !snap.scene) throw new Error('Ce fichier n\'est pas un projet Arpeda');
      applyScene(snap.scene);
      saveNow();
      toast('Projet importé');
      enterApp();
    }catch(e){
      toast('Import impossible : '+e.message);
    }
  };
  reader.onerror = ()=>toast('Lecture du fichier impossible');
  reader.readAsText(f);
}

window.addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) saveNow(); });
