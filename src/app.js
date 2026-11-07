import { icon } from './icons.js';
import { exampleLibrary, emptyLibrary, newId, newCard, validateLibrary } from './data.js';
import { parseImport, toCsv } from './importer.js';
import { scheduleReview, selectStudyCards, getMastery, getStreak, dateKey } from './study.js';
import { isCloudConfigured, getCloudClient, getAuthRedirectUrl, loadCloudLibrary, saveCloudLibrary } from './cloud.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = {blue:{accent:'#88bedf',tint:'#23394e'},green:{accent:'#a0c49f',tint:'#293c34'},purple:{accent:'#b8a1dc',tint:'#362f49'},orange:{accent:'#e5ad83',tint:'#42362e'},pink:{accent:'#dea3ba',tint:'#432f40'}};
const rates = ['#d8e0e8','#d77f89','#e69c60','#d2bd67','#8fb58a','#65a6c7'];
const rateLabels = ['Not studied','Not yet','A little','Getting there','Almost there','Got it'];
const palette = color => {const c=colors[color]||colors.blue;return `--accent:${c.accent};--tint:${c.tint}`;};
const storageKey = id => `recall.library.v1.${id || 'guest'}`;
function readLocal(id) {
  try {const value=localStorage.getItem(storageKey(id));return value?validateLibrary(JSON.parse(value)):null;} catch {return null;}
}
function readLocalSync(id) {
  try {const value=JSON.parse(localStorage.getItem(storageKey(id)));return {dirty:Boolean(value?._localSync?.dirty),revision:Number(value?._localSync?.revision)||0};}catch{return {dirty:false,revision:0};}
}
let initialLibrary=readLocal();
const state = {library:initialLibrary||exampleLibrary(),view:'library',classId:null,deckId:null,user:null,query:'',sort:'recent',filter:'all',mobile:false,cloudReady:false,cloudLoading:false,cloudError:'',sync:'local',dirty:false,revision:0,study:null,visibleCards:100,authMode:'login',importDraft:null};
let toastTimer, cloudTimer, syncChain=Promise.resolve(), syncGeneration=0, authGeneration=0, lastFocus, boundUserId;
let storageWarningShown=false;

const logo = `<svg class="brand-logo" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M18 3c5.5 0 7.2 6.1 7.2 7.8 1.7 0 7.8 1.7 7.8 7.2s-6.1 7.2-7.8 7.2c0 1.7-1.7 7.8-7.2 7.8s-7.2-6.1-7.2-7.8C9.1 25.2 3 23.5 3 18s6.1-7.2 7.8-7.2C10.8 9.1 12.5 3 18 3Z" stroke="#98cce8" stroke-width="1.7"/><path d="M18 11v14m-7-7h14" stroke="#98cce8" stroke-width="1.7"/><circle cx="27.5" cy="8.5" r="3.2" fill="#ee9568"/></svg>`;
const allCards = () => state.library.classes.flatMap(c=>c.decks.flatMap(d=>d.cards));
const classCards = cls => cls.decks.flatMap(d=>d.cards);
const currentClass = () => state.library.classes.find(c=>c.id===state.classId);
const currentDeck = () => currentClass()?.decks.find(d=>d.id===state.deckId);
const todayActivity = () => state.library.activity.filter(a=>a.date===dateKey()).reduce((sum,a)=>sum+a.cards,0);
const num = value => Number(value).toLocaleString();
const dueCount = cards => cards.filter(c=>!c.confidence||!c.dueAt||Date.parse(c.dueAt)<=Date.now()).length;

