import {loadOriginalGarage} from './assets/immersive/garage-loader.js';
export async function loadGarage(container,key,{onCharacter}){
 return loadOriginalGarage(container,key==='kanata'?40001:40002,{onCharacter:id=>onCharacter(id===16?'hotaru':id),autoplay:false,loop:true});
}
