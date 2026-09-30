'use strict';

const SC = {
  walls: [],          // {pts, closed, kind:'ext'|'int', comp:'mur_brique_classique', layers:[...]}
  openings: [],       // {id, type, wi, si, t, w, menui:'fenetre_pvc_dv'}
  sanitaires: [],
  electrique: [],
  name: '',           // nom du projet
  arRef: null,        // repère RA : {a:{x,y}, b:{x,y}, label} (b à 1 m de a) ; null = défaut (1er mur)
  meubles: [],        // {id, type, x, y, rot, z, hgt}
  roomH: 2.50,
  idSeq: 0,
  exercise: defaultExercise(),      // titre, consigne, correction ajustée — voir exercise.js
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
  studio:{sc:80, px:0, py:0, init:false},
};

// Mode exercice (apprenti) : scène en lecture seule, verdicts et volumes masqués jusqu'à la correction
const EXO = {active:false, data:null, id:'', answers:{}, name:'', submitted:false, revealed:false};
function hideChecks(){ return EXO.active && !EXO.revealed; }
function hideZones(){ return EXO.active && !EXO.revealed && !(EXO.data && EXO.data.z); }

// Éditeur PC (studio) — voir studio.js / studio-canvas.js
const STUDIO = {active:false, tab:'plan'};

// Mode « visionneuse » (téléphone) : projet reçu par lien/QR, lecture seule, jamais sauvegardé
const VIEWER = {active:false};