function writeLocal() {
  try {localStorage.setItem(storageKey(state.user?.id),JSON.stringify({...state.library,_localSync:{dirty:state.user?state.dirty:false,revision:state.revision}}));return true;} catch {
    if (!storageWarningShown) {storageWarningShown=true;toast('Browser storage is full or unavailable. Export a backup to keep your cards.',true);}
    return false;
  }
}
function persist() {
  if(state.user){state.revision++;state.dirty=true;}
  writeLocal();
  if (state.user && state.cloudReady) {
    state.sync='saving';updateStatus();clearTimeout(cloudTimer);
    cloudTimer=setTimeout(queueCloudSave,500);
  }
}
function queueCloudSave() {
  clearTimeout(cloudTimer);
  if (!state.user || !state.cloudReady) return syncChain;
  const id=state.user.id, snapshot=structuredClone(state.library), generation=++syncGeneration, revision=state.revision;
  syncChain=syncChain.catch(()=>{}).then(()=>saveCloudLibrary(id,snapshot)).then(()=>{
    if(state.user?.id===id&&generation===syncGeneration&&state.revision===revision){state.dirty=false;state.sync='synced';writeLocal();updateStatus();}
  }).catch(error=>{
    if(state.user?.id===id){state.sync='error';updateStatus();toast('Cloud sync failed. Your cards are saved on this device. Retry in Settings.',true);}
    console.error('Cloud save failed:',error.message);
  });
  return syncChain;
}
function updateStatus() {
  const target=$('#cloud-status');if(target)target.outerHTML=statusHtml();
}
function statusHtml() {
  const text = state.user ? ({saving:'Saving…',synced:'All changes saved',error:'Sync needs attention',loading:'Loading library…'}[state.sync]||'Connecting…') : 'On this device';
  return `<span class="cloud-status" id="cloud-status" title="${state.user?'Your private account library':'Sign in to sync cards across devices'}"><i class="status-dot ${state.sync==='synced'?'synced':state.sync==='error'?'error':''}"></i>${text}</span>`;
}
function toast(message, error=false) {
  clearTimeout(toastTimer);$('#toast-root').innerHTML=`<div class="toast" role="status">${icon(error?'help':'check')}<span>${esc(message)}</span></div>`;
  toastTimer=setTimeout(()=>$('#toast-root').replaceChildren(),error?6500:3500);
}
function navigate(view='library', classId=null, deckId=null) {
  state.view=view;state.classId=classId;state.deckId=deckId;state.mobile=false;state.query='';state.visibleCards=100;
  render();window.scrollTo({top:0,behavior:'instant'});
}
function render() {
  if(state.study){renderStudy();return;}
  $('#app').innerHTML=`<div class="app-layout">${sidebarHtml()}<div class="workspace">${topbarHtml()}<main id="main" class="content" tabindex="-1">${contentHtml()}</main></div>${mobileNavHtml()}</div>`;
}
function mobileNavHtml() {return `<nav class="mobile-nav" aria-label="Quick navigation"><button class="${['library','class','deck'].includes(state.view)?'selected':''}" data-action="library">${icon('grid')}<span>Library</span></button><button class="${state.view==='progress'?'selected':''}" data-action="progress">${icon('chart')}<span>Progress</span></button><button class="mobile-study" data-action="study-all" aria-label="Start a study session"><i>${icon('play')}</i><span>Study</span></button><button data-action="import">${icon('upload')}<span>Import</span></button><button class="${state.view==='settings'?'selected':''}" data-action="settings">${icon('user')}<span>You</span></button></nav>`;}
function questHtml() {
  const total=state.library.activity.reduce((s,a)=>s+a.cards,0),xp=total*10,level=Math.floor(xp/500)+1,studied=todayActivity(),goal=state.library.settings.dailyGoal,progress=Math.min(100,studied/goal*100);
  return `<section class="daily-quest" aria-label="Your daily study quest"><div class="quest-ring" style="--quest:${progress}%"><span>${icon(studied>=goal?'check':'flame')}</span></div><div class="quest-copy"><strong>${studied>=goal?'Daily quest complete!':'Your daily little win.'}</strong><p>${studied>=goal?'A little consistency. A lot to be proud of.':`${num(studied)} / ${goal} cards · ${goal*10} XP to collect today`}</p></div><div class="quest-level"><span>LEVEL ${level}</span><strong>${num(xp)} <small>XP</small></strong><div class="mastery-track"><span style="width:${xp%500/5}%;background:#a78bcc"></span></div></div></section>`;
}
function sidebarHtml() {
  const classes=state.library.classes, studied=todayActivity(), goal=state.library.settings.dailyGoal;
  return `${state.mobile?'<div class="sidebar-backdrop" data-action="toggle-menu"></div>':''}<aside class="sidebar ${state.mobile?'open':''}" aria-label="Main navigation">
    <button class="brand" data-action="library" aria-label="Flashlang home">${logo}<span class="brand-word">flashlang<span class="brand-dot">.</span></span></button>
    <nav aria-label="Your workspace">
      <button class="nav-item ${state.view==='library'?'active':''}" data-action="library">${icon('grid')}<span>My library</span><span class="nav-badge">${classes.length}</span></button>
      <button class="nav-item ${state.view==='progress'?'active':''}" data-action="progress">${icon('chart')}<span>My progress</span></button>
      <div class="nav-label">MY CLASSES</div>
      <div class="sidebar-classes">${classes.map(c=>`<button class="nav-item class-link ${state.classId===c.id?'active':''}" data-action="class" data-id="${esc(c.id)}" style="${palette(c.color)}"><i class="class-dot"></i><span>${esc(c.title)}</span></button>`).join('')}</div>
      <button class="nav-item nav-create" data-action="new-class">${icon('plus')}<span>Create a class</span></button>
    </nav>
    <div class="sidebar-spacer"></div>
    <button class="sidebar-goal" data-action="progress" aria-label="Daily goal: ${studied} of ${goal} cards studied"><span class="sidebar-goal-head">${icon('flame')}A little, every day.</span><p>${studied>=goal?'Daily goal reached. Look at you go!':`${num(studied)} of ${goal} cards studied today`}</p><div class="goal-track"><span style="width:${Math.min(100,studied/goal*100)}%"></span></div></button>
    <button class="nav-item ${state.view==='settings'?'active':''}" data-action="settings">${icon('settings')}<span>Settings</span></button>
    <button class="nav-item" data-action="help">${icon('help')}<span>A little help</span></button>
    <div class="sidebar-footer"><div class="avatar">${state.user?esc(state.user.email.slice(0,2).toUpperCase()):icon('user')}</div><div class="sidebar-user"><strong>${state.user?esc(state.user.email.split('@')[0]):'Your study space'}</strong><span>${state.user?'Personal account':'Make yourself at home'}</span></div><button data-action="${state.user?'account':'login'}" aria-label="${state.user?'Account settings':'Log in'}">${icon(state.user?'settings':'arrow')}</button></div>
  </aside>`;
}
function topbarHtml() {
  const cls=currentClass();
  return `<header class="topbar"><button class="mobile-toggle" data-action="toggle-menu" aria-label="Open menu">${icon('menu')}</button><div class="topbar-breadcrumb"><span>Your workspace</span>${icon('chevron')}<strong>${esc(cls?.title||({progress:'My progress',settings:'Settings'}[state.view])||'My library')}</strong></div><label class="topbar-search">${icon('search')}<input id="global-search" type="search" placeholder="Find a flashcard…" aria-label="Search your library" value="${esc(state.query)}" autocomplete="off"><kbd>/</kbd></label>${statusHtml()}<span class="topbar-divider"></span><button class="topbar-account" data-action="${state.user?'account':'login'}">${state.user?`<span class="avatar">${esc(state.user.email.slice(0,2).toUpperCase())}</span>`:'Log in'}</button></header>`;
}
function contentHtml() {
  if(state.cloudLoading)return `<div class="empty-state"><div class="empty-icon">${icon('cloud')}</div><h3>Getting your cards ready…</h3><p>Opening your private study space.</p></div>`;
  if(state.cloudError)return `<div class="empty-state"><div class="empty-icon">${icon('cloud')}</div><h3>Your library couldn’t load</h3><p>${esc(state.cloudError)}</p><button class="btn btn-blue" data-action="retry-load">Try again</button><button class="btn btn-quiet" data-action="logout">Log out</button></div>`;
  if(state.query)return searchHtml();
  if(state.view==='class'&&currentClass())return classHtml();
  if(state.view==='deck'&&currentDeck())return deckHtml();
  if(state.view==='progress')return progressHtml();
  if(state.view==='settings')return settingsHtml();
  return libraryHtml();
}
function renderContent() { const main=$('#main');if(main)main.innerHTML=contentHtml(); }
function footerHtml() {return `<footer class="page-footer"><span>Made for curious minds. Built for lasting knowledge.</span><span>${icon(state.user?'lock':'laptop')}${state.user?'Your library is private':'Saved on this device · sign in to sync'}</span></footer>`;}
function statsHtml() {
  const cards=allCards();const values=[['cards',num(cards.length),'Total flashcards'],['target',`${getMastery(cards)}%`,'Overall mastery'],['flame',getStreak(state.library.activity),'Day study streak'],['check',num(todayActivity()),'Cards studied today']];
  return `<div class="stats-strip">${values.map(([ico,value,label])=>`<div class="stat"><div class="stat-icon">${icon(ico)}</div><div><strong>${value}</strong><span>${label}</span></div></div>`).join('')}</div>`;
}
function libraryHtml() {
  let classes=[...state.library.classes];if(state.sort==='az')classes.sort((a,b)=>a.title.localeCompare(b.title));if(state.sort==='mastery')classes.sort((a,b)=>getMastery(classCards(a))-getMastery(classCards(b)));
  return `<div class="page-heading"><div><div class="eyebrow">YOUR PERSONAL LEARNING SPACE</div><h1>My library</h1><p>A home for everything you want to remember.</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="import">${icon('upload')}Import cards</button><button class="btn btn-primary" data-action="new-class">${icon('plus')}Create a class</button></div></div>
  <section class="hero" aria-label="Ready for a little progress?"><div class="hero-copy"><div class="hero-tag">${icon('spark')}A LITTLE PROGRESS GOES A LONG WAY</div><h2>Small sessions.<br><em>Big possibilities.</em></h2><p>A few cards today. Knowledge that stays.<br>Let’s make your next study session count.</p><button class="btn btn-dark" data-action="study-all">Let’s study ${icon('arrow')}</button></div><div class="hero-art" aria-hidden="true"><div class="hero-orbit"></div><div class="illustration-card back"></div><div class="illustration-card"><p>What will you<br>learn today?</p><small>ONE CARD AT A TIME</small></div><div class="illustration-label">${icon('check')}A little wiser already.</div><span class="art-spark">${icon('spark')}</span><span class="art-circle"></span><div class="confidence-mini">${[1,2,3,4,5].map(r=>`<i style="--rate:${rates[r]}">${r}</i>`).join('')}</div></div></section>
  ${statsHtml()}${questHtml()}<div class="section-heading"><h2>Your classes</h2><span class="section-count">${classes.length}</span><label class="push-right"><span class="sr-only">Sort classes</span><select class="sort-select" id="class-sort"><option value="recent" ${state.sort==='recent'?'selected':''}>Recently added</option><option value="az" ${state.sort==='az'?'selected':''}>Alphabetical</option><option value="mastery" ${state.sort==='mastery'?'selected':''}>Needs practice</option></select></label></div>
  ${classes.length?`<div class="class-grid">${classes.map(classCardHtml).join('')}</div>`:emptyHtml('Your next chapter starts here.','Create a class for something you’re learning, then add your first deck.','Create your first class','new-class')}
  <div class="study-note">${icon('bulb')}<div><strong>Study smarter, at your own pace.</strong><p>Rate how well you know each card. We’ll bring the tricky ones back sooner.</p></div><button data-action="help">How it works ${icon('arrow')}</button></div>${footerHtml()}`;
}
function classCardHtml(cls) {
  const cards=classCards(cls), mastery=getMastery(cards);
  return `<article class="class-card" style="${palette(cls.color)}"><div class="class-cover"><div class="cover-icon">${icon(cls.icon)}</div><span class="cover-category">${cls.icon==='globe'?'KEEP EXPLORING':cls.icon==='palette'?'STAY CURIOUS':'KEEP LEARNING'}</span></div><div class="class-card-body"><h3>${esc(cls.title)}</h3><p>${esc(cls.description||'A new place for your next big idea.')}</p><div class="class-card-meta"><span>${icon('book')}${cls.decks.length} ${cls.decks.length===1?'deck':'decks'}</span><span>${icon('cards')}${num(cards.length)} cards</span></div><div class="mastery-line"><span>Mastery</span><strong>${mastery}%</strong></div><div class="mastery-track"><span style="width:${mastery}%"></span></div><div class="class-card-footer"><span>${dueCount(cards)>0?`${num(dueCount(cards))} cards ready to study`:'Ready when you are'}</span>${icon('arrow')}</div></div><button class="class-card-link" data-action="class" data-id="${esc(cls.id)}" aria-label="Open ${esc(cls.title)}"></button></article>`;
}
function emptyHtml(title,description,label,action) {return `<div class="empty-state"><div class="empty-icon">${icon('cards')}</div><h3>${esc(title)}</h3><p>${esc(description)}</p>${label?`<button class="btn btn-primary" data-action="${action}">${icon('plus')}${esc(label)}</button>`:''}</div>`;}
function classHtml() {
  const cls=currentClass(),cards=classCards(cls);
  return `<button class="back-link" data-action="library">${icon('back')}Back to my library</button><div class="class-header" style="${palette(cls.color)}"><div class="cover-icon">${icon(cls.icon)}</div><div><h1>${esc(cls.title)}</h1><p>${esc(cls.description||'One card closer to knowing it by heart.')}</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="edit-class">${icon('edit')}Edit class</button><button class="btn btn-primary" data-action="study-class" ${!cards.length?'disabled':''}>${icon('play')}Study class</button></div></div>
  <div class="section-heading"><h2>Your decks</h2><span class="section-count">${cls.decks.length}</span><div class="heading-actions push-right"><button class="btn btn-secondary btn-sm" data-action="import">${icon('upload')}Import cards</button><button class="btn btn-blue btn-sm" data-action="new-deck">${icon('plus')}Add a deck</button></div></div>
  ${cls.decks.length?`<div class="deck-list">${cls.decks.map(deck=>`<div class="deck-row"><div class="deck-symbol">${icon('cards')}</div><div class="deck-info"><button class="deck-title" data-action="deck" data-id="${esc(deck.id)}">${esc(deck.title)}</button><p>${num(deck.cards.length)} cards <span aria-hidden="true">·</span> ${dueCount(deck.cards)} ready to study</p></div><div class="deck-mastery"><div class="mastery-line"><span>Mastery</span><strong>${getMastery(deck.cards)}%</strong></div><div class="mastery-track"><span style="width:${getMastery(deck.cards)}%"></span></div></div><button class="btn btn-secondary btn-sm" data-action="study-deck" data-id="${esc(deck.id)}" ${!deck.cards.length?'disabled':''}>${icon('play')}Study</button><button class="icon-btn" data-action="deck" data-id="${esc(deck.id)}" aria-label="Open ${esc(deck.title)}">${icon('chevron')}</button></div>`).join('')}</div>`:emptyHtml('A fresh start.','Create a deck to keep related flashcards together.','Add your first deck','new-deck')}
  ${cards.length?`<div class="study-note">${icon('target')}<div><strong>${getMastery(cards)}% mastered. A little further every day.</strong><p>${num(cards.length)} flashcards across ${cls.decks.length} decks, all in one place.</p></div></div>`:''}${footerHtml()}`;
}
function deckHtml() {
  const deck=currentDeck();let cards=deck.cards.filter(c=>state.filter==='starred'?c.starred:state.filter==='weak'?c.confidence<=2:true);
  return `<button class="back-link" data-action="class" data-id="${esc(state.classId)}">${icon('back')}${esc(currentClass().title)}</button><div class="page-heading"><div><div class="eyebrow">YOUR FLASHCARDS</div><h1>${esc(deck.title)}</h1><p>${num(deck.cards.length)} cards <span aria-hidden="true">·</span> ${getMastery(deck.cards)}% mastered</p></div><div class="heading-actions"><button class="icon-btn" data-action="edit-deck" aria-label="Edit deck">${icon('edit')}</button><button class="icon-btn" data-action="export-deck" aria-label="Export deck as CSV">${icon('download')}</button><button class="btn btn-secondary" data-action="import">${icon('upload')}Import</button><button class="btn btn-primary" data-action="study-deck" data-id="${esc(deck.id)}" ${!deck.cards.length?'disabled':''}>${icon('play')}Study deck</button></div></div>
  <div class="section-heading"><h2>Flashcards</h2><label class="push-right"><span class="sr-only">Filter flashcards</span><select class="sort-select" id="card-filter"><option value="all" ${state.filter==='all'?'selected':''}>All cards</option><option value="starred" ${state.filter==='starred'?'selected':''}>Starred cards</option><option value="weak" ${state.filter==='weak'?'selected':''}>Needs practice</option></select></label><button class="btn btn-blue btn-sm" data-action="new-card">${icon('plus')}Add a card</button></div>
  ${cards.length?`<div class="card-list"><div class="card-list-head"><span>#</span><span>Question</span><span>Answer</span><span class="sr-only">Actions</span></div>${cards.slice(0,state.visibleCards).map((card,i)=>`<div class="card-row"><span class="card-number">${i+1}</span><div class="card-text">${esc(card.question)}</div><div class="card-text card-answer">${esc(card.answer)}</div><div class="card-row-actions"><i class="confidence-dot" style="--rate:${rates[card.confidence]}" title="${rateLabels[card.confidence]}"></i><button class="icon-btn ${card.starred?'starred':''}" data-action="star-card" data-id="${esc(card.id)}" aria-label="${card.starred?'Unstar':'Star'} card ${i+1}" aria-pressed="${card.starred}">${icon('star')}</button><button class="icon-btn" data-action="edit-card" data-id="${esc(card.id)}" aria-label="Edit card ${i+1}">${icon('edit')}</button><button class="icon-btn" data-action="delete-card" data-id="${esc(card.id)}" aria-label="Delete card ${i+1}">${icon('trash')}</button></div></div>`).join('')}</div>${cards.length>state.visibleCards?'<div style="text-align:center;margin-top:20px"><button class="btn btn-secondary" data-action="more-cards">Show more cards</button></div>':''}`:emptyHtml(deck.cards.length?'No cards match this filter.':'A question is the beginning.','Add a question and an answer, or import a whole list.','Add a card','new-card')}${footerHtml()}`;
}
function searchHtml() {
  const query=state.query.trim().toLowerCase();const matches=[];
  for(const cls of state.library.classes)for(const deck of cls.decks)for(const card of deck.cards)if(`${card.question} ${card.answer} ${deck.title} ${cls.title}`.toLowerCase().includes(query))matches.push({cls,deck,card});
  return `<div class="page-heading"><div><div class="eyebrow">A LITTLE EXPLORING</div><h1>Search your library</h1><p>${num(matches.length)} ${matches.length===1?'card':'cards'} found for “${esc(state.query)}”</p></div><button class="btn btn-secondary" data-action="clear-search">Clear search ${icon('close')}</button></div>${matches.length?matches.slice(0,100).map(({cls,deck,card})=>`<button class="card-result" style="width:100%;text-align:left" data-action="search-result" data-class="${esc(cls.id)}" data-id="${esc(deck.id)}"><strong>${esc(card.question)}</strong><p>${esc(card.answer)}</p><small>${esc(cls.title)} / ${esc(deck.title)}</small></button>`).join(''):emptyHtml('Nothing here just yet.','Try another word, a class name, or a phrase from an answer.')}${matches.length>100?'<p class="search-caption">Showing the first 100 matches. Add more words to narrow your search.</p>':''}${footerHtml()}`;
}
function progressHtml() {
  const cards=allCards(), days=Array.from({length:7},(_,i)=>{let d=new Date();d.setDate(d.getDate()-6+i);return {date:d,key:dateKey(d),count:state.library.activity.filter(a=>a.date===dateKey(d)).reduce((s,a)=>s+a.cards,0)};}),max=Math.max(10,...days.map(d=>d.count));
  const totalReviews=state.library.activity.reduce((s,a)=>s+a.cards,0);
  return `<div class="page-heading"><div><div class="eyebrow">ONE DAY AT A TIME</div><h1>Look how far you’ve come.</h1><p>Every card is a little investment in your future self.</p></div><button class="btn btn-primary" data-action="study-all">${icon('play')}Keep learning</button></div>${statsHtml()}<div class="progress-grid"><section class="panel"><h3>A little consistency.</h3><p>Flashcards studied over the last seven days.</p><div class="activity-chart" role="img" aria-label="${esc(days.map(d=>`${d.date.toLocaleDateString('en',{weekday:'long'})}: ${d.count} cards`).join(', '))}">${days.map((d,i)=>`<div class="activity-bar ${i===6?'today':''}" style="height:${Math.max(2,d.count/max*125)}px"><b>${d.count}</b><span>${d.date.toLocaleDateString('en',{weekday:'short'})}</span></div>`).join('')}</div></section><section class="panel"><h3>Getting to know your knowledge.</h3><p>Your cards, by confidence level.</p><div class="confidence-legend">${[0,1,2,3,4,5].map(r=>`<div class="confidence-legend-row" style="--rate:${rates[r]}"><i></i><span>${rateLabels[r]}</span><span>${num(cards.filter(c=>c.confidence===r).length)}</span></div>`).join('')}</div></section></div><div class="study-note">${icon('flame')}<div><strong>${totalReviews?`${num(totalReviews)} reviews. That’s knowledge taking root.`:'Your first study session is waiting.'}</strong><p>Your progress grows naturally as you review. A few minutes is all it takes to begin.</p></div><button data-action="settings">Set your daily goal ${icon('arrow')}</button></div>${footerHtml()}`;
}
function settingsHtml() {
  return `<div class="page-heading"><div><div class="eyebrow">MAKE YOURSELF AT HOME</div><h1>Your settings</h1><p>A study space that feels like yours.</p></div></div><div class="settings-stack"><section class="panel"><div class="settings-row"><div><h3>Your daily goal</h3><p>A manageable number of cards to keep the habit going.</p></div><label><span class="sr-only">Cards per day</span><input id="daily-goal" type="number" class="input" min="5" max="500" step="5" value="${state.library.settings.dailyGoal}"></label><button class="btn btn-secondary btn-sm" data-action="save-goal">Save goal</button></div></section>
  <section class="panel"><div class="settings-row"><div><h3>${state.user?'Your account':'Take your cards with you'}</h3><p>${state.user?`${esc(state.user.email)} · ${state.sync==='synced'?'Your private library is synced.':'Your library is saved on this device.'}`:'Sign in with your email and password to sync your library across devices.'}</p></div><button class="btn btn-secondary btn-sm" data-action="${state.user?'account':'login'}">${icon(state.user?'user':'cloud')}${state.user?'Manage account':'Log in or sign up'}</button></div>${state.sync==='error'?`<div class="settings-warning">Cloud sync needs attention. Your local copy is safe.<button class="btn btn-secondary btn-sm" style="margin-left:10px" data-action="retry-sync">Retry sync</button></div>`:''}</section>
  <section class="panel"><div class="settings-row"><div><h3>A copy for safekeeping</h3><p>Download all your classes, cards, and progress as a Flashlang backup.</p></div><button class="btn btn-secondary btn-sm" data-action="backup">${icon('download')}Export backup</button></div></section><section class="panel"><div class="settings-row"><div><h3>Bring your library back</h3><p>Restore a Flashlang JSON backup. You’ll review the details before replacing your library.</p></div><label class="btn btn-secondary btn-sm" tabindex="0">${icon('upload')}Choose backup<input class="backup-restore-input" id="restore-file" type="file" accept=".json,application/json"></label></div></section>
  ${!state.user?`<section class="panel"><div class="settings-row"><div><h3>A little inspiration</h3><p>Add the three example classes to explore how Flashlang works.</p></div><button class="btn btn-secondary btn-sm" data-action="add-examples">Add examples</button></div></section>`:''}</div>${footerHtml()}`;
}

