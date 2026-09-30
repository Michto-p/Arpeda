'use strict';

// Modale de confirmation (remplace confirm() pour compatibilité iframe sandbox)
let _modalCb = null;
function askConfirm(msg){
  return new Promise(resolve=>{
    document.getElementById('modalMsg').textContent = msg;
    document.getElementById('modal').style.display = 'flex';
    _modalCb = resolve;
  });
}
function modalResolve(ok){
  document.getElementById('modal').style.display = 'none';
  if(_modalCb){ _modalCb(ok); _modalCb = null; }
}
