'use strict';

// ════════════════════════════════
//  HISTORIQUE (annuler / refaire) — instantanés de la scène
//  On compare la scène à la dernière version validée : aucune mutation n'a besoin d'être
//  instrumentée. histCommit() est appelé en fin de geste (mouseup, changement de champ…).
// ════════════════════════════════
const HIST = {undo:[], redo:[], last:'', timer:null, busy:false, max:100};

function histSnap(){ return JSON.stringify(projectSnapshot().scene); }

function histInit(){
  HIST.undo=[]; HIST.redo=[]; HIST.last=histSnap();
  histButtons();
}

// Validation différée : couvre les modifications faites depuis un champ de saisie
function histSoon(){
  if(HIST.busy) return;
  clearTimeout(HIST.timer);
  HIST.timer=setTimeout(histCommit, 700);
}

function histCommit(){
  if(HIST.busy) return;
  clearTimeout(HIST.timer);
  const cur=histSnap();
  if(cur===HIST.last) return;
  HIST.undo.push(HIST.last);
  if(HIST.undo.length>HIST.max) HIST.undo.shift();
  HIST.redo=[];
  HIST.last=cur;
  histButtons();
}

function _histRestore(str){
  HIST.busy=true;
  try{ applyScene(JSON.parse(str), {keepView:true}); }
  finally{ HIST.busy=false; }
  HIST.last=str;
  if(typeof studioAfterRestore==='function') studioAfterRestore();
  histButtons();
}

function histUndo(){
  histCommit();
  if(!HIST.undo.length){ toast('Rien à annuler'); return; }
  HIST.redo.push(HIST.last);
  _histRestore(HIST.undo.pop());
}

function histRedo(){
  histCommit();
  if(!HIST.redo.length){ toast('Rien à rétablir'); return; }
  HIST.undo.push(HIST.last);
  _histRestore(HIST.redo.pop());
}

function histButtons(){
  const u=document.getElementById('stUndo'), r=document.getElementById('stRedo');
  if(u) u.disabled=!HIST.undo.length;
  if(r) r.disabled=!HIST.redo.length;
}