function showModal(title,subtitle,body,{wide=false,cls=''}={}) {
  lastFocus=document.activeElement;
  $('#modal-root').innerHTML=`<div class="modal-backdrop" data-backdrop="true"><section class="modal ${wide?'modal-wide':''} ${cls}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><div><h2 id="modal-title">${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button></div><div class="modal-body">${body}</div></section></div>`;
  document.body.style.overflow='hidden';
  requestAnimationFrame(()=>{const target=$('#modal-root input:not([type=hidden]):not([type=file]), #modal-root textarea, #modal-root .btn');(target||$('#modal-root .icon-btn'))?.focus();});
}
function closeModal() {$('#modal-root').replaceChildren();document.body.style.overflow='';if(lastFocus?.isConnected)lastFocus.focus();}
function modalError(message) {let node=$('#modal-error');if(!node){node=document.createElement('div');node.id='modal-error';node.className='form-error';node.setAttribute('role','alert');$('#modal-root form, #modal-root .modal-body')?.append(node);}node.hidden=false;node.textContent=message;}
function modalSuccess(message) {const node=$('#modal-success');if(node){node.textContent=message;node.hidden=false;}else{const p=document.createElement('p');p.className='form-success';p.role='status';p.textContent=message;$('#modal-root .modal-body').append(p);}}
function classModal(edit=false) {
  const cls=edit?currentClass():null;
  showModal(edit?'A little fine-tuning.':'A new place to learn.',edit?'Make this class feel like yours.':'Group your decks around a subject, a goal, or a big idea.',`<form id="class-form" data-edit="${edit}"><div class="form-group"><label class="label" for="class-title">Class name</label><input class="input" id="class-title" name="title" placeholder="e.g. Italian essentials" value="${esc(cls?.title||'')}" maxlength="200" required></div><div class="form-group"><label class="label" for="class-description">A little description <span class="muted">(optional)</span></label><input class="input" id="class-description" name="description" placeholder="What are you curious about?" value="${esc(cls?.description||'')}" maxlength="1000"></div><div class="form-group"><span class="label">Choose a color</span><input type="hidden" id="class-color" name="color" value="${cls?.color||'blue'}"><div class="color-options">${Object.entries(colors).map(([name,c])=>`<button type="button" class="color-option ${(cls?.color||'blue')===name?'selected':''}" data-action="choose-color" data-color="${name}" style="--accent:${c.accent}" aria-label="${name}" aria-pressed="${(cls?.color||'blue')===name}">${(cls?.color||'blue')===name?icon('check'):''}</button>`).join('')}</div></div><div id="modal-error" class="form-error" role="alert" hidden></div><div class="form-actions">${edit?'<button type="button" class="btn btn-danger btn-sm" data-action="delete-class">Delete class</button>':''}<button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${edit?'Save changes':'Create class'}${icon('arrow')}</button></div></form>`);
}
function deckModal(edit=false) {
  if(!currentClass())return classModal();
  showModal(edit?'A little fine-tuning.':'One deck. A little more knowledge.',`In ${currentClass().title}`,`<form id="deck-form" data-edit="${edit}"><div class="form-group"><label class="label" for="deck-title">Deck name</label><input class="input" id="deck-title" name="title" placeholder="e.g. Everyday expressions" value="${esc(edit?currentDeck().title:'')}" maxlength="200" required></div><div id="modal-error" class="form-error" role="alert" hidden></div><div class="form-actions">${edit?'<button type="button" class="btn btn-danger btn-sm" data-action="delete-deck">Delete deck</button>':''}<button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">${edit?'Save changes':'Create deck'}${icon('arrow')}</button></div></form>`);
}
function cardModal(id=null) {
  const deck=currentDeck();if(!deck)return;
  const card=deck.cards.find(c=>c.id===id);
  showModal(card?'Make it a little clearer.':'A question worth remembering.',card?'Edit your flashcard.':'Keep it simple. One idea per card is a great start.',`<form id="card-form" data-id="${id||''}"><div class="form-group"><label class="label" for="card-question">Question / front</label><textarea class="input" id="card-question" name="question" placeholder="What would you like to remember?" maxlength="20000" required>${esc(card?.question||'')}</textarea></div><div class="form-group"><label class="label" for="card-answer">Answer / back</label><textarea class="input" id="card-answer" name="answer" placeholder="The answer, in your own words…" maxlength="20000" required>${esc(card?.answer||'')}</textarea></div><div id="modal-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button type="button" class="btn btn-quiet" data-action="close-modal">Cancel</button>${!card?'<button type="submit" name="keepAdding" value="yes" class="btn btn-secondary">Save & add another</button>':''}<button class="btn btn-primary" type="submit">${card?'Save changes':'Add card'}${icon('check')}</button></div></form>`,{wide:true});
}
function confirmModal(title,description,onConfirm,label='Delete') {
  showModal(title,description,`<div class="form-actions"><button class="btn btn-secondary" data-action="close-modal">Cancel</button><button class="btn btn-danger" id="confirm-action">${esc(label)}</button></div>`);
  $('#confirm-action').addEventListener('click',()=>{onConfirm();closeModal();});
}
function importModal(reuse=false) {
  if(!reuse)state.importDraft={text:'',format:'auto',classId:currentClass()?.id||state.library.classes[0]?.id||'__new__',deckTitle:'Imported cards',newClassTitle:'',append:Boolean(currentDeck()),filename:''};
  const draft=state.importDraft;
  showModal('Good cards. A fresh start.','Bring your flashcards over. We’ll make sure everything looks right before importing.',`<form id="import-form"><label class="file-drop" id="file-drop">${icon('upload')}<strong id="file-drop-text">${draft.filename?esc(draft.filename):'Choose a file, or drop it here'}</strong><small>CSV, TSV, TXT, or JSON · up to 5 MB</small><input id="import-file" type="file" accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json" aria-label="Choose a flashcard file"></label><div class="import-or">OR PASTE YOUR CARDS</div><label class="sr-only" for="import-text">Flashcard text</label><textarea class="input import-text" id="import-text" name="text" spellcheck="false" placeholder="Question,Answer&#10;What does buongiorno mean?,Good morning&#10;How do you say thank you?,Grazie">${esc(draft.text)}</textarea><div class="import-tools"><a href="./samples/cards.csv" download>Download an example CSV ${icon('download')}</a><label><span class="sr-only">Import format</span><select id="import-format"><option value="auto">Detect format automatically</option><option value="csv">Comma separated (CSV)</option><option value="tsv">Tab separated (TSV)</option><option value="semicolon">Semicolon separated</option><option value="pipe">Pipe separated</option><option value="json">JSON</option><option value="qa">Q: / A: blocks</option></select></label></div><div class="two-col"><div class="form-group"><label class="label" for="import-class">Add to class</label><select class="input" id="import-class">${state.library.classes.map(c=>`<option value="${esc(c.id)}" ${draft.classId===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}<option value="__new__" ${draft.classId==='__new__'?'selected':''}>+ Create a new class</option></select></div><div class="form-group"><label class="label" for="import-deck-title">New deck name</label><input class="input" id="import-deck-title" value="${esc(draft.deckTitle)}" maxlength="200" ${draft.append?'disabled':''}></div></div><div class="form-group" id="import-new-class-group" ${draft.classId!=='__new__'?'hidden':''}><label class="label" for="import-new-class">New class name</label><input class="input" id="import-new-class" placeholder="e.g. Languages" value="${esc(draft.newClassTitle)}" maxlength="200"></div>${currentDeck()?`<label class="small muted" style="display:flex;align-items:center;gap:8px;line-height:1.7"><input type="checkbox" id="import-append" ${draft.append?'checked':''}>Add to the current deck (${esc(currentDeck().title)})</label>`:''}<div class="field-hint" style="margin-top:17px">One question and answer per row. Paste directly from a spreadsheet, an Anki text export, or a two-column list. Quoted, multiline CSV fields are supported.</div><div id="modal-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="btn btn-quiet" type="button" data-action="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Preview cards ${icon('arrow')}</button></div></form>`,{wide:true});
  $('#import-format').value=draft.format;
  const drop=$('#file-drop');
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('dragging');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragging');if(e.dataTransfer.files[0])loadImportFile(e.dataTransfer.files[0]);});
}
async function loadImportFile(file) {
  if(file.size>5*1024*1024)return modalError('This file is over 5 MB. Split it into smaller decks and try again.');
  if(!/\.(csv|tsv|txt|json)$/i.test(file.name))return modalError('Please choose a CSV, TSV, TXT, or JSON file.');
  const generation=authGeneration,draft=state.importDraft;
  try {
    const content=await file.text();if(!$('#import-text')||authGeneration!==generation||state.importDraft!==draft)return;
    $('#import-text').value=content;$('#file-drop-text').textContent=file.name;
    const extension=file.name.split('.').pop().toLowerCase();$('#import-format').value=['csv','tsv','json'].includes(extension)?extension:'auto';
    state.importDraft.filename=file.name;
    if($('#import-deck-title').value==='Imported cards')$('#import-deck-title').value=file.name.replace(/\.[^.]+$/,'').slice(0,200);
    $('#modal-error').hidden=true;
  }catch{modalError('This file couldn’t be read. Try copying and pasting the text instead.');}
}
function previewImport() {
  const draft=state.importDraft;
  Object.assign(draft,{text:$('#import-text').value,format:$('#import-format').value,classId:$('#import-class').value,deckTitle:$('#import-deck-title').value.trim(),newClassTitle:$('#import-new-class').value.trim(),append:$('#import-append')?.checked||false});
  if(draft.append)draft.classId=state.classId;
  if(draft.classId==='__new__'&&!draft.newClassTitle)return modalError('Give your new class a name.');
  if(!draft.append&&!draft.deckTitle)return modalError('Give your new deck a name.');
  if(draft.text.length>5*1024*1024)return modalError('This import is too large. Please keep it under 5 MB.');
  try{draft.parsed=parseImport(draft.text,draft.format);}catch(error){modalError(error.message);return;}
  const seen=new Set(draft.append?(currentDeck()?.cards||[]).map(c=>JSON.stringify([c.question,c.answer])):[]);
  const originalCount=draft.parsed.cards.length;
  draft.parsed.cards=draft.parsed.cards.filter(c=>{const key=JSON.stringify([c.question,c.answer]);if(seen.has(key))return false;seen.add(key);return true;});
  const skipped=originalCount-draft.parsed.cards.length;
  draft.parsed.warnings=draft.parsed.warnings.filter(w=>!w.includes('duplicate'));
  if(skipped)draft.parsed.warnings.push(`${skipped} duplicate ${skipped===1?'card will':'cards will'} be skipped.`);
  if(!draft.parsed.cards.length)return modalError('These cards are already in your deck. No duplicates will be added.');
  const {cards,warnings,format}=draft.parsed;
  const targetClass=draft.classId==='__new__'?draft.newClassTitle:state.library.classes.find(c=>c.id===draft.classId)?.title;
  showModal('Looking good. Ready to import?','A quick look before your cards find their new home.',`<div class="import-preview-summary">${icon('check')}<strong>${num(cards.length)} ${cards.length===1?'card':'cards'} ready</strong><span>· ${esc(format.toUpperCase())}</span></div><div class="field-hint" style="margin-bottom:15px">${esc(targetClass)} / ${esc(draft.append?currentDeck()?.title:draft.deckTitle)}</div><div class="preview-table-wrap"><table class="preview-table"><thead><tr><th>Question / front</th><th>Answer / back</th></tr></thead><tbody>${cards.slice(0,50).map(c=>`<tr><td>${esc(c.question)}</td><td>${esc(c.answer)}</td></tr>`).join('')}</tbody></table></div>${cards.length>50?'<p class="field-hint">Showing the first 50 cards. All valid cards will be imported.</p>':''}${warnings.length?`<div class="settings-warning">${warnings.map(esc).join('<br>')}</div>`:''}<div id="modal-error" class="form-error" role="alert" hidden></div><div class="form-actions"><button class="btn btn-secondary" data-action="import-back">${icon('back')}Go back</button><button class="btn btn-primary" data-action="confirm-import">Import ${num(cards.length)} cards ${icon('check')}</button></div>`,{wide:true});
}
function finishImport() {
  const draft=state.importDraft;if(!draft?.parsed)return;
  let cls=state.library.classes.find(c=>c.id===draft.classId);
  if(!cls){cls={id:newId(),title:draft.newClassTitle,description:'',color:'blue',icon:'book',createdAt:new Date().toISOString(),decks:[]};state.library.classes.unshift(cls);}
  let deck=draft.append?currentDeck():null;
  if(!deck){deck={id:newId(),title:draft.deckTitle,cards:[],createdAt:new Date().toISOString()};cls.decks.push(deck);}
  const existing=new Set(deck.cards.map(c=>JSON.stringify([c.question,c.answer])));
  const newCards=draft.parsed.cards.filter(c=>{const key=JSON.stringify([c.question,c.answer]);if(existing.has(key))return false;existing.add(key);return true;}).map(c=>newCard(c.question,c.answer));
  deck.cards.push(...newCards);persist();closeModal();navigate('deck',cls.id,deck.id);state.importDraft=null;
  toast(newCards.length?`${num(newCards.length)} cards imported. Your next chapter is ready.`:'These cards are already in your deck. No duplicates added.');
}
function authModal(mode='login') {
  state.authMode=mode;
  const configured=isCloudConfigured();
  if(mode==='forgot'&&globalThis.APP_CONFIG?.resetEmailsEnabled===false){showModal('Need a fresh start?','Password reset email isn’t available yet.',`<div class="setup-notice"><p>The site owner hasn’t connected a password reset email service yet. Please contact them for help getting back into your account.</p></div><button class="btn btn-secondary btn-wide" data-action="login">Back to log in</button>`);return;}
  const titles={login:'Welcome back.',signup:'A little space. A lot of possibility.',forgot:'Let’s get you back in.',reset:'A fresh start for your password.'};
  const intro={login:'Your cards, your progress, your next big idea. All right here.',signup:'Just your email, a password, and a little curiosity.',forgot:'We’ll send you a link to reset your password.',reset:'Choose a new password for your Flashlang account.'};
  const form=configured?`<form id="auth-form"><p class="auth-intro">${intro[mode]}</p>${mode!=='reset'?`<div class="form-group"><label class="label" for="auth-email">Email address</label><div class="auth-icon">${icon('mail')}<input class="input" id="auth-email" name="email" type="email" placeholder="you@example.com" autocomplete="email" required></div></div>`:''}${mode!=='forgot'?`<div class="form-group"><label class="label" for="auth-password">${mode==='reset'?'New password':'Password'}</label><div class="auth-icon">${icon('lock')}<input class="input" id="auth-password" name="password" type="password" placeholder="${mode==='login'?'Your password':'At least 8 characters'}" autocomplete="${mode==='login'?'current-password':'new-password'}" ${mode==='login'?'':'minlength="8"'} maxlength="128" required></div>${mode==='signup'?'<p class="field-hint">At least 8 characters. Make it something only you know.</p>':''}</div>`:''}${mode==='login'?'<div class="forgot-row"><button type="button" class="text-link" data-action="forgot-password">Forgot your password?</button></div>':''}<div id="modal-error" class="form-error" role="alert" hidden></div><div id="modal-success" class="form-success" role="status" hidden></div><button class="btn btn-primary btn-wide" type="submit" id="auth-submit">${{login:'Log in',signup:'Create account',forgot:'Send reset link',reset:'Save new password'}[mode]}${icon('arrow')}</button></form><div class="auth-switch">${mode==='login'?`New around here? <button class="text-link" data-action="signup">Create an account</button>`:mode==='signup'?`Already have an account? <button class="text-link" data-action="login">Log in</button>`:`<button class="text-link" data-action="login">Back to log in</button>`}</div>`:`<p class="auth-intro">${intro[mode]}</p><div class="setup-notice"><strong>Cloud accounts aren’t connected yet.</strong><p>The owner needs to connect this site to its Supabase project before you can create an account or log in. You can already import, edit, and study cards on this device.</p></div><button class="btn btn-primary btn-wide" data-action="close-modal">Continue on this device ${icon('arrow')}</button><p class="field-hint" style="text-align:center;margin-top:17px">Local cards stay in this browser. Export a backup in Settings to keep a copy.</p>`;
  showModal(titles[mode],'',`<div class="auth-brand">${logo}<span>flashlang<span style="color:var(--orange)">.</span></span></div>${form}`,{cls:'auth-modal'});
}
async function handleAuth(form) {
  const btn=$('#auth-submit'), mode=state.authMode, email=form.elements.email?.value.trim(),password=form.elements.password?.value;
  btn.disabled=true;btn.textContent='One moment…';$('#modal-error').hidden=true;$('#modal-success').hidden=true;
  try {
    const client=await getCloudClient();let result;
    if(mode==='signup')result=await client.auth.signUp({email,password,options:{emailRedirectTo:getAuthRedirectUrl()}});
    if(mode==='login')result=await client.auth.signInWithPassword({email,password});
    if(mode==='forgot')result=await client.auth.resetPasswordForEmail(email,{redirectTo:getAuthRedirectUrl()});
    if(mode==='reset')result=await client.auth.updateUser({password});
    if(result.error)throw result.error;
    if(mode==='forgot'){modalSuccess('If an account exists for this email, you’ll receive a reset link. Check your inbox.');}
    else if(mode==='signup'&&!result.data.session){modalSuccess('Check your email to confirm your account, then come back to log in.');}
    else if(mode==='reset'){closeModal();toast('Your password has been updated.');}
    else{closeModal();await activateUser(result.data.session?.user||result.data.user);toast(mode==='signup'?'Your study space is ready.':'Welcome back. Let’s make a little progress.');}
  }catch(error){modalError(error.message||'Something went wrong. Please try again.');}
  finally{if(btn.isConnected){btn.disabled=false;btn.innerHTML=`${{login:'Log in',signup:'Create account',forgot:'Send reset link',reset:'Save new password'}[mode]}${icon('arrow')}`;}}
}
function accountModal() {
  if(!state.user)return authModal();
  showModal('Your little corner of Flashlang.','A private home for what you’re learning.',`<div class="setup-notice"><strong>${esc(state.user.email)}</strong><p>${state.sync==='synced'?'Your cards and progress are synced to your private account.':'Your latest work is saved on this device. Check Settings for sync status.'}</p></div><div class="form-actions"><button class="btn btn-secondary" data-action="settings-from-modal">Settings</button><button class="btn btn-primary" data-action="logout">${icon('logout')}Log out</button></div>`);
}
function helpModal() {
  showModal('A little practice. A lasting memory.','A simple rhythm for learning something well.',`<div class="help-steps"><div class="help-step"><span class="step-number">1</span><div><strong>Give your knowledge a home.</strong><p>Create a class, add a deck, then write your own flashcards or import a list. A CSV or tab-separated spreadsheet works beautifully.</p></div></div><div class="help-step"><span class="step-number">2</span><div><strong>Try to remember before you look.</strong><p>Read the question, take a breath, and recall the answer. Then reveal it. The effort is part of what makes it stick.</p></div></div><div class="help-step"><span class="step-number">3</span><div><strong>Tell us how well you knew it.</strong><p>Rate your confidence from 1 to 5. Tricky cards return sooner; familiar ones get a little more space. A session includes up to 20 cards.</p><div class="rating-guide">${[1,2,3,4,5].map(r=>`<span style="--rate:${rates[r]}">${r}${r===1?' · Not yet':r===5?' · Got it!':''}</span>`).join('')}</div></div></div></div><div class="form-actions"><button class="btn btn-primary" data-action="close-modal">Got it ${icon('check')}</button></div>`);
}

function startStudy(scope='all',id=null) {
  if(state.cloudLoading||state.cloudError)return toast('Let your library finish loading first.',true);
  const pool=[];
  for(const cls of state.library.classes){if(scope==='class'&&cls.id!==(id||state.classId))continue;for(const deck of cls.decks){if(scope==='deck'&&deck.id!==id)continue;for(const card of deck.cards)pool.push({cls,deck,card});}}
  if(!pool.length)return toast('Add a few cards first. A little knowledge starts somewhere.');
  const selected=selectStudyCards(pool.map(p=>p.card),{limit:20});
  const byId=new Map(pool.map(p=>[p.card.id,p]));
  const items=selected.map(card=>byId.get(card.id));
  if(!items.length)return toast('You’re all caught up. Come back a little later.');
  state.study={items,index:0,revealed:false,ratings:[],seconds:0,lastReviewAt:Date.now(),scope,scopeId:id,title:scope==='deck'?items[0].deck.title:scope==='class'?items[0].cls.title:'A little of everything',subtitle:scope==='deck'?items[0].cls.title:'Your personal study session'};
  closeModal();render();window.scrollTo({top:0,behavior:'instant'});
}
function studyCard() {const s=state.study;return s&&s.index<s.items.length?s.items[s.index].deck.cards.find(c=>c.id===s.items[s.index].card.id):null;}
function renderStudy() {
  const s=state.study,done=s.index>=s.items.length,card=studyCard();
  if(!done&&!card){s.index++;return renderStudy();}
  const content=card?(s.revealed?card.answer:card.question):'';
  $('#app').innerHTML=`<div class="study-layout"><header class="study-topbar"><button class="back-link" data-action="exit-study">${icon('back')}<span>Back to library</span></button><div class="study-title"><strong>${esc(s.title)}</strong><span>${esc(s.subtitle)}</span></div><span class="study-session-count">${s.ratings.length?'<b class="session-xp">+'+(s.ratings.length*10)+' XP</b>':''}${done?'Session complete':`${s.index+1} / ${s.items.length}`}</span></header><main id="main" class="session-main" tabindex="-1">${done?summaryHtml():`<div class="session-progress"><div class="mastery-track"><span style="width:${s.index/s.items.length*100}%;background:#79b0ce"></span></div><span>${Math.round(s.index/s.items.length*100)}%</span></div><article class="flashcard" aria-live="polite"><div class="flashcard-top"><span class="flashcard-side"><b>${s.revealed?'A':'Q'}</b>${s.revealed?'THE ANSWER':'A LITTLE CHALLENGE'}</span><button class="icon-btn ${card.starred?'starred':''}" data-action="star-study" aria-label="${card.starred?'Unstar this card':'Star this card'}" aria-pressed="${card.starred}">${icon('star')}</button></div>${s.revealed?`<div class="card-content ${content.length>180?'long-text':''}">${esc(content)}</div>`:`<button class="card-content flashcard-tap ${content.length>180?'long-text':''}" data-action="reveal" aria-label="${esc(content)}. Tap to reveal the answer.">${esc(content)}</button>`}${s.revealed?`<div class="answer-divider">${esc(card.question)}</div>`:''}<div class="flashcard-bottom"><span>${esc(s.items[s.index].deck.title)}</span><span>${card.reviewCount?'Seen '+card.reviewCount+' '+(card.reviewCount===1?'time':'times'):'A new little discovery'}</span></div></article><div class="study-controls">${s.revealed?`<p class="rating-question">How well did you know it?</p><div class="rating-buttons">${[1,2,3,4,5].map(r=>`<button class="rating-button" style="--rate:${rates[r]}" data-action="rate" data-rating="${r}" aria-label="${r}: ${rateLabels[r]}"><b>${r}</b><span>${rateLabels[r]}</span></button>`).join('')}</div><p class="keyboard-hint">Press <kbd>1</kbd>–<kbd>5</kbd> to rate your confidence</p>`:`<button class="btn btn-blue reveal-btn" data-action="reveal">Reveal answer ${icon('flip')}</button><p class="keyboard-hint">Press <kbd>Space</kbd> to reveal the answer</p>`}</div>`}</main><footer class="study-footer">${icon('leaf')}A little effort today. A little more knowledge tomorrow.<br>Your progress is saved as you go.</footer></div>`;
}
function reviewCard(rating) {
  const s=state.study;if(!s?.revealed||s.index>=s.items.length)return;
  const {deck}=s.items[s.index], card=studyCard(),now=new Date();
  const updated=scheduleReview(card,rating,now);deck.cards[deck.cards.findIndex(c=>c.id===card.id)]=updated;
  const seconds=Math.min(300,Math.max(1,Math.round((Date.now()-s.lastReviewAt)/1000)));s.seconds+=seconds;s.lastReviewAt=Date.now();
  let activity=state.library.activity.find(a=>a.date===dateKey(now));if(!activity){activity={id:newId(),date:dateKey(now),cards:0,seconds:0};state.library.activity.push(activity);}activity.cards++;activity.seconds+=seconds;
  s.ratings.push(rating);navigator.vibrate?.(10);s.index++;s.revealed=false;persist();renderStudy();
  if(s.index>=s.items.length)queueCloudSave();
}
function summaryHtml() {
  const s=state.study,count=s.ratings.length,average=count?s.ratings.reduce((a,b)=>a+b,0)/count:0;
  return `<section class="session-summary"><div class="celebration" aria-hidden="true"><i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i><i style="--i:3"></i><i style="--i:4"></i><i style="--i:5"></i><i style="--i:6"></i><i style="--i:7"></i><i style="--i:8"></i><i style="--i:9"></i><i style="--i:10"></i><i style="--i:11"></i></div><div class="summary-icon">${icon('check')}</div><div class="eyebrow">A LITTLE WISER THAN BEFORE</div><h1>That’s progress. Yours.</h1><div class="earned-xp">${icon('spark')} +${count*10} XP earned</div><p>A few minutes well spent.<br>The tricky cards will be here when you’re ready to meet them again.</p><div class="summary-stats"><div><strong>${count}</strong><span>Cards studied</span></div><div><strong>${Math.max(1,Math.round(s.seconds/60))} min</strong><span>Time invested</span></div><div><strong>${average.toFixed(1)} / 5</strong><span>Avg. confidence</span></div></div><div class="summary-actions"><button class="btn btn-secondary" data-action="exit-study">Back to my library</button><button class="btn btn-primary" data-action="study-again">Keep learning ${icon('arrow')}</button></div></section>`;
}
function exitStudy() {state.study=null;render();window.scrollTo({top:0,behavior:'instant'});}

async function activateUser(user,force=false) {
  if(!user)return;
  if(!force&&boundUserId===user.id)return;
  boundUserId=user.id;const generation=++authGeneration;clearTimeout(cloudTimer);closeModal();state.importDraft=null;state.pendingConflict=null;
  state.user=user;state.cloudReady=false;state.cloudLoading=true;state.cloudError='';state.sync='loading';state.study=null;state.dirty=false;state.revision=0;state.library=emptyLibrary();render();
  try {
    const remote=await loadCloudLibrary(user.id);if(generation!==authGeneration)return;
    const cloudLibrary=remote?validateLibrary(remote):null,localLibrary=readLocal(user.id),localSync=readLocalSync(user.id);
    state.revision=localSync.revision;
    if(localSync.dirty&&localLibrary&&cloudLibrary&&JSON.stringify(localLibrary)!==JSON.stringify(cloudLibrary)){
      state.library=localLibrary;state.dirty=true;state.cloudLoading=false;state.sync='error';render();
      resolveLibraryConflict(localLibrary,cloudLibrary,user.id,generation);return;
    }
    state.library=localSync.dirty&&localLibrary?localLibrary:(cloudLibrary||localLibrary||emptyLibrary());
    state.dirty=localSync.dirty&&!cloudLibrary;state.cloudReady=true;state.cloudLoading=false;state.sync=state.dirty?'saving':'synced';writeLocal();render();
    if(state.dirty)await queueCloudSave();
    else if(!remote){await queueCloudSave();if(generation!==authGeneration)return;const guest=readLocal();if(guest?.classes.length&&!localLibrary?.classes.length)offerGuestImport(guest);}
  }catch(error){if(generation!==authGeneration)return;state.cloudLoading=false;state.cloudError=error.message||'Please check your connection and try again.';state.sync='error';render();}
}
function resolveLibraryConflict(localLibrary,cloudLibrary,userId,generation) {
  const describe=library=>`${library.classes.length} classes, ${library.classes.flatMap(c=>c.decks.flatMap(d=>d.cards)).length} cards`;
  showModal('Some cards are waiting to sync.','This device has changes that didn’t reach your account.',`<div class="setup-notice"><strong>On this device: ${describe(localLibrary)}</strong><p>In your account: ${describe(cloudLibrary)}. Choose the library you want to keep. Keeping this device’s library replaces the account copy; using the account copy replaces this device’s copy.</p></div><button class="text-link small" id="download-unsynced">Download this device’s backup first</button><div class="form-actions"><button class="btn btn-secondary" id="use-cloud-library">Use account copy</button><button class="btn btn-primary" id="use-local-library">Keep this device’s changes</button></div>`);
  $('#download-unsynced').onclick=()=>download(`recall-unsynced-${dateKey()}.json`,JSON.stringify(localLibrary,null,2),'application/json');
  const choose=async local=>{if(generation!==authGeneration||state.user?.id!==userId)return;state.library=local?localLibrary:cloudLibrary;state.cloudReady=true;state.pendingConflict=null;state.dirty=local;state.sync=local?'saving':'synced';writeLocal();closeModal();render();if(local)await queueCloudSave();};
  $('#use-cloud-library').onclick=()=>choose(false);$('#use-local-library').onclick=()=>choose(true);
  // Leave the local copy available if the dialog is dismissed. Settings offers a way back.
  state.pendingConflict={localLibrary,cloudLibrary,userId,generation};
}
function offerGuestImport(guest) {
  showModal('Your cards can come too.','There’s already a library saved on this device.',`<div class="setup-notice"><strong>${guest.classes.length} ${guest.classes.length===1?'class':'classes'} · ${guest.classes.flatMap(c=>c.decks.flatMap(d=>d.cards)).length} flashcards</strong><p>Bring these classes and their study progress into your new private account, or start with a clean space.</p></div><div class="form-actions"><button class="btn btn-secondary" data-action="close-modal">Start fresh</button><button class="btn btn-primary" id="bring-guest">Bring my cards ${icon('arrow')}</button></div>`);
  $('#bring-guest').addEventListener('click',()=>{state.library=structuredClone(guest);persist();closeModal();render();toast('Your cards are right at home.');});
}
async function logout() {
  if(!state.user)return;
  const button=$('[data-action="logout"]');if(button)button.disabled=true;
  try {
    await queueCloudSave();const client=await getCloudClient();const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
    resetGuest();closeModal();toast('You’re logged out. Your account library stays private.');
  }catch(error){toast(error.message||'Couldn’t log out. Please try again.',true);if(button?.isConnected)button.disabled=false;}
}
function resetGuest() {
  authGeneration++;boundUserId=null;clearTimeout(cloudTimer);closeModal();state.importDraft=null;state.pendingConflict=null;state.dirty=false;state.revision=0;state.user=null;state.cloudReady=false;state.cloudLoading=false;state.cloudError='';state.sync='local';state.library=readLocal()||exampleLibrary();state.study=null;state.query='';state.view='library';state.classId=null;state.deckId=null;render();
}
async function initCloud() {
  if(!isCloudConfigured())return;
  try {
    const client=await getCloudClient();
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='PASSWORD_RECOVERY'){setTimeout(()=>{if(session?.user)activateUser(session.user);authModal('reset');},0);return;}
      if(event==='SIGNED_OUT'){setTimeout(resetGuest,0);return;}
      if(session?.user&&boundUserId!==session.user.id)setTimeout(()=>activateUser(session.user),0);
    });
    const {data,error}=await client.auth.getSession();if(error)throw error;if(data.session?.user)await activateUser(data.session.user);
  }catch(error){toast('Accounts couldn’t connect. Local study is still available. '+error.message,true);}
}
function download(filename,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function restoreFile(file) {
  if(!file)return;if(file.size>25*1024*1024)return toast('This backup is over 25 MB. Please choose a smaller file.',true);
  const generation=authGeneration;
  try {
    const restored=validateLibrary(JSON.parse(await file.text()));if(generation!==authGeneration)return;
    const count=restored.classes.flatMap(c=>c.decks.flatMap(d=>d.cards)).length;
    confirmModal('Give this library a new home?',`Restore ${restored.classes.length} classes and ${num(count)} cards. This replaces your current library. Export your current backup first if you’d like to keep it.`,()=>{state.library=restored;persist();navigate();toast('Your library is right at home.');},'Restore library');
  }catch(error){toast(error instanceof SyntaxError?'This file isn’t valid JSON. Choose a Flashlang backup.':error.message,true);}
}

const actions = {
  library:()=>navigate(),progress:()=>navigate('progress'),settings:()=>navigate('settings'),class:el=>{state.filter='all';navigate('class',el.dataset.id);},deck:el=>{state.filter='all';navigate('deck',state.classId,el.dataset.id);},
  'search-result':el=>navigate('deck',el.dataset.class,el.dataset.id),'clear-search':()=>{state.query='';$('#global-search').value='';renderContent();},
  'toggle-menu':()=>{state.mobile=!state.mobile;render();},'new-class':()=>classModal(),'edit-class':()=>classModal(true),'new-deck':()=>deckModal(),'edit-deck':()=>deckModal(true),'new-card':()=>cardModal(),'edit-card':el=>cardModal(el.dataset.id),
  'choose-color':el=>{const name=el.dataset.color;$('#class-color').value=name;document.querySelectorAll('.color-option').forEach(b=>{const selected=b.dataset.color===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);b.innerHTML=selected?icon('check'):'';});},
  'delete-class':()=>{const cls=currentClass();confirmModal('Let this class go?',`“${cls.title}” and all its decks and cards will be deleted. Export a backup first if you want to keep a copy.`,()=>{state.library.classes=state.library.classes.filter(c=>c.id!==cls.id);persist();navigate();toast('Class deleted.');});},
  'delete-deck':()=>{const cls=currentClass(),deck=currentDeck();confirmModal('Let this deck go?',`“${deck.title}” and its ${deck.cards.length} cards will be deleted.`,()=>{cls.decks=cls.decks.filter(d=>d.id!==deck.id);persist();navigate('class',cls.id);toast('Deck deleted.');});},
  'delete-card':el=>{const deck=currentDeck(),id=el.dataset.id;confirmModal('Let this card go?','This flashcard and its study progress will be deleted.',()=>{deck.cards=deck.cards.filter(c=>c.id!==id);persist();renderContent();toast('Card deleted.');});},
  'star-card':el=>{const card=currentDeck()?.cards.find(c=>c.id===el.dataset.id);if(card){card.starred=!card.starred;persist();renderContent();}},
  'star-study':()=>{const card=studyCard();if(card){card.starred=!card.starred;persist();renderStudy();}},
  'more-cards':()=>{state.visibleCards+=100;renderContent();},
  import:()=>importModal(),'import-back':()=>importModal(true),'confirm-import':finishImport,
  login:()=>authModal(),'signup':()=>authModal('signup'),'forgot-password':()=>authModal('forgot'),account:accountModal,logout,
  'settings-from-modal':()=>{closeModal();navigate('settings');},'close-modal':closeModal,help:helpModal,
  'study-all':()=>startStudy(),'study-class':()=>startStudy('class',state.classId),'study-deck':el=>startStudy('deck',el.dataset.id||state.deckId),
  reveal:()=>{if(state.study){state.study.revealed=true;renderStudy();}},rate:el=>reviewCard(Number(el.dataset.rating)),'exit-study':exitStudy,
  'study-again':()=>{const s=state.study;state.study=null;startStudy(s.scope,s.scopeId);},
  'save-goal':()=>{const value=Number($('#daily-goal').value);if(!Number.isInteger(value)||value<5||value>500)return toast('Choose a daily goal between 5 and 500 cards.',true);state.library.settings.dailyGoal=value;persist();render();toast('A little goal, made for you.');},
  backup:()=>{download(`recall-backup-${dateKey()}.json`,JSON.stringify(state.library,null,2),'application/json');toast('Your backup is ready. Keep it somewhere safe.');},
  'export-deck':()=>{const deck=currentDeck();download(`${deck.title.replace(/[^a-z0-9_-]/gi,'-')}.csv`,toCsv(deck.cards),'text/csv;charset=utf-8');toast('Your deck is ready to take with you.');},
  'add-examples':()=>{const examples=exampleLibrary();const existing=new Set(state.library.classes.map(c=>c.title));const additions=examples.classes.filter(c=>!existing.has(c.title));if(!additions.length)return toast('Your example classes are already here.');state.library.classes.push(...additions);persist();render();toast('A little inspiration, added to your library.');},
  'retry-sync':()=>{if(state.pendingConflict){const p=state.pendingConflict;return resolveLibraryConflict(state.library,p.cloudLibrary,p.userId,p.generation);}state.sync='saving';renderContent();updateStatus();queueCloudSave();},'retry-load':()=>activateUser(state.user,true)
};

document.addEventListener('click',event=>{
  const el=event.target.closest('[data-action]');
  if(el){const action=el.dataset.action;if(actions[action]){event.preventDefault();if((state.cloudLoading||state.cloudError)&&['new-class','edit-class','new-deck','edit-deck','new-card','edit-card','import','backup','add-examples','save-goal'].includes(action))return toast('Load your account library before making changes.',true);Promise.resolve(actions[action](el)).catch(error=>toast(error.message||'Something went wrong. Please try again.',true));}}
  else if(event.target.matches('[data-backdrop]'))closeModal();
});
document.addEventListener('submit',event=>{
  const form=event.target;event.preventDefault();
  try{
    if(form.id==='class-form'){
      const values=new FormData(form),title=values.get('title').trim();if(!title)return modalError('Give your class a name.');
      if(form.dataset.edit==='true'){Object.assign(currentClass(),{title,description:values.get('description').trim(),color:values.get('color')});persist();closeModal();render();toast('A little update, saved.');}
      else{const cls={id:newId(),title,description:values.get('description').trim(),color:values.get('color'),icon:'book',createdAt:new Date().toISOString(),decks:[]};state.library.classes.unshift(cls);persist();closeModal();navigate('class',cls.id);toast('A new class. A new possibility.');}
    }
    if(form.id==='deck-form'){
      const title=new FormData(form).get('title').trim();if(!title)return modalError('Give your deck a name.');
      if(form.dataset.edit==='true'){currentDeck().title=title;persist();closeModal();render();toast('Deck updated.');}
      else{const deck={id:newId(),title,cards:[],createdAt:new Date().toISOString()};currentClass().decks.push(deck);persist();closeModal();navigate('deck',state.classId,deck.id);toast('Your deck is ready for its first card.');}
    }
    if(form.id==='card-form'){
      const data=new FormData(form),question=data.get('question').trim(),answer=data.get('answer').trim();if(!question||!answer)return modalError('A card needs both a question and an answer.');
      const deck=currentDeck();if(form.dataset.id){const card=deck.cards.find(c=>c.id===form.dataset.id);card.question=question;card.answer=answer;}else deck.cards.push(newCard(question,answer));
      persist();if(event.submitter?.value==='yes'){form.reset();$('#card-question').focus();renderContent();toast('Card saved. Room for one more.');}else{closeModal();renderContent();toast(form.dataset.id?'Card updated. A little clearer.':'One more thing to remember.');}
    }
    if(form.id==='import-form')previewImport();
    if(form.id==='auth-form')handleAuth(form);
  }catch(error){modalError(error.message);}
});
document.addEventListener('input',event=>{if(event.target.id==='global-search'){state.query=event.target.value;renderContent();}});
document.addEventListener('change',event=>{
  const el=event.target;
  if(el.id==='class-sort'){state.sort=el.value;renderContent();}
  if(el.id==='card-filter'){state.filter=el.value;state.visibleCards=100;renderContent();}
  if(el.id==='import-file'&&el.files[0])loadImportFile(el.files[0]);
  if(el.id==='import-class'){$('#import-new-class-group').hidden=el.value!=='__new__';if($('#import-append')&&el.value!==state.classId){$('#import-append').checked=false;$('#import-deck-title').disabled=false;}}
  if(el.id==='import-append'){$('#import-deck-title').disabled=el.checked;if(el.checked){$('#import-class').value=state.classId;$('#import-new-class-group').hidden=true;}}
  if(el.id==='restore-file')restoreFile(el.files[0]);
});
document.addEventListener('keydown',event=>{
  const modal=$('#modal-root .modal');
  if(modal){
    if(event.key==='Escape'){event.preventDefault();closeModal();return;}
    if(event.key==='Tab'){const focusables=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);const first=focusables[0],last=focusables.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
    return;
  }
  if(event.target.matches('input,textarea,select,[contenteditable]'))return;
  if(state.study){if(event.code==='Space'&&!event.target.closest('button,a')&&!state.study.revealed&&studyCard()){event.preventDefault();state.study.revealed=true;renderStudy();}else if(/^[1-5]$/.test(event.key)&&state.study.revealed){event.preventDefault();reviewCard(Number(event.key));}else if(event.key==='Escape')exitStudy();}
  else if(event.key==='/'&&!event.metaKey&&!event.ctrlKey){event.preventDefault();$('#global-search')?.focus();}
  else if(event.key==='Escape'&&state.mobile){state.mobile=false;render();}
});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&state.user&&state.sync==='saving')queueCloudSave();});
window.addEventListener('online',()=>{if(state.user&&state.sync==='error')queueCloudSave();});
window.addEventListener('beforeunload',event=>{if(state.user&&state.sync==='saving'){event.preventDefault();event.returnValue='';}});

render();
// Store the real example library only in the guest space; accounts start private and empty.
if(!initialLibrary)writeLocal();
initCloud();

if('serviceWorker' in navigator && location.protocol!=='file:') window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{}));
