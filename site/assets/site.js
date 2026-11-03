'use strict';
const menuButton=document.querySelector('.menu-button');
const navigation=document.getElementById('navigation');
function closeMenu(returnFocus=false){
 const wasOpen=menuButton.getAttribute('aria-expanded')==='true';
 menuButton.setAttribute('aria-expanded','false');
 menuButton.setAttribute('aria-label','Открыть меню');
 navigation.classList.remove('is-open');
 if(returnFocus&&wasOpen)menuButton.focus();
}
menuButton.addEventListener('click',()=>{
 const open=menuButton.getAttribute('aria-expanded')!=='true';
 menuButton.setAttribute('aria-expanded',String(open));
 menuButton.setAttribute('aria-label',open?'Закрыть меню':'Открыть меню');
 navigation.classList.toggle('is-open',open);
});
navigation.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>closeMenu()));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu(true);});
document.addEventListener('click',e=>{if(!navigation.contains(e.target)&&!menuButton.contains(e.target))closeMenu();});
const mobileWidth=window.matchMedia('(max-width:640px)');
mobileWidth.addEventListener('change',()=>closeMenu());
let toastTimer;
function notify(text){const box=document.getElementById('toast');box.textContent=text;box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),4500);}
document.querySelector('.copy-hash').addEventListener('click',async()=>{
 const code=document.getElementById('apk-hash');
 try{await navigator.clipboard.writeText(code.textContent.trim());notify('Контрольная сумма скопирована');}
 catch{const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);notify('Скопируй выделенную контрольную сумму');}
});
const downloadBar=document.querySelector('.mobile-download');
const hero=document.getElementById('hero-download');
const releaseDownload=document.querySelector('.release-download');
if('IntersectionObserver' in window){
 let heroPast=false,releaseVisible=false;
 const updateBar=()=>{downloadBar.hidden=!mobileWidth.matches||!heroPast||releaseVisible;};
 new IntersectionObserver(entries=>{for(const e of entries){if(e.target===hero)heroPast=!e.isIntersecting&&e.boundingClientRect.bottom<0;else releaseVisible=e.isIntersecting;}updateBar();}).observe(hero);
 new IntersectionObserver(entries=>{releaseVisible=entries[0].isIntersecting;updateBar();}).observe(releaseDownload);
 mobileWidth.addEventListener('change',updateBar);
}
// Deep links to an installation answer also open its disclosure.
function revealAnswer(){const target=document.getElementById(location.hash.slice(1));if(target?.tagName==='DETAILS')target.open=true;}
window.addEventListener('hashchange',revealAnswer);revealAnswer();
