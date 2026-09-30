'use strict';

// ════════════════════════════════════════════════════════════════
//  RÈGLES D'INSTALLATION NF C 15-100 (partie 7-701, salles d'eau)
//  Module pur (pas de DOM) : lit SC, renvoie des constats.
//  Les valeurs sont regroupées dans RULES pour être ajustables.
//  ⚠ Aide à la conception : ne remplace pas la vérification d'un
//    électricien qualifié ni le texte de la norme.
// ════════════════════════════════════════════════════════════════
const RULES = {
  // Nombre minimal d'équipements dans une salle d'eau (logement)
  minEquip: [
    {id:'eclairage', label:"Point d'éclairage", types:['dcl','spot','applique','hublot'], min:1, level:'err'},
    {id:'prise',     label:'Prise de courant 16 A', types:['prise'], min:1, level:'err'},
    {id:'commande',  label:"Commande d'éclairage (interrupteur)", types:['inter'], min:1, level:'warn'},
  ],
  // Circuits : section / protection / nombre maximal de points
  circuits: [
    {id:'eclairage', label:'Éclairage', types:['dcl','spot','applique','hublot'],
     options:[{section:1.5, disj:16, max:8}]},
    {id:'prises', label:'Prises 16 A', types:['prise'],
     options:[{section:1.5, disj:16, max:5}, {section:2.5, disj:20, max:8}]},
    {id:'vmc', label:'VMC', types:['vmc'], options:[{section:1.5, disj:2, max:1}], dedie:true},
    {id:'seche', label:'Sèche-serviettes', types:['seche'],
     options:[{section:1.5, disj:16, max:1}, {section:2.5, disj:20, max:1}], dedie:true},
  ],
  // LEL : section mini du conducteur de liaison équipotentielle locale (mm²)
  lelMinSection: {protegee:2.5, apparent:4},
  ddrMaxMa: 30,
};

const INSTALL_DEFAULT = {
  diff30: null,          // DDR ≤ 30 mA sur les circuits de la pièce : true | false | null (non renseigné)
  conducteurs: {         // éléments conducteurs présents dans la pièce
    canalisations: false,
    huisseries: false,
    bacMetal: false,
  },
  lel: null,             // LEL réalisée : true | false | null
  lelSection: 2.5,       // mm²
  lelProtegee: true,     // conducteur protégé mécaniquement (sous conduit / encastré)
};

function normalizeInstall(i){
  const d = INSTALL_DEFAULT;
  i = (i && typeof i === 'object') ? i : {};
  const tri = v => (v===true || v===false) ? v : null;
  const c = i.conducteurs || {};
  return {
    diff30: tri(i.diff30),
    conducteurs: {
      canalisations: c.canalisations===true,
      huisseries: c.huisseries===true,
      bacMetal: c.bacMetal===true,
    },
    lel: tri(i.lel),
    lelSection: Number.isFinite(i.lelSection) ? i.lelSection : d.lelSection,
    lelProtegee: i.lelProtegee !== false,
  };
}

function countTypes(types){
  return SC.electrique.filter(e=>types.includes(e.type)).length;
}

