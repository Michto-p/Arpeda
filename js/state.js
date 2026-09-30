'use strict';

const SC = {
  walls: [],          // {pts, closed, kind:'ext'|'int', comp:'mur_brique_classique', layers:[...]}
  openings: [],       // {id, type, wi, si, t, w, menui:'fenetre_pvc_dv'}
  sanitaires: [],
  electrique: [],
  meubles: [],        // {id, type, x, y, rot, z, hgt}
  roomH: 2.50,
  idSeq: 0,
  install: normalizeInstall(null),  // paramètres d'installation (DDR, LEL) — voir rules.js
};

let curStep = 0;
let drawTool='poly', openType='door';
let curPoly = [];
let dMouse = {x:0,y:0};
let selSanId=-1, selElId=-1, selMeuId=-1;

// Vues canvas (scale + pan par étape)
const VIEWS = {
  draw:{sc:80, px:0, py:0, init:false},
  open:{sc:80, px:0, py:0, init:false},
  san: {sc:80, px:0, py:0, init:false},
  el:  {sc:80, px:0, py:0, init:false},
};