// Un constat : {level:'err'|'warn'|'ok', title, detail}
function checkInstallation(){
  const inst = normalizeInstall(SC.install);
  const out = [];
  const add = (level, title, detail) => out.push({level, title, detail});

  // 1. Équipements minimaux
  for(const r of RULES.minEquip){
    const n = countTypes(r.types);
    if(n >= r.min) add('ok', r.label, `${n} posé(s) (minimum ${r.min})`);
    else add(r.level, r.label, `Aucun posé — minimum ${r.min} requis`);
  }

  // 2. Protection différentielle 30 mA
  if(inst.diff30 === true)
    add('ok', 'Protection différentielle 30 mA', `Circuits de la pièce protégés par DDR ≤ ${RULES.ddrMaxMa} mA`);
  else if(inst.diff30 === false)
    add('err', 'Protection différentielle 30 mA', `Tous les circuits de la salle d'eau doivent être protégés par un DDR ≤ ${RULES.ddrMaxMa} mA`);
  else
    add('warn', 'Protection différentielle 30 mA', 'Non renseignée — à confirmer sur le tableau');

  // 3. Liaison équipotentielle locale
  const conduc = Object.values(inst.conducteurs).some(Boolean);
  const minSec = inst.lelProtegee ? RULES.lelMinSection.protegee : RULES.lelMinSection.apparent;
  if(inst.lel === true){
    if(inst.lelSection < minSec)
      add('err', 'Liaison équipotentielle locale (LEL)',
        `Section ${inst.lelSection} mm² insuffisante : minimum ${minSec} mm² (conducteur ${inst.lelProtegee?'protégé mécaniquement':'non protégé'})`);
    else
      add('ok', 'Liaison équipotentielle locale (LEL)', `Réalisée, ${inst.lelSection} mm² (minimum ${minSec} mm²)`);
  } else if(inst.lel === false){
    if(conduc) add('err', 'Liaison équipotentielle locale (LEL)', 'Éléments conducteurs présents : LEL obligatoire, à relier à la terre');
    else add('warn', 'Liaison équipotentielle locale (LEL)', 'Non réalisée — à prévoir dès qu\'un élément conducteur est présent');
  } else {
    add(conduc?'err':'warn', 'Liaison équipotentielle locale (LEL)',
      conduc ? 'Éléments conducteurs présents mais LEL non renseignée' : 'Non renseignée — à confirmer');
  }

  // 4. Pièce sans volume défini
  if(!SC.sanitaires.some(s=>CAT_SAN[s.type]?.genZone))
    add('warn', 'Volumes de la salle d\'eau', 'Aucune baignoire, douche ou balnéo : aucun volume 0/1/2 généré');

  return out;
}

// Dimensionnement indicatif des circuits d'après l'appareillage posé
function checkCircuits(){
  const rows = [];
  for(const c of RULES.circuits){
    const n = countTypes(c.types);
    if(!n) continue;
    const first = c.options[0], last = c.options[c.options.length-1];
    let status='ok', spec, note='';
    if(n <= first.max){
      spec = `${first.section} mm² · ${first.disj} A`;
    } else if(n <= last.max){
      spec = `${last.section} mm² · ${last.disj} A`;
      status = 'warn'; note = `Plus de ${first.max} points : section ${last.section} mm² obligatoire`;
    } else {
      spec = `${last.section} mm² · ${last.disj} A`;
      status = 'warn'; note = `Plus de ${last.max} points : prévoir un circuit supplémentaire`;
    }
    if(c.dedie) note = note || 'Circuit dédié recommandé';
    rows.push({label:c.label, count:n, spec, status, note});
  }
  return rows;
}

// Constats par appareil (zones, hauteur, IP...) + constats d'installation → score
function evaluateProject(){
  let errs=0, warns=0;
  const items = SC.electrique.map(el=>{
    const r = checkEl(el);
    errs += r.errs.length; warns += r.warns.length;
    return {el, kind:'el', cat:CAT_EL[el.type], ...r};
  });
  for(const m of SC.meubles){
    if(!CAT_MEUBLE[m.type].elec) continue;
    const r = checkMeuble(m);
    errs += r.errs.length; warns += r.warns.length;
    items.push({el:m, kind:'meuble', cat:CAT_MEUBLE[m.type], ...r});
  }
  const install = checkInstallation();
  for(const f of install){ if(f.level==='err') errs++; else if(f.level==='warn') warns++; }
  const circuits = checkCircuits();
  for(const c of circuits){ if(c.status==='warn') warns++; }
  // Barème indicatif : -20 par erreur, -5 par alerte
  const score = Math.max(0, Math.round(100 - errs*20 - warns*5));
  return {items, install, circuits, errs, warns, score};
}
