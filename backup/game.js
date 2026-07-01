
let allCards = [];
let decks = {};
let deck = [];
let hand = [];
let graveyard = [];
let enemyGraveyard = [];

let field = {
  player_front: [null,null,null,null,null],
  player_back: [null,null,null,null,null],
  enemy_front: [null,null,null,null,null],
  enemy_back: [null,null,null,null,null],
};

let phase = "召喚階段";
let turn = 1;
let normalSummonUsed = false;
let tacticalSummonUsed = false;
let dragged = null;
let mode = null; // formation / attack / target / littleTraveler
let selectedAttacker = null;

const $ = id => document.getElementById(id);

const LITTLE_TRAVELER = {
  id:"TOKEN_TRAVELER",
  name:"小旅人",
  deck:"森林",
  type:"unit",
  faction:"旅人",
  attack:1,
  score:1,
  tribute:0,
  keywords:[],
  effect_text:"無任何特殊能力。可從召喚到場上。",
  image:"/static/little_traveler.jpeg"
};

async function init(){
  allCards = await fetch("/api/cards").then(r=>r.json());
  decks = await fetch("/api/decks").then(r=>r.json());
  makeSlots();
  newGame();
}

function makeSlots(){
  const mapping = [
    [".enemy-back","enemy_back","後排"],
    [".enemy-front","enemy_front","前排"],
    [".player-front","player_front","前排"],
    [".player-back","player_back","後排"],
  ];
  for(const [sel,key,label] of mapping){
    const row = document.querySelector(sel);
    row.innerHTML = "";
    for(let i=0;i<5;i++){
      const div = document.createElement("div");
      div.className = "slot";
      div.dataset.zone = key;
      div.dataset.index = i;
      div.innerHTML = `<span class="lane-badge">${i+1}</span>${label}${i+1}`;
      div.addEventListener("dragover", e=>e.preventDefault());
      div.addEventListener("drop", onDropSlot);
      div.addEventListener("click", onSlotClick);
      row.appendChild(div);
    }
  }
}

function newGame(){
  const deckName = $("deckSelect").value;

  // 完全重置
  deck = [];
  hand = [];
  graveyard = [];
  enemyGraveyard = [];

  field.player_front = [null,null,null,null,null];
  field.player_back = [null,null,null,null,null];
  field.enemy_front = [null,null,null,null,null];
  field.enemy_back = [null,null,null,null,null];

  // 強制依照種族過濾
  let sourceCards = [];

  sourceCards = allCards.filter(c =>
    c &&
    (
      c.deck === deckName ||
      c.faction === deckName
    )
  );

  // 若 decks 有定義則優先使用
  if(decks && decks[deckName] && decks[deckName].length){
    sourceCards = decks[deckName]
      .map(id => allCards.find(c => c.id === id))
      .filter(Boolean);
  }

  // 深拷貝避免污染
  deck = sourceCards.map(c => structuredClone(c));

  shuffle(deck);

  phase = "召喚階段";
  turn = 1;
  normalSummonUsed = false;
  tacticalSummonUsed = false;
  mode = null;
  selectedAttacker = null;

  // 開局固定抽4張
  for(let i=0;i<4;i++){
    if(deck.length > 0){
      hand.push(deck.pop());
    }
  }

  console.log("=== 開局牌組 ===");
  console.log("選擇種族:", deckName);
  console.log("手牌:", hand.map(c=>c.name));
  console.log("牌庫剩餘:", deck.length);

  setStatus(`已載入 ${deckName} 牌組。`);
  render();
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
}

function draw(n){
  for(let i=0;i<n;i++){
    if(deck.length === 0){
      setStatus("牌庫已空。");
      return;
    }
    hand.push(deck.pop());
  }
  if(hand.length > 10) setStatus("手牌超過10張，回合結束會自動棄到10張。");
}

function render(){
  $("phase").textContent = phase + (mode ? `｜${modeName(mode)}` : "");
  $("turn").textContent = turn;
  $("handCount").textContent = hand.length;
  $("playerDeck").innerHTML = `牌庫<br>${deck.length}`;
  $("playerGrave").innerHTML = `墓地<br>${graveyard.length}`;
  $("enemyGrave").innerHTML = `墓地<br>${enemyGraveyard.length}`;

  renderButtons();
  renderHand();
  renderField();
  renderBattleLine();

  if(typeof renderDeckVisual === "function"){
    renderDeckVisual("playerDeck", deck.length, "我方");
    renderDeckVisual("enemyDeck", countEnemyDeckFake(), "對手");
  }
}

function modeName(m){
  return {
    formation:"戰術佈陣",
    attack:"進攻宣言",
    target:"指定目標",
    littleTraveler:"小旅人"
  }[m] || m;
}

function renderButtons(){
  const ids = ["formationModeBtn","attackModeBtn","targetModeBtn","resolveCombatBtn","littleTravelerBtn"];
  ids.forEach(id=>{
    const b = $(id);
    if(!b) return;
    b.classList.remove("active-btn");
  });

  if($("formationModeBtn")){
    $("formationModeBtn").disabled = phase !== "戰術階段";
    $("formationModeBtn").classList.toggle("active-btn", mode === "formation");
  }
  if($("attackModeBtn")){
    $("attackModeBtn").disabled = phase !== "戰術階段";
    $("attackModeBtn").classList.toggle("active-btn", mode === "attack");
  }
  if($("targetModeBtn")){
    $("targetModeBtn").disabled = !hasAnyAttacker();
    $("targetModeBtn").classList.toggle("active-btn", mode === "target");
  }
  if($("resolveCombatBtn")){
    $("resolveCombatBtn").disabled = !hasAnyTargetedAttack();
  }
  if($("littleTravelerBtn")){
    const hasAnyUnit =
      [...field.player_front, ...field.player_back].some(u => !!u);

    const can =
      (phase === "召喚階段" && !normalSummonUsed) ||
      (
        phase === "戰術階段" &&
        (
          mode === "formation" ||
          !hasAnyUnit
        ) &&
        !tacticalSummonUsed
      );

    $("littleTravelerBtn").disabled = !can;
    $("littleTravelerBtn").classList.toggle("active-btn", mode === "littleTraveler");
  }
}

function renderHand(){
  const h = $("hand");
  h.innerHTML = "";
  hand.forEach((card,idx)=>{
    const el = cardEl(card, true);
    el.draggable = true;
    el.dataset.handIndex = idx;
    el.addEventListener("dragstart", e=>{
      dragged = {type:"hand", index:idx};
      e.dataTransfer.setData("text/plain", idx);
    });
    h.appendChild(el);
  });
}

function renderField(){
  for(const zone of ["player_front","player_back","enemy_front","enemy_back"]){
    document.querySelectorAll(`[data-zone="${zone}"]`).forEach(slot=>{
      const idx = Number(slot.dataset.index);
      slot.innerHTML = `<span class="lane-badge">${idx+1}</span>`;
      slot.classList.remove("has-card","tapped-slot","attacking-slot","selected-attacker","targeted-slot","legal-target");

      const obj = field[zone][idx];
      if(obj){
        slot.classList.add("has-card");
        if(obj.tapped) slot.classList.add("tapped-slot");
        if(obj.attacking) slot.classList.add("attacking-slot");
        if(obj.target) slot.classList.add("targeted-slot");
        if(selectedAttacker && selectedAttacker.zone === zone && selectedAttacker.index === idx){
          slot.classList.add("selected-attacker");
        }
        if(mode === "target" && selectedAttacker && zone.startsWith("enemy_") && isLegalTarget(selectedAttacker.zone, selectedAttacker.index, zone, idx)){
          slot.classList.add("legal-target");
        }

        const cardDom = cardEl(obj.card, false);
        cardDom.draggable = zone.startsWith("player_") && phase === "戰術階段" && mode === "formation";
        cardDom.addEventListener("dragstart", e=>{
          dragged = {type:"field", zone, index:idx};
          e.dataTransfer.setData("text/plain", `${zone}:${idx}`);
        });
        slot.appendChild(cardDom);
      }else{
        const label = zone.includes("front") ? "前排" : "後排";
        slot.append(label + (idx+1));
      }
    });
  }
}

function renderBattleLine(){
  document.querySelectorAll(".battle-cell").forEach((cell,i)=>{
    cell.textContent = `★${i+1}`;
    cell.classList.remove("line-has-attacker");
    if(field.player_front[i]?.attacking || field.player_back[i]?.attacking){
      cell.textContent = `★${i+1} ⚔`;
      cell.classList.add("line-has-attacker");
    }
  });
}

function cardEl(card, small=false){
  const el = document.createElement("div");
  el.className = "card";
  const meta = card.type === "unit"
    ? `攻${card.attack}｜星${card.score}｜祭${card.tribute ?? 0}`
    : `魔法｜點${card.magic_point ?? "-"}`;

  if(card.image){
    el.innerHTML = `<img src="${card.image}" alt="${card.name}"><div class="mini-meta">${card.name}<br>${meta}</div>`;
  } else {
    el.innerHTML = `<div class="fallback"><b>${card.name}</b><br>${meta}</div>`;
  }
  el.addEventListener("click", (e)=>{
    e.stopPropagation();

    // 戰術操作模式時，交由 slot click 處理
    if(mode === "attack" || mode === "target" || mode === "littleTraveler"){
      const slot = el.closest(".slot");
      if(slot){
        slot.click();
      }
      return;
    }

    showModal(card);
  });
  return el;
}

function onDropSlot(e){
  e.preventDefault();
  const zone = e.currentTarget.dataset.zone;
  const idx = Number(e.currentTarget.dataset.index);

  if(mode === "littleTraveler"){
    summonLittleTraveler(zone, idx);
    return;
  }

  if(!dragged) return;

  if(dragged.type === "hand"){
    playCardFromHand(dragged.index, zone, idx);
  }else if(dragged.type === "field"){
    moveFieldUnit(dragged.zone, dragged.index, zone, idx);
  }
  dragged = null;
  render();
}

function onSlotClick(e){
  const zone = e.currentTarget.dataset.zone;
  const idx = Number(e.currentTarget.dataset.index);

  if(mode === "littleTraveler"){
    summonLittleTraveler(zone, idx);
    return;
  }

  if(mode === "attack"){
    toggleAttacker(zone, idx);
    return;
  }

  if(mode === "target"){
    handleTargetClick(zone, idx);
    return;
  }
}

function playCardFromHand(handIndex, zone, idx){
  if(zone !== "player_front" && zone !== "player_back"){
    setStatus("只能召喚到我方前排或後排。");
    return;
  }
  if(field[zone][idx]){
    setStatus("該格已有單位。");
    return;
  }

  const card = hand[handIndex];
  if(!card) return;

  if(card.type !== "unit"){
    setStatus("目前先開放單位召喚，魔法卡下一階段加入。");
    return;
  }

  if((card.tribute ?? 0) > 0){
    setStatus("需要祭品的單位暫未開放。");
    return;
  }

  if(phase === "召喚階段"){
    if(normalSummonUsed){
      setStatus("本回合召喚階段已召喚過。");
      return;
    }
    normalSummonUsed = true;
  }else if(phase === "戰術階段" && mode === "formation"){
    if(tacticalSummonUsed){
      setStatus("戰術佈陣已額外召喚過。");
      return;
    }
    tacticalSummonUsed = true;
  }else{
    setStatus("目前不能召喚。");
    return;
  }

  field[zone][idx] = makeUnit(card, zone);
  hand.splice(handIndex, 1);
  setStatus(`召喚 ${card.name}`);
}

function makeUnit(card, zone){
  return {
    card,
    tapped:false,
    attacking:false,
    target:null,
    summonedTurn:turn,
    summonedZone:zone
  };
}

function summonLittleTraveler(zone, idx){
  if(zone !== "player_front" && zone !== "player_back"){
    setStatus("小旅人只能召喚到我方前排或後排。");
    return;
  }
  if(field[zone][idx]){
    setStatus("該格已有單位。");
    return;
  }

  if(phase === "召喚階段"){
    if(normalSummonUsed){
      setStatus("召喚階段已使用。");
      return;
    }
    normalSummonUsed = true;
  }else if(phase === "戰術階段" && mode === "formation"){
    if(tacticalSummonUsed){
      setStatus("戰術佈陣已額外召喚過。");
      return;
    }
    tacticalSummonUsed = true;
  }else{
    setStatus("目前不能召喚小旅人。");
    return;
  }

  field[zone][idx] = makeUnit(structuredClone(LITTLE_TRAVELER), zone);
  mode = null;
  setStatus("已從森林召喚小旅人。");
  render();
}

function moveFieldUnit(fromZone, fromIdx, toZone, toIdx){
  if(phase !== "戰術階段" || mode !== "formation"){
    setStatus("只有戰術佈陣模式可以移動。");
    return;
  }
  if(!toZone.startsWith("player_")){
    setStatus("只能移動到我方場地。");
    return;
  }
  if(field[toZone][toIdx]){
    setStatus("目標格已有單位。");
    return;
  }

  const unit = field[fromZone][fromIdx];
  if(!unit) return;

  if(unit.summonedTurn === turn && unit.summonedZone === "player_front" && toZone === "player_back"){
    setStatus("當回合召喚在前排的單位不可移到後排。");
    return;
  }

  field[toZone][toIdx] = unit;
  field[fromZone][fromIdx] = null;
  setStatus(`已移動 ${unit.card.name}`);
}

function toggleAttacker(zone, idx){
  if(!zone.startsWith("player_")){
    setStatus("只能選擇我方單位進攻。");
    return;
  }
  const unit = field[zone][idx];
  if(!unit) return;

  if(unit.tapped){
    setStatus("橫置單位不能進攻。");
    return;
  }

  unit.attacking = !unit.attacking;
  if(!unit.attacking) unit.target = null;
  setStatus(unit.attacking ? `${unit.card.name} 宣告進攻。` : `${unit.card.name} 取消進攻。`);
  render();
}

function handleTargetClick(zone, idx){
  const unit = field[zone][idx];

  if(zone.startsWith("player_")){
    if(unit && unit.attacking){
      selectedAttacker = {zone, index:idx};
      setStatus(`已選攻擊者：${unit.card.name}，請點敵方同戰線目標。`);
      render();
    }
    return;
  }

  if(zone.startsWith("enemy_")){
    if(!selectedAttacker){
      setStatus("請先選一個我方進攻單位。");
      return;
    }
    if(!unit){
      setStatus("該格沒有敵方單位。");
      return;
    }
    if(!isLegalTarget(selectedAttacker.zone, selectedAttacker.index, zone, idx)){
      setStatus("目標不合法：一般攻擊需先打同戰線前排。");
      return;
    }

    const atk = field[selectedAttacker.zone][selectedAttacker.index];
    atk.target = {zone, index:idx};
    setStatus(`${atk.card.name} 指定攻擊 ${unit.card.name}`);
    selectedAttacker = null;
    render();
  }
}

function isLegalTarget(attZone, attIdx, targetZone, targetIdx){
  const attacker = field[attZone][attIdx];
  if(!attacker || !attacker.attacking) return false;
  if(attIdx !== targetIdx) return false;

  const isRemote = attacker.card.keywords?.includes("遠程攻擊");
  if(isRemote) return !!field[targetZone][targetIdx];

  if(field.enemy_front[targetIdx]){
    return targetZone === "enemy_front";
  }
  return targetZone === "enemy_back" && !!field.enemy_back[targetIdx];
}

function resolveCombat(){
  const attackers = [];
  for(const zone of ["player_front","player_back"]){
    for(let i=0;i<5;i++){
      const unit = field[zone][i];
      if(unit && unit.attacking && unit.target){
        attackers.push({zone,index:i,unit});
      }
    }
  }

  if(attackers.length === 0){
    setStatus("沒有已指定目標的攻擊。");
    return;
  }

  attackers.sort((a,b)=>a.index-b.index);

  const logs = [];
  for(const a of attackers){
    const attacker = field[a.zone][a.index];
    if(!attacker) continue;

    const t = attacker.target;
    const defender = field[t.zone][t.index];

    if(!defender){
      attacker.attacking = false;
      attacker.target = null;
      continue;
    }

    const atkPower = Number(attacker.card.attack ?? 0);
    const defPower = Number(defender.card.attack ?? 0);
    const isRemote = attacker.card.keywords?.includes("遠程攻擊");

    if(atkPower >= defPower){
      destroyUnit(t.zone, t.index, "enemy");
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      logs.push(`${attacker.card.name} 擊破 ${defender.card.name}`);
    }else{
      if(isRemote){
        attacker.tapped = true;
        attacker.attacking = false;
        attacker.target = null;
        logs.push(`${attacker.card.name} 遠程攻擊失敗但未破壞`);
      }else{
        destroyUnit(a.zone, a.index, "player");
        logs.push(`${attacker.card.name} 攻擊失敗被破壞`);
      }
    }
  }

  mode = null;
  phase = "結束階段";
  setStatus(logs.join("；") || "戰鬥結算完成。");
  render();
}

function destroyUnit(zone, idx, owner){
  const unit = field[zone][idx];
  if(!unit) return;
  if(owner === "enemy") enemyGraveyard.push(unit.card);
  else graveyard.push(unit.card);
  field[zone][idx] = null;
}

function hasAnyAttacker(){
  return [...field.player_front, ...field.player_back].some(u=>u && u.attacking);
}

function hasAnyTargetedAttack(){
  return [...field.player_front, ...field.player_back].some(u=>u && u.attacking && u.target);
}

function nextPhase(){
  if(phase === "召喚階段"){
    phase = "戰術階段";
    mode = null;
    setStatus("進入戰術階段：可選戰術佈陣或進攻宣言。");
  }else if(phase === "戰術階段"){
    if(hasAnyTargetedAttack()){
      setStatus("尚有指定目標的攻擊，請先結算戰鬥。");
      render();
      return;
    }
    phase = "結束階段";
    mode = null;
    setStatus("進入結束階段。");
  }else{
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }
    turn++;
    phase = "召喚階段";
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    mode = null;
    selectedAttacker = null;
    // 每回合開始固定抽牌
    draw(2);

    // 防止抽牌失效
    if(hand.length === 0 && deck.length > 0){
      draw(2);
    }

    setStatus(`第 ${turn} 回合開始，已抽2張卡。`);
  }
  render();
}

function setupEnemyTest(){
  const units = allCards.filter(c=>c.type === "unit" && (c.tribute ?? 0) === 0);
  for(let i=0;i<5;i++){
    if(!field.enemy_front[i]){
      const c = structuredClone(units[(i+2) % units.length] || LITTLE_TRAVELER);
      field.enemy_front[i] = makeUnit(c, "enemy_front");
    }
  }
  setStatus("已放置對手前排測試單位。");
  render();
}

function countEnemyDeckFake(){
  return Math.max(0, 20 - enemyGraveyard.length - field.enemy_front.filter(Boolean).length - field.enemy_back.filter(Boolean).length);
}

function showModal(card){
  $("modalImg").src = card.image || "";
  const attrs = card.type === "unit"
    ? `攻擊：${card.attack}\n星數：${card.score}\n祭品：${card.tribute ?? 0}`
    : `魔法點數：${card.magic_point ?? "-"}\n類型：${card.magic_type ?? "-"}`;
  $("modalInfo").textContent =
`${card.id}
${card.name}

牌組：${card.deck}
類型：${card.type}
種族/陣營：${card.faction || "-"}

${attrs}

關鍵字：${(card.keywords || []).join("、") || "無"}

效果：
${card.effect_text || ""}`;
  $("cardModal").classList.add("show");
}

function setStatus(t){
  $("status").textContent = t;
}

$("newGameBtn").onclick = newGame;

if($("drawBtn")){
  $("drawBtn").onclick = ()=>{ draw(2); render(); };
}

$("nextPhaseBtn").onclick = nextPhase;
if($("formationModeBtn")) $("formationModeBtn").onclick = ()=>{
  if(phase !== "戰術階段") return;
  if(hasAnyAttacker()){
    setStatus("已宣告進攻時不能改戰術佈陣。");
    return;
  }
  mode = "formation";
  setStatus("戰術佈陣：可拖曳我方單位移動，也可額外召喚1個免祭品單位。");
  render();
};

if($("attackModeBtn")) $("attackModeBtn").onclick = ()=>{
  if(phase !== "戰術階段") return;
  mode = "attack";
  setStatus("進攻宣言：點擊我方非橫置單位。");
  render();
};

if($("targetModeBtn")) $("targetModeBtn").onclick = ()=>{
  if(!hasAnyAttacker()){
    setStatus("請先宣告進攻。");
    return;
  }
  mode = "target";
  selectedAttacker = null;
  setStatus("指定目標：先點我方進攻單位，再點敵方合法目標。");
  render();
};

if($("resolveCombatBtn")) $("resolveCombatBtn").onclick = resolveCombat;
if($("enemyTestBtn")) $("enemyTestBtn").onclick = setupEnemyTest;
if($("littleTravelerBtn")) $("littleTravelerBtn").onclick = ()=>{
  mode = "littleTraveler";
  setStatus("請點擊我方空格召喚小旅人。");
  render();
};

$("closeModal").onclick = ()=>$("cardModal").classList.remove("show");
$("cardModal").addEventListener("click", e=>{
  if(e.target.id === "cardModal") $("cardModal").classList.remove("show");
});

init();


// ===== v3 battle system plus：更完整對戰系統 =====

let playerBonusScore = 0;
let enemyBonusScore = 0;
let battleLog = [];
let discardMode = false;

function logBattle(text){
  battleLog.unshift(`T${turn}｜${text}`);
  if(battleLog.length > 30) battleLog.pop();
}

function getAllPlayerUnits(){
  return [...field.player_front, ...field.player_back].filter(Boolean);
}

function getAllEnemyUnits(){
  return [...field.enemy_front, ...field.enemy_back].filter(Boolean);
}

function untapPlayerUnits(){
  for(const zone of ["player_front","player_back"]){
    for(const u of field[zone]){
      if(u){
        u.tapped = false;
        u.attacking = false;
        u.target = null;
      }
    }
  }
  selectedAttacker = null;
}

function untapEnemyUnits(){
  for(const zone of ["enemy_front","enemy_back"]){
    for(const u of field[zone]){
      if(u){
        u.tapped = false;
        u.attacking = false;
        u.target = null;
      }
    }
  }
}

function startReadyPhase(){
  untapPlayerUnits();
  normalSummonUsed = false;
  tacticalSummonUsed = false;
  phase = "召喚階段";
  mode = null;
  draw(2);
  logBattle("整備：我方單位轉正，抽2張牌");
  setStatus("整備完成：我方單位轉正，抽2張牌。");
  render();
}

function discardExcessHand(){
  let discarded = 0;
  while(hand.length > 10){
    const c = hand.pop();
    graveyard.push(c);
    discarded++;
  }
  if(discarded){
    logBattle(`手牌超過上限，棄置 ${discarded} 張`);
    setStatus(`手牌超過10張，已自動棄置 ${discarded} 張。`);
  }
}

function toggleDiscardMode(){
  discardMode = !discardMode;
  mode = discardMode ? "discard" : null;
  setStatus(discardMode ? "棄牌模式：點擊手牌可棄置。" : "已關閉棄牌模式。");
  render();
}

function discardHandCard(index){
  const card = hand[index];
  if(!card) return;
  hand.splice(index,1);
  graveyard.push(card);
  logBattle(`棄置手牌：${card.name}`);
  setStatus(`已棄置 ${card.name}`);
  render();
}

function passTurn(){
  discardExcessHand();
  untapEnemyUnits();
  simpleEnemyTurn();
  turn++;
  normalSummonUsed = false;
  tacticalSummonUsed = false;
  phase = "召喚階段";
  mode = null;
  discardMode = false;
  selectedAttacker = null;
  draw(2);
  logBattle("回合結束，進入我方新回合");
  setStatus(`進入第 ${turn} 回合，抽2張。`);
  render();
}

function simpleEnemyTurn(){
  // 簡易對手測試行為：若無前排，鋪1隻；若有前排則攻擊同戰線我方前排
  const units = allCards.filter(c=>c.type === "unit" && (c.tribute ?? 0) === 0);
  const empty = field.enemy_front.findIndex(x=>!x);
  if(empty >= 0 && units.length){
    const c = structuredClone(units[(turn + empty) % units.length]);
    field.enemy_front[empty] = makeUnit(c, "enemy_front");
    logBattle(`對手召喚 ${c.name}`);
  }

  for(let i=0;i<5;i++){
    const enemy = field.enemy_front[i];
    if(!enemy || enemy.tapped) continue;

    if(field.player_front[i]){
      const atk = Number(enemy.card.attack ?? 0);
      const def = Number(field.player_front[i].card.attack ?? 0);
      if(atk >= def){
        const defeated = field.player_front[i].card.name;
        destroyUnit("player_front", i, "player");
        enemy.tapped = true;
        logBattle(`對手 ${enemy.card.name} 擊破 ${defeated}`);
      }else{
        const defeated = enemy.card.name;
        destroyUnit("enemy_front", i, "enemy");
        logBattle(`對手 ${defeated} 攻擊失敗被破壞`);
      }
    }else{
      const gain = Number(enemy.card.score ?? 1);
      enemy.bonusScore = (enemy.bonusScore || 0) + gain;
      enemy.tapped = true;
      logBattle(`對手 ${enemy.card.name} 直接攻擊，獲得 ${gain} 點額外分數`);
    }
  }
}

function directAttackAvailable(attackerZone, attackerIndex){
  // 同戰線沒有敵方前後排時，可以直接攻擊玩家
  return !field.enemy_front[attackerIndex] && !field.enemy_back[attackerIndex];
}

// patch handleTargetClick: allow clicking battle line for direct attack via cells
document.querySelectorAll(".battle-cell").forEach((cell, idx)=>{
  cell.addEventListener("click", ()=>{
    if(mode !== "target" || !selectedAttacker) return;
    const atk = field[selectedAttacker.zone][selectedAttacker.index];
    if(!atk) return;
    if(selectedAttacker.index !== idx){
      setStatus("只能攻擊同戰線。");
      return;
    }
    if(!directAttackAvailable(selectedAttacker.zone, selectedAttacker.index)){
      setStatus("該戰線仍有敵方單位，不能直接攻擊。");
      return;
    }
    atk.target = {zone:"enemy_player", index:idx};
    setStatus(`${atk.card.name} 指定直接攻擊對手。`);
    selectedAttacker = null;
    render();
  });
});

// patch resolveCombat for direct attack
const oldResolveCombatPlus = resolveCombat;
resolveCombat = function(){
  const directAttackers = [];
  for(const zone of ["player_front","player_back"]){
    for(let i=0;i<5;i++){
      const u = field[zone][i];
      if(u && u.attacking && u.target && u.target.zone === "enemy_player"){
        directAttackers.push({zone,index:i,unit:u});
      }
    }
  }

  if(directAttackers.length){
    for(const a of directAttackers){
      const attacker = field[a.zone][a.index];
      if(!attacker) continue;
      const gain = Number(attacker.card.score ?? 1);
      attacker.bonusScore = (attacker.bonusScore || 0) + gain;
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      logBattle(`${attacker.card.name} 直接攻擊，獲得 ${gain} 點額外分數`);
    }
  }

  oldResolveCombatPlus();
  checkGameEnd();
};

function checkGameEnd(){
  updateScoreDisplay();
}

function openScorePanel(){
  const panel = document.getElementById("scorePanel");
  const content = document.getElementById("scoreContent");
  if(!panel || !content) return;

  const p = calculatePlayerScore();
  const e = calculateEnemyScore();
  content.innerHTML = `
    <div class="score-row"><b>我方總分</b><span>${p}</span></div>
    <div class="score-row"><b>對手總分</b><span>${e}</span></div>
    <div class="score-row"><b>目前結果</b><span>${p > e ? "我方領先" : e > p ? "對手領先" : "平手"}</span></div>
    <div class="score-row"><b>我方墓地</b><span>${graveyard.length}</span></div>
    <div class="score-row"><b>對手墓地</b><span>${enemyGraveyard.length}</span></div>
    <div class="score-row"><b>我方場上單位</b><span>${getAllPlayerUnits().length}</span></div>
    <div class="score-row"><b>對手場上單位</b><span>${getAllEnemyUnits().length}</span></div>
    <h3>戰鬥紀錄</h3>
    <div class="battle-log">${battleLog.map(x=>`<div>${x}</div>`).join("") || "尚無紀錄"}</div>
  `;

  panel.classList.add("show");
}

// patch render to update status labels
const oldRenderBattlePlus = render;
render = function(){
  oldRenderBattlePlus();

  const status = document.getElementById("status");
  if(status && !status.dataset.plusInit){
    status.dataset.plusInit = "1";
  }

  if($("discardModeBtn")){
    $("discardModeBtn").classList.toggle("active-btn", discardMode);
  }

  if($("readyPhaseBtn")){
    $("readyPhaseBtn").disabled = phase !== "召喚階段" && phase !== "結束階段";
  }
};

// patch hand click for discard mode
const oldCardElBattlePlus = cardEl;
cardEl = function(card, small=false){
  const el = oldCardElBattlePlus(card, small);
  if(small){
    el.addEventListener("click", (e)=>{
      if(discardMode){
        e.stopImmediatePropagation();
        const idx = Number(el.dataset.handIndex);
        discardHandCard(idx);
      }
    }, true);
  }
  return el;
};

// reset life on new game
const oldNewGameBattlePlus = newGame;
newGame = function(){
  playerBonusScore = 0;
  enemyBonusScore = 0;
  battleLog = [];
  discardMode = false;
  oldNewGameBattlePlus();
  logBattle("遊戲開始");
  render();
};

// buttons
setTimeout(()=>{
  if($("readyPhaseBtn")) $("readyPhaseBtn").onclick = startReadyPhase;
  if($("discardModeBtn")) $("discardModeBtn").onclick = toggleDiscardMode;
  if($("passTurnBtn")) $("passTurnBtn").onclick = passTurn;
  if($("scoreBtn")) $("scoreBtn").onclick = openScorePanel;
  if($("closeScorePanel")) $("closeScorePanel").onclick = ()=>$("scorePanel").classList.remove("show");
  const scorePanel = $("scorePanel");
  if(scorePanel){
    scorePanel.addEventListener("click", e=>{
      if(e.target.id === "scorePanel") scorePanel.classList.remove("show");
    });
  }
}, 300);



// ===== star score system fixed：星數總分制 =====

function calculatePlayerScore(){
  let total = Number(playerBonusScore || 0);

  for(const zone of ["player_front","player_back"]){
    for(const u of field[zone]){
      if(!u) continue;
      total += Number(u.card.score ?? 0);
      total += Number(u.bonusScore ?? 0);
    }
  }

  return total;
}

function calculateEnemyScore(){
  let total = Number(enemyBonusScore || 0);

  for(const zone of ["enemy_front","enemy_back"]){
    for(const u of field[zone]){
      if(!u) continue;
      total += Number(u.card.score ?? 0);
      total += Number(u.bonusScore ?? 0);
    }
  }

  return total;
}

function updateScoreDisplay(){
  const p = calculatePlayerScore();
  const e = calculateEnemyScore();

  const scoreText = `我方 ${p} 分｜對手 ${e} 分`;

  // 不覆蓋太多提示，只在狀態列沒有重要提示時補充
  const scoreBadge = document.getElementById("scoreBadgeFixed") || createScoreBadgeFixed();
  scoreBadge.textContent = scoreText;
}

function createScoreBadgeFixed(){
  const div = document.createElement("div");
  div.id = "scoreBadgeFixed";
  div.className = "score-badge-fixed";
  document.body.appendChild(div);
  return div;
}

const oldRenderStarScoreFixed = render;
render = function(){
  oldRenderStarScoreFixed();

  updateScoreDisplay();

  for(const zoneName of ["player_front","player_back","enemy_front","enemy_back"]){
    document.querySelectorAll(`[data-zone="${zoneName}"]`).forEach(slot=>{
      const idx = Number(slot.dataset.index);
      const obj = field[zoneName][idx];

      const old = slot.querySelector(".bonus-score-badge");
      if(old) old.remove();

      if(obj && obj.bonusScore){
        const badge = document.createElement("div");
        badge.className = "bonus-score-badge";
        badge.textContent = "+" + obj.bonusScore;
        slot.appendChild(badge);
      }
    });
  }
};


// ===== v3 play feature next：祭品召喚 / 魔法模式 / 場地魔法 =====

let tributeMode = false;
let pendingTributeCard = null;
let selectedTributes = [];
let spellMode = false;
let playerFieldCard = null;

function clearSpecialModes(){
  tributeMode = false;
  pendingTributeCard = null;
  selectedTributes = [];
  spellMode = false;
}

function startTributeMode(){
  if(phase !== "召喚階段"){
    setStatus("祭品召喚只能在召喚階段使用。");
    return;
  }

  if(normalSummonUsed){
    setStatus("本回合已經召喚過，不能再祭品召喚。");
    return;
  }

  const tributeCards = hand.filter(c => c.type === "unit" && Number(c.tribute || 0) > 0);

  if(tributeCards.length === 0){
    setStatus("手牌中沒有需要祭品的單位。");
    return;
  }

  tributeMode = true;
  spellMode = false;
  pendingTributeCard = null;
  selectedTributes = [];
  setStatus("祭品召喚模式：先點手牌中需要祭品的單位，再點場上祭品。");
  render();
}

function chooseTributeCard(handIndex){
  const card = hand[handIndex];
  if(!card || card.type !== "unit" || Number(card.tribute || 0) <= 0){
    setStatus("請選擇需要祭品的單位。");
    return;
  }

  pendingTributeCard = {
    card,
    handIndex,
    required:Number(card.tribute || 0)
  };

  selectedTributes = [];
  setStatus(`${card.name} 需要 ${pendingTributeCard.required} 個祭品。請點我方場上單位作為祭品。`);
  render();
}

function selectTribute(zone, idx){
  if(!pendingTributeCard){
    setStatus("請先點手牌中要祭品召喚的單位。");
    return;
  }

  if(!zone.startsWith("player_")){
    setStatus("只能獻祭我方單位。");
    return;
  }

  const unit = field[zone][idx];
  if(!unit){
    setStatus("該格沒有單位。");
    return;
  }

  const key = `${zone}:${idx}`;
  const exist = selectedTributes.find(x => x.key === key);

  if(exist){
    selectedTributes = selectedTributes.filter(x => x.key !== key);
  }else{
    selectedTributes.push({zone, idx, key});
  }

  if(selectedTributes.length >= pendingTributeCard.required){
    setStatus("祭品已選滿。請點我方空格放置召喚單位。");
  }else{
    setStatus(`已選 ${selectedTributes.length}/${pendingTributeCard.required} 個祭品。`);
  }

  render();
}

function completeTributeSummon(zone, idx){
  if(!pendingTributeCard) return false;

  if(!zone.startsWith("player_")){
    setStatus("只能召喚到我方場地。");
    return true;
  }

  if(xlwIsIllegalBackHandSummon(zone)){
    setStatus("前排仍有空位時，不能召喚至後排。");
    return true;
  }

  if(field[zone][idx]){
    setStatus("召喚位置已有單位。");
    return true;
  }

  if(selectedTributes.length < pendingTributeCard.required){
    return false;
  }

  // 祭品送墓地
  selectedTributes.forEach(t=>{
    const unit = field[t.zone][t.idx];
    if(unit){
      graveyard.push(unit.card);
      field[t.zone][t.idx] = null;
    }
  });

  // 召喚單位
  field[zone][idx] = makeUnit(pendingTributeCard.card, zone);
  hand.splice(pendingTributeCard.handIndex, 1);
  normalSummonUsed = true;

  logBattle(`祭品召喚 ${pendingTributeCard.card.name}`);
  setStatus(`祭品召喚成功：${pendingTributeCard.card.name}`);

  tributeMode = false;
  pendingTributeCard = null;
  selectedTributes = [];

  render();
  return true;
}

function toggleSpellMode(){
  spellMode = !spellMode;
  tributeMode = false;
  pendingTributeCard = null;
  selectedTributes = [];
  setStatus(spellMode ? "魔法模式：點擊手牌中的魔法卡使用。" : "已關閉魔法模式。");
  render();
}

function castSpell(handIndex){
  const card = hand[handIndex];

  if(!card || card.type !== "magic"){
    setStatus("這張不是魔法卡。");
    return;
  }

  const text = card.effect_text || "";
  const name = card.name || "";

  if(card.magic_type === "場地" || name.includes("場地")){
    if(playerFieldCard){
      graveyard.push(playerFieldCard);
    }
    playerFieldCard = card;
    hand.splice(handIndex, 1);
    logBattle(`設置場地魔法：${card.name}`);
    setStatus(`已設置場地魔法：${card.name}`);
    render();
    return;
  }

  if(text.includes("抽2張")){
    draw(2);
    logBattle(`發動 ${card.name}：抽2張`);
  }else if(text.includes("抽1張")){
    draw(1);
    logBattle(`發動 ${card.name}：抽1張`);
  }else if(text.includes("加分") || text.includes("額外分")){
    playerBonusScore += 1;
    logBattle(`發動 ${card.name}：我方額外加1分`);
  }else{
    logBattle(`發動 ${card.name}`);
  }

  graveyard.push(card);
  hand.splice(handIndex, 1);
  spellMode = false;
  setStatus(`已發動魔法：${card.name}`);
  render();
}

function applyFieldBonusToScore(base, owner){
  if(owner === "player" && playerFieldCard){
    const text = playerFieldCard.effect_text || "";
    if(text.includes("前排") && text.includes("+1")){
      // 每個我方前排單位 +1 分，作為場地示範
      base += field.player_front.filter(Boolean).length;
    }
  }
  return base;
}

// 覆寫分數計算，加入場地效果
const oldCalculatePlayerScoreFeature = calculatePlayerScore;
calculatePlayerScore = function(){
  let score = oldCalculatePlayerScoreFeature();
  return applyFieldBonusToScore(score, "player");
};

// 覆寫手牌卡片點擊，支援祭品/魔法模式
const oldCardElFeatureNext = cardEl;
cardEl = function(card, small=false){
  const el = oldCardElFeatureNext(card, small);

  if(small){
    el.addEventListener("click", (e)=>{
      const idx = Number(el.dataset.handIndex);

      if(tributeMode){
        e.stopImmediatePropagation();
        chooseTributeCard(idx);
        return;
      }

      if(spellMode){
        e.stopImmediatePropagation();
        castSpell(idx);
        return;
      }
    }, true);
  }

  return el;
};

// 覆寫格子點擊，支援祭品選取/完成召喚
const oldOnSlotClickFeatureNext = onSlotClick;
onSlotClick = function(e){
  const zone = e.currentTarget.dataset.zone;
  const idx = Number(e.currentTarget.dataset.index);

  if(tributeMode){
    if(pendingTributeCard && selectedTributes.length >= pendingTributeCard.required && !field[zone][idx]){
      if(completeTributeSummon(zone, idx)) return;
    }

    selectTribute(zone, idx);
    return;
  }

  oldOnSlotClickFeatureNext(e);
};

// 覆寫 render：顯示祭品狀態與場地魔法
const oldRenderFeatureNext = render;
render = function(){
  oldRenderFeatureNext();

  document.querySelectorAll(".tribute-selected").forEach(el=>el.classList.remove("tribute-selected"));

  if(tributeMode){
    selectedTributes.forEach(t=>{
      const slot = document.querySelector(`[data-zone="${t.zone}"][data-index="${t.idx}"]`);
      if(slot) slot.classList.add("tribute-selected");
    });
  }

  const playerField = document.getElementById("playerField");
  if(playerField){
    const old = playerField.querySelector(".field-card-name");
    if(old) old.remove();

    if(playerFieldCard){
      const div = document.createElement("div");
      div.className = "field-card-name";
      div.textContent = playerFieldCard.name;
      playerField.appendChild(div);
    }
  }

  if($("tributeModeBtn")){
    $("tributeModeBtn").classList.toggle("active-btn", tributeMode);
  }

  if($("spellModeBtn")){
    $("spellModeBtn").classList.toggle("active-btn", spellMode);
  }
};

// 按鈕綁定
setTimeout(()=>{
  if($("tributeModeBtn")) $("tributeModeBtn").onclick = startTributeMode;
  if($("spellModeBtn")) $("spellModeBtn").onclick = toggleSpellMode;
}, 300);



// ===== field magic drop + tribute summon fixed =====

// 允許把場地魔法卡拖到場地區
(function setupFieldMagicDrop(){
  const fieldZone = document.getElementById("playerField");
  if(!fieldZone) return;

  fieldZone.addEventListener("dragover", e=>{
    e.preventDefault();
  });

  fieldZone.addEventListener("drop", e=>{
    e.preventDefault();

    if(!dragged || dragged.type !== "hand"){
      return;
    }

    const card = hand[dragged.index];
    if(!card){
      return;
    }

    if(card.type !== "magic" || card.magic_type !== "場地"){
      setStatus("只有場地魔法卡可以放到場地區。");
      return;
    }

    placeFieldMagic(dragged.index);
    dragged = null;
  });
})();

function placeFieldMagic(handIndex){
  const card = hand[handIndex];
  if(!card) return;

  if(card.type !== "magic" || card.magic_type !== "場地"){
    setStatus("這張不是場地魔法卡。");
    return;
  }

  if(playerFieldCard){
    graveyard.push(playerFieldCard);
  }

  playerFieldCard = card;
  hand.splice(handIndex, 1);

  logBattle(`設置場地魔法：${card.name}`);
  setStatus(`已將 ${card.name} 放置到場地區。`);
  spellMode = false;

  render();
}

// 重新定義祭品模式
function startTributeMode(){
  if(phase !== "召喚階段"){
    setStatus("祭品召喚只能在召喚階段使用。");
    return;
  }

  if(normalSummonUsed){
    setStatus("本回合已經召喚過，不能再祭品召喚。");
    return;
  }

  const tributeCards = hand.filter(c => c.type === "unit" && Number(c.tribute || 0) > 0);

  if(tributeCards.length === 0){
    setStatus("手牌中沒有需要祭品的單位。");
    return;
  }

  tributeMode = true;
  spellMode = false;
  mode = "tribute";

  pendingTributeCard = null;
  selectedTributes = [];

  setStatus("祭品召喚：請先點手牌中需要祭品的單位。");
  render();
}

function chooseTributeCard(handIndex){
  const card = hand[handIndex];

  if(!card || card.type !== "unit" || Number(card.tribute || 0) <= 0){
    setStatus("請點選手牌中需要祭品的單位。");
    return;
  }

  pendingTributeCard = {
    card,
    handIndex,
    required:Number(card.tribute || 0)
  };

  selectedTributes = [];

  setStatus(`${card.name} 需要 ${pendingTributeCard.required} 個祭品。請點我方場上單位作為祭品。`);
  render();
}

function selectTribute(zone, idx){
  if(!pendingTributeCard){
    setStatus("請先點手牌中要祭品召喚的單位。");
    return;
  }

  if(!zone.startsWith("player_")){
    setStatus("只能選擇我方單位作為祭品。");
    return;
  }

  const unit = field[zone][idx];
  if(!unit){
    setStatus("該格沒有單位，不能當祭品。");
    return;
  }

  const key = `${zone}:${idx}`;
  const exists = selectedTributes.some(t => t.key === key);

  if(exists){
    selectedTributes = selectedTributes.filter(t => t.key !== key);
  }else{
    selectedTributes.push({zone, idx, key});
  }

  if(selectedTributes.length >= pendingTributeCard.required){
    setStatus("祭品已選滿。請點我方空格放置召喚單位。");
  }else{
    setStatus(`已選 ${selectedTributes.length}/${pendingTributeCard.required} 個祭品。`);
  }

  render();
}

function completeTributeSummon(zone, idx){
  if(!pendingTributeCard) return false;

  if(!zone.startsWith("player_")){
    setStatus("只能召喚到我方場地。");
    return true;
  }

  if(field[zone][idx]){
    // 點到已存在單位時，視為切換祭品，而不是召喚
    selectTribute(zone, idx);
    return true;
  }

  if(selectedTributes.length < pendingTributeCard.required){
    setStatus(`祭品不足，仍需要 ${pendingTributeCard.required - selectedTributes.length} 個祭品。`);
    return true;
  }

  // 祭品進墓地
  selectedTributes.forEach(t=>{
    const unit = field[t.zone][t.idx];
    if(unit){
      graveyard.push(unit.card);
      field[t.zone][t.idx] = null;
    }
  });

  // 重新取得手牌位置，避免手牌順序改變
  const handIndex = hand.findIndex(c => c.id === pendingTributeCard.card.id && c.name === pendingTributeCard.card.name);
  const finalIndex = handIndex >= 0 ? handIndex : pendingTributeCard.handIndex;

  field[zone][idx] = makeUnit(pendingTributeCard.card, zone);

  if(hand[finalIndex]){
    hand.splice(finalIndex, 1);
  }

  normalSummonUsed = true;

  logBattle(`祭品召喚：${pendingTributeCard.card.name}`);
  setStatus(`祭品召喚成功：${pendingTributeCard.card.name}`);

  tributeMode = false;
  pendingTributeCard = null;
  selectedTributes = [];
  mode = null;

  render();
  return true;
}

// 完整覆寫 slot 點擊，確保祭品模式優先於其他模式
const originalOnSlotClickFixed = onSlotClick;
onSlotClick = function(e){
  const zone = e.currentTarget.dataset.zone;
  const idx = Number(e.currentTarget.dataset.index);

  if(tributeMode || mode === "tribute"){
    if(pendingTributeCard && selectedTributes.length >= pendingTributeCard.required && !field[zone][idx]){
      completeTributeSummon(zone, idx);
      return;
    }

    selectTribute(zone, idx);
    return;
  }

  originalOnSlotClickFixed(e);
};

// 完整覆寫 cardEl，讓祭品模式與魔法模式點手牌能正常運作
const originalCardElFixed = cardEl;
cardEl = function(card, small=false){
  const el = originalCardElFixed(card, small);

  if(small){
    el.addEventListener("click", (e)=>{
      const idx = Number(el.dataset.handIndex);

      if(tributeMode || mode === "tribute"){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        chooseTributeCard(idx);
        return;
      }

      if(spellMode){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const selected = hand[idx];

        if(selected && selected.type === "magic" && selected.magic_type === "場地"){
          placeFieldMagic(idx);
        }else{
          castSpell(idx);
        }

        return;
      }
    }, true);
  }

  return el;
};

// 覆寫 render，讓祭品選擇和場地卡顯示一定正確
const originalRenderFieldTributeFixed = render;
render = function(){
  originalRenderFieldTributeFixed();

  // 祭品選擇外框
  document.querySelectorAll(".tribute-selected").forEach(el=>el.classList.remove("tribute-selected"));
  if(tributeMode || mode === "tribute"){
    selectedTributes.forEach(t=>{
      const slot = document.querySelector(`[data-zone="${t.zone}"][data-index="${t.idx}"]`);
      if(slot) slot.classList.add("tribute-selected");
    });
  }

  // 場地區顯示場地魔法卡
  const playerField = document.getElementById("playerField");
  if(playerField){
    const old = playerField.querySelector(".field-card-name");
    if(old) old.remove();

    if(playerFieldCard){
      const div = document.createElement("div");
      div.className = "field-card-name";
      div.textContent = playerFieldCard.name;
      playerField.appendChild(div);
    }
  }

  if($("tributeModeBtn")){
    $("tributeModeBtn").classList.toggle("active-btn", tributeMode || mode === "tribute");
  }

  if($("spellModeBtn")){
    $("spellModeBtn").classList.toggle("active-btn", spellMode);
  }
};

// 重新綁定按鈕
setTimeout(()=>{
  if($("tributeModeBtn")) $("tributeModeBtn").onclick = startTributeMode;
  if($("spellModeBtn")) $("spellModeBtn").onclick = toggleSpellMode;
}, 300);


// ===== tribute choose summon position fix =====
//
// 新流程：
// 1. 點手牌中需要祭品召喚的單位
// 2. 按「召喚」
// 3. 點選祭品
// 4. 按「確認獻祭」
// 5. 點選我方空格作為召喚位置

let tributeWaitingPosition = false;
let tributeSummonReadyCard = null;

function hasEnoughTributesForCurrentCard(){
  return tributeCandidate &&
    selectedTributes.length >= tributeCandidate.required;
}

// 覆寫確認獻祭：不自動召喚，改成等待選擇位置
function confirmTributeSummon(){
  if(!tributeCandidate || !tributeSelecting){
    setStatus("目前沒有待確認的祭品召喚。");
    return;
  }

  if(selectedTributes.length < tributeCandidate.required){
    setStatus(`祭品不足，還需要 ${tributeCandidate.required - selectedTributes.length} 個祭品。`);
    return;
  }

  // 重新定位手牌卡
  let handIndex = tributeCandidate.handIndex;
  if(!hand[handIndex] || hand[handIndex].id !== tributeCandidate.card.id){
    const found = hand.findIndex(c => c.id === tributeCandidate.card.id && c.name === tributeCandidate.card.name);
    handIndex = found;
  }

  if(handIndex < 0){
    setStatus("找不到要召喚的手牌。");
    return;
  }

  tributeSummonReadyCard = {
    card: hand[handIndex],
    handIndex
  };

  // 祭品先進墓地
  for(const t of selectedTributes){
    const unit = field[t.zone][t.idx];
    if(unit){
      graveyard.push(unit.card);
      field[t.zone][t.idx] = null;
    }
  }

  tributeSelecting = false;
  tributeWaitingPosition = true;
  tributeMode = true;
  mode = "tribute_position";

  selectedTributes = [];

  setStatus(`祭品已送入墓地。請點選我方一個空格來召喚 ${tributeSummonReadyCard.card.name}。`);
  render();
}

// 點選空格完成祭品召喚
function completeTributeSummonToChosenSlot(zone, idx){
  if(!tributeWaitingPosition || !tributeSummonReadyCard){
    return false;
  }

  if(!zone.startsWith("player_")){
    setStatus("只能召喚到我方場地。");
    return true;
  }

  if(field[zone][idx]){
    setStatus("該格已有單位，請選擇空格。");
    return true;
  }

  let handIndex = tributeSummonReadyCard.handIndex;
  if(!hand[handIndex] || hand[handIndex].id !== tributeSummonReadyCard.card.id){
    const found = hand.findIndex(c => c.id === tributeSummonReadyCard.card.id && c.name === tributeSummonReadyCard.card.name);
    handIndex = found;
  }

  if(handIndex < 0){
    setStatus("找不到要召喚的手牌。");
    return true;
  }

  const summonCard = hand[handIndex];

  field[zone][idx] = makeUnit(summonCard, zone);
  hand.splice(handIndex, 1);

  normalSummonUsed = true;

  logBattle(`祭品召喚：${summonCard.name} 到 ${zone.includes("front") ? "前排" : "後排"}${idx + 1}`);
  setStatus(`祭品召喚成功：${summonCard.name} 召喚到${zone.includes("front") ? "前排" : "後排"}${idx + 1}`);

  tributeCandidate = null;
  tributeSelecting = false;
  tributeWaitingPosition = false;
  tributeSummonReadyCard = null;
  tributeMode = false;
  pendingTributeCard = null;
  selectedTributes = [];
  mode = null;

  render();
  return true;
}

// 覆寫取消獻祭：支援等待位置狀態
function cancelTributeSummon(){
  tributeCandidate = null;
  tributeSelecting = false;
  tributeWaitingPosition = false;
  tributeSummonReadyCard = null;
  tributeMode = false;
  pendingTributeCard = null;
  selectedTributes = [];
  mode = null;
  setStatus("已取消祭品召喚。");
  render();
}

// 再覆寫一次 slot click，確保選位置優先
const originalOnSlotClickChoosePosition = onSlotClick;
onSlotClick = function(e){
  const zone = e.currentTarget.dataset.zone;
  const idx = Number(e.currentTarget.dataset.index);

  if(tributeWaitingPosition){
    completeTributeSummonToChosenSlot(zone, idx);
    return;
  }

  if(tributeSelecting || tributeMode || mode === "tribute"){
    toggleTributeSelection(zone, idx);
    return;
  }

  originalOnSlotClickChoosePosition(e);
};

// render 加上可召喚位置提示
const originalRenderChoosePosition = render;
render = function(){
  originalRenderChoosePosition();

  document.querySelectorAll(".tribute-summon-target").forEach(el=>el.classList.remove("tribute-summon-target"));

  if(tributeWaitingPosition){
    for(const zone of ["player_front","player_back"]){
      document.querySelectorAll(`[data-zone="${zone}"]`).forEach(slot=>{
        const idx = Number(slot.dataset.index);
        if(!field[zone][idx]){
          slot.classList.add("tribute-summon-target");
        }
      });
    }
  }

  if($("tributeConfirmBtn")){
    $("tributeConfirmBtn").disabled = !tributeSelecting || !tributeCandidate || selectedTributes.length < tributeCandidate.required;
  }

  if($("tributeCancelBtn")){
    $("tributeCancelBtn").disabled = !tributeCandidate && !tributeSelecting && !tributeWaitingPosition;
  }
};



/* ===== FINAL HOTFIX : tribute + field magic ===== */

window.TRIBUTE_STATE = {
  selectedCard:null,
  selectedHandIndex:-1,
  required:0,
  selectedTributes:[],
  waitingPosition:false
};

function hotfixResetTribute(){
  window.TRIBUTE_STATE = {
    selectedCard:null,
    selectedHandIndex:-1,
    required:0,
    selectedTributes:[],
    waitingPosition:false
  };
}

function hotfixIsTributeCard(card){
  return card && card.type === "unit" && Number(card.tribute || 0) > 0;
}

// 點手牌選祭品怪
document.addEventListener("click", function(e){

  const handCard = e.target.closest("#hand .card");
  if(!handCard) return;

  const idx = Number(handCard.dataset.handIndex);

  if(Number.isNaN(idx)) return;

  const card = hand[idx];
  if(!card) return;

  // 場地魔法
  if(card.type === "magic" && card.magic_type === "場地" && spellMode){

    e.preventDefault();
    e.stopPropagation();

    if(playerFieldCard){
      graveyard.push(playerFieldCard);
    }

    playerFieldCard = card;
    hand.splice(idx,1);

    setStatus(`已設置場地魔法：${card.name}`);
    logBattle(`設置場地魔法：${card.name}`);

    spellMode = false;

    render();
    return;
  }

  // 祭品怪選擇
  if(hotfixIsTributeCard(card)){

    e.preventDefault();
    e.stopPropagation();

    window.TRIBUTE_STATE.selectedCard = card;
    window.TRIBUTE_STATE.selectedHandIndex = idx;
    window.TRIBUTE_STATE.required = Number(card.tribute || 0);

    setStatus(`已選擇 ${card.name}，需要 ${window.TRIBUTE_STATE.required} 個祭品。請按「召喚」。`);

    render();
    return;
  }

}, true);

// 召喚按鈕
setTimeout(()=>{

  const btn = document.getElementById("tributeSummonBtn");

  if(btn){

    btn.onclick = function(){

      const S = window.TRIBUTE_STATE;

      if(!S.selectedCard){
        setStatus("請先點選手牌中的祭品單位。");
        return;
      }

      S.selectedTributes = [];
      tributeMode = true;

      setStatus(`請選擇 ${S.required} 個祭品。`);
      render();
    };
  }

}, 300);

// 點格子選祭品與召喚位置
document.addEventListener("click", function(e){

  const slot = e.target.closest(".slot");
  if(!slot) return;

  const zone = slot.dataset.zone;
  const idx = Number(slot.dataset.index);

  const S = window.TRIBUTE_STATE;

  // 等待召喚位置
  if(S.waitingPosition){

    if(!zone.startsWith("player_")){
      setStatus("只能召喚到我方場地。");
      return;
    }

    if(field[zone][idx]){
      setStatus("該格已有單位。");
      return;
    }

    let handIndex = S.selectedHandIndex;

    if(!hand[handIndex] || hand[handIndex].id !== S.selectedCard.id){
      handIndex = hand.findIndex(c => c.id === S.selectedCard.id && c.name === S.selectedCard.name);
    }

    if(handIndex < 0){
      setStatus("找不到手牌。");
      return;
    }

    field[zone][idx] = makeUnit(hand[handIndex], zone);
    hand.splice(handIndex,1);

    normalSummonUsed = true;

    setStatus(`祭品召喚成功：${S.selectedCard.name}`);
    logBattle(`祭品召喚：${S.selectedCard.name}`);

    tributeMode = false;

    hotfixResetTribute();

    render();
    return;
  }

  // 選祭品
  if(tributeMode){

    if(!zone.startsWith("player_")) return;

    const unit = field[zone][idx];
    if(!unit){
      setStatus("該格沒有單位。");
      return;
    }

    const key = zone + ":" + idx;

    const exist = S.selectedTributes.find(x=>x.key===key);

    if(exist){
      S.selectedTributes = S.selectedTributes.filter(x=>x.key!==key);
    }else{

      if(S.selectedTributes.length >= S.required){
        setStatus("祭品數量已足夠。");
        return;
      }

      S.selectedTributes.push({
        zone,idx,key
      });
    }

    setStatus(`已選 ${S.selectedTributes.length}/${S.required} 個祭品。`);

    render();
    return;
  }

}, true);

// 確認獻祭
setTimeout(()=>{

  const btn = document.getElementById("tributeConfirmBtn");

  if(btn){

    btn.onclick = function(){

      const S = window.TRIBUTE_STATE;

      if(!tributeMode){
        setStatus("目前不在祭品模式。");
        return;
      }

      if(S.selectedTributes.length < S.required){
        setStatus(`還需要 ${S.required - S.selectedTributes.length} 個祭品。`);
        return;
      }

      // 祭品進墓地
      S.selectedTributes.forEach(t=>{

        const unit = field[t.zone][t.idx];

        if(unit){
          graveyard.push(unit.card);
          field[t.zone][t.idx] = null;
        }

      });

      tributeMode = false;
      S.waitingPosition = true;

      setStatus("請點選要召喚的位置。");

      render();
    };
  }

}, 300);

// render 覆寫
const FINAL_RENDER = render;

render = function(){

  FINAL_RENDER();

  const S = window.TRIBUTE_STATE;

  // 場地魔法完整圖片
  const pf = document.getElementById("playerField");

  if(pf){

    pf.querySelectorAll(".field-magic-full").forEach(el=>el.remove());

    if(playerFieldCard){

      const div = document.createElement("div");
      div.className = "field-magic-full";

      if(playerFieldCard.image){
        div.innerHTML = `
          <img src="${playerFieldCard.image}">
          <div class="field-magic-name">${playerFieldCard.name}</div>
        `;
      }else{
        div.innerHTML = `
          <div class="field-magic-fallback">${playerFieldCard.name}</div>
        `;
      }

      div.onclick = ()=>{
        showModal(playerFieldCard);
      };

      pf.appendChild(div);
    }
  }

  // 清除舊標記
  document.querySelectorAll(".tribute-selected").forEach(el=>{
    el.classList.remove("tribute-selected");
  });

  document.querySelectorAll(".tribute-target").forEach(el=>{
    el.classList.remove("tribute-target");
  });

  // 顯示祭品
  S.selectedTributes.forEach(t=>{

    const slot = document.querySelector(`[data-zone="${t.zone}"][data-index="${t.idx}"]`);

    if(slot){
      slot.classList.add("tribute-selected");
    }

  });

  // 顯示召喚位置
  if(S.waitingPosition){

    for(const zone of ["player_front","player_back"]){

      document.querySelectorAll(`[data-zone="${zone}"]`).forEach(slot=>{

        const idx = Number(slot.dataset.index);

        if(!field[zone][idx]){
          slot.classList.add("tribute-target");
        }

      });

    }
  }
};


// ===== ABSOLUTE FIX：祭品選取時禁止卡片放大，優先選祭品 =====

window.TRIBUTE_PICKING_ACTIVE = false;

function forceStartTributePicking(){
  const S = window.TRIBUTE_STATE;

  if(!S || !S.selectedCard){
    setStatus("請先點選手牌中需要祭品召喚的單位。");
    return;
  }

  if(phase !== "召喚階段"){
    setStatus("祭品召喚只能在召喚階段使用。");
    return;
  }

  if(normalSummonUsed){
    setStatus("本回合已經召喚過。");
    return;
  }

  S.selectedTributes = [];
  S.waitingPosition = false;

  tributeMode = true;
  mode = "tribute";
  window.TRIBUTE_PICKING_ACTIVE = true;

  setStatus(`請直接點擊場上的我方單位作為祭品：0/${S.required}`);
  render();
}

function forcePickTributeFromSlot(slot){
  const S = window.TRIBUTE_STATE;
  if(!S || !S.selectedCard) return false;

  const zone = slot.dataset.zone;
  const idx = Number(slot.dataset.index);

  if(!zone || Number.isNaN(idx)) return false;

  if(!zone.startsWith("player_")){
    setStatus("只能選擇我方單位作為祭品。");
    return true;
  }

  const unit = field[zone][idx];

  if(!unit){
    setStatus("該格沒有單位，不能作為祭品。");
    return true;
  }

  const key = `${zone}:${idx}`;
  const existed = S.selectedTributes.some(t => t.key === key);

  if(existed){
    S.selectedTributes = S.selectedTributes.filter(t => t.key !== key);
  }else{
    if(S.selectedTributes.length >= S.required){
      setStatus("祭品數量已足夠，若要更換請先取消已選祭品。");
      return true;
    }

    S.selectedTributes.push({zone, idx, key});
  }

  setStatus(`已選 ${S.selectedTributes.length}/${S.required} 個祭品。選滿後按「確認獻祭」。`);
  render();
  return true;
}

// 用 window capture 比 card 自己的 showModal 更早攔截
window.addEventListener("click", function(e){
  const slot = e.target.closest && e.target.closest(".slot");

  if(!slot) return;

  const S = window.TRIBUTE_STATE;

  if(window.TRIBUTE_PICKING_ACTIVE || tributeMode || mode === "tribute"){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    forcePickTributeFromSlot(slot);
    return false;
  }
}, true);

// 重新綁定召喚按鈕，避免被舊事件覆蓋
function bindTributeButtonsAbsoluteFix(){
  const summonBtn = document.getElementById("tributeSummonBtn");
  const confirmBtn = document.getElementById("tributeConfirmBtn");
  const cancelBtn = document.getElementById("tributeCancelBtn");

  if(summonBtn){
    summonBtn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      forceStartTributePicking();
    };
  }

  if(confirmBtn){
    confirmBtn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();

      const S = window.TRIBUTE_STATE;

      if(!S || !S.selectedCard){
        setStatus("目前沒有選擇要祭品召喚的單位。");
        return;
      }

      if(!window.TRIBUTE_PICKING_ACTIVE && !tributeMode){
        setStatus("請先按「召喚」開始選擇祭品。");
        return;
      }

      if(S.selectedTributes.length < S.required){
        setStatus(`祭品不足，還需要 ${S.required - S.selectedTributes.length} 個祭品。`);
        return;
      }

      for(const t of S.selectedTributes){
        const unit = field[t.zone][t.idx];
        if(unit){
          graveyard.push(unit.card);
          field[t.zone][t.idx] = null;
        }
      }

      S.waitingPosition = true;
      window.TRIBUTE_PICKING_ACTIVE = false;
      tributeMode = false;
      mode = "tribute_position";

      setStatus(`祭品已送入墓地。請點擊我方空格來召喚 ${S.selectedCard.name}。`);
      render();
    };
  }

  if(cancelBtn){
    cancelBtn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();

      hotfixResetTribute();
      window.TRIBUTE_PICKING_ACTIVE = false;
      tributeMode = false;
      mode = null;

      setStatus("已取消祭品召喚。");
      render();
    };
  }
}

setTimeout(bindTributeButtonsAbsoluteFix, 100);
setTimeout(bindTributeButtonsAbsoluteFix, 500);
setTimeout(bindTributeButtonsAbsoluteFix, 1000);

// 覆寫 render：確保祭品標示一定顯示
const ABSOLUTE_FIX_RENDER = render;
render = function(){
  ABSOLUTE_FIX_RENDER();

  const S = window.TRIBUTE_STATE;

  document.querySelectorAll(".tribute-selected").forEach(el=>{
    el.classList.remove("tribute-selected");
  });

  if(S && S.selectedTributes){
    for(const t of S.selectedTributes){
      const slot = document.querySelector(`[data-zone="${t.zone}"][data-index="${t.idx}"]`);
      if(slot) slot.classList.add("tribute-selected");
    }
  }

  if(document.getElementById("tributeSummonBtn")){
    document.getElementById("tributeSummonBtn").disabled = !(S && S.selectedCard) || normalSummonUsed || phase !== "召喚階段";
  }

  if(document.getElementById("tributeConfirmBtn")){
    document.getElementById("tributeConfirmBtn").disabled =
      !(S && S.selectedCard) ||
      !window.TRIBUTE_PICKING_ACTIVE ||
      S.selectedTributes.length < S.required;
  }
};


// ===== ensure tribute buttons exist and bind after DOM loaded =====
document.addEventListener("DOMContentLoaded", ()=>{
  const topbar = document.querySelector(".topbar");

  function addBtn(id, text){
    if(document.getElementById(id)) return;
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "tribute-main-btn";
    btn.textContent = text;
    const status = document.getElementById("status");
    if(topbar && status){
      topbar.insertBefore(btn, status);
    }else if(topbar){
      topbar.appendChild(btn);
    }
  }

  addBtn("tributeSummonBtn", "召喚");
  addBtn("tributeConfirmBtn", "確認獻祭");
  addBtn("tributeCancelBtn", "取消獻祭");

  if(typeof bindTributeButtonsAbsoluteFix === "function"){
    bindTributeButtonsAbsoluteFix();
  }

  if(typeof hotfixResetTribute === "function"){
    // 不重置狀態，只確認按鈕功能
  }
});

setTimeout(()=>{
  if(typeof bindTributeButtonsAbsoluteFix === "function"){
    bindTributeButtonsAbsoluteFix();
  }
}, 1200);


// ===== v3 advanced phase + effect engine =====

// 正式流程：召喚階段 -> 二選一：戰術佈陣 / 進攻宣言 -> 結算階段 -> 回合結束
let actionChoiceMade = false; // summon phase ended, action path chosen
let actionPhaseType = null;   // "formation" or "attack"
let effectStack = [];

function advancedPhaseLabel(){
  if(phase === "召喚階段") return "召喚階段";
  if(phase === "戰術佈陣") return "戰術佈陣";
  if(phase === "進攻宣言") return "進攻宣言";
  if(phase === "結算階段") return "結算階段";
  if(phase === "結束階段") return "結束階段";
  return phase;
}

function openPhaseChoice(){
  if(phase !== "召喚階段"){
    setStatus("只有召喚階段結束後可以選擇戰術佈陣或進攻宣言。");
    return;
  }

  showPhaseChoicePanel();
}

function showPhaseChoicePanel(){
  let panel = document.getElementById("phaseChoicePanel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "phaseChoicePanel";
    panel.className = "phase-choice-panel";
    panel.innerHTML = `
      <div class="phase-choice-box">
        <h2>選擇下一階段</h2>
        <p>召喚階段結束後只能二選一。</p>
        <button id="chooseFormationBtn">戰術佈陣</button>
        <button id="chooseAttackBtn">進攻宣言</button>
        <button id="closePhaseChoiceBtn">取消</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById("chooseFormationBtn").onclick = ()=>{
      chooseActionPhase("formation");
    };
    document.getElementById("chooseAttackBtn").onclick = ()=>{
      chooseActionPhase("attack");
    };
    document.getElementById("closePhaseChoiceBtn").onclick = ()=>{
      panel.classList.remove("show");
    };
  }

  panel.classList.add("show");
}

function chooseActionPhase(type){
  const panel = document.getElementById("phaseChoicePanel");
  if(panel) panel.classList.remove("show");

  actionChoiceMade = true;
  actionPhaseType = type;

  if(type === "formation"){
    phase = "戰術佈陣";
    mode = "formation";
    setStatus("進入戰術佈陣：可移動我方單位，並可額外召喚1個免祭品單位或小旅人。");
  }else{
    phase = "進攻宣言";
    mode = "attack";
    setStatus("進入進攻宣言：請點擊我方非橫置單位宣告進攻。");
  }

  render();
}

function endCurrentActionPhase(){
  if(phase === "戰術佈陣"){
    phase = "結束階段";
    mode = null;
    setStatus("戰術佈陣結束，進入結束階段。");
    render();
    return;
  }

  if(phase === "進攻宣言"){
    if(hasAnyAttacker()){
      mode = "target";
      setStatus("請指定攻擊目標；若已指定完成，按結算戰鬥。");
    }else{
      phase = "結束階段";
      mode = null;
      setStatus("沒有宣告進攻，進入結束階段。");
    }
    render();
    return;
  }

  if(phase === "結算階段"){
    phase = "結束階段";
    mode = null;
    setStatus("結算階段結束，進入結束階段。");
    render();
    return;
  }

  setStatus("目前階段無法使用此按鈕。");
}

// 覆寫下一階段：召喚後進入選擇，不直接進戰術
const oldNextPhaseAdvanced = nextPhase;
nextPhase = function(){
  if(phase === "召喚階段"){
    openPhaseChoice();
    return;
  }

  if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
    endCurrentActionPhase();
    return;
  }

  if(phase === "結束階段"){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    turn++;
    phase = "召喚階段";
    mode = null;
    actionChoiceMade = false;
    actionPhaseType = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    draw(2);
    emitGameEvent("turnStart", {player:"player"});
    setStatus(`第 ${turn} 回合，進入召喚階段並抽2張。`);
    render();
    return;
  }

  oldNextPhaseAdvanced();
};

// 覆寫戰術佈陣按鈕：不能從召喚階段直接進，必須透過二選一
setTimeout(()=>{
  const formationBtn = document.getElementById("formationModeBtn");
  if(formationBtn){
    formationBtn.onclick = ()=>{
      if(phase === "召喚階段"){
        chooseActionPhase("formation");
        return;
      }
      if(phase !== "戰術佈陣"){
        setStatus("只有選擇戰術佈陣後才能使用。");
        return;
      }
      mode = "formation";
      setStatus("戰術佈陣：可拖曳我方單位移動，也可額外召喚1個免祭品單位或小旅人。");
      render();
    };
  }

  const attackBtn = document.getElementById("attackModeBtn");
  if(attackBtn){
    attackBtn.onclick = ()=>{
      if(phase === "召喚階段"){
        chooseActionPhase("attack");
        return;
      }
      if(phase !== "進攻宣言"){
        setStatus("只有選擇進攻宣言後才能使用。");
        return;
      }
      mode = "attack";
      setStatus("進攻宣言：點擊我方非橫置單位。");
      render();
    };
  }

  const phaseChoiceBtn = document.getElementById("phaseChoiceBtn");
  if(phaseChoiceBtn) phaseChoiceBtn.onclick = openPhaseChoice;

  const endActionPhaseBtn = document.getElementById("endActionPhaseBtn");
  if(endActionPhaseBtn) endActionPhaseBtn.onclick = endCurrentActionPhase;

  const effectGuideBtn = document.getElementById("effectGuideBtn");
  if(effectGuideBtn) effectGuideBtn.onclick = ()=>{
    document.getElementById("effectGuidePanel")?.classList.add("show");
  };

  const closeEffectGuide = document.getElementById("closeEffectGuide");
  if(closeEffectGuide) closeEffectGuide.onclick = ()=>{
    document.getElementById("effectGuidePanel")?.classList.remove("show");
  };
}, 500);

// 修正 summon allowed phase
const oldPlayCardAdvancedPhase = playCardFromHand;
playCardFromHand = function(handIndex, zone, idx){
  if(phase === "戰術佈陣"){
    if(mode !== "formation"){
      setStatus("戰術佈陣階段請先開啟戰術佈陣模式。");
      return;
    }
    return oldPlayCardAdvancedPhase(handIndex, zone, idx);
  }

  if(phase !== "召喚階段"){
    setStatus("目前不能召喚。");
    return;
  }

  return oldPlayCardAdvancedPhase(handIndex, zone, idx);
};

// 小旅人允許召喚階段或戰術佈陣
const oldSummonLittleTravelerAdvanced = summonLittleTraveler;
summonLittleTraveler = function(zone, idx){
  if(!(phase === "召喚階段" || phase === "戰術佈陣")){
    setStatus("只有召喚階段或戰術佈陣可以召喚小旅人。");
    return;
  }
  if(phase === "戰術佈陣" && mode !== "formation"){
    setStatus("戰術佈陣階段請先選擇戰術佈陣模式。");
    return;
  }
  return oldSummonLittleTravelerAdvanced(zone, idx);
};

// 攻擊只能在進攻宣言
const oldToggleAttackerAdvanced = toggleAttacker;
toggleAttacker = function(zone, idx){
  if(phase !== "進攻宣言"){
    setStatus("只有進攻宣言階段可以宣告進攻。");
    return;
  }
  return oldToggleAttackerAdvanced(zone, idx);
};

// 目標只能在進攻宣言
const oldHandleTargetClickAdvanced = handleTargetClick;
handleTargetClick = function(zone, idx){
  if(phase !== "進攻宣言"){
    setStatus("只有進攻宣言階段可以指定目標。");
    return;
  }
  return oldHandleTargetClickAdvanced(zone, idx);
};

// 結算後進結算階段
const oldResolveCombatAdvanced = resolveCombat;
resolveCombat = function(){
  if(phase !== "進攻宣言"){
    setStatus("只有進攻宣言階段可以結算戰鬥。");
    return;
  }
  oldResolveCombatAdvanced();
  phase = "結算階段";
  mode = null;
  emitGameEvent("combatResolved", {});
  setStatus("戰鬥已結算，進入結算階段。");
  render();
};


// ===== Basic Effect Engine =====

function pushEffect(label, fn){
  effectStack.push({label, fn});
  renderEffectStack();
}

function resolveEffectStack(){
  while(effectStack.length){
    const item = effectStack.pop();
    try{
      item.fn();
      logBattle(`效果解算：${item.label}`);
    }catch(err){
      console.error(err);
    }
  }
  renderEffectStack();
  render();
}

function renderEffectStack(){
  let panel = document.getElementById("effectStackPanel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "effectStackPanel";
    panel.className = "effect-stack-panel";
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="effect-stack-title">效果堆疊</div>
    ${
      effectStack.length
      ? effectStack.slice().reverse().map((x,i)=>`<div class="effect-stack-item">${effectStack.length-i}. ${x.label}</div>`).join("")
      : `<div class="effect-stack-empty">無待解效果</div>`
    }
  `;
}

function emitGameEvent(eventName, payload={}){
  // 場上單位觸發
  for(const zone of ["player_front","player_back","enemy_front","enemy_back"]){
    for(let i=0;i<5;i++){
      const unit = field[zone][i];
      if(unit){
        runCardEffect(unit, eventName, {...payload, zone, index:i, unit});
      }
    }
  }

  // 場地卡被動
  if(playerFieldCard){
    runFieldEffect(playerFieldCard, eventName, payload);
  }

  resolveEffectStack();
}

function runCardEffect(unit, eventName, ctx){
  const card = unit.card;
  const text = card.effect_text || "";

  if(eventName === "onSummon" && text.includes("抽1張")){
    pushEffect(`${card.name}：召喚抽1`, ()=>{
      draw(1);
    });
  }

  if(eventName === "onSummon" && text.includes("抽2張")){
    pushEffect(`${card.name}：召喚抽2`, ()=>{
      draw(2);
    });
  }

  if(eventName === "onAttack" && text.includes("加分")){
    pushEffect(`${card.name}：攻擊加分`, ()=>{
      unit.bonusScore = (unit.bonusScore || 0) + 1;
    });
  }

  if(eventName === "onDestroy" && text.includes("抽1張")){
    pushEffect(`${card.name}：離場抽1`, ()=>{
      draw(1);
    });
  }
}

function runFieldEffect(card, eventName, payload){
  const text = card.effect_text || "";

  if(eventName === "turnStart" && text.includes("抽1張")){
    pushEffect(`${card.name}：回合開始抽1`, ()=>{
      draw(1);
    });
  }
}

// hook summon event
const oldMakeUnitAdvanced = makeUnit;
makeUnit = function(card, zone){
  const unit = oldMakeUnitAdvanced(card, zone);
  setTimeout(()=>{
    emitGameEvent("onSummon", {unit, zone});
  }, 0);
  return unit;
};

// hook destroy event
const oldDestroyUnitAdvanced = destroyUnit;
destroyUnit = function(zone, idx, owner){
  const unit = field[zone][idx];
  if(unit){
    emitGameEvent("onDestroy", {unit, zone, idx, owner});
  }
  oldDestroyUnitAdvanced(zone, idx, owner);
};

// hook attack declaration
const oldToggleAttackerEffect = toggleAttacker;
toggleAttacker = function(zone, idx){
  const before = field[zone][idx]?.attacking;
  oldToggleAttackerEffect(zone, idx);
  const after = field[zone][idx]?.attacking;
  if(!before && after){
    emitGameEvent("onAttack", {unit:field[zone][idx], zone, idx});
  }
};


// 更新 UI render
const oldRenderAdvancedUI = render;
render = function(){
  oldRenderAdvancedUI();

  document.body.dataset.phase = phase;

  const phaseBadge = document.getElementById("advancedPhaseBadge") || (() => {
    const div = document.createElement("div");
    div.id = "advancedPhaseBadge";
    div.className = "advanced-phase-badge";
    document.body.appendChild(div);
    return div;
  })();

  phaseBadge.textContent = advancedPhaseLabel();

  const fBtn = document.getElementById("formationModeBtn");
  const aBtn = document.getElementById("attackModeBtn");

  if(fBtn){
    fBtn.disabled = !(phase === "召喚階段" || phase === "戰術佈陣");
    fBtn.classList.toggle("active-btn", phase === "戰術佈陣" || mode === "formation");
  }
  if(aBtn){
    aBtn.disabled = !(phase === "召喚階段" || phase === "進攻宣言");
    aBtn.classList.toggle("active-btn", phase === "進攻宣言" || mode === "attack" || mode === "target");
  }

  renderEffectStack();
};

// new game reset
const oldNewGameAdvanced = newGame;
newGame = function(){
  actionChoiceMade = false;
  actionPhaseType = null;
  effectStack = [];
  oldNewGameAdvanced();
  phase = "召喚階段";
  mode = null;
  renderEffectStack();
  render();
};



// ===== phase display + auto draw + field magic image fixed =====

// 場地魔法卡圖固定渲染，不受其他 render 覆蓋
function renderFieldMagicImageFixed(){
  const zone = document.getElementById("playerField");
  if(!zone) return;

  zone.querySelectorAll(".field-magic-full-fixed, .field-card-name, .field-card-visual, .field-magic-full").forEach(el=>el.remove());

  if(!playerFieldCard) return;

  const div = document.createElement("div");
  div.className = "field-magic-full-fixed";

  if(playerFieldCard.image){
    div.innerHTML = `
      <img src="${playerFieldCard.image}" alt="${playerFieldCard.name}">
      <div class="field-magic-title-fixed">${playerFieldCard.name}</div>
    `;
  }else{
    div.innerHTML = `
      <div class="field-magic-fallback-fixed">${playerFieldCard.name}</div>
    `;
  }

  div.onclick = (e)=>{
    e.stopPropagation();
    showModal(playerFieldCard);
  };

  zone.appendChild(div);
}

// 覆寫場地魔法放置：永遠保存完整 card，並立即重繪圖片
const oldPlaceFieldMagicPhaseFix = typeof placeFieldMagic === "function" ? placeFieldMagic : null;
placeFieldMagic = function(handIndex){
  const card = hand[handIndex];
  if(!card) return;

  if(card.type !== "magic" || card.magic_type !== "場地"){
    setStatus("這張不是場地魔法卡。");
    return;
  }

  if(playerFieldCard){
    graveyard.push(playerFieldCard);
  }

  playerFieldCard = structuredClone(card);
  hand.splice(handIndex, 1);

  if(typeof logBattle === "function"){
    logBattle(`設置場地魔法：${playerFieldCard.name}`);
  }

  setStatus(`已設置場地魔法：${playerFieldCard.name}`);
  spellMode = false;

  render();
  setTimeout(renderFieldMagicImageFixed, 0);
};

// 顯示目前階段
function getPhaseHelpText(){
  if(phase === "召喚階段"){
    return "回合開始已自動抽牌。可召喚單位、祭品召喚、設置場地魔法。結束後二選一：戰術佈陣或進攻宣言。";
  }
  if(phase === "戰術佈陣"){
    return "可移動我方單位，也可額外召喚1個免祭品單位或小旅人。此路線不能再進攻。";
  }
  if(phase === "進攻宣言"){
    return "可宣告攻擊、指定目標並結算戰鬥。此路線不能再進行戰術佈陣。";
  }
  if(phase === "結算階段"){
    return "處理戰鬥與卡片效果。完成後進入結束階段。";
  }
  if(phase === "結束階段"){
    return "檢查手牌上限與分數，按下一階段進入下一回合。";
  }
  return "請依照目前階段進行操作。";
}

function updatePhaseDisplayPanel(){
  const text = document.getElementById("phaseDisplayText");
  const help = document.getElementById("phaseHelpText");
  const panel = document.getElementById("phaseDisplayPanel");

  if(text) text.textContent = phase || "召喚階段";
  if(help) help.textContent = getPhaseHelpText();

  if(panel){
    panel.dataset.phase = phase || "召喚階段";
  }
}

// 確保抽牌在新遊戲與新回合自動執行，不需要按鈕
const oldNewGameAutoDrawFix = newGame;
newGame = function(){
  oldNewGameAutoDrawFix();

  // 原本 newGame 已抽起手4張，這裡只更新階段面板
  phase = "召喚階段";
  updatePhaseDisplayPanel();
  render();
};

// 覆寫下一階段：結束階段 -> 下一回合時自動抽2張
const oldNextPhaseAutoDrawFix = nextPhase;
nextPhase = function(){
  if(phase === "結束階段"){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    turn++;
    phase = "召喚階段";
    mode = null;
    actionChoiceMade = false;
    actionPhaseType = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    draw(2);

    if(typeof emitGameEvent === "function"){
      emitGameEvent("turnStart", {player:"player"});
    }

    setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
    render();
    return;
  }

  oldNextPhaseAutoDrawFix();
};

// 覆寫 render：最後補上場地圖片與階段面板
const oldRenderPhaseDrawFieldFix = render;
render = function(){
  oldRenderPhaseDrawFieldFix();
  renderFieldMagicImageFixed();
  updatePhaseDisplayPanel();
};

// 初始執行
setTimeout(()=>{
  renderFieldMagicImageFixed();
  updatePhaseDisplayPanel();
}, 300);


// ===== Single Main Flow Button System =====

(function(){

function $(id){ return document.getElementById(id); }

function ensureMainFlowButton(){
  let panel = document.getElementById("compactControlsFinal");
  if(!panel) return;

  let wrap = document.getElementById("mainFlowWrap");
  if(wrap) return;

  wrap = document.createElement("div");
  wrap.id = "mainFlowWrap";
  wrap.className = "main-flow-wrap";

  wrap.innerHTML = `
    <button id="mainFlowBtn" class="main-flow-btn">下一階段</button>
  `;

  panel.prepend(wrap);

  $("mainFlowBtn").onclick = handleMainFlowButton;
}

function getMainFlowLabel(){

  if(phase === "召喚階段"){
    return "選擇戰術階段";
  }

  if(phase === "戰術佈陣"){
    return "結束戰術佈陣";
  }

  if(phase === "進攻宣言"){
    return "結束進攻宣言";
  }

  if(phase === "結算階段"){
    return "進入結束階段";
  }

  if(phase === "結束階段"){
    return "開始下一回合";
  }

  return "下一階段";
}

function handleMainFlowButton(){

  // 召喚階段 -> 二選一
  if(phase === "召喚階段"){
    if(typeof openPhaseChoice === "function"){
      openPhaseChoice();
      return;
    }
  }

  // 戰術佈陣
  if(phase === "戰術佈陣"){
    phase = "結束階段";
    mode = null;
    setStatus("戰術佈陣結束，進入結束階段。");
    render();
    return;
  }

  // 進攻宣言
  if(phase === "進攻宣言"){
    phase = "結束階段";
    mode = null;
    setStatus("進攻宣言結束，進入結束階段。");
    render();
    return;
  }

  // 結算階段
  if(phase === "結算階段"){
    phase = "結束階段";
    mode = null;
    setStatus("進入結束階段。");
    render();
    return;
  }

  // 新回合
  if(phase === "結束階段"){
    if(typeof nextPhase === "function"){
      nextPhase();
      return;
    }
  }

  if(typeof nextPhase === "function"){
    nextPhase();
  }
}

// render hook
const oldRenderSingleFlow = render;

render = function(){

  oldRenderSingleFlow();

  ensureMainFlowButton();

  const btn = $("mainFlowBtn");

  if(btn){
    btn.textContent = getMainFlowLabel();
  }

  // 隱藏舊流程按鈕
  [
    "nextPhaseBtn",
    "phaseChoiceBtn",
    "endActionPhaseBtn"
  ].forEach(id=>{
    const el = $(id);
    if(el){
      el.style.display = "none";
    }
  });
};

setTimeout(()=>{
  ensureMainFlowButton();
  render();
}, 600);

})();


// ===== CONTROL VISIBILITY HARD FIX =====
// 重新建立一個獨立操作面板，不依賴原本被隱藏的 topbar/compactControlsFinal

(function(){

function createRealControlPanel(){
  let panel = document.getElementById("realControlPanel");
  if(panel) return panel;

  panel = document.createElement("div");
  panel.id = "realControlPanel";
  panel.className = "real-control-panel";

  panel.innerHTML = `
    <button id="realMainFlowBtn" class="real-main-flow">選擇戰術階段</button>

    <div class="real-control-grid">
      <button id="realFormationBtn">戰術佈陣</button>
      <button id="realAttackBtn">進攻宣言</button>
      <button id="realTargetBtn">指定目標</button>
      <button id="realResolveBtn">戰鬥結算</button>
      <button id="realTravelerBtn">小旅人</button>
      <button id="realSpellBtn">魔法</button>
      <button id="realScoreBtn">計分</button>
      <button id="realNewGameBtn">新局</button>
    </div>

    <div class="real-control-grid tribute-grid">
      <button id="realSummonBtn">召喚</button>
      <button id="realConfirmTributeBtn">確認獻祭</button>
      <button id="realCancelTributeBtn">取消獻祭</button>
    </div>
  `;

  document.body.appendChild(panel);

  bindRealControlPanel();
  return panel;
}

function realClick(id){
  const el = document.getElementById(id);
  if(el) el.click();
}

function bindRealControlPanel(){
  const bind = (id, fn)=>{
    const el = document.getElementById(id);
    if(el) el.onclick = fn;
  };

  bind("realMainFlowBtn", ()=>{
    if(phase === "召喚階段"){
      if(typeof openPhaseChoice === "function") openPhaseChoice();
      else realClick("phaseChoiceBtn");
      return;
    }

    if(phase === "戰術佈陣"){
      phase = "結束階段";
      mode = null;
      setStatus("戰術佈陣結束，進入結束階段。");
      render();
      return;
    }

    if(phase === "進攻宣言"){
      phase = "結束階段";
      mode = null;
      setStatus("進攻宣言結束，進入結束階段。");
      render();
      return;
    }

    if(phase === "結算階段"){
      phase = "結束階段";
      mode = null;
      setStatus("進入結束階段。");
      render();
      return;
    }

    if(phase === "結束階段"){
      if(typeof nextPhase === "function") nextPhase();
      return;
    }

    if(typeof nextPhase === "function") nextPhase();
  });

  bind("realFormationBtn", ()=>realClick("formationModeBtn"));
  bind("realAttackBtn", ()=>realClick("attackModeBtn"));
  bind("realTargetBtn", ()=>realClick("targetModeBtn"));
  bind("realResolveBtn", ()=>realClick("resolveCombatBtn"));
  bind("realTravelerBtn", ()=>realClick("littleTravelerBtn"));
  bind("realSpellBtn", ()=>realClick("spellModeBtn"));
  bind("realScoreBtn", ()=>realClick("scoreBtn"));
  bind("realNewGameBtn", ()=>realClick("newGameBtn"));

  bind("realSummonBtn", ()=>realClick("tributeSummonBtn"));
  bind("realConfirmTributeBtn", ()=>realClick("tributeConfirmBtn"));
  bind("realCancelTributeBtn", ()=>realClick("tributeCancelBtn"));
}

function mainFlowText(){
  if(phase === "召喚階段") return "選擇戰術階段";
  if(phase === "戰術佈陣") return "結束戰術佈陣";
  if(phase === "進攻宣言") return "結束進攻宣言";
  if(phase === "結算階段") return "進入結束階段";
  if(phase === "結束階段") return "開始下一回合";
  return "下一階段";
}

function updateRealControlPanel(){
  createRealControlPanel();

  const main = document.getElementById("realMainFlowBtn");
  if(main) main.textContent = mainFlowText();

  const setDisabled = (id, disabled)=>{
    const el = document.getElementById(id);
    if(el) el.disabled = !!disabled;
  };

  setDisabled("realFormationBtn", !(phase === "召喚階段" || phase === "戰術佈陣"));
  setDisabled("realAttackBtn", !(phase === "召喚階段" || phase === "進攻宣言"));
  setDisabled("realTargetBtn", !hasAnyAttacker || !hasAnyAttacker());
  setDisabled("realResolveBtn", !hasAnyTargetedAttack || !hasAnyTargetedAttack());

  const canTraveler =
    (phase === "召喚階段" && !normalSummonUsed) ||
    (phase === "戰術佈陣" && !tacticalSummonUsed);
  setDisabled("realTravelerBtn", !canTraveler);

  const S = window.TRIBUTE_STATE || {};
  setDisabled("realSummonBtn", !(S.selectedCard) || normalSummonUsed || phase !== "召喚階段");
  setDisabled("realConfirmTributeBtn", !(S.selectedTributes && S.required && S.selectedTributes.length >= S.required));
  setDisabled("realCancelTributeBtn", !(S.selectedCard || S.waitingPosition));

  document.body.classList.add("real-controls-enabled");
}

// render hook
const oldRenderControlVisibilityFix = render;
render = function(){
  oldRenderControlVisibilityFix();
  setTimeout(updateRealControlPanel, 0);
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(updateRealControlPanel, 300);
});

setTimeout(updateRealControlPanel, 800);
setTimeout(updateRealControlPanel, 1500);

})();


// ===== CLEAN CONTROL + PHASE STATUS FINAL =====
// 目的：
// 1. 移除右上角舊圖層，只保留一個操作面板
// 2. 移除意義不明的「選擇戰術階段」主按鈕
// 3. 用「戰術佈陣 / 進攻宣言」兩顆按鈕直接完成二選一
// 4. 中上方狀態面板真正同步目前階段與可執行動作

(function(){

function gid(id){ return document.getElementById(id); }

function removeOldControlLayers(){
  [
    "compactControlsFinal",
    "mainFlowWrap",
    "phaseChoicePanel",
    "effectStackPanel"
  ].forEach(id=>{
    const el = gid(id);
    if(el) el.remove();
  });

  // 右上舊 topbar 只留 title/status，不當控制面板
  const topbar = document.querySelector(".topbar");
  if(topbar){
    topbar.classList.add("topbar-cleaned-final");
  }
}

function forcePhaseText(){
  if(!phase) phase = "召喚階段";

  let panel = gid("phaseDisplayPanel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "phaseDisplayPanel";
    panel.className = "phase-display-panel";
    panel.innerHTML = `
      <div class="phase-main">目前階段：<span id="phaseDisplayText"></span></div>
      <div class="phase-sub" id="phaseHelpText"></div>
    `;
    document.body.appendChild(panel);
  }

  const text = gid("phaseDisplayText");
  const help = gid("phaseHelpText");

  if(text) text.textContent = phase;

  if(help){
    if(phase === "召喚階段"){
      help.textContent = "可召喚單位、祭品召喚、設置場地魔法。完成後請直接選「戰術佈陣」或「進攻宣言」。";
    }else if(phase === "戰術佈陣"){
      help.textContent = "本回合已選擇戰術佈陣。可移動單位或額外召喚小旅人；此回合不能再進攻。";
    }else if(phase === "進攻宣言"){
      help.textContent = "本回合已選擇進攻宣言。可宣告攻擊、指定目標並結算戰鬥；此回合不能再佈陣。";
    }else if(phase === "結算階段"){
      help.textContent = "處理戰鬥與效果結算。";
    }else if(phase === "結束階段"){
      help.textContent = "回合結束。可按「下一回合」進入新回合並自動抽牌。";
    }else{
      help.textContent = "請依目前階段操作。";
    }
  }

  panel.dataset.phase = phase;
  document.body.dataset.phase = phase;
}

function createCleanControlPanel(){
  let panel = gid("cleanControlPanelFinal");
  if(panel) return panel;

  panel = document.createElement("div");
  panel.id = "cleanControlPanelFinal";
  panel.className = "clean-control-panel-final";

  panel.innerHTML = `
    <div class="clean-title">操作面板</div>

    <div class="clean-main-row">
      <button id="cleanFormationBtn">戰術佈陣</button>
      <button id="cleanAttackBtn">進攻宣言</button>
    </div>

    <div class="clean-grid">
      <button id="cleanTargetBtn">指定目標</button>
      <button id="cleanResolveBtn">戰鬥結算</button>
      <button id="cleanTravelerBtn">小旅人</button>
      <button id="cleanSpellBtn">魔法</button>
      <button id="cleanScoreBtn">計分</button>
      <button id="cleanNewGameBtn">新局</button>
    </div>

    <div class="clean-tribute-row">
      <button id="cleanSummonBtn">召喚</button>
      <button id="cleanConfirmTributeBtn">確認獻祭</button>
      <button id="cleanCancelTributeBtn">取消</button>
    </div>

    <button id="cleanNextTurnBtn" class="clean-next-btn">下一回合</button>
  `;

  document.body.appendChild(panel);
  bindCleanControlPanel();
  return panel;
}

function clickHidden(id){
  const el = gid(id);
  if(el) el.click();
}

function chooseFormationDirect(){
  if(phase === "召喚階段"){
    phase = "戰術佈陣";
    mode = "formation";
    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = true;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = "formation";
    setStatus("已進入戰術佈陣。");
    render();
    return;
  }

  if(phase === "戰術佈陣"){
    mode = "formation";
    setStatus("戰術佈陣模式。");
    render();
    return;
  }

  setStatus("目前不能進入戰術佈陣。");
}

function chooseAttackDirect(){
  if(phase === "召喚階段"){
    phase = "進攻宣言";
    mode = "attack";
    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = true;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = "attack";
    setStatus("已進入進攻宣言。");
    render();
    return;
  }

  if(phase === "進攻宣言"){
    mode = "attack";
    setStatus("進攻宣言模式。");
    render();
    return;
  }

  setStatus("目前不能進入進攻宣言。");
}

function endOrNextTurn(){
  if(phase === "召喚階段"){
    setStatus("召喚階段後請直接選擇「戰術佈陣」或「進攻宣言」。");
    return;
  }

  if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
    phase = "結束階段";
    mode = null;
    setStatus("已進入結束階段。");
    render();
    return;
  }

  if(phase === "結束階段"){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    turn++;
    phase = "召喚階段";
    mode = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    draw(2);
    setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
    render();
    return;
  }
}

function bindCleanControlPanel(){
  const bind = (id, fn)=>{
    const el = gid(id);
    if(el) el.onclick = fn;
  };

  bind("cleanFormationBtn", chooseFormationDirect);
  bind("cleanAttackBtn", chooseAttackDirect);

  bind("cleanTargetBtn", ()=>clickHidden("targetModeBtn"));
  bind("cleanResolveBtn", ()=>clickHidden("resolveCombatBtn"));
  bind("cleanTravelerBtn", ()=>clickHidden("littleTravelerBtn"));
  bind("cleanSpellBtn", ()=>clickHidden("spellModeBtn"));
  bind("cleanScoreBtn", ()=>clickHidden("scoreBtn"));
  bind("cleanNewGameBtn", ()=>clickHidden("newGameBtn"));

  bind("cleanSummonBtn", ()=>clickHidden("tributeSummonBtn"));
  bind("cleanConfirmTributeBtn", ()=>clickHidden("tributeConfirmBtn"));
  bind("cleanCancelTributeBtn", ()=>clickHidden("tributeCancelBtn"));

  bind("cleanNextTurnBtn", endOrNextTurn);
}

function updateCleanControls(){
  removeOldControlLayers();
  createCleanControlPanel();
  forcePhaseText();

  const setDisabled = (id, disabled)=>{
    const el = gid(id);
    if(el) el.disabled = !!disabled;
  };

  setDisabled("cleanFormationBtn", !(phase === "召喚階段" || phase === "戰術佈陣"));
  setDisabled("cleanAttackBtn", !(phase === "召喚階段" || phase === "進攻宣言"));

  setDisabled("cleanTargetBtn", !(typeof hasAnyAttacker === "function" && hasAnyAttacker()));
  setDisabled("cleanResolveBtn", !(typeof hasAnyTargetedAttack === "function" && hasAnyTargetedAttack()));

  const canTraveler =
    (phase === "召喚階段" && !normalSummonUsed) ||
    (phase === "戰術佈陣" && !tacticalSummonUsed);
  setDisabled("cleanTravelerBtn", !canTraveler);

  const S = window.TRIBUTE_STATE || {};
  setDisabled("cleanSummonBtn", !(S.selectedCard) || normalSummonUsed || phase !== "召喚階段");
  setDisabled("cleanConfirmTributeBtn", !(S.selectedTributes && S.required && S.selectedTributes.length >= S.required));
  setDisabled("cleanCancelTributeBtn", !(S.selectedCard || S.waitingPosition));

  const next = gid("cleanNextTurnBtn");
  if(next){
    if(phase === "召喚階段") next.textContent = "請先選戰術";
    else if(phase === "結束階段") next.textContent = "下一回合";
    else next.textContent = "進入結束階段";
  }
}

// 攔截 openPhaseChoice，不再跳出多餘選擇視窗
window.openPhaseChoice = function(){
  setStatus("請直接使用右上角「戰術佈陣」或「進攻宣言」按鈕。");
};

// render hook
const OLD_RENDER_CLEAN_PHASE_FINAL = render;
render = function(){
  OLD_RENDER_CLEAN_PHASE_FINAL();
  setTimeout(updateCleanControls, 0);
};

// nextPhase hook：避免舊邏輯讓面板不更新
const OLD_NEXT_CLEAN_PHASE_FINAL = nextPhase;
nextPhase = function(){
  OLD_NEXT_CLEAN_PHASE_FINAL();
  setTimeout(updateCleanControls, 0);
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(updateCleanControls, 300);
});

setTimeout(updateCleanControls, 800);
setTimeout(updateCleanControls, 1500);

})();


// ===== FIX CLEAN PANEL BUTTONS CLICK =====
// 修正右上角「戰術佈陣 / 進攻宣言」按鈕沒有反應。
// 原因通常是舊的 render hook 或透明圖層攔截，這裡用最高優先級重新綁定。

(function(){

function gid(id){ return document.getElementById(id); }

function setPhaseDirect(nextPhaseName, nextMode){
  phase = nextPhaseName;
  mode = nextMode;

  if(typeof actionChoiceMade !== "undefined") actionChoiceMade = true;
  if(typeof actionPhaseType !== "undefined"){
    actionPhaseType = nextMode === "formation" ? "formation" : "attack";
  }

  if(nextPhaseName === "戰術佈陣"){
    setStatus("已進入戰術佈陣。可以移動我方單位，或額外召喚免祭品單位 / 小旅人。");
  }else if(nextPhaseName === "進攻宣言"){
    setStatus("已進入進攻宣言。請點擊我方非橫置單位宣告進攻。");
  }

  if(typeof forcePhaseText === "function") forcePhaseText();
  render();
}

window.forceChooseFormation = function(){
  if(phase === "召喚階段" || phase === "戰術佈陣"){
    setPhaseDirect("戰術佈陣", "formation");
    return;
  }

  setStatus("目前不能進入戰術佈陣。");
};

window.forceChooseAttack = function(){
  if(phase === "召喚階段" || phase === "進攻宣言"){
    setPhaseDirect("進攻宣言", "attack");
    return;
  }

  setStatus("目前不能進入進攻宣言。");
};

function hardBindCleanButtons(){
  const formation = gid("cleanFormationBtn");
  const attack = gid("cleanAttackBtn");

  if(formation){
    formation.disabled = !(phase === "召喚階段" || phase === "戰術佈陣");
    formation.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      window.forceChooseFormation();
    };
  }

  if(attack){
    attack.disabled = !(phase === "召喚階段" || phase === "進攻宣言");
    attack.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      window.forceChooseAttack();
    };
  }
}

// 用 capture 直接攔截，避免被舊函式覆蓋
document.addEventListener("click", function(e){
  const btn = e.target.closest && e.target.closest("#cleanFormationBtn, #cleanAttackBtn");

  if(!btn) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  if(btn.id === "cleanFormationBtn"){
    window.forceChooseFormation();
  }

  if(btn.id === "cleanAttackBtn"){
    window.forceChooseAttack();
  }

  return false;
}, true);

// render 後重新綁定
const OLD_RENDER_BUTTON_CLICK_FIX = render;
render = function(){
  OLD_RENDER_BUTTON_CLICK_FIX();

  setTimeout(()=>{
    hardBindCleanButtons();
    if(typeof forcePhaseText === "function") forcePhaseText();
  }, 0);
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(hardBindCleanButtons, 300);
});

setTimeout(hardBindCleanButtons, 800);
setTimeout(hardBindCleanButtons, 1500);

})();


// ======================================================
// HARD REBUILD：獨立階段控制系統
// 這段不依賴舊的 cleanControlPanel / compactControls
// 直接建立新面板、直接改 phase、直接更新畫面文字
// ======================================================

(function(){
  function byId(id){ return document.getElementById(id); }

  function ensurePhaseState(){
    if(typeof phase === "undefined" || !phase){
      phase = "召喚階段";
    }
  }

  function phaseHintText(p){
    if(p === "召喚階段") return "可召喚單位、祭品召喚、設置場地魔法。完成後請選擇戰術佈陣或進攻宣言。";
    if(p === "戰術佈陣") return "已選擇戰術佈陣。本回合可移動單位與額外召喚小旅人，不能再進攻。";
    if(p === "進攻宣言") return "已選擇進攻宣言。本回合可宣告攻擊、指定目標並結算戰鬥，不能再佈陣。";
    if(p === "結算階段") return "正在處理戰鬥與效果結算。";
    if(p === "結束階段") return "回合結束。按下一回合會自動抽牌並回到召喚階段。";
    return "請依照目前階段操作。";
  }

  function ensurePhasePanelHard(){
    let panel = byId("phaseDisplayPanelHard");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "phaseDisplayPanelHard";
      panel.className = "phase-display-panel-hard";
      panel.innerHTML = `
        <div class="phase-hard-title">目前階段：<span id="phaseTextHard">召喚階段</span></div>
        <div class="phase-hard-help" id="phaseHelpHard"></div>
      `;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function updatePhasePanelHard(){
    ensurePhaseState();
    const panel = ensurePhasePanelHard();
    const text = byId("phaseTextHard");
    const help = byId("phaseHelpHard");

    if(text) text.textContent = phase;
    if(help) help.textContent = phaseHintText(phase);

    panel.dataset.phase = phase;
    document.body.dataset.phase = phase;
  }

  function ensureControlPanelHard(){
    let panel = byId("controlPanelHard");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "controlPanelHard";
      panel.className = "control-panel-hard";
      panel.innerHTML = `
        <div class="control-hard-title">操作</div>
        <div class="control-hard-main">
          <button id="hardFormationBtn" type="button">戰術佈陣</button>
          <button id="hardAttackBtn" type="button">進攻宣言</button>
        </div>
        <div class="control-hard-grid">
          <button id="hardTargetBtn" type="button">指定目標</button>
          <button id="hardResolveBtn" type="button">戰鬥結算</button>
          <button id="hardTravelerBtn" type="button">小旅人</button>
          <button id="hardSpellBtn" type="button">魔法</button>
          <button id="hardScoreBtn" type="button">計分</button>
          <button id="hardNewGameBtn" type="button">新局</button>
        </div>
        <div class="control-hard-grid tribute">
          <button id="hardSummonBtn" type="button">召喚</button>
          <button id="hardConfirmBtn" type="button">確認</button>
          <button id="hardCancelBtn" type="button">取消</button>
        </div>
        <button id="hardEndBtn" class="hard-end-btn" type="button">進入結束階段</button>
      `;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function safeRender(){
    try{
      if(typeof render === "function"){
        render();
      }
    }catch(err){
      console.error("render failed", err);
    }
    updatePhasePanelHard();
    updateButtonsHard();
  }

  function setPhaseHard(nextPhase, nextMode){
    phase = nextPhase;
    mode = nextMode || null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = (nextPhase === "戰術佈陣" || nextPhase === "進攻宣言");
    if(typeof actionPhaseType !== "undefined"){
      actionPhaseType =
        nextPhase === "戰術佈陣" ? "formation" :
        nextPhase === "進攻宣言" ? "attack" : null;
    }

    if(nextPhase === "戰術佈陣"){
      setStatus("已進入戰術佈陣。");
    }else if(nextPhase === "進攻宣言"){
      setStatus("已進入進攻宣言。");
    }else if(nextPhase === "結束階段"){
      setStatus("已進入結束階段。");
    }else if(nextPhase === "召喚階段"){
      setStatus("已進入召喚階段。");
    }

    safeRender();
  }

  function chooseFormationHard(){
    ensurePhaseState();
    if(phase !== "召喚階段" && phase !== "戰術佈陣"){
      setStatus("目前不能進入戰術佈陣。");
      updatePhasePanelHard();
      return;
    }
    setPhaseHard("戰術佈陣", "formation");
  }

  function chooseAttackHard(){
    ensurePhaseState();
    if(phase !== "召喚階段" && phase !== "進攻宣言"){
      setStatus("目前不能進入進攻宣言。");
      updatePhasePanelHard();
      return;
    }
    setPhaseHard("進攻宣言", "attack");
  }

  function endPhaseHard(){
    ensurePhaseState();

    if(phase === "召喚階段"){
      setStatus("召喚階段後請先選擇：戰術佈陣 或 進攻宣言。");
      updatePhasePanelHard();
      return;
    }

    if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
      setPhaseHard("結束階段", null);
      return;
    }

    if(phase === "結束階段"){
      while(hand.length > 10){
        graveyard.push(hand.pop());
      }

      turn++;
      phase = "召喚階段";
      mode = null;
      normalSummonUsed = false;
      tacticalSummonUsed = false;
      selectedAttacker = null;

      if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
      if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

      draw(2);
      setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
      safeRender();
      return;
    }
  }

  function clickOriginal(id){
    const el = byId(id);
    if(el) el.click();
  }

  function updateButtonsHard(){
    ensureControlPanelHard();

    const setDisabled = (id, disabled)=>{
      const b = byId(id);
      if(b) b.disabled = !!disabled;
    };

    setDisabled("hardFormationBtn", !(phase === "召喚階段" || phase === "戰術佈陣"));
    setDisabled("hardAttackBtn", !(phase === "召喚階段" || phase === "進攻宣言"));

    setDisabled("hardTargetBtn", !(typeof hasAnyAttacker === "function" && hasAnyAttacker()));
    setDisabled("hardResolveBtn", !(typeof hasAnyTargetedAttack === "function" && hasAnyTargetedAttack()));

    const canTraveler =
      (phase === "召喚階段" && !normalSummonUsed) ||
      (phase === "戰術佈陣" && !tacticalSummonUsed);

    setDisabled("hardTravelerBtn", !canTraveler);

    const S = window.TRIBUTE_STATE || {};
    setDisabled("hardSummonBtn", !(S.selectedCard) || normalSummonUsed || phase !== "召喚階段");
    setDisabled("hardConfirmBtn", !(S.selectedTributes && S.required && S.selectedTributes.length >= S.required));
    setDisabled("hardCancelBtn", !(S.selectedCard || S.waitingPosition));

    const end = byId("hardEndBtn");
    if(end){
      end.textContent = phase === "結束階段" ? "下一回合" : "進入結束階段";
      if(phase === "召喚階段") end.textContent = "先選戰術";
    }
  }

  function bindHardControls(){
    ensureControlPanelHard();

    byId("hardFormationBtn").onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); chooseFormationHard(); };
    byId("hardAttackBtn").onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); chooseAttackHard(); };

    byId("hardTargetBtn").onclick = ()=>clickOriginal("targetModeBtn");
    byId("hardResolveBtn").onclick = ()=>{
      clickOriginal("resolveCombatBtn");
      if(phase === "進攻宣言") setPhaseHard("結算階段", null);
    };
    byId("hardTravelerBtn").onclick = ()=>clickOriginal("littleTravelerBtn");
    byId("hardSpellBtn").onclick = ()=>clickOriginal("spellModeBtn");
    byId("hardScoreBtn").onclick = ()=>clickOriginal("scoreBtn");
    byId("hardNewGameBtn").onclick = ()=>clickOriginal("newGameBtn");

    byId("hardSummonBtn").onclick = ()=>clickOriginal("tributeSummonBtn");
    byId("hardConfirmBtn").onclick = ()=>clickOriginal("tributeConfirmBtn");
    byId("hardCancelBtn").onclick = ()=>clickOriginal("tributeCancelBtn");

    byId("hardEndBtn").onclick = (e)=>{ e.preventDefault(); e.stopPropagation(); endPhaseHard(); };
  }

  // 最高層 click 捕捉，確保按鈕真的有反應
  window.addEventListener("click", function(e){
    const id = e.target && e.target.id;
    if(id === "hardFormationBtn"){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      chooseFormationHard();
    }
    if(id === "hardAttackBtn"){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      chooseAttackHard();
    }
  }, true);

  // 隱藏所有舊控制面板，避免重疊與攔截
  function hideOldPanelsHard(){
    [
      "cleanControlPanelFinal",
      "realControlPanel",
      "compactControlsFinal",
      "mainFlowWrap",
      "phaseChoicePanel",
      "phaseDisplayPanel"
    ].forEach(id=>{
      const el = byId(id);
      if(el){
        el.style.display = "none";
        el.style.pointerEvents = "none";
      }
    });
  }

  const previousRenderHardRebuild = render;
  render = function(){
    try{
      previousRenderHardRebuild();
    }catch(err){
      console.error("old render failed", err);
    }
    hideOldPanelsHard();
    ensureControlPanelHard();
    bindHardControls();
    updatePhasePanelHard();
    updateButtonsHard();
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    hideOldPanelsHard();
    ensurePhaseState();
    ensurePhasePanelHard();
    ensureControlPanelHard();
    bindHardControls();
    updatePhasePanelHard();
    updateButtonsHard();
  });

  setTimeout(()=>{
    hideOldPanelsHard();
    ensurePhaseState();
    ensurePhasePanelHard();
    ensureControlPanelHard();
    bindHardControls();
    updatePhasePanelHard();
    updateButtonsHard();
  }, 500);

  setTimeout(()=>{
    hideOldPanelsHard();
    bindHardControls();
    updatePhasePanelHard();
    updateButtonsHard();
  }, 1500);
})();



function xlwFrontlineHasEmptyForHandSummon(){
  return field && Array.isArray(field.player_front) && field.player_front.some(v => !v);
}

function xlwIsIllegalBackHandSummon(zone){
  return zone === "player_back" && xlwFrontlineHasEmptyForHandSummon();
}

function xlwBlockBackHandSummon(){
  setStatus("前排仍有空位時，手牌單位不能召喚至後排。");
}

// ======================================================
// RESTORE SUMMON + ATTACK DECLARATION FINAL
// - 復原普通召喚：拖曳手牌免祭品單位到我方空格
// - 進攻宣言：點我方非橫置單位，逆時針轉角度
// - 移除魔法按鈕
// ======================================================

(function(){
  function gid(id){ return document.getElementById(id); }

  function isPlayerZone(zone){
    return zone === "player_front" || zone === "player_back";
  }

  function restoreSummonFromHand(handIndex, zone, idx){
    const card = hand[handIndex];

    if(!card){
      setStatus("找不到手牌。");
      return;
    }

    // ===== 前排優先規則 =====
    const frontHasEmpty =
      Array.isArray(field.player_front) &&
      field.player_front.some(v => !v);

    if(zone === "player_back" && frontHasEmpty){
      setStatus("前排仍有空位時，手牌單位不能召喚至後排。");
      return;
    }
    // ======================

    if(!isPlayerZone(zone)){
      setStatus("只能召喚到我方前排或後排。");
      return;
    }

    if(field[zone][idx]){
      setStatus("該格已有單位。");
      return;
    }

    if(card.type !== "unit"){
      setStatus("這張不是單位卡。");
      return;
    }

    if(Number(card.tribute || 0) > 0){
      setStatus("此單位需要祭品，請使用祭品召喚流程。");
      return;
    }

    if(phase === "召喚階段"){
      if(normalSummonUsed){
        setStatus("本回合召喚階段已召喚過。");
        return;
      }
      normalSummonUsed = true;
    }else if(phase === "戰術佈陣"){
      if(tacticalSummonUsed){
        setStatus("戰術佈陣已額外召喚過。");
        return;
      }
      tacticalSummonUsed = true;
    }else{
      setStatus("目前階段不能召喚。");
      return;
    }

    field[zone][idx] = makeUnit(card, zone);
    hand.splice(handIndex, 1);

    setStatus(`召喚成功：${card.name}`);
    if(typeof logBattle === "function") logBattle(`召喚：${card.name}`);

    render();
  }

  // 重新建立拖曳事件：手牌 -> 場上空格
  function bindSummonDragDrop(){
    document.querySelectorAll("#hand .card").forEach(cardEl=>{
      cardEl.setAttribute("draggable", "true");

      cardEl.ondragstart = (e)=>{
        const idx = Number(cardEl.dataset.handIndex);
        dragged = {type:"hand", index:idx};
        e.dataTransfer.setData("text/plain", String(idx));
      };
    });

    document.querySelectorAll(".slot").forEach(slot=>{
      slot.ondragover = (e)=>{
        e.preventDefault();
      };

      slot.ondrop = (e)=>{
        e.preventDefault();
        e.stopPropagation();

        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        if(dragged && dragged.type === "hand"){
          restoreSummonFromHand(dragged.index, zone, idx);
          dragged = null;
          return;
        }

        // 保留原本場上移動
        if(dragged && dragged.type === "field" && typeof moveFieldUnit === "function"){
          moveFieldUnit(dragged.zone, dragged.index, zone, idx);
          dragged = null;
          render();
        }
      };
    });
  }

  // 點手牌後如果再點空格，也可召喚（給觸控裝置用）
  let selectedHandForSummon = null;

  window.addEventListener("click", function(e){
    const handCard = e.target.closest && e.target.closest("#hand .card");
    if(handCard){
      const idx = Number(handCard.dataset.handIndex);
      const card = hand[idx];

      // 非祭品、非魔法時，點一下作為待召喚手牌
      if(card && card.type === "unit" && Number(card.tribute || 0) <= 0){
        selectedHandForSummon = idx;
        setStatus(`已選擇 ${card.name}。可拖曳或點擊我方空格召喚。`);
      }
      return;
    }

    const slot = e.target.closest && e.target.closest(".slot");
    if(slot && selectedHandForSummon !== null){
      const zone = slot.dataset.zone;
      const idx = Number(slot.dataset.index);
      restoreSummonFromHand(selectedHandForSummon, zone, idx);
      selectedHandForSummon = null;
    }
  }, false);

  // 進攻宣言：捕捉 slot 點擊，直接宣告/取消進攻
  function toggleAttackDeclaration(slot){
    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(phase !== "進攻宣言"){
      return false;
    }

    if(!isPlayerZone(zone)){
      setStatus("只能選擇我方單位進攻。");
      return true;
    }

    const unit = field[zone][idx];

    if(!unit){
      setStatus("該格沒有單位。");
      return true;
    }

    if(unit.tapped){
      setStatus("橫置單位不能進攻。");
      return true;
    }

    unit.attacking = !unit.attacking;

    if(!unit.attacking){
      unit.target = null;
      setStatus(`${unit.card.name} 取消進攻。`);
    }else{
      setStatus(`${unit.card.name} 宣告進攻。請按「指定目標」選擇目標。`);
      if(typeof logBattle === "function") logBattle(`${unit.card.name} 宣告進攻`);
    }

    mode = "attack";
    render();
    return true;
  }

  // 用最高優先級避免 showModal 搶走點擊
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(phase === "進攻宣言" && mode !== "target"){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toggleAttackDeclaration(slot);
      return false;
    }
  }, true);

  // 指定目標時保留原邏輯，但阻止放大圖
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(phase === "進攻宣言" && mode === "target"){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const fakeEvent = { currentTarget: slot };
      if(typeof handleTargetClick === "function"){
        handleTargetClick(fakeEvent.currentTarget.dataset.zone, Number(fakeEvent.currentTarget.dataset.index));
      }

      return false;
    }
  }, true);

  // 隱藏魔法按鈕：右上硬重建面板與舊按鈕都隱藏
  function removeMagicButtonFinal(){
    ["hardSpellBtn","cleanSpellBtn","realSpellBtn","spellModeBtn"].forEach(id=>{
      const el = gid(id);
      if(el){
        el.style.display = "none";
        el.disabled = true;
      }
    });

    // 也移除文字為「魔法」的按鈕
    document.querySelectorAll("button").forEach(btn=>{
      if(btn.textContent.trim() === "魔法"){
        btn.style.display = "none";
        btn.disabled = true;
      }
    });
  }

  // 補正右上面板按鈕狀態
  function updateAttackSummonUIFinal(){
    removeMagicButtonFinal();

    const attackBtn = gid("hardAttackBtn");
    const formationBtn = gid("hardFormationBtn");

    if(attackBtn){
      attackBtn.disabled = !(phase === "召喚階段" || phase === "進攻宣言");
    }
    if(formationBtn){
      formationBtn.disabled = !(phase === "召喚階段" || phase === "戰術佈陣");
    }
  }

  const OLD_RENDER_RESTORE_SUMMON_ATTACK = render;
  render = function(){
    OLD_RENDER_RESTORE_SUMMON_ATTACK();

    setTimeout(()=>{
      bindSummonDragDrop();
      updateAttackSummonUIFinal();

      // 確保進攻狀態有 class
      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);
        const unit = field?.[zone]?.[idx];

        slot.classList.toggle("attacking-slot", !!(unit && unit.attacking));
        slot.classList.toggle("tapped-slot", !!(unit && unit.tapped));
      });
    }, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      bindSummonDragDrop();
      removeMagicButtonFinal();
    }, 500);
  });

  setTimeout(()=>{
    bindSummonDragDrop();
    removeMagicButtonFinal();
  }, 1000);

})();


// ======================================================
// STARTING HAND MULLIGAN：起手換牌系統
// 規則：
// 1. 遊戲開始先抽4張
// 2. 可選任意張面朝下展示
// 3. 從牌庫抽同樣張數
// 4. 將展示的牌洗回牌庫
// 5. 正式進第一回合，再抽2張，起手會變6張
// ======================================================

let mulliganActive = false;
let mulliganDone = false;
let selectedMulliganIndexes = new Set();

function startMulliganPhase(){
  mulliganActive = true;
  mulliganDone = false;
  selectedMulliganIndexes = new Set();

  phase = "起手換牌";
  mode = "mulligan";

  setStatus("起手換牌：點選任意張手牌面朝下展示，再按「確認換牌」。不想換可直接確認。");
  render();
  showMulliganPanel();
}

function showMulliganPanel(){
  let panel = document.getElementById("mulliganPanel");
  if(!panel){
    panel = document.createElement("div");
    panel.id = "mulliganPanel";
    panel.className = "mulligan-panel";
    panel.innerHTML = `
      <div class="mulligan-title">起手換牌</div>
      <div class="mulligan-text">
        可選任意張手牌面朝下展示，抽同樣張數，最後洗回牌庫。
        完成後正式進入第一回合並自動抽2張。
      </div>
      <div class="mulligan-count" id="mulliganCount">已選 0 張</div>
      <div class="mulligan-actions">
        <button id="confirmMulliganBtn">確認換牌</button>
        <button id="clearMulliganBtn">取消選取</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById("confirmMulliganBtn").onclick = confirmMulligan;
    document.getElementById("clearMulliganBtn").onclick = ()=>{
      selectedMulliganIndexes.clear();
      setStatus("已取消所有起手換牌選取。");
      render();
    };
  }

  panel.classList.add("show");
  updateMulliganPanel();
}

function hideMulliganPanel(){
  const panel = document.getElementById("mulliganPanel");
  if(panel) panel.classList.remove("show");
}

function updateMulliganPanel(){
  const count = document.getElementById("mulliganCount");
  if(count){
    count.textContent = `已選 ${selectedMulliganIndexes.size} 張`;
  }
}

function toggleMulliganCard(index){
  if(!mulliganActive) return;

  if(selectedMulliganIndexes.has(index)){
    selectedMulliganIndexes.delete(index);
  }else{
    selectedMulliganIndexes.add(index);
  }

  setStatus(`起手換牌：已選 ${selectedMulliganIndexes.size} 張。`);
  render();
}

function confirmMulligan(){
  if(!mulliganActive) return;

  const indexes = [...selectedMulliganIndexes].sort((a,b)=>b-a);
  const selectedCards = [];

  // 先把選到的手牌拿出來，視為面朝下展示
  for(const idx of indexes){
    if(hand[idx]){
      selectedCards.push(hand[idx]);
      hand.splice(idx,1);
    }
  }

  // 抽同樣張數
  const drawCount = selectedCards.length;
  for(let i=0;i<drawCount;i++){
    if(deck.length > 0){
      hand.push(deck.pop());
    }
  }

  // 展示牌洗回牌庫
  for(const c of selectedCards){
    deck.push(c);
  }

  shuffle(deck);

  // 正式進第一回合，抽2張
  draw(2);

  mulliganActive = false;
  mulliganDone = true;
  selectedMulliganIndexes.clear();

  phase = "召喚階段";
  mode = null;
  turn = 1;
  normalSummonUsed = false;
  tacticalSummonUsed = false;

  hideMulliganPanel();

  setStatus(`起手換牌完成：換 ${drawCount} 張。第一回合開始，已自動抽2張。`);
  if(typeof logBattle === "function"){
    logBattle(`起手換牌：換 ${drawCount} 張，第一回合抽2張`);
  }

  render();
}

// 覆寫 newGame：新局只先抽4張，進起手換牌，不立刻正式開始
const oldNewGameMulligan = newGame;
newGame = function(){
  const deckName = document.getElementById("deckSelect") ? document.getElementById("deckSelect").value : Object.keys(decks)[0];
  deck = decks[deckName].map(id => structuredClone(allCards.find(c=>c.id===id))).filter(Boolean);
  shuffle(deck);

  hand = [];
  graveyard = [];
  enemyGraveyard = [];

  field.player_front = [null,null,null,null,null];
  field.player_back = [null,null,null,null,null];
  field.enemy_front = [null,null,null,null,null];
  field.enemy_back = [null,null,null,null,null];

  turn = 0;
  normalSummonUsed = false;
  tacticalSummonUsed = false;
  selectedAttacker = null;

  if(typeof playerBonusScore !== "undefined") playerBonusScore = 0;
  if(typeof enemyBonusScore !== "undefined") enemyBonusScore = 0;
  if(typeof battleLog !== "undefined") battleLog = [];

  draw(4);

  // 防止開局抽牌異常
  if(hand.length === 0 && deck.length > 0){
    draw(4);
  }

  startMulliganPhase();
};

// hand render 後補上起手換牌樣式與點擊
const oldRenderMulligan = render;
render = function(){
  oldRenderMulligan();

  if(mulliganActive){
    document.querySelectorAll("#hand .card").forEach(card=>{
      const idx = Number(card.dataset.handIndex);

      card.classList.add("mulligan-card");

      if(selectedMulliganIndexes.has(idx)){
        card.classList.add("mulligan-selected");
      }else{
        card.classList.remove("mulligan-selected");
      }

      card.onclick = (e)=>{
        e.preventDefault();
        e.stopPropagation();
        toggleMulliganCard(idx);
      };
    });

    showMulliganPanel();
  }

  updateMulliganPanel();

  const phaseText = document.getElementById("phaseTextHard") || document.getElementById("phaseDisplayText");
  if(phaseText && mulliganActive){
    phaseText.textContent = "起手換牌";
  }

  const help = document.getElementById("phaseHelpHard") || document.getElementById("phaseHelpText");
  if(help && mulliganActive){
    help.textContent = "選擇任意張手牌換牌。完成後正式進第一回合並自動抽2張。";
  }
};

// 起手換牌階段禁止其他操作
const oldRestoreSummonFromHand_Maybe = typeof restoreSummonFromHand !== "undefined" ? restoreSummonFromHand : null;
if(oldRestoreSummonFromHand_Maybe){
  restoreSummonFromHand = function(handIndex, zone, idx){
    if(mulliganActive){
      setStatus("起手換牌中，請先確認換牌。");
      return;
    }
    return oldRestoreSummonFromHand_Maybe(handIndex, zone, idx);
  };
}

// 隱藏/禁用右上操作直到換牌完成
const oldUpdateButtonsMulligan = typeof updateButtonsHard === "function" ? updateButtonsHard : null;
if(oldUpdateButtonsMulligan){
  updateButtonsHard = function(){
    oldUpdateButtonsMulligan();
    if(mulliganActive){
      document.querySelectorAll("#controlPanelHard button").forEach(btn=>{
        if(btn.id !== "hardNewGameBtn"){
          btn.disabled = true;
        }
      });
    }
  };
}


// ======================================================
// FINAL DECK VISUAL RESTORE
// 雙方牌庫顯示小旅人卡背 + 厚度
// 這版用最高優先權固定，不再被後續 render 覆蓋
// ======================================================

(function(){

function gid(id){ return document.getElementById(id); }

function getDeckCountPlayer(){
  try{
    return Array.isArray(deck) ? deck.length : 0;
  }catch(e){
    return 0;
  }
}

function getDeckCountEnemy(){
  try{
    if(typeof enemyDeckCards !== "undefined" && Array.isArray(enemyDeckCards)){
      return enemyDeckCards.length;
    }

    if(typeof enemyDeck !== "undefined" && Array.isArray(enemyDeck)){
      return enemyDeck.length;
    }

    return Math.max(0, 20 - ((enemyGraveyard && enemyGraveyard.length) || 0));
  }catch(e){
    return 20;
  }
}

function createDeckVisual(zoneId, count, label){
  const zone = gid(zoneId);
  if(!zone) return;

  // 清除舊牌庫圖層
  zone.querySelectorAll(
    ".deck-stack-final-fixed,.deck-stack-final,.deck-stack,.deck-card-final"
  ).forEach(el=>el.remove());

  const wrap = document.createElement("div");
  wrap.className = "deck-stack-final-fixed";

  const labelDiv = document.createElement("div");
  labelDiv.className = "deck-fixed-label";
  labelDiv.textContent = label || "牌庫";
  wrap.appendChild(labelDiv);

  if(count <= 0){
    const empty = document.createElement("div");
    empty.className = "deck-fixed-empty";
    empty.textContent = "空";
    wrap.appendChild(empty);
    zone.appendChild(wrap);
    return;
  }

  let layers = 1;

  if(count >= 5) layers = 2;
  if(count >= 10) layers = 3;
  if(count >= 15) layers = 4;
  if(count >= 20) layers = 5;
  if(count >= 30) layers = 6;

  for(let i=1;i<=layers;i++){
    const c = document.createElement("div");
    c.className = `deck-fixed-card layer-${i}`;
    wrap.appendChild(c);
  }

  const counter = document.createElement("div");
  counter.className = "deck-fixed-count";
  counter.textContent = count;
  wrap.appendChild(counter);

  zone.appendChild(wrap);
}

function renderDeckVisualsFinalFixed(){
  createDeckVisual("playerDeck", getDeckCountPlayer(), "我方");
  createDeckVisual("enemyDeck", getDeckCountEnemy(), "對手");
}

// render hook
const OLD_RENDER_DECK_FINAL_FIXED = render;

render = function(){
  OLD_RENDER_DECK_FINAL_FIXED();

  setTimeout(()=>{
    renderDeckVisualsFinalFixed();
  },0);
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(renderDeckVisualsFinalFixed, 300);
});

setTimeout(renderDeckVisualsFinalFixed, 1000);
setTimeout(renderDeckVisualsFinalFixed, 2000);

})();


// ======================================================
// MULLIGAN MULTI SELECT FIX
// 修正起手換牌只能選一張：改為可自由切換多張
// ======================================================

(function(){

function hardToggleMulliganIndex(idx){
  if(!mulliganActive) return;

  if(selectedMulliganIndexes.has(idx)){
    selectedMulliganIndexes.delete(idx);
  }else{
    selectedMulliganIndexes.add(idx);
  }

  setStatus(`起手換牌：已選 ${selectedMulliganIndexes.size} 張。可繼續選擇其他牌。`);

  // 不呼叫完整 render，避免重繪時只留下最後一張狀態
  updateMulliganVisualOnly();
  if(typeof updateMulliganPanel === "function") updateMulliganPanel();
}

function updateMulliganVisualOnly(){
  document.querySelectorAll("#hand .card").forEach(card=>{
    const idx = Number(card.dataset.handIndex);

    card.classList.add("mulligan-card");

    if(selectedMulliganIndexes.has(idx)){
      card.classList.add("mulligan-selected");
    }else{
      card.classList.remove("mulligan-selected");
    }
  });

  const count = document.getElementById("mulliganCount");
  if(count){
    count.textContent = `已選 ${selectedMulliganIndexes.size} 張`;
  }
}

// 用最高優先權攔截手牌點擊，避免 showModal 或其他 hand click 覆蓋
window.addEventListener("click", function(e){
  if(!mulliganActive) return;

  const card = e.target.closest && e.target.closest("#hand .card");
  if(!card) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  const idx = Number(card.dataset.handIndex);
  if(Number.isNaN(idx)) return;

  hardToggleMulliganIndex(idx);

  return false;
}, true);

// 覆寫確認換牌：支援複數張
window.confirmMulligan = function(){
  if(!mulliganActive) return;

  const indexes = Array.from(selectedMulliganIndexes)
    .filter(i => Number.isInteger(i) && hand[i])
    .sort((a,b)=>b-a);

  const selectedCards = [];

  for(const idx of indexes){
    selectedCards.push(hand[idx]);
    hand.splice(idx,1);
  }

  const drawCount = selectedCards.length;

  for(let i=0;i<drawCount;i++){
    if(deck.length > 0){
      hand.push(deck.pop());
    }
  }

  for(const c of selectedCards){
    deck.push(c);
  }

  shuffle(deck);

  draw(2);

  mulliganActive = false;
  mulliganDone = true;
  selectedMulliganIndexes.clear();

  phase = "召喚階段";
  mode = null;
  turn = 1;
  normalSummonUsed = false;
  tacticalSummonUsed = false;

  if(typeof hideMulliganPanel === "function") hideMulliganPanel();

  setStatus(`起手換牌完成：換 ${drawCount} 張。第一回合開始，已自動抽2張。`);
  if(typeof logBattle === "function"){
    logBattle(`起手換牌：換 ${drawCount} 張，第一回合抽2張`);
  }

  render();
};

// 重新綁定確認/清除按鈕，避免仍用舊函式
function bindMulliganButtonsMulti(){
  const confirm = document.getElementById("confirmMulliganBtn");
  if(confirm){
    confirm.onclick = window.confirmMulligan;
  }

  const clear = document.getElementById("clearMulliganBtn");
  if(clear){
    clear.onclick = ()=>{
      selectedMulliganIndexes.clear();
      setStatus("已取消所有起手換牌選取。");
      updateMulliganVisualOnly();
    };
  }
}

// render 後恢復多選視覺
const OLD_RENDER_MULLIGAN_MULTI_FIX = render;
render = function(){
  OLD_RENDER_MULLIGAN_MULTI_FIX();

  if(mulliganActive){
    setTimeout(()=>{
      updateMulliganVisualOnly();
      bindMulliganButtonsMulti();
    },0);
  }
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(bindMulliganButtonsMulti, 300);
});
setTimeout(bindMulliganButtonsMulti, 1000);

})();


// ======================================================
// TACTICAL FORMATION SUMMON FIX
// ======================================================

(function(){

window.restoreSummonFromHand = function(handIndex, zone, idx){

  const card = hand[handIndex];

  if(!card){
    setStatus("找不到手牌。");
    return;
  }

  if(card.type !== "unit"){
    setStatus("只有單位卡能召喚。");
    return;
  }

  if(Number(card.tribute || 0) > 0){
    setStatus("此單位需要祭品召喚。");
    return;
  }

  if(!["player_front","player_back"].includes(zone)){
    setStatus("只能召喚到我方區域。");
    return;
  }

  if(field[zone][idx]){
    setStatus("該位置已有單位。");
    return;
  }

  let canSummon = false;

  if(phase === "召喚階段" && !normalSummonUsed){
    normalSummonUsed = true;
    canSummon = true;
  }

  if(phase === "戰術佈陣" && !tacticalSummonUsed){
    tacticalSummonUsed = true;
    canSummon = true;
  }

  if(!canSummon){
    setStatus("目前不能召喚單位。");
    return;
  }

  field[zone][idx] = makeUnit(card, zone);
  hand.splice(handIndex, 1);

  setStatus(`召喚成功：${card.name}`);

  if(typeof logBattle === "function"){
    logBattle(`召喚：${card.name}`);
  }

  render();
};

function patchTravelerButton(){

  [
    "hardTravelerBtn",
    "cleanTravelerBtn",
    "realTravelerBtn"
  ].forEach(id=>{

    const btn = document.getElementById(id);
    if(!btn) return;

    btn.onclick = function(e){

      e.preventDefault();
      e.stopPropagation();

      const can =
        (phase === "召喚階段" && !normalSummonUsed) ||
        (phase === "戰術佈陣" && !tacticalSummonUsed);

      if(!can){
        setStatus("目前不能召喚小旅人。");
        return;
      }

      let placed = false;

      ["player_front","player_back"].forEach(zone=>{

        for(let i=0;i<field[zone].length;i++){

          if(!field[zone][i] && !placed){

            const traveler = {
              id:"little_traveler_token",
              name:"小旅人",
              type:"unit",
              atk:1,
              stars:1,
              image:"/static/little_traveler_back.jpeg"
            };

            field[zone][i] = makeUnit(traveler, zone);

            if(phase === "召喚階段"){
              normalSummonUsed = true;
            }

            if(phase === "戰術佈陣"){
              tacticalSummonUsed = true;
            }

            placed = true;
            break;
          }
        }

      });

      if(placed){
        setStatus("已召喚小旅人。");
        render();
      }else{
        setStatus("場上沒有空位。");
      }

    };

  });

}

const OLD_RENDER_TACTICAL_FIX = render;

render = function(){

  OLD_RENDER_TACTICAL_FIX();

  setTimeout(()=>{
    patchTravelerButton();

    const canTraveler =
      (phase === "召喚階段" && !normalSummonUsed) ||
      (phase === "戰術佈陣" && !tacticalSummonUsed);

    [
      "hardTravelerBtn",
      "cleanTravelerBtn",
      "realTravelerBtn"
    ].forEach(id=>{
      const btn = document.getElementById(id);
      if(btn){
        btn.disabled = !canTraveler;
      }
    });

  },0);

};

})();


// ======================================================
// REAL TACTICAL SUMMON FIX
// 真正修復：戰術佈陣階段手牌召喚
// 問題原因：mulligan / attack / hand click 多層事件覆蓋
// ======================================================

(function(){

// 完全重建手牌點擊召喚流程

window.selectedHandCardForSummon = null;

function canNormalSummonCurrentPhase(card){

  if(!card) return false;

  // 不能是祭品怪
  if(Number(card.tribute || 0) > 0){
    return false;
  }

  // 只能單位
  if(card.type !== "unit"){
    return false;
  }

  // 召喚階段
  if(phase === "召喚階段"){
    return !normalSummonUsed;
  }

  // 戰術佈陣
  if(phase === "戰術佈陣"){
    return !tacticalSummonUsed;
  }

  return false;
}

function consumeSummonCount(){

  if(phase === "召喚階段"){
    normalSummonUsed = true;
  }

  if(phase === "戰術佈陣"){
    tacticalSummonUsed = true;
  }
}

function clearHandSelection(){
  selectedHandCardForSummon = null;

  document.querySelectorAll("#hand .card").forEach(c=>{
    c.classList.remove("selected-hand-summon");
  });
}

function bindHandSummonSelection(){

  document.querySelectorAll("#hand .card").forEach(cardEl=>{

    const idx = Number(cardEl.dataset.handIndex);
    const card = hand[idx];

    // 先清除舊事件
    cardEl.onclick = null;

    // 起手換牌階段不覆蓋
    if(typeof mulliganActive !== "undefined" && mulliganActive){
      return;
    }

    cardEl.addEventListener("click", function(e){

      // 只處理可召喚單位
      if(!canNormalSummonCurrentPhase(card)){
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // toggle
      if(selectedHandCardForSummon === idx){

        clearHandSelection();
        setStatus("已取消召喚選擇。");
        return;
      }

      clearHandSelection();

      selectedHandCardForSummon = idx;
      cardEl.classList.add("selected-hand-summon");

      setStatus(
        phase === "戰術佈陣"
        ? `已選擇 ${card.name}。請點擊我方空格召喚（戰術佈陣額外召喚）。`
        : `已選擇 ${card.name}。請點擊我方空格召喚。`
      );

    }, true);

  });

}

function summonSelectedHandTo(zone, idx){

  if(selectedHandCardForSummon === null){
    return false;
  }

  const card = hand[selectedHandCardForSummon];

  if(!card){
    clearHandSelection();
    return false;
  }

  if(!["player_front","player_back"].includes(zone)){
    setStatus("只能召喚到我方區域。");
    return true;
  }

  if(field[zone][idx]){
    setStatus("該位置已有單位。");
    return true;
  }

  if(!canNormalSummonCurrentPhase(card)){

    if(phase === "戰術佈陣"){
      setStatus("戰術佈陣階段已召喚過。");
    }else{
      setStatus("目前不能召喚。");
    }

    clearHandSelection();
    return true;
  }

  field[zone][idx] = makeUnit(card, zone);

  hand.splice(selectedHandCardForSummon, 1);

  consumeSummonCount();

  setStatus(`召喚成功：${card.name}`);

  if(typeof logBattle === "function"){
    logBattle(`召喚：${card.name}`);
  }

  clearHandSelection();

  render();

  return true;
}

// 最高優先權攔截 slot click
window.addEventListener("click", function(e){

  if(selectedHandCardForSummon === null){
    return;
  }

  const slot = e.target.closest && e.target.closest(".slot");

  if(!slot){
    return;
  }

  const zone = slot.dataset.zone;
  const idx = Number(slot.dataset.index);

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  summonSelectedHandTo(zone, idx);

  return false;

}, true);

// render hook
const OLD_RENDER_REAL_TACTICAL_FIX = render;

render = function(){

  OLD_RENDER_REAL_TACTICAL_FIX();

  setTimeout(()=>{

    bindHandSummonSelection();

    // 顯示目前可召喚狀態
    document.querySelectorAll("#hand .card").forEach(cardEl=>{

      const idx = Number(cardEl.dataset.handIndex);
      const card = hand[idx];

      if(canNormalSummonCurrentPhase(card)){
        cardEl.classList.add("can-summon-now");
      }else{
        cardEl.classList.remove("can-summon-now");
      }

    });

  },0);

};

})();


// ======================================================
// FINAL TACTICAL HAND SUMMON + CHOOSE TRAVELER POSITION
// 1. 戰術佈陣階段可從手牌召喚免祭品單位
// 2. 小旅人改成先按按鈕，再自己點選召喚位置
// ======================================================

(function(){

  window.XLW_SELECTED_HAND_SUMMON = null;
  window.XLW_TRAVELER_WAITING_POSITION = false;

  function isUnitCardXLW(card){
    if(!card) return false;
    return card.type === "unit" || card.type === "單位" || card.card_type === "unit";
  }

  function tributeCostXLW(card){
    return Number(card.tribute ?? card.cost_tribute ?? card.sacrifice ?? 0);
  }

  function canSummonHandNowXLW(card){
    if(!card) return false;
    if(!isUnitCardXLW(card)) return false;
    if(tributeCostXLW(card) > 0) return false;

    if(phase === "召喚階段"){
      return !normalSummonUsed;
    }

    if(phase === "戰術佈陣"){
      return !tacticalSummonUsed;
    }

    return false;
  }

  function markHandCardsXLW(){
    document.querySelectorAll("#hand .card").forEach(el=>{
      const idx = Number(el.dataset.handIndex);
      const card = hand[idx];

      el.classList.toggle("xlw-can-summon", canSummonHandNowXLW(card));
      el.classList.toggle("xlw-selected-hand", window.XLW_SELECTED_HAND_SUMMON === idx);
    });
  }

  function selectHandForSummonXLW(idx){
    const card = hand[idx];

    if(!canSummonHandNowXLW(card)){
      return false;
    }

    if(window.XLW_SELECTED_HAND_SUMMON === idx){
      window.XLW_SELECTED_HAND_SUMMON = null;
      setStatus("已取消召喚選擇。");
    }else{
      window.XLW_SELECTED_HAND_SUMMON = idx;
      window.XLW_TRAVELER_WAITING_POSITION = false;
      setStatus(`${card.name} 已選擇。請點擊我方空格召喚。`);
    }

    markHandCardsXLW();
    return true;
  }

  function summonSelectedHandXLW(zone, idx){
    if(window.XLW_SELECTED_HAND_SUMMON === null || window.XLW_SELECTED_HAND_SUMMON === undefined){
      return false;
    }

    const handIndex = window.XLW_SELECTED_HAND_SUMMON;
    const card = hand[handIndex];

    if(!card){
      window.XLW_SELECTED_HAND_SUMMON = null;
      return false;
    }

    if(zone !== "player_front" && zone !== "player_back"){
      setStatus("只能召喚到我方前排或後排。");
      return true;
    }

    if(xlwIsIllegalBackHandSummon(zone)){
      xlwBlockBackHandSummon();
      return true;
    }

    const frontHasEmpty =
      Array.isArray(field.player_front) &&
      field.player_front.some(v => !v);

    if(zone === "player_back" && frontHasEmpty){
      setStatus("前排仍有空位時，手牌單位不能召喚至後排。");
      return true;
    }

    if(field[zone][idx]){
      setStatus("該位置已有單位。");
      return true;
    }

    if(!canSummonHandNowXLW(card)){
      setStatus("目前不能召喚這張單位。");
      window.XLW_SELECTED_HAND_SUMMON = null;
      markHandCardsXLW();
      return true;
    }

    field[zone][idx] = makeUnit(card, zone);
    hand.splice(handIndex, 1);

    if(phase === "召喚階段") normalSummonUsed = true;
    if(phase === "戰術佈陣") tacticalSummonUsed = true;

    setStatus(`召喚成功：${card.name}`);
    if(typeof logBattle === "function") logBattle(`召喚：${card.name}`);

    window.XLW_SELECTED_HAND_SUMMON = null;
    render();
    return true;
  }

  function beginTravelerChoosePositionXLW(){
    const can =
      (phase === "召喚階段" && !normalSummonUsed) ||
      (phase === "戰術佈陣" && !tacticalSummonUsed);

    if(!can){
      setStatus("目前不能召喚小旅人。");
      return;
    }

    window.XLW_SELECTED_HAND_SUMMON = null;
    window.XLW_TRAVELER_WAITING_POSITION = true;

    setStatus("請點擊我方空格召喚小旅人。");
    render();
  }

  function summonTravelerToXLW(zone, idx){
    if(!window.XLW_TRAVELER_WAITING_POSITION){
      return false;
    }

    if(zone !== "player_front" && zone !== "player_back"){
      setStatus("小旅人只能召喚到我方前排或後排。");
      return true;
    }

    if(field[zone][idx]){
      setStatus("該位置已有單位，請選擇空格。");
      return true;
    }

    const can =
      (phase === "召喚階段" && !normalSummonUsed) ||
      (phase === "戰術佈陣" && !tacticalSummonUsed);

    if(!can){
      setStatus("目前不能召喚小旅人。");
      window.XLW_TRAVELER_WAITING_POSITION = false;
      render();
      return true;
    }

    const traveler = {
      id:"TOKEN_TRAVELER",
      name:"小旅人",
      type:"unit",
      faction:"旅人",
      attack:1,
      atk:1,
      score:1,
      stars:1,
      tribute:0,
      keywords:[],
      effect_text:"無任何特殊能力。",
      image:"/static/little_traveler_back.jpeg"
    };

    field[zone][idx] = makeUnit(traveler, zone);

    if(phase === "召喚階段") normalSummonUsed = true;
    if(phase === "戰術佈陣") tacticalSummonUsed = true;

    window.XLW_TRAVELER_WAITING_POSITION = false;

    setStatus(`小旅人已召喚到${zone.includes("front") ? "前排" : "後排"}${idx + 1}`);
    if(typeof logBattle === "function") logBattle("召喚：小旅人");

    render();
    return true;
  }

  // 最高優先權：手牌點擊選擇召喚
  window.addEventListener("click", function(e){
    if(typeof mulliganActive !== "undefined" && mulliganActive) return;

    const handCard = e.target.closest && e.target.closest("#hand .card");
    if(!handCard) return;

    const idx = Number(handCard.dataset.handIndex);
    if(Number.isNaN(idx)) return;

    const card = hand[idx];

    if(canSummonHandNowXLW(card)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      selectHandForSummonXLW(idx);
      return false;
    }
  }, true);

  // 最高優先權：點空格完成手牌召喚或小旅人召喚
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(window.XLW_TRAVELER_WAITING_POSITION){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      summonTravelerToXLW(zone, idx);
      return false;
    }

    if(window.XLW_SELECTED_HAND_SUMMON !== null && window.XLW_SELECTED_HAND_SUMMON !== undefined){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      summonSelectedHandXLW(zone, idx);
      return false;
    }
  }, true);

  // 拖曳也修正
  window.addEventListener("drop", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot || !dragged || dragged.type !== "hand") return;

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    const card = hand[dragged.index];
    if(canSummonHandNowXLW(card)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      window.XLW_SELECTED_HAND_SUMMON = dragged.index;
      summonSelectedHandXLW(zone, idx);
      dragged = null;
      return false;
    }
  }, true);

  // 小旅人按鈕：改成進入選位置模式
  function patchTravelerButtonsXLW(){
    ["hardTravelerBtn","cleanTravelerBtn","realTravelerBtn","littleTravelerBtn"].forEach(id=>{
      const btn = document.getElementById(id);
      if(!btn) return;

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        beginTravelerChoosePositionXLW();
      };
    });
  }

  const OLD_RENDER_XLW_TACTICAL_FINAL = render;
  render = function(){
    OLD_RENDER_XLW_TACTICAL_FINAL();

    setTimeout(()=>{
      patchTravelerButtonsXLW();
      markHandCardsXLW();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        const isPlayerEmpty =
          (zone === "player_front" || zone === "player_back") &&
          !field[zone][idx];

        slot.classList.toggle(
          "xlw-summon-target",
          isPlayerEmpty && (window.XLW_TRAVELER_WAITING_POSITION || window.XLW_SELECTED_HAND_SUMMON !== null)
        );
      });

      const canTraveler =
        (phase === "召喚階段" && !normalSummonUsed) ||
        (phase === "戰術佈陣" && !tacticalSummonUsed);

      ["hardTravelerBtn","cleanTravelerBtn","realTravelerBtn"].forEach(id=>{
        const btn = document.getElementById(id);
        if(btn) btn.disabled = !canTraveler;
      });

    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      patchTravelerButtonsXLW();
      markHandCardsXLW();
    },500);
  });

})();


// ======================================================
// TURN RULES + FRONTLINE SUMMON RULE
// 1. 第一回合與最後回合不可進攻宣言/戰術佈陣
// 2. 前排有空位時，只能召喚到前排
// ======================================================

(function(){

// 可自行調整最後回合
window.XLW_FINAL_TURN = 10;

function xlwIsRestrictedTurn(){
  return turn === 1 || turn === window.XLW_FINAL_TURN;
}

function xlwFrontlineHasEmpty(){
  try{
    return field.player_front.some(v => !v);
  }catch(e){
    return false;
  }
}

function xlwCanSummonToZone(zone){

  // 前排有空位 => 只能前排
  if(xlwFrontlineHasEmpty()){
    return zone === "player_front";
  }

  // 前排滿了才能後排
  return zone === "player_front" || zone === "player_back";
}

// 戰術/進攻限制
function xlwPatchPhaseButtons(){

  const restricted = xlwIsRestrictedTurn();

  [
    "hardFormationBtn",
    "cleanFormationBtn"
  ].forEach(id=>{
    const btn = document.getElementById(id);
    if(!btn) return;

    btn.disabled =
      restricted ||
      !(phase === "召喚階段" || phase === "戰術佈陣");

    btn.onclick = function(e){

      if(restricted){
        e.preventDefault();
        e.stopPropagation();
        setStatus(
          turn === 1
          ? "第一回合不能進行戰術佈陣。"
          : "最後回合不能進行戰術佈陣。"
        );
        return false;
      }
    };
  });

  [
    "hardAttackBtn",
    "cleanAttackBtn"
  ].forEach(id=>{
    const btn = document.getElementById(id);
    if(!btn) return;

    btn.disabled =
      restricted ||
      !(phase === "召喚階段" || phase === "進攻宣言");

    btn.onclick = function(e){

      if(restricted){
        e.preventDefault();
        e.stopPropagation();
        setStatus(
          turn === 1
          ? "第一回合不能進行進攻宣言。"
          : "最後回合不能進行進攻宣言。"
        );
        return false;
      }
    };
  });

}

// 修正手牌召喚位置限制
const OLD_SUMMON_SELECTED_XLW = window.summonSelectedHandXLW;

if(OLD_SUMMON_SELECTED_XLW){

  window.summonSelectedHandXLW = function(zone, idx){

    if(!xlwCanSummonToZone(zone)){

      if(zone === "player_back"){
        setStatus("前排仍有空位時，不能召喚到後排。");
      }else{
        setStatus("目前不能召喚到此區域。");
      }

      return true;
    }

    return OLD_SUMMON_SELECTED_XLW(zone, idx);
  };
}

// 修正小旅人位置限制
const OLD_TRAVELER_SUMMON_XLW = window.summonTravelerToXLW;

if(OLD_TRAVELER_SUMMON_XLW){

  window.summonTravelerToXLW = function(zone, idx){

    if(!xlwCanSummonToZone(zone)){

      if(zone === "player_back"){
        setStatus("前排仍有空位時，小旅人不能召喚到後排。");
      }else{
        setStatus("目前不能召喚到此區域。");
      }

      return true;
    }

    return OLD_TRAVELER_SUMMON_XLW(zone, idx);
  };
}

// 修正祭品召喚位置限制
if(typeof window.finishTributeSummon === "function"){

  const OLD_FINISH_TRIBUTE = window.finishTributeSummon;

  window.finishTributeSummon = function(zone, idx){

    if(!xlwCanSummonToZone(zone)){

      if(zone === "player_back"){
        setStatus("前排仍有空位時，祭品召喚不能召喚到後排。");
      }else{
        setStatus("目前不能召喚到此區域。");
      }

      return true;
    }

    return OLD_FINISH_TRIBUTE(zone, idx);
  };
}

// slot 高亮提示：只有合法位置亮起
function xlwUpdateSummonTargets(){

  document.querySelectorAll(".slot").forEach(slot=>{

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    const empty =
      (zone === "player_front" || zone === "player_back") &&
      !field[zone][idx];

    const legal = empty && xlwCanSummonToZone(zone);

    const waiting =
      window.XLW_TRAVELER_WAITING_POSITION ||
      (window.XLW_SELECTED_HAND_SUMMON !== null &&
       window.XLW_SELECTED_HAND_SUMMON !== undefined);

    slot.classList.toggle(
      "xlw-summon-target",
      legal && waiting
    );

    slot.classList.toggle(
      "xlw-illegal-summon",
      empty && waiting && !legal
    );

  });

}

// render hook
const OLD_RENDER_TURN_RULES = render;

render = function(){

  OLD_RENDER_TURN_RULES();

  setTimeout(()=>{

    xlwPatchPhaseButtons();
    xlwUpdateSummonTargets();

  },0);

};

// 開局 turn 修正
document.addEventListener("DOMContentLoaded", ()=>{

  setTimeout(()=>{
    xlwPatchPhaseButtons();
    xlwUpdateSummonTargets();
  },500);

});

})();


// ======================================================
// FIRST / FINAL TURN SKIP ACTION PHASE FIX
// 第一回合 / 最後回合不能戰術佈陣與進攻宣言時，
// 允許按「下一回合」直接跳過行動階段。
// ======================================================

(function(){

function xlwRestrictedTurnForAction(){
  return turn === 1 || turn === window.XLW_FINAL_TURN;
}

function xlwGoNextTurnFromRestrictedTurn(){
  // 手牌上限
  while(hand.length > 10){
    graveyard.push(hand.pop());
  }

  turn++;

  phase = "召喚階段";
  mode = null;

  normalSummonUsed = false;
  tacticalSummonUsed = false;
  selectedAttacker = null;

  if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
  if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

  draw(2);

  setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
  render();
}

function patchRestrictedEndButton(){
  const btn = document.getElementById("hardEndBtn");
  if(!btn) return;

  if(xlwRestrictedTurnForAction() && phase === "召喚階段"){
    btn.disabled = false;
    btn.textContent = "跳過至下一回合";
    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();

      setStatus(
        turn === 1
        ? "第一回合跳過戰術/進攻，進入下一回合。"
        : "最後回合跳過戰術/進攻。"
      );

      xlwGoNextTurnFromRestrictedTurn();
    };
  }
}

// 保險：攔截右上按鈕點擊
window.addEventListener("click", function(e){
  const btn = e.target.closest && e.target.closest("#hardEndBtn");
  if(!btn) return;

  if(xlwRestrictedTurnForAction() && phase === "召喚階段"){
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    xlwGoNextTurnFromRestrictedTurn();
    return false;
  }
}, true);

// render hook
const OLD_RENDER_RESTRICTED_NEXT_FIX = render;

render = function(){
  OLD_RENDER_RESTRICTED_NEXT_FIX();

  setTimeout(()=>{
    patchRestrictedEndButton();

    // 顯示狀態說明
    const help = document.getElementById("phaseHelpHard");
    if(help && xlwRestrictedTurnForAction() && phase === "召喚階段"){
      help.textContent =
        turn === 1
        ? "第一回合不能戰術佈陣或進攻宣言。召喚完成後可直接跳過至下一回合。"
        : "最後回合不能戰術佈陣或進攻宣言。";
    }
  },0);
};

document.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(patchRestrictedEndButton, 500);
});

})();


// ======================================================
// FRONTLINE PRIORITY HARD FIX
// 最高優先權修正：前排有空位時，任何召喚都不能到後排
// 適用：手牌召喚 / 祭品召喚 / 小旅人
// ======================================================

(function(){

  function frontHasEmptyHard(){
    return field &&
      Array.isArray(field.player_front) &&
      field.player_front.some(x => !x);
  }

  function isPlayerBackHard(zone){
    return zone === "player_back";
  }

  function isPlayerSummonZoneHard(zone){
    return zone === "player_front" || zone === "player_back";
  }

  function isIllegalBackSummonHard(zone){
    return isPlayerBackHard(zone) && frontHasEmptyHard();
  }

  function showFrontlineMessageHard(){
    setStatus("前排仍有空位時，必須先召喚到前排，不能召喚到後排。");
  }

  // 統一召喚位置檢查
  window.XLW_canSummonToZoneHard = function(zone){
    if(!isPlayerSummonZoneHard(zone)) return false;
    if(isIllegalBackSummonHard(zone)) return false;
    return true;
  };

  // 1) 攔截所有點擊空格造成的召喚：手牌召喚 / 小旅人 / 祭品等待位置
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const zone = slot.dataset.zone;

    const isTryingSummon =
      window.XLW_TRAVELER_WAITING_POSITION ||
      window.XLW_SELECTED_HAND_SUMMON !== null && window.XLW_SELECTED_HAND_SUMMON !== undefined ||
      window.TRIBUTE_STATE && window.TRIBUTE_STATE.waitingPosition ||
      typeof tributeWaitingPosition !== "undefined" && tributeWaitingPosition ||
      mode === "tribute_position";

    if(isTryingSummon && isIllegalBackSummonHard(zone)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showFrontlineMessageHard();
      render();
      return false;
    }
  }, true);

  // 2) 攔截拖曳召喚到後排
  window.addEventListener("drop", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const zone = slot.dataset.zone;

    if(dragged && dragged.type === "hand" && isIllegalBackSummonHard(zone)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      showFrontlineMessageHard();
      dragged = null;
      render();
      return false;
    }
  }, true);

  // 3) 強制包住手牌召喚函式
  if(typeof window.summonSelectedHandXLW === "function"){
    const OLD_SUMMON_SELECTED_HAND_HARD = window.summonSelectedHandXLW;
    window.summonSelectedHandXLW = function(zone, idx){
      if(isIllegalBackSummonHard(zone)){
        showFrontlineMessageHard();
        return true;
      }
      return OLD_SUMMON_SELECTED_HAND_HARD(zone, idx);
    };
  }

  if(typeof window.restoreSummonFromHand === "function"){
    const OLD_RESTORE_SUMMON_HAND_HARD = window.restoreSummonFromHand;
    window.restoreSummonFromHand = function(handIndex, zone, idx){
      if(isIllegalBackSummonHard(zone)){
        showFrontlineMessageHard();
        return true;
      }
      return OLD_RESTORE_SUMMON_HAND_HARD(handIndex, zone, idx);
    };
  }

  // 4) 強制包住小旅人召喚函式
  if(typeof window.summonTravelerToXLW === "function"){
    const OLD_TRAVELER_HARD = window.summonTravelerToXLW;
    window.summonTravelerToXLW = function(zone, idx){
      if(isIllegalBackSummonHard(zone)){
        showFrontlineMessageHard();
        return true;
      }
      return OLD_TRAVELER_HARD(zone, idx);
    };
  }

  // 5) 祭品召喚可能有多個名稱，逐一保護
  [
    "completeTributeSummonToChosenSlot",
    "finishTributeSummon",
    "completeTributeSummon",
    "confirmTributeSummonToSlot"
  ].forEach(fnName=>{
    if(typeof window[fnName] === "function"){
      const oldFn = window[fnName];
      window[fnName] = function(zone, idx){
        if(isIllegalBackSummonHard(zone)){
          showFrontlineMessageHard();
          return true;
        }
        return oldFn.apply(this, arguments);
      };
    }
  });

  // 6) 如果有舊事件直接寫入 field，最後用 mutation 式檢查：
  // 一旦偵測到「前排還有空位卻有新單位被放到後排」，就退回並提示。
  let lastBackSnapshot = [null,null,null,null,null];

  function snapshotBack(){
    if(!field || !Array.isArray(field.player_back)) return;
    lastBackSnapshot = field.player_back.slice();
  }

  function enforceBackAfterRender(){
    if(!field || !Array.isArray(field.player_back) || !Array.isArray(field.player_front)) return;

    const frontEmpty = field.player_front.some(x => !x);

    if(!frontEmpty){
      snapshotBack();
      return;
    }

    for(let i=0;i<field.player_back.length;i++){
      const before = lastBackSnapshot[i];
      const now = field.player_back[i];

      // 已改為事前阻擋，不在 render 後移除單位，避免卡片消失。
      if(!before && now){
        // no-op
      }
    }

    snapshotBack();
  }

  const OLD_RENDER_FRONTLINE_HARD = render;
  render = function(){
    OLD_RENDER_FRONTLINE_HARD();

    setTimeout(()=>{
      enforceBackAfterRender();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);
        const empty = isPlayerSummonZoneHard(zone) && !field[zone][idx];

        const trying =
          window.XLW_TRAVELER_WAITING_POSITION ||
          window.XLW_SELECTED_HAND_SUMMON !== null && window.XLW_SELECTED_HAND_SUMMON !== undefined ||
          window.TRIBUTE_STATE && window.TRIBUTE_STATE.waitingPosition ||
          typeof tributeWaitingPosition !== "undefined" && tributeWaitingPosition ||
          mode === "tribute_position";

        slot.classList.toggle("xlw-front-legal", trying && empty && window.XLW_canSummonToZoneHard(zone));
        slot.classList.toggle("xlw-front-illegal", trying && empty && isIllegalBackSummonHard(zone));
      });

      snapshotBack();
    }, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(snapshotBack, 500);
  });

})();


// ======================================================
// HAND SUMMON FRONTLINE REAL FIX
// 真正修正：手牌召喚仍可繞過前排限制
// ======================================================

(function(){

function xlwFrontHasEmpty_REAL(){
  return Array.isArray(field.player_front)
    && field.player_front.some(v => !v);
}

function xlwIllegalBack_REAL(zone){
  return zone === "player_back" && xlwFrontHasEmpty_REAL();
}

// 完全攔截 slot 點擊（最高優先權）
window.addEventListener("click", function(e){

  const slot = e.target.closest && e.target.closest(".slot");
  if(!slot) return;

  const zone = slot.dataset.zone;

  // 只有「手牌召喚模式」才處理
  const selectingHand =
    window.XLW_SELECTED_HAND_SUMMON !== null &&
    window.XLW_SELECTED_HAND_SUMMON !== undefined;

  if(!selectingHand) return;

  // 前排限制
  if(xlwIllegalBack_REAL(zone)){

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    setStatus("前排仍有空位時，手牌單位不能召喚至後排。");

    render();

    return false;
  }

}, true);

// 完全攔截拖曳
window.addEventListener("drop", function(e){

  const slot = e.target.closest && e.target.closest(".slot");
  if(!slot) return;

  const zone = slot.dataset.zone;

  const draggingHand =
    dragged &&
    dragged.type === "hand";

  if(!draggingHand) return;

  if(xlwIllegalBack_REAL(zone)){

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    setStatus("前排仍有空位時，手牌單位不能召喚至後排。");

    dragged = null;

    render();

    return false;
  }

}, true);

// 強制覆寫最底層 summon 函式
if(typeof window.summonSelectedHandXLW === "function"){

  const OLD_SUMMON_REAL_FIX = window.summonSelectedHandXLW;

  window.summonSelectedHandXLW = function(zone, idx){

    if(xlwIllegalBack_REAL(zone)){

      setStatus("前排仍有空位時，手牌單位不能召喚至後排。");

      return false;
    }

    return OLD_SUMMON_REAL_FIX(zone, idx);
  };
}

// 強制覆寫 restoreSummonFromHand
if(typeof window.restoreSummonFromHand === "function"){

  const OLD_RESTORE_REAL_FIX = window.restoreSummonFromHand;

  window.restoreSummonFromHand = function(handIndex, zone, idx){

    if(xlwIllegalBack_REAL(zone)){

      setStatus("前排仍有空位時，手牌單位不能召喚至後排。");

      return false;
    }

    return OLD_RESTORE_REAL_FIX(handIndex, zone, idx);
  };
}

// render 後重新高亮合法位置
const OLD_RENDER_HAND_FRONT_REAL = render;

render = function(){

  OLD_RENDER_HAND_FRONT_REAL();

  setTimeout(()=>{

    const selectingHand =
      window.XLW_SELECTED_HAND_SUMMON !== null &&
      window.XLW_SELECTED_HAND_SUMMON !== undefined;

    document.querySelectorAll(".slot").forEach(slot=>{

      const zone = slot.dataset.zone;
      const idx = Number(slot.dataset.index);

      const empty =
        (zone === "player_front" || zone === "player_back") &&
        !field[zone][idx];

      slot.classList.remove(
        "xlw-hand-front-legal",
        "xlw-hand-front-illegal"
      );

      if(selectingHand && empty){

        if(xlwIllegalBack_REAL(zone)){
          slot.classList.add("xlw-hand-front-illegal");
        }else{
          slot.classList.add("xlw-hand-front-legal");
        }
      }

    });

  },0);

};

})();


// ======================================================
// TRUE FRONTLINE PRIORITY PATCH
// 事前阻擋手牌召喚到後排，不再事後移除，避免卡片消失。
// ======================================================
(function(){
  function frontHasEmpty(){
    return field && Array.isArray(field.player_front) && field.player_front.some(v => !v);
  }
  function illegalBack(zone){
    return zone === "player_back" && frontHasEmpty();
  }
  function isHandSummonPending(){
    return (
      window.XLW_SELECTED_HAND_SUMMON !== null &&
      window.XLW_SELECTED_HAND_SUMMON !== undefined
    );
  }

  document.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(isHandSummonPending() && illegalBack(slot.dataset.zone)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setStatus("前排仍有空位時，手牌單位不能召喚至後排。");
      render();
      return false;
    }
  }, true);

  document.addEventListener("drop", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(dragged && dragged.type === "hand" && illegalBack(slot.dataset.zone)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setStatus("前排仍有空位時，手牌單位不能召喚至後排。");
      dragged = null;
      render();
      return false;
    }
  }, true);

  const OLD_RENDER_TRUE_FRONTLINE = render;
  render = function(){
    OLD_RENDER_TRUE_FRONTLINE();
    setTimeout(()=>{
      const pending = isHandSummonPending() || window.XLW_TRAVELER_WAITING_POSITION || (window.TRIBUTE_STATE && window.TRIBUTE_STATE.waitingPosition);
      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);
        const empty = (zone === "player_front" || zone === "player_back") && !field[zone][idx];
        slot.classList.toggle("true-front-legal", !!(pending && empty && !illegalBack(zone)));
        slot.classList.toggle("true-front-illegal", !!(pending && empty && illegalBack(zone)));
      });
    }, 0);
  };
})();


// ======================================================
// FULL BATTLE SYSTEM v1
// 正式戰鬥結算 / 星數即時計分 / 最終回合結算
// ======================================================

(function(){

  window.XLW_BATTLE = {
    selectedAttacker: null,
    selectedTarget: null,
    log: [],
    gameEnded: false,
    finalTurn: window.XLW_FINAL_TURN || 10
  };

  function xlwUnitAtk(unit){
    if(!unit) return 0;
    const c = unit.card || unit;
    return Number(c.attack ?? c.atk ?? c.power ?? 0);
  }

  function xlwUnitStars(unit){
    if(!unit) return 0;
    const c = unit.card || unit;
    return Number(c.score ?? c.stars ?? c.star ?? 0) + Number(unit.bonusScore ?? 0);
  }

  function xlwUnitName(unit){
    if(!unit) return "";
    const c = unit.card || unit;
    return c.name || "未知單位";
  }

  function xlwIsPlayerZone(zone){
    return zone === "player_front" || zone === "player_back";
  }

  function xlwIsEnemyZone(zone){
    return zone === "enemy_front" || zone === "enemy_back";
  }

  function xlwPushLog(text){
    const line = `T${turn}｜${text}`;
    window.XLW_BATTLE.log.unshift(line);
    if(window.XLW_BATTLE.log.length > 40){
      window.XLW_BATTLE.log.pop();
    }
    if(typeof logBattle === "function"){
      try{ logBattle(text); }catch(e){}
    }
  }

  window.xlwCalculateScore = function(owner){
    const zones = owner === "player"
      ? ["player_front","player_back"]
      : ["enemy_front","enemy_back"];

    let total = 0;
    zones.forEach(zone=>{
      field[zone].forEach(unit=>{
        if(unit) total += xlwUnitStars(unit);
      });
    });

    if(owner === "player" && typeof playerBonusScore !== "undefined"){
      total += Number(playerBonusScore || 0);
    }
    if(owner === "enemy" && typeof enemyBonusScore !== "undefined"){
      total += Number(enemyBonusScore || 0);
    }

    return total;
  };

  function xlwGetUnit(zone, idx){
    if(!field || !field[zone]) return null;
    return field[zone][idx];
  }

  function xlwClearBattleSelection(){
    window.XLW_BATTLE.selectedAttacker = null;
    window.XLW_BATTLE.selectedTarget = null;
  }

  function xlwSelectAttacker(zone, idx){
    if(phase !== "進攻宣言"){
      setStatus("只有進攻宣言階段可以選擇攻擊單位。");
      return true;
    }

    if(!xlwIsPlayerZone(zone)){
      setStatus("只能選擇我方單位進攻。");
      return true;
    }

    const unit = xlwGetUnit(zone, idx);
    if(!unit){
      setStatus("該格沒有單位。");
      return true;
    }

    if(unit.tapped){
      setStatus("橫置單位不能進攻。");
      return true;
    }

    window.XLW_BATTLE.selectedAttacker = {zone, idx};
    window.XLW_BATTLE.selectedTarget = null;

    unit.attacking = true;

    setStatus(`已選擇攻擊單位：${xlwUnitName(unit)}。請點選敵方目標。`);
    render();
    return true;
  }

  function xlwCanTarget(attacker, targetZone, targetIdx){
    if(!attacker) return false;
    if(!xlwIsEnemyZone(targetZone)) return false;

    const target = xlwGetUnit(targetZone, targetIdx);
    if(!target) return false;

    // 同戰線優先：若敵方同一欄前排有單位，必須先打前排
    if(field.enemy_front[targetIdx]){
      return targetZone === "enemy_front";
    }

    // 前排空了才可打後排
    return targetZone === "enemy_back";
  }

  function xlwResolveAttack(attackerRef, targetRef){
    const attacker = xlwGetUnit(attackerRef.zone, attackerRef.idx);
    const target = xlwGetUnit(targetRef.zone, targetRef.idx);

    if(!attacker || !target){
      setStatus("攻擊者或目標不存在。");
      xlwClearBattleSelection();
      render();
      return;
    }

    const atk = xlwUnitAtk(attacker);
    const def = xlwUnitAtk(target);

    xlwAnimateBattle(attackerRef, targetRef);

    if(atk > def){
      const targetName = xlwUnitName(target);
      enemyGraveyard.push(target.card || target);
      field[targetRef.zone][targetRef.idx] = null;

      attacker.tapped = true;
      attacker.attacking = false;

      xlwPushLog(`${xlwUnitName(attacker)} 攻擊 ${targetName}，${targetName} 被破壞`);
      setStatus(`${xlwUnitName(attacker)} 擊破 ${targetName}`);
    }else if(atk < def){
      const attackerName = xlwUnitName(attacker);
      graveyard.push(attacker.card || attacker);
      field[attackerRef.zone][attackerRef.idx] = null;

      xlwPushLog(`${attackerName} 攻擊失敗，${attackerName} 被破壞`);
      setStatus(`${attackerName} 攻擊失敗並被破壞`);
    }else{
      const attackerName = xlwUnitName(attacker);
      const targetName = xlwUnitName(target);

      graveyard.push(attacker.card || attacker);
      enemyGraveyard.push(target.card || target);

      field[attackerRef.zone][attackerRef.idx] = null;
      field[targetRef.zone][targetRef.idx] = null;

      xlwPushLog(`${attackerName} 與 ${targetName} 同歸於盡`);
      setStatus(`${attackerName} 與 ${targetName} 同歸於盡`);
    }

    xlwClearBattleSelection();
    render();
  }

  function xlwHandleBattleSlotClick(slot){
    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(phase !== "進攻宣言") return false;

    const selected = window.XLW_BATTLE.selectedAttacker;

    if(!selected){
      if(xlwIsPlayerZone(zone)){
        return xlwSelectAttacker(zone, idx);
      }
      setStatus("請先選擇我方攻擊單位。");
      return true;
    }

    if(xlwIsPlayerZone(zone)){
      return xlwSelectAttacker(zone, idx);
    }

    if(xlwIsEnemyZone(zone)){
      if(!xlwCanTarget(selected, zone, idx)){
        setStatus("目標不合法：同戰線有前排單位時，必須先攻擊前排。");
        return true;
      }

      window.XLW_BATTLE.selectedTarget = {zone, idx};
      xlwResolveAttack(selected, {zone, idx});
      return true;
    }

    return false;
  }

  function xlwAnimateBattle(attackerRef, targetRef){
    const a = document.querySelector(`[data-zone="${attackerRef.zone}"][data-index="${attackerRef.idx}"]`);
    const t = document.querySelector(`[data-zone="${targetRef.zone}"][data-index="${targetRef.idx}"]`);

    if(a) a.classList.add("xlw-attack-flash");
    if(t) t.classList.add("xlw-hit-flash");

    setTimeout(()=>{
      if(a) a.classList.remove("xlw-attack-flash");
      if(t) t.classList.remove("xlw-hit-flash");
    }, 650);
  }

  function xlwEnsureScorePanel(){
    let panel = document.getElementById("xlwScorePanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "xlwScorePanel";
      panel.className = "xlw-score-panel";
      panel.innerHTML = `
        <div class="xlw-score-line">我方星數：<span id="xlwPlayerScore">0</span> ★</div>
        <div class="xlw-score-line">對手星數：<span id="xlwEnemyScore">0</span> ★</div>
      `;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function xlwUpdateScorePanel(){
    xlwEnsureScorePanel();
    const p = document.getElementById("xlwPlayerScore");
    const e = document.getElementById("xlwEnemyScore");
    if(p) p.textContent = window.xlwCalculateScore("player");
    if(e) e.textContent = window.xlwCalculateScore("enemy");
  }

  function xlwEnsureBattleLog(){
    let panel = document.getElementById("xlwBattleLogPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "xlwBattleLogPanel";
      panel.className = "xlw-battle-log-panel";
      panel.innerHTML = `
        <div class="xlw-battle-log-title">戰鬥紀錄</div>
        <div id="xlwBattleLogContent"></div>
      `;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function xlwUpdateBattleLog(){
    xlwEnsureBattleLog();
    const content = document.getElementById("xlwBattleLogContent");
    if(!content) return;

    content.innerHTML = window.XLW_BATTLE.log.length
      ? window.XLW_BATTLE.log.map(x=>`<div>${x}</div>`).join("")
      : `<div class="xlw-log-empty">尚無戰鬥紀錄</div>`;
  }

  function xlwCheckFinalResult(){
    if(window.XLW_BATTLE.gameEnded) return;

    if(turn >= window.XLW_BATTLE.finalTurn && phase === "結束階段"){
      window.XLW_BATTLE.gameEnded = true;

      const p = window.xlwCalculateScore("player");
      const e = window.xlwCalculateScore("enemy");

      let result = "DRAW";
      let msg = "平手";

      if(p > e){
        result = "VICTORY";
        msg = "我方勝利";
      }else if(e > p){
        result = "DEFEAT";
        msg = "對手勝利";
      }

      xlwShowResultPanel(result, p, e, msg);
    }
  }

  function xlwShowResultPanel(result, p, e, msg){
    let panel = document.getElementById("xlwResultPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "xlwResultPanel";
      panel.className = "xlw-result-panel";
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="xlw-result-box">
        <div class="xlw-result-title">${result}</div>
        <div class="xlw-result-msg">${msg}</div>
        <div class="xlw-result-score">我方 ${p} ★ ｜ 對手 ${e} ★</div>
        <button id="xlwCloseResultBtn">關閉</button>
      </div>
    `;

    panel.classList.add("show");

    document.getElementById("xlwCloseResultBtn").onclick = ()=>{
      panel.classList.remove("show");
    };
  }

  // 已停用舊版即時戰鬥 listener：改由防守階段統一結算。

  // 戰鬥結算按鈕：若沒有已選攻擊，提示
  function patchResolveButton(){
    ["hardResolveBtn","cleanResolveBtn","realResolveBtn","resolveCombatBtn"].forEach(id=>{
      const btn = document.getElementById(id);
      if(!btn) return;

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(phase !== "進攻宣言"){
          setStatus("目前不是進攻宣言階段。");
          return;
        }

        if(!window.XLW_BATTLE.selectedAttacker){
          setStatus("請先選擇攻擊單位，再點敵方目標。");
          return;
        }

        setStatus("請直接點選敵方單位作為攻擊目標。");
      };
    });
  }

  const OLD_RENDER_BATTLE_SYSTEM = render;
  render = function(){
    OLD_RENDER_BATTLE_SYSTEM();

    setTimeout(()=>{
      patchResolveButton();
      xlwUpdateScorePanel();
      xlwUpdateBattleLog();
      xlwCheckFinalResult();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        slot.classList.remove("xlw-attacker-selected","xlw-target-legal","xlw-target-illegal");

        const selected = window.XLW_BATTLE.selectedAttacker;
        if(selected && selected.zone === zone && selected.idx === idx){
          slot.classList.add("xlw-attacker-selected");
        }

        if(phase === "進攻宣言" && selected && xlwIsEnemyZone(zone)){
          if(xlwCanTarget(selected, zone, idx)){
            slot.classList.add("xlw-target-legal");
          }else if(field[zone][idx]){
            slot.classList.add("xlw-target-illegal");
          }
        }
      });
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      xlwUpdateScorePanel();
      xlwUpdateBattleLog();
      patchResolveButton();
    },500);
  });

})();


// ======================================================
// ENEMY TEST UNITS
// 測試戰鬥用：一鍵生成對手單位
// ======================================================

(function(){

  function makeEnemyTestUnit(name, atk, stars, image){
    return {
      card:{
        id:"enemy_test_" + name,
        name:name,
        type:"unit",
        attack:atk,
        atk:atk,
        score:stars,
        stars:stars,
        tribute:0,
        effect_text:"測試用單位",
        image:image || "/static/little_traveler_back.jpeg"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:"enemy_front"
    };
  }

  window.xlwSummonEnemyTestUnits = function(){
    const images = [];

    try{
      if(Array.isArray(allCards)){
        allCards.forEach(c=>{
          if(c && c.image) images.push(c.image);
        });
      }
    }catch(e){}

    const data = [
      ["測試妖怪A", 1, 1],
      ["測試妖怪B", 2, 2],
      ["測試妖怪C", 3, 1],
      ["測試妖怪D", 1, 3],
      ["測試妖怪E", 2, 1]
    ];

    for(let i=0;i<5;i++){
      if(!field.enemy_front[i]){
        const img = images[i % Math.max(images.length,1)] || "/static/little_traveler_back.jpeg";
        field.enemy_front[i] = makeEnemyTestUnit(data[i][0], data[i][1], data[i][2], img);
      }
    }

    setStatus("已生成對手測試單位，可進入進攻宣言測試戰鬥。");
    if(typeof logBattle === "function") logBattle("生成對手測試單位");

    render();
  };

  function ensureEnemyTestButton(){
    let panel =
      document.getElementById("controlPanelHard") ||
      document.getElementById("cleanControlPanelFinal") ||
      document.getElementById("realControlPanel");

    if(!panel) return;

    if(document.getElementById("hardEnemyTestBtn")) return;

    const btn = document.createElement("button");
    btn.id = "hardEnemyTestBtn";
    btn.type = "button";
    btn.textContent = "對手測試";
    btn.onclick = window.xlwSummonEnemyTestUnits;

    const grid =
      panel.querySelector(".control-hard-grid") ||
      panel.querySelector(".clean-grid") ||
      panel.querySelector(".real-control-grid") ||
      panel;

    grid.appendChild(btn);
  }

  const OLD_RENDER_ENEMY_TEST = render;
  render = function(){
    OLD_RENDER_ENEMY_TEST();
    setTimeout(ensureEnemyTestButton, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(ensureEnemyTestButton, 500);
  });

  setTimeout(ensureEnemyTestButton, 1200);

})();


// ======================================================
// ENEMY DECK + CONTINUOUS TURN SYSTEM v1
// 對手牌組：妖怪村莊
// 我方回合結束後，自動執行對手回合，再回到我方下一回合
// ======================================================

(function(){

  window.XLW_ENEMY = {
    deck: [],
    hand: [],
    grave: [],
    deckName: "妖怪村莊",
    enabled: true,
    running: false
  };

  function clone(obj){
    return JSON.parse(JSON.stringify(obj));
  }

  function enemyCard(name, atk, stars, imgIndex){
    let img = "/static/little_traveler_back.jpeg";
    try{
      const imgs = (allCards || []).filter(c=>c && c.image).map(c=>c.image);
      if(imgs.length) img = imgs[imgIndex % imgs.length];
    }catch(e){}

    return {
      id:"youkai_" + name,
      name:name,
      type:"unit",
      attack:atk,
      atk:atk,
      score:stars,
      stars:stars,
      tribute:0,
      faction:"妖怪村莊",
      effect_text:"妖怪村莊測試牌",
      image:img
    };
  }

  function buildEnemyDeck(){
    const baseCards = [
      enemyCard("河童小兵",1,1,0),
      enemyCard("燈籠妖",1,2,1),
      enemyCard("山童守衛",2,1,2),
      enemyCard("狐火術士",2,2,3),
      enemyCard("鬼面武者",3,2,4),
      enemyCard("貓又斥候",1,1,5),
      enemyCard("唐傘怪",2,1,6),
      enemyCard("座敷童子",1,3,7),
      enemyCard("赤鬼",3,1,8),
      enemyCard("青鬼",2,3,9)
    ];

    const deck = [];
    for(let i=0;i<3;i++){
      baseCards.forEach(c=>deck.push(clone(c)));
    }

    // 30 張
    return deck;
  }

  function shuffleEnemy(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
  }

  window.xlwInitEnemyDeck = function(){
    window.XLW_ENEMY.deck = buildEnemyDeck();
    shuffleEnemy(window.XLW_ENEMY.deck);
    window.XLW_ENEMY.hand = [];
    window.XLW_ENEMY.grave = [];
    enemyGraveyard = window.XLW_ENEMY.grave;

    // 對手起手 4
    for(let i=0;i<4;i++){
      xlwEnemyDraw(1);
    }

    if(typeof logBattle === "function"){
      logBattle("對手牌組：妖怪村莊 已準備");
    }
  };

  function xlwEnemyDraw(n){
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length > 0){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
      }
    }
  }

  function makeEnemyUnit(card, zone){
    return {
      card:card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:zone
    };
  }

  function enemyFrontHasEmpty(){
    return field.enemy_front.some(x=>!x);
  }

  function enemyFirstEmptyZone(){
    if(enemyFrontHasEmpty()){
      for(let i=0;i<5;i++){
        if(!field.enemy_front[i]) return {zone:"enemy_front", idx:i};
      }
    }

    for(let i=0;i<5;i++){
      if(!field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    }

    return null;
  }

  function enemySummonOne(){
    const dest = enemyFirstEmptyZone();
    if(!dest) return false;

    const idx = window.XLW_ENEMY.hand.findIndex(c => c.type === "unit" && Number(c.tribute || 0) <= 0);
    if(idx < 0) return false;

    const card = window.XLW_ENEMY.hand[idx];
    window.XLW_ENEMY.hand.splice(idx,1);

    field[dest.zone][dest.idx] = makeEnemyUnit(card, dest.zone);

    if(typeof logBattle === "function"){
      logBattle(`對手召喚 ${card.name} 到 ${dest.zone === "enemy_front" ? "前排" : "後排"}${dest.idx + 1}`);
    }

    return true;
  }

  function enemyCanAttackTarget(i){
    if(field.player_front[i]) return {zone:"player_front", idx:i};
    if(field.player_back[i]) return {zone:"player_back", idx:i};
    return null;
  }

  function unitAtk(unit){
    const c = unit.card || unit;
    return Number(c.attack ?? c.atk ?? 0);
  }

  function unitName(unit){
    const c = unit.card || unit;
    return c.name || "未知單位";
  }

  function enemyDestroyPlayerUnit(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    graveyard.push(unit.card || unit);
    field[zone][idx] = null;
  }

  function enemyDestroyEnemyUnit(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    window.XLW_ENEMY.grave.push(unit.card || unit);
    enemyGraveyard = window.XLW_ENEMY.grave;
    field[zone][idx] = null;
  }

  function enemyResolveAttack(attZone, attIdx, target){
    const attacker = field[attZone][attIdx];
    const defender = field[target.zone][target.idx];

    if(!attacker || !defender) return;

    const atk = unitAtk(attacker);
    const def = unitAtk(defender);

    if(atk > def){
      const defName = unitName(defender);
      enemyDestroyPlayerUnit(target.zone, target.idx);
      attacker.tapped = true;

      if(typeof logBattle === "function"){
        logBattle(`對手 ${unitName(attacker)} 攻擊並破壞 ${defName}`);
      }
    }else if(atk < def){
      const attName = unitName(attacker);
      enemyDestroyEnemyUnit(attZone, attIdx);

      if(typeof logBattle === "function"){
        logBattle(`對手 ${attName} 攻擊失敗被破壞`);
      }
    }else{
      const attName = unitName(attacker);
      const defName = unitName(defender);

      enemyDestroyEnemyUnit(attZone, attIdx);
      enemyDestroyPlayerUnit(target.zone, target.idx);

      if(typeof logBattle === "function"){
        logBattle(`對手 ${attName} 與 ${defName} 同歸於盡`);
      }
    }
  }

  function enemyAttackAll(){
    // 對手前排優先攻擊同戰線
    for(let i=0;i<5;i++){
      const attacker = field.enemy_front[i];
      if(!attacker || attacker.tapped) continue;

      const target = enemyCanAttackTarget(i);
      if(target){
        enemyResolveAttack("enemy_front", i, target);
      }
    }
  }

  function enemyUntapAll(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function playerUntapAll(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  window.xlwRunEnemyTurn = function(){
    if(window.XLW_ENEMY.running) return;
    window.XLW_ENEMY.running = true;

    setStatus("對手回合：妖怪村莊行動中...");

    if(typeof logBattle === "function"){
      logBattle("—— 對手回合開始 ——");
    }

    enemyUntapAll();
    xlwEnemyDraw(2);

    // 對手召喚 1 隻
    enemySummonOne();

    // 對手進攻
    enemyAttackAll();

    if(typeof logBattle === "function"){
      logBattle("—— 對手回合結束 ——");
    }

    window.XLW_ENEMY.running = false;
  };

  window.xlwStartPlayerNextTurn = function(){
    turn++;
    phase = "召喚階段";
    mode = null;

    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    playerUntapAll();
    draw(2);

    setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
  };

  window.xlwEndPlayerTurnAndRunEnemy = function(){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    xlwRunEnemyTurn();
    xlwStartPlayerNextTurn();

    render();
  };

  // 取代右上「下一回合 / 跳過」按鈕邏輯
  function patchEndButtonEnemyTurn(){
    const btn = document.getElementById("hardEndBtn");
    if(!btn) return;

    btn.disabled = false;

    if(phase === "結束階段"){
      btn.textContent = "結束回合";
    }else if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
      btn.textContent = "結束回合";
    }else{
      btn.textContent = "進入結束階段";
    }

    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();

      if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
        window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "結束階段"){
        window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      setStatus("召喚階段後請選擇戰術佈陣或進攻宣言，或在限制回合直接結束回合。");
    };
  }

  // 新局時初始化敵方牌組
  const OLD_NEWGAME_ENEMY_TURN = newGame;
  newGame = function(){
    OLD_NEWGAME_ENEMY_TURN();
    setTimeout(()=>{
      window.xlwInitEnemyDeck();
      render();
    },0);
  };

  // 顯示對手牌庫數量
  function patchEnemyDeckVisualCount(){
    try{
      if(typeof window.renderDeckVisualFinalFixed === "function"){
        window.renderDeckVisualFinalFixed("enemyDeck", window.XLW_ENEMY.deck.length, "對手");
      }
    }catch(e){}
  }

  // 加入對手資訊面板
  function ensureEnemyInfoPanel(){
    let p = document.getElementById("xlwEnemyInfoPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwEnemyInfoPanel";
      p.className = "xlw-enemy-info-panel";
      p.innerHTML = `
        <div class="enemy-info-title">對手牌組：妖怪村莊</div>
        <div>牌庫：<span id="enemyDeckCountInfo">0</span></div>
        <div>手牌：<span id="enemyHandCountInfo">0</span></div>
      `;
      document.body.appendChild(p);
    }

    const d = document.getElementById("enemyDeckCountInfo");
    const h = document.getElementById("enemyHandCountInfo");

    if(d) d.textContent = window.XLW_ENEMY.deck.length;
    if(h) h.textContent = window.XLW_ENEMY.hand.length;
  }

  const OLD_RENDER_ENEMY_TURN_SYSTEM = render;
  render = function(){
    OLD_RENDER_ENEMY_TURN_SYSTEM();

    setTimeout(()=>{
      patchEndButtonEnemyTurn();
      ensureEnemyInfoPanel();
      patchEnemyDeckVisualCount();
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      if(!window.XLW_ENEMY.deck.length){
        window.xlwInitEnemyDeck();
      }
      patchEndButtonEnemyTurn();
      ensureEnemyInfoPanel();
    },700);
  });

})();


// ======================================================
// OPPONENT TURN FLOW FIX v2
// - 對手牌組不再使用「妖怪村莊」
// - 對手沒有防守階段
// - 對手行動改成逐步顯示，方便看清楚流程
// ======================================================

(function(){

  window.XLW_OPPONENT_FLOW = {
    running:false,
    step:"",
    delay:900,
    deckName:"對手牌組"
  };

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cloneCard(obj){
    return JSON.parse(JSON.stringify(obj));
  }

  function unitCardsFromAllCards(){
    try{
      return (allCards || []).filter(c =>
        c &&
        (c.type === "unit" || c.type === "單位") &&
        Number(c.tribute || 0) <= 0
      );
    }catch(e){
      return [];
    }
  }

  function fallbackOpponentCard(name, atk, stars, imgIndex){
    let img = "/static/little_traveler_back.jpeg";
    try{
      const imgs = (allCards || []).filter(c=>c && c.image).map(c=>c.image);
      if(imgs.length) img = imgs[imgIndex % imgs.length];
    }catch(e){}

    return {
      id:"opponent_test_" + name,
      name:name,
      type:"unit",
      attack:atk,
      atk:atk,
      score:stars,
      stars:stars,
      tribute:0,
      faction:"對手",
      effect_text:"對手測試單位",
      image:img
    };
  }

  function buildOpponentDeckV2(){
    const sourceUnits = unitCardsFromAllCards();

    const deck = [];

    if(sourceUnits.length >= 5){
      // 使用現有卡牌資料建立對手牌組，不固定成妖怪村莊
      for(let i=0;i<30;i++){
        deck.push(cloneCard(sourceUnits[i % sourceUnits.length]));
      }
      return deck;
    }

    const fallback = [
      fallbackOpponentCard("對手單位A",1,1,0),
      fallbackOpponentCard("對手單位B",2,1,1),
      fallbackOpponentCard("對手單位C",1,2,2),
      fallbackOpponentCard("對手單位D",3,1,3),
      fallbackOpponentCard("對手單位E",2,2,4)
    ];

    for(let i=0;i<6;i++){
      fallback.forEach(c=>deck.push(cloneCard(c)));
    }

    return deck;
  }

  function shuffleOpponent(deckArr){
    for(let i=deckArr.length-1;i>0;i--){
      const j = Math.floor(Math.random() * (i+1));
      [deckArr[i], deckArr[j]] = [deckArr[j], deckArr[i]];
    }
  }

  window.xlwInitEnemyDeck = function(){
    if(!window.XLW_ENEMY){
      window.XLW_ENEMY = {};
    }

    window.XLW_ENEMY.deckName = "對手牌組";
    window.XLW_ENEMY.deck = buildOpponentDeckV2();
    shuffleOpponent(window.XLW_ENEMY.deck);
    window.XLW_ENEMY.hand = [];
    window.XLW_ENEMY.grave = [];
    enemyGraveyard = window.XLW_ENEMY.grave;

    for(let i=0;i<4;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
      }
    }

    if(typeof logBattle === "function"){
      logBattle("對手牌組已準備");
    }
  };

  function setOpponentStep(text){
    window.XLW_OPPONENT_FLOW.step = text;
    setStatus(text);
    updateOpponentStepPanel();
  }

  function ensureOpponentStepPanel(){
    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `
        <div class="op-step-title">對手行動</div>
        <div id="opStepText">等待中</div>
      `;
      document.body.appendChild(p);
    }
    return p;
  }

  function updateOpponentStepPanel(){
    const p = ensureOpponentStepPanel();
    const text = document.getElementById("opStepText");
    if(text) text.textContent = window.XLW_OPPONENT_FLOW.step || "等待中";
    p.classList.toggle("active", !!window.XLW_OPPONENT_FLOW.running);
  }

  function enemyDrawV2(n){
    let drawn = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length > 0){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        drawn++;
      }
    }
    return drawn;
  }

  function makeOpponentUnit(card, zone){
    return {
      card:card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:zone
    };
  }

  function enemyFirstEmptyZoneV2(){
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i]) return {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    }
    return null;
  }

  function enemySummonOneV2(){
    const dest = enemyFirstEmptyZoneV2();
    if(!dest) return null;

    const idx = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(idx < 0) return null;

    const card = window.XLW_ENEMY.hand[idx];
    window.XLW_ENEMY.hand.splice(idx,1);

    field[dest.zone][dest.idx] = makeOpponentUnit(card, dest.zone);

    return {
      card,
      zone:dest.zone,
      idx:dest.idx
    };
  }

  function getAtk(unit){
    const c = unit.card || unit;
    return Number(c.attack ?? c.atk ?? 0);
  }

  function getName(unit){
    const c = unit.card || unit;
    return c.name || "未知單位";
  }

  function destroyPlayer(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    graveyard.push(unit.card || unit);
    field[zone][idx] = null;
  }

  function destroyEnemy(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    window.XLW_ENEMY.grave.push(unit.card || unit);
    enemyGraveyard = window.XLW_ENEMY.grave;
    field[zone][idx] = null;
  }

  function opponentTargetForLane(i){
    if(field.player_front[i]) return {zone:"player_front", idx:i};
    if(field.player_back[i]) return {zone:"player_back", idx:i};
    return null;
  }

  function flashOpponentBattle(attZone, attIdx, target){
    const a = document.querySelector(`[data-zone="${attZone}"][data-index="${attIdx}"]`);
    const t = document.querySelector(`[data-zone="${target.zone}"][data-index="${target.idx}"]`);

    if(a) a.classList.add("xlw-attack-flash");
    if(t) t.classList.add("xlw-hit-flash");

    setTimeout(()=>{
      if(a) a.classList.remove("xlw-attack-flash");
      if(t) t.classList.remove("xlw-hit-flash");
    }, 650);
  }

  function opponentResolveAttack(attZone, attIdx, target){
    const attacker = field[attZone][attIdx];
    const defender = field[target.zone][target.idx];

    if(!attacker || !defender) return "攻擊取消";

    const atk = getAtk(attacker);
    const def = getAtk(defender);

    flashOpponentBattle(attZone, attIdx, target);

    if(atk > def){
      const defName = getName(defender);
      destroyPlayer(target.zone, target.idx);
      attacker.tapped = true;
      return `對手 ${getName(attacker)} 擊破 ${defName}`;
    }

    if(atk < def){
      const attName = getName(attacker);
      destroyEnemy(attZone, attIdx);
      return `對手 ${attName} 攻擊失敗被破壞`;
    }

    const attName = getName(attacker);
    const defName = getName(defender);
    destroyEnemy(attZone, attIdx);
    destroyPlayer(target.zone, target.idx);

    return `對手 ${attName} 與 ${defName} 同歸於盡`;
  }

  function enemyUntapV2(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function playerUntapV2(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  window.xlwRunEnemyTurn = async function(){
    if(window.XLW_OPPONENT_FLOW.running) return;

    if(!window.XLW_ENEMY || !window.XLW_ENEMY.deck || !window.XLW_ENEMY.deck.length){
      window.xlwInitEnemyDeck();
    }

    window.XLW_OPPONENT_FLOW.running = true;

    if(typeof logBattle === "function"){
      logBattle("—— 對手回合開始 ——");
    }

    setOpponentStep("對手回合開始");
    render();
    await sleep(window.XLW_OPPONENT_FLOW.delay);

    setOpponentStep("對手整備：單位轉正");
    enemyUntapV2();
    render();
    await sleep(window.XLW_OPPONENT_FLOW.delay);

    const drawn = enemyDrawV2(2);
    setOpponentStep(`對手抽牌：抽 ${drawn} 張`);
    if(typeof logBattle === "function") logBattle(`對手抽 ${drawn} 張`);
    render();
    await sleep(window.XLW_OPPONENT_FLOW.delay);

    const summoned = enemySummonOneV2();
    if(summoned){
      setOpponentStep(`對手召喚：${summoned.card.name}`);
      if(typeof logBattle === "function") logBattle(`對手召喚 ${summoned.card.name}`);
    }else{
      setOpponentStep("對手沒有可召喚單位");
      if(typeof logBattle === "function") logBattle("對手沒有可召喚單位");
    }
    render();
    await sleep(window.XLW_OPPONENT_FLOW.delay);

    // 對手沒有防守階段；直接進攻處理
    for(let i=0;i<5;i++){
      const attacker = field.enemy_front[i];
      if(!attacker || attacker.tapped) continue;

      const target = opponentTargetForLane(i);
      if(!target) continue;

      setOpponentStep(`對手攻擊：${getName(attacker)} 攻擊我方單位`);
      render();
      await sleep(window.XLW_OPPONENT_FLOW.delay);

      const result = opponentResolveAttack("enemy_front", i, target);
      setOpponentStep(result);
      if(typeof logBattle === "function") logBattle(result);
      render();
      await sleep(window.XLW_OPPONENT_FLOW.delay);
    }

    setOpponentStep("對手回合結束");
    if(typeof logBattle === "function"){
      logBattle("—— 對手回合結束 ——");
    }
    render();
    await sleep(window.XLW_OPPONENT_FLOW.delay);

    window.XLW_OPPONENT_FLOW.running = false;
    updateOpponentStepPanel();
  };

  window.xlwStartPlayerNextTurn = function(){
    turn++;
    phase = "召喚階段";
    mode = null;

    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    playerUntapV2();
    draw(2);

    setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
  };

  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    if(window.XLW_OPPONENT_FLOW.running) return;

    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    await window.xlwRunEnemyTurn();
    window.xlwStartPlayerNextTurn();
    render();
  };

  function patchEndButtonOpponentFlow(){
    const btn = document.getElementById("hardEndBtn");
    if(!btn) return;

    btn.disabled = window.XLW_OPPONENT_FLOW.running;

    if(phase === "結束階段"){
      btn.textContent = "結束回合";
    }else if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
      btn.textContent = "結束回合";
    }else{
      btn.textContent = "進入結束階段";
    }

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(window.XLW_OPPONENT_FLOW.running) return;

      if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "結束階段"){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      setStatus("召喚階段後請選擇戰術佈陣或進攻宣言，或在限制回合直接結束回合。");
    };
  }

  function ensureOpponentInfoV2(){
    let p = document.getElementById("xlwEnemyInfoPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwEnemyInfoPanel";
      p.className = "xlw-enemy-info-panel";
      p.innerHTML = `
        <div class="enemy-info-title">對手牌組</div>
        <div>牌庫：<span id="enemyDeckCountInfo">0</span></div>
        <div>手牌：<span id="enemyHandCountInfo">0</span></div>
      `;
      document.body.appendChild(p);
    }

    const title = p.querySelector(".enemy-info-title");
    if(title) title.textContent = "對手牌組";

    const d = document.getElementById("enemyDeckCountInfo");
    const h = document.getElementById("enemyHandCountInfo");

    if(d) d.textContent = window.XLW_ENEMY?.deck?.length || 0;
    if(h) h.textContent = window.XLW_ENEMY?.hand?.length || 0;
  }

  const OLD_RENDER_OPPONENT_FLOW_V2 = render;
  render = function(){
    OLD_RENDER_OPPONENT_FLOW_V2();

    setTimeout(()=>{
      patchEndButtonOpponentFlow();
      ensureOpponentStepPanel();
      updateOpponentStepPanel();
      ensureOpponentInfoV2();

      try{
        if(typeof window.renderDeckVisualFinalFixed === "function"){
          window.renderDeckVisualFinalFixed("enemyDeck", window.XLW_ENEMY.deck.length, "對手");
        }
      }catch(e){}
    },0);
  };

  const OLD_NEWGAME_OPPONENT_FLOW_V2 = newGame;
  newGame = function(){
    OLD_NEWGAME_OPPONENT_FLOW_V2();
    setTimeout(()=>{
      window.xlwInitEnemyDeck();
      render();
    },0);
  };

})();


// ======================================================
// CORRECT TURN FLOW + DEFENSE PHASE v3
// 對手牌組：妖怪村莊
// 流程：我方回合開始抽2 -> 若前一回合對手有進攻宣言，先進防守回合
// 防守判定依星星戰線 1 -> 5 依序處理
// 對手沒有防守階段；對手只會在對手回合進行召喚與進攻宣言
// ======================================================

(function(){

  window.XLW_RULE_FLOW = {
    opponentDeckName:"妖怪村莊",
    opponentAttackPending:false,
    resolvingDefense:false,
    delay:950
  };

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cloneCard(obj){
    return JSON.parse(JSON.stringify(obj));
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random() * (i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function getCardById(id){
    return (allCards || []).find(c => c.id === id);
  }

  function unitName(unit){
    const c = unit && (unit.card || unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function unitAtk(unit){
    const c = unit && (unit.card || unit);
    return Number(c ? (c.attack ?? c.atk ?? 0) : 0);
  }

  function setStep(text){
    if(!window.XLW_OPPONENT_FLOW){
      window.XLW_OPPONENT_FLOW = {};
    }
    window.XLW_OPPONENT_FLOW.step = text;
    setStatus(text);

    const panel = document.getElementById("xlwOpponentStepPanel") || ensureStepPanel();
    const label = document.getElementById("opStepText");
    if(label) label.textContent = text;
    panel.classList.add("active");
  }

  function ensureStepPanel(){
    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `
        <div class="op-step-title">流程提示</div>
        <div id="opStepText">等待中</div>
      `;
      document.body.appendChild(p);
    }
    return p;
  }

  function clearStepActive(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  window.xlwInitEnemyDeck = function(){
    if(!window.XLW_ENEMY){
      window.XLW_ENEMY = {};
    }

    const ids = decks && decks["妖怪村莊"] ? decks["妖怪村莊"] : [];
    const cards = ids.map(getCardById).filter(Boolean).map(cloneCard);

    window.XLW_ENEMY.deckName = "妖怪村莊";
    window.XLW_ENEMY.deck = cards.length ? cards : (allCards || []).filter(c => c.deck === "妖怪村莊").map(cloneCard);
    shuffle(window.XLW_ENEMY.deck);

    window.XLW_ENEMY.hand = [];
    window.XLW_ENEMY.grave = [];
    enemyGraveyard = window.XLW_ENEMY.grave;

    for(let i=0;i<4;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
      }
    }

    window.XLW_RULE_FLOW.opponentAttackPending = false;

    if(typeof logBattle === "function"){
      logBattle("對手牌組：妖怪村莊 已準備");
    }
  };

  function enemyDraw(n){
    let count = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        count++;
      }
    }
    return count;
  }

  function makeEnemyUnit(card, zone){
    return {
      card:card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:zone
    };
  }

  function enemyFirstEmptyZone(){
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i]) return {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    }
    return null;
  }

  function enemySummonOne(){
    const dest = enemyFirstEmptyZone();
    if(!dest) return null;

    const handIndex = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(handIndex < 0) return null;

    const card = window.XLW_ENEMY.hand[handIndex];
    window.XLW_ENEMY.hand.splice(handIndex, 1);

    field[dest.zone][dest.idx] = makeEnemyUnit(card, dest.zone);

    return {
      card,
      zone:dest.zone,
      idx:dest.idx
    };
  }

  function untapEnemy(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(unit=>{
        if(unit){
          unit.tapped = false;
          unit.attacking = false;
          unit.target = null;
        }
      });
    });
  }

  function untapPlayer(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(unit=>{
        if(unit){
          unit.tapped = false;
          unit.attacking = false;
          unit.target = null;
        }
      });
    });
  }

  function chooseEnemyAttackTarget(lane){
    if(field.player_front[lane]) return {zone:"player_front", idx:lane};
    if(field.player_back[lane]) return {zone:"player_back", idx:lane};
    return null;
  }

  function enemyDeclareAttacks(){
    let count = 0;

    for(let i=0;i<5;i++){
      const attacker = field.enemy_front[i];
      if(!attacker || attacker.tapped) continue;

      const target = chooseEnemyAttackTarget(i);
      if(!target) continue;

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${i + 1}，${unitName(attacker)} 指向我方單位`);
      }
    }

    window.XLW_RULE_FLOW.opponentAttackPending = count > 0;
    return count;
  }

  window.xlwRunEnemyTurn = async function(){
    if(!window.XLW_ENEMY || !window.XLW_ENEMY.deck){
      window.xlwInitEnemyDeck();
    }

    setStep("對手回合開始");
    if(typeof logBattle === "function") logBattle("—— 對手回合開始 ——");
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    setStep("對手整備：單位轉正");
    untapEnemy();
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    const drawn = enemyDraw(2);
    setStep(`對手抽牌：抽 ${drawn} 張`);
    if(typeof logBattle === "function") logBattle(`對手抽 ${drawn} 張`);
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    const summoned = enemySummonOne();
    if(summoned){
      setStep(`對手召喚：${summoned.card.name}`);
      if(typeof logBattle === "function") logBattle(`對手召喚 ${summoned.card.name}`);
    }else{
      setStep("對手沒有可召喚單位");
      if(typeof logBattle === "function") logBattle("對手沒有可召喚單位");
    }
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    // 對手沒有防守階段；直接進行進攻宣言，但不立刻判定
    const attacks = enemyDeclareAttacks();
    if(attacks > 0){
      setStep(`對手進攻宣言：共 ${attacks} 條星星戰線待防守`);
      if(typeof logBattle === "function") logBattle(`對手進攻宣言 ${attacks} 條星星戰線`);
    }else{
      setStep("對手沒有進攻宣言");
      if(typeof logBattle === "function") logBattle("對手沒有進攻宣言");
    }
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    setStep("對手回合結束");
    if(typeof logBattle === "function") logBattle("—— 對手回合結束 ——");
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    clearStepActive();
  };

  function destroyEnemyUnit(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    window.XLW_ENEMY.grave.push(unit.card || unit);
    enemyGraveyard = window.XLW_ENEMY.grave;
    field[zone][idx] = null;
  }

  function destroyPlayerUnit(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    graveyard.push(unit.card || unit);
    field[zone][idx] = null;
  }

  function flashBattle(attZone, attIdx, target){
    const a = document.querySelector(`[data-zone="${attZone}"][data-index="${attIdx}"]`);
    const t = document.querySelector(`[data-zone="${target.zone}"][data-index="${target.idx}"]`);

    if(a) a.classList.add("xlw-attack-flash");
    if(t) t.classList.add("xlw-hit-flash");

    setTimeout(()=>{
      if(a) a.classList.remove("xlw-attack-flash");
      if(t) t.classList.remove("xlw-hit-flash");
    }, 650);
  }

  async function resolveDefenseLane(lane){
    const attacker = field.enemy_front[lane];

    if(!attacker || !attacker.attacking || !attacker.target){
      setStep(`防守判定：星星戰線${lane + 1} 無攻擊`);
      render();
      await sleep(window.XLW_RULE_FLOW.delay);
      return;
    }

    const target = attacker.target;
    const defender = field[target.zone][target.idx];

    if(!defender){
      attacker.attacking = false;
      attacker.target = null;

      setStep(`防守判定：星星戰線${lane + 1} 目標已不存在`);
      render();
      await sleep(window.XLW_RULE_FLOW.delay);
      return;
    }

    setStep(`防守判定：星星戰線${lane + 1}，${unitName(attacker)} vs ${unitName(defender)}`);
    flashBattle("enemy_front", lane, target);
    render();
    await sleep(window.XLW_RULE_FLOW.delay);

    const atk = unitAtk(attacker);
    const def = unitAtk(defender);

    if(atk > def){
      const defenderName = unitName(defender);
      destroyPlayerUnit(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;

      setStep(`星星戰線${lane + 1}：${unitName(attacker)} 擊破 ${defenderName}`);
      if(typeof logBattle === "function") logBattle(`防守判定：${unitName(attacker)} 擊破 ${defenderName}`);
    }else if(atk < def){
      const attackerName = unitName(attacker);
      destroyEnemyUnit("enemy_front", lane);

      setStep(`星星戰線${lane + 1}：${attackerName} 攻擊失敗被破壞`);
      if(typeof logBattle === "function") logBattle(`防守判定：${attackerName} 攻擊失敗被破壞`);
    }else{
      const attackerName = unitName(attacker);
      const defenderName = unitName(defender);

      destroyEnemyUnit("enemy_front", lane);
      destroyPlayerUnit(target.zone, target.idx);

      setStep(`星星戰線${lane + 1}：${attackerName} 與 ${defenderName} 同歸於盡`);
      if(typeof logBattle === "function") logBattle(`防守判定：${attackerName} 與 ${defenderName} 同歸於盡`);
    }

    render();
    await sleep(window.XLW_RULE_FLOW.delay);
  }

  window.xlwResolveDefensePhase = async function(){
    if(window.XLW_RULE_FLOW.resolvingDefense) return;

    window.XLW_RULE_FLOW.resolvingDefense = true;

    if(typeof logBattle === "function"){
      logBattle("—— 防守回合開始 ——");
    }

    for(let lane=0; lane<5; lane++){
      await resolveDefenseLane(lane);
    }

    window.XLW_RULE_FLOW.opponentAttackPending = false;
    window.XLW_RULE_FLOW.resolvingDefense = false;

    phase = "召喚階段";
    mode = null;

    setStep("防守回合結束，進入召喚階段");
    if(typeof logBattle === "function") logBattle("—— 防守回合結束 ——");

    render();
    await sleep(window.XLW_RULE_FLOW.delay);
    clearStepActive();
  };

  window.xlwStartPlayerNextTurn = function(){
    turn++;
    mode = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    untapPlayer();
    draw(2);

    if(window.XLW_RULE_FLOW.opponentAttackPending){
      phase = "防守回合";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。請先進行防守判定。`);
    }else{
      phase = "召喚階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
    }
  };

  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    await window.xlwRunEnemyTurn();
    window.xlwStartPlayerNextTurn();

    render();
  };

  function ensureDefenseButton(){
    const panel = document.getElementById("controlPanelHard");
    if(!panel) return;

    if(document.getElementById("hardDefenseBtn")) return;

    const btn = document.createElement("button");
    btn.id = "hardDefenseBtn";
    btn.type = "button";
    btn.textContent = "防守判定";
    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      if(phase !== "防守回合"){
        setStatus("目前不是防守回合。");
        return;
      }
      window.xlwResolveDefensePhase();
    };

    const grid = panel.querySelector(".control-hard-grid") || panel;
    grid.prepend(btn);
  }

  function patchHardButtons(){
    ensureDefenseButton();

    const defense = document.getElementById("hardDefenseBtn");
    if(defense){
      defense.disabled = phase !== "防守回合" || window.XLW_RULE_FLOW.resolvingDefense;
    }

    const end = document.getElementById("hardEndBtn");
    if(end){
      end.disabled = phase === "防守回合" || window.XLW_RULE_FLOW.resolvingDefense;

      if(phase === "防守回合"){
        end.textContent = "請先防守";
      }else if(phase === "結束階段"){
        end.textContent = "結束回合";
      }else if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
        end.textContent = "結束回合";
      }else{
        end.textContent = "進入結束階段";
      }

      end.onclick = async function(e){
        e.preventDefault();
        e.stopPropagation();

        if(phase === "防守回合"){
          setStatus("請先按「防守判定」完成戰鬥判定。");
          return;
        }

        if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
          await window.xlwEndPlayerTurnAndRunEnemy();
          return;
        }

        if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
          phase = "結束階段";
          mode = null;
          setStatus("已進入結束階段。");
          render();
          return;
        }

        if(phase === "結束階段"){
          await window.xlwEndPlayerTurnAndRunEnemy();
          return;
        }

        setStatus("召喚階段後請選擇戰術佈陣或進攻宣言。");
      };
    }
  }

  function ensureEnemyInfoCorrect(){
    let p = document.getElementById("xlwEnemyInfoPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwEnemyInfoPanel";
      p.className = "xlw-enemy-info-panel";
      p.innerHTML = `
        <div class="enemy-info-title">對手牌組：妖怪村莊</div>
        <div>牌庫：<span id="enemyDeckCountInfo">0</span></div>
        <div>手牌：<span id="enemyHandCountInfo">0</span></div>
      `;
      document.body.appendChild(p);
    }

    const title = p.querySelector(".enemy-info-title");
    if(title) title.textContent = "對手牌組：妖怪村莊";

    const d = document.getElementById("enemyDeckCountInfo");
    const h = document.getElementById("enemyHandCountInfo");

    if(d) d.textContent = window.XLW_ENEMY?.deck?.length || 0;
    if(h) h.textContent = window.XLW_ENEMY?.hand?.length || 0;
  }

  function updateDefenseVisual(){
    document.querySelectorAll(".slot").forEach(slot=>{
      const zone = slot.dataset.zone;
      const idx = Number(slot.dataset.index);
      const unit = field?.[zone]?.[idx];

      slot.classList.toggle("xlw-defense-attacker", !!(unit && zone === "enemy_front" && unit.attacking));
      slot.classList.toggle("xlw-defense-target", !!(
        phase === "防守回合" &&
        unit &&
        (zone === "player_front" || zone === "player_back")
      ));
    });
  }

  const OLD_RENDER_CORRECT_FLOW = render;
  render = function(){
    OLD_RENDER_CORRECT_FLOW();

    setTimeout(()=>{
      ensureStepPanel();
      patchHardButtons();
      ensureEnemyInfoCorrect();
      updateDefenseVisual();

      const phaseText = document.getElementById("phaseTextHard") || document.getElementById("phaseDisplayText");
      if(phaseText && phase === "防守回合"){
        phaseText.textContent = "防守回合";
      }

      const help = document.getElementById("phaseHelpHard") || document.getElementById("phaseHelpText");
      if(help && phase === "防守回合"){
        help.textContent = "請按「防守判定」。系統會依星星戰線1到5依序處理戰鬥。";
      }

      try{
        if(typeof window.renderDeckVisualFinalFixed === "function"){
          window.renderDeckVisualFinalFixed("enemyDeck", window.XLW_ENEMY.deck.length, "對手");
        }
      }catch(e){}
    },0);
  };

  const OLD_NEWGAME_CORRECT_FLOW = newGame;
  newGame = function(){
    OLD_NEWGAME_CORRECT_FLOW();
    setTimeout(()=>{
      window.xlwInitEnemyDeck();
      render();
    },0);
  };

})();


// ======================================================
// BOTH PLAYERS DEFENSE PHASE FIX v4
// 正確規則：
// 每位玩家回合開始 → 抽2張 → 若前一回合對手有進攻宣言 → 進入防守階段
// 防守階段完成後 → 召喚階段
// ======================================================

(function(){

  window.XLW_DEFENSE_RULE = {
    playerNeedsDefense:false,   // 對手上一回合有進攻宣言，輪到我方時需防守
    enemyNeedsDefense:false,    // 我方上一回合有進攻宣言，輪到對手時需防守
    resolving:false,
    delay:950,
    currentDefender:null        // "player" or "enemy"
  };

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function unitName(unit){
    const c = unit && (unit.card || unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function unitAtk(unit){
    const c = unit && (unit.card || unit);
    return Number(c ? (c.attack ?? c.atk ?? 0) : 0);
  }

  function setFlowStep(text){
    setStatus(text);

    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `
        <div class="op-step-title">流程提示</div>
        <div id="opStepText">等待中</div>
      `;
      document.body.appendChild(p);
    }

    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;

    p.classList.add("active");
  }

  function clearFlowStep(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function playerUntap(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function enemyUntap(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function destroyPlayer(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    graveyard.push(unit.card || unit);
    field[zone][idx] = null;
  }

  function destroyEnemy(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;
    if(window.XLW_ENEMY && window.XLW_ENEMY.grave){
      window.XLW_ENEMY.grave.push(unit.card || unit);
      enemyGraveyard = window.XLW_ENEMY.grave;
    }else{
      enemyGraveyard.push(unit.card || unit);
    }
    field[zone][idx] = null;
  }

  function flashBattle(attZone, attIdx, target){
    const a = document.querySelector(`[data-zone="${attZone}"][data-index="${attIdx}"]`);
    const t = document.querySelector(`[data-zone="${target.zone}"][data-index="${target.idx}"]`);

    if(a) a.classList.add("xlw-attack-flash");
    if(t) t.classList.add("xlw-hit-flash");

    setTimeout(()=>{
      if(a) a.classList.remove("xlw-attack-flash");
      if(t) t.classList.remove("xlw-hit-flash");
    }, 650);
  }

  function resolveOneBattle(attackerZone, attackerIdx, target, defenderOwner){
    const attacker = field[attackerZone][attackerIdx];
    const defender = field[target.zone][target.idx];

    if(!attacker || !defender) return "攻擊者或防守目標不存在";

    const attackerName = unitName(attacker);
    const defenderName = unitName(defender);

    flashBattle(attackerZone, attackerIdx, target);

    const atk = unitAtk(attacker);
    const def = unitAtk(defender);

    if(atk > def){
      if(defenderOwner === "player"){
        destroyPlayer(target.zone, target.idx);
      }else{
        destroyEnemy(target.zone, target.idx);
      }

      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;

      return `${attackerName} 擊破 ${defenderName}`;
    }

    if(atk < def){
      if(attackerZone.startsWith("player_")){
        destroyPlayer(attackerZone, attackerIdx);
      }else{
        destroyEnemy(attackerZone, attackerIdx);
      }

      return `${attackerName} 攻擊失敗被破壞`;
    }

    if(attackerZone.startsWith("player_")){
      destroyPlayer(attackerZone, attackerIdx);
      destroyEnemy(target.zone, target.idx);
    }else{
      destroyEnemy(attackerZone, attackerIdx);
      destroyPlayer(target.zone, target.idx);
    }

    return `${attackerName} 與 ${defenderName} 同歸於盡`;
  }

  // 防守階段：我方防守，處理敵方上一回合的進攻宣言
  window.xlwResolvePlayerDefensePhase = async function(){
    if(window.XLW_DEFENSE_RULE.resolving) return;

    window.XLW_DEFENSE_RULE.resolving = true;
    window.XLW_DEFENSE_RULE.currentDefender = "player";

    if(typeof logBattle === "function") logBattle("—— 我方防守階段開始 ——");

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || !attacker.attacking || !attacker.target){
        setFlowStep(`我方防守：星星戰線${lane + 1} 無攻擊`);
        render();
        await sleep(window.XLW_DEFENSE_RULE.delay);
        continue;
      }

      const target = attacker.target;
      const defender = field[target.zone][target.idx];

      if(!defender){
        attacker.attacking = false;
        attacker.target = null;
        setFlowStep(`我方防守：星星戰線${lane + 1} 目標不存在`);
        render();
        await sleep(window.XLW_DEFENSE_RULE.delay);
        continue;
      }

      setFlowStep(`我方防守：星星戰線${lane + 1}，${unitName(attacker)} vs ${unitName(defender)}`);
      render();
      await sleep(window.XLW_DEFENSE_RULE.delay);

      const result = resolveOneBattle("enemy_front", lane, target, "player");
      setFlowStep(`星星戰線${lane + 1}：${result}`);
      if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

      render();
      await sleep(window.XLW_DEFENSE_RULE.delay);
    }

    window.XLW_DEFENSE_RULE.playerNeedsDefense = false;
    window.XLW_DEFENSE_RULE.resolving = false;
    window.XLW_DEFENSE_RULE.currentDefender = null;

    phase = "召喚階段";
    mode = null;

    setFlowStep("我方防守階段完成，進入召喚階段");
    if(typeof logBattle === "function") logBattle("—— 我方防守階段結束 ——");

    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);
    clearFlowStep();
  };

  // 防守階段：對手防守，處理我方上一回合的進攻宣言
  async function xlwResolveEnemyDefensePhase(){
    if(window.XLW_DEFENSE_RULE.resolving) return;

    window.XLW_DEFENSE_RULE.resolving = true;
    window.XLW_DEFENSE_RULE.currentDefender = "enemy";

    if(typeof logBattle === "function") logBattle("—— 對手防守階段開始 ——");

    for(let lane=0; lane<5; lane++){
      const attacker = field.player_front[lane];

      if(!attacker || !attacker.attacking || !attacker.target){
        setFlowStep(`對手防守：星星戰線${lane + 1} 無攻擊`);
        render();
        await sleep(window.XLW_DEFENSE_RULE.delay);
        continue;
      }

      const target = attacker.target;
      const defender = field[target.zone][target.idx];

      if(!defender){
        attacker.attacking = false;
        attacker.target = null;
        setFlowStep(`對手防守：星星戰線${lane + 1} 目標不存在`);
        render();
        await sleep(window.XLW_DEFENSE_RULE.delay);
        continue;
      }

      setFlowStep(`對手防守：星星戰線${lane + 1}，${unitName(attacker)} vs ${unitName(defender)}`);
      render();
      await sleep(window.XLW_DEFENSE_RULE.delay);

      const result = resolveOneBattle("player_front", lane, target, "enemy");
      setFlowStep(`星星戰線${lane + 1}：${result}`);
      if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

      render();
      await sleep(window.XLW_DEFENSE_RULE.delay);
    }

    window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;
    window.XLW_DEFENSE_RULE.resolving = false;
    window.XLW_DEFENSE_RULE.currentDefender = null;

    setFlowStep("對手防守階段完成");
    if(typeof logBattle === "function") logBattle("—— 對手防守階段結束 ——");

    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);
  }

  function chooseEnemyTarget(lane){
    if(field.player_front[lane]) return {zone:"player_front", idx:lane};
    if(field.player_back[lane]) return {zone:"player_back", idx:lane};
    return null;
  }

  function enemyDeclareAttacksForNextPlayerDefense(){
    let count = 0;

    for(let i=0;i<5;i++){
      const attacker = field.enemy_front[i];
      if(!attacker || attacker.tapped) continue;

      const target = chooseEnemyTarget(i);
      if(!target) continue;

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${i + 1} ${unitName(attacker)} 指向我方單位`);
      }
    }

    window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;
    return count;
  }

  function getEnemyDeckReady(){
    if(!window.XLW_ENEMY || !window.XLW_ENEMY.deck || !window.XLW_ENEMY.deck.length){
      if(typeof window.xlwInitEnemyDeck === "function"){
        window.xlwInitEnemyDeck();
      }
    }
  }

  function enemyDraw(n){
    getEnemyDeckReady();

    let count = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        count++;
      }
    }
    return count;
  }

  function enemyFirstEmptyZone(){
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i]) return {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    }
    return null;
  }

  function enemySummonOne(){
    getEnemyDeckReady();

    const dest = enemyFirstEmptyZone();
    if(!dest) return null;

    const index = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(index < 0) return null;

    const card = window.XLW_ENEMY.hand[index];
    window.XLW_ENEMY.hand.splice(index, 1);

    field[dest.zone][dest.idx] = {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:dest.zone
    };

    return {card, ...dest};
  }

  // 對手完整回合：抽2 → 若我方上一回合有進攻宣言則對手防守 → 召喚 → 戰術/進攻宣言
  window.xlwRunEnemyTurn = async function(){
    getEnemyDeckReady();

    setFlowStep("對手回合開始");
    if(typeof logBattle === "function") logBattle("—— 對手回合開始 ——");
    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);

    enemyUntap();
    const drawn = enemyDraw(2);
    setFlowStep(`對手抽牌：抽 ${drawn} 張`);
    if(typeof logBattle === "function") logBattle(`對手抽 ${drawn} 張`);
    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);

    if(window.XLW_DEFENSE_RULE.enemyNeedsDefense){
      setFlowStep("對手進入防守階段");
      render();
      await sleep(window.XLW_DEFENSE_RULE.delay);
      await xlwResolveEnemyDefensePhase();
    }else{
      setFlowStep("對手無需防守，進入召喚階段");
      render();
      await sleep(window.XLW_DEFENSE_RULE.delay);
    }

    const summoned = enemySummonOne();
    if(summoned){
      setFlowStep(`對手召喚：${summoned.card.name}`);
      if(typeof logBattle === "function") logBattle(`對手召喚 ${summoned.card.name}`);
    }else{
      setFlowStep("對手沒有可召喚單位");
      if(typeof logBattle === "function") logBattle("對手沒有可召喚單位");
    }
    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);

    // 對手選擇進攻宣言，戰鬥留到我方下一回合防守階段處理
    const attacks = enemyDeclareAttacksForNextPlayerDefense();
    if(attacks > 0){
      setFlowStep(`對手進攻宣言：${attacks} 條星星戰線`);
      if(typeof logBattle === "function") logBattle(`對手進攻宣言 ${attacks} 條星星戰線`);
    }else{
      setFlowStep("對手沒有進攻宣言");
      if(typeof logBattle === "function") logBattle("對手沒有進攻宣言");
    }
    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);

    setFlowStep("對手回合結束");
    if(typeof logBattle === "function") logBattle("—— 對手回合結束 ——");
    render();
    await sleep(window.XLW_DEFENSE_RULE.delay);
    clearFlowStep();
  };

  // 我方新回合：抽2 → 若對手上一回合進攻宣言則進入防守階段，否則召喚階段
  window.xlwStartPlayerNextTurn = function(){
    turn++;
    mode = null;

    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    playerUntap();
    draw(2);

    if(window.XLW_DEFENSE_RULE.playerNeedsDefense){
      phase = "防守階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。前一回合對手有進攻宣言，請先進行防守階段。`);
    }else{
      phase = "召喚階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
    }
  };

  // 我方回合結束：若我方本回合有進攻宣言，設定對手下一回合需防守
  function detectPlayerAttackDeclaration(){
    let count = 0;
    for(let i=0;i<5;i++){
      const u = field.player_front[i];
      if(u && u.attacking && u.target){
        count++;
      }
    }
    window.XLW_DEFENSE_RULE.enemyNeedsDefense = count > 0;
    return count;
  }

  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    const playerAttacks = detectPlayerAttackDeclaration();
    if(playerAttacks > 0 && typeof logBattle === "function"){
      logBattle(`我方進攻宣言 ${playerAttacks} 條星星戰線，對手下回合需防守`);
    }

    await window.xlwRunEnemyTurn();

    window.xlwStartPlayerNextTurn();
    render();
  };

  // 我方進攻宣言階段不立即結算，保留到對手回合防守階段
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(phase === "進攻宣言"){
      // 若已有舊戰鬥系統會即時結算，這裡不阻斷選目標，只在 end turn 時給對手防守。
      // 玩家仍可點我方單位與敵方目標完成進攻宣言標記。
    }
  }, true);

  function ensureDefenseButton(){
    const panel = document.getElementById("controlPanelHard");
    if(!panel) return;

    if(document.getElementById("hardDefenseBtn")) return;

    const btn = document.createElement("button");
    btn.id = "hardDefenseBtn";
    btn.type = "button";
    btn.textContent = "防守判定";
    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(phase !== "防守階段"){
        setStatus("目前不是防守階段。");
        return;
      }

      await window.xlwResolvePlayerDefensePhase();
    };

    const grid = panel.querySelector(".control-hard-grid") || panel;
    grid.prepend(btn);
  }

  function patchButtonsDefenseRule(){
    ensureDefenseButton();

    const defense = document.getElementById("hardDefenseBtn");
    if(defense){
      defense.disabled = phase !== "防守階段" || window.XLW_DEFENSE_RULE.resolving;
    }

    const end = document.getElementById("hardEndBtn");
    if(end){
      end.disabled = phase === "防守階段" || window.XLW_DEFENSE_RULE.resolving;

      if(phase === "防守階段"){
        end.textContent = "請先防守";
      }else if(phase === "結束階段"){
        end.textContent = "結束回合";
      }else if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
        end.textContent = "結束回合";
      }else{
        end.textContent = "進入結束階段";
      }

      end.onclick = async function(e){
        e.preventDefault();
        e.stopPropagation();

        if(phase === "防守階段"){
          setStatus("請先按「防守判定」。");
          return;
        }

        if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
          await window.xlwEndPlayerTurnAndRunEnemy();
          return;
        }

        if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
          phase = "結束階段";
          mode = null;
          setStatus("已進入結束階段。");
          render();
          return;
        }

        if(phase === "結束階段"){
          await window.xlwEndPlayerTurnAndRunEnemy();
          return;
        }

        setStatus("召喚階段後請選擇戰術佈陣或進攻宣言。");
      };
    }
  }

  function updateDefensePhaseText(){
    const phaseText = document.getElementById("phaseTextHard") || document.getElementById("phaseDisplayText");
    if(phaseText && phase === "防守階段"){
      phaseText.textContent = "防守階段";
    }

    const help = document.getElementById("phaseHelpHard") || document.getElementById("phaseHelpText");
    if(help && phase === "防守階段"){
      help.textContent = "前一回合對手有進攻宣言。請按「防守判定」，系統會依星星戰線1到5依序判定。";
    }
  }

  function updateDefenseVisualBoth(){
    document.querySelectorAll(".slot").forEach(slot=>{
      const zone = slot.dataset.zone;
      const idx = Number(slot.dataset.index);
      const unit = field?.[zone]?.[idx];

      slot.classList.toggle("xlw-defense-attacker", !!(unit && unit.attacking));
      slot.classList.toggle("xlw-defense-target", !!(
        phase === "防守階段" &&
        unit &&
        (zone === "player_front" || zone === "player_back" || zone === "enemy_front" || zone === "enemy_back")
      ));
    });
  }

  const OLD_RENDER_BOTH_DEFENSE_RULE = render;
  render = function(){
    OLD_RENDER_BOTH_DEFENSE_RULE();

    setTimeout(()=>{
      patchButtonsDefenseRule();
      updateDefensePhaseText();
      updateDefenseVisualBoth();
    },0);
  };

})();


// ======================================================
// PLAYER ATTACK DECLARATION -> ENEMY DEFENSE FIX
// 修正：我方進攻宣言後，對方下一回合必須進入防守階段
// 同時：進攻宣言只標記攻擊，不立即結算戰鬥
// ======================================================

(function(){

  window.XLW_PLAYER_ATTACK_DECLARATION = {
    selected:null
  };

  function isPlayerZone(zone){
    return zone === "player_front" || zone === "player_back";
  }

  function isEnemyZone(zone){
    return zone === "enemy_front" || zone === "enemy_back";
  }

  function unitName(unit){
    const c = unit && (unit.card || unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function legalEnemyTargetForLane(lane, targetZone){
    // 同戰線前排有敵方單位時，必須先選前排
    if(field.enemy_front[lane]){
      return targetZone === "enemy_front";
    }
    // 前排空了才可選後排
    return targetZone === "enemy_back";
  }

  function choosePlayerAttacker(zone, idx){
    if(!isPlayerZone(zone)) return true;

    const unit = field[zone][idx];

    if(!unit){
      setStatus("該格沒有我方單位。");
      return true;
    }

    if(unit.tapped){
      setStatus("橫置單位不能進攻。");
      return true;
    }

    if(typeof window.XLW_isShieldUnit === "function" && window.XLW_isShieldUnit(unit)){
      setStatus("盾牌單位不能進攻。");
      unit.attacking = false;
      unit.target = null;
      return true;
    }

    // ===== 空戰線 / 盾牌戰線禁止進攻 =====
    const enemyFront = field.enemy_front[idx];
    const enemyBack = field.enemy_back[idx];

    if(!enemyFront && !enemyBack){
      setStatus("同戰線敵方前後排皆空，該單位不能進攻。");
      unit.attacking = false;
      unit.target = null;
      window.XLW_PLAYER_ATTACK_DECLARATION.selected = null;
      render();
      return true;
    }

    if(enemyFront && typeof window.XLW_isShieldUnit === "function" && window.XLW_isShieldUnit(enemyFront)){
      setStatus("同戰線敵方前排為盾牌，該單位不能進攻。");
      unit.attacking = false;
      unit.target = null;
      window.XLW_PLAYER_ATTACK_DECLARATION.selected = null;
      render();
      return true;
    }
    // ===================================

    window.XLW_PLAYER_ATTACK_DECLARATION.selected = {zone, idx};

    unit.attacking = true;
    unit.target = null;

    setStatus(`已選擇進攻單位：${unitName(unit)}。請點選同戰線敵方目標。`);
    render();
    return true;
  }

  function choosePlayerAttackTarget(zone, idx){
    const selected = window.XLW_PLAYER_ATTACK_DECLARATION.selected;

    if(!selected){
      setStatus("請先點選我方進攻單位。");
      return true;
    }

    if(!isEnemyZone(zone)){
      if(isPlayerZone(zone)){
        return choosePlayerAttacker(zone, idx);
      }
      return true;
    }

    const lane = selected.idx;
    const target = field[zone][idx];

    if(!target){
      setStatus("該格沒有敵方單位。");
      return true;
    }

    if(idx !== lane){
      setStatus("只能指定同一條星星戰線的目標。");
      return true;
    }

    if(!legalEnemyTargetForLane(lane, zone)){
      setStatus("目標不合法：同戰線有前排單位時，必須先指定前排。");
      return true;
    }

    const attacker = field[selected.zone][selected.idx];

    if(!attacker){
      window.XLW_PLAYER_ATTACK_DECLARATION.selected = null;
      setStatus("進攻單位不存在。");
      render();
      return true;
    }

    attacker.attacking = true;
    attacker.target = {zone, idx};
    attacker.tapped = true;

    // 重要：不立即戰鬥，保留到對手防守階段
    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.enemyNeedsDefense = true;
    }

    setStatus(`${unitName(attacker)} 已宣告攻擊 ${unitName(target)}。戰鬥會在對手回合的防守階段依星星戰線結算。`);

    if(typeof logBattle === "function"){
      logBattle(`我方進攻宣言：星星戰線${lane + 1} ${unitName(attacker)} 指向 ${unitName(target)}`);
    }

    window.XLW_PLAYER_ATTACK_DECLARATION.selected = null;
    render();
    return true;
  }

  // 最高優先權覆蓋舊的「即時戰鬥結算」系統
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(phase !== "進攻宣言") return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    const selected = window.XLW_PLAYER_ATTACK_DECLARATION.selected;

    if(!selected){
      choosePlayerAttacker(zone, idx);
    }else{
      choosePlayerAttackTarget(zone, idx);
    }

    return false;
  }, true);

  // 我方回合結束前再次檢查是否有攻擊宣言，確保對手防守階段會觸發
  function forceDetectPlayerAttackDeclaration(){
    let count = 0;

    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(unit=>{
        if(unit && unit.attacking && unit.target){
          count++;
        }
      });
    });

    if(count > 0 && window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.enemyNeedsDefense = true;
    }

    return count;
  }

  const oldEndPlayerTurn = window.xlwEndPlayerTurnAndRunEnemy;
  if(typeof oldEndPlayerTurn === "function"){
    window.xlwEndPlayerTurnAndRunEnemy = async function(){
      const count = forceDetectPlayerAttackDeclaration();

      if(count > 0 && typeof logBattle === "function"){
        logBattle(`我方共有 ${count} 個進攻宣言，對手回合需先防守`);
      }

      return await oldEndPlayerTurn.apply(this, arguments);
    };
  }

  const OLD_RENDER_PLAYER_ATTACK_DECL = render;
  render = function(){
    OLD_RENDER_PLAYER_ATTACK_DECL();

    setTimeout(()=>{
      forceDetectPlayerAttackDeclaration();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);
        const unit = field?.[zone]?.[idx];

        slot.classList.remove(
          "xlw-player-attacker-selected",
          "xlw-player-declared-attacker",
          "xlw-player-target-legal",
          "xlw-player-target-illegal"
        );

        const selected = window.XLW_PLAYER_ATTACK_DECLARATION.selected;

        if(selected && selected.zone === zone && selected.idx === idx){
          slot.classList.add("xlw-player-attacker-selected");
        }

        if(unit && isPlayerZone(zone) && unit.attacking && unit.target){
          slot.classList.add("xlw-player-declared-attacker");
        }

        if(phase === "進攻宣言" && selected && isEnemyZone(zone) && unit){
          if(idx === selected.idx && legalEnemyTargetForLane(selected.idx, zone)){
            slot.classList.add("xlw-player-target-legal");
          }else{
            slot.classList.add("xlw-player-target-illegal");
          }
        }
      });
    },0);
  };

})();


// ======================================================
// SHIELD UNIT + TURN FLOW FIX v5
// 1. 攻擊數值為盾牌的單位：不能發起攻擊，不會因戰鬥判定被破壞
// 2. 我方第一回合結束後，確實進入敵方回合，不會連續兩次我方回合
// 3. 進攻宣言時：同戰線敵方前後排皆空，或敵方前排為盾牌，該我方單位不可進攻
// ======================================================

(function(){

  function cardOf(unit){
    return unit && (unit.card || unit);
  }

  function rawAttackValue(unitOrCard){
    const c = cardOf(unitOrCard);
    if(!c) return 0;
    return c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0;
  }

  window.XLW_isShieldUnit = function(unitOrCard){
    const v = rawAttackValue(unitOrCard);
    if(v === null || v === undefined) return false;

    const s = String(v).trim();

    return (
      s === "盾" ||
      s === "盾牌" ||
      s === "🛡" ||
      s === "🛡️" ||
      s === "防守" ||
      s.toLowerCase() === "shield" ||
      s.includes("盾")
    );
  };

  function unitName(unit){
    const c = cardOf(unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function unitAtkSafe(unit){
    if(window.XLW_isShieldUnit(unit)) return 0;
    const v = rawAttackValue(unit);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function enemyFrontShieldInLane(lane){
    const u = field.enemy_front[lane];
    return !!(u && window.XLW_isShieldUnit(u));
  }

  function enemyLaneHasTarget(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function playerUnitCanDeclareAttack(zone, idx){
    if(zone !== "player_front" && zone !== "player_back") return false;

    const unit = field[zone][idx];
    if(!unit) return false;
    if(unit.tapped) return false;

    // 盾牌單位不可發起攻擊
    if(window.XLW_isShieldUnit(unit)) return false;

    // 同一行對手前後排都是空，不可進攻
    if(!enemyLaneHasTarget(idx)) return false;

    // 對手同一行前排為盾牌，不可進攻
    if(enemyFrontShieldInLane(idx)) return false;

    return true;
  }

  function shieldBlockMessageForAttacker(zone, idx){
    const unit = field[zone]?.[idx];

    if(!unit){
      setStatus("該格沒有我方單位。");
      return;
    }

    if(window.XLW_isShieldUnit(unit)){
      setStatus(`${unitName(unit)} 是盾牌單位，不能發起攻擊。`);
      return;
    }

    if(!enemyLaneHasTarget(idx)){
      setStatus("該星星戰線沒有敵方單位，不能選擇此單位進攻。");
      return;
    }

    if(enemyFrontShieldInLane(idx)){
      setStatus("該星星戰線的敵方前排是盾牌單位，不能進攻此戰線。");
      return;
    }

    if(unit.tapped){
      setStatus("橫置單位不能進攻。");
      return;
    }

    setStatus("此單位目前不能進攻。");
  }

  // 最高優先權：阻擋不合法的攻擊者選擇
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(phase !== "進攻宣言") return;

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    const currentlySelected =
      window.XLW_PLAYER_ATTACK_DECLARATION &&
      window.XLW_PLAYER_ATTACK_DECLARATION.selected;

    // 只有在「尚未選攻擊者」或「點我方單位切換攻擊者」時進行攻擊者限制
    if(zone === "player_front" || zone === "player_back"){
      if(!playerUnitCanDeclareAttack(zone, idx)){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        shieldBlockMessageForAttacker(zone, idx);
        render();
        return false;
      }
    }
  }, true);

  // 覆寫 / 補強我方進攻宣言選擇
  if(typeof window.forceChooseAttack === "function"){
    const oldForceChooseAttack = window.forceChooseAttack;
    window.forceChooseAttack = function(){
      oldForceChooseAttack();
      setTimeout(()=>{
        markAttackAvailability();
      },0);
    };
  }

  function markAttackAvailability(){
    document.querySelectorAll(".slot").forEach(slot=>{
      const zone = slot.dataset.zone;
      const idx = Number(slot.dataset.index);
      const unit = field?.[zone]?.[idx];

      slot.classList.remove("xlw-can-attack-unit","xlw-cannot-attack-unit","xlw-shield-unit");

      if(unit && window.XLW_isShieldUnit(unit)){
        slot.classList.add("xlw-shield-unit");
      }

      if(phase === "進攻宣言" && unit && (zone === "player_front" || zone === "player_back")){
        if(playerUnitCanDeclareAttack(zone, idx)){
          slot.classList.add("xlw-can-attack-unit");
        }else{
          slot.classList.add("xlw-cannot-attack-unit");
        }
      }
    });
  }

  // 盾牌單位不會因戰鬥階段被破壞：
  // 包裝主要戰鬥判定函式，若任一方是盾牌，戰鬥不破壞該盾牌。
  function shieldBattleResult(attacker, defender){
    const attackerShield = window.XLW_isShieldUnit(attacker);
    const defenderShield = window.XLW_isShieldUnit(defender);

    if(attackerShield && defenderShield){
      return {type:"no_destroy", text:"雙方皆為盾牌單位，沒有單位被破壞"};
    }

    if(attackerShield){
      return {type:"attacker_shield", text:`${unitName(attacker)} 是盾牌單位，不會因戰鬥被破壞`};
    }

    if(defenderShield){
      return {type:"defender_shield", text:`${unitName(defender)} 是盾牌單位，不會因戰鬥被破壞`};
    }

    return null;
  }

  // 對舊的防守判定結果做事前攔截：若目標是盾牌，取消破壞流程
  function patchDefenseResolutionShield(){
    if(window.XLW_SHIELD_PATCHED_RESOLVE) return;
    window.XLW_SHIELD_PATCHED_RESOLVE = true;

    const oldDestroyPlayer = window.destroyPlayer;
    const oldDestroyEnemy = window.destroyEnemy;

    // 很多 destroy 函式是區域函式不可直接覆寫，所以用 render 後檢查不做移除，
    // 並在點擊與防守文字上做規則限制。若後續要支援特殊效果，再新增 bypass flag。
  }

  // 我方第一回合結束，必須進入敵方回合：
  // 直接重新綁定 hardEndBtn，避開舊的「跳到我方下一回合」邏輯。
  async function runEnemyThenPlayerTurn(){
    if(typeof window.xlwEndPlayerTurnAndRunEnemy === "function"){
      await window.xlwEndPlayerTurnAndRunEnemy();
      return;
    }

    if(typeof window.xlwRunEnemyTurn === "function"){
      await window.xlwRunEnemyTurn();
    }

    if(typeof window.xlwStartPlayerNextTurn === "function"){
      window.xlwStartPlayerNextTurn();
    }

    render();
  }

  function patchEndButtonTurnFlow(){
    const btn = document.getElementById("hardEndBtn");
    if(!btn) return;

    btn.disabled = false;

    if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
      btn.textContent = "結束回合";
    }

    const oldText = btn.textContent;

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(phase === "防守階段"){
        setStatus("請先完成防守判定。");
        return;
      }

      if(phase === "召喚階段" && (turn === 1 || turn === window.XLW_FINAL_TURN)){
        setStatus("我方回合結束，進入對手回合。");
        await runEnemyThenPlayerTurn();
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "結束階段"){
        setStatus("我方回合結束，進入對手回合。");
        await runEnemyThenPlayerTurn();
        return;
      }

      setStatus("召喚階段後請選擇戰術佈陣或進攻宣言。");
    };
  }

  // 補強敵方進攻宣言：敵方盾牌單位也不能發起攻擊
  function patchEnemyAttackDeclaration(){
    if(window.XLW_ENEMY_ATTACK_DECL_PATCHED) return;
    window.XLW_ENEMY_ATTACK_DECL_PATCHED = true;

    // 由於舊函式多為區域函式，這裡在 render 後清理不合法進攻宣言
    const oldRender = render;
    render = function(){
      oldRender();

      setTimeout(()=>{
        ["enemy_front","enemy_back","player_front","player_back"].forEach(zone=>{
          field[zone].forEach(unit=>{
            if(unit && window.XLW_isShieldUnit(unit)){
              unit.attacking = false;
              unit.target = null;
            }
          });
        });

        markAttackAvailability();
        patchEndButtonTurnFlow();
      },0);
    };
  }

  // 包裝戰鬥解決：這裡補充狀態，不讓盾牌被選為攻擊者
  const OLD_RENDER_SHIELD_RULE = render;
  render = function(){
    OLD_RENDER_SHIELD_RULE();

    setTimeout(()=>{
      markAttackAvailability();
      patchEndButtonTurnFlow();
      patchDefenseResolutionShield();

      // 若盾牌被舊系統標成進攻，立即取消
      ["player_front","player_back","enemy_front","enemy_back"].forEach(zone=>{
        field[zone].forEach(unit=>{
          if(unit && window.XLW_isShieldUnit(unit)){
            unit.attacking = false;
            unit.target = null;
          }
        });
      });
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      markAttackAvailability();
      patchEndButtonTurnFlow();
    },600);
  });

})();


// ======================================================
// DEFENSE PHASE STALL FIX + ENEMY EMPTY-LANE ATTACK RULE
// 修正：
// 1. 防守階段卡住：改用獨立、安全的防守判定流程。
// 2. 敵方單位若同戰線我方前後排皆空，不可宣告進攻。
// 3. 我方同理：同戰線敵方前後排皆空，不可宣告進攻。
// ======================================================

(function(){

  const DEF_DELAY = 750;

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function unitName(unit){
    const c = unit && (unit.card || unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function rawAtk(unit){
    const c = unit && (unit.card || unit);
    if(!c) return 0;
    return c.attack ?? c.atk ?? c.power ?? 0;
  }

  function isShield(unit){
    if(typeof window.XLW_isShieldUnit === "function"){
      return window.XLW_isShieldUnit(unit);
    }
    const s = String(rawAtk(unit)).trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function atk(unit){
    if(isShield(unit)) return 0;
    const n = Number(rawAtk(unit));
    return Number.isFinite(n) ? n : 0;
  }

  function playerLaneHasAny(lane){
    return !!(field.player_front[lane] || field.player_back[lane]);
  }

  function enemyLaneHasAny(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function enemyFrontShield(lane){
    return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane]));
  }

  function playerFrontShield(lane){
    return !!(field.player_front[lane] && isShield(field.player_front[lane]));
  }

  function setFlow(text){
    setStatus(text);

    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `<div class="op-step-title">流程提示</div><div id="opStepText">等待中</div>`;
      document.body.appendChild(p);
    }

    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function clearFlow(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function destroyAt(zone, idx){
    const unit = field[zone][idx];
    if(!unit) return;

    if(isShield(unit)){
      return;
    }

    if(zone.startsWith("player_")){
      graveyard.push(unit.card || unit);
    }else{
      if(window.XLW_ENEMY && window.XLW_ENEMY.grave){
        window.XLW_ENEMY.grave.push(unit.card || unit);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(unit.card || unit);
      }
    }

    field[zone][idx] = null;
  }

  function untapPlayerUnits(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(unit=>{
        if(unit){
          unit.tapped = false;
          unit.attacking = false;
          unit.target = null;
        }
      });
    });
  }

  function untapEnemyUnits(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(unit=>{
        if(unit){
          unit.tapped = false;
          unit.attacking = false;
          unit.target = null;
        }
      });
    });
  }

  function resolveBattleSafe(attZone, attIdx, targetZone, targetIdx){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[targetZone]?.[targetIdx];

    if(!attacker || !defender){
      return "攻擊者或防守目標不存在，略過。";
    }

    const attackerName = unitName(attacker);
    const defenderName = unitName(defender);

    if(isShield(attacker) && isShield(defender)){
      return `${attackerName} 與 ${defenderName} 皆為盾牌，沒有單位被破壞。`;
    }

    if(isShield(attacker)){
      return `${attackerName} 是盾牌單位，不會發起有效攻擊。`;
    }

    if(isShield(defender)){
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${defenderName} 是盾牌單位，不會因戰鬥被破壞。`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyAt(targetZone, targetIdx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${attackerName} 擊破 ${defenderName}`;
    }

    if(a < d){
      destroyAt(attZone, attIdx);
      return `${attackerName} 攻擊失敗被破壞`;
    }

    destroyAt(attZone, attIdx);
    destroyAt(targetZone, targetIdx);
    return `${attackerName} 與 ${defenderName} 同歸於盡`;
  }

  // 我方防守：處理敵方上一回合的攻擊宣言，星星戰線1→5
  window.xlwResolvePlayerDefensePhase = async function(){
    if(window.XLW_DEFENSE_RESOLVING_SAFE) return;
    window.XLW_DEFENSE_RESOLVING_SAFE = true;

    try{
      setFlow("我方防守階段開始");
      render();
      await sleep(DEF_DELAY);

      for(let lane=0; lane<5; lane++){
        const attacker = field.enemy_front[lane];

        if(!attacker || !attacker.attacking || !attacker.target){
          setFlow(`星星戰線${lane + 1}：沒有敵方攻擊`);
          render();
          await sleep(DEF_DELAY);
          continue;
        }

        const target = attacker.target;
        const defender = field[target.zone]?.[target.idx];

        setFlow(`星星戰線${lane + 1}：${unitName(attacker)} vs ${defender ? unitName(defender) : "無目標"}`);
        render();
        await sleep(DEF_DELAY);

        const result = defender
          ? resolveBattleSafe("enemy_front", lane, target.zone, target.idx)
          : "目標不存在，略過。";

        setFlow(`星星戰線${lane + 1}：${result}`);
        if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

        render();
        await sleep(DEF_DELAY);
      }

      if(window.XLW_DEFENSE_RULE){
        window.XLW_DEFENSE_RULE.playerNeedsDefense = false;
      }

      phase = "召喚階段";
      mode = null;

      setFlow("我方防守完成，進入召喚階段");
      render();
      await sleep(DEF_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      setStatus("防守判定發生錯誤，已強制進入召喚階段。");
      phase = "召喚階段";
      mode = null;
      render();
    }finally{
      window.XLW_DEFENSE_RESOLVING_SAFE = false;
    }
  };

  // 對手防守：處理我方上一回合的攻擊宣言，星星戰線1→5
  window.xlwResolveEnemyDefensePhaseSafe = async function(){
    if(window.XLW_DEFENSE_RESOLVING_SAFE) return;
    window.XLW_DEFENSE_RESOLVING_SAFE = true;

    try{
      setFlow("對手防守階段開始");
      render();
      await sleep(DEF_DELAY);

      for(let lane=0; lane<5; lane++){
        const attacker = field.player_front[lane] || field.player_back[lane];

        if(!attacker || !attacker.attacking || !attacker.target){
          setFlow(`星星戰線${lane + 1}：沒有我方攻擊`);
          render();
          await sleep(DEF_DELAY);
          continue;
        }

        const target = attacker.target;
        const defender = field[target.zone]?.[target.idx];

        setFlow(`星星戰線${lane + 1}：${unitName(attacker)} vs ${defender ? unitName(defender) : "無目標"}`);
        render();
        await sleep(DEF_DELAY);

        const attackerZone = field.player_front[lane] === attacker ? "player_front" : "player_back";

        const result = defender
          ? resolveBattleSafe(attackerZone, lane, target.zone, target.idx)
          : "目標不存在，略過。";

        setFlow(`星星戰線${lane + 1}：${result}`);
        if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

        render();
        await sleep(DEF_DELAY);
      }

      if(window.XLW_DEFENSE_RULE){
        window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;
      }

      setFlow("對手防守完成");
      render();
      await sleep(DEF_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      setStatus("對手防守判定錯誤，已略過。");
    }finally{
      window.XLW_DEFENSE_RESOLVING_SAFE = false;
    }
  };

  // 敵方進攻宣言：同戰線我方前後排皆空，不可選該敵方單位進攻
  function enemyDeclareAttacksSafe(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];
      if(!attacker || attacker.tapped) continue;

      if(isShield(attacker)) continue;

      // 同線我方前後排都空，不能進攻
      if(!playerLaneHasAny(lane)) continue;

      // 我方前排是盾牌，不能進攻該戰線
      if(playerFrontShield(lane)) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane + 1} ${unitName(attacker)} 指向 ${unitName(field[target.zone][target.idx])}`);
      }
    }

    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;
    }

    return count;
  }

  // 覆寫敵方回合，避免舊流程卡住
  if(typeof window.xlwRunEnemyTurn === "function"){
    window.xlwRunEnemyTurn = async function(){
      setFlow("對手回合開始");
      render();
      await sleep(DEF_DELAY);

      untapEnemyUnits();

      // 對手抽2
      if(window.XLW_ENEMY && window.XLW_ENEMY.deck && window.XLW_ENEMY.hand){
        let drawn = 0;
        for(let i=0;i<2;i++){
          if(window.XLW_ENEMY.deck.length){
            window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
            drawn++;
          }
        }
        setFlow(`對手抽牌：抽 ${drawn} 張`);
      }else{
        setFlow("對手抽牌");
      }
      render();
      await sleep(DEF_DELAY);

      // 對手如果需防守，先防守
      if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.enemyNeedsDefense){
        await window.xlwResolveEnemyDefensePhaseSafe();
      }else{
        setFlow("對手不需防守，進入召喚");
        render();
        await sleep(DEF_DELAY);
      }

      // 對手召喚：沿用既有手牌，簡單召一張到前排優先
      if(window.XLW_ENEMY && window.XLW_ENEMY.hand){
        let placed = false;
        const idx = window.XLW_ENEMY.hand.findIndex(c => c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0);
        if(idx >= 0){
          let dest = null;
          for(let i=0;i<5;i++) if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
          for(let i=0;i<5;i++) if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};

          if(dest){
            const card = window.XLW_ENEMY.hand[idx];
            window.XLW_ENEMY.hand.splice(idx,1);
            field[dest.zone][dest.idx] = {card, tapped:false, attacking:false, target:null};
            setFlow(`對手召喚：${card.name}`);
            placed = true;
          }
        }
        if(!placed) setFlow("對手沒有可召喚單位");
      }

      render();
      await sleep(DEF_DELAY);

      const attacks = enemyDeclareAttacksSafe();
      setFlow(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
      render();
      await sleep(DEF_DELAY);

      setFlow("對手回合結束");
      render();
      await sleep(DEF_DELAY);
      clearFlow();
    };
  }

  // 我方可攻擊單位限制：同戰線敵方前後排皆空，不能進攻
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot || phase !== "進攻宣言") return;

    const zone = slot.dataset.zone;
    const lane = Number(slot.dataset.index);

    if(zone === "player_front" || zone === "player_back"){
      const unit = field[zone][lane];
      if(!unit) return;

      if(!enemyLaneHasAny(lane)){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setStatus("同戰線敵方前後排皆空，該單位不能進攻。");
        return false;
      }

      if(enemyFrontShield(lane)){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setStatus("同戰線敵方前排為盾牌，該單位不能進攻。");
        return false;
      }
    }
  }, true);

  function patchDefenseButtonSafe(){
    const btn = document.getElementById("hardDefenseBtn");
    if(!btn) return;

    btn.disabled = phase !== "防守階段" || window.XLW_DEFENSE_RESOLVING_SAFE;

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(phase !== "防守階段"){
        setStatus("目前不是防守階段。");
        return;
      }

      await window.xlwResolvePlayerDefensePhase();
    };
  }

  const OLD_RENDER_STALL_FIX = render;
  render = function(){
    OLD_RENDER_STALL_FIX();

    setTimeout(()=>{
      patchDefenseButtonSafe();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const lane = Number(slot.dataset.index);
        const unit = field?.[zone]?.[lane];

        slot.classList.remove("xlw-empty-lane-no-attack");

        if(phase === "進攻宣言" && unit && (zone === "player_front" || zone === "player_back")){
          if(!enemyLaneHasAny(lane) || enemyFrontShield(lane)){
            slot.classList.add("xlw-empty-lane-no-attack");
          }
        }
      });
    },0);
  };

})();


// ======================================================
// FINAL TURN FLOW + AUTO DEFENSE + EMPTY LANE ATTACK BLOCK
// 最終修正：
// 1. 我方第1回合結束後直接進對手抽牌階段，不會進我方第2回合。
// 2. 我方第2回合開始才有：抽牌 -> 防守階段(若需要) -> 召喚階段。
// 3. 防守階段自動判定，不需要再按按鈕，不會卡住。
// 4. 我方/敵方同戰線對面前後排皆空，不可進攻。
// ======================================================

(function(){

  const AUTO_DEF_DELAY = 650;

  function sleep(ms){
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function unitName(unit){
    const c = unit && (unit.card || unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function rawAtk(unit){
    const c = unit && (unit.card || unit);
    if(!c) return 0;
    return c.attack ?? c.atk ?? c.power ?? 0;
  }

  function isShield(unit){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(unit);
    const s = String(rawAtk(unit)).trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function atk(unit){
    if(isShield(unit)) return 0;
    const n = Number(rawAtk(unit));
    return Number.isFinite(n) ? n : 0;
  }

  function enemyLaneHasAny(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function playerLaneHasAny(lane){
    return !!(field.player_front[lane] || field.player_back[lane]);
  }

  function enemyFrontIsShield(lane){
    return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane]));
  }

  function playerFrontIsShield(lane){
    return !!(field.player_front[lane] && isShield(field.player_front[lane]));
  }

  function setFlow(text){
    setStatus(text);

    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `<div class="op-step-title">流程提示</div><div id="opStepText">等待中</div>`;
      document.body.appendChild(p);
    }

    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function clearFlow(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function destroyUnitSafe(zone, idx){
    const unit = field[zone]?.[idx];
    if(!unit) return;

    // 盾牌不因戰鬥破壞
    if(isShield(unit)) return;

    if(zone.startsWith("player_")){
      graveyard.push(unit.card || unit);
    }else{
      if(window.XLW_ENEMY && window.XLW_ENEMY.grave){
        window.XLW_ENEMY.grave.push(unit.card || unit);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(unit.card || unit);
      }
    }

    field[zone][idx] = null;
  }

  function clearAttackState(unit){
    if(!unit) return;
    unit.attacking = false;
    unit.target = null;
  }

  function resolveBattleNoCrash(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker) clearAttackState(attacker);
      return "攻擊者或防守目標不存在，略過。";
    }

    const attackerName = unitName(attacker);
    const defenderName = unitName(defender);

    if(isShield(attacker)){
      clearAttackState(attacker);
      return `${attackerName} 是盾牌單位，不會發起有效攻擊。`;
    }

    if(isShield(defender)){
      attacker.tapped = true;
      clearAttackState(attacker);
      return `${defenderName} 是盾牌單位，不會因戰鬥被破壞。`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyUnitSafe(target.zone, target.idx);
      attacker.tapped = true;
      clearAttackState(attacker);
      return `${attackerName} 擊破 ${defenderName}`;
    }

    if(a < d){
      destroyUnitSafe(attZone, attIdx);
      return `${attackerName} 攻擊失敗被破壞`;
    }

    destroyUnitSafe(attZone, attIdx);
    destroyUnitSafe(target.zone, target.idx);
    return `${attackerName} 與 ${defenderName} 同歸於盡`;
  }

  function playerUntapAllFinal(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function enemyUntapAllFinal(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function ensureEnemyReady(){
    if(!window.XLW_ENEMY || !window.XLW_ENEMY.deck || !window.XLW_ENEMY.hand){
      if(typeof window.xlwInitEnemyDeck === "function") window.xlwInitEnemyDeck();
    }
  }

  function enemyDrawFinal(n){
    ensureEnemyReady();
    let count = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        count++;
      }
    }
    return count;
  }

  function enemySummonOneFinal(){
    ensureEnemyReady();

    const handIndex = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(handIndex < 0) return null;

    let dest = null;
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};
    }

    if(!dest) return null;

    const card = window.XLW_ENEMY.hand[handIndex];
    window.XLW_ENEMY.hand.splice(handIndex,1);

    field[dest.zone][dest.idx] = {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:dest.zone
    };

    return {card, ...dest};
  }

  function enemyDeclareAttacksFinal(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];
      if(!attacker || attacker.tapped) continue;
      if(isShield(attacker)) continue;

      // 同戰線我方前後排皆空，不可進攻
      if(!playerLaneHasAny(lane)) continue;

      // 我方前排為盾牌，不可進攻此戰線
      if(playerFrontIsShield(lane)) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane + 1} ${unitName(attacker)} 指向 ${unitName(field[target.zone][target.idx])}`);
      }
    }

    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;
    }

    return count;
  }

  // 自動防守：我方防守，處理敵方上回合進攻宣言
  window.xlwResolvePlayerDefensePhase = async function(){
    if(window.XLW_AUTO_DEFENSE_RUNNING) return;
    window.XLW_AUTO_DEFENSE_RUNNING = true;

    try{
      setFlow("我方防守階段開始");
      render();
      await sleep(AUTO_DEF_DELAY);

      for(let lane=0; lane<5; lane++){
        const attacker = field.enemy_front[lane];

        if(!attacker || !attacker.attacking || !attacker.target){
          setFlow(`星星戰線${lane + 1}：沒有敵方攻擊`);
          render();
          await sleep(AUTO_DEF_DELAY);
          continue;
        }

        setFlow(`星星戰線${lane + 1}：${unitName(attacker)} 進行戰鬥判定`);
        render();
        await sleep(AUTO_DEF_DELAY);

        const result = resolveBattleNoCrash("enemy_front", lane, attacker.target);

        setFlow(`星星戰線${lane + 1}：${result}`);
        if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

        render();
        await sleep(AUTO_DEF_DELAY);
      }

      if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = false;

      phase = "召喚階段";
      mode = null;

      setFlow("防守階段完成，進入召喚階段");
      render();
      await sleep(AUTO_DEF_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      phase = "召喚階段";
      mode = null;
      setStatus("防守階段發生錯誤，已進入召喚階段。");
      render();
    }finally{
      window.XLW_AUTO_DEFENSE_RUNNING = false;
    }
  };

  // 自動防守：對手防守，處理我方上回合進攻宣言
  window.xlwResolveEnemyDefensePhaseSafe = async function(){
    if(window.XLW_AUTO_DEFENSE_RUNNING) return;
    window.XLW_AUTO_DEFENSE_RUNNING = true;

    try{
      setFlow("對手防守階段開始");
      render();
      await sleep(AUTO_DEF_DELAY);

      for(let lane=0; lane<5; lane++){
        const attacker = field.player_front[lane] || field.player_back[lane];

        if(!attacker || !attacker.attacking || !attacker.target){
          setFlow(`星星戰線${lane + 1}：沒有我方攻擊`);
          render();
          await sleep(AUTO_DEF_DELAY);
          continue;
        }

        const attZone = field.player_front[lane] === attacker ? "player_front" : "player_back";

        setFlow(`星星戰線${lane + 1}：${unitName(attacker)} 進行戰鬥判定`);
        render();
        await sleep(AUTO_DEF_DELAY);

        const result = resolveBattleNoCrash(attZone, lane, attacker.target);

        setFlow(`星星戰線${lane + 1}：${result}`);
        if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

        render();
        await sleep(AUTO_DEF_DELAY);
      }

      if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;

      setFlow("對手防守階段完成");
      render();
      await sleep(AUTO_DEF_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      setStatus("對手防守階段發生錯誤，已略過。");
      render();
    }finally{
      window.XLW_AUTO_DEFENSE_RUNNING = false;
    }
  };

  // 對手回合：抽牌 -> 若需防守自動防守 -> 召喚 -> 進攻宣言 -> 結束
  window.xlwRunEnemyTurn = async function(){
    setFlow("對手回合開始");
    render();
    await sleep(AUTO_DEF_DELAY);

    enemyUntapAllFinal();

    const drawn = enemyDrawFinal(2);
    setFlow(`對手抽牌：抽 ${drawn} 張`);
    render();
    await sleep(AUTO_DEF_DELAY);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.enemyNeedsDefense){
      await window.xlwResolveEnemyDefensePhaseSafe();
    }else{
      setFlow("對手不需防守，進入召喚階段");
      render();
      await sleep(AUTO_DEF_DELAY);
    }

    const summoned = enemySummonOneFinal();
    if(summoned){
      setFlow(`對手召喚：${summoned.card.name}`);
    }else{
      setFlow("對手沒有可召喚單位");
    }
    render();
    await sleep(AUTO_DEF_DELAY);

    const attacks = enemyDeclareAttacksFinal();
    setFlow(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
    render();
    await sleep(AUTO_DEF_DELAY);

    setFlow("對手回合結束");
    render();
    await sleep(AUTO_DEF_DELAY);
    clearFlow();
  };

  // 我方下一回合：第2回合開始才有抽牌 -> 防守 -> 召喚
  window.xlwStartPlayerNextTurn = function(){
    turn++;
    mode = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    playerUntapAllFinal();

    draw(2);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.playerNeedsDefense){
      phase = "防守階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。正在進行防守階段。`);
      render();

      setTimeout(()=>{
        window.xlwResolvePlayerDefensePhase();
      }, 450);
    }else{
      phase = "召喚階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
      render();
    }
  };

  // 我方回合結束：一定先進對手回合，再回到我方下一回合
  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    // 我方進攻宣言會讓對手回合先防守
    let attackCount = 0;
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u && u.attacking && u.target) attackCount++;
      });
    });

    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.enemyNeedsDefense = attackCount > 0;
    }

    setFlow("我方回合結束，進入對手回合");
    render();
    await sleep(AUTO_DEF_DELAY);

    await window.xlwRunEnemyTurn();

    window.xlwStartPlayerNextTurn();
  };

  // 第1回合在召喚階段按結束回合：不可跳我方第2回合，必須進敵方回合
  function patchEndButtonFinal(){
    const btn = document.getElementById("hardEndBtn");
    if(!btn) return;

    btn.disabled = !!window.XLW_AUTO_DEFENSE_RUNNING;

    if(phase === "防守階段"){
      btn.textContent = "自動防守中";
      btn.disabled = true;
    }else if(phase === "召喚階段" && turn === 1){
      btn.textContent = "結束回合";
    }else if(phase === "結束階段"){
      btn.textContent = "結束回合";
    }else if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
      btn.textContent = "進入結束階段";
    }

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(window.XLW_AUTO_DEFENSE_RUNNING) return;

      if(phase === "防守階段"){
        setStatus("防守階段會自動判定，請稍候。");
        return;
      }

      if(phase === "召喚階段" && turn === 1){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "結束階段"){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      setStatus("召喚階段後請選擇戰術佈陣或進攻宣言。");
    };
  }

  // 我方空戰線不可進攻：核心補強，移除任何錯誤選取狀態
  function clearIllegalPlayerAttackSelections(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((unit, lane)=>{
        if(!unit) return;

        const illegal =
          (!enemyLaneHasAny(lane)) ||
          enemyFrontIsShield(lane) ||
          isShield(unit);

        if(illegal && unit.attacking && !unit.target){
          unit.attacking = false;
        }

        if(illegal && unit.attacking && unit.target){
          unit.attacking = false;
          unit.target = null;
        }
      });
    });
  }

  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot || phase !== "進攻宣言") return;

    const zone = slot.dataset.zone;
    const lane = Number(slot.dataset.index);

    if(zone === "player_front" || zone === "player_back"){
      const unit = field[zone][lane];
      if(!unit) return;

      if(isShield(unit)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        setStatus("盾牌單位不可發起攻擊。");
        unit.attacking = false; unit.target = null;
        render();
        return false;
      }

      if(!enemyLaneHasAny(lane)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        setStatus("同戰線敵方前後排皆空，該單位不能進攻。");
        unit.attacking = false; unit.target = null;
        render();
        return false;
      }

      if(enemyFrontIsShield(lane)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        setStatus("同戰線敵方前排為盾牌，該單位不能進攻。");
        unit.attacking = false; unit.target = null;
        render();
        return false;
      }
    }
  }, true);

  const OLD_RENDER_FINAL_TURN_ATTACK_DEF = render;
  render = function(){
    OLD_RENDER_FINAL_TURN_ATTACK_DEF();

    setTimeout(()=>{
      patchEndButtonFinal();
      clearIllegalPlayerAttackSelections();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const lane = Number(slot.dataset.index);
        const unit = field?.[zone]?.[lane];

        slot.classList.remove("xlw-empty-lane-no-attack-final");

        if(phase === "進攻宣言" && unit && (zone === "player_front" || zone === "player_back")){
          if(isShield(unit) || !enemyLaneHasAny(lane) || enemyFrontIsShield(lane)){
            slot.classList.add("xlw-empty-lane-no-attack-final");
          }
        }
      });
    },0);
  };

})();


// ======================================================
// FINAL RULE PATCH：盾牌 / 第一回合敵方回合 / 雙方防守判定
// ======================================================

(function(){

  const FLOW_DELAY = 650;

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function cardOf(unit){ return unit && (unit.card || unit); }

  function nameOf(unit){
    const c = cardOf(unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function rawAtk(unit){
    const c = cardOf(unit);
    if(!c) return 0;
    return c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0;
  }

  window.XLW_isShieldUnit = function(unit){
    const v = rawAtk(unit);
    const s = String(v ?? "").trim();
    return (
      s === "盾" ||
      s === "盾牌" ||
      s === "🛡" ||
      s === "🛡️" ||
      s.includes("盾") ||
      s.toLowerCase() === "shield"
    );
  };

  function atk(unit){
    if(window.XLW_isShieldUnit(unit)) return 0;
    const n = Number(rawAtk(unit));
    return Number.isFinite(n) ? n : 0;
  }

  function isPlayerZone(zone){ return zone === "player_front" || zone === "player_back"; }
  function isEnemyZone(zone){ return zone === "enemy_front" || zone === "enemy_back"; }

  function playerLaneHasAny(lane){ return !!(field.player_front[lane] || field.player_back[lane]); }
  function enemyLaneHasAny(lane){ return !!(field.enemy_front[lane] || field.enemy_back[lane]); }

  function playerFrontShield(lane){ return !!(field.player_front[lane] && window.XLW_isShieldUnit(field.player_front[lane])); }
  function enemyFrontShield(lane){ return !!(field.enemy_front[lane] && window.XLW_isShieldUnit(field.enemy_front[lane])); }

  function setFlow(text){
    setStatus(text);
    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `<div class="op-step-title">流程提示</div><div id="opStepText">等待中</div>`;
      document.body.appendChild(p);
    }
    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function clearFlow(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function ensureEnemyReady(){
    if(!window.XLW_ENEMY || !Array.isArray(window.XLW_ENEMY.deck) || !Array.isArray(window.XLW_ENEMY.hand)){
      if(typeof window.xlwInitEnemyDeck === "function"){
        window.xlwInitEnemyDeck();
      }
    }
  }

  function enemyDraw(n){
    ensureEnemyReady();
    let drawn = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        drawn++;
      }
    }
    return drawn;
  }

  function enemySummon(){
    ensureEnemyReady();

    const handIndex = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(handIndex < 0) return null;

    let dest = null;
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};
    }

    if(!dest) return null;

    const card = window.XLW_ENEMY.hand[handIndex];
    window.XLW_ENEMY.hand.splice(handIndex,1);
    field[dest.zone][dest.idx] = {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:dest.zone
    };
    return {card, ...dest};
  }

  function untapPlayer(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped=false;
          u.attacking=false;
          u.target=null;
        }
      });
    });
  }

  function untapEnemy(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped=false;
          u.attacking=false;
          u.target=null;
        }
      });
    });
  }

  function destroyAt(zone, idx){
    const unit = field[zone]?.[idx];
    if(!unit) return;

    // 盾牌不能因戰鬥被破壞
    if(window.XLW_isShieldUnit(unit)) return;

    if(zone.startsWith("player_")){
      graveyard.push(unit.card || unit);
    }else{
      if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.grave)){
        window.XLW_ENEMY.grave.push(unit.card || unit);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(unit.card || unit);
      }
    }
    field[zone][idx] = null;
  }

  function resolveBattle(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker){ attacker.attacking=false; attacker.target=null; }
      return "攻擊者或防守目標不存在，略過";
    }

    const an = nameOf(attacker);
    const dn = nameOf(defender);

    // 盾牌不能攻擊，也不能被攻擊；若錯誤留下宣言，直接略過
    if(window.XLW_isShieldUnit(attacker)){
      attacker.attacking=false;
      attacker.target=null;
      return `${an} 是盾牌單位，不能發起攻擊`;
    }

    if(window.XLW_isShieldUnit(defender)){
      attacker.attacking=false;
      attacker.target=null;
      return `${dn} 是盾牌單位，不能被進攻`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyAt(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 擊破 ${dn}`;
    }

    if(a < d){
      destroyAt(attZone, attIdx);
      return `${an} 攻擊失敗被破壞`;
    }

    destroyAt(attZone, attIdx);
    destroyAt(target.zone, target.idx);
    return `${an} 與 ${dn} 同歸於盡`;
  }

  function enemyDeclareAttacks(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];
      if(!attacker || attacker.tapped) continue;

      // 盾牌不能進攻
      if(window.XLW_isShieldUnit(attacker)) continue;

      // 同線我方前後皆空，不能進攻
      if(!playerLaneHasAny(lane)) continue;

      // 我方前排為盾牌，不能進攻該戰線
      if(playerFrontShield(lane)) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      // 目標本身是盾牌也不可被進攻
      if(window.XLW_isShieldUnit(field[target.zone][target.idx])) continue;

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane+1} ${nameOf(attacker)} 指向 ${nameOf(field[target.zone][target.idx])}`);
      }
    }

    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;
    }

    return count;
  }

  window.xlwResolvePlayerDefensePhase = async function(){
    if(window.XLW_FINAL_DEFENSE_RUNNING) return;
    window.XLW_FINAL_DEFENSE_RUNNING = true;

    try{
      setFlow("我方防守階段開始");
      render();
      await sleep(FLOW_DELAY);

      for(let lane=0; lane<5; lane++){
        const attacker = field.enemy_front[lane];

        if(!attacker || !attacker.attacking || !attacker.target){
          setFlow(`星星戰線${lane+1}：沒有敵方攻擊`);
          render();
          await sleep(FLOW_DELAY);
          continue;
        }

        const result = resolveBattle("enemy_front", lane, attacker.target);
        setFlow(`星星戰線${lane+1}：${result}`);
        if(typeof logBattle === "function") logBattle(`我方防守：${result}`);
        render();
        await sleep(FLOW_DELAY);
      }

      if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = false;

      phase = "召喚階段";
      mode = null;
      setFlow("我方防守完成，進入召喚階段");
      render();
      await sleep(FLOW_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      phase = "召喚階段";
      mode = null;
      setStatus("防守判定發生錯誤，已進入召喚階段。");
      render();
    }finally{
      window.XLW_FINAL_DEFENSE_RUNNING = false;
    }
  };

  window.xlwResolveEnemyDefensePhaseSafe = async function(){
    if(window.XLW_FINAL_DEFENSE_RUNNING) return;
    window.XLW_FINAL_DEFENSE_RUNNING = true;

    try{
      setFlow("對手防守階段開始");
      render();
      await sleep(FLOW_DELAY);

      for(let lane=0; lane<5; lane++){
        let attZone = null;
        let attacker = null;

        if(field.player_front[lane] && field.player_front[lane].attacking && field.player_front[lane].target){
          attZone = "player_front";
          attacker = field.player_front[lane];
        }else if(field.player_back[lane] && field.player_back[lane].attacking && field.player_back[lane].target){
          attZone = "player_back";
          attacker = field.player_back[lane];
        }

        if(!attacker){
          setFlow(`星星戰線${lane+1}：沒有我方攻擊`);
          render();
          await sleep(FLOW_DELAY);
          continue;
        }

        const result = resolveBattle(attZone, lane, attacker.target);
        setFlow(`星星戰線${lane+1}：${result}`);
        if(typeof logBattle === "function") logBattle(`對手防守：${result}`);
        render();
        await sleep(FLOW_DELAY);
      }

      if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;

      setFlow("對手防守完成");
      render();
      await sleep(FLOW_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      setStatus("對手防守階段發生錯誤，已略過。");
      render();
    }finally{
      window.XLW_FINAL_DEFENSE_RUNNING = false;
    }
  };

  window.xlwRunEnemyTurn = async function(){
    setFlow("對手回合開始");
    render();
    await sleep(FLOW_DELAY);

    untapEnemy();

    const drawn = enemyDraw(2);
    setFlow(`對手抽牌：抽 ${drawn} 張`);
    render();
    await sleep(FLOW_DELAY);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.enemyNeedsDefense){
      await window.xlwResolveEnemyDefensePhaseSafe();
    }else{
      setFlow("對手不需防守，進入召喚階段");
      render();
      await sleep(FLOW_DELAY);
    }

    const summoned = enemySummon();
    setFlow(summoned ? `對手召喚：${summoned.card.name}` : "對手沒有可召喚單位");
    render();
    await sleep(FLOW_DELAY);

    const attacks = enemyDeclareAttacks();
    setFlow(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
    render();
    await sleep(FLOW_DELAY);

    setFlow("對手回合結束");
    render();
    await sleep(FLOW_DELAY);
    clearFlow();
  };

  window.xlwStartPlayerNextTurn = function(){
    turn++;
    mode = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    untapPlayer();
    draw(2);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.playerNeedsDefense){
      phase = "防守階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。正在自動進行防守階段。`);
      render();
      setTimeout(()=>window.xlwResolvePlayerDefensePhase(), 450);
    }else{
      phase = "召喚階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
      render();
    }
  };

  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    let attackCount = 0;
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((u,lane)=>{
        if(u && u.attacking && u.target){
          // 若目標戰線已不合法，取消
          if(!enemyLaneHasAny(lane) || enemyFrontShield(lane) || window.XLW_isShieldUnit(u)){
            u.attacking=false;
            u.target=null;
          }else{
            attackCount++;
          }
        }
      });
    });

    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.enemyNeedsDefense = attackCount > 0;
    }

    setFlow("我方回合結束，進入對手回合");
    render();
    await sleep(FLOW_DELAY);

    await window.xlwRunEnemyTurn();
    window.xlwStartPlayerNextTurn();
  };

  function validPlayerAttackLine(zone,lane){
    const unit = field[zone]?.[lane];
    if(!unit) return false;
    if(window.XLW_isShieldUnit(unit)) return false;
    if(!enemyLaneHasAny(lane)) return false;
    if(enemyFrontShield(lane)) return false;
    return true;
  }

  // 最高優先權阻擋：盾牌不能攻擊/被攻擊，空戰線不能選進攻
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot || phase !== "進攻宣言") return;

    const zone = slot.dataset.zone;
    const lane = Number(slot.dataset.index);

    const selected = window.XLW_PLAYER_ATTACK_DECLARATION && window.XLW_PLAYER_ATTACK_DECLARATION.selected;

    // 選攻擊者
    if(isPlayerZone(zone) && !selected){
      if(!validPlayerAttackLine(zone,lane)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

        const unit = field[zone]?.[lane];
        if(unit && window.XLW_isShieldUnit(unit)){
          setStatus("盾牌單位不能進攻。");
        }else if(!enemyLaneHasAny(lane)){
          setStatus("同戰線敵方前後排皆空，該單位不能進攻。");
        }else if(enemyFrontShield(lane)){
          setStatus("同戰線敵方前排為盾牌，該單位不能進攻。");
        }else{
          setStatus("此單位不能進攻。");
        }

        if(unit){ unit.attacking=false; unit.target=null; }
        render();
        return false;
      }
    }

    // 選目標：盾牌不能被進攻
    if(isEnemyZone(zone) && selected){
      const target = field[zone]?.[lane];
      if(target && window.XLW_isShieldUnit(target)){
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        setStatus("盾牌單位不能被進攻。");
        render();
        return false;
      }
    }
  }, true);

  function patchEndButton(){
    const btn = document.getElementById("hardEndBtn");
    if(!btn) return;

    btn.disabled = !!window.XLW_FINAL_DEFENSE_RUNNING;

    if(phase === "防守階段"){
      btn.textContent = "自動防守中";
      btn.disabled = true;
    }else if(phase === "召喚階段" && turn === 1){
      btn.textContent = "結束回合";
    }else if(phase === "結束階段"){
      btn.textContent = "結束回合";
    }else if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
      btn.textContent = "進入結束階段";
    }

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(window.XLW_FINAL_DEFENSE_RUNNING) return;

      if(phase === "防守階段"){
        setStatus("防守階段正在自動判定，請稍候。");
        return;
      }

      // 第一回合結束一定進對手回合，不會直接跳我方第二回合
      if(phase === "召喚階段" && turn === 1){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "結束階段"){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      setStatus("召喚階段後請選擇戰術佈陣或進攻宣言。");
    };
  }

  const OLD_RENDER_FINAL_FIX = render;
  render = function(){
    OLD_RENDER_FINAL_FIX();

    setTimeout(()=>{
      patchEndButton();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const lane = Number(slot.dataset.index);
        const unit = field?.[zone]?.[lane];

        slot.classList.toggle("xlw-shield-unit", !!(unit && window.XLW_isShieldUnit(unit)));
        slot.classList.remove("xlw-no-attack-final-rule");

        if(phase === "進攻宣言" && unit && isPlayerZone(zone)){
          if(!validPlayerAttackLine(zone,lane)){
            slot.classList.add("xlw-no-attack-final-rule");
          }
        }
      });
    },0);
  };

})();


// ======================================================
// HARD FIX：攻擊橫置 / 第一回合進對手 / 對手抽牌後先防守
// ======================================================

(function(){

  const HARD_DELAY = 700;

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function cardOf(u){ return u && (u.card || u); }

  function unitName(u){
    const c = cardOf(u);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function rawAtk(u){
    const c = cardOf(u);
    if(!c) return 0;
    return c.attack ?? c.atk ?? c.power ?? 0;
  }

  function isShield(u){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(u);
    const s = String(rawAtk(u) ?? "").trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function atk(u){
    if(isShield(u)) return 0;
    const n = Number(rawAtk(u));
    return Number.isFinite(n) ? n : 0;
  }

  function setFlow(text){
    setStatus(text);
    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `<div class="op-step-title">流程提示</div><div id="opStepText">等待中</div>`;
      document.body.appendChild(p);
    }
    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function clearFlow(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function ensureEnemy(){
    if(!window.XLW_ENEMY || !Array.isArray(window.XLW_ENEMY.deck) || !Array.isArray(window.XLW_ENEMY.hand)){
      if(typeof window.xlwInitEnemyDeck === "function") window.xlwInitEnemyDeck();
    }
  }

  function enemyDraw(n){
    ensureEnemy();
    let drawn = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        drawn++;
      }
    }
    return drawn;
  }

  function enemySummonOne(){
    ensureEnemy();

    const handIndex = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(handIndex < 0) return null;

    let dest = null;
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};
    }

    if(!dest) return null;

    const card = window.XLW_ENEMY.hand[handIndex];
    window.XLW_ENEMY.hand.splice(handIndex, 1);

    field[dest.zone][dest.idx] = {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:dest.zone
    };

    return {card, ...dest};
  }

  function enemyUntap(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function playerUntap(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function playerLaneHasAny(lane){
    return !!(field.player_front[lane] || field.player_back[lane]);
  }

  function enemyLaneHasAny(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function playerFrontShield(lane){
    return !!(field.player_front[lane] && isShield(field.player_front[lane]));
  }

  function enemyFrontShield(lane){
    return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane]));
  }

  function destroyAt(zone, idx){
    const u = field[zone]?.[idx];
    if(!u) return;

    if(isShield(u)) return;

    if(zone.startsWith("player_")){
      graveyard.push(u.card || u);
    }else{
      if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.grave)){
        window.XLW_ENEMY.grave.push(u.card || u);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(u.card || u);
      }
    }

    field[zone][idx] = null;
  }

  function resolveBattle(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker){
        attacker.attacking = false;
        attacker.target = null;
      }
      return "攻擊者或防守目標不存在，略過";
    }

    const an = unitName(attacker);
    const dn = unitName(defender);

    if(isShield(attacker)){
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 是盾牌單位，不能進攻`;
    }

    if(isShield(defender)){
      attacker.attacking = false;
      attacker.target = null;
      return `${dn} 是盾牌單位，不能被進攻`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyAt(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 擊破 ${dn}`;
    }

    if(a < d){
      destroyAt(attZone, attIdx);
      return `${an} 攻擊失敗被破壞`;
    }

    destroyAt(attZone, attIdx);
    destroyAt(target.zone, target.idx);
    return `${an} 與 ${dn} 同歸於盡`;
  }

  window.xlwResolveEnemyDefensePhaseSafe = async function(){
    if(window.XLW_FORCE_DEFENSE_RUNNING) return;
    window.XLW_FORCE_DEFENSE_RUNNING = true;

    try{
      setFlow("對手防守階段開始");
      render();
      await sleep(HARD_DELAY);

      for(let lane=0; lane<5; lane++){
        let attZone = null;
        let attacker = null;

        if(field.player_front[lane] && field.player_front[lane].attacking && field.player_front[lane].target){
          attZone = "player_front";
          attacker = field.player_front[lane];
        }else if(field.player_back[lane] && field.player_back[lane].attacking && field.player_back[lane].target){
          attZone = "player_back";
          attacker = field.player_back[lane];
        }

        if(!attacker){
          setFlow(`星星戰線${lane + 1}：沒有我方攻擊`);
          render();
          await sleep(HARD_DELAY);
          continue;
        }

        const result = resolveBattle(attZone, lane, attacker.target);

        setFlow(`星星戰線${lane + 1}：${result}`);
        if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

        render();
        await sleep(HARD_DELAY);
      }

      if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;

      setFlow("對手防守階段完成");
      render();
      await sleep(HARD_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      setStatus("對手防守判定錯誤，已略過。");
    }finally{
      window.XLW_FORCE_DEFENSE_RUNNING = false;
    }
  };

  window.xlwResolvePlayerDefensePhase = async function(){
    if(window.XLW_FORCE_DEFENSE_RUNNING) return;
    window.XLW_FORCE_DEFENSE_RUNNING = true;

    try{
      setFlow("我方防守階段開始");
      render();
      await sleep(HARD_DELAY);

      for(let lane=0; lane<5; lane++){
        const attacker = field.enemy_front[lane];

        if(!attacker || !attacker.attacking || !attacker.target){
          setFlow(`星星戰線${lane + 1}：沒有敵方攻擊`);
          render();
          await sleep(HARD_DELAY);
          continue;
        }

        const result = resolveBattle("enemy_front", lane, attacker.target);

        setFlow(`星星戰線${lane + 1}：${result}`);
        if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

        render();
        await sleep(HARD_DELAY);
      }

      if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = false;

      phase = "召喚階段";
      mode = null;

      setFlow("我方防守完成，進入召喚階段");
      render();
      await sleep(HARD_DELAY);
      clearFlow();
    }catch(err){
      console.error(err);
      phase = "召喚階段";
      mode = null;
      setStatus("我方防守判定錯誤，已進入召喚階段。");
      render();
    }finally{
      window.XLW_FORCE_DEFENSE_RUNNING = false;
    }
  };

  function enemyDeclareAttack(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || attacker.tapped) continue;
      if(isShield(attacker)) continue;

      if(!playerLaneHasAny(lane)) continue;
      if(playerFrontShield(lane)) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      if(isShield(field[target.zone][target.idx])) continue;

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane + 1} ${unitName(attacker)} 指向 ${unitName(field[target.zone][target.idx])}`);
      }
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;

    return count;
  }

  // 對手回合正確順序：開始 -> 抽牌 -> 若需防守，立刻防守 -> 召喚 -> 進攻宣言
  window.xlwRunEnemyTurn = async function(){
    setFlow("對手回合開始");
    render();
    await sleep(HARD_DELAY);

    enemyUntap();

    const drawn = enemyDraw(2);
    setFlow(`對手抽牌：抽 ${drawn} 張`);
    render();
    await sleep(HARD_DELAY);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.enemyNeedsDefense){
      await window.xlwResolveEnemyDefensePhaseSafe();
    }else{
      setFlow("對手不需防守，進入召喚階段");
      render();
      await sleep(HARD_DELAY);
    }

    const summoned = enemySummonOne();
    setFlow(summoned ? `對手召喚：${summoned.card.name}` : "對手沒有可召喚單位");
    render();
    await sleep(HARD_DELAY);

    const attacks = enemyDeclareAttack();
    setFlow(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
    render();
    await sleep(HARD_DELAY);

    setFlow("對手回合結束");
    render();
    await sleep(HARD_DELAY);
    clearFlow();
  };

  function countPlayerDeclaredAttacks(){
    let count = 0;

    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((u,lane)=>{
        if(!u) return;

        if(u.attacking && u.target){
          if(isShield(u) || !enemyLaneHasAny(lane) || enemyFrontShield(lane)){
            u.attacking = false;
            u.target = null;
          }else{
            // 攻擊宣言完成後，單位立刻橫置
            u.tapped = true;
            count++;
          }
        }
      });
    });

    return count;
  }

  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    while(hand.length > 10){
      graveyard.push(hand.pop());
    }

    const playerAttackCount = countPlayerDeclaredAttacks();

    if(window.XLW_DEFENSE_RULE){
      window.XLW_DEFENSE_RULE.enemyNeedsDefense = playerAttackCount > 0;
    }

    setFlow("我方回合結束，進入對手回合");
    render();
    await sleep(HARD_DELAY);

    await window.xlwRunEnemyTurn();

    // 對手回合結束後才開始我方下一回合
    turn++;
    mode = null;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    selectedAttacker = null;

    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

    playerUntap();
    draw(2);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.playerNeedsDefense){
      phase = "防守階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。正在自動進行防守階段。`);
      render();
      setTimeout(()=>window.xlwResolvePlayerDefensePhase(), 450);
    }else{
      phase = "召喚階段";
      setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
      render();
    }
  };

  // 進攻宣言選目標時，立刻橫置
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot || phase !== "進攻宣言") return;

    const zone = slot.dataset.zone;
    const lane = Number(slot.dataset.index);

    const selected = window.XLW_PLAYER_ATTACK_DECLARATION && window.XLW_PLAYER_ATTACK_DECLARATION.selected;

    if((zone === "player_front" || zone === "player_back") && !selected){
      const u = field[zone]?.[lane];
      if(!u) return;

      if(isShield(u) || !enemyLaneHasAny(lane) || enemyFrontShield(lane)){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if(isShield(u)) setStatus("盾牌單位不能進攻。");
        else if(!enemyLaneHasAny(lane)) setStatus("同戰線敵方前後排皆空，該單位不能進攻。");
        else setStatus("同戰線敵方前排為盾牌，該單位不能進攻。");

        u.attacking = false;
        u.target = null;
        render();
        return false;
      }
    }

    if((zone === "enemy_front" || zone === "enemy_back") && selected){
      const target = field[zone]?.[lane];
      if(target && isShield(target)){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        setStatus("盾牌單位不能被進攻。");
        render();
        return false;
      }

      // 讓舊選目標事件先執行，下一個 tick 檢查並橫置
      setTimeout(()=>{
        const attacker = field[selected.zone]?.[selected.idx];
        if(attacker && attacker.attacking && attacker.target){
          attacker.tapped = true;
          render();
        }
      },0);
    }
  }, true);

  function patchEndButton(){
    const btn = document.getElementById("hardEndBtn");
    if(!btn) return;

    btn.disabled = !!window.XLW_FORCE_DEFENSE_RUNNING;

    if(phase === "防守階段"){
      btn.textContent = "自動防守中";
      btn.disabled = true;
    }else if(phase === "召喚階段" && turn === 1){
      btn.textContent = "結束回合";
    }else if(phase === "結束階段"){
      btn.textContent = "結束回合";
    }else if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
      btn.textContent = "進入結束階段";
    }

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(window.XLW_FORCE_DEFENSE_RUNNING) return;

      if(phase === "防守階段"){
        setStatus("防守階段正在自動判定。");
        return;
      }

      // 第一回合結束後，必定先跑對手回合
      if(phase === "召喚階段" && turn === 1){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "結束階段"){
        await window.xlwEndPlayerTurnAndRunEnemy();
        return;
      }

      setStatus("召喚階段後請選擇戰術佈陣或進攻宣言。");
    };
  }

  // capture 最後保險：按下結束回合永遠走我們的流程
  document.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("#hardEndBtn");
    if(!btn) return;

    if(phase === "召喚階段" && turn === 1){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.xlwEndPlayerTurnAndRunEnemy();
      return false;
    }
  }, true);

  const OLD_RENDER_ATTACK_TAP_TURN_FIX = render;
  render = function(){
    OLD_RENDER_ATTACK_TAP_TURN_FIX();

    setTimeout(()=>{
      patchEndButton();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const lane = Number(slot.dataset.index);
        const u = field?.[zone]?.[lane];

        slot.classList.toggle("xlw-declared-tapped", !!(u && u.attacking && u.target && u.tapped));

        if(u && isShield(u)){
          u.attacking = false;
          u.target = null;
        }
      });
    },0);
  };

})();


// ======================================================
// FORCE REAL FLOW PATCH
// 這版不再依賴舊的「結束回合」按鈕邏輯：
// 1. 新增一顆最高優先權「流程按鈕」
// 2. 我方第1回合召喚結束後，一定直接跑對手抽牌階段
// 3. 我方進攻宣言完成後會立刻橫置
// 4. 對手回合順序一定是：抽2 → 防守判定 → 召喚 → 進攻宣言
// ======================================================

(function(){

  const DELAY = 700;
  let FLOW_RUNNING = false;

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function cardOf(u){ return u && (u.card || u); }

  function unitName(u){
    const c = cardOf(u);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function rawAtk(u){
    const c = cardOf(u);
    if(!c) return 0;
    return c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0;
  }

  window.XLW_isShieldUnit = function(u){
    const s = String(rawAtk(u) ?? "").trim();
    return s === "盾" || s === "盾牌" || s === "🛡" || s === "🛡️" || s.includes("盾") || s.toLowerCase() === "shield";
  };

  function atk(u){
    if(window.XLW_isShieldUnit(u)) return 0;
    const n = Number(rawAtk(u));
    return Number.isFinite(n) ? n : 0;
  }

  function isPlayerZone(zone){ return zone === "player_front" || zone === "player_back"; }
  function isEnemyZone(zone){ return zone === "enemy_front" || zone === "enemy_back"; }

  function playerLaneHasAny(lane){ return !!(field.player_front[lane] || field.player_back[lane]); }
  function enemyLaneHasAny(lane){ return !!(field.enemy_front[lane] || field.enemy_back[lane]); }

  function playerFrontShield(lane){ return !!(field.player_front[lane] && window.XLW_isShieldUnit(field.player_front[lane])); }
  function enemyFrontShield(lane){ return !!(field.enemy_front[lane] && window.XLW_isShieldUnit(field.enemy_front[lane])); }

  function setFlow(text){
    setStatus(text);

    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `<div class="op-step-title">流程提示</div><div id="opStepText">等待中</div>`;
      document.body.appendChild(p);
    }

    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function clearFlow(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function ensureEnemy(){
    if(!window.XLW_ENEMY || !Array.isArray(window.XLW_ENEMY.deck) || !Array.isArray(window.XLW_ENEMY.hand)){
      if(typeof window.xlwInitEnemyDeck === "function") window.xlwInitEnemyDeck();
    }
  }

  function enemyDraw(n){
    ensureEnemy();
    let count = 0;

    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        count++;
      }
    }

    return count;
  }

  function enemySummonOne(){
    ensureEnemy();

    const handIndex = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(handIndex < 0) return null;

    let dest = null;

    for(let i=0;i<5;i++){
      if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};
    }

    if(!dest) return null;

    const card = window.XLW_ENEMY.hand[handIndex];
    window.XLW_ENEMY.hand.splice(handIndex, 1);

    field[dest.zone][dest.idx] = {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:dest.zone
    };

    return {card, ...dest};
  }

  function untapEnemy(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function untapPlayer(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function destroyAt(zone, idx){
    const u = field[zone]?.[idx];
    if(!u) return;

    if(window.XLW_isShieldUnit(u)) return;

    if(zone.startsWith("player_")){
      graveyard.push(u.card || u);
    }else{
      if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.grave)){
        window.XLW_ENEMY.grave.push(u.card || u);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(u.card || u);
      }
    }

    field[zone][idx] = null;
  }

  function resolveBattle(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker){
        attacker.attacking = false;
        attacker.target = null;
      }
      return "攻擊者或目標不存在，略過";
    }

    const an = unitName(attacker);
    const dn = unitName(defender);

    if(window.XLW_isShieldUnit(attacker)){
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 是盾牌單位，不能進攻`;
    }

    if(window.XLW_isShieldUnit(defender)){
      attacker.attacking = false;
      attacker.target = null;
      return `${dn} 是盾牌單位，不能被進攻`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyAt(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 擊破 ${dn}`;
    }

    if(a < d){
      destroyAt(attZone, attIdx);
      return `${an} 攻擊失敗被破壞`;
    }

    destroyAt(attZone, attIdx);
    destroyAt(target.zone, target.idx);
    return `${an} 與 ${dn} 同歸於盡`;
  }

  async function resolveEnemyDefense(){
    setFlow("對手防守階段開始");
    render();
    await sleep(DELAY);

    for(let lane=0; lane<5; lane++){
      let attacker = null;
      let attZone = null;

      if(field.player_front[lane] && field.player_front[lane].attacking && field.player_front[lane].target){
        attacker = field.player_front[lane];
        attZone = "player_front";
      }else if(field.player_back[lane] && field.player_back[lane].attacking && field.player_back[lane].target){
        attacker = field.player_back[lane];
        attZone = "player_back";
      }

      if(!attacker){
        setFlow(`星星戰線${lane + 1}：沒有我方攻擊`);
        render();
        await sleep(DELAY);
        continue;
      }

      const result = resolveBattle(attZone, lane, attacker.target);
      setFlow(`星星戰線${lane + 1}：${result}`);

      if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

      render();
      await sleep(DELAY);
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;

    setFlow("對手防守階段完成");
    render();
    await sleep(DELAY);
  }

  async function resolvePlayerDefense(){
    setFlow("我方防守階段開始");
    render();
    await sleep(DELAY);

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || !attacker.attacking || !attacker.target){
        setFlow(`星星戰線${lane + 1}：沒有敵方攻擊`);
        render();
        await sleep(DELAY);
        continue;
      }

      const result = resolveBattle("enemy_front", lane, attacker.target);
      setFlow(`星星戰線${lane + 1}：${result}`);

      if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

      render();
      await sleep(DELAY);
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = false;

    phase = "召喚階段";
    mode = null;

    setFlow("我方防守完成，進入召喚階段");
    render();
    await sleep(DELAY);
    clearFlow();
  }

  window.xlwResolvePlayerDefensePhase = resolvePlayerDefense;
  window.xlwResolveEnemyDefensePhaseSafe = resolveEnemyDefense;

  function countAndTapPlayerAttacks(){
    let count = 0;

    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((u,lane)=>{
        if(!u) return;

        if(u.attacking && u.target){
          const illegal =
            window.XLW_isShieldUnit(u) ||
            !enemyLaneHasAny(lane) ||
            enemyFrontShield(lane) ||
            window.XLW_isShieldUnit(field[u.target.zone]?.[u.target.idx]);

          if(illegal){
            u.attacking = false;
            u.target = null;
          }else{
            u.tapped = true;
            count++;
          }
        }
      });
    });

    return count;
  }

  function enemyDeclareAttacks(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || attacker.tapped) continue;
      if(window.XLW_isShieldUnit(attacker)) continue;
      if(!playerLaneHasAny(lane)) continue;
      if(playerFrontShield(lane)) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      if(window.XLW_isShieldUnit(field[target.zone][target.idx])) continue;

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane + 1} ${unitName(attacker)} 指向 ${unitName(field[target.zone][target.idx])}`);
      }
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;

    return count;
  }

  async function runEnemyTurnStrict(){
    setFlow("對手回合開始");
    render();
    await sleep(DELAY);

    untapEnemy();

    const drawn = enemyDraw(2);
    setFlow(`對手抽牌階段：抽 ${drawn} 張`);
    render();
    await sleep(DELAY);

    if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.enemyNeedsDefense){
      await resolveEnemyDefense();
    }else{
      setFlow("對手沒有需要防守的攻擊，進入召喚階段");
      render();
      await sleep(DELAY);
    }

    const summoned = enemySummonOne();
    setFlow(summoned ? `對手召喚：${summoned.card.name}` : "對手沒有可召喚單位");
    render();
    await sleep(DELAY);

    const attacks = enemyDeclareAttacks();
    setFlow(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
    render();
    await sleep(DELAY);

    setFlow("對手回合結束");
    render();
    await sleep(DELAY);
    clearFlow();
  }

  window.xlwRunEnemyTurn = runEnemyTurnStrict;

  async function endPlayerTurnStrict(){
    if(FLOW_RUNNING) return;
    FLOW_RUNNING = true;

    try{
      while(hand.length > 10){
        graveyard.push(hand.pop());
      }

      const attackCount = countAndTapPlayerAttacks();

      if(window.XLW_DEFENSE_RULE){
        window.XLW_DEFENSE_RULE.enemyNeedsDefense = attackCount > 0;
      }

      setFlow("我方回合結束，直接進入對手回合");
      render();
      await sleep(DELAY);

      await runEnemyTurnStrict();

      turn++;
      mode = null;
      normalSummonUsed = false;
      tacticalSummonUsed = false;
      selectedAttacker = null;

      if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
      if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

      untapPlayer();
      draw(2);

      if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.playerNeedsDefense){
        phase = "防守階段";
        setStatus(`第 ${turn} 回合開始，已自動抽2張。自動進行防守階段。`);
        render();
        await sleep(350);
        await resolvePlayerDefense();
      }else{
        phase = "召喚階段";
        setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
        render();
      }
    }finally{
      FLOW_RUNNING = false;
    }
  }

  window.xlwEndPlayerTurnAndRunEnemy = endPlayerTurnStrict;

  function buttonText(){
    if(FLOW_RUNNING) return "流程進行中";
    if(phase === "防守階段") return "自動防守中";
    if(phase === "召喚階段" && turn === 1) return "結束回合";
    if(phase === "結束階段") return "結束回合";
    if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段") return "進入結束階段";
    return "結束回合";
  }

  function ensureForceButton(){
    let btn = document.getElementById("xlwForceEndTurnBtn");

    if(!btn){
      btn = document.createElement("button");
      btn.id = "xlwForceEndTurnBtn";
      btn.type = "button";
      btn.textContent = "結束回合";
      document.body.appendChild(btn);
    }

    btn.textContent = buttonText();
    btn.disabled = FLOW_RUNNING || phase === "防守階段";

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(FLOW_RUNNING) return;

      if(phase === "防守階段"){
        setStatus("防守階段正在自動判定。");
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段。");
        render();
        return;
      }

      if(phase === "召喚階段" || phase === "結束階段"){
        await endPlayerTurnStrict();
        return;
      }

      await endPlayerTurnStrict();
    };
  }

  // 直接攔截舊 hardEndBtn，讓它也跑同一套流程
  window.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("#hardEndBtn");
    if(!btn) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    document.getElementById("xlwForceEndTurnBtn")?.click();

    return false;
  }, true);

  // 進攻目標選定後，下一個 tick 強制橫置
  function forceTapDeclaredAttackers(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((u,lane)=>{
        if(u && u.attacking && u.target){
          u.tapped = true;
        }
      });
    });
  }

  const OLD_RENDER_FORCE_FLOW = render;
  render = function(){
    OLD_RENDER_FORCE_FLOW();

    setTimeout(()=>{
      ensureForceButton();
      forceTapDeclaredAttackers();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const lane = Number(slot.dataset.index);
        const u = field?.[zone]?.[lane];

        slot.classList.toggle("xlw-declared-tapped", !!(u && u.attacking && u.target && u.tapped));
      });
    }, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(ensureForceButton, 500);
  });

})();


// ======================================================
// ABSOLUTE FLOW OVERRIDE v2
// 目的：完全覆蓋舊回合流程，修正「對手抽牌後沒有先防守」問題。
// 使用方式：請點右下角「正式結束回合」。
// ======================================================

(function(){

  const DELAY = 850;
  let running = false;

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function cardOf(u){ return u && (u.card || u); }
  function nameOf(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }
  function rawAtk(u){ const c = cardOf(u); return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0; }

  window.XLW_isShieldUnit = function(u){
    const s = String(rawAtk(u) ?? "").trim();
    return s === "盾" || s === "盾牌" || s === "🛡" || s === "🛡️" || s.includes("盾") || s.toLowerCase() === "shield";
  };

  function atk(u){
    if(window.XLW_isShieldUnit(u)) return 0;
    const n = Number(rawAtk(u));
    return Number.isFinite(n) ? n : 0;
  }

  function setFlow(text){
    setStatus(text);
    let p = document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwOpponentStepPanel";
      p.className = "xlw-opponent-step-panel";
      p.innerHTML = `<div class="op-step-title">流程提示</div><div id="opStepText">等待中</div>`;
      document.body.appendChild(p);
    }
    const t = document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function clearFlow(){
    const p = document.getElementById("xlwOpponentStepPanel");
    if(p) p.classList.remove("active");
  }

  function ensureEnemy(){
    if(!window.XLW_ENEMY || !Array.isArray(window.XLW_ENEMY.deck) || !Array.isArray(window.XLW_ENEMY.hand)){
      if(typeof window.xlwInitEnemyDeck === "function") window.xlwInitEnemyDeck();
    }
  }

  function enemyDraw2(){
    ensureEnemy();
    let n = 0;
    for(let i=0;i<2;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        n++;
      }
    }
    return n;
  }

  function enemySummonOne(){
    ensureEnemy();

    const handIndex = window.XLW_ENEMY.hand.findIndex(c =>
      c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0
    );

    if(handIndex < 0) return null;

    let dest = null;
    for(let i=0;i<5;i++){
      if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};
    }

    if(!dest) return null;

    const card = window.XLW_ENEMY.hand[handIndex];
    window.XLW_ENEMY.hand.splice(handIndex, 1);

    field[dest.zone][dest.idx] = {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:turn,
      summonedZone:dest.zone
    };

    return {card, ...dest};
  }

  function untapEnemyOnlyNonDeclared(){
    ["enemy_front","enemy_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function untapPlayerAll(){
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach(u=>{
        if(u){
          u.tapped = false;
          u.attacking = false;
          u.target = null;
        }
      });
    });
  }

  function enemyLaneHasAny(lane){ return !!(field.enemy_front[lane] || field.enemy_back[lane]); }
  function playerLaneHasAny(lane){ return !!(field.player_front[lane] || field.player_back[lane]); }
  function enemyFrontShield(lane){ return !!(field.enemy_front[lane] && window.XLW_isShieldUnit(field.enemy_front[lane])); }
  function playerFrontShield(lane){ return !!(field.player_front[lane] && window.XLW_isShieldUnit(field.player_front[lane])); }

  function destroyAt(zone, idx){
    const u = field[zone]?.[idx];
    if(!u) return;

    if(window.XLW_isShieldUnit(u)) return;

    if(zone.startsWith("player_")){
      graveyard.push(u.card || u);
    }else{
      if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.grave)){
        window.XLW_ENEMY.grave.push(u.card || u);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(u.card || u);
      }
    }
    field[zone][idx] = null;
  }

  function resolveBattle(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker){
        attacker.attacking = false;
        attacker.target = null;
      }
      return "攻擊者或目標不存在，略過";
    }

    const an = nameOf(attacker);
    const dn = nameOf(defender);

    if(window.XLW_isShieldUnit(attacker)){
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 是盾牌單位，不能進攻`;
    }

    if(window.XLW_isShieldUnit(defender)){
      attacker.attacking = false;
      attacker.target = null;
      return `${dn} 是盾牌單位，不能被進攻`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyAt(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 擊破 ${dn}`;
    }

    if(a < d){
      destroyAt(attZone, attIdx);
      return `${an} 攻擊失敗被破壞`;
    }

    destroyAt(attZone, attIdx);
    destroyAt(target.zone, target.idx);
    return `${an} 與 ${dn} 同歸於盡`;
  }

  function findPlayerAttackerInLane(lane){
    if(field.player_front[lane] && field.player_front[lane].attacking && field.player_front[lane].target){
      return {zone:"player_front", idx:lane, unit:field.player_front[lane]};
    }

    if(field.player_back[lane] && field.player_back[lane].attacking && field.player_back[lane].target){
      return {zone:"player_back", idx:lane, unit:field.player_back[lane]};
    }

    return null;
  }

  function hasPendingPlayerAttack(){
    for(let lane=0; lane<5; lane++){
      const a = findPlayerAttackerInLane(lane);
      if(a) return true;
    }
    return false;
  }

  function countAndTapPlayerAttacks(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const a = findPlayerAttackerInLane(lane);
      if(!a) continue;

      const target = field[a.unit.target.zone]?.[a.unit.target.idx];

      const illegal =
        window.XLW_isShieldUnit(a.unit) ||
        !enemyLaneHasAny(lane) ||
        enemyFrontShield(lane) ||
        !target ||
        window.XLW_isShieldUnit(target);

      if(illegal){
        a.unit.attacking = false;
        a.unit.target = null;
        continue;
      }

      a.unit.tapped = true;
      count++;
    }

    return count;
  }

  async function enemyDefenseNow(){
    setFlow("對手防守階段開始");
    render();
    await sleep(DELAY);

    for(let lane=0; lane<5; lane++){
      const a = findPlayerAttackerInLane(lane);

      if(!a){
        setFlow(`星星戰線${lane + 1}：沒有我方攻擊`);
        render();
        await sleep(DELAY);
        continue;
      }

      setFlow(`星星戰線${lane + 1}：${nameOf(a.unit)} 進行戰鬥判定`);
      render();
      await sleep(DELAY);

      const result = resolveBattle(a.zone, a.idx, a.unit.target);
      setFlow(`星星戰線${lane + 1}：${result}`);

      if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

      render();
      await sleep(DELAY);
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;

    setFlow("對手防守階段完成");
    render();
    await sleep(DELAY);
  }

  async function playerDefenseNow(){
    setFlow("我方防守階段開始");
    render();
    await sleep(DELAY);

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || !attacker.attacking || !attacker.target){
        setFlow(`星星戰線${lane + 1}：沒有敵方攻擊`);
        render();
        await sleep(DELAY);
        continue;
      }

      setFlow(`星星戰線${lane + 1}：${nameOf(attacker)} 進行戰鬥判定`);
      render();
      await sleep(DELAY);

      const result = resolveBattle("enemy_front", lane, attacker.target);
      setFlow(`星星戰線${lane + 1}：${result}`);

      if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

      render();
      await sleep(DELAY);
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = false;

    phase = "召喚階段";
    mode = null;

    setFlow("我方防守完成，進入召喚階段");
    render();
    await sleep(DELAY);
    clearFlow();
  }

  window.xlwResolveEnemyDefensePhaseSafe = enemyDefenseNow;
  window.xlwResolvePlayerDefensePhase = playerDefenseNow;

  function enemyDeclareAttacks(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || attacker.tapped) continue;
      if(window.XLW_isShieldUnit(attacker)) continue;
      if(!playerLaneHasAny(lane)) continue;
      if(playerFrontShield(lane)) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      const targetUnit = field[target.zone][target.idx];
      if(!targetUnit || window.XLW_isShieldUnit(targetUnit)) continue;

      attacker.attacking = true;
      attacker.target = target;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane + 1} ${nameOf(attacker)} 指向 ${nameOf(targetUnit)}`);
      }
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;

    return count;
  }

  async function enemyTurnAbsolute(){
    setFlow("對手回合開始");
    render();
    await sleep(DELAY);

    // 對手回合一開始先轉正對手單位
    untapEnemyOnlyNonDeclared();

    // 1. 抽牌
    const drawn = enemyDraw2();
    setFlow(`對手抽牌階段：抽 ${drawn} 張`);
    render();
    await sleep(DELAY);

    // 2. 抽完牌後，立刻確認是否要防守
    const needDefense = hasPendingPlayerAttack() || (window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.enemyNeedsDefense);

    if(needDefense){
      await enemyDefenseNow();
    }else{
      setFlow("對手沒有需要防守的攻擊，進入召喚階段");
      render();
      await sleep(DELAY);
    }

    // 3. 召喚
    const summoned = enemySummonOne();
    setFlow(summoned ? `對手召喚：${summoned.card.name}` : "對手沒有可召喚單位");
    render();
    await sleep(DELAY);

    // 4. 進攻宣言
    const attacks = enemyDeclareAttacks();
    setFlow(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
    render();
    await sleep(DELAY);

    setFlow("對手回合結束");
    render();
    await sleep(DELAY);
    clearFlow();
  }

  window.xlwRunEnemyTurn = enemyTurnAbsolute;

  async function endPlayerTurnAbsolute(){
    if(running) return;
    running = true;

    try{
      while(hand.length > 10){
        graveyard.push(hand.pop());
      }

      const declared = countAndTapPlayerAttacks();

      if(window.XLW_DEFENSE_RULE){
        window.XLW_DEFENSE_RULE.enemyNeedsDefense = declared > 0;
      }

      setFlow(`我方回合結束，進入對手回合${declared ? "（對手需防守）" : ""}`);
      render();
      await sleep(DELAY);

      await enemyTurnAbsolute();

      // 對手回合結束後，才開始我方下一回合
      turn++;
      mode = null;
      normalSummonUsed = false;
      tacticalSummonUsed = false;
      selectedAttacker = null;

      if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
      if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

      untapPlayerAll();
      draw(2);

      if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.playerNeedsDefense){
        phase = "防守階段";
        setStatus(`第 ${turn} 回合開始，已自動抽2張。自動進行防守階段。`);
        render();
        await sleep(350);
        await playerDefenseNow();
      }else{
        phase = "召喚階段";
        setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
        render();
      }
    }finally{
      running = false;
    }
  }

  // JS does not have Python False; fix above by explicit assignment through wrapper
  async function endPlayerTurnAbsoluteSafe(){
    if(running) return;
    running = true;

    try{
      while(hand.length > 10){
        graveyard.push(hand.pop());
      }

      const declared = countAndTapPlayerAttacks();

      if(window.XLW_DEFENSE_RULE){
        window.XLW_DEFENSE_RULE.enemyNeedsDefense = declared > 0;
      }

      setFlow(`我方回合結束，進入對手回合${declared ? "（對手需防守）" : ""}`);
      render();
      await sleep(DELAY);

      await enemyTurnAbsolute();

      turn++;
      mode = null;
      normalSummonUsed = false;
      tacticalSummonUsed = false;
      selectedAttacker = null;

      if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
      if(typeof actionPhaseType !== "undefined") actionPhaseType = null;

      untapPlayerAll();
      draw(2);

      if(window.XLW_DEFENSE_RULE && window.XLW_DEFENSE_RULE.playerNeedsDefense){
        phase = "防守階段";
        setStatus(`第 ${turn} 回合開始，已自動抽2張。自動進行防守階段。`);
        render();
        await sleep(350);
        await playerDefenseNow();
      }else{
        phase = "召喚階段";
        setStatus(`第 ${turn} 回合開始，已自動抽2張。`);
        render();
      }
    }finally{
      running = false;
    }
  }

  window.xlwEndPlayerTurnAndRunEnemy = endPlayerTurnAbsoluteSafe;

  function ensureAbsoluteButton(){
    let btn = document.getElementById("xlwAbsoluteEndTurnBtn");

    if(!btn){
      btn = document.createElement("button");
      btn.id = "xlwAbsoluteEndTurnBtn";
      btn.type = "button";
      document.body.appendChild(btn);
    }

    btn.textContent = running ? "流程進行中" : "正式結束回合";
    btn.disabled = running || phase === "防守階段";

    btn.onclick = async function(e){
      e.preventDefault();
      e.stopPropagation();

      if(running) return;

      if(phase === "防守階段"){
        setStatus("防守階段正在自動判定。");
        return;
      }

      if(phase === "戰術佈陣" || phase === "進攻宣言" || phase === "結算階段"){
        phase = "結束階段";
        mode = null;
        setStatus("已進入結束階段，請再按正式結束回合。");
        render();
        return;
      }

      await endPlayerTurnAbsoluteSafe();
    };
  }

  // 把舊按鈕變成只呼叫正式按鈕
  function replaceOldEndButton(){
    const old = document.getElementById("hardEndBtn");
    if(!old || old.dataset.absoluteReplaced === "1") return;

    const clone = old.cloneNode(true);
    clone.dataset.absoluteReplaced = "1";
    clone.textContent = "使用右下正式結束";
    clone.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      document.getElementById("xlwAbsoluteEndTurnBtn")?.click();
    };

    old.parentNode.replaceChild(clone, old);
  }

  // 進攻宣言完成後立刻橫置，並標記對手需防守
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot || phase !== "進攻宣言") return;

    setTimeout(()=>{
      const pending = countAndTapPlayerAttacks();

      if(window.XLW_DEFENSE_RULE && pending > 0){
        window.XLW_DEFENSE_RULE.enemyNeedsDefense = true;
      }

      render();
    }, 0);
  }, true);

  const OLD_RENDER_ABSOLUTE_FLOW = render;
  render = function(){
    OLD_RENDER_ABSOLUTE_FLOW();

    setTimeout(()=>{
      ensureAbsoluteButton();
      replaceOldEndButton();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const lane = Number(slot.dataset.index);
        const u = field?.[zone]?.[lane];

        slot.classList.toggle("xlw-declared-tapped", !!(u && u.attacking && u.target && u.tapped));
      });
    }, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      ensureAbsoluteButton();
      replaceOldEndButton();
    }, 600);
  });

})();


// ===== image hard fallback =====
(function(){
  function applyFallback(){
    document.querySelectorAll("img").forEach(img=>{
      if(img.dataset.xlwFallbackBound === "1") return;
      img.dataset.xlwFallbackBound = "1";

      img.addEventListener("error", function(){
        this.onerror = null;
        this.src = '/static/little_traveler_back.jpeg';
      });
    });
  }

  const oldRenderImageFallback = render;
  render = function(){
    oldRenderImageFallback();
    setTimeout(applyFallback, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(applyFallback, 500);
  });
})();


// ======================================================
// RULE CORRECTION PATCH
// 1. 只有先手玩家第1回合不可戰術佈陣 / 進攻宣言。
//    後手玩家，也就是對手第1回合，召喚後可以戰術佈陣或進攻宣言。
// 2. 防守判定攻擊力相等：防守方破壞，進攻方橫置。
// ======================================================
(function(){

  function cardOf(u){ return u && (u.card || u); }
  function unitName(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }
  function rawAtk(u){ const c = cardOf(u); return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0; }
  function isShield(u){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(u);
    const s = String(rawAtk(u) ?? "").trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }
  function atk(u){
    if(isShield(u)) return 0;
    const n = Number(rawAtk(u));
    return Number.isFinite(n) ? n : 0;
  }

  function destroyAt(zone, idx){
    const u = field[zone]?.[idx];
    if(!u) return;
    if(isShield(u)) return;

    if(zone.startsWith("player_")){
      graveyard.push(u.card || u);
    }else{
      if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.grave)){
        window.XLW_ENEMY.grave.push(u.card || u);
        enemyGraveyard = window.XLW_ENEMY.grave;
      }else{
        enemyGraveyard.push(u.card || u);
      }
    }

    field[zone][idx] = null;
  }

  // 新戰鬥判定：同攻擊力時，防守方破壞，進攻方橫置
  window.XLW_resolveBattleEqualDefenderDies = function(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker){
        attacker.attacking = false;
        attacker.target = null;
      }
      return "攻擊者或目標不存在，略過";
    }

    const an = unitName(attacker);
    const dn = unitName(defender);

    if(isShield(attacker)){
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 是盾牌單位，不能進攻`;
    }

    if(isShield(defender)){
      attacker.attacking = false;
      attacker.target = null;
      return `${dn} 是盾牌單位，不能被進攻`;
    }

    const av = atk(attacker);
    const dv = atk(defender);

    if(av > dv){
      destroyAt(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 擊破 ${dn}`;
    }

    if(av < dv){
      destroyAt(attZone, attIdx);
      return `${an} 攻擊失敗被破壞`;
    }

    // 新規則：相等時防守方破壞，進攻方橫置
    destroyAt(target.zone, target.idx);
    attacker.tapped = true;
    attacker.attacking = false;
    attacker.target = null;
    return `${an} 與 ${dn} 攻擊力相等，防守方 ${dn} 被破壞，進攻方橫置`;
  };

  // 覆蓋舊 battle / resolveBattle 使用者：用事件後續保護相等判定的正確結果
  // 主要流程中的防守判定若呼叫 window.XLW_resolveBattleEqualDefenderDies 以外的內部函式，
  // 仍會被下面的官方流程覆蓋按鈕優先使用。
  function laneHasPlayerAttack(lane){
    if(field.player_front[lane]?.attacking && field.player_front[lane]?.target) return {zone:"player_front", idx:lane, unit:field.player_front[lane]};
    if(field.player_back[lane]?.attacking && field.player_back[lane]?.target) return {zone:"player_back", idx:lane, unit:field.player_back[lane]};
    return null;
  }

  function enemyLaneHasPlayerTarget(lane){
    const a = field.enemy_front[lane];
    if(a?.attacking && a?.target) return {zone:"enemy_front", idx:lane, unit:a};
    return null;
  }

  async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  const WAIT = 750;

  function show(text){
    setStatus(text);
    let p = document.getElementById("absoluteFlowPanel") || document.getElementById("xlwOpponentStepPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "absoluteFlowPanel";
      p.innerHTML = `<div class="af-title">流程提示</div><div id="absoluteFlowText"></div>`;
      document.body.appendChild(p);
    }
    const t = document.getElementById("absoluteFlowText") || document.getElementById("opStepText");
    if(t) t.textContent = text;
    p.classList.add("active");
  }

  function hide(){
    const p1 = document.getElementById("absoluteFlowPanel");
    const p2 = document.getElementById("xlwOpponentStepPanel");
    if(p1) p1.classList.remove("active");
    if(p2) p2.classList.remove("active");
  }

  // 明確覆蓋對手防守階段：我方攻擊 -> 對手防守，星星戰線1~5
  window.xlwResolveEnemyDefensePhaseSafe = async function(){
    show("對手防守階段開始");
    render();
    await sleep(WAIT);

    for(let lane=0; lane<5; lane++){
      const a = laneHasPlayerAttack(lane);

      if(!a){
        show(`星星戰線${lane + 1}：沒有我方攻擊`);
        render();
        await sleep(WAIT);
        continue;
      }

      show(`星星戰線${lane + 1}：${unitName(a.unit)} 進行戰鬥判定`);
      render();
      await sleep(WAIT);

      const result = window.XLW_resolveBattleEqualDefenderDies(a.zone, a.idx, a.unit.target);
      show(`星星戰線${lane + 1}：${result}`);
      if(typeof logBattle === "function") logBattle(`對手防守：${result}`);

      render();
      await sleep(WAIT);
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.enemyNeedsDefense = false;

    show("對手防守階段完成");
    render();
    await sleep(WAIT);
    hide();
  };

  // 明確覆蓋我方防守階段：對手攻擊 -> 我方防守，星星戰線1~5
  window.xlwResolvePlayerDefensePhase = async function(){
    show("我方防守階段開始");
    render();
    await sleep(WAIT);

    for(let lane=0; lane<5; lane++){
      const a = enemyLaneHasPlayerTarget(lane);

      if(!a){
        show(`星星戰線${lane + 1}：沒有敵方攻擊`);
        render();
        await sleep(WAIT);
        continue;
      }

      show(`星星戰線${lane + 1}：${unitName(a.unit)} 進行戰鬥判定`);
      render();
      await sleep(WAIT);

      const result = window.XLW_resolveBattleEqualDefenderDies(a.zone, a.idx, a.unit.target);
      show(`星星戰線${lane + 1}：${result}`);
      if(typeof logBattle === "function") logBattle(`我方防守：${result}`);

      render();
      await sleep(WAIT);
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = false;

    phase = "召喚階段";
    mode = null;

    show("我方防守完成，進入召喚階段");
    render();
    await sleep(WAIT);
    hide();
  };

  // 對手第1回合可進攻宣言：這裡強化敵方宣告邏輯，不套用「第一回合禁止」在對手身上
  window.XLW_enemyDeclareAttacksSecondPlayerAllowed = function(){
    let count = 0;

    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];

      if(!attacker || attacker.tapped) continue;
      if(isShield(attacker)) continue;

      const playerHasAny = !!(field.player_front[lane] || field.player_back[lane]);
      const playerFrontIsShield = !!(field.player_front[lane] && isShield(field.player_front[lane]));

      if(!playerHasAny || playerFrontIsShield) continue;

      const target = field.player_front[lane]
        ? {zone:"player_front", idx:lane}
        : {zone:"player_back", idx:lane};

      const targetUnit = field[target.zone][target.idx];
      if(!targetUnit || isShield(targetUnit)) continue;

      attacker.attacking = true;
      attacker.target = target;
      attacker.tapped = true;
      count++;

      if(typeof logBattle === "function"){
        logBattle(`對手進攻宣言：星星戰線${lane + 1} ${unitName(attacker)} 指向 ${unitName(targetUnit)}`);
      }
    }

    if(window.XLW_DEFENSE_RULE) window.XLW_DEFENSE_RULE.playerNeedsDefense = count > 0;
    return count;
  };

  // 在對手回合中，若舊 AI 沒有宣告，補宣告一次，確保後手第1回合可戰術/進攻
  const oldRunEnemy = window.xlwRunEnemyTurn;
  if(typeof oldRunEnemy === "function"){
    window.xlwRunEnemyTurn = async function(){
      await oldRunEnemy.apply(this, arguments);

      // 若對手場上可進攻卻沒有留下進攻宣言，補宣告
      let existing = false;
      for(let i=0;i<5;i++){
        if(field.enemy_front[i]?.attacking && field.enemy_front[i]?.target) existing = true;
      }

      if(!existing){
        const n = window.XLW_enemyDeclareAttacksSecondPlayerAllowed();
        if(n > 0){
          show(`對手後手回合進攻宣言：${n} 條星星戰線`);
          render();
          await sleep(WAIT);
          hide();
        }
      }
    };
  }

})();


// ======================================================
// STAR KING TURN ENGINE REBUILD v1
// 單一回合引擎：player / enemy / phase 全部集中管理
// ======================================================
(function(){
  const WAIT = 760;

  const Engine = window.SK_ENGINE = {
    currentPlayer: "player",
    playerTurn: 1,
    enemyTurn: 0,
    phase: "summon",
    busy: false,
    started: false,
    playerNeedsDefense: false,
    enemyNeedsDefense: false,
    selectedAttacker: null,
    lastMessage: ""
  };

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function cardOf(u){ return u && (u.card || u); }
  function nameOf(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }
  function rawAtk(u){ const c = cardOf(u); return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0; }

  window.XLW_isShieldUnit = function(u){
    const s = String(rawAtk(u) ?? "").trim();
    return s === "盾" || s === "盾牌" || s === "🛡" || s === "🛡️" || s.includes("盾") || s.toLowerCase() === "shield";
  };

  function isShield(u){ return window.XLW_isShieldUnit(u); }
  function atk(u){ if(isShield(u)) return 0; const n = Number(rawAtk(u)); return Number.isFinite(n) ? n : 0; }
  function isPlayerZone(z){ return z === "player_front" || z === "player_back"; }
  function isEnemyZone(z){ return z === "enemy_front" || z === "enemy_back"; }
  function enemyAny(lane){ return !!(field.enemy_front[lane] || field.enemy_back[lane]); }
  function playerAny(lane){ return !!(field.player_front[lane] || field.player_back[lane]); }
  function enemyFrontShield(lane){ return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane])); }
  function playerFrontShield(lane){ return !!(field.player_front[lane] && isShield(field.player_front[lane])); }

  function show(text){
    Engine.lastMessage = text;
    try{ setStatus(text); }catch(e){}
    let p = document.getElementById("skEnginePanel");
    if(!p){
      p = document.createElement("div");
      p.id = "skEnginePanel";
      p.innerHTML = `
        <div class="sk-engine-title">回合引擎</div>
        <div id="skEngineTurn"></div>
        <div id="skEnginePhase"></div>
        <div id="skEngineMessage"></div>
      `;
      document.body.appendChild(p);
    }
    const turn = document.getElementById("skEngineTurn");
    const ph = document.getElementById("skEnginePhase");
    const msg = document.getElementById("skEngineMessage");
    if(turn) turn.textContent = Engine.currentPlayer === "player" ? `我方第 ${Engine.playerTurn} 回合` : `對手第 ${Engine.enemyTurn} 回合`;
    if(ph) ph.textContent = phaseLabel();
    if(msg) msg.textContent = text;
    updatePhaseDisplay();
  }

  function phaseLabel(){
    const owner = Engine.currentPlayer === "player" ? "我方" : "對手";
    const map = {
      draw:"抽牌階段",
      defense:"防守階段",
      summon:"召喚階段",
      action:"戰術佈陣 / 進攻宣言",
      formation:"戰術佈陣",
      attack:"進攻宣言",
      end:"結束階段"
    };
    return `${owner}｜${map[Engine.phase] || Engine.phase}`;
  }

  function updatePhaseDisplay(){
    const text = document.getElementById("phaseTextHard") || document.getElementById("phaseDisplayText");
    if(text) text.textContent = phaseLabel();
    const help = document.getElementById("phaseHelpHard") || document.getElementById("phaseHelpText");
    if(help) help.textContent = Engine.lastMessage || "依照回合引擎進行。";
  }

  function syncGlobalPhase(){
    if(Engine.phase === "defense") phase = "防守階段";
    else if(Engine.phase === "summon") phase = "召喚階段";
    else if(Engine.phase === "formation") phase = "戰術佈陣";
    else if(Engine.phase === "attack") phase = "進攻宣言";
    else if(Engine.phase === "end") phase = "結束階段";
    else phase = "召喚階段";
    document.body.dataset.skPlayer = Engine.currentPlayer;
    document.body.dataset.skPhase = Engine.phase;
  }

  function ensureEnemyDeck(){
    if(!window.XLW_ENEMY || !Array.isArray(window.XLW_ENEMY.deck) || !Array.isArray(window.XLW_ENEMY.hand)){
      window.XLW_ENEMY = window.XLW_ENEMY || {};
      const ids = decks && decks["妖怪村莊"] ? decks["妖怪村莊"] : [];
      let list = ids.map(id => structuredClone(allCards.find(c => c.id === id))).filter(Boolean);
      if(!list.length) list = (allCards || []).filter(c => c.deck === "妖怪村莊").map(c => structuredClone(c));
      for(let i=list.length-1;i>0;i--){
        const j = Math.floor(Math.random() * (i+1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      window.XLW_ENEMY.deck = list;
      window.XLW_ENEMY.hand = [];
      window.XLW_ENEMY.grave = [];
      enemyGraveyard = window.XLW_ENEMY.grave;
      for(let i=0;i<4;i++){
        if(window.XLW_ENEMY.deck.length) window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
      }
    }
  }

  function enemyDraw(n){
    ensureEnemyDeck();
    let count = 0;
    for(let i=0;i<n;i++){
      if(window.XLW_ENEMY.deck.length){
        window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
        count++;
      }
    }
    return count;
  }

  function enemySummonOne(){
    ensureEnemyDeck();
    const idx = window.XLW_ENEMY.hand.findIndex(c => c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0);
    if(idx < 0) return null;

    let dest = null;
    for(let i=0;i<5;i++) if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
    for(let i=0;i<5;i++) if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};
    if(!dest) return null;

    const card = window.XLW_ENEMY.hand[idx];
    window.XLW_ENEMY.hand.splice(idx,1);
    field[dest.zone][dest.idx] = {card, tapped:false, attacking:false, target:null, summonedTurn:Engine.enemyTurn, summonedZone:dest.zone};
    return {card, ...dest};
  }

  function untapOwner(owner){
    const zones = owner === "player" ? ["player_front","player_back"] : ["enemy_front","enemy_back"];
    zones.forEach(z => field[z].forEach(u => {
      if(u){ u.tapped = false; u.attacking = false; u.target = null; }
    }));
  }

  function destroyAt(zone, idx){
    const u = field[zone]?.[idx];
    if(!u) return;
    if(isShield(u)) return;
    if(zone.startsWith("player_")) graveyard.push(u.card || u);
    else {
      ensureEnemyDeck();
      window.XLW_ENEMY.grave.push(u.card || u);
      enemyGraveyard = window.XLW_ENEMY.grave;
    }
    field[zone][idx] = null;
  }

  function resolveBattle(attZone, attIdx, target){
    const attacker = field[attZone]?.[attIdx];
    const defender = field[target.zone]?.[target.idx];

    if(!attacker || !defender){
      if(attacker){ attacker.attacking = false; attacker.target = null; }
      return "攻擊者或目標不存在，略過";
    }

    const an = nameOf(attacker);
    const dn = nameOf(defender);

    if(isShield(attacker)){
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 是盾牌單位，不能進攻`;
    }

    if(isShield(defender)){
      attacker.attacking = false;
      attacker.target = null;
      return `${dn} 是盾牌單位，不能被進攻`;
    }

    const a = atk(attacker);
    const d = atk(defender);

    if(a > d){
      destroyAt(target.zone, target.idx);
      attacker.tapped = true;
      attacker.attacking = false;
      attacker.target = null;
      return `${an} 擊破 ${dn}`;
    }

    if(a < d){
      destroyAt(attZone, attIdx);
      return `${an} 攻擊失敗被破壞`;
    }

    // 重要修正：相等時防守方破壞，進攻方橫置
    destroyAt(target.zone, target.idx);
    attacker.tapped = true;
    attacker.attacking = false;
    attacker.target = null;
    return `${an} 與 ${dn} 攻擊力相等，防守方 ${dn} 被破壞，進攻方橫置`;
  }

  function playerAttackInLane(lane){
    if(field.player_front[lane]?.attacking && field.player_front[lane]?.target) return {zone:"player_front", idx:lane, unit:field.player_front[lane]};
    if(field.player_back[lane]?.attacking && field.player_back[lane]?.target) return {zone:"player_back", idx:lane, unit:field.player_back[lane]};
    return null;
  }

  function enemyAttackInLane(lane){
    if(field.enemy_front[lane]?.attacking && field.enemy_front[lane]?.target) return {zone:"enemy_front", idx:lane, unit:field.enemy_front[lane]};
    return null;
  }

  async function resolveDefenseFor(defender){
    Engine.phase = "defense";
    syncGlobalPhase();
    show(defender === "enemy" ? "對手防守階段開始" : "我方防守階段開始");
    render();
    await sleep(WAIT);

    for(let lane=0; lane<5; lane++){
      const att = defender === "enemy" ? playerAttackInLane(lane) : enemyAttackInLane(lane);
      if(!att){
        show(`星星戰線${lane+1}：沒有攻擊`);
        render();
        await sleep(WAIT);
        continue;
      }

      show(`星星戰線${lane+1}：${nameOf(att.unit)} 進行戰鬥判定`);
      render();
      await sleep(WAIT);

      const result = resolveBattle(att.zone, att.idx, att.unit.target);
      show(`星星戰線${lane+1}：${result}`);
      if(typeof logBattle === "function") logBattle(`${defender === "enemy" ? "對手" : "我方"}防守：${result}`);
      render();
      await sleep(WAIT);
    }

    if(defender === "enemy") Engine.enemyNeedsDefense = false;
    else Engine.playerNeedsDefense = false;

    show(defender === "enemy" ? "對手防守完成" : "我方防守完成");
    render();
    await sleep(WAIT);
  }

  function markPlayerAttacksForEnemyDefense(){
    let count = 0;
    ["player_front","player_back"].forEach(z => field[z].forEach((u,lane) => {
      if(!u || !u.attacking || !u.target) return;
      const target = field[u.target.zone]?.[u.target.idx];
      if(isShield(u) || !enemyAny(lane) || enemyFrontShield(lane) || !target || isShield(target)){
        u.attacking = false;
        u.target = null;
        return;
      }
      u.tapped = true;
      count++;
    }));
    Engine.enemyNeedsDefense = count > 0;
    return count;
  }

  function enemyDeclareAttack(){
    let count = 0;
    for(let lane=0; lane<5; lane++){
      const attacker = field.enemy_front[lane];
      if(!attacker || attacker.tapped || isShield(attacker)) continue;
      if(!playerAny(lane) || playerFrontShield(lane)) continue;

      const target = field.player_front[lane] ? {zone:"player_front", idx:lane} : {zone:"player_back", idx:lane};
      const targetUnit = field[target.zone][target.idx];
      if(!targetUnit || isShield(targetUnit)) continue;

      attacker.attacking = true;
      attacker.target = target;
      attacker.tapped = true;
      count++;
      if(typeof logBattle === "function") logBattle(`對手進攻宣言：星星戰線${lane+1} ${nameOf(attacker)} 指向 ${nameOf(targetUnit)}`);
    }
    Engine.playerNeedsDefense = count > 0;
    return count;
  }

  async function startEnemyTurn(){
    Engine.currentPlayer = "enemy";
    Engine.enemyTurn += 1;
    Engine.phase = "draw";
    syncGlobalPhase();

    untapOwner("enemy");

    show(`對手第 ${Engine.enemyTurn} 回合開始：抽牌階段`);
    render();
    await sleep(WAIT);

    const drawn = enemyDraw(2);
    show(`對手抽牌階段：抽 ${drawn} 張`);
    render();
    await sleep(WAIT);

    if(Engine.enemyNeedsDefense){
      await resolveDefenseFor("enemy");
    }else{
      show("對手不需防守，進入召喚階段");
      render();
      await sleep(WAIT);
    }

    Engine.phase = "summon";
    syncGlobalPhase();

    const summoned = enemySummonOne();
    show(summoned ? `對手召喚：${summoned.card.name}` : "對手沒有可召喚單位");
    render();
    await sleep(WAIT);

    // 後手玩家第1回合也可以行動，因此這裡不禁止 enemyTurn === 1
    Engine.phase = "attack";
    syncGlobalPhase();

    const attacks = enemyDeclareAttack();
    show(attacks ? `對手進攻宣言：${attacks} 條星星戰線` : "對手沒有可進攻單位");
    render();
    await sleep(WAIT);

    Engine.phase = "end";
    syncGlobalPhase();
    show("對手回合結束");
    render();
    await sleep(WAIT);

    startPlayerTurn();
  }

  function startPlayerTurn(){
    Engine.currentPlayer = "player";
    Engine.playerTurn += 1;
    Engine.phase = "draw";
    syncGlobalPhase();

    untapOwner("player");
    draw(2);

    if(Engine.playerNeedsDefense){
      phase = "防守階段";
      Engine.phase = "defense";
      syncGlobalPhase();
      show(`我方第 ${Engine.playerTurn} 回合開始：已抽2張，先進行防守階段`);
      render();
      setTimeout(async () => {
        await resolveDefenseFor("player");
        Engine.phase = "summon";
        syncGlobalPhase();
        show("進入我方召喚階段");
        render();
      }, 450);
    }else{
      Engine.phase = "summon";
      syncGlobalPhase();
      show(`我方第 ${Engine.playerTurn} 回合開始：已抽2張，進入召喚階段`);
      render();
    }

    normalSummonUsed = false;
    tacticalSummonUsed = false;
    if(typeof actionChoiceMade !== "undefined") actionChoiceMade = false;
    if(typeof actionPhaseType !== "undefined") actionPhaseType = null;
  }

  async function endPlayerTurn(){
    if(Engine.busy) return;
    Engine.busy = true;

    try{
      while(hand.length > 10) graveyard.push(hand.pop());

      const attacks = markPlayerAttacksForEnemyDefense();
      show(attacks ? "我方回合結束，對手回合抽牌後將先防守" : "我方回合結束，進入對手回合");
      render();
      await sleep(WAIT);

      await startEnemyTurn();
    }finally{
      Engine.busy = false;
    }
  }

  function initEngineIfNeeded(){
    if(Engine.started) return;
    Engine.started = true;
    Engine.currentPlayer = "player";
    Engine.playerTurn = 1;
    Engine.enemyTurn = 0;
    Engine.phase = "summon";
    Engine.playerNeedsDefense = false;
    Engine.enemyNeedsDefense = false;
    syncGlobalPhase();
    show("我方先手第1回合：召喚階段。完成後請按「回合引擎：結束我方回合」。");
  }

  function canPlayerAttack(zone, lane){
    const u = field[zone]?.[lane];
    if(!u || u.tapped || isShield(u)) return false;
    if(!enemyAny(lane) || enemyFrontShield(lane)) return false;
    return true;
  }

  // 重新接管我方進攻宣言
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;
    if(Engine.currentPlayer !== "player" || Engine.phase !== "attack") return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(!Engine.selectedAttacker){
      if(!isPlayerZone(zone)){
        show("請先選擇我方可進攻單位。");
        return false;
      }

      if(!canPlayerAttack(zone, idx)){
        const u = field[zone]?.[idx];
        if(u && isShield(u)) show("盾牌單位不能進攻。");
        else if(u && u.tapped) show("橫置單位不能進攻。");
        else if(!enemyAny(idx)) show("同戰線敵方前後排皆空，該單位不能進攻。");
        else if(enemyFrontShield(idx)) show("同戰線敵方前排為盾牌，該單位不能進攻。");
        else show("此單位不能進攻。");
        return false;
      }

      Engine.selectedAttacker = {zone, idx};
      const u = field[zone][idx];
      u.attacking = true;
      u.target = null;
      show(`已選擇進攻單位：${nameOf(u)}，請點選同戰線敵方目標。`);
      render();
      return false;
    }

    if(!isEnemyZone(zone)){
      show("請選擇同戰線敵方目標。");
      return false;
    }

    const lane = Engine.selectedAttacker.idx;
    if(idx !== lane){
      show("只能指定同一條星星戰線的目標。");
      return false;
    }

    if(field.enemy_front[lane] && zone !== "enemy_front"){
      show("同戰線有前排單位時，必須先指定前排。");
      return false;
    }

    const attacker = field[Engine.selectedAttacker.zone]?.[lane];
    const target = field[zone]?.[idx];

    if(!attacker || !target){
      show("攻擊者或目標不存在。");
      Engine.selectedAttacker = null;
      render();
      return false;
    }

    if(isShield(target)){
      show("盾牌單位不能被進攻。");
      return false;
    }

    attacker.attacking = true;
    attacker.target = {zone, idx};
    attacker.tapped = true;
    Engine.enemyNeedsDefense = true;
    show(`${nameOf(attacker)} 已宣告攻擊 ${nameOf(target)}。戰鬥會在對手抽牌後的防守階段處理。`);
    if(typeof logBattle === "function") logBattle(`我方進攻宣言：星星戰線${idx+1} ${nameOf(attacker)} 指向 ${nameOf(target)}`);
    Engine.selectedAttacker = null;
    render();
    return false;
  }, true);

  function ensureEngineButton(){
    let btn = document.getElementById("skEngineEndBtn");
    if(!btn){
      btn = document.createElement("button");
      btn.id = "skEngineEndBtn";
      btn.type = "button";
      btn.textContent = "回合引擎：結束我方回合";
      document.body.appendChild(btn);
    }

    btn.disabled = Engine.busy || Engine.currentPlayer !== "player" || Engine.phase === "defense";
    btn.textContent = Engine.busy ? "回合引擎運行中" : "回合引擎：結束我方回合";

    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      if(Engine.busy) return;

      if(Engine.currentPlayer !== "player"){
        show("目前不是我方回合。");
        return;
      }

      if(Engine.phase === "defense"){
        show("防守階段正在處理。");
        return;
      }

      if(phase === "戰術佈陣" || Engine.phase === "formation"){
        Engine.phase = "end";
      }

      endPlayerTurn();
    };
  }

  // 攔截舊結束按鈕，全部導向新的回合引擎
  window.addEventListener("click", function(e){
    const old = e.target.closest && e.target.closest("#hardEndBtn,#xlwForceEndTurnBtn,#xlwAbsoluteEndTurnBtn,#xlwRealEndTurnBtn");
    if(!old) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    document.getElementById("skEngineEndBtn")?.click();
    return false;
  }, true);

  // 戰術/進攻按鈕改為只切換 Engine.phase
  window.forceChooseFormation = function(){
    if(Engine.currentPlayer !== "player"){
      show("目前不是我方回合。");
      return;
    }

    if(Engine.playerTurn === 1){
      show("先手玩家第1回合不能戰術佈陣。");
      return;
    }

    Engine.phase = "formation";
    syncGlobalPhase();
    show("已進入戰術佈陣。");
    render();
  };

  window.forceChooseAttack = function(){
    if(Engine.currentPlayer !== "player"){
      show("目前不是我方回合。");
      return;
    }

    if(Engine.playerTurn === 1){
      show("先手玩家第1回合不能進攻宣言。");
      return;
    }

    Engine.phase = "attack";
    syncGlobalPhase();
    show("已進入進攻宣言。請選擇可進攻單位。");
    render();
  };

  const OLD_RENDER_ENGINE = render;
  render = function(){
    OLD_RENDER_ENGINE();

    setTimeout(()=>{
      initEngineIfNeeded();
      ensureEngineButton();
      updatePhaseDisplay();

      // 圖片 fallback
      document.querySelectorAll("img").forEach(img => {
        img.onerror = function(){
          this.onerror = null;
          this.src = "/static/little_traveler_back.jpeg";
        };
      });

      document.querySelectorAll(".slot").forEach(slot=>{
        const z = slot.dataset.zone;
        const i = Number(slot.dataset.index);
        const u = field?.[z]?.[i];

        slot.classList.toggle("sk-engine-attacking", !!(u && u.attacking && u.target));
        slot.classList.toggle("sk-engine-shield", !!(u && isShield(u)));
      });
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      initEngineIfNeeded();
      ensureEngineButton();
    },600);
  });

})();


// ======================================================
// SK_ENGINE ACTION BUTTON FIX
// 修正：回合引擎重構後，戰術佈陣 / 進攻宣言按鈕無法點選
// ======================================================
(function(){

  function getEngine(){
    return window.SK_ENGINE || null;
  }

  function canChooseAction(){
    const E = getEngine();
    if(!E) return false;

    return (
      E.currentPlayer === "player" &&
      E.phase === "summon" &&
      E.playerTurn > 1 &&
      !E.busy
    );
  }

  function enterFormation(){
    const E = getEngine();

    if(!E){
      setStatus("回合引擎尚未初始化。");
      return;
    }

    if(E.currentPlayer !== "player"){
      setStatus("目前不是我方回合。");
      return;
    }

    if(E.playerTurn === 1){
      setStatus("先手玩家第1回合不能戰術佈陣。");
      return;
    }

    if(E.phase !== "summon"){
      setStatus("只有召喚階段結束後可以選擇戰術佈陣。");
      return;
    }

    E.phase = "formation";
    phase = "戰術佈陣";
    mode = "formation";

    setStatus("已進入戰術佈陣。");
    render();
  }

  function enterAttack(){
    const E = getEngine();

    if(!E){
      setStatus("回合引擎尚未初始化。");
      return;
    }

    if(E.currentPlayer !== "player"){
      setStatus("目前不是我方回合。");
      return;
    }

    if(E.playerTurn === 1){
      setStatus("先手玩家第1回合不能進攻宣言。");
      return;
    }

    if(E.phase !== "summon"){
      setStatus("只有召喚階段結束後可以選擇進攻宣言。");
      return;
    }

    E.phase = "attack";
    phase = "進攻宣言";
    mode = "attack";
    E.selectedAttacker = null;

    setStatus("已進入進攻宣言。請選擇可進攻單位。");
    render();
  }

  // 覆蓋舊的全域函式
  window.forceChooseFormation = enterFormation;
  window.forceChooseAttack = enterAttack;

  function ensureActionButtons(){
    let box = document.getElementById("skEngineActionBox");

    if(!box){
      box = document.createElement("div");
      box.id = "skEngineActionBox";
      box.innerHTML = `
        <button id="skFormationBtn" type="button">戰術佈陣</button>
        <button id="skAttackBtn" type="button">進攻宣言</button>
      `;
      document.body.appendChild(box);
    }

    const formation = document.getElementById("skFormationBtn");
    const attack = document.getElementById("skAttackBtn");

    if(formation){
      formation.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        enterFormation();
      };
      formation.disabled = !canChooseAction();
    }

    if(attack){
      attack.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        enterAttack();
      };
      attack.disabled = !canChooseAction();
    }
  }

  function patchOldButtons(){
    const formationIds = [
      "hardFormationBtn",
      "cleanFormationBtn",
      "realFormationBtn",
      "formationBtn"
    ];

    const attackIds = [
      "hardAttackBtn",
      "cleanAttackBtn",
      "realAttackBtn",
      "attackBtn"
    ];

    formationIds.forEach(id=>{
      const btn = document.getElementById(id);
      if(!btn) return;

      btn.disabled = !canChooseAction();
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        enterFormation();
      };
    });

    attackIds.forEach(id=>{
      const btn = document.getElementById(id);
      if(!btn) return;

      btn.disabled = !canChooseAction();
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        enterAttack();
      };
    });
  }

  const OLD_RENDER_SK_ACTION_BUTTON_FIX = render;
  render = function(){
    OLD_RENDER_SK_ACTION_BUTTON_FIX();

    setTimeout(()=>{
      ensureActionButtons();
      patchOldButtons();

      const E = getEngine();
      const hint = document.getElementById("skActionHint");

      if(!hint){
        const box = document.getElementById("skEngineActionBox");
        if(box){
          const h = document.createElement("div");
          h.id = "skActionHint";
          box.appendChild(h);
        }
      }

      const h2 = document.getElementById("skActionHint");
      if(h2 && E){
        if(E.currentPlayer !== "player"){
          h2.textContent = "目前是對手回合";
        }else if(E.playerTurn === 1){
          h2.textContent = "先手第1回合不可行動";
        }else if(E.phase === "summon"){
          h2.textContent = "召喚後請二選一";
        }else if(E.phase === "formation"){
          h2.textContent = "目前：戰術佈陣";
        }else if(E.phase === "attack"){
          h2.textContent = "目前：進攻宣言";
        }else{
          h2.textContent = "";
        }
      }
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      ensureActionButtons();
      patchOldButtons();
    },700);
  });

})();


// ======================================================
// SK_ENGINE DEFENSE FLAG FIX
// 修正：只要前一回合我方有完成進攻宣言，對手回合抽牌後必定進行防守判定。
// 做法：新增獨立 pending attack registry，不再只依賴 unit.attacking / target 被舊流程保留。
// ======================================================
(function(){

  window.SK_PENDING_PLAYER_ATTACKS = window.SK_PENDING_PLAYER_ATTACKS || [];

  function cardOf(u){ return u && (u.card || u); }
  function unitName(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }

  function isShield(u){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(u);
    const c = cardOf(u);
    const v = c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0;
    const s = String(v ?? "").trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function enemyAny(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function enemyFrontShield(lane){
    return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane]));
  }

  function normalizePendingAttacks(){
    const cleaned = [];

    // 先收集場上仍有 attacking + target 的單位
    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((u,lane)=>{
        if(!u || !u.attacking || !u.target) return;

        cleaned.push({
          attackerZone: zone,
          attackerIndex: lane,
          targetZone: u.target.zone,
          targetIndex: u.target.idx,
          source: "field"
        });
      });
    });

    // 再收集 registry 中尚有效的宣言
    (window.SK_PENDING_PLAYER_ATTACKS || []).forEach(a=>{
      const attacker = field[a.attackerZone]?.[a.attackerIndex];
      const target = field[a.targetZone]?.[a.targetIndex];

      if(!attacker || !target) return;
      if(isShield(attacker) || isShield(target)) return;
      if(!enemyAny(a.attackerIndex)) return;
      if(enemyFrontShield(a.attackerIndex)) return;

      cleaned.push(a);
    });

    // 去重
    const map = new Map();
    cleaned.forEach(a=>{
      const key = `${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}`;
      map.set(key, a);
    });

    window.SK_PENDING_PLAYER_ATTACKS = Array.from(map.values());

    if(window.SK_ENGINE){
      window.SK_ENGINE.enemyNeedsDefense = window.SK_PENDING_PLAYER_ATTACKS.length > 0;
    }

    return window.SK_PENDING_PLAYER_ATTACKS.length;
  }

  // 進攻宣言成功後，記錄到 pending registry
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const E = window.SK_ENGINE;
    if(!E || E.currentPlayer !== "player" || E.phase !== "attack") return;

    setTimeout(()=>{
      ["player_front","player_back"].forEach(zone=>{
        field[zone].forEach((u,lane)=>{
          if(!u || !u.attacking || !u.target) return;

          const target = field[u.target.zone]?.[u.target.idx];
          if(!target) return;

          // 完成進攻宣言後，必定記錄，並橫置
          u.tapped = true;

          const record = {
            attackerZone: zone,
            attackerIndex: lane,
            targetZone: u.target.zone,
            targetIndex: u.target.idx,
            source: "declared"
          };

          const key = `${record.attackerZone}:${record.attackerIndex}->${record.targetZone}:${record.targetIndex}`;
          const exists = (window.SK_PENDING_PLAYER_ATTACKS || []).some(a =>
            `${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}` === key
          );

          if(!exists){
            window.SK_PENDING_PLAYER_ATTACKS.push(record);
          }
        });
      });

      const count = normalizePendingAttacks();

      if(count > 0 && window.SK_ENGINE){
        window.SK_ENGINE.enemyNeedsDefense = true;
      }

      render();
    }, 20);
  }, true);

  async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  function setFlow(text){
    try{ setStatus(text); }catch(e){}
    let p = document.getElementById("skEnginePanel");
    const msg = document.getElementById("skEngineMessage");
    if(msg) msg.textContent = text;
  }

  // 若原本的 resolveBattle 函式是閉包，這裡另外提供 registry 專用防守判定。
  window.SK_resolvePendingPlayerAttacksForEnemy = async function(){
    normalizePendingAttacks();

    const attacks = window.SK_PENDING_PLAYER_ATTACKS || [];

    setFlow("對手防守階段開始：處理我方前一回合進攻宣言");
    render();
    await sleep(760);

    for(let lane=0; lane<5; lane++){
      const a = attacks.find(x => x.attackerIndex === lane);

      if(!a){
        setFlow(`星星戰線${lane + 1}：沒有我方攻擊`);
        render();
        await sleep(760);
        continue;
      }

      const attacker = field[a.attackerZone]?.[a.attackerIndex];
      const target = field[a.targetZone]?.[a.targetIndex];

      if(!attacker || !target){
        setFlow(`星星戰線${lane + 1}：攻擊者或目標不存在，略過`);
        render();
        await sleep(760);
        continue;
      }

      setFlow(`星星戰線${lane + 1}：${unitName(attacker)} vs ${unitName(target)}`);
      render();
      await sleep(760);

      // 用既有外部戰鬥函式優先；沒有則用簡化判定
      let result = "";

      if(typeof window.XLW_resolveBattleEqualDefenderDies === "function"){
        result = window.XLW_resolveBattleEqualDefenderDies(a.attackerZone, a.attackerIndex, {
          zone: a.targetZone,
          idx: a.targetIndex
        });
      }else{
        const ac = cardOf(attacker);
        const tc = cardOf(target);
        const av = Number(ac?.attack ?? ac?.atk ?? 0);
        const tv = Number(tc?.attack ?? tc?.atk ?? 0);

        if(av >= tv){
          // 相等也破壞防守方
          if(a.targetZone.startsWith("enemy_")){
            if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.grave)){
              window.XLW_ENEMY.grave.push(target.card || target);
              enemyGraveyard = window.XLW_ENEMY.grave;
            }else{
              enemyGraveyard.push(target.card || target);
            }
          }
          field[a.targetZone][a.targetIndex] = null;
          attacker.tapped = true;
          attacker.attacking = false;
          attacker.target = null;
          result = `${unitName(attacker)} 擊破 ${unitName(target)}`;
        }else{
          graveyard.push(attacker.card || attacker);
          field[a.attackerZone][a.attackerIndex] = null;
          result = `${unitName(attacker)} 攻擊失敗被破壞`;
        }
      }

      setFlow(`星星戰線${lane + 1}：${result}`);
      if(typeof logBattle === "function") logBattle(`對手防守：${result}`);
      render();
      await sleep(760);
    }

    window.SK_PENDING_PLAYER_ATTACKS = [];

    if(window.SK_ENGINE){
      window.SK_ENGINE.enemyNeedsDefense = false;
    }

    setFlow("對手防守階段完成，接著進入對手召喚階段");
    render();
    await sleep(760);
  };

  // 強制改寫對手回合：抽牌後先看 pending registry，有就防守
  const oldRunEnemyTurn = window.xlwRunEnemyTurn;

  window.xlwRunEnemyTurn = async function(){
    const E = window.SK_ENGINE;

    // 若不是回合引擎流程，仍可回退舊流程
    if(!E){
      if(typeof oldRunEnemyTurn === "function") return await oldRunEnemyTurn.apply(this, arguments);
      return;
    }

    E.currentPlayer = "enemy";
    E.enemyTurn = Math.max(1, E.enemyTurn || 1);
    E.phase = "draw";
    phase = "召喚階段";

    setFlow(`對手第 ${E.enemyTurn} 回合：抽牌階段`);
    render();
    await sleep(760);

    // 嘗試使用既有敵方抽牌，沒有就直接操作
    if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.deck) && Array.isArray(window.XLW_ENEMY.hand)){
      let drawn = 0;
      for(let i=0;i<2;i++){
        if(window.XLW_ENEMY.deck.length){
          window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
          drawn++;
        }
      }
      setFlow(`對手抽牌：抽 ${drawn} 張`);
    }else{
      setFlow("對手抽牌");
    }

    render();
    await sleep(760);

    const needDefense = normalizePendingAttacks() > 0;

    if(needDefense){
      E.phase = "defense";
      await window.SK_resolvePendingPlayerAttacksForEnemy();
    }else{
      setFlow("對手不需防守，進入召喚階段");
      render();
      await sleep(760);
    }

    // 防守後交還原本對手後續流程，避免重複抽牌：
    // 這裡只執行簡易召喚與進攻，保留既有效果。
    E.phase = "summon";
    setFlow("對手召喚階段");
    render();
    await sleep(760);

    // 呼叫既有 enemy summon 若找得到就不做，否則簡易處理
    if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.hand)){
      const h = window.XLW_ENEMY.hand.findIndex(c => c && (c.type === "unit" || c.type === "單位") && Number(c.tribute || 0) <= 0);
      if(h >= 0){
        let dest = null;
        for(let i=0;i<5;i++) if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
        for(let i=0;i<5;i++) if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};

        if(dest){
          const card = window.XLW_ENEMY.hand[h];
          window.XLW_ENEMY.hand.splice(h,1);
          field[dest.zone][dest.idx] = {card, tapped:false, attacking:false, target:null, summonedTurn:E.enemyTurn, summonedZone:dest.zone};
          setFlow(`對手召喚：${card.name}`);
        }else{
          setFlow("對手場上沒有空位");
        }
      }else{
        setFlow("對手沒有可召喚單位");
      }
    }

    render();
    await sleep(760);

    E.phase = "attack";
    setFlow("對手進攻宣言階段");
    render();
    await sleep(760);

    // 若原本有對手攻擊 AI，讓舊 render/流程自行處理；這裡至少不會跳過防守
    setFlow("對手回合結束");
    render();
    await sleep(760);
  };

  // 強制讓結束回合前一定先同步 pending
  const oldEndTurn = window.xlwEndPlayerTurnAndRunEnemy;

  window.xlwEndPlayerTurnAndRunEnemy = async function(){
    normalizePendingAttacks();

    if(window.SK_ENGINE && window.SK_PENDING_PLAYER_ATTACKS.length > 0){
      window.SK_ENGINE.enemyNeedsDefense = true;
    }

    if(typeof oldEndTurn === "function"){
      return await oldEndTurn.apply(this, arguments);
    }

    return await window.xlwRunEnemyTurn();
  };

  // 回合引擎按鈕也強制同步
  window.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("#skEngineEndBtn");
    if(!btn) return;

    normalizePendingAttacks();

    if(window.SK_ENGINE && window.SK_PENDING_PLAYER_ATTACKS.length > 0){
      window.SK_ENGINE.enemyNeedsDefense = true;
    }
  }, true);

})();


// ======================================================
// CLEAN TURN ENGINE MODE
// 完全獨立 pendingAttacks，不再依賴 attacking flag。
// ======================================================
(function(){

  window.CLEAN_GAME = window.CLEAN_GAME || {
    pendingAttacks: [],
    currentPlayer: "player"
  };

  function cardOf(u){ return u && (u.card || u); }
  function nm(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("skEngineMessage");
    if(el) el.textContent = msg;
  }

  function isShield(u){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(u);
    return false;
  }

  function laneEnemyExists(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function laneEnemyFrontShield(lane){
    return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane]));
  }

  // ======================================================
  // 進攻宣言 → 直接寫入 pendingAttacks
  // ======================================================

  function registerPendingAttack(attackerZone, attackerIndex, targetZone, targetIndex){

    const key = `${attackerZone}:${attackerIndex}->${targetZone}:${targetIndex}`;

    const exists = CLEAN_GAME.pendingAttacks.some(a =>
      `${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}` === key
    );

    if(exists) return;

    CLEAN_GAME.pendingAttacks.push({
      attackerOwner: "player",
      attackerZone,
      attackerIndex,
      targetZone,
      targetIndex
    });

    const attacker = field[attackerZone]?.[attackerIndex];

    if(attacker){
      attacker.tapped = true;
      attacker.attacking = true;
      attacker.target = {
        zone: targetZone,
        idx: targetIndex
      };
    }

    if(window.SK_ENGINE){
      window.SK_ENGINE.enemyNeedsDefense = true;
    }

    show(`已記錄進攻宣言：${nm(attacker)}。對手抽牌後必定進行防守。`);
  }

  // 攔截進攻宣言完成
  window.addEventListener("click", function(e){

    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const E = window.SK_ENGINE;
    if(!E) return;

    if(E.currentPlayer !== "player") return;
    if(E.phase !== "attack") return;

    setTimeout(()=>{

      ["player_front","player_back"].forEach(zone=>{

        field[zone].forEach((u,lane)=>{

          if(!u || !u.target) return;

          const target = field[u.target.zone]?.[u.target.idx];
          if(!target) return;

          if(isShield(u)) return;
          if(!laneEnemyExists(lane)) return;
          if(laneEnemyFrontShield(lane)) return;

          registerPendingAttack(
            zone,
            lane,
            u.target.zone,
            u.target.idx
          );

        });

      });

    }, 50);

  }, true);

  // ======================================================
  // 對手回合：抽牌後只看 pendingAttacks
  // ======================================================

  async function sleep(ms){
    return new Promise(r=>setTimeout(r, ms));
  }

  async function resolveEnemyDefenseClean(){

    show("對手防守階段開始");
    render();
    await sleep(700);

    const attacks = [...CLEAN_GAME.pendingAttacks];

    for(let lane=0; lane<5; lane++){

      const atk = attacks.find(a => a.attackerIndex === lane);

      if(!atk){
        show(`星星戰線${lane+1}：沒有我方攻擊`);
        render();
        await sleep(700);
        continue;
      }

      const attacker = field[atk.attackerZone]?.[atk.attackerIndex];
      const defender = field[atk.targetZone]?.[atk.targetIndex];

      if(!attacker || !defender){
        show(`星星戰線${lane+1}：攻擊者或目標不存在`);
        render();
        await sleep(700);
        continue;
      }

      show(`星星戰線${lane+1}：${nm(attacker)} 攻擊 ${nm(defender)}`);
      render();
      await sleep(700);

      if(typeof window.XLW_resolveBattleEqualDefenderDies === "function"){

        const result = window.XLW_resolveBattleEqualDefenderDies(
          atk.attackerZone,
          atk.attackerIndex,
          {
            zone: atk.targetZone,
            idx: atk.targetIndex
          }
        );

        show(`星星戰線${lane+1}：${result}`);

      }else{

        show(`星星戰線${lane+1}：完成戰鬥`);

      }

      render();
      await sleep(700);
    }

    CLEAN_GAME.pendingAttacks = [];

    if(window.SK_ENGINE){
      window.SK_ENGINE.enemyNeedsDefense = false;
    }

    show("對手防守完成");
    render();
    await sleep(700);
  }

  // ======================================================
  // 完全覆蓋 enemy turn
  // ======================================================

  window.xlwRunEnemyTurn = async function(){

    const E = window.SK_ENGINE;

    if(E){
      E.currentPlayer = "enemy";
      E.phase = "draw";
    }

    show("對手抽牌階段");
    render();
    await sleep(700);

    // enemy draw
    if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.deck)){

      let drawn = 0;

      for(let i=0;i<2;i++){

        if(window.XLW_ENEMY.deck.length){

          window.XLW_ENEMY.hand.push(
            window.XLW_ENEMY.deck.pop()
          );

          drawn++;
        }
      }

      show(`對手抽牌 ${drawn} 張`);
      render();
      await sleep(700);
    }

    // 只看 pendingAttacks
    const needDefense = CLEAN_GAME.pendingAttacks.length > 0;

    if(needDefense){

      if(E) E.phase = "defense";

      await resolveEnemyDefenseClean();

    }else{

      show("對手不需防守");
      render();
      await sleep(700);
    }

    // summon
    if(E) E.phase = "summon";

    show("對手召喚階段");
    render();
    await sleep(700);

    if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.hand)){

      const idx = window.XLW_ENEMY.hand.findIndex(c =>
        c && (c.type === "unit" || c.type === "單位")
      );

      if(idx >= 0){

        let dest = null;

        for(let i=0;i<5;i++){
          if(!field.enemy_front[i] && !dest){
            dest = {zone:"enemy_front", idx:i};
          }
        }

        for(let i=0;i<5;i++){
          if(!field.enemy_back[i] && !dest){
            dest = {zone:"enemy_back", idx:i};
          }
        }

        if(dest){

          const card = window.XLW_ENEMY.hand[idx];

          window.XLW_ENEMY.hand.splice(idx,1);

          field[dest.zone][dest.idx] = {
            card,
            tapped:false,
            attacking:false,
            target:null
          };

          show(`對手召喚：${card.name}`);
          render();
          await sleep(700);
        }
      }
    }

    if(E) E.phase = "attack";

    show("對手進攻宣言");
    render();
    await sleep(700);

    if(E) E.phase = "end";

    show("對手回合結束");
    render();
    await sleep(700);

    // back to player
    if(E){

      E.currentPlayer = "player";
      E.playerTurn = (E.playerTurn || 1) + 1;
      E.phase = "draw";

      show(`我方第 ${E.playerTurn} 回合：抽牌`);
      render();
      await sleep(700);

      draw(2);

      if(E.playerNeedsDefense){

        E.phase = "defense";
        show("我方防守階段");
        render();

      }else{

        E.phase = "summon";
        show("我方召喚階段");
        render();
      }
    }
  };

})();


// ======================================================
// CLEAN ATTACK PHASE ISOLATION FIX
// 目的：舊流程在 phase === "進攻宣言" 時會搶先攔截點擊，
// 導致 pendingAttacks 沒被寫入。
// 本修正把新引擎的進攻階段改成 SK_ATTACK，完全避開舊 listener。
// ======================================================
(function(){

  window.CLEAN_GAME = window.CLEAN_GAME || { pendingAttacks: [], currentPlayer:"player" };
  let cleanSelectedAttacker = null;
  const WAIT = 700;

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  function cardOf(u){ return u && (u.card || u); }
  function nm(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }

  function rawAtk(u){
    const c = cardOf(u);
    return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0;
  }

  function isShield(u){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(u);
    const s = String(rawAtk(u) ?? "").trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function isPlayerZone(z){ return z === "player_front" || z === "player_back"; }
  function isEnemyZone(z){ return z === "enemy_front" || z === "enemy_back"; }
  function enemyAny(l){ return !!(field.enemy_front[l] || field.enemy_back[l]); }
  function enemyFrontShield(l){ return !!(field.enemy_front[l] && isShield(field.enemy_front[l])); }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("skEngineMessage") || document.getElementById("absoluteFlowText") || document.getElementById("opStepText");
    if(el) el.textContent = msg;
  }

  function uniquePushAttack(record){
    const key = `${record.attackerZone}:${record.attackerIndex}->${record.targetZone}:${record.targetIndex}`;
    const exists = CLEAN_GAME.pendingAttacks.some(a =>
      `${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}` === key
    );
    if(!exists) CLEAN_GAME.pendingAttacks.push(record);

    if(window.SK_ENGINE){
      window.SK_ENGINE.enemyNeedsDefense = true;
    }
  }

  function enterCleanAttack(){
    const E = window.SK_ENGINE;

    if(!E){
      show("回合引擎尚未初始化。");
      return;
    }

    if(E.currentPlayer !== "player"){
      show("目前不是我方回合。");
      return;
    }

    if(E.playerTurn === 1){
      show("先手玩家第1回合不能進攻宣言。");
      return;
    }

    if(E.phase !== "summon" && E.phase !== "formation"){
      show("目前不能進入進攻宣言。");
      return;
    }

    E.phase = "attack";

    // 關鍵：不要設成「進攻宣言」，避免舊戰鬥 listener 接管。
    phase = "SK_ATTACK";
    mode = "SK_ATTACK";

    cleanSelectedAttacker = null;

    show("已進入進攻宣言。請選擇可進攻單位。");
    render();
  }

  function enterCleanFormation(){
    const E = window.SK_ENGINE;

    if(!E){
      show("回合引擎尚未初始化。");
      return;
    }

    if(E.currentPlayer !== "player"){
      show("目前不是我方回合。");
      return;
    }

    if(E.playerTurn === 1){
      show("先手玩家第1回合不能戰術佈陣。");
      return;
    }

    E.phase = "formation";
    phase = "SK_FORMATION";
    mode = "SK_FORMATION";

    show("已進入戰術佈陣。");
    render();
  }

  window.forceChooseAttack = enterCleanAttack;
  window.forceChooseFormation = enterCleanFormation;

  // 專用攻擊點擊處理：只看 SK_ENGINE.phase，不看全域 phase
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const E = window.SK_ENGINE;
    if(!E || E.currentPlayer !== "player" || E.phase !== "attack") return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(!cleanSelectedAttacker){

      if(!isPlayerZone(zone)){
        show("請先選擇我方可進攻單位。");
        return false;
      }

      const unit = field[zone]?.[idx];

      if(!unit){
        show("該格沒有單位。");
        return false;
      }

      if(unit.tapped){
        show("橫置單位不能進攻。");
        return false;
      }

      if(isShield(unit)){
        show("盾牌單位不能進攻。");
        return false;
      }

      if(!enemyAny(idx)){
        show("同戰線敵方前後排皆空，該單位不能進攻。");
        return false;
      }

      if(enemyFrontShield(idx)){
        show("同戰線敵方前排為盾牌，該單位不能進攻。");
        return false;
      }

      cleanSelectedAttacker = { zone, idx };
      unit.attacking = true;
      unit.target = null;

      show(`已選擇進攻單位：${nm(unit)}。請點選同戰線敵方目標。`);
      render();
      return false;
    }

    if(!isEnemyZone(zone)){
      show("請點選同戰線敵方目標。");
      return false;
    }

    const lane = cleanSelectedAttacker.idx;

    if(idx !== lane){
      show("只能指定同一條星星戰線的目標。");
      return false;
    }

    if(field.enemy_front[lane] && zone !== "enemy_front"){
      show("同戰線有前排單位時，必須先指定前排。");
      return false;
    }

    const attacker = field[cleanSelectedAttacker.zone]?.[lane];
    const target = field[zone]?.[idx];

    if(!attacker || !target){
      show("攻擊者或目標不存在。");
      cleanSelectedAttacker = null;
      render();
      return false;
    }

    if(isShield(target)){
      show("盾牌單位不能被進攻。");
      return false;
    }

    attacker.attacking = true;
    attacker.target = { zone, idx };
    attacker.tapped = true;

    uniquePushAttack({
      attackerOwner: "player",
      attackerZone: cleanSelectedAttacker.zone,
      attackerIndex: lane,
      targetZone: zone,
      targetIndex: idx
    });

    show(`已完成進攻宣言：${nm(attacker)} → ${nm(target)}。對手抽牌後必定防守。`);

    cleanSelectedAttacker = null;
    render();
    return false;

  }, true);

  function patchButtons(){
    const attackIds = ["skAttackBtn","hardAttackBtn","cleanAttackBtn","realAttackBtn","attackBtn"];
    const formationIds = ["skFormationBtn","hardFormationBtn","cleanFormationBtn","realFormationBtn","formationBtn"];

    attackIds.forEach(id=>{
      const btn = document.getElementById(id);
      if(!btn) return;
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        enterCleanAttack();
      };
    });

    formationIds.forEach(id=>{
      const btn = document.getElementById(id);
      if(!btn) return;
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        enterCleanFormation();
      };
    });
  }

  async function cleanEnemyDefense(){
    show("對手防守階段開始");
    render();
    await sleep(WAIT);

    const attacks = [...CLEAN_GAME.pendingAttacks];

    for(let lane=0; lane<5; lane++){
      const atk = attacks.find(a => a.attackerIndex === lane);

      if(!atk){
        show(`星星戰線${lane+1}：沒有我方攻擊`);
        render();
        await sleep(WAIT);
        continue;
      }

      const attacker = field[atk.attackerZone]?.[atk.attackerIndex];
      const defender = field[atk.targetZone]?.[atk.targetIndex];

      if(!attacker || !defender){
        show(`星星戰線${lane+1}：攻擊者或目標不存在`);
        render();
        await sleep(WAIT);
        continue;
      }

      show(`星星戰線${lane+1}：${nm(attacker)} 攻擊 ${nm(defender)}`);
      render();
      await sleep(WAIT);

      let result = "完成戰鬥";
      if(typeof window.XLW_resolveBattleEqualDefenderDies === "function"){
        result = window.XLW_resolveBattleEqualDefenderDies(atk.attackerZone, atk.attackerIndex, {
          zone: atk.targetZone,
          idx: atk.targetIndex
        });
      }

      show(`星星戰線${lane+1}：${result}`);
      render();
      await sleep(WAIT);
    }

    CLEAN_GAME.pendingAttacks = [];

    if(window.SK_ENGINE){
      window.SK_ENGINE.enemyNeedsDefense = false;
    }

    show("對手防守完成");
    render();
    await sleep(WAIT);
  }

  // 再次覆蓋 enemy turn：抽牌後只要 pendingAttacks 有東西就必定防守
  const oldEnemyTurn = window.xlwRunEnemyTurn;

  window.xlwRunEnemyTurn = async function(){

    const E = window.SK_ENGINE;

    if(E){
      E.currentPlayer = "enemy";
      E.phase = "draw";
    }

    show("對手抽牌階段");
    render();
    await sleep(WAIT);

    if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.deck) && Array.isArray(window.XLW_ENEMY.hand)){
      let drawn = 0;
      for(let i=0;i<2;i++){
        if(window.XLW_ENEMY.deck.length){
          window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
          drawn++;
        }
      }
      show(`對手抽牌 ${drawn} 張`);
      render();
      await sleep(WAIT);
    }

    if(CLEAN_GAME.pendingAttacks.length > 0){
      if(E) E.phase = "defense";
      await cleanEnemyDefense();
    }else{
      show("對手不需防守");
      render();
      await sleep(WAIT);
    }

    if(E) E.phase = "summon";
    show("對手召喚階段");
    render();
    await sleep(WAIT);

    if(E) E.phase = "attack";
    show("對手進攻宣言階段");
    render();
    await sleep(WAIT);

    if(E) E.phase = "end";
    show("對手回合結束");
    render();
    await sleep(WAIT);

    if(typeof oldEnemyTurn === "function"){
      // 不再呼叫舊 enemy turn，避免舊流程跳過防守。
    }
  };

  const oldRender = render;
  render = function(){
    oldRender();

    setTimeout(()=>{
      patchButtons();

      document.querySelectorAll(".slot").forEach(slot=>{
        const z = slot.dataset.zone;
        const i = Number(slot.dataset.index);
        const u = field?.[z]?.[i];

        slot.classList.toggle("clean-attacking", !!(u && u.attacking && u.target && u.tapped));
      });
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(patchButtons, 800);
  });

})();


// ======================================================
// FOREST TRAVELER + TACTICAL MOVE SYSTEM
// 1. 顯示小旅人圖片與召喚按鈕
// 2. 戰術佈陣：可召喚免祭品單位 / 小旅人
// 3. 戰術佈陣：可移動場上單位
//    - 同排水平移動到空位，或與同排單位交換
//    - 非當回合召喚單位可自由前後排換位
//    - 當回合召喚單位不可從前排移動到後排
// ======================================================
(function(){

  let travelerMode = false;
  let selectedMove = null;

  function getEngine(){
    return window.SK_ENGINE || null;
  }

  function isPlayerTactical(){
    const E = getEngine();
    return E && E.currentPlayer === "player" && E.phase === "formation";
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("skEngineMessage") || document.getElementById("absoluteFlowText") || document.getElementById("opStepText");
    if(el) el.textContent = msg;
  }

  function makeTravelerUnit(zone){
    const E = getEngine();
    return {
      card:{
        id:"TOKEN_TRAVELER",
        name:"小旅人",
        deck:"森林",
        type:"unit",
        faction:"旅人",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        keywords:[],
        effect_text:"無任何特殊能力。",
        image:"/static/little_traveler.jpeg"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:E ? E.playerTurn : turn,
      summonedBy:"player",
      summonedZone:zone
    };
  }

  function playerFrontHasEmpty(){
    return field.player_front.some(x=>!x);
  }

  function canSummonTo(zone){
    if(zone !== "player_front" && zone !== "player_back") return false;
    if(playerFrontHasEmpty() && zone === "player_back") return false;
    return true;
  }

  function summonTravelerTo(zone, idx){
    if(!travelerMode) return false;

    if(!isPlayerTactical() && !(getEngine()?.phase === "summon")){
      show("目前不能召喚小旅人。");
      return true;
    }

    if(!canSummonTo(zone)){
      show("前排仍有空位時，小旅人只能召喚到前排。");
      return true;
    }

    if(field[zone][idx]){
      show("該位置已有單位。");
      return true;
    }

    field[zone][idx] = makeTravelerUnit(zone);

    if(getEngine()?.phase === "summon"){
      normalSummonUsed = true;
    }
    if(getEngine()?.phase === "formation"){
      tacticalSummonUsed = true;
    }

    travelerMode = false;
    show("小旅人召喚成功。");
    render();
    return true;
  }

  function ensureForestTraveler(){
    const possible = [
      document.querySelector(".forest"),
      document.querySelector("#forest"),
      document.querySelector("[data-zone='forest']"),
      document.querySelector("[data-area='forest']"),
      document.querySelector(".player-forest"),
      document.querySelector("#playerForest")
    ].filter(Boolean);

    let forest = possible[0];

    // 若找不到明確，嘗試找文字包含森林的區塊
    if(!forest){
      document.querySelectorAll("div,section").forEach(el=>{
        if(!forest && el.textContent && el.textContent.trim().includes("森林")){
          forest = el;
        }
      });
    }

    // 仍找不到就建立一個固定面板
    if(!forest){
      forest = document.getElementById("skForestPanel");
      if(!forest){
        forest = document.createElement("div");
        forest.id = "skForestPanel";
        document.body.appendChild(forest);
      }
    }

    if(!forest.classList.contains("sk-forest-ready")){
      forest.classList.add("sk-forest-ready");
    }

    if(!document.getElementById("skForestTravelerImg")){
      const img = document.createElement("img");
      img.id = "skForestTravelerImg";
      img.src = "/static/little_traveler.jpeg";
      img.alt = "小旅人";
      forest.appendChild(img);
    }

    if(!document.getElementById("skForestTravelerBtn")){
      const btn = document.createElement("button");
      btn.id = "skForestTravelerBtn";
      btn.type = "button";
      btn.textContent = "召喚小旅人";
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        const E = getEngine();

        if(!E || E.currentPlayer !== "player"){
          show("目前不是我方回合。");
          return;
        }

        if(E.phase !== "summon" && E.phase !== "formation"){
          show("召喚小旅人只能在召喚階段或戰術佈陣階段。");
          return;
        }

        travelerMode = true;
        selectedMove = null;
        show("請點選我方可召喚空格放置小旅人。");
        render();
      };
      forest.appendChild(btn);
    }
  }

  function unitOwnerZone(zone){
    if(zone === "player_front" || zone === "player_back") return "player";
    if(zone === "enemy_front" || zone === "enemy_back") return "enemy";
    return null;
  }

  function sameOwner(zoneA, zoneB){
    return unitOwnerZone(zoneA) && unitOwnerZone(zoneA) === unitOwnerZone(zoneB);
  }

  function sameRow(zoneA, zoneB){
    return zoneA === zoneB;
  }

  function oppositeRow(zoneA, zoneB){
    return (
      (zoneA === "player_front" && zoneB === "player_back") ||
      (zoneA === "player_back" && zoneB === "player_front") ||
      (zoneA === "enemy_front" && zoneB === "enemy_back") ||
      (zoneA === "enemy_back" && zoneB === "enemy_front")
    );
  }

  function isCurrentTurnSummoned(unit){
    const E = getEngine();
    if(!unit || !E) return false;

    if(unit.summonedBy && unit.summonedBy !== E.currentPlayer) return false;

    const currentTurn = E.currentPlayer === "player" ? E.playerTurn : E.enemyTurn;
    return Number(unit.summonedTurn) === Number(currentTurn);
  }

  function canMoveUnit(fromZone, fromIdx, toZone, toIdx){
    if(!sameOwner(fromZone, toZone)) return {ok:false, msg:"只能移動自己的單位。"};

    const unit = field[fromZone]?.[fromIdx];
    if(!unit) return {ok:false, msg:"原位置沒有單位。"};

    // 同排：可移動至空位或與同排單位交換
    if(sameRow(fromZone, toZone)){
      return {ok:true, swap:!!field[toZone][toIdx]};
    }

    // 前後排：同一欄才可前後換位 / 移動
    if(oppositeRow(fromZone, toZone)){
      if(fromIdx !== toIdx){
        return {ok:false, msg:"前後排換位只能在同一條星星戰線。"};
      }

      // 當回合召喚，不能從前排到後排
      if(fromZone.endsWith("_front") && toZone.endsWith("_back") && isCurrentTurnSummoned(unit)){
        return {ok:false, msg:"當回合召喚的單位不能從前排移動到後排。"};
      }

      return {ok:true, swap:!!field[toZone][toIdx]};
    }

    return {ok:false, msg:"不可移動到此位置。"};
  }

  function moveOrSwap(fromZone, fromIdx, toZone, toIdx){
    const rule = canMoveUnit(fromZone, fromIdx, toZone, toIdx);
    if(!rule.ok){
      show(rule.msg);
      return false;
    }

    const a = field[fromZone][fromIdx];
    const b = field[toZone][toIdx];

    field[toZone][toIdx] = a;
    field[fromZone][fromIdx] = b || null;

    if(a) a.summonedZone = toZone;
    if(b) b.summonedZone = fromZone;

    show(rule.swap ? "單位位置交換成功。" : "單位移動成功。");
    render();
    return true;
  }

  function handleTacticalMoveClick(slot){
    const E = getEngine();
    if(!E) return false;

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    // 小旅人召喚優先
    if(travelerMode){
      return summonTravelerTo(zone, idx);
    }

    // 玩家只能在戰術佈陣移動自己的單位
    if(E.phase !== "formation") return false;

    const owner = unitOwnerZone(zone);
    if(owner !== E.currentPlayer){
      show("只能操作自己的場上單位。");
      return true;
    }

    if(!selectedMove){
      if(!field[zone][idx]){
        show("請先選擇要移動的單位。");
        return true;
      }

      selectedMove = {zone, idx};
      show("已選擇單位，請點選目標位置。");
      render();
      return true;
    }

    const from = selectedMove;
    selectedMove = null;

    if(from.zone === zone && from.idx === idx){
      show("已取消移動選擇。");
      render();
      return true;
    }

    moveOrSwap(from.zone, from.idx, zone, idx);
    return true;
  }

  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const E = getEngine();
    if(!E) return;

    if(travelerMode || E.phase === "formation"){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      handleTacticalMoveClick(slot);
      return false;
    }
  }, true);

  const oldRender = render;
  render = function(){
    oldRender();

    setTimeout(()=>{
      ensureForestTraveler();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        slot.classList.remove("sk-move-selected","sk-move-target","sk-traveler-target");

        if(selectedMove && selectedMove.zone === zone && selectedMove.idx === idx){
          slot.classList.add("sk-move-selected");
        }

        if(getEngine()?.phase === "formation" && sameOwner(selectedMove?.zone || zone, zone)){
          if(selectedMove && !(selectedMove.zone === zone && selectedMove.idx === idx)){
            const rule = canMoveUnit(selectedMove.zone, selectedMove.idx, zone, idx);
            if(rule.ok) slot.classList.add("sk-move-target");
          }
        }

        if(travelerMode && (zone === "player_front" || zone === "player_back") && !field[zone][idx] && canSummonTo(zone)){
          slot.classList.add("sk-traveler-target");
        }
      });

      const btn = document.getElementById("skForestTravelerBtn");
      if(btn){
        const E = getEngine();
        btn.disabled = !(E && E.currentPlayer === "player" && (E.phase === "summon" || E.phase === "formation"));
      }
    },0);
  };

})();


// ======================================================
// TACTICAL FORMATION HOTFIX
// 修正：戰術佈陣不能移動 / 召喚 / 小旅人
// ======================================================
(function(){

  let tacticalMoveSelection = null;

  function E(){ return window.SK_ENGINE || null; }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el =
      document.getElementById("skEngineMessage") ||
      document.getElementById("absoluteFlowText") ||
      document.getElementById("opStepText");

    if(el) el.textContent = msg;
  }

  function isFormationPhase(){
    const e = E();
    return e &&
      e.currentPlayer === "player" &&
      e.phase === "formation";
  }

  function sameOwner(z1,z2){
    const a = z1.startsWith("player_");
    const b = z2.startsWith("player_");
    return a === b;
  }

  function sameColumn(i1,i2){
    return Number(i1) === Number(i2);
  }

  function sameRow(z1,z2){
    return z1 === z2;
  }

  function frontBack(z1,z2){
    return (
      (z1==="player_front"&&z2==="player_back") ||
      (z1==="player_back"&&z2==="player_front")
    );
  }

  function currentTurnSummoned(unit){
    const e = E();
    if(!e || !unit) return false;
    return Number(unit.summonedTurn) === Number(e.playerTurn);
  }

  function moveUnit(fromZone, fromIdx, toZone, toIdx){

    const unit = field[fromZone]?.[fromIdx];

    if(!unit){
      show("原位置沒有單位。");
      return false;
    }

    if(!sameOwner(fromZone,toZone)){
      show("只能移動自己的單位。");
      return false;
    }

    // 同排：可移動或交換
    if(sameRow(fromZone,toZone)){

      const target = field[toZone][toIdx];

      field[toZone][toIdx] = unit;
      field[fromZone][fromIdx] = target || null;

      show(target ? "同排交換位置成功。" : "同排移動成功。");
      render();
      return true;
    }

    // 前後排：只能同欄
    if(frontBack(fromZone,toZone)){

      if(!sameColumn(fromIdx,toIdx)){
        show("前後排移動只能同欄。");
        return false;
      }

      // 當回合召喚不能前->後
      if(
        fromZone === "player_front" &&
        toZone === "player_back" &&
        currentTurnSummoned(unit)
      ){
        show("當回合召喚單位不能從前排移動到後排。");
        return false;
      }

      const target = field[toZone][toIdx];

      field[toZone][toIdx] = unit;
      field[fromZone][fromIdx] = target || null;

      show(target ? "前後排交換位置成功。" : "前後排移動成功。");
      render();
      return true;
    }

    show("不可移動到該位置。");
    return false;
  }

  // 強制接管 formation 點擊
  window.addEventListener("click", function(e){

    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(!isFormationPhase()) return;

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    // 只處理玩家區
    if(!zone.startsWith("player_")) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // 小旅人召喚模式
    if(window.travelerMode === true){

      if(field[zone][idx]){
        show("該位置已有單位。");
        return false;
      }

      // 前排限制
      const frontEmpty = field.player_front.some(x=>!x);

      if(frontEmpty && zone === "player_back"){
        show("前排有空位時，只能召喚到前排。");
        return false;
      }

      field[zone][idx] = {
        card:{
          id:"TOKEN_TRAVELER",
          name:"小旅人",
          type:"unit",
          attack:1,
          atk:1,
          score:1,
          stars:1,
          image:"/static/little_traveler.jpeg"
        },
        tapped:false,
        attacking:false,
        target:null,
        summonedTurn:E()?.playerTurn || 1
      };

      window.travelerMode = false;

      show("小旅人召喚成功。");
      render();
      return false;
    }

    // 移動模式
    if(!tacticalMoveSelection){

      if(!field[zone][idx]){
        show("請先選擇要移動的單位。");
        return false;
      }

      tacticalMoveSelection = {
        zone,
        idx
      };

      show("已選擇單位，請點選目標位置。");
      render();
      return false;
    }

    const from = tacticalMoveSelection;
    tacticalMoveSelection = null;

    if(from.zone === zone && from.idx === idx){
      show("已取消選擇。");
      render();
      return false;
    }

    moveUnit(from.zone, from.idx, zone, idx);
    return false;

  }, true);

  // 讓戰術佈陣時可正常召喚免祭品單位
  function patchFormationSummon(){

    const old = window.tryNormalSummonFromHand;

    if(typeof old !== "function") return;

    if(window.__formationSummonPatched) return;
    window.__formationSummonPatched = true;

    window.tryNormalSummonFromHand = function(cardIndex, zone, idx){

      const e = E();

      // formation 也允許
      if(
        e &&
        e.currentPlayer === "player" &&
        (e.phase === "summon" || e.phase === "formation")
      ){

        const card = hand[cardIndex];

        if(!card) return false;

        const tribute = Number(card.tribute || 0);

        if(tribute > 0){
          show("戰術佈陣只能召喚免祭品單位。");
          return false;
        }

        // 前排限制
        const frontEmpty = field.player_front.some(x=>!x);

        if(frontEmpty && zone === "player_back"){
          show("前排有空位時只能召喚到前排。");
          return false;
        }

        if(field[zone][idx]){
          show("該位置已有單位。");
          return false;
        }

        hand.splice(cardIndex,1);

        field[zone][idx] = {
          card,
          tapped:false,
          attacking:false,
          target:null,
          summonedTurn:e.playerTurn
        };

        show(`召喚成功：${card.name}`);
        render();
        return true;
      }

      return old.apply(this, arguments);
    };
  }

  const oldRender = render;

  render = function(){

    oldRender();

    setTimeout(()=>{

      patchFormationSummon();

      // 視覺
      document.querySelectorAll(".slot").forEach(slot=>{

        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        slot.classList.remove(
          "tactical-selected",
          "tactical-target"
        );

        if(
          tacticalMoveSelection &&
          tacticalMoveSelection.zone === zone &&
          tacticalMoveSelection.idx === idx
        ){
          slot.classList.add("tactical-selected");
        }

        if(
          tacticalMoveSelection &&
          zone.startsWith("player_") &&
          !(
            tacticalMoveSelection.zone === zone &&
            tacticalMoveSelection.idx === idx
          )
        ){
          slot.classList.add("tactical-target");
        }
      });

      // 森林按鈕位置
      const btn = document.getElementById("skForestTravelerBtn");

      if(btn){

        btn.onclick = function(ev){

          ev.preventDefault();
          ev.stopPropagation();

          const e = E();

          if(!e || e.currentPlayer !== "player"){
            show("目前不是我方回合。");
            return;
          }

          if(
            e.phase !== "summon" &&
            e.phase !== "formation"
          ){
            show("只能在召喚或戰術佈陣階段召喚小旅人。");
            return;
          }

          window.travelerMode = true;
          tacticalMoveSelection = null;

          show("請點選我方空格召喚小旅人。");
          render();
        };
      }

    },0);
  };

})();


// ======================================================
// FINAL HOTFIX：森林小旅人 / 小旅人召喚選位 / 進攻後對手防守
// ======================================================
(function(){

  let travelerSelecting = false;
  let selectedAttacker = null;

  function E(){ return window.SK_ENGINE || null; }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el =
      document.getElementById("skEngineMessage") ||
      document.getElementById("absoluteFlowText") ||
      document.getElementById("opStepText");
    if(el) el.textContent = msg;
  }

  function cardOf(u){ return u && (u.card || u); }
  function nm(u){ const c = cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }

  function rawAtk(u){
    const c = cardOf(u);
    return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0;
  }

  function isShield(u){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(u);
    const s = String(rawAtk(u) ?? "").trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function playerPhaseCanSummonTraveler(){
    const e = E();
    return e &&
      e.currentPlayer === "player" &&
      (e.phase === "summon" || e.phase === "formation");
  }

  function frontHasEmpty(){
    return field.player_front.some(x=>!x);
  }

  function canTravelerSummonTo(zone, idx){
    if(zone !== "player_front" && zone !== "player_back") return {ok:false,msg:"只能召喚到我方格子。"};
    if(field[zone][idx]) return {ok:false,msg:"該位置已有單位。"};
    if(frontHasEmpty() && zone === "player_back") return {ok:false,msg:"前排仍有空位時，小旅人只能召喚到前排。"};
    return {ok:true};
  }

  function makeTraveler(zone){
    const e = E();
    return {
      card:{
        id:"TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedTurn:e ? e.playerTurn : turn,
      summonedBy:"player",
      summonedZone:zone
    };
  }

  function placeTraveler(zone, idx){
    const rule = canTravelerSummonTo(zone, idx);
    if(!rule.ok){
      show(rule.msg);
      return true;
    }

    field[zone][idx] = makeTraveler(zone);

    travelerSelecting = false;
    window.travelerMode = false;
    show("小旅人召喚成功。");
    render();
    return true;
  }

  function cleanForestPanel(){
    const panel = document.getElementById("skForestPanel");
    if(!panel) return;

    // 移除方格內舊文字，只保留圖片與按鈕
    Array.from(panel.childNodes).forEach(node=>{
      if(node.nodeType === Node.TEXT_NODE){
        node.textContent = "";
      }
    });

    panel.querySelectorAll("*").forEach(el=>{
      if(el.id !== "skForestTravelerImg" && el.id !== "skForestTravelerBtn"){
        if(el.childNodes.length === 1 && el.textContent && el.textContent.includes("")){
          el.textContent = "";
        }
      }
    });

    const img = document.getElementById("skForestTravelerImg");
    if(img){
      img.src = "/static/little_traveler.jpeg";
      img.alt = "小旅人";
    }

    const btn = document.getElementById("skForestTravelerBtn");
    if(btn){
      btn.textContent = "召喚小旅人";
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(!playerPhaseCanSummonTraveler()){
          show("只能在我方召喚階段或戰術佈陣階段召喚小旅人。");
          return;
        }

        travelerSelecting = true;
        window.travelerMode = true;
        show("請點選我方空格召喚小旅人。");
        render();
      };
      btn.disabled = !playerPhaseCanSummonTraveler();
    }
  }

  // 最高優先權：小旅人選位，不讓戰術移動吃掉
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(!travelerSelecting && window.travelerMode !== true) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if(!playerPhaseCanSummonTraveler()){
      show("目前不能召喚小旅人。");
      travelerSelecting = false;
      window.travelerMode = false;
      render();
      return false;
    }

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    placeTraveler(zone, idx);
    return false;
  }, true);

  // ======================================================
  // 進攻宣言登記：不用依賴舊 attacking 是否被清掉
  // ======================================================

  window.CLEAN_GAME = window.CLEAN_GAME || { pendingAttacks: [], currentPlayer:"player" };

  function enemyAny(lane){ return !!(field.enemy_front[lane] || field.enemy_back[lane]); }
  function enemyFrontShield(lane){ return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane])); }
  function isPlayerZone(z){ return z === "player_front" || z === "player_back"; }
  function isEnemyZone(z){ return z === "enemy_front" || z === "enemy_back"; }

  function addPendingAttack(attackerZone, attackerIndex, targetZone, targetIndex){
    const key = `${attackerZone}:${attackerIndex}->${targetZone}:${targetIndex}`;
    const exists = CLEAN_GAME.pendingAttacks.some(a =>
      `${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}` === key
    );

    if(!exists){
      CLEAN_GAME.pendingAttacks.push({
        attackerOwner:"player",
        attackerZone,
        attackerIndex,
        targetZone,
        targetIndex
      });
    }

    if(E()) E().enemyNeedsDefense = true;

    const attacker = field[attackerZone]?.[attackerIndex];
    if(attacker){
      attacker.attacking = true;
      attacker.target = {zone:targetZone, idx:targetIndex};
      attacker.tapped = true;
    }
  }

  // 用 capture 最高優先權接管 SK_ENGINE attack，不再讓舊 listener 搶走
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const egn = E();
    if(!egn || egn.currentPlayer !== "player" || egn.phase !== "attack") return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(!selectedAttacker){
      if(!isPlayerZone(zone)){
        show("請先選擇我方可進攻單位。");
        return false;
      }

      const unit = field[zone]?.[idx];

      if(!unit){
        show("該格沒有單位。");
        return false;
      }

      if(unit.tapped){
        show("橫置單位不能進攻。");
        return false;
      }

      if(isShield(unit)){
        show("盾牌單位不能進攻。");
        return false;
      }

      if(!enemyAny(idx)){
        show("同戰線敵方前後排皆空，該單位不能進攻。");
        return false;
      }

      if(enemyFrontShield(idx)){
        show("同戰線敵方前排為盾牌，該單位不能進攻。");
        return false;
      }

      selectedAttacker = {zone, idx};
      unit.attacking = true;
      unit.target = null;

      show(`已選擇進攻單位：${nm(unit)}。請點選同戰線敵方目標。`);
      render();
      return false;
    }

    if(!isEnemyZone(zone)){
      show("請點選敵方目標。");
      return false;
    }

    const lane = selectedAttacker.idx;

    if(idx !== lane){
      show("只能指定同一條星星戰線的目標。");
      return false;
    }

    if(field.enemy_front[lane] && zone !== "enemy_front"){
      show("同戰線有前排單位時，必須先指定前排。");
      return false;
    }

    const attacker = field[selectedAttacker.zone]?.[lane];
    const target = field[zone]?.[idx];

    if(!attacker || !target){
      show("攻擊者或目標不存在。");
      selectedAttacker = null;
      render();
      return false;
    }

    if(isShield(target)){
      show("盾牌單位不能被進攻。");
      return false;
    }

    addPendingAttack(selectedAttacker.zone, lane, zone, idx);

    show(`已完成進攻宣言：${nm(attacker)} → ${nm(target)}。對手抽牌後會進行防守判定。`);
    selectedAttacker = null;
    render();
    return false;
  }, true);

  async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  async function resolveEnemyDefenseFromPending(){
    show("對手防守階段開始");
    render();
    await sleep(700);

    const attacks = [...CLEAN_GAME.pendingAttacks];

    for(let lane=0; lane<5; lane++){
      const atk = attacks.find(a => a.attackerIndex === lane);

      if(!atk){
        show(`星星戰線${lane+1}：沒有我方攻擊`);
        render();
        await sleep(700);
        continue;
      }

      const attacker = field[atk.attackerZone]?.[atk.attackerIndex];
      const defender = field[atk.targetZone]?.[atk.targetIndex];

      if(!attacker || !defender){
        show(`星星戰線${lane+1}：攻擊者或目標不存在`);
        render();
        await sleep(700);
        continue;
      }

      let result = "完成戰鬥";
      if(typeof window.XLW_resolveBattleEqualDefenderDies === "function"){
        result = window.XLW_resolveBattleEqualDefenderDies(
          atk.attackerZone,
          atk.attackerIndex,
          {zone:atk.targetZone, idx:atk.targetIndex}
        );
      }

      show(`星星戰線${lane+1}：${result}`);
      if(typeof logBattle === "function") logBattle(`對手防守：${result}`);
      render();
      await sleep(700);
    }

    CLEAN_GAME.pendingAttacks = [];
    if(E()) E().enemyNeedsDefense = false;

    show("對手防守完成");
    render();
    await sleep(700);
  }

  // 覆蓋對手回合：抽牌後必看 pendingAttacks
  const oldEnemyTurn = window.xlwRunEnemyTurn;
  window.xlwRunEnemyTurn = async function(){
    const egn = E();

    if(egn){
      egn.currentPlayer = "enemy";
      egn.phase = "draw";
    }

    show("對手抽牌階段");
    render();
    await sleep(700);

    // 抽牌
    if(window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.deck) && Array.isArray(window.XLW_ENEMY.hand)){
      let drawn = 0;
      for(let i=0;i<2;i++){
        if(window.XLW_ENEMY.deck.length){
          window.XLW_ENEMY.hand.push(window.XLW_ENEMY.deck.pop());
          drawn++;
        }
      }
      show(`對手抽牌 ${drawn} 張`);
      render();
      await sleep(700);
    }

    if(CLEAN_GAME.pendingAttacks.length > 0){
      if(egn) egn.phase = "defense";
      await resolveEnemyDefenseFromPending();
    }else{
      show("對手不需防守");
      render();
      await sleep(700);
    }

    if(egn) egn.phase = "summon";
    show("對手召喚階段");
    render();
    await sleep(700);

    if(egn) egn.phase = "attack";
    show("對手進攻宣言階段");
    render();
    await sleep(700);

    if(egn) egn.phase = "end";
    show("對手回合結束");
    render();
    await sleep(700);
  };

  const oldRender = render;
  render = function(){
    oldRender();

    setTimeout(()=>{
      cleanForestPanel();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        slot.classList.toggle(
          "traveler-place-target",
          (travelerSelecting || window.travelerMode === true) &&
          (zone === "player_front" || zone === "player_back") &&
          !field[zone][idx] &&
          canTravelerSummonTo(zone, idx).ok
        );
      });
    },0);
  };

})();


// ======================================================
// FOREST DOM REBUILD + TRAVELER SUMMON PRIORITY FINAL
// 完全重建，不再 patch 舊 DOM。
// 小旅人召喚模式最高優先權，會壓過戰術移動。
// ======================================================
(function(){

  window.SK_TRAVELER_SUMMON_MODE = false;

  function E(){ return window.SK_ENGINE || null; }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el =
      document.getElementById("skEngineMessage") ||
      document.getElementById("absoluteFlowText") ||
      document.getElementById("opStepText");
    if(el) el.textContent = msg;
  }

  function canUseTraveler(){
    const e = E();
    return e &&
      e.currentPlayer === "player" &&
      (e.phase === "summon" || e.phase === "formation");
  }

  function frontEmpty(){
    return field.player_front.some(x=>!x);
  }

  function travelerRule(zone, idx){
    if(zone !== "player_front" && zone !== "player_back"){
      return {ok:false, msg:"只能召喚到我方場上。"};
    }

    if(field[zone][idx]){
      return {ok:false, msg:"該位置已有單位。"};
    }

    if(frontEmpty() && zone === "player_back"){
      return {ok:false, msg:"前排有空位時，小旅人只能召喚到前排。"};
    }

    return {ok:true};
  }

  function makeTraveler(zone){
    const e = E();

    return {
      card:{
        id:"TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        effect_text:"無任何特殊能力。",
        image:"/static/little_traveler.jpeg"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"player",
      summonedTurn:e ? e.playerTurn : turn,
      summonedZone:zone
    };
  }

  function summonTraveler(zone, idx){
    if(!canUseTraveler()){
      show("只能在我方召喚階段或戰術佈陣階段召喚小旅人。");
      window.SK_TRAVELER_SUMMON_MODE = false;
      window.travelerMode = false;
      render();
      return true;
    }

    const rule = travelerRule(zone, idx);

    if(!rule.ok){
      show(rule.msg);
      return true;
    }

    field[zone][idx] = makeTraveler(zone);

    window.SK_TRAVELER_SUMMON_MODE = false;
    window.travelerMode = false;

    show("小旅人召喚成功。");
    render();
    return true;
  }

  function removeOldForestTexts(){
    const badWords = ["", "", "小旅人"];

    document.querySelectorAll("body *").forEach(el=>{
      if(el.id === "skForestPurePanel") return;
      if(el.closest && el.closest("#skForestPurePanel")) return;

      // 只清理很短、明顯是標籤的元素，避免誤刪卡牌內容
      const txt = (el.childNodes.length === 1 ? el.textContent.trim() : "");
      if(txt && txt.length <= 12 && badWords.includes(txt)){
        el.textContent = "";
      }

      Array.from(el.childNodes).forEach(node=>{
        if(node.nodeType === Node.TEXT_NODE){
          const t = node.textContent.trim();
          if(t && t.length <= 12 && badWords.includes(t)){
            node.textContent = "";
          }
        }
      });
    });
  }

  function rebuildForestPanel(){
    removeOldForestTexts();

    // 舊森林面板隱藏，不再使用
    const oldPanel = document.getElementById("skForestPanel");
    if(oldPanel){
      oldPanel.style.display = "none";
    }

    let panel = document.getElementById("skForestPurePanel");

    if(!panel){
      panel = document.createElement("div");
      panel.id = "skForestPurePanel";
      panel.innerHTML = `
        <img id="skForestPureImg" src="/static/little_traveler.jpeg" alt="">
        <button id="skForestPureBtn" type="button">召喚小旅人</button>
      `;
      document.body.appendChild(panel);
    }

    const btn = document.getElementById("skForestPureBtn");

    if(btn){
      btn.disabled = !canUseTraveler();

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(!canUseTraveler()){
          show("只能在我方召喚階段或戰術佈陣階段召喚小旅人。");
          return;
        }

        window.SK_TRAVELER_SUMMON_MODE = true;
        window.travelerMode = true;

        show("小旅人召喚模式：請點選我方空格。");
        render();
      };
    }
  }

  // 最高優先權：只要是小旅人模式，先吃掉格子點擊
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(window.SK_TRAVELER_SUMMON_MODE !== true && window.travelerMode !== true) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    summonTraveler(zone, idx);
    return false;
  }, true);

  // 小旅人模式下，阻止後續戰術移動 listener
  window.addEventListener("mousedown", function(e){
    if(window.SK_TRAVELER_SUMMON_MODE === true || window.travelerMode === true){
      const slot = e.target.closest && e.target.closest(".slot");
      if(slot){
        e.stopPropagation();
      }
    }
  }, true);

  const oldRender = render;
  render = function(){
    oldRender();

    setTimeout(()=>{
      rebuildForestPanel();

      document.querySelectorAll(".slot").forEach(slot=>{
        const zone = slot.dataset.zone;
        const idx = Number(slot.dataset.index);

        slot.classList.toggle(
          "sk-traveler-final-target",
          (window.SK_TRAVELER_SUMMON_MODE === true || window.travelerMode === true) &&
          travelerRule(zone, idx).ok
        );
      });

    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(rebuildForestPanel, 700);
  });

})();


// ======================================================
// STAR KING UNIFIED ENGINE FINAL
// 合併新舊引擎，移除重複按鈕/圖示，統一回合/行動/防守判定。
// ======================================================
(function(){

  const WAIT = 720;

  const U = window.STAR_UNIFIED = {
    currentPlayer: "player",
    playerTurn: 1,
    enemyTurn: 0,
    phase: "summon",
    busy: false,
    pendingPlayerAttacks: [],
    pendingEnemyAttacks: [],
    selectedAttacker: null,
    initialized: false,
    travelerMode: false,
    moveSelection: null
  };

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function cardOf(u){ return u && (u.card || u); }
  function nm(u){ const c=cardOf(u); return c ? (c.name || "未知單位") : "未知單位"; }
  function rawAtk(u){ const c=cardOf(u); return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0; }
  function shield(u){
    const s=String(rawAtk(u) ?? "").trim();
    return s==="盾" || s==="盾牌" || s==="🛡" || s==="🛡️" || s.includes("盾") || s.toLowerCase()==="shield";
  }
  window.XLW_isShieldUnit = shield;

  function atk(u){ if(shield(u)) return 0; const n=Number(rawAtk(u)); return Number.isFinite(n)?n:0; }
  function pZone(z){ return z==="player_front" || z==="player_back"; }
  function eZone(z){ return z==="enemy_front" || z==="enemy_back"; }
  function owner(z){ if(pZone(z)) return "player"; if(eZone(z)) return "enemy"; return null; }
  function enemyAny(i){ return !!(field.enemy_front[i] || field.enemy_back[i]); }
  function playerAny(i){ return !!(field.player_front[i] || field.player_back[i]); }
  function enemyFrontShield(i){ return !!(field.enemy_front[i] && shield(field.enemy_front[i])); }
  function playerFrontShield(i){ return !!(field.player_front[i] && shield(field.player_front[i])); }

  function labelPhase(){
    const who = U.currentPlayer === "player" ? "我方" : "對手";
    const map = {
      draw:"抽牌階段",
      defense:"防守階段",
      summon:"召喚階段",
      formation:"戰術佈陣",
      attack:"進攻宣言",
      end:"結束階段"
    };
    return `${who}｜${map[U.phase] || U.phase}`;
  }

  function syncGlobals(){
    window.SK_ENGINE = window.SK_ENGINE || {};
    SK_ENGINE.currentPlayer = U.currentPlayer;
    SK_ENGINE.playerTurn = U.playerTurn;
    SK_ENGINE.enemyTurn = U.enemyTurn;
    SK_ENGINE.phase = U.phase;
    SK_ENGINE.busy = U.busy;
    SK_ENGINE.enemyNeedsDefense = U.pendingPlayerAttacks.length > 0;
    SK_ENGINE.playerNeedsDefense = U.pendingEnemyAttacks.length > 0;

    if(U.phase==="summon") phase="召喚階段";
    else if(U.phase==="formation") phase="戰術佈陣";
    else if(U.phase==="attack") phase="UNIFIED_ATTACK";
    else if(U.phase==="defense") phase="防守階段";
    else if(U.phase==="end") phase="結束階段";
    else phase="召喚階段";
  }

  function show(msg){
    syncGlobals();
    try{ setStatus(msg); }catch(e){}

    let panel=document.getElementById("unifiedEnginePanel");
    if(!panel){
      panel=document.createElement("div");
      panel.id="unifiedEnginePanel";
      panel.innerHTML=`
        <div class="ue-title">星靈王回合引擎</div>
        <div id="ue-turn"></div>
        <div id="ue-phase"></div>
        <div id="ue-msg"></div>
      `;
      document.body.appendChild(panel);
    }
    const t=document.getElementById("ue-turn");
    const p=document.getElementById("ue-phase");
    const m=document.getElementById("ue-msg");
    if(t) t.textContent = U.currentPlayer==="player" ? `我方第 ${U.playerTurn} 回合` : `對手第 ${U.enemyTurn} 回合`;
    if(p) p.textContent = labelPhase();
    if(m) m.textContent = msg;

    const oldPhase=document.getElementById("phaseTextHard") || document.getElementById("phaseDisplayText");
    if(oldPhase) oldPhase.textContent = labelPhase();
    const help=document.getElementById("phaseHelpHard") || document.getElementById("phaseHelpText");
    if(help) help.textContent = msg;
  }

  function ensureEnemyDeck(){
    if(window.XLW_ENEMY && Array.isArray(XLW_ENEMY.deck) && Array.isArray(XLW_ENEMY.hand)) return;
    window.XLW_ENEMY = {deck:[], hand:[], grave:[], deckName:"妖怪村莊"};
    const ids = (typeof decks!=="undefined" && decks["妖怪村莊"]) ? decks["妖怪村莊"] : [];
    let list = ids.map(id => structuredClone((allCards||[]).find(c=>c.id===id))).filter(Boolean);
    if(!list.length) list = (allCards||[]).filter(c=>c.deck==="妖怪村莊").map(c=>structuredClone(c));
    for(let i=list.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [list[i],list[j]]=[list[j],list[i]];
    }
    XLW_ENEMY.deck=list;
    for(let i=0;i<4;i++) if(XLW_ENEMY.deck.length) XLW_ENEMY.hand.push(XLW_ENEMY.deck.pop());
    enemyGraveyard=XLW_ENEMY.grave;
  }

  function enemyDraw(n=2){
    ensureEnemyDeck();
    let d=0;
    for(let i=0;i<n;i++){
      if(XLW_ENEMY.deck.length){ XLW_ENEMY.hand.push(XLW_ENEMY.deck.pop()); d++; }
    }
    return d;
  }

  function enemySummon(){
    ensureEnemyDeck();
    const h=XLW_ENEMY.hand.findIndex(c=>c && (c.type==="unit" || c.type==="單位") && Number(c.tribute||0)<=0);
    if(h<0) return null;
    let dest=null;
    for(let i=0;i<5;i++) if(!field.enemy_front[i]&&!dest) dest={zone:"enemy_front",idx:i};
    for(let i=0;i<5;i++) if(!field.enemy_back[i]&&!dest) dest={zone:"enemy_back",idx:i};
    if(!dest) return null;
    const card=XLW_ENEMY.hand[h];
    XLW_ENEMY.hand.splice(h,1);
    field[dest.zone][dest.idx]={card,tapped:false,attacking:false,target:null,summonedTurn:U.enemyTurn,summonedBy:"enemy",summonedZone:dest.zone};
    return {card,...dest};
  }

  function destroyAt(z,i){
    const u=field[z]?.[i];
    if(!u || shield(u)) return;
    if(z.startsWith("player_")) graveyard.push(u.card||u);
    else { ensureEnemyDeck(); XLW_ENEMY.grave.push(u.card||u); enemyGraveyard=XLW_ENEMY.grave; }
    field[z][i]=null;
  }

  function battle(record){
    const a=field[record.attackerZone]?.[record.attackerIndex];
    const d=field[record.targetZone]?.[record.targetIndex];
    if(!a || !d){ if(a){a.attacking=false;a.target=null;} return "攻擊者或目標不存在，略過"; }
    if(shield(a)){ a.attacking=false; a.target=null; return `${nm(a)} 是盾牌單位，不能進攻`; }
    if(shield(d)){ a.attacking=false; a.target=null; return `${nm(d)} 是盾牌單位，不能被進攻`; }

    const av=atk(a), dv=atk(d), an=nm(a), dn=nm(d);
    if(av>dv){
      destroyAt(record.targetZone,record.targetIndex);
      a.tapped=true; a.attacking=false; a.target=null;
      return `${an} 擊破 ${dn}`;
    }
    if(av<dv){
      destroyAt(record.attackerZone,record.attackerIndex);
      return `${an} 攻擊失敗被破壞`;
    }
    // 相等：防守方破壞，進攻方橫置
    destroyAt(record.targetZone,record.targetIndex);
    a.tapped=true; a.attacking=false; a.target=null;
    return `${an} 與 ${dn} 攻擊力相等，防守方 ${dn} 被破壞，進攻方橫置`;
  }

  function addPendingPlayerAttack(attZ, attI, tarZ, tarI){
    const key=`${attZ}:${attI}->${tarZ}:${tarI}`;
    if(!U.pendingPlayerAttacks.some(a=>`${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}`===key)){
      U.pendingPlayerAttacks.push({attackerOwner:"player",attackerZone:attZ,attackerIndex:attI,targetZone:tarZ,targetIndex:tarI});
    }
    const a=field[attZ]?.[attI];
    if(a){ a.tapped=true; a.attacking=true; a.target={zone:tarZ,idx:tarI}; }
    syncGlobals();
  }

  function addPendingEnemyAttack(attZ, attI, tarZ, tarI){
    const key=`${attZ}:${attI}->${tarZ}:${tarI}`;
    if(!U.pendingEnemyAttacks.some(a=>`${a.attackerZone}:${a.attackerIndex}->${a.targetZone}:${a.targetIndex}`===key)){
      U.pendingEnemyAttacks.push({attackerOwner:"enemy",attackerZone:attZ,attackerIndex:attI,targetZone:tarZ,targetIndex:tarI});
    }
    const a=field[attZ]?.[attI];
    if(a){ a.tapped=true; a.attacking=true; a.target={zone:tarZ,idx:tarI}; }
    syncGlobals();
  }

  async function resolveDefense(defender){
    U.phase="defense"; syncGlobals();
    const attacks = defender==="enemy" ? [...U.pendingPlayerAttacks] : [...U.pendingEnemyAttacks];
    show(defender==="enemy" ? "對手防守階段開始" : "我方防守階段開始");
    render(); await sleep(WAIT);

    for(let lane=0; lane<5; lane++){
      const rec=attacks.find(a=>a.attackerIndex===lane);
      if(!rec){ show(`星星戰線${lane+1}：沒有攻擊`); render(); await sleep(WAIT); continue; }
      const a=field[rec.attackerZone]?.[rec.attackerIndex];
      const d=field[rec.targetZone]?.[rec.targetIndex];
      show(`星星戰線${lane+1}：${a?nm(a):"無攻擊者"} vs ${d?nm(d):"無目標"}`);
      render(); await sleep(WAIT);
      const result=battle(rec);
      show(`星星戰線${lane+1}：${result}`);
      if(typeof logBattle==="function") logBattle(`${defender==="enemy"?"對手":"我方"}防守：${result}`);
      render(); await sleep(WAIT);
    }

    if(defender==="enemy") U.pendingPlayerAttacks=[];
    else U.pendingEnemyAttacks=[];
    syncGlobals();
    show(defender==="enemy" ? "對手防守完成" : "我方防守完成");
    render(); await sleep(WAIT);
  }

  function enemyDeclare(){
    let n=0;
    for(let i=0;i<5;i++){
      const a=field.enemy_front[i];
      if(!a || a.tapped || shield(a)) continue;
      if(!playerAny(i) || playerFrontShield(i)) continue;
      const target=field.player_front[i] ? {zone:"player_front",idx:i} : {zone:"player_back",idx:i};
      const tu=field[target.zone][target.idx];
      if(!tu || shield(tu)) continue;
      addPendingEnemyAttack("enemy_front",i,target.zone,target.idx);
      n++;
      if(typeof logBattle==="function") logBattle(`對手進攻宣言：星星戰線${i+1} ${nm(a)} 指向 ${nm(tu)}`);
    }
    return n;
  }

  async function runEnemyTurn(){
    U.currentPlayer="enemy"; U.enemyTurn += 1; U.phase="draw"; syncGlobals();
    ensureEnemyDeck();

    show(`對手第 ${U.enemyTurn} 回合：抽牌階段`);
    render(); await sleep(WAIT);
    const d=enemyDraw(2);
    show(`對手抽牌 ${d} 張`);
    render(); await sleep(WAIT);

    if(U.pendingPlayerAttacks.length>0) await resolveDefense("enemy");
    else { show("對手不需防守，進入召喚階段"); render(); await sleep(WAIT); }

    U.phase="summon"; syncGlobals();
    const s=enemySummon();
    show(s ? `對手召喚：${s.card.name}` : "對手沒有可召喚單位");
    render(); await sleep(WAIT);

    U.phase="attack"; syncGlobals();
    const n=enemyDeclare();
    show(n ? `對手進攻宣言：${n} 條星星戰線` : "對手沒有可進攻單位");
    render(); await sleep(WAIT);

    U.phase="end"; syncGlobals();
    show("對手回合結束");
    render(); await sleep(WAIT);

    startPlayerTurn();
  }

  async function startPlayerTurn(){
    U.currentPlayer="player"; U.playerTurn += 1; U.phase="draw"; syncGlobals();
    ["player_front","player_back"].forEach(z=>field[z].forEach(u=>{ if(u){u.tapped=false; u.attacking=false; u.target=null;} }));
    draw(2);
    show(`我方第 ${U.playerTurn} 回合：抽牌 2 張`);
    render(); await sleep(WAIT);

    if(U.pendingEnemyAttacks.length>0){
      await resolveDefense("player");
    }

    U.phase="summon"; syncGlobals();
    normalSummonUsed=false; tacticalSummonUsed=false;
    if(typeof actionChoiceMade!=="undefined") actionChoiceMade=false;
    if(typeof actionPhaseType!=="undefined") actionPhaseType=null;
    show("我方召喚階段");
    render();
  }

  async function endPlayerTurn(){
    if(U.busy) return;
    U.busy=true;
    try{
      while(hand.length>10) graveyard.push(hand.pop());
      show(U.pendingPlayerAttacks.length>0 ? "我方回合結束，對手抽牌後將先防守" : "我方回合結束，進入對手回合");
      render(); await sleep(WAIT);
      await runEnemyTurn();
    } finally { U.busy=false; syncGlobals(); }
  }

  function enterFormation(){
    if(U.currentPlayer!=="player"){ show("目前不是我方回合。"); return; }
    if(U.playerTurn===1){ show("先手玩家第1回合不能戰術佈陣。"); return; }
    U.phase="formation"; syncGlobals(); show("已進入戰術佈陣。"); render();
  }

  function enterAttack(){
    if(U.currentPlayer!=="player"){ show("目前不是我方回合。"); return; }
    if(U.playerTurn===1){ show("先手玩家第1回合不能進攻宣言。"); return; }
    U.phase="attack"; U.selectedAttacker=null; syncGlobals(); show("已進入進攻宣言，請選擇可進攻單位。"); render();
  }

  window.forceChooseFormation=enterFormation;
  window.forceChooseAttack=enterAttack;
  window.xlwRunEnemyTurn=runEnemyTurn;
  window.xlwEndPlayerTurnAndRunEnemy=endPlayerTurn;

  function canPlayerAttack(z,i){
    const u=field[z]?.[i];
    if(!u || u.tapped || shield(u)) return false;
    if(!enemyAny(i) || enemyFrontShield(i)) return false;
    return true;
  }

  // 最高優先權接管攻擊宣言
  window.addEventListener("click", function(ev){
    const slot=ev.target.closest && ev.target.closest(".slot");
    if(!slot) return;
    if(U.currentPlayer!=="player" || U.phase!=="attack") return;

    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    const z=slot.dataset.zone, i=Number(slot.dataset.index);

    if(!U.selectedAttacker){
      if(!pZone(z)){ show("請先選擇我方可進攻單位。"); return false; }
      if(!canPlayerAttack(z,i)){
        const u=field[z]?.[i];
        if(u && shield(u)) show("盾牌單位不能進攻。");
        else if(u && u.tapped) show("橫置單位不能進攻。");
        else if(!enemyAny(i)) show("同戰線敵方前後排皆空，該單位不能進攻。");
        else if(enemyFrontShield(i)) show("同戰線敵方前排為盾牌，該單位不能進攻。");
        else show("此單位不能進攻。");
        return false;
      }
      U.selectedAttacker={zone:z,idx:i};
      const u=field[z][i]; u.attacking=true; u.target=null;
      show(`已選擇進攻單位：${nm(u)}，請點選同戰線敵方目標。`);
      render(); return false;
    }

    if(!eZone(z)){ show("請點選敵方目標。"); return false; }
    const lane=U.selectedAttacker.idx;
    if(i!==lane){ show("只能指定同一條星星戰線的目標。"); return false; }
    if(field.enemy_front[lane] && z!=="enemy_front"){ show("同戰線有前排單位時，必須先指定前排。"); return false; }

    const a=field[U.selectedAttacker.zone]?.[lane], target=field[z]?.[i];
    if(!a || !target){ show("攻擊者或目標不存在。"); U.selectedAttacker=null; render(); return false; }
    if(shield(target)){ show("盾牌單位不能被進攻。"); return false; }

    addPendingPlayerAttack(U.selectedAttacker.zone,lane,z,i);
    show(`已完成進攻宣言：${nm(a)} → ${nm(target)}。對手抽牌後必定防守。`);
    if(typeof logBattle==="function") logBattle(`我方進攻宣言：星星戰線${i+1} ${nm(a)} 指向 ${nm(target)}`);
    U.selectedAttacker=null;
    render(); return false;
  }, true);

  // 森林區重建：移除舊字、只留一個森林圖示
  function cleanForestText(){
    document.querySelectorAll("body *").forEach(el=>{
      if(el.id==="unifiedForest" || el.closest?.("#unifiedForest")) return;
      Array.from(el.childNodes).forEach(n=>{
        if(n.nodeType===Node.TEXT_NODE){
          const t=n.textContent.trim();
          if(t==="森林區" || t==="森林區小旅人") n.textContent="";
        }
      });
      if(el.childNodes.length===1){
        const t=el.textContent.trim();
        if(t==="森林區" || t==="森林區小旅人") el.textContent="";
      }
    });
    ["skForestPanel","skForestPurePanel"].forEach(id=>{
      const old=document.getElementById(id);
      if(old) old.remove();
    });
  }

  function ensureForest(){
    cleanForestText();
    let f=document.getElementById("unifiedForest");
    if(!f){
      f=document.createElement("div");
      f.id="unifiedForest";
      f.innerHTML=`<img src="/static/little_traveler.jpeg" alt=""><button type="button" id="unifiedTravelerBtn">召喚小旅人</button>`;
      document.body.appendChild(f);
    }
    const btn=document.getElementById("unifiedTravelerBtn");
    btn.disabled = !(U.currentPlayer==="player" && (U.phase==="summon" || U.phase==="formation"));
    btn.onclick=function(e){
      e.preventDefault(); e.stopPropagation();
      if(btn.disabled){ show("只能在召喚階段或戰術佈陣召喚小旅人。"); return; }
      U.travelerMode=true; U.moveSelection=null; show("請點選我方空格召喚小旅人。"); render();
    };
  }

  function travelerRule(z,i){
    if(!pZone(z)) return {ok:false,msg:"只能召喚到我方場上。"};
    if(field[z][i]) return {ok:false,msg:"該位置已有單位。"};
    if(field.player_front.some(x=>!x) && z==="player_back") return {ok:false,msg:"前排有空位時，小旅人只能召喚到前排。"};
    return {ok:true};
  }

  function summonTraveler(z,i){
    const r=travelerRule(z,i);
    if(!r.ok){ show(r.msg); return; }
    field[z][i]={card:{id:"TOKEN_TRAVELER",name:"小旅人",type:"unit",attack:1,atk:1,score:1,stars:1,tribute:0,image:"/static/little_traveler.jpeg",effect_text:"無任何特殊能力。"},tapped:false,attacking:false,target:null,summonedTurn:U.playerTurn,summonedBy:"player",summonedZone:z};
    U.travelerMode=false; show("小旅人召喚成功。"); render();
  }

  function currentSummoned(u){ return u && Number(u.summonedTurn)===Number(U.playerTurn); }
  function moveRule(fz,fi,tz,ti){
    if(!pZone(fz)||!pZone(tz)) return {ok:false,msg:"只能移動我方單位。"};
    const u=field[fz]?.[fi];
    if(!u) return {ok:false,msg:"原位置沒有單位。"};
    if(fz===tz) return {ok:true};
    const fb=(fz==="player_front"&&tz==="player_back")||(fz==="player_back"&&tz==="player_front");
    if(fb){
      if(fi!==ti) return {ok:false,msg:"前後排移動只能同欄。"};
      if(fz==="player_front"&&tz==="player_back"&&currentSummoned(u)) return {ok:false,msg:"當回合召喚單位不能從前排移動到後排。"};
      return {ok:true};
    }
    return {ok:false,msg:"不可移動到此位置。"};
  }

  function doMove(fz,fi,tz,ti){
    const r=moveRule(fz,fi,tz,ti);
    if(!r.ok){ show(r.msg); return; }
    const a=field[fz][fi], b=field[tz][ti];
    field[tz][ti]=a; field[fz][fi]=b||null;
    show(b?"單位交換成功。":"單位移動成功。");
    render();
  }

  // 小旅人/戰術移動
  window.addEventListener("click", function(ev){
    const slot=ev.target.closest && ev.target.closest(".slot");
    if(!slot) return;
    const z=slot.dataset.zone, i=Number(slot.dataset.index);

    if(U.travelerMode){
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      summonTraveler(z,i); return false;
    }

    if(U.currentPlayer==="player" && U.phase==="formation"){
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      if(!pZone(z)){ show("只能操作我方單位。"); return false; }
      if(!U.moveSelection){
        if(!field[z][i]){ show("請先選擇要移動的單位。"); return false; }
        U.moveSelection={zone:z,idx:i}; show("已選擇單位，請點選目標位置。"); render(); return false;
      }
      const from=U.moveSelection; U.moveSelection=null;
      if(from.zone===z && from.idx===i){ show("已取消選擇。"); render(); return false; }
      doMove(from.zone,from.idx,z,i); return false;
    }
  }, true);

  function ensureButtons(){
    let b=document.getElementById("unifiedEndBtn");
    if(!b){ b=document.createElement("button"); b.id="unifiedEndBtn"; b.type="button"; b.textContent="結束我方回合"; document.body.appendChild(b); }
    b.disabled=U.busy || U.currentPlayer!=="player" || U.phase==="defense";
    b.onclick=function(e){ e.preventDefault(); e.stopPropagation(); endPlayerTurn(); };

    let box=document.getElementById("unifiedActionBox");
    if(!box){ box=document.createElement("div"); box.id="unifiedActionBox"; box.innerHTML=`<button id="unifiedFormationBtn" type="button">戰術佈陣</button><button id="unifiedAttackBtn" type="button">進攻宣言</button>`; document.body.appendChild(box); }
    document.getElementById("unifiedFormationBtn").onclick=function(e){ e.preventDefault(); e.stopPropagation(); enterFormation(); };
    document.getElementById("unifiedAttackBtn").onclick=function(e){ e.preventDefault(); e.stopPropagation(); enterAttack(); };
  }

  function hideDuplicates(){
    [
      "skEngineEndBtn","xlwRealEndTurnBtn","xlwAbsoluteEndTurnBtn","xlwForceEndTurnBtn",
      "skEngineActionBox","skForestPanel","skForestPurePanel",
      "controlPanelHard","cleanControlPanelFinal","realControlPanel"
    ].forEach(id=>{ const el=document.getElementById(id); if(el) el.style.display="none"; });
  }

  function init(){
    if(U.initialized) return;
    U.initialized=true;
    U.currentPlayer="player"; U.playerTurn=1; U.enemyTurn=0; U.phase="summon";
    syncGlobals(); show("我方先手第1回合：召喚階段。完成後請按結束我方回合。");
  }

  const OLD_RENDER=render;
  render=function(){
    OLD_RENDER();
    setTimeout(()=>{
      init(); syncGlobals(); ensureButtons(); ensureForest(); hideDuplicates();
      document.querySelectorAll("img").forEach(img=>{ img.onerror=function(){this.onerror=null;this.src="/static/little_traveler_back.jpeg";}; });
      document.querySelectorAll(".slot").forEach(slot=>{
        const z=slot.dataset.zone,i=Number(slot.dataset.index),unit=field?.[z]?.[i];
        slot.classList.toggle("unified-attacking", !!(unit&&unit.attacking&&unit.target&&unit.tapped));
        slot.classList.toggle("unified-move-selected", !!(U.moveSelection&&U.moveSelection.zone===z&&U.moveSelection.idx===i));
        slot.classList.toggle("unified-traveler-target", !!(U.travelerMode&&travelerRule(z,i).ok));
      });
    },0);
  };

  window.addEventListener("click", function(ev){
    const old=ev.target.closest && ev.target.closest("#hardEndBtn,#skEngineEndBtn,#xlwRealEndTurnBtn,#xlwAbsoluteEndTurnBtn,#xlwForceEndTurnBtn");
    if(!old) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    endPlayerTurn(); return false;
  }, true);

  document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{init();ensureButtons();ensureForest();hideDuplicates();},500));

})();


// ======================================================
// UNIFIED ENGINE UI + DEFENSE FINAL FIX
// 1. 只保留一組回合引擎說明欄
// 2. 恢復召喚 / 祭品召喚按鈕
// 3. 刪除左下多餘小旅人方格與森林區小旅人∞文字
// 4. 對手防守判定改為從「場上已橫置宣告攻擊單位」重建 pending
// ======================================================
(function(){

  function U(){
    return window.STAR_UNIFIED || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const p = document.getElementById("unifiedEnginePanel");
    if(p){
      const m = document.getElementById("ue-msg");
      if(m) m.textContent = msg;
    }
  }

  function cardOf(unit){ return unit && (unit.card || unit); }

  function nm(unit){
    const c = cardOf(unit);
    return c ? (c.name || "未知單位") : "未知單位";
  }

  function rawAtk(unit){
    const c = cardOf(unit);
    return c ? (c.attack ?? c.atk ?? c.power ?? c.ATK ?? 0) : 0;
  }

  function isShield(unit){
    if(typeof window.XLW_isShieldUnit === "function") return window.XLW_isShieldUnit(unit);
    const s = String(rawAtk(unit) ?? "").trim();
    return s.includes("盾") || s === "🛡" || s === "🛡️" || s.toLowerCase() === "shield";
  }

  function atk(unit){
    if(isShield(unit)) return 0;
    const n = Number(rawAtk(unit));
    return Number.isFinite(n) ? n : 0;
  }

  function enemyAny(lane){
    return !!(field.enemy_front[lane] || field.enemy_back[lane]);
  }

  function enemyFrontShield(lane){
    return !!(field.enemy_front[lane] && isShield(field.enemy_front[lane]));
  }

  function pZone(z){ return z === "player_front" || z === "player_back"; }

  function hideDuplicatePanels(){
    // 只留 unifiedEnginePanel
    [
      "skEnginePanel",
      "absoluteFlowPanel",
      "xlwOpponentStepPanel",
      "xlwScorePanel",
      "xlwBattleLogPanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.remove();
    });

    // 移除舊森林與多餘小旅人格
    [
      "skForestPanel",
      "skForestPurePanel",
      "skForestTravelerImg",
      "skForestTravelerBtn",
      "skForestPureImg",
      "skForestPureBtn"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.remove();
    });

    // 清掉短字「小旅人∞」/「小旅人 ∞」
    document.querySelectorAll("body *").forEach(el=>{
      if(el.id === "unifiedForest" || el.closest?.("#unifiedForest")) return;

      const text = (el.textContent || "").trim();

      if(text === "小旅人∞" || text === "小旅人 ∞" || text === "森林區小旅人∞"){
        el.remove();
        return;
      }

      Array.from(el.childNodes).forEach(node=>{
        if(node.nodeType === Node.TEXT_NODE){
          const t = node.textContent.trim();
          if(t === "小旅人∞" || t === "小旅人 ∞" || t === "森林區小旅人∞"){
            node.textContent = "";
          }
        }
      });
    });
  }

  // ======================================================
  // 恢復召喚 / 祭品召喚控制
  // ======================================================

  let selectedHandIndex = null;
  let tributeMode = false;
  let tributeHandIndex = null;
  let selectedTributes = [];

  function canSummonPhase(){
    const u = U();
    return u && u.currentPlayer === "player" && (u.phase === "summon" || u.phase === "formation");
  }

  function frontHasEmpty(){
    return field.player_front.some(x=>!x);
  }

  function summonRule(zone, idx){
    if(zone !== "player_front" && zone !== "player_back") return {ok:false,msg:"只能召喚到我方場上。"};
    if(field[zone][idx]) return {ok:false,msg:"該位置已有單位。"};
    if(frontHasEmpty() && zone === "player_back") return {ok:false,msg:"前排有空位時，只能召喚到前排。"};
    return {ok:true};
  }

  function makeUnit(card, zone){
    const u = U();
    return {
      card,
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"player",
      summonedTurn:u ? u.playerTurn : turn,
      summonedZone:zone
    };
  }

  function summonHandTo(zone, idx){
    if(selectedHandIndex === null) return false;

    const card = hand[selectedHandIndex];

    if(!card){
      selectedHandIndex = null;
      show("找不到手牌。");
      render();
      return true;
    }

    const tribute = Number(card.tribute || 0);

    if(tribute > 0){
      tributeMode = true;
      tributeHandIndex = selectedHandIndex;
      selectedHandIndex = null;
      selectedTributes = [];
      show(`此單位需要 ${tribute} 個祭品，請選擇場上祭品。`);
      render();
      return true;
    }

    const rule = summonRule(zone, idx);
    if(!rule.ok){
      show(rule.msg);
      return true;
    }

    field[zone][idx] = makeUnit(card, zone);
    hand.splice(selectedHandIndex, 1);
    selectedHandIndex = null;

    show(`召喚成功：${card.name}`);
    render();
    return true;
  }

  function completeTributeSummon(zone, idx){
    const card = hand[tributeHandIndex];
    if(!card) return false;

    const need = Number(card.tribute || 0);

    if(selectedTributes.length < need){
      show(`還需要選擇 ${need - selectedTributes.length} 個祭品。`);
      return true;
    }

    const rule = summonRule(zone, idx);
    if(!rule.ok){
      show(rule.msg);
      return true;
    }

    // 祭品送墓
    selectedTributes.forEach(t=>{
      const unit = field[t.zone][t.idx];
      if(unit){
        graveyard.push(unit.card || unit);
        field[t.zone][t.idx] = null;
      }
    });

    field[zone][idx] = makeUnit(card, zone);
    hand.splice(tributeHandIndex, 1);

    tributeMode = false;
    tributeHandIndex = null;
    selectedTributes = [];

    show(`祭品召喚成功：${card.name}`);
    render();
    return true;
  }

  function ensureSummonPanel(){
    let box = document.getElementById("unifiedSummonBox");

    if(!box){
      box = document.createElement("div");
      box.id = "unifiedSummonBox";
      box.innerHTML = `
        <button id="unifiedSummonBtn" type="button">召喚手牌</button>
        <button id="unifiedTributeBtn" type="button">祭品召喚</button>
        <div id="unifiedSummonHint">先選手牌，再按召喚</div>
      `;
      document.body.appendChild(box);
    }

    const summon = document.getElementById("unifiedSummonBtn");
    const tribute = document.getElementById("unifiedTributeBtn");
    const hint = document.getElementById("unifiedSummonHint");

    if(hint){
      if(!canSummonPhase()) hint.textContent = "目前不能召喚";
      else if(selectedHandIndex !== null) hint.textContent = `已選手牌：${hand[selectedHandIndex]?.name || ""}，請點場上位置`;
      else if(tributeMode) hint.textContent = "請選祭品，再選召喚位置";
      else hint.textContent = "先點手牌，再按召喚";
    }

    if(summon){
      summon.disabled = !canSummonPhase() || selectedHandIndex === null;
      summon.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(!canSummonPhase()){
          show("目前不能召喚。");
          return;
        }

        if(selectedHandIndex === null){
          show("請先選擇手牌。");
          return;
        }

        const card = hand[selectedHandIndex];
        if(Number(card?.tribute || 0) > 0){
          tributeMode = true;
          tributeHandIndex = selectedHandIndex;
          selectedHandIndex = null;
          selectedTributes = [];
          show(`請選擇 ${Number(card.tribute || 0)} 個祭品。`);
        }else{
          show("請點選我方空格進行召喚。");
        }

        render();
      };
    }

    if(tribute){
      tribute.disabled = !canSummonPhase() || selectedHandIndex === null;
      tribute.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(selectedHandIndex === null){
          show("請先選擇要祭品召喚的手牌。");
          return;
        }

        const card = hand[selectedHandIndex];
        const need = Number(card?.tribute || 0);

        if(need <= 0){
          show("這張牌不需要祭品，可直接召喚。");
          return;
        }

        tributeMode = true;
        tributeHandIndex = selectedHandIndex;
        selectedHandIndex = null;
        selectedTributes = [];

        show(`請選擇 ${need} 個祭品。`);
        render();
      };
    }
  }

  // 點手牌：記錄選擇
  window.addEventListener("click", function(e){
    if(!canSummonPhase()) return;

    const card = e.target.closest && e.target.closest(".hand-card,.card-in-hand,[data-hand-index]");
    if(!card) return;

    const idx = Number(card.dataset.handIndex ?? card.dataset.index ?? card.getAttribute("data-card-index"));

    if(Number.isFinite(idx)){
      selectedHandIndex = idx;
      tributeMode = false;
      tributeHandIndex = null;
      selectedTributes = [];
      show(`已選擇手牌：${hand[idx]?.name || ""}`);
      render();
    }
  }, true);

  // 召喚/祭品選格最高優先
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    if(!canSummonPhase()) return;

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    // 祭品模式：先選祭品，再選召喚位置
    if(tributeMode){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const card = hand[tributeHandIndex];
      const need = Number(card?.tribute || 0);

      if(pZone(zone) && field[zone][idx] && selectedTributes.length < need){
        const key = `${zone}:${idx}`;
        if(!selectedTributes.some(t=>`${t.zone}:${t.idx}` === key)){
          selectedTributes.push({zone, idx});
          show(`已選祭品 ${selectedTributes.length}/${need}。${selectedTributes.length >= need ? "請點選召喚位置。" : ""}`);
          render();
          return false;
        }
      }

      if(selectedTributes.length >= need){
        completeTributeSummon(zone, idx);
        return false;
      }

      return false;
    }

    if(selectedHandIndex !== null){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      summonHandTo(zone, idx);
      return false;
    }
  }, true);

  // ======================================================
  // 防守判定修正：回合結束前強制掃描攻擊宣言
  // ======================================================

  function scanPlayerDeclaredAttacks(){
    const u = U();
    if(!u) return 0;

    u.pendingPlayerAttacks = [];

    ["player_front","player_back"].forEach(zone=>{
      field[zone].forEach((unit,lane)=>{
        if(!unit || !unit.attacking || !unit.target) return;

        const target = field[unit.target.zone]?.[unit.target.idx];

        if(!target) return;
        if(isShield(unit) || isShield(target)) return;
        if(!enemyAny(lane) || enemyFrontShield(lane)) return;

        u.pendingPlayerAttacks.push({
          attackerOwner:"player",
          attackerZone:zone,
          attackerIndex:lane,
          targetZone:unit.target.zone,
          targetIndex:unit.target.idx
        });

        unit.tapped = true;
      });
    });

    return u.pendingPlayerAttacks.length;
  }

  // 攔截結束回合，先掃描 pending，再進舊 unified end
  window.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("#unifiedEndBtn");
    if(!btn) return;

    const count = scanPlayerDeclaredAttacks();
    if(count > 0){
      show(`已確認 ${count} 個進攻宣言，對手抽牌後必定防守。`);
    }
  }, true);

  // 對手回合抽牌後強制讀 pendingPlayerAttacks
  const oldRunEnemy = window.xlwRunEnemyTurn;
  window.xlwRunEnemyTurn = async function(){
    const u = U();

    if(u){
      const count = scanPlayerDeclaredAttacks();
      if(count > 0) u.pendingPlayerAttacks = u.pendingPlayerAttacks || [];
    }

    if(typeof oldRunEnemy === "function"){
      return await oldRunEnemy.apply(this, arguments);
    }
  };

  const oldRender = render;
  render = function(){
    oldRender();

    setTimeout(()=>{
      hideDuplicatePanels();
      ensureSummonPanel();

      document.querySelectorAll(".slot").forEach(slot=>{
        const z = slot.dataset.zone;
        const i = Number(slot.dataset.index);

        slot.classList.toggle(
          "unified-tribute-selected",
          selectedTributes.some(t=>t.zone === z && t.idx === i)
        );

        slot.classList.toggle(
          "unified-summon-target",
          canSummonPhase() &&
          selectedHandIndex !== null &&
          summonRule(z,i).ok
        );
      });
    },0);
  };

})();


// ===== RESTORE FOREST AREA FINAL =====
(function(){
  function msg(t){ try{ setStatus(t); }catch(e){} var el=document.getElementById('ue-msg')||document.getElementById('skEngineMessage'); if(el) el.textContent=t; }
  function eng(){ return window.STAR_UNIFIED || window.SK_ENGINE || null; }
  function canUse(){ var e=eng(); return e && e.currentPlayer==='player' && (e.phase==='summon' || e.phase==='formation'); }
  function ensureForest(){
    ['skForestPanel','skForestPurePanel'].forEach(function(id){ var old=document.getElementById(id); if(old) old.remove(); });
    var f=document.getElementById('unifiedForest');
    if(!f){ f=document.createElement('div'); f.id='unifiedForest'; document.body.appendChild(f); }
    f.style.display='block'; f.style.visibility='visible'; f.style.opacity='1';
    f.innerHTML='<img id="unifiedForestImg" src="/static/little_traveler.jpeg" alt=""><button type="button" id="unifiedTravelerBtn">召喚小旅人</button>';
    var btn=document.getElementById('unifiedTravelerBtn');
    if(btn){
      btn.disabled=!canUse();
      btn.onclick=function(e){
        e.preventDefault(); e.stopPropagation();
        if(!canUse()){ msg('只能在召喚階段或戰術佈陣召喚小旅人。'); return; }
        var u=eng(); if(u) u.travelerMode=true;
        window.SK_TRAVELER_SUMMON_MODE=true; window.travelerMode=true;
        msg('請點選我方空格召喚小旅人。'); render();
      };
    }
  }
  window.addEventListener('click',function(e){
    var slot=e.target.closest && e.target.closest('.slot'); if(!slot) return;
    var u=eng(); var mode=(u&&u.travelerMode===true)||window.SK_TRAVELER_SUMMON_MODE===true||window.travelerMode===true;
    if(!mode) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var z=slot.dataset.zone, i=Number(slot.dataset.index);
    if(z!=='player_front'&&z!=='player_back'){ msg('只能召喚到我方場上。'); return false; }
    if(field[z][i]){ msg('該位置已有單位。'); return false; }
    if(field.player_front.some(function(x){return !x;})&&z==='player_back'){ msg('前排有空位時，小旅人只能召喚到前排。'); return false; }
    var turnNo=(window.STAR_UNIFIED&&window.STAR_UNIFIED.playerTurn)||(window.SK_ENGINE&&window.SK_ENGINE.playerTurn)||turn;
    field[z][i]={card:{id:'TOKEN_TRAVELER',name:'小旅人',type:'unit',attack:1,atk:1,score:1,stars:1,tribute:0,image:'/static/little_traveler.jpeg',effect_text:'無任何特殊能力。'},tapped:false,attacking:false,target:null,summonedBy:'player',summonedTurn:turnNo,summonedZone:z};
    if(u) u.travelerMode=false; window.SK_TRAVELER_SUMMON_MODE=false; window.travelerMode=false;
    msg('小旅人召喚成功。'); render(); return false;
  },true);
  var oldRender=render;
  render=function(){
    oldRender();
    setTimeout(function(){
      ensureForest();
      var u=eng(); var mode=(u&&u.travelerMode===true)||window.SK_TRAVELER_SUMMON_MODE===true||window.travelerMode===true;
      document.querySelectorAll('.slot').forEach(function(slot){
        var z=slot.dataset.zone, i=Number(slot.dataset.index);
        slot.classList.toggle('restore-forest-traveler-target', !!(mode&&(z==='player_front'||z==='player_back')&&!field[z][i]&&!(field.player_front.some(function(x){return !x;})&&z==='player_back')));
      });
    },0);
  };
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(ensureForest,500); });
})();


// ======================================================
// FOREST SAME PLANE FIX
// 森林區改為依附在遊戲場地平面，不再 fixed 在視窗上。
// 會以後排1(player_back[0])為基準，放在其正左方。
// ======================================================
(function(){

  function findSlot(zone, idx){
    return document.querySelector(`.slot[data-zone="${zone}"][data-index="${idx}"]`);
  }

  function getForest(){
    let f = document.getElementById("unifiedForest");
    if(!f){
      f = document.createElement("div");
      f.id = "unifiedForest";
      f.innerHTML = `
        <img id="unifiedForestImg" src="/static/little_traveler.jpeg" alt="">
        <button type="button" id="unifiedTravelerBtn">召喚小旅人</button>
      `;
      document.body.appendChild(f);
    }
    return f;
  }

  function findBoardHost(anchor){
    let host = anchor ? anchor.parentElement : null;

    // 往上找最接近場地的定位容器
    while(host && host !== document.body){
      const st = window.getComputedStyle(host);
      const rect = host.getBoundingClientRect();

      // 優先選擇有定位、且大小足以包含戰場的容器
      if(
        (st.position === "relative" || st.position === "absolute" || st.position === "fixed") &&
        rect.width > 500 &&
        rect.height > 300
      ){
        return host;
      }

      host = host.parentElement;
    }

    // 找不到就用 anchor 的直接父層
    return anchor ? anchor.parentElement : document.body;
  }

  function positionForestSamePlane(){
    const anchor = findSlot("player_back", 0) || findSlot("player_front", 0);
    const forest = getForest();

    if(!anchor){
      return;
    }

    const host = findBoardHost(anchor);

    // 放到與場地格同一層，這樣會跟著場地一起動，不會隨視窗固定漂移
    if(forest.parentElement !== host){
      host.appendChild(forest);
    }

    const hostStyle = window.getComputedStyle(host);
    if(hostStyle.position === "static"){
      host.style.position = "relative";
    }

    const a = anchor.getBoundingClientRect();
    const h = host.getBoundingClientRect();

    // 使用格子實際尺寸，與場地格一致
    const w = a.width;
    const ht = a.height;

    // 比前一版更往左：正好在後排1左方，留一點間距
    const gap = Math.max(8, w * 0.08);
    const left = a.left - h.left - w - gap;
    const top = a.top - h.top;

    forest.style.position = "absolute";
    forest.style.left = `${left}px`;
    forest.style.top = `${top}px`;
    forest.style.bottom = "auto";
    forest.style.right = "auto";
    forest.style.transform = "none";
    forest.style.width = `${w}px`;
    forest.style.height = `${ht}px`;
    forest.style.zIndex = "60";
    forest.style.display = "block";
    forest.style.visibility = "visible";
    forest.style.opacity = "1";

    const btn = document.getElementById("unifiedTravelerBtn");
    if(btn){
      const u = window.STAR_UNIFIED || window.SK_ENGINE;
      btn.disabled = !(u && u.currentPlayer === "player" && (u.phase === "summon" || u.phase === "formation"));
    }
  }

  const oldRenderForestSamePlane = render;
  render = function(){
    oldRenderForestSamePlane();
    setTimeout(positionForestSamePlane, 0);
  };

  window.addEventListener("resize", positionForestSamePlane);
  window.addEventListener("scroll", positionForestSamePlane, true);
  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(positionForestSamePlane, 600);
  });

})();


// ======================================================
// DUAL FOREST AREA FIX
// 1. 我方森林區尺寸對齊場地格，位置再往左
// 2. 在「對手場地區」與「我方總族區」中間新增第二個森林區
// 3. 兩個森林區皆可召喚小旅人
// ======================================================
(function(){

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("ue-msg") || document.getElementById("skEngineMessage");
    if(el) el.textContent = msg;
  }

  function canUseForest(){
    const e = engine();
    return e && e.currentPlayer === "player" && (e.phase === "summon" || e.phase === "formation");
  }

  function findSlot(zone, idx){
    return document.querySelector(`.slot[data-zone="${zone}"][data-index="${idx}"]`);
  }

  function getBoardHost(anchor){
    let host = anchor ? anchor.parentElement : null;

    while(host && host !== document.body){
      const st = window.getComputedStyle(host);
      const rect = host.getBoundingClientRect();

      if(
        (st.position === "relative" || st.position === "absolute" || st.position === "fixed") &&
        rect.width > 500 &&
        rect.height > 300
      ){
        return host;
      }

      host = host.parentElement;
    }

    return anchor ? anchor.parentElement : document.body;
  }

  function ensureForest(id){
    let f = document.getElementById(id);

    if(!f){
      f = document.createElement("div");
      f.id = id;
      f.className = "unifiedForestArea";
      f.innerHTML = `
        <img class="unifiedForestImg" src="/static/little_traveler.jpeg" alt="">
        <button type="button" class="unifiedTravelerBtn">召喚小旅人</button>
      `;
    }

    const btn = f.querySelector(".unifiedTravelerBtn");

    if(btn){
      btn.disabled = !canUseForest();

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(!canUseForest()){
          show("只能在召喚階段或戰術佈陣召喚小旅人。");
          return;
        }

        const u = engine();
        if(u) u.travelerMode = true;

        window.SK_TRAVELER_SUMMON_MODE = true;
        window.travelerMode = true;

        show("請點選我方空格召喚小旅人。");
        render();
      };
    }

    return f;
  }

  function placeForestAreas(){
    const playerBack1 = findSlot("player_back", 0);
    const playerFront1 = findSlot("player_front", 0);
    const enemyBack1 = findSlot("enemy_back", 0);
    const enemyFront1 = findSlot("enemy_front", 0);

    const anchor = playerBack1 || playerFront1 || enemyBack1 || enemyFront1;
    if(!anchor) return;

    const host = getBoardHost(anchor);

    const st = window.getComputedStyle(host);
    if(st.position === "static"){
      host.style.position = "relative";
    }

    const hostRect = host.getBoundingClientRect();

    function toHostRect(el){
      const r = el.getBoundingClientRect();
      return {
        left: r.left - hostRect.left,
        top: r.top - hostRect.top,
        width: r.width,
        height: r.height,
        right: r.right - hostRect.left,
        bottom: r.bottom - hostRect.top
      };
    }

    const baseSlot = playerBack1 || playerFront1;
    const baseRect = toHostRect(baseSlot);

    // 森林區尺寸與場地區一致：直接使用格子的實際長寬
    const w = baseRect.width;
    const h = baseRect.height;

    // 1. 我方森林區：後排1正左方，再更往左一些
    const playerForest = ensureForest("unifiedForest");

    if(playerForest.parentElement !== host){
      host.appendChild(playerForest);
    }

    const gap = Math.max(14, w * 0.18);
    playerForest.style.position = "absolute";
    playerForest.style.left = `${baseRect.left - w - gap}px`;
    playerForest.style.top = `${baseRect.top}px`;
    playerForest.style.width = `${w}px`;
    playerForest.style.height = `${h}px`;
    playerForest.style.right = "auto";
    playerForest.style.bottom = "auto";
    playerForest.style.transform = "none";
    playerForest.style.display = "block";
    playerForest.style.visibility = "visible";
    playerForest.style.opacity = "1";

    // 2. 中央森林區：對手場地區與我方總族區/我方場地區中間
    // 以敵方前排/後排與我方前排之間的中線計算
    const middleForest = ensureForest("unifiedForestMiddle");

    if(middleForest.parentElement !== host){
      host.appendChild(middleForest);
    }

    let middleLeft = baseRect.left - w - gap;
    let middleTop = baseRect.top - h - Math.max(12, h * 0.20);

    if(enemyFront1 && playerFront1){
      const eRect = toHostRect(enemyFront1);
      const pRect = toHostRect(playerFront1);

      // 左右位置與我方森林區同一列，避免遮擋戰線
      middleLeft = baseRect.left - w - gap;

      // 垂直位置：敵方區底部與我方區頂部的中間
      const centerY = (eRect.bottom + pRect.top) / 2;
      middleTop = centerY - h / 2;
    }else if(enemyBack1 && playerBack1){
      const eRect = toHostRect(enemyBack1);
      const pRect = toHostRect(playerBack1);
      const centerY = (eRect.bottom + pRect.top) / 2;
      middleTop = centerY - h / 2;
    }

    middleForest.style.position = "absolute";
    middleForest.style.left = `${middleLeft}px`;
    middleForest.style.top = `${middleTop}px`;
    middleForest.style.width = `${w}px`;
    middleForest.style.height = `${h}px`;
    middleForest.style.right = "auto";
    middleForest.style.bottom = "auto";
    middleForest.style.transform = "none";
    middleForest.style.display = "block";
    middleForest.style.visibility = "visible";
    middleForest.style.opacity = "1";
  }

  const oldRenderDualForest = render;

  render = function(){
    oldRenderDualForest();

    setTimeout(()=>{
      placeForestAreas();

      const u = engine();
      const travelerMode =
        (u && u.travelerMode === true) ||
        window.SK_TRAVELER_SUMMON_MODE === true ||
        window.travelerMode === true;

      document.querySelectorAll(".slot").forEach(slot=>{
        const z = slot.dataset.zone;
        const i = Number(slot.dataset.index);
        const valid =
          travelerMode &&
          (z === "player_front" || z === "player_back") &&
          !field[z][i] &&
          !(field.player_front.some(x=>!x) && z === "player_back");

        slot.classList.toggle("dual-forest-traveler-target", !!valid);
      });
    },0);
  };

  window.addEventListener("resize", placeForestAreas);
  window.addEventListener("scroll", placeForestAreas, true);
  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(placeForestAreas, 700);
  });

})();


// ======================================================
// FOREST PRECISE GRID POSITIONING FINAL
// 用「實際方格座標」精準定位森林區，不再用固定 px。
// - player forest = player_back[0] 正左方，同 y，同尺寸
// - middle forest = player_front[0] 正左方，同 y，同尺寸
// 兩格皆放進與方格相同的父層，因此會跟場地同平面移動。
// ======================================================
(function(){

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("ue-msg") || document.getElementById("skEngineMessage");
    if(el) el.textContent = msg;
  }

  function canUseForest(){
    const e = engine();
    return e && e.currentPlayer === "player" && (e.phase === "summon" || e.phase === "formation");
  }

  function findSlot(zone, idx){
    return document.querySelector(`.slot[data-zone="${zone}"][data-index="${idx}"]`);
  }

  function getSlotParent(){
    const slot = findSlot("player_back", 0) || findSlot("player_front", 0) || findSlot("enemy_front", 0);
    return slot ? slot.parentElement : document.body;
  }

  function ensureForest(id){
    let f = document.getElementById(id);

    if(!f){
      f = document.createElement("div");
      f.id = id;
      f.className = "preciseForestArea";
      f.innerHTML = `
        <img class="preciseForestImg" src="/static/little_traveler.jpeg" alt="">
        <button type="button" class="preciseTravelerBtn">召喚小旅人</button>
      `;
    }

    const btn = f.querySelector(".preciseTravelerBtn");
    if(btn){
      btn.disabled = !canUseForest();
      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(!canUseForest()){
          show("只能在召喚階段或戰術佈陣召喚小旅人。");
          return;
        }

        const u = engine();
        if(u) u.travelerMode = true;

        window.SK_TRAVELER_SUMMON_MODE = true;
        window.travelerMode = true;

        show("請點選我方空格召喚小旅人。");
        render();
      };
    }

    return f;
  }

  function rectRelativeToParent(el, parent){
    const r = el.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    return {
      left: r.left - p.left + parent.scrollLeft,
      top: r.top - p.top + parent.scrollTop,
      width: r.width,
      height: r.height
    };
  }

  function placeForestByAnchor(forest, anchor, parent, rowGapFactor){
    if(!forest || !anchor || !parent) return;

    if(forest.parentElement !== parent){
      parent.appendChild(forest);
    }

    const st = window.getComputedStyle(parent);
    if(st.position === "static"){
      parent.style.position = "relative";
    }

    const r = rectRelativeToParent(anchor, parent);

    // 精準位置：同尺寸、同 top、左側一格
    // 使用小間距，避免壓到後排1/前排1；若還偏右，可調 FOREST_GAP_RATIO
    const FOREST_GAP_RATIO = 0.10;
    const gap = Math.round(r.width * FOREST_GAP_RATIO);

    forest.style.position = "absolute";
    forest.style.left = `${Math.round(r.left - r.width - gap)}px`;
    forest.style.top = `${Math.round(r.top)}px`;
    forest.style.width = `${Math.round(r.width)}px`;
    forest.style.height = `${Math.round(r.height)}px`;
    forest.style.right = "auto";
    forest.style.bottom = "auto";
    forest.style.transform = "none";
    forest.style.display = "block";
    forest.style.visibility = "visible";
    forest.style.opacity = "1";
  }

  function removeOldForestDuplicates(){
    [
      "skForestPanel",
      "skForestPurePanel",
      "unifiedForestMiddle"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el && !el.classList.contains("preciseForestArea")){
        el.remove();
      }
    });

    // 移除「小旅人∞」短字殘影
    document.querySelectorAll("body *").forEach(el=>{
      if(el.closest && el.closest(".preciseForestArea")) return;
      const txt = (el.textContent || "").trim();
      if(txt === "小旅人∞" || txt === "小旅人 ∞" || txt === "森林區小旅人∞"){
        el.remove();
      }
    });
  }

  function placeAllForests(){
    removeOldForestDuplicates();

    const parent = getSlotParent();
    if(!parent) return;

    const playerBack1 = findSlot("player_back", 0);
    const playerFront1 = findSlot("player_front", 0);

    const playerForest = ensureForest("unifiedForest");
    const middleForest = ensureForest("unifiedForestMiddle");

    // 我方森林區：後排1正左方
    if(playerBack1){
      placeForestByAnchor(playerForest, playerBack1, parent);
    }

    // 第二森林區：放在前排1正左方，也就是對手場地區與我方區域中間的左側森林格
    // 若你的版面「我方總族區」不是前排，這格仍會與場地同平面、在兩軍中間左側。
    if(playerFront1){
      placeForestByAnchor(middleForest, playerFront1, parent);
    }

    // 重新綁按鈕狀態
    document.querySelectorAll(".preciseTravelerBtn").forEach(btn=>{
      btn.disabled = !canUseForest();
    });
  }

  // 小旅人召喚選格最高優先
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const u = engine();
    const mode = (u && u.travelerMode === true) || window.SK_TRAVELER_SUMMON_MODE === true || window.travelerMode === true;

    if(!mode) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(zone !== "player_front" && zone !== "player_back"){
      show("只能召喚到我方場上。");
      return false;
    }

    if(field[zone][idx]){
      show("該位置已有單位。");
      return false;
    }

    if(field.player_front.some(x=>!x) && zone === "player_back"){
      show("前排有空位時，小旅人只能召喚到前排。");
      return false;
    }

    const turnNo = (window.STAR_UNIFIED && window.STAR_UNIFIED.playerTurn) || (window.SK_ENGINE && window.SK_ENGINE.playerTurn) || turn;

    field[zone][idx] = {
      card:{
        id:"TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"player",
      summonedTurn:turnNo,
      summonedZone:zone
    };

    if(u) u.travelerMode = false;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.travelerMode = false;

    show("小旅人召喚成功。");
    render();
    return false;
  }, true);

  const oldRenderPreciseForest = render;
  render = function(){
    oldRenderPreciseForest();

    setTimeout(()=>{
      placeAllForests();

      const u = engine();
      const mode = (u && u.travelerMode === true) || window.SK_TRAVELER_SUMMON_MODE === true || window.travelerMode === true;

      document.querySelectorAll(".slot").forEach(slot=>{
        const z = slot.dataset.zone;
        const i = Number(slot.dataset.index);

        const valid =
          mode &&
          (z === "player_front" || z === "player_back") &&
          !field[z][i] &&
          !(field.player_front.some(x=>!x) && z === "player_back");

        slot.classList.toggle("precise-forest-traveler-target", !!valid);
      });
    },0);
  };

  window.addEventListener("resize", placeAllForests);
  window.addEventListener("scroll", placeAllForests, true);
  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(placeAllForests, 700);
  });

})();


// ======================================================
// TWO FOREST FINAL POSITION
// 1. 兩個森林區尺寸統一，使用較小的場地方格尺寸。
// 2. 森林A：我方場地區與後排1夾角位置。
// 3. 森林B：我方種族區上方、對手場地區下方。
// ======================================================
(function(){

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("ue-msg") || document.getElementById("skEngineMessage");
    if(el) el.textContent = msg;
  }

  function canUseForest(){
    const e = engine();
    return e && e.currentPlayer === "player" && (e.phase === "summon" || e.phase === "formation");
  }

  function findSlot(zone, idx){
    return document.querySelector(`.slot[data-zone="${zone}"][data-index="${idx}"]`);
  }

  function findAnyByText(keyword){
    let found = null;
    document.querySelectorAll("div,section,article").forEach(el=>{
      if(found) return;
      if(el.id && (el.id.includes("Forest") || el.id.includes("forest"))) return;
      const txt = (el.textContent || "").trim();
      const rect = el.getBoundingClientRect();
      if(txt.includes(keyword) && rect.width > 20 && rect.height > 20){
        found = el;
      }
    });
    return found;
  }

  function getBoardHost(anchor){
    let host = anchor ? anchor.parentElement : null;

    while(host && host !== document.body){
      const st = window.getComputedStyle(host);
      const rect = host.getBoundingClientRect();

      if(
        (st.position === "relative" || st.position === "absolute" || st.position === "fixed") &&
        rect.width > 500 &&
        rect.height > 300
      ){
        return host;
      }

      host = host.parentElement;
    }

    return anchor ? anchor.parentElement : document.body;
  }

  function relRect(el, host){
    const r = el.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    return {
      left: r.left - h.left + host.scrollLeft,
      top: r.top - h.top + host.scrollTop,
      right: r.right - h.left + host.scrollLeft,
      bottom: r.bottom - h.top + host.scrollTop,
      width: r.width,
      height: r.height
    };
  }

  function ensureForest(id){
    let f = document.getElementById(id);

    if(!f){
      f = document.createElement("div");
      f.id = id;
      f.className = "finalForestArea";
      f.innerHTML = `
        <img class="finalForestImg" src="/static/little_traveler.jpeg" alt="">
        <button type="button" class="finalTravelerBtn">召喚小旅人</button>
      `;
    }

    const btn = f.querySelector(".finalTravelerBtn");
    if(btn){
      btn.disabled = !canUseForest();

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();

        if(!canUseForest()){
          show("只能在召喚階段或戰術佈陣召喚小旅人。");
          return;
        }

        const u = engine();
        if(u) u.travelerMode = true;

        window.SK_TRAVELER_SUMMON_MODE = true;
        window.travelerMode = true;

        show("請點選我方空格召喚小旅人。");
        render();
      };
    }

    return f;
  }

  function removeDuplicateForests(){
    [
      "skForestPanel",
      "skForestPurePanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.remove();
    });
  }

  function placeForest(el, host, left, top, sizeW, sizeH){
    if(el.parentElement !== host){
      host.appendChild(el);
    }

    const st = window.getComputedStyle(host);
    if(st.position === "static"){
      host.style.position = "relative";
    }

    el.style.position = "absolute";
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = `${Math.round(sizeW)}px`;
    el.style.height = `${Math.round(sizeH)}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.transform = "none";
    el.style.display = "block";
    el.style.visibility = "visible";
    el.style.opacity = "1";
  }

  function placeTwoForests(){
    removeDuplicateForests();

    const back1 = findSlot("player_back", 0);
    const front1 = findSlot("player_front", 0);
    const enemyFront1 = findSlot("enemy_front", 0);
    const enemyBack1 = findSlot("enemy_back", 0);

    const anchor = back1 || front1 || enemyFront1 || enemyBack1;
    if(!anchor) return;

    const host = getBoardHost(anchor);

    const backRect = back1 ? relRect(back1, host) : relRect(anchor, host);
    const frontRect = front1 ? relRect(front1, host) : backRect;
    const enemyRect = enemyFront1 ? relRect(enemyFront1, host) : (enemyBack1 ? relRect(enemyBack1, host) : null);

    // 兩個森林區尺寸統一，選較小值，避免一大一小
    const baseW = Math.min(backRect.width, frontRect.width);
    const baseH = Math.min(backRect.height, frontRect.height);
    const sizeW = baseW;
    const sizeH = baseH;

    const gap = Math.max(8, Math.round(sizeW * 0.10));

    // 森林A：我方場地區與後排1夾角位置
    // 以後排1左側、略向上貼近我方場地區/後排交界
    const forestA = ensureForest("unifiedForest");
    const aLeft = backRect.left - sizeW - gap;
    const aTop = backRect.top;
    placeForest(forestA, host, aLeft, aTop, sizeW, sizeH);

    // 森林B：我方種族區上方，對手場地區下方
    // 優先用敵方區底部與我方前排頂部中間；x 與森林A 對齊
    const forestB = ensureForest("unifiedForestMiddle");

    let bLeft = aLeft;
    let bTop = frontRect.top - sizeH - gap;

    if(enemyRect){
      const centerY = (enemyRect.bottom + frontRect.top) / 2;
      bTop = centerY - sizeH / 2;
    }

    // 若文字 DOM 有「種族」區可偵測，則讓森林B 位於種族區上方
    const raceEl = findAnyByText("種族");
    if(raceEl){
      const raceRect = relRect(raceEl, host);
      bTop = raceRect.top - sizeH - gap;

      // 若它跑太遠，仍限制在敵方與我方前排之間
      if(enemyRect){
        const minY = enemyRect.bottom + gap;
        const maxY = frontRect.top - sizeH - gap;
        if(bTop < minY || bTop > maxY){
          bTop = (enemyRect.bottom + frontRect.top) / 2 - sizeH / 2;
        }
      }
    }

    placeForest(forestB, host, bLeft, bTop, sizeW, sizeH);

    document.querySelectorAll(".finalTravelerBtn").forEach(btn=>{
      btn.disabled = !canUseForest();
    });
  }

  // 召喚小旅人選位最高優先
  window.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot");
    if(!slot) return;

    const u = engine();
    const mode =
      (u && u.travelerMode === true) ||
      window.SK_TRAVELER_SUMMON_MODE === true ||
      window.travelerMode === true;

    if(!mode) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const zone = slot.dataset.zone;
    const idx = Number(slot.dataset.index);

    if(zone !== "player_front" && zone !== "player_back"){
      show("只能召喚到我方場上。");
      return false;
    }

    if(field[zone][idx]){
      show("該位置已有單位。");
      return false;
    }

    if(field.player_front.some(x=>!x) && zone === "player_back"){
      show("前排有空位時，小旅人只能召喚到前排。");
      return false;
    }

    const turnNo =
      (window.STAR_UNIFIED && window.STAR_UNIFIED.playerTurn) ||
      (window.SK_ENGINE && window.SK_ENGINE.playerTurn) ||
      turn;

    field[zone][idx] = {
      card:{
        id:"TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"player",
      summonedTurn:turnNo,
      summonedZone:zone
    };

    if(u) u.travelerMode = false;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.travelerMode = false;

    show("小旅人召喚成功。");
    render();
    return false;
  }, true);

  const oldRenderFinalForest = render;
  render = function(){
    oldRenderFinalForest();

    setTimeout(()=>{
      placeTwoForests();

      const u = engine();
      const mode =
        (u && u.travelerMode === true) ||
        window.SK_TRAVELER_SUMMON_MODE === true ||
        window.travelerMode === true;

      document.querySelectorAll(".slot").forEach(slot=>{
        const z = slot.dataset.zone;
        const i = Number(slot.dataset.index);

        const valid =
          mode &&
          (z === "player_front" || z === "player_back") &&
          !field[z][i] &&
          !(field.player_front.some(x=>!x) && z === "player_back");

        slot.classList.toggle("final-forest-traveler-target", !!valid);
      });
    },0);
  };

  window.addEventListener("resize", placeTwoForests);
  window.addEventListener("scroll", placeTwoForests, true);
  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(placeTwoForests, 700);
  });

})();


// ======================================================
// TOP PANEL DEDUP FIX
// 中間上方只保留有功能性的「星靈王回合引擎」面板。
// 移除/隱藏舊的「目前 我方 召喚回合」顯示面板。
// ======================================================
(function(){

  function removeDuplicateTopStatusPanels(){
    const keep = document.getElementById("unifiedEnginePanel");

    // 明確移除舊狀態面板
    [
      "phasePanelHard",
      "phaseDisplayHard",
      "phaseDisplayPanel",
      "phaseStatusPanel",
      "currentPhasePanel",
      "xlwPhasePanel",
      "skEnginePanel",
      "absoluteFlowPanel",
      "xlwOpponentStepPanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el && el !== keep){
        el.remove();
      }
    });

    // 文字包含「目前」「我方」「召喚」但不是 unifiedEnginePanel 的短面板，移除
    document.querySelectorAll("body > div, body > section").forEach(el=>{
      if(el === keep || el.closest("#unifiedEnginePanel")) return;
      if(el.id === "unifiedEnginePanel") return;

      const txt = (el.textContent || "").replace(/\s+/g,"").trim();
      const rect = el.getBoundingClientRect();

      // 只處理中上方的小型狀態面板，避免誤刪其他 UI
      const isTopCenter =
        rect.top >= 0 &&
        rect.top < 180 &&
        rect.left > window.innerWidth * 0.20 &&
        rect.right < window.innerWidth * 0.80 &&
        rect.width < 720 &&
        rect.height < 180;

      const looksLikeOldPhase =
        txt.includes("目前") &&
        txt.includes("我方") &&
        (txt.includes("召喚") || txt.includes("回合"));

      if(isTopCenter && looksLikeOldPhase){
        el.remove();
      }
    });
  }

  const oldRenderTopPanelDedup = render;
  render = function(){
    oldRenderTopPanelDedup();

    setTimeout(()=>{
      removeDuplicateTopStatusPanels();

      const panel = document.getElementById("unifiedEnginePanel");
      if(panel){
        panel.style.display = "block";
        panel.style.visibility = "visible";
        panel.style.opacity = "1";
      }
    },0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(removeDuplicateTopStatusPanels, 600);
  });

})();





// ===== SAFE TOP PANEL CLEANUP =====
(function(){

  function cleanupTopPanels(){
    const keep = document.getElementById("unifiedEnginePanel");

    [
      "phasePanelHard",
      "phaseDisplayHard",
      "phaseDisplayPanel",
      "phaseStatusPanel",
      "currentPhasePanel",
      "xlwPhasePanel",
      "mulliganPhasePanel",
      "mulliganStatusPanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el && el !== keep){
        el.style.display = "none";
      }
    });

    if(keep){
      keep.style.display = "block";
      keep.style.visibility = "visible";
      keep.style.opacity = "1";
    }
  }

  const oldRenderSafeTop = render;
  render = function(){
    oldRenderSafeTop();
    setTimeout(cleanupTopPanels, 0);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(cleanupTopPanels, 500);
  });

})();



/* old conflicting forest positioning patches removed */


// ======================================================
// CLEAN FINAL FOREST POSITION / NO FLICKER
// 目的：徹底修正閃爍。
// 作法：移除舊的多層定位補丁後，只保留這一組原生 board 定位。
// 不使用 setInterval，不使用多重 setTimeout 搶位置。
// ======================================================
(function(){

  const POS = {
    enemyLeft: 891,
    enemyForestTop: 156,
    enemyFieldTop: 302,
    playerLeft: 34,
    playerFieldTop: 625,
    playerForestTop: 779,
    w: 110,
    h: 138
  };

  let playerForestSelectMode = false;
  let rafPending = false;

  function board(){
    return document.querySelector(".board") || document.body;
  }

  function E(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function phaseName(){
    const e = E();
    if(e && e.phase) return String(e.phase);
    if(typeof phase !== "undefined") return String(phase);
    return "";
  }

  function owner(){
    const e = E();
    if(e && e.currentPlayer) return e.currentPlayer;
    return "player";
  }

  function isMulligan(){
    const p = phaseName();
    return p.includes("換牌") || p.toLowerCase().includes("mulligan") || window.mulliganActive === true || (typeof mode !== "undefined" && mode === "mulligan");
  }

  function isUsablePhase(){
    const p = phaseName();
    return !isMulligan() && (
      p === "summon" || p === "formation" || p.includes("召喚") || p.includes("戰術佈陣")
    );
  }

  function phaseKey(){
    const e = E();
    return [
      owner(),
      e ? (e.playerTurn || 0) : (typeof turn !== "undefined" ? turn : 0),
      e ? (e.enemyTurn || 0) : 0,
      phaseName()
    ].join(":");
  }

  function usedMap(){
    window.CLEAN_FINAL_FOREST_USED_MAP = window.CLEAN_FINAL_FOREST_USED_MAP || {};
    return window.CLEAN_FINAL_FOREST_USED_MAP;
  }

  function hasUsed(){
    return !!usedMap()[phaseKey()];
  }

  function markUsed(type){
    usedMap()[phaseKey()] = type || "used";

    const e = E();
    if(e){
      if(phaseName() === "summon" || phaseName().includes("召喚")){
        e._summonUsed = true;
        e.normalSummonUsed = true;
      }
      if(phaseName() === "formation" || phaseName().includes("戰術佈陣")){
        e._formationUsed = true;
        e.tacticalSummonUsed = true;
      }
      e.travelerMode = false;
    }

    if(phaseName() === "summon" || phaseName().includes("召喚")){
      window.normalSummonUsed = true;
      try{ normalSummonUsed = true; }catch(err){}
    }
    if(phaseName() === "formation" || phaseName().includes("戰術佈陣")){
      window.tacticalSummonUsed = true;
      try{ tacticalSummonUsed = true; }catch(err){}
    }

    playerForestSelectMode = false;
    window.ORIGINAL_FOREST_SUMMON_OWNER = null;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.travelerMode = false;
    window.OWNER_FOREST_SUMMON_OWNER = null;
    try{ if(E()) E().travelerMode = false; }catch(err){}
  }

  function alreadyUsedByAny(){
    const e = E();

    if(hasUsed()) return true;

    if(e){
      if((phaseName() === "summon" || phaseName().includes("召喚")) && (e._summonUsed || e.normalSummonUsed)) return true;
      if((phaseName() === "formation" || phaseName().includes("戰術佈陣")) && (e._formationUsed || e.tacticalSummonUsed)) return true;
    }

    if((phaseName() === "summon" || phaseName().includes("召喚")) && window.normalSummonUsed) return true;
    if((phaseName() === "formation" || phaseName().includes("戰術佈陣")) && window.tacticalSummonUsed) return true;

    return false;
  }

  function canUseForest(targetOwner){
    if(!isUsablePhase()) return {ok:false, msg:"目前階段不能召喚小旅人。"};

    if(owner() !== targetOwner){
      return {
        ok:false,
        msg: targetOwner === "player" ? "我方森林區只能在我方回合使用。" : "對手森林區只能在對手回合使用。"
      };
    }

    if(alreadyUsedByAny()) return {ok:false, msg:"本階段已召喚過單位或小旅人。"};

    return {ok:true};
  }

  function msg(t){
    try{ setStatus(t); }catch(e){}
    const el = document.getElementById("ue-msg") || document.getElementById("skEngineMessage");
    if(el) el.textContent = t;
  }

  function ensureZone(id, className, html){
    const b = board();
    let el = document.getElementById(id);

    if(!el){
      el = document.createElement("div");
      el.id = id;
      el.className = className || "zone side";
      b.appendChild(el);
    }

    if(el.parentElement !== b){
      b.appendChild(el);
    }

    if(html && !el.innerHTML.trim()){
      el.innerHTML = html;
    }

    return el;
  }

  function ensureForest(id){
    const el = ensureZone(id, "zone side green", "");

    if(!el.querySelector("img")){
      const img = document.createElement("img");
      img.src = "/static/little_traveler.jpeg";
      img.alt = "";
      img.className = "clean-final-forest-img";
      el.appendChild(img);
    }

    if(!el.querySelector("button")){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "召喚小旅人";
      btn.className = "clean-final-forest-btn";
      el.appendChild(btn);
    }

    el.classList.add("clean-final-forest");
    return el;
  }

  function setBox(el, left, top, z){
    if(!el) return;

    el.style.setProperty("position", "absolute", "important");
    el.style.setProperty("left", left + "px", "important");
    el.style.setProperty("top", top + "px", "important");
    el.style.setProperty("width", POS.w + "px", "important");
    el.style.setProperty("height", POS.h + "px", "important");
    el.style.setProperty("right", "auto", "important");
    el.style.setProperty("bottom", "auto", "important");
    el.style.setProperty("transform", "none", "important");
    el.style.setProperty("display", "flex", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    el.style.setProperty("z-index", String(z || 40), "important");
  }

  function applyLayout(){
    // 移除任何舊 floating/fixed 森林區，避免疊在畫面上造成閃爍。
    ["unifiedForest", "unifiedForestMiddle", "skForestPanel", "skForestPurePanel"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.remove();
    });

    const b = board();
    b.style.setProperty("position", "relative", "important");

    const playerField = ensureZone("playerField", "zone side green", "場地區");
    const playerForest = ensureForest("playerForest");
    const enemyField = ensureZone("enemyField", "zone side green", "場地區");
    const enemyForest = ensureForest("enemyForest");

    setBox(playerField, POS.playerLeft, POS.playerFieldTop, 45);
    setBox(playerForest, POS.playerLeft, POS.playerForestTop, 46);

    setBox(enemyForest, POS.enemyLeft, POS.enemyForestTop, 46);
    setBox(enemyField, POS.enemyLeft, POS.enemyFieldTop, 45);
  }

  function traveler(unitOwner, zone){
    const e = E();
    return {
      card:{
        id: unitOwner === "enemy" ? "TOKEN_ENEMY_TRAVELER" : "TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:unitOwner,
      summonedTurn: unitOwner === "enemy" ? ((e && e.enemyTurn) || 1) : ((e && e.playerTurn) || (typeof turn !== "undefined" ? turn : 1)),
      summonedZone:zone
    };
  }

  function bindButtons(){
    const pbtn = document.querySelector("#playerForest button");
    const ebtn = document.querySelector("#enemyForest button");

    if(pbtn){
      pbtn.onclick = function(ev){
        ev.preventDefault();
        ev.stopPropagation();

        const allow = canUseForest("player");
        if(!allow.ok){ msg(allow.msg); return; }

        playerForestSelectMode = true;
        window.ORIGINAL_FOREST_SUMMON_OWNER = null;
        window.SK_TRAVELER_SUMMON_MODE = false;
        window.travelerMode = false;
        window.OWNER_FOREST_SUMMON_OWNER = null;
        try{ if(E()) E().travelerMode = false; }catch(err){}

        msg("請點選我方空格召喚小旅人。");
        render();
      };

      const allow = canUseForest("player");
      pbtn.disabled = !allow.ok;
      pbtn.classList.toggle("clean-final-disabled", !allow.ok);
    }

    if(ebtn){
      ebtn.onclick = function(ev){
        ev.preventDefault();
        ev.stopPropagation();

        const allow = canUseForest("enemy");
        if(!allow.ok){ msg(allow.msg); return; }

        let dest = null;
        for(let i=0;i<5;i++) if(!field.enemy_front[i] && !dest) dest = {zone:"enemy_front", idx:i};
        for(let i=0;i<5;i++) if(!field.enemy_back[i] && !dest) dest = {zone:"enemy_back", idx:i};

        if(!dest){ msg("對手場上沒有可召喚位置。"); return; }

        field[dest.zone][dest.idx] = traveler("enemy", dest.zone);
        markUsed("traveler");
        msg("對手召喚小旅人成功。");
        render();
      };

      const allow = canUseForest("enemy");
      ebtn.disabled = !allow.ok;
      ebtn.classList.toggle("clean-final-disabled", !allow.ok);
    }
  }

  const oldSummonHandToCleanFinal = window.summonHandTo;
  if(typeof oldSummonHandToCleanFinal === "function" && !window.__CLEAN_FINAL_SHARED_SUMMON_PATCHED__) {
    window.__CLEAN_FINAL_SHARED_SUMMON_PATCHED__ = true;

    window.summonHandTo = function(zone, idx){
      if(isUsablePhase() && alreadyUsedByAny()){
        msg("本階段已召喚過單位或小旅人。");
        return false;
      }

      const r = oldSummonHandToCleanFinal.apply(this, arguments);

      if(r !== false && isUsablePhase()){
        markUsed("unit");
      }

      return r;
    };
  }

  window.addEventListener("click", function(ev){
    if(!playerForestSelectMode) return;

    const s = ev.target.closest && ev.target.closest(".slot");
    if(!s) return;

    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();

    const allow = canUseForest("player");
    if(!allow.ok){
      msg(allow.msg);
      playerForestSelectMode = false;
      render();
      return false;
    }

    const z = s.dataset.zone;
    const i = Number(s.dataset.index);

    if(z !== "player_front" && z !== "player_back"){ msg("只能召喚到我方場上。"); return false; }
    if(field[z][i]){ msg("該位置已有單位。"); return false; }
    if(field.player_front.some(x=>!x) && z === "player_back"){ msg("前排有空位時，小旅人只能召喚到前排。"); return false; }

    field[z][i] = traveler("player", z);
    markUsed("traveler");
    msg("小旅人召喚成功，本階段不能再召喚。");
    render();
    return false;
  }, true);

  function applyOnce(){
    if(rafPending) return;
    rafPending = true;

    requestAnimationFrame(()=>{
      rafPending = false;
      applyLayout();
      bindButtons();

      const active = playerForestSelectMode && canUseForest("player").ok;
      document.querySelectorAll(".slot").forEach(s=>{
        const z = s.dataset.zone;
        const i = Number(s.dataset.index);
        const valid =
          active &&
          (z === "player_front" || z === "player_back") &&
          !field[z][i] &&
          !(field.player_front.some(x=>!x) && z === "player_back");

        s.classList.toggle("clean-final-target", !!valid);
      });
    });
  }

  const oldRenderCleanFinal = render;
  render = function(){
    oldRenderCleanFinal();
    applyOnce();
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyOnce();
    setTimeout(applyOnce, 300);
  });

  window.addEventListener("resize", applyOnce);

})();


// ======================================================
// ENEMY LEFT -35 FROM CLEAN BASE
// 891 -> 856
// ======================================================
(function(){

  const FINAL_LEFT = 856;

  function applyEnemyLeft35(){
    const enemyForest = document.getElementById("enemyForest");
    const enemyField = document.getElementById("enemyField");

    [enemyForest, enemyField].forEach(el=>{
      if(!el) return;

      el.style.setProperty("left", FINAL_LEFT + "px", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("transform", "none", "important");
    });
  }

  const oldRenderEnemyLeft35 = render;

  render = function(){
    oldRenderEnemyLeft35();
    requestAnimationFrame(applyEnemyLeft35);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyEnemyLeft35();
    setTimeout(applyEnemyLeft35, 300);
  });

  window.addEventListener("resize", applyEnemyLeft35);

})();


// ======================================================
// ENEMY LEFT -30 MORE
// 856 -> 826
// ======================================================
(function(){

  const FINAL_LEFT = 826;

  function applyEnemyLeft30More(){
    const enemyForest = document.getElementById("enemyForest");
    const enemyField = document.getElementById("enemyField");

    [enemyForest, enemyField].forEach(el=>{
      if(!el) return;

      el.style.setProperty("left", FINAL_LEFT + "px", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("transform", "none", "important");
    });
  }

  const oldRenderEnemyLeft30More = render;

  render = function(){
    oldRenderEnemyLeft30More();
    requestAnimationFrame(applyEnemyLeft30More);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyEnemyLeft30More();
    setTimeout(applyEnemyLeft30More, 300);
  });

  window.addEventListener("resize", applyEnemyLeft30More);

})();


// ======================================================
// ENEMY RIGHT +15 AGAIN
// 826 -> 841
// ======================================================
(function(){

  const FINAL_LEFT = 841;

  function applyEnemyRight15Again(){
    const enemyForest = document.getElementById("enemyForest");
    const enemyField = document.getElementById("enemyField");

    [enemyForest, enemyField].forEach(el=>{
      if(!el) return;

      el.style.setProperty("left", FINAL_LEFT + "px", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("transform", "none", "important");
    });
  }

  const oldRenderEnemyRight15Again = render;

  render = function(){
    oldRenderEnemyRight15Again();
    requestAnimationFrame(applyEnemyRight15Again);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyEnemyRight15Again();
    setTimeout(applyEnemyRight15Again, 300);
  });

  window.addEventListener("resize", applyEnemyRight15Again);

})();


// ======================================================
// ENEMY LEFT -5 FINAL
// 841 -> 836
// ======================================================
(function(){

  const FINAL_LEFT = 836;

  function applyEnemyLeft5Final(){
    const enemyForest = document.getElementById("enemyForest");
    const enemyField = document.getElementById("enemyField");

    [enemyForest, enemyField].forEach(el=>{
      if(!el) return;

      el.style.setProperty("left", FINAL_LEFT + "px", "important");
      el.style.setProperty("right", "auto", "important");
      el.style.setProperty("transform", "none", "important");
    });
  }

  const oldRenderEnemyLeft5Final = render;

  render = function(){
    oldRenderEnemyLeft5Final();
    requestAnimationFrame(applyEnemyLeft5Final);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyEnemyLeft5Final();
    setTimeout(applyEnemyLeft5Final, 300);
  });

  window.addEventListener("resize", applyEnemyLeft5Final);

})();


// ======================================================
// UI CLEANUP PATCH
// 1. 移除「星靈王回合引擎」文字。
// 2. 召喚手牌 / 祭品召喚重疊 -> 只保留一個。
// 3. 移除遮擋戰術佈陣按鈕的透明圖層。
// ======================================================
(function(){

  function removeDuplicateSummonButtons(){
    const buttons = Array.from(document.querySelectorAll("button"));

    const summonBtns = buttons.filter(btn=>{
      const txt = (btn.textContent || "").replace(/\s+/g,"");
      return txt.includes("召喚手牌") || txt.includes("祭品召喚");
    });

    if(summonBtns.length <= 1) return;

    // 保留第一個可見按鈕，其餘移除
    let kept = false;

    summonBtns.forEach(btn=>{
      const rect = btn.getBoundingClientRect();
      const visible = rect.width > 10 && rect.height > 10;

      if(!kept && visible){
        kept = true;
        return;
      }

      // 移除重複功能
      btn.remove();
    });
  }

  function clearBlockingLayers(){
    // 常見會遮住右下角按鈕的 overlay / mask / panel
    const suspects = Array.from(document.querySelectorAll(
      'div,section,article'
    ));

    suspects.forEach(el=>{
      const txt = (el.textContent || "").replace(/\s+/g,"");
      const rect = el.getBoundingClientRect();

      // 只處理透明大型覆蓋層
      const style = getComputedStyle(el);

      const nearBottomRight =
        rect.left > window.innerWidth * 0.45 &&
        rect.top > window.innerHeight * 0.45;

      const huge =
        rect.width > 120 &&
        rect.height > 80;

      const transparent =
        style.backgroundColor === "rgba(0, 0, 0, 0)" ||
        style.backgroundColor === "transparent";

      const suspicious =
        style.position === "absolute" ||
        style.position === "fixed";

      // 不要誤殺真正按鈕容器
      const containsButton = !!el.querySelector("button");

      // 移除無內容但吃事件的大圖層
      if(
        nearBottomRight &&
        huge &&
        suspicious &&
        transparent &&
        !containsButton &&
        txt.length === 0
      ){
        el.style.setProperty("pointer-events", "none", "important");
        el.style.setProperty("display", "none", "important");
      }
    });

    // 額外保證右下功能列可點擊
    [
      "#summonPanel",
      "#actionPanel",
      "#bottomControls",
      "#tacticPanel",
      "#battleControls"
    ].forEach(sel=>{
      const el = document.querySelector(sel);
      if(el){
        el.style.setProperty("pointer-events", "auto", "important");
        el.style.setProperty("z-index", "9999", "important");
      }
    });

    // 所有右下角按鈕提高層級
    document.querySelectorAll("button").forEach(btn=>{
      const rect = btn.getBoundingClientRect();

      if(
        rect.left > window.innerWidth * 0.45 &&
        rect.top > window.innerHeight * 0.45
      ){
        btn.style.setProperty("position", "relative", "important");
        btn.style.setProperty("z-index", "99999", "important");
        btn.style.setProperty("pointer-events", "auto", "important");
      }
    });
  }

  function clearTurnEngineTitle(){
    document.querySelectorAll("div,span,h1,h2,h3,h4").forEach(el=>{
      const txt = (el.textContent || "").trim();

      if(txt === "星靈王回合引擎"){
        el.textContent = "";
      }
    });
  }

  function cleanupUI(){
    clearTurnEngineTitle();
    removeDuplicateSummonButtons();
    clearBlockingLayers();
  }

  const oldRenderUICleanup = render;

  render = function(){
    oldRenderUICleanup();

    requestAnimationFrame(cleanupUI);

    setTimeout(cleanupUI, 150);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    cleanupUI();

    setTimeout(cleanupUI, 500);
    setTimeout(cleanupUI, 1200);
  });

})();


// ======================================================
// END TURN POSITION + REMOVE SUMMON HINT LAYER
// 1. 「結束我方回合」固定回右下角功能區，不再跑到手牌區。
// 2. 移除/隱藏「先點手牌，再按召喚」提示圖層，避免遮擋方案/階段按鈕。
// ======================================================
(function(){

  function findButtonByText(text){
    return Array.from(document.querySelectorAll("button")).find(btn=>{
      return (btn.textContent || "").replace(/\s+/g,"").includes(text);
    });
  }

  function restoreEndTurnButton(){
    const btn =
      findButtonByText("結束我方回合") ||
      findButtonByText("結束回合") ||
      document.getElementById("unifiedEndBtn");

    if(!btn) return;

    btn.id = btn.id || "unifiedEndBtn";

    // 固定在右下角功能區，避開手牌區
    btn.style.setProperty("position", "fixed", "important");
    btn.style.setProperty("right", "18px", "important");
    btn.style.setProperty("bottom", "78px", "important");
    btn.style.setProperty("left", "auto", "important");
    btn.style.setProperty("top", "auto", "important");
    btn.style.setProperty("transform", "none", "important");

    btn.style.setProperty("z-index", "160000", "important");
    btn.style.setProperty("pointer-events", "auto", "important");
    btn.style.setProperty("display", "block", "important");
    btn.style.setProperty("visibility", "visible", "important");
    btn.style.setProperty("opacity", "1", "important");

    btn.style.setProperty("width", "220px", "important");
    btn.style.setProperty("height", "42px", "important");
  }

  function removeSummonHintLayer(){
    // 先精準處理已知 id
    [
      "unifiedSummonBox",
      "unifiedSummonHint",
      "summonHint",
      "summonGuide",
      "summonOverlay",
      "handSummonHint"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      }
    });

    // 再移除任何文字為「先點手牌，再按召喚」的浮層
    Array.from(document.querySelectorAll("div,section,aside,span")).forEach(el=>{
      const txt = (el.textContent || "").replace(/\s+/g,"").trim();

      if(
        txt.includes("先點手牌") ||
        txt.includes("再按召喚") ||
        txt.includes("先點手牌，再按召喚")
      ){
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");

        // 若父層是只放提示的盒子，一併隱藏
        const p = el.parentElement;
        if(p && p.children.length <= 3 && !p.querySelector("canvas,.slot,.card")){
          p.style.setProperty("display", "none", "important");
          p.style.setProperty("visibility", "hidden", "important");
          p.style.setProperty("pointer-events", "none", "important");
        }
      }
    });
  }

  function ensureRightBottomButtonsClickable(){
    // 讓右下角階段 / 戰術 / 進攻 / 結束回合按鈕都在最上層
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      const txt = (btn.textContent || "").replace(/\s+/g,"");

      if(
        txt.includes("戰術佈陣") ||
        txt.includes("進攻宣言") ||
        txt.includes("結束我方回合") ||
        txt.includes("結束回合") ||
        txt.includes("下一階段")
      ){
        btn.style.setProperty("position", "relative", "important");
        btn.style.setProperty("z-index", "160001", "important");
        btn.style.setProperty("pointer-events", "auto", "important");
      }
    });
  }

  function applyFix(){
    removeSummonHintLayer();
    restoreEndTurnButton();
    ensureRightBottomButtonsClickable();
  }

  const oldRenderEndTurnAndLayerFix = render;

  render = function(){
    oldRenderEndTurnAndLayerFix();

    requestAnimationFrame(applyFix);
    setTimeout(applyFix, 120);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyFix();
    setTimeout(applyFix, 500);
    setTimeout(applyFix, 1200);
  });

})();


// ======================================================
// BEAUTIFIED RIGHT CONTROL PANEL + RESTORE SUMMON BUTTON
// 1. 右下統一控制面板：戰術佈陣 / 進攻宣言 / 召喚 / 結束我方回合。
// 2. 回合引擎框格移到戰術佈陣、進攻宣言正下方。
// 3. 復原召喚按鈕；移除舊的「先點手牌，再按召喚」遮擋提示文字。
// ======================================================
(function(){

  let selectedHandForPrettySummon = null;

  function E(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function phaseName(){
    const e = E();
    if(e && e.phase) return String(e.phase);
    if(typeof phase !== "undefined") return String(phase);
    return "";
  }

  function currentPlayer(){
    const e = E();
    return e && e.currentPlayer ? e.currentPlayer : "player";
  }

  function canSummonNow(){
    const p = phaseName();
    return currentPlayer() === "player" && (
      p === "summon" ||
      p === "formation" ||
      p.includes("召喚") ||
      p.includes("戰術佈陣")
    );
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("ue-msg") || document.getElementById("skEngineMessage");
    if(el) el.textContent = msg;
  }

  function findButton(texts){
    const list = Array.isArray(texts) ? texts : [texts];
    return Array.from(document.querySelectorAll("button")).find(btn=>{
      const txt = (btn.textContent || "").replace(/\s+/g,"");
      return list.some(t => txt.includes(t));
    });
  }

  function ensurePanel(){
    let panel = document.getElementById("prettyRightControlPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "prettyRightControlPanel";
      document.body.appendChild(panel);
    }

    return panel;
  }

  function moveButtonIntoPanel(panel, btn, cls, label){
    if(!btn) return null;

    btn.classList.add("pretty-control-btn", cls);

    if(label) btn.textContent = label;

    if(btn.parentElement !== panel){
      panel.appendChild(btn);
    }

    btn.style.removeProperty("position");
    btn.style.removeProperty("left");
    btn.style.removeProperty("top");
    btn.style.removeProperty("right");
    btn.style.removeProperty("bottom");
    btn.style.removeProperty("transform");

    btn.style.setProperty("z-index", "1", "important");
    btn.style.setProperty("pointer-events", "auto", "important");
    btn.style.setProperty("display", "block", "important");
    btn.style.setProperty("visibility", "visible", "important");
    btn.style.setProperty("opacity", "1", "important");

    return btn;
  }

  function ensurePrettySummonButton(panel){
    let btn = document.getElementById("prettySummonBtn");

    if(!btn){
      btn = document.createElement("button");
      btn.id = "prettySummonBtn";
      btn.type = "button";
      btn.textContent = "召喚";
    }

    btn.className = "pretty-control-btn pretty-summon";

    if(btn.parentElement !== panel){
      // 放在戰術/進攻下面，回合引擎上面
      panel.appendChild(btn);
    }

    btn.disabled = !canSummonNow();

    btn.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();

      if(!canSummonNow()){
        show("目前階段不能召喚。");
        return;
      }

      if(selectedHandForPrettySummon === null){
        show("請先點選手牌，再按召喚。");
        return;
      }

      // 兼容舊召喚流程：設定常見全域選擇欄位，讓點場地格召喚。
      try{ window.selectedHandIndex = selectedHandForPrettySummon; }catch(err){}
      try{ selectedHandIndex = selectedHandForPrettySummon; }catch(err){}

      show("請點選我方可召喚位置。");
      render();
    };

    return btn;
  }

  function ensureEngineInsidePanel(panel){
    let engine = document.getElementById("unifiedEnginePanel");

    if(!engine){
      engine = document.createElement("div");
      engine.id = "unifiedEnginePanel";
      engine.innerHTML = '<div id="ue-line1"></div><div id="ue-line2"></div>';
    }

    engine.classList.add("pretty-engine-panel");

    if(engine.parentElement !== panel){
      panel.appendChild(engine);
    }

    // 移除標題文字，但保留內容欄位
    engine.querySelectorAll("*").forEach(el=>{
      const txt = (el.textContent || "").trim();
      if(txt === "星靈王回合引擎"){
        el.textContent = "";
      }
    });

    engine.childNodes.forEach(node=>{
      if(node.nodeType === Node.TEXT_NODE && node.textContent.includes("星靈王回合引擎")){
        node.textContent = node.textContent.replace("星靈王回合引擎", "");
      }
    });

    engine.style.removeProperty("position");
    engine.style.removeProperty("left");
    engine.style.removeProperty("top");
    engine.style.removeProperty("right");
    engine.style.removeProperty("bottom");
    engine.style.removeProperty("transform");

    engine.style.setProperty("display", "block", "important");
    engine.style.setProperty("visibility", "visible", "important");
    engine.style.setProperty("opacity", "1", "important");
    engine.style.setProperty("pointer-events", "auto", "important");

    return engine;
  }

  function ensureEndButton(panel){
    let btn =
      document.getElementById("unifiedEndBtn") ||
      findButton(["結束我方回合","結束回合"]);

    if(!btn){
      btn = document.createElement("button");
      btn.id = "unifiedEndBtn";
      btn.type = "button";
      btn.textContent = "結束我方回合";
      btn.onclick = function(){
        if(typeof window.xlwEndPlayerTurn === "function") return window.xlwEndPlayerTurn();
        if(typeof endTurn === "function") return endTurn();
        if(typeof nextPhase === "function") return nextPhase();
      };
    }

    btn.id = "unifiedEndBtn";
    return moveButtonIntoPanel(panel, btn, "pretty-end", "結束我方回合");
  }

  function hideOldSummonHintOnly(){
    // 只移除提示文字，不移除召喚按鈕/控制面板。
    ["summonHint","summonGuide","summonOverlay","handSummonHint","unifiedSummonHint"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });

    Array.from(document.querySelectorAll("div,span,section,aside")).forEach(el=>{
      if(el.closest("#prettyRightControlPanel")) return;
      const txt = (el.textContent || "").replace(/\s+/g,"").trim();

      if(txt.includes("先點手牌") && txt.includes("按召喚")){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function hideDuplicateSummonButtons(){
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      if(btn.id === "prettySummonBtn") return;
      if(btn.closest("#prettyRightControlPanel")) return;

      const txt = (btn.textContent || "").replace(/\s+/g,"");

      if(txt.includes("召喚手牌") || txt.includes("祭品召喚")){
        btn.style.setProperty("display","none","important");
        btn.style.setProperty("visibility","hidden","important");
        btn.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function cleanupBlockingLayers(){
    // 只處理右下方不含 button 的空白覆蓋層，避免遮住戰術佈陣/進攻宣言。
    Array.from(document.querySelectorAll("div,section,aside")).forEach(el=>{
      if(el.id === "prettyRightControlPanel" || el.closest("#prettyRightControlPanel")) return;

      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const txt = (el.textContent || "").trim();

      const inRightControlArea =
        r.left > window.innerWidth - 380 &&
        r.top > window.innerHeight - 520 &&
        r.width > 80 &&
        r.height > 50;

      const noUsefulContent =
        !el.querySelector("button,.card,.slot,img") &&
        txt.length < 4;

      if(inRightControlArea && noUsefulContent && (style.position === "absolute" || style.position === "fixed")){
        el.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function updateSelectedHandFromClick(){
    document.addEventListener("click", function(e){
      const card = e.target.closest && e.target.closest(".hand-card,.card-in-hand,[data-hand-index]");
      if(!card) return;

      const idx = Number(card.dataset.handIndex ?? card.dataset.index ?? card.getAttribute("data-card-index"));
      if(Number.isFinite(idx)){
        selectedHandForPrettySummon = idx;
        const btn = document.getElementById("prettySummonBtn");
        if(btn) btn.classList.add("has-selected-hand");
      }
    }, true);
  }

  let handListenerInstalled = false;

  function layoutControls(){
    const panel = ensurePanel();

    const tacticalBtn = findButton(["戰術佈陣"]);
    const attackBtn = findButton(["進攻宣言"]);

    moveButtonIntoPanel(panel, tacticalBtn, "pretty-tactical", "戰術佈陣");
    moveButtonIntoPanel(panel, attackBtn, "pretty-attack", "進攻宣言");

    ensurePrettySummonButton(panel);
    ensureEngineInsidePanel(panel);
    ensureEndButton(panel);

    hideOldSummonHintOnly();
    hideDuplicateSummonButtons();
    cleanupBlockingLayers();

    if(!handListenerInstalled){
      handListenerInstalled = true;
      updateSelectedHandFromClick();
    }
  }

  const oldRenderPrettyControls = render;
  render = function(){
    oldRenderPrettyControls();
    requestAnimationFrame(layoutControls);
    setTimeout(layoutControls, 120);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    layoutControls();
    setTimeout(layoutControls, 500);
    setTimeout(layoutControls, 1200);
  });

})();


// ======================================================
// RIGHT CONTROL PANEL DEDUP FINAL
// 只保留一組右下控制面板：戰術佈陣 / 進攻宣言 / 召喚 / 回合引擎 / 結束我方回合。
// 其他重複按鈕全部隱藏，避免互相堆疊遮蔽。
// ======================================================
(function(){

  function textOf(el){
    return (el.textContent || "").replace(/\s+/g,"").trim();
  }

  function findButtons(keyword){
    return Array.from(document.querySelectorAll("button")).filter(btn=>textOf(btn).includes(keyword));
  }

  function makeButton(id, label, className){
    let btn = document.getElementById(id);
    if(!btn){
      btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.textContent = label;
    }
    btn.className = "final-panel-btn " + className;
    btn.textContent = label;
    btn.style.removeProperty("position");
    btn.style.removeProperty("left");
    btn.style.removeProperty("top");
    btn.style.removeProperty("right");
    btn.style.removeProperty("bottom");
    btn.style.removeProperty("transform");
    return btn;
  }

  function getOriginalAction(keyword){
    return Array.from(document.querySelectorAll("button")).find(btn=>{
      if(btn.closest("#finalRightControlPanel")) return false;
      return textOf(btn).includes(keyword);
    });
  }

  function clickOriginal(keyword){
    const btn = getOriginalAction(keyword);
    if(btn){
      btn.click();
      return true;
    }
    return false;
  }

  function ensurePanel(){
    let panel = document.getElementById("finalRightControlPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "finalRightControlPanel";
      document.body.appendChild(panel);
    }

    // 清空重建，確保永遠只有一組
    panel.innerHTML = "";

    const row1 = document.createElement("div");
    row1.className = "final-panel-row two";

    const tactical = makeButton("finalTacticalBtn", "戰術佈陣", "tactical");
    tactical.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      clickOriginal("戰術佈陣");
    };

    const attack = makeButton("finalAttackBtn", "進攻宣言", "attack");
    attack.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      clickOriginal("進攻宣言");
    };

    row1.appendChild(tactical);
    row1.appendChild(attack);

    const summon = makeButton("finalSummonBtn", "召喚", "summon");
    summon.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();

      const original =
        getOriginalAction("召喚手牌") ||
        getOriginalAction("召喚") ||
        getOriginalAction("祭品召喚");

      if(original){
        original.click();
      }else{
        try{ setStatus("請先點選手牌，再點選可召喚位置。"); }catch(err){}
      }
    };

    let engine = document.getElementById("unifiedEnginePanel") || document.getElementById("prettyEnginePanel");
    if(!engine){
      engine = document.createElement("div");
      engine.id = "unifiedEnginePanel";
    }
    engine.classList.add("final-engine-box");
    engine.style.removeProperty("position");
    engine.style.removeProperty("left");
    engine.style.removeProperty("top");
    engine.style.removeProperty("right");
    engine.style.removeProperty("bottom");
    engine.style.removeProperty("transform");

    engine.querySelectorAll("*").forEach(el=>{
      if(textOf(el) === "星靈王回合引擎") el.textContent = "";
    });
    Array.from(engine.childNodes).forEach(node=>{
      if(node.nodeType === Node.TEXT_NODE && node.textContent.includes("星靈王回合引擎")){
        node.textContent = node.textContent.replace("星靈王回合引擎","");
      }
    });

    const end = makeButton("finalEndTurnBtn", "結束我方回合", "end");
    end.onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      if(clickOriginal("結束我方回合")) return;
      if(clickOriginal("結束回合")) return;
      if(typeof window.xlwEndPlayerTurn === "function") return window.xlwEndPlayerTurn();
      if(typeof endTurn === "function") return endTurn();
      if(typeof nextPhase === "function") return nextPhase();
    };

    panel.appendChild(row1);
    panel.appendChild(summon);
    panel.appendChild(engine);
    panel.appendChild(end);

    return panel;
  }

  function hideDuplicateControls(){
    const panel = document.getElementById("finalRightControlPanel");

    // 隱藏前一版美化面板，避免與新面板堆疊
    ["prettyRightControlPanel"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });

    // 所有不在最終面板內的重複控制按鈕隱藏，但保留 onclick 可供 final 按鈕呼叫
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      if(btn.closest("#finalRightControlPanel")) return;

      const txt = textOf(btn);
      if(
        txt.includes("戰術佈陣") ||
        txt.includes("進攻宣言") ||
        txt.includes("召喚手牌") ||
        txt.includes("祭品召喚") ||
        txt === "召喚" ||
        txt.includes("結束我方回合") ||
        txt.includes("結束回合")
      ){
        btn.style.setProperty("position","absolute","important");
        btn.style.setProperty("left","-9999px","important");
        btn.style.setProperty("top","-9999px","important");
        btn.style.setProperty("width","1px","important");
        btn.style.setProperty("height","1px","important");
        btn.style.setProperty("opacity","0","important");
        btn.style.setProperty("pointer-events","none","important");
        btn.style.setProperty("z-index","-1","important");
      }
    });

    // 隱藏任何右下空白遮罩
    Array.from(document.querySelectorAll("div,section,aside")).forEach(el=>{
      if(el.closest("#finalRightControlPanel")) return;
      if(el.id === "finalRightControlPanel") return;

      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const nearRightBottom = r.left > window.innerWidth - 420 && r.top > window.innerHeight - 560;
      const hasUseful = !!el.querySelector("button,.slot,.card,img") || textOf(el).length > 8;

      if(nearRightBottom && !hasUseful && (style.position === "fixed" || style.position === "absolute")){
        el.style.setProperty("pointer-events","none","important");
        el.style.setProperty("display","none","important");
      }
    });
  }

  function syncDisabled(){
    const summon = document.getElementById("finalSummonBtn");
    if(summon){
      const phase = (window.STAR_UNIFIED && window.STAR_UNIFIED.phase) || "";
      const current = (window.STAR_UNIFIED && window.STAR_UNIFIED.currentPlayer) || "player";
      const usable = current === "player" && (phase === "summon" || phase === "formation" || String(phase).includes("召喚") || String(phase).includes("戰術"));
      summon.disabled = !usable;
    }
  }

  function apply(){
    ensurePanel();
    hideDuplicateControls();
    syncDisabled();
  }

  const oldRenderFinalPanelDedup = render;
  render = function(){
    oldRenderFinalPanelDedup();
    requestAnimationFrame(apply);
    setTimeout(apply, 160);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// RESTORE TOP STATUS BAR + REMOVE EMPTY STRIP
// 1. 復原中間上方狀態說明欄。
// 2. 移除右下角按鈕上方空白長條。
// ======================================================
(function(){

  function ensureTopStatusBar(){
    let bar = document.getElementById("topStatusRestoreBar");

    if(!bar){
      bar = document.createElement("div");
      bar.id = "topStatusRestoreBar";

      bar.innerHTML = `
        <div class="top-status-line" id="topStatusPhase"></div>
        <div class="top-status-line small" id="topStatusMessage"></div>
      `;

      document.body.appendChild(bar);
    }

    const phaseEl = document.getElementById("topStatusPhase");
    const msgEl = document.getElementById("topStatusMessage");

    const engine = window.STAR_UNIFIED || window.SK_ENGINE || null;

    let phase = "";
    let player = "";

    if(engine){
      phase = engine.phase || "";
      player = engine.currentPlayer || "";
    }

    const zhPhase =
      String(phase).includes("summon") ? "召喚階段" :
      String(phase).includes("formation") ? "戰術佈陣" :
      String(phase).includes("battle") ? "戰鬥階段" :
      String(phase).includes("draw") ? "抽牌階段" :
      String(phase).includes("defense") ? "防守階段" :
      String(phase);

    phaseEl.textContent =
      (player === "enemy" ? "對手" : "我方") +
      "｜" + zhPhase;

    // 從原訊息同步
    const srcMsg =
      document.getElementById("ue-msg") ||
      document.getElementById("skEngineMessage");

    if(srcMsg){
      msgEl.textContent = srcMsg.textContent || "";
    }
  }

  function removeEmptyBars(){
    Array.from(document.querySelectorAll("div,section,aside")).forEach(el=>{
      if(el.id === "finalRightControlPanel") return;
      if(el.id === "topStatusRestoreBar") return;

      const txt = (el.textContent || "").replace(/\s+/g,"").trim();
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);

      // 右下按鈕上方的空白長條
      const suspicious =
        r.left > window.innerWidth - 420 &&
        r.top > window.innerHeight - 380 &&
        r.width > 180 &&
        r.height < 70 &&
        txt.length === 0 &&
        !el.querySelector("button,.card,.slot,img");

      if(
        suspicious &&
        (style.position === "absolute" || style.position === "fixed")
      ){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function apply(){
    ensureTopStatusBar();
    removeEmptyBars();
  }

  const oldRenderRestoreTopStatus = render;

  render = function(){
    oldRenderRestoreTopStatus();

    requestAnimationFrame(apply);
    setTimeout(apply, 120);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// REMOVE EMPTY RIGHT PANEL STRIP
// 圈起來的空白長條是右下控制面板內的空白回合引擎框格。
// 中間上方狀態欄已經恢復，因此右下控制面板不再需要這個空白框。
// ======================================================
(function(){

  function removeEmptyRightPanelStrip(){
    const panel = document.getElementById("finalRightControlPanel");
    if(!panel) return;

    // 移除右下控制面板內的回合引擎空白框格
    Array.from(panel.children).forEach(el=>{
      const txt = (el.textContent || "").replace(/\s+/g,"").trim();
      const hasButton = !!el.querySelector("button");

      if(
        el.id === "unifiedEnginePanel" ||
        el.classList.contains("final-engine-box") ||
        el.classList.contains("pretty-engine-panel") ||
        (!hasButton && txt.length === 0)
      ){
        el.remove();
      }
    });

    // 若有其他空白長條被重新插入，也同步移除
    Array.from(document.querySelectorAll("#finalRightControlPanel > div")).forEach(el=>{
      const txt = (el.textContent || "").replace(/\s+/g,"").trim();
      const r = el.getBoundingClientRect();

      if(!el.querySelector("button") && txt.length === 0 && r.height <= 70){
        el.remove();
      }
    });
  }

  const oldRenderRemoveEmptyStrip = render;

  render = function(){
    oldRenderRemoveEmptyStrip();

    requestAnimationFrame(removeEmptyRightPanelStrip);
    setTimeout(removeEmptyRightPanelStrip, 120);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    removeEmptyRightPanelStrip();
    setTimeout(removeEmptyRightPanelStrip, 500);
    setTimeout(removeEmptyRightPanelStrip, 1200);
  });

})();


// ======================================================
// RIGHT PANEL ACTION FIX
// 問題原因：前一版只建立漂亮按鈕，再用 click() 去點被隱藏/搬走的舊按鈕；
// 某些舊按鈕已被 display:none / pointer-events:none 或不是實際流程入口，
// 所以「戰術佈陣」「進攻宣言」按了沒有反應。
// 本版改成：漂亮按鈕直接呼叫回合引擎狀態，不再依賴舊按鈕。
// ======================================================
(function(){

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    const el = document.getElementById("ue-msg") || document.getElementById("skEngineMessage") || document.getElementById("topStatusMessage");
    if(el) el.textContent = msg;
  }

  function setPhaseDirect(nextPhase, message){
    const e = engine();

    if(e){
      e.phase = nextPhase;
      if(!e.currentPlayer) e.currentPlayer = "player";
    }

    try{ phase = nextPhase === "formation" ? "戰術佈陣" : nextPhase === "attack" ? "進攻宣言" : nextPhase; }catch(err){}

    show(message);

    if(typeof render === "function"){
      render();
    }
  }

  function canPlayerChooseAction(){
    const e = engine();
    if(!e) return true;

    if(e.currentPlayer && e.currentPlayer !== "player") return false;

    // 第一回合先手與最後回合限制交給既有流程處理；這裡只避免非我方回合。
    return true;
  }

  function enterFormation(){
    if(!canPlayerChooseAction()){
      show("目前不是我方可操作階段。");
      return;
    }

    // 優先呼叫可能存在的原生函式
    const candidates = [
      "enterFormationPhase",
      "startFormationPhase",
      "xlwEnterFormation",
      "xlwStartFormation",
      "goFormation",
      "startTacticalFormation"
    ];

    for(const name of candidates){
      if(typeof window[name] === "function"){
        window[name]();
        render();
        return;
      }
    }

    setPhaseDirect("formation", "進入戰術佈陣階段。可移動單位、召喚不需獻祭單位或小旅人。");
  }

  function enterAttackDeclare(){
    if(!canPlayerChooseAction()){
      show("目前不是我方可操作階段。");
      return;
    }

    const candidates = [
      "enterAttackPhase",
      "startAttackPhase",
      "xlwEnterAttack",
      "xlwStartAttack",
      "goAttack",
      "startAttackDeclare",
      "startAttackDeclaration"
    ];

    for(const name of candidates){
      if(typeof window[name] === "function"){
        window[name]();
        render();
        return;
      }
    }

    setPhaseDirect("attack", "進入進攻宣言階段。請選擇可進攻單位。");
  }

  function enterSummonMode(){
    const e = engine();
    if(e && e.currentPlayer && e.currentPlayer !== "player"){
      show("目前不是我方回合。");
      return;
    }

    // 不顯示會遮擋的提示層，只用狀態欄提示
    show("請先點選手牌，再點選可召喚位置。");

    try{ window.SK_HAND_SUMMON_MODE = true; }catch(err){}
    try{ summonMode = true; }catch(err){}

    render();
  }

  function endPlayerTurn(){
    const candidates = [
      "xlwEndPlayerTurn",
      "endPlayerTurn",
      "endTurn",
      "nextTurn",
      "nextPhase"
    ];

    for(const name of candidates){
      if(typeof window[name] === "function"){
        window[name]();
        render();
        return;
      }
    }

    const e = engine();
    if(e){
      e.currentPlayer = "enemy";
      e.phase = "draw";
    }

    show("結束我方回合。");
    render();
  }

  function rebuildControlPanel(){
    let panel = document.getElementById("fixedRightActionPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "fixedRightActionPanel";
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="fixed-row">
        <button id="fixedTacticalBtn" class="fixed-btn tactical" type="button">戰術佈陣</button>
        <button id="fixedAttackBtn" class="fixed-btn attack" type="button">進攻宣言</button>
      </div>
      <button id="fixedSummonBtn" class="fixed-btn summon" type="button">召喚</button>
      <button id="fixedEndBtn" class="fixed-btn end" type="button">結束我方回合</button>
    `;

    document.getElementById("fixedTacticalBtn").onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      enterFormation();
    };

    document.getElementById("fixedAttackBtn").onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      enterAttackDeclare();
    };

    document.getElementById("fixedSummonBtn").onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      enterSummonMode();
    };

    document.getElementById("fixedEndBtn").onclick = function(e){
      e.preventDefault();
      e.stopPropagation();
      endPlayerTurn();
    };

    // 隱藏舊的重複面板與重複按鈕，但保留功能邏輯
    ["finalRightControlPanel", "prettyRightControlPanel"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      }
    });

    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      if(btn.closest("#fixedRightActionPanel")) return;

      const txt = (btn.textContent || "").replace(/\s+/g,"");
      if(
        txt.includes("戰術佈陣") ||
        txt.includes("進攻宣言") ||
        txt.includes("召喚手牌") ||
        txt.includes("祭品召喚") ||
        txt === "召喚" ||
        txt.includes("結束我方回合") ||
        txt.includes("結束回合")
      ){
        btn.style.setProperty("display", "none", "important");
        btn.style.setProperty("visibility", "hidden", "important");
        btn.style.setProperty("pointer-events", "none", "important");
      }
    });
  }

  function removeBlockingHintLayers(){
    ["summonHint","summonGuide","summonOverlay","handSummonHint","unifiedSummonHint","unifiedSummonBox"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });

    Array.from(document.querySelectorAll("div,section,aside")).forEach(el=>{
      if(el.closest("#fixedRightActionPanel")) return;

      const txt = (el.textContent || "").replace(/\s+/g,"").trim();
      const r = el.getBoundingClientRect();

      if(
        (txt.includes("先點手牌") || txt.includes("再按召喚")) ||
        (
          r.left > window.innerWidth - 420 &&
          r.top > window.innerHeight - 520 &&
          !el.querySelector("button,.slot,.card,img") &&
          txt.length < 8
        )
      ){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function apply(){
    rebuildControlPanel();
    removeBlockingHintLayers();
  }

  const oldRenderActionFix = render;
  render = function(){
    oldRenderActionFix();
    requestAnimationFrame(apply);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    apply();
    setTimeout(apply, 500);
  });

})();


// ======================================================
// DEEP ACTION BUTTON FIX - REAL ENGINE BRIDGE
// 修正：戰術佈陣 / 進攻宣言不再 click 被隱藏的舊按鈕，
// 而是直接同步 STAR_UNIFIED/SK_ENGINE 與舊全域 phase/mode 旗標。
// ======================================================
(function(){

  let playerForestSelectMode = false;

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function setTopPhase(txt){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = "我方｜" + txt;
  }

  function syncPhase(raw, zh, msg){
    const e = engine();
    if(e){
      e.currentPlayer = "player";
      e.phase = raw;
      e.actionPhase = raw;
      e.subphase = raw;
      e.selectedAction = raw;
    }

    try{ phase = zh; }catch(err){}
    try{ currentPhase = raw; }catch(err){}
    try{ mode = raw; }catch(err){}
    try{ currentPlayer = "player"; }catch(err){}

    setTopPhase(zh);
    show(msg);
  }

  function clearModes(){
    window.SK_HAND_SUMMON_MODE = false;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.OWNER_FOREST_SUMMON_OWNER = null;
    window.ORIGINAL_FOREST_SUMMON_OWNER = null;

    try{ summonMode = false; }catch(err){}
    try{ tributeMode = false; }catch(err){}
    try{ spellMode = false; }catch(err){}
    try{ travelerMode = false; }catch(err){}
    try{ attackDeclareMode = false; }catch(err){}
    try{ formationMode = false; }catch(err){}
    try{ moveMode = false; }catch(err){}
    try{ selectedAction = null; }catch(err){}

    const e = engine();
    if(e){
      e.travelerMode = false;
      e.attackDeclareMode = false;
      e.formationMode = false;
      e.moveMode = false;
      e.summonMode = false;
    }
  }

  function enterFormation(){
    clearModes();

    syncPhase(
      "formation",
      "戰術佈陣",
      "已進入戰術佈陣：可移動單位，並可召喚不需獻祭單位或小旅人。"
    );

    window.XLW_ACTION_MODE = "formation";
    window.SK_ACTION_MODE = "formation";
    window.SK_FORMATION_MODE = true;

    try{ mode = "formation"; }catch(err){}
    try{ currentPhase = "formation"; }catch(err){}
    try{ formationMode = true; }catch(err){}
    try{ moveMode = true; }catch(err){}
    try{ selectedAction = "formation"; }catch(err){}

    const e = engine();
    if(e){
      e.formationMode = true;
      e.moveMode = true;
      e.selectedAction = "formation";
    }

    document.body.classList.add("mode-formation");
    document.body.classList.remove("mode-attack-declare");

    refreshVisual("formation");
    if(typeof render === "function") render();
  }

  function enterAttack(){
    clearModes();

    syncPhase(
      "attack",
      "進攻宣言",
      "已進入進攻宣言：請選擇可進攻單位。"
    );

    window.XLW_ACTION_MODE = "attack";
    window.SK_ACTION_MODE = "attack";
    window.SK_ATTACK_DECLARE_MODE = true;

    try{ mode = "attack"; }catch(err){}
    try{ currentPhase = "attack"; }catch(err){}
    try{ attackDeclareMode = true; }catch(err){}
    try{ selectedAction = "attack"; }catch(err){}

    const e = engine();
    if(e){
      e.attackDeclareMode = true;
      e.selectedAction = "attack";
    }

    document.body.classList.add("mode-attack-declare");
    document.body.classList.remove("mode-formation");

    refreshVisual("attack");
    if(typeof render === "function") render();
  }

  function enterSummon(){
    clearModes();

    syncPhase(
      "summon",
      "召喚階段",
      "請先點選手牌，再點選可召喚位置。"
    );

    window.XLW_ACTION_MODE = "summon";
    window.SK_ACTION_MODE = "summon";
    window.SK_HAND_SUMMON_MODE = true;

    try{ mode = "summon"; }catch(err){}
    try{ currentPhase = "summon"; }catch(err){}
    try{ summonMode = true; }catch(err){}
    try{ selectedAction = "summon"; }catch(err){}

    const e = engine();
    if(e){
      e.summonMode = true;
      e.selectedAction = "summon";
    }

    refreshVisual("summon");
    if(typeof render === "function") render();
  }

  function endPlayerTurnBridge(){
    clearModes();
    const candidates = ["xlwEndPlayerTurn","endPlayerTurn","endTurn","nextTurn"];
    for(const name of candidates){
      if(typeof window[name] === "function"){
        window[name]();
        if(typeof render === "function") render();
        return;
      }
    }

    const e = engine();
    if(e){
      e.currentPlayer = "enemy";
      e.phase = "draw";
    }
    try{ currentPlayer = "enemy"; }catch(err){}
    try{ phase = "抽牌階段"; }catch(err){}
    show("結束我方回合。");
    if(typeof render === "function") render();
  }

  function ensurePanel(){
    let panel = document.getElementById("fixedRightActionPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "fixedRightActionPanel";
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="fixed-row">
        <button id="fixedTacticalBtn" class="fixed-btn tactical" type="button">戰術佈陣</button>
        <button id="fixedAttackBtn" class="fixed-btn attack" type="button">進攻宣言</button>
      </div>
      <button id="fixedSummonBtn" class="fixed-btn summon" type="button">召喚</button>
      <button id="fixedEndBtn" class="fixed-btn end" type="button">結束我方回合</button>
    `;

    document.getElementById("fixedTacticalBtn").onclick = function(e){
      e.preventDefault(); e.stopPropagation(); enterFormation();
    };
    document.getElementById("fixedAttackBtn").onclick = function(e){
      e.preventDefault(); e.stopPropagation(); enterAttack();
    };
    document.getElementById("fixedSummonBtn").onclick = function(e){
      e.preventDefault(); e.stopPropagation(); enterSummon();
    };
    document.getElementById("fixedEndBtn").onclick = function(e){
      e.preventDefault(); e.stopPropagation(); endPlayerTurnBridge();
    };

    refreshVisual(window.XLW_ACTION_MODE || window.SK_ACTION_MODE || "");
  }

  function refreshVisual(active){
    const t = document.getElementById("fixedTacticalBtn");
    const a = document.getElementById("fixedAttackBtn");
    const s = document.getElementById("fixedSummonBtn");
    if(t) t.classList.toggle("active", active === "formation");
    if(a) a.classList.toggle("active", active === "attack");
    if(s) s.classList.toggle("active", active === "summon");
  }

  function hideOldControls(){
    ["finalRightControlPanel","prettyRightControlPanel"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });

    ["summonHint","summonGuide","summonOverlay","handSummonHint","unifiedSummonHint","unifiedSummonBox"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });

    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      if(btn.closest("#fixedRightActionPanel")) return;
      const txt = (btn.textContent || "").replace(/\s+/g,"");
      if(
        txt.includes("戰術佈陣") || txt.includes("進攻宣言") ||
        txt.includes("召喚手牌") || txt.includes("祭品召喚") ||
        txt === "召喚" || txt.includes("結束我方回合") || txt.includes("結束回合")
      ){
        btn.style.setProperty("display","none","important");
        btn.style.setProperty("visibility","hidden","important");
        btn.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function apply(){
    ensurePanel();
    hideOldControls();
  }

  const oldRenderDeepActionBridge = render;
  render = function(){
    oldRenderDeepActionBridge();
    requestAnimationFrame(apply);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// RESTORE TACTICAL / ATTACK BUTTONS - ANALYZED FIX
// 問題原因：舊補丁會掃描所有 button，只要文字包含「戰術佈陣 / 進攻宣言」
// 就設為 display:none；新建立的右下按鈕也會在下一次 render 被掃掉。
// 本版使用獨立 id 的 stableActionPanel，並在最後強制可見，不再被舊掃描影響。
// ======================================================
(function(){

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function setPhaseLabel(label){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = "我方｜" + label;
  }

  function clearActionModes(){
    window.SK_HAND_SUMMON_MODE = false;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.SK_ATTACK_DECLARE_MODE = false;
    window.SK_FORMATION_MODE = false;
    window.OWNER_FOREST_SUMMON_OWNER = null;
    window.ORIGINAL_FOREST_SUMMON_OWNER = null;

    try{ summonMode = false; }catch(e){}
    try{ tributeMode = false; }catch(e){}
    try{ spellMode = false; }catch(e){}
    try{ travelerMode = false; }catch(e){}
    try{ attackDeclareMode = false; }catch(e){}
    try{ formationMode = false; }catch(e){}
    try{ moveMode = false; }catch(e){}
    try{ selectedAction = null; }catch(e){}

    const g = engine();
    if(g){
      g.travelerMode = false;
      g.attackDeclareMode = false;
      g.formationMode = false;
      g.moveMode = false;
      g.summonMode = false;
    }
  }

  function syncPhase(raw, label, msg){
    const g = engine();
    if(g){
      g.currentPlayer = "player";
      g.phase = raw;
      g.actionPhase = raw;
      g.subphase = raw;
      g.selectedAction = raw;
    }

    try{ phase = label; }catch(e){}
    try{ currentPhase = raw; }catch(e){}
    try{ mode = raw; }catch(e){}
    try{ currentPlayer = "player"; }catch(e){}

    window.XLW_ACTION_MODE = raw;
    window.SK_ACTION_MODE = raw;

    setPhaseLabel(label);
    show(msg);
  }

  function enterFormation(){
    clearActionModes();

    syncPhase(
      "formation",
      "戰術佈陣",
      "已進入戰術佈陣：可移動單位，並可召喚不需獻祭單位或小旅人。"
    );

    window.SK_FORMATION_MODE = true;
    try{ formationMode = true; }catch(e){}
    try{ moveMode = true; }catch(e){}
    try{ selectedAction = "formation"; }catch(e){}

    const g = engine();
    if(g){
      g.formationMode = true;
      g.moveMode = true;
      g.selectedAction = "formation";
    }

    document.body.classList.add("mode-formation");
    document.body.classList.remove("mode-attack-declare");

    markActive("formation");
    if(typeof render === "function") render();
  }

  function enterAttack(){
    clearActionModes();

    syncPhase(
      "attack",
      "進攻宣言",
      "已進入進攻宣言：請選擇可進攻單位。"
    );

    window.SK_ATTACK_DECLARE_MODE = true;
    try{ attackDeclareMode = true; }catch(e){}
    try{ selectedAction = "attack"; }catch(e){}

    const g = engine();
    if(g){
      g.attackDeclareMode = true;
      g.selectedAction = "attack";
    }

    document.body.classList.add("mode-attack-declare");
    document.body.classList.remove("mode-formation");

    markActive("attack");
    if(typeof render === "function") render();
  }

  function enterSummon(){
    clearActionModes();

    syncPhase(
      "summon",
      "召喚階段",
      "請先點選手牌，再點選可召喚位置。"
    );

    window.SK_HAND_SUMMON_MODE = true;
    try{ summonMode = true; }catch(e){}
    try{ selectedAction = "summon"; }catch(e){}

    const g = engine();
    if(g){
      g.summonMode = true;
      g.selectedAction = "summon";
    }

    markActive("summon");
    if(typeof render === "function") render();
  }

  function endTurn(){
    clearActionModes();

    const candidates = ["xlwEndPlayerTurn","endPlayerTurn","endTurn","nextTurn"];
    for(const name of candidates){
      if(typeof window[name] === "function"){
        window[name]();
        if(typeof render === "function") render();
        return;
      }
    }

    const g = engine();
    if(g){
      g.currentPlayer = "enemy";
      g.phase = "draw";
    }
    try{ currentPlayer = "enemy"; }catch(e){}
    try{ phase = "抽牌階段"; }catch(e){}
    show("結束我方回合。");
    if(typeof render === "function") render();
  }

  function markActive(active){
    ["stableActionTactical","stableActionAttack","stableActionSummon"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.classList.remove("active");
    });
    if(active === "formation"){
      const el = document.getElementById("stableActionTactical");
      if(el) el.classList.add("active");
    }
    if(active === "attack"){
      const el = document.getElementById("stableActionAttack");
      if(el) el.classList.add("active");
    }
    if(active === "summon"){
      const el = document.getElementById("stableActionSummon");
      if(el) el.classList.add("active");
    }
  }

  function buildStablePanel(){
    let panel = document.getElementById("stableActionPanel");

    if(!panel){
      panel = document.createElement("div");
      panel.id = "stableActionPanel";
      document.body.appendChild(panel);
    }

    if(!panel.dataset.built){
      panel.dataset.built = "1";
      panel.innerHTML = `
        <div class="stable-action-row">
          <button id="stableActionTactical" class="stable-action-btn tactical" type="button">戰術佈陣</button>
          <button id="stableActionAttack" class="stable-action-btn attack" type="button">進攻宣言</button>
        </div>
        <button id="stableActionSummon" class="stable-action-btn summon" type="button">召喚</button>
        <button id="stableActionEnd" class="stable-action-btn end" type="button">結束我方回合</button>
      `;

      document.getElementById("stableActionTactical").addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation(); enterFormation();
      });
      document.getElementById("stableActionAttack").addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation(); enterAttack();
      });
      document.getElementById("stableActionSummon").addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation(); enterSummon();
      });
      document.getElementById("stableActionEnd").addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation(); endTurn();
      });
    }

    panel.style.setProperty("display", "flex", "important");
    panel.style.setProperty("visibility", "visible", "important");
    panel.style.setProperty("opacity", "1", "important");
    panel.style.setProperty("pointer-events", "auto", "important");
  }

  function hideConflictingControls(){
    [
      "fixedRightActionPanel",
      "finalRightControlPanel",
      "prettyRightControlPanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      }
    });

    // 只隱藏不在 stableActionPanel 裡的重複按鈕，避免掃掉本版按鈕
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      if(btn.closest("#stableActionPanel")) return;

      const txt = (btn.textContent || "").replace(/\s+/g,"");
      if(
        txt.includes("戰術佈陣") ||
        txt.includes("進攻宣言") ||
        txt.includes("召喚手牌") ||
        txt.includes("祭品召喚") ||
        txt === "召喚" ||
        txt.includes("結束我方回合") ||
        txt.includes("結束回合")
      ){
        btn.style.setProperty("display", "none", "important");
        btn.style.setProperty("visibility", "hidden", "important");
        btn.style.setProperty("pointer-events", "none", "important");
      }
    });

    ["summonHint","summonGuide","summonOverlay","handSummonHint","unifiedSummonHint","unifiedSummonBox"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      }
    });
  }

  function applyStableActionPanel(){
    buildStablePanel();
    hideConflictingControls();
  }

  const oldRenderRestoreActionButtons = render;
  render = function(){
    oldRenderRestoreActionButtons();
    requestAnimationFrame(applyStableActionPanel);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyStableActionPanel();
    setTimeout(applyStableActionPanel, 500);
    setTimeout(applyStableActionPanel, 1200);
  });

})();


// ======================================================
// SURVIVE MULLIGAN ACTION PANEL FIX
// 問題原因：確認換牌後會觸發舊 render / cleanup，舊邏輯會用 button.textContent
// 掃描「戰術佈陣 / 進攻宣言」並隱藏或移除，所以按鈕在換牌後消失。
// 本版修正：
// 1. 建立 no-text 按鈕：按鈕文字改用 data-label + CSS ::before 顯示，
//    button.textContent 為空，不會被舊掃描器誤刪。
// 2. 使用 MutationObserver 監控 DOM，若被刪除會立刻重建。
// 3. 確認換牌後、render 後都會強制恢復唯一可用面板。
// ======================================================
(function(){

  let rebuilding = false;
  let observerInstalled = false;

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function topPhase(label){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = "我方｜" + label;
  }

  function clearModes(){
    window.SK_HAND_SUMMON_MODE = false;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.SK_ATTACK_DECLARE_MODE = false;
    window.SK_FORMATION_MODE = false;
    window.OWNER_FOREST_SUMMON_OWNER = null;
    window.ORIGINAL_FOREST_SUMMON_OWNER = null;

    try{ summonMode = false; }catch(e){}
    try{ tributeMode = false; }catch(e){}
    try{ spellMode = false; }catch(e){}
    try{ travelerMode = false; }catch(e){}
    try{ attackDeclareMode = false; }catch(e){}
    try{ formationMode = false; }catch(e){}
    try{ moveMode = false; }catch(e){}
    try{ selectedAction = null; }catch(e){}

    const g = engine();
    if(g){
      g.travelerMode = false;
      g.attackDeclareMode = false;
      g.formationMode = false;
      g.moveMode = false;
      g.summonMode = false;
    }
  }

  function syncPhase(raw, label, msg){
    const g = engine();
    if(g){
      g.currentPlayer = "player";
      g.phase = raw;
      g.actionPhase = raw;
      g.subphase = raw;
      g.selectedAction = raw;
    }

    try{ phase = label; }catch(e){}
    try{ currentPhase = raw; }catch(e){}
    try{ mode = raw; }catch(e){}
    try{ currentPlayer = "player"; }catch(e){}

    window.XLW_ACTION_MODE = raw;
    window.SK_ACTION_MODE = raw;

    topPhase(label);
    show(msg);
  }

  function setActive(which){
    ["surviveTacticalBtn","surviveAttackBtn","surviveSummonBtn"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.classList.remove("active");
    });
    const map = {
      formation: "surviveTacticalBtn",
      attack: "surviveAttackBtn",
      summon: "surviveSummonBtn"
    };
    const el = document.getElementById(map[which]);
    if(el) el.classList.add("active");
  }

  function enterFormation(){
    clearModes();
    syncPhase("formation", "戰術佈陣", "已進入戰術佈陣：可移動單位，並可召喚不需獻祭單位或小旅人。");

    window.SK_FORMATION_MODE = true;
    try{ formationMode = true; }catch(e){}
    try{ moveMode = true; }catch(e){}
    try{ selectedAction = "formation"; }catch(e){}

    const g = engine();
    if(g){
      g.formationMode = true;
      g.moveMode = true;
      g.selectedAction = "formation";
    }

    document.body.classList.add("mode-formation");
    document.body.classList.remove("mode-attack-declare");

    setActive("formation");
    if(typeof render === "function") render();
  }

  function enterAttack(){
    clearModes();
    syncPhase("attack", "進攻宣言", "已進入進攻宣言：請選擇可進攻單位。");

    window.SK_ATTACK_DECLARE_MODE = true;
    try{ attackDeclareMode = true; }catch(e){}
    try{ selectedAction = "attack"; }catch(e){}

    const g = engine();
    if(g){
      g.attackDeclareMode = true;
      g.selectedAction = "attack";
    }

    document.body.classList.add("mode-attack-declare");
    document.body.classList.remove("mode-formation");

    setActive("attack");
    if(typeof render === "function") render();
  }

  function enterSummon(){
    clearModes();
    syncPhase("summon", "召喚階段", "請先點選手牌，再點選可召喚位置。");

    window.SK_HAND_SUMMON_MODE = true;
    try{ summonMode = true; }catch(e){}
    try{ selectedAction = "summon"; }catch(e){}

    const g = engine();
    if(g){
      g.summonMode = true;
      g.selectedAction = "summon";
    }

    setActive("summon");
    if(typeof render === "function") render();
  }

  function endTurn(){
    clearModes();

    const candidates = ["xlwEndPlayerTurn","endPlayerTurn","endTurn","nextTurn"];
    for(const name of candidates){
      if(typeof window[name] === "function"){
        window[name]();
        if(typeof render === "function") render();
        return;
      }
    }

    const g = engine();
    if(g){
      g.currentPlayer = "enemy";
      g.phase = "draw";
    }
    try{ currentPlayer = "enemy"; }catch(e){}
    try{ phase = "抽牌階段"; }catch(e){}
    show("結束我方回合。");
    if(typeof render === "function") render();
  }

  function makeBtn(id, label, cls, handler){
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "survive-action-btn " + cls;
    btn.dataset.label = label;
    btn.setAttribute("aria-label", label);
    // 重要：textContent 保持空字串，避免舊掃描器用文字把它隱藏
    btn.textContent = "";
    btn.addEventListener("click", function(e){
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
    return btn;
  }

  function rebuildPanel(){
    if(rebuilding) return;
    rebuilding = true;

    let panel = document.getElementById("surviveActionPanel");
    if(!panel){
      panel = document.createElement("div");
      panel.id = "surviveActionPanel";
      document.body.appendChild(panel);
    }

    panel.innerHTML = "";

    const row = document.createElement("div");
    row.className = "survive-action-row";
    row.appendChild(makeBtn("surviveTacticalBtn", "戰術佈陣", "tactical", enterFormation));
    row.appendChild(makeBtn("surviveAttackBtn", "進攻宣言", "attack", enterAttack));

    panel.appendChild(row);
    panel.appendChild(makeBtn("surviveSummonBtn", "召喚", "summon", enterSummon));
    panel.appendChild(makeBtn("surviveEndBtn", "結束我方回合", "end", endTurn));

    panel.style.setProperty("display","flex","important");
    panel.style.setProperty("visibility","visible","important");
    panel.style.setProperty("opacity","1","important");
    panel.style.setProperty("pointer-events","auto","important");

    rebuilding = false;
  }

  function hideOldPanels(){
    [
      "stableActionPanel",
      "fixedRightActionPanel",
      "finalRightControlPanel",
      "prettyRightControlPanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });

    // 舊按鈕可以隱藏，但不要影響換牌按鈕
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      if(btn.closest("#surviveActionPanel")) return;

      const txt = (btn.textContent || "").replace(/\s+/g,"");
      const isMulligan = txt.includes("換牌") || txt.includes("重抽") || txt.toLowerCase().includes("mulligan");

      if(isMulligan) return;

      if(
        txt.includes("戰術佈陣") ||
        txt.includes("進攻宣言") ||
        txt.includes("召喚手牌") ||
        txt.includes("祭品召喚") ||
        txt === "召喚" ||
        txt.includes("結束我方回合") ||
        txt.includes("結束回合")
      ){
        btn.style.setProperty("display","none","important");
        btn.style.setProperty("visibility","hidden","important");
        btn.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function ensurePanelAlive(){
    const panel = document.getElementById("surviveActionPanel");

    if(!panel || !document.body.contains(panel)){
      rebuildPanel();
    }else{
      panel.style.setProperty("display","flex","important");
      panel.style.setProperty("visibility","visible","important");
      panel.style.setProperty("opacity","1","important");
      panel.style.setProperty("pointer-events","auto","important");
    }

    hideOldPanels();
  }

  function installObserver(){
    if(observerInstalled) return;
    observerInstalled = true;

    const mo = new MutationObserver(()=>{
      requestAnimationFrame(ensurePanelAlive);
    });

    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }

  const oldRenderSurvivePanel = render;
  render = function(){
    oldRenderSurvivePanel();
    requestAnimationFrame(ensurePanelAlive);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    rebuildPanel();
    hideOldPanels();
    installObserver();
    setTimeout(ensurePanelAlive, 300);
    setTimeout(ensurePanelAlive, 1000);
  });

  // 立刻執行一次，避免換牌確認後到下一次 render 前空窗
  setTimeout(()=>{
    rebuildPanel();
    hideOldPanels();
    installObserver();
  }, 0);

})();


// ======================================================
// FIRST PLAYER TURN RULE FIX
// 規則：第一回合先手玩家只有召喚階段，不能進入戰術佈陣 / 進攻宣言。
// 後手玩家第一回合仍可進行戰術佈陣 / 進攻宣言。
// ======================================================
(function(){

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function getPlayerTurnNo(){
    const e = engine();

    const candidates = [
      e && e.playerTurn,
      e && e.playerTurnCount,
      e && e.turns && e.turns.player,
      window.playerTurn,
      window.playerTurnCount,
      typeof turn !== "undefined" ? turn : null
    ];

    for(const v of candidates){
      const n = Number(v);
      if(Number.isFinite(n) && n > 0) return n;
    }

    return 1;
  }

  function currentPlayer(){
    const e = engine();
    return (e && e.currentPlayer) || window.currentPlayer || "player";
  }

  function isFirstPlayerFirstTurn(){
    return currentPlayer() === "player" && getPlayerTurnNo() <= 1;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function blockFirstTurnAction(actionName){
    if(isFirstPlayerFirstTurn()){
      show("先手玩家第一回合只有召喚階段，不能進入「" + actionName + "」。");
      return true;
    }
    return false;
  }

  function syncFirstTurnButtonState(){
    const blocked = isFirstPlayerFirstTurn();

    [
      ["surviveTacticalBtn", "戰術佈陣"],
      ["surviveAttackBtn", "進攻宣言"],
      ["stableActionTactical", "戰術佈陣"],
      ["stableActionAttack", "進攻宣言"],
      ["fixedTacticalBtn", "戰術佈陣"],
      ["fixedAttackBtn", "進攻宣言"]
    ].forEach(([id, name])=>{
      const btn = document.getElementById(id);
      if(!btn) return;

      btn.disabled = blocked;
      btn.classList.toggle("first-turn-disabled", blocked);
      btn.title = blocked ? "先手玩家第一回合只有召喚階段" : "";

      // 保留按鈕可見，但反灰；避免使用者以為消失
      btn.style.setProperty("display", "block", "important");
      btn.style.setProperty("visibility", "visible", "important");
      btn.style.setProperty("pointer-events", blocked ? "none" : "auto", "important");
    });
  }

  // 捕獲階段：在原本 handler 前擋下第一回合先手的戰術/進攻
  document.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("button");
    if(!btn) return;

    const label =
      btn.dataset.label ||
      btn.getAttribute("aria-label") ||
      (btn.textContent || "");

    const compact = String(label).replace(/\s+/g, "");

    if(compact.includes("戰術佈陣") && blockFirstTurnAction("戰術佈陣")){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      syncFirstTurnButtonState();
      return false;
    }

    if(compact.includes("進攻宣言") && blockFirstTurnAction("進攻宣言")){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      syncFirstTurnButtonState();
      return false;
    }
  }, true);

  const oldRenderFirstPlayerTurnRule = render;

  render = function(){
    oldRenderFirstPlayerTurnRule();
    requestAnimationFrame(syncFirstTurnButtonState);
    setTimeout(syncFirstTurnButtonState, 120);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    syncFirstTurnButtonState();
    setTimeout(syncFirstTurnButtonState, 500);
    setTimeout(syncFirstTurnButtonState, 1200);
  });

})();



/* removed stuck end-turn auto enemy phase patch */



// ======================================================
// SAFE END TURN TO ENEMY AUTO RUNNER
// 深度原因：上一版在捕獲階段攔截「結束我方回合」，使用 stopImmediatePropagation，
// 使舊回合引擎原本的結束流程也被擋掉；接著又呼叫不存在或不完整的 AI 函式，
// 導致畫面停在中間狀態，看起來「直接卡住」。
// 本版改法：
// 1. 不使用捕獲階段攔截，不阻斷既有按鈕事件。
// 2. 重新建立唯一可用的「結束我方回合」按鈕，直接呼叫安全流程。
// 3. 對手流程即使沒有 AI 函式，也會自動完成並回到我方下一回合，不會卡住。
// 4. 流程：對手抽牌 -> 防守判定(若有) -> 對手召喚 -> 對手宣言/行動 -> 結束對手 -> 我方抽牌。
// ======================================================
(function(){

  let enemyAutoRunning = false;

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function setTop(owner, phaseText){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function setState(owner, rawPhase, zhPhase){
    const e = engine();
    if(e){
      e.currentPlayer = owner;
      e.phase = rawPhase;
      e.actionPhase = rawPhase;
      e.subphase = rawPhase;

      if(owner === "enemy" && rawPhase === "draw"){
        e.enemyTurn = Number(e.enemyTurn || 0) + 1;
      }

      if(owner === "player" && rawPhase === "draw"){
        e.playerTurn = Number(e.playerTurn || 0) + 1;
      }
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = rawPhase; }catch(err){}
    try{ mode = rawPhase; }catch(err){}
    try{ phase = zhPhase; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + rawPhase;
    window.SK_ACTION_MODE = owner + "_" + rawPhase;

    setTop(owner, zhPhase);
  }

  function safeRender(){
    try{
      if(typeof render === "function") render();
    }catch(e){
      console.error("render failed", e);
    }
  }

  function drawFor(owner, count){
    count = count || 2;

    // 優先用既有抽牌函式
    const fnNames = owner === "enemy"
      ? ["xlwEnemyDraw","enemyDraw","drawEnemyCards","drawEnemyCard","opponentDraw","aiDraw"]
      : ["xlwPlayerDraw","playerDraw","drawPlayerCards","drawCard","drawCards"];

    for(const name of fnNames){
      if(typeof window[name] === "function"){
        try{
          window[name](count);
          return true;
        }catch(e){}
      }
    }

    // 後備資料結構
    const pools = owner === "enemy"
      ? [
          [window.XLW_ENEMY && window.XLW_ENEMY.deck, window.XLW_ENEMY && window.XLW_ENEMY.hand],
          [window.enemy && window.enemy.deck, window.enemy && window.enemy.hand],
          [window.opponent && window.opponent.deck, window.opponent && window.opponent.hand],
          [window.enemyDeck, window.enemyHand]
        ]
      : [
          [window.deck, window.hand],
          [window.playerDeck, window.playerHand],
          [window.XLW_PLAYER && window.XLW_PLAYER.deck, window.XLW_PLAYER && window.XLW_PLAYER.hand]
        ];

    for(const pair of pools){
      const d = pair[0], h = pair[1];
      if(Array.isArray(d) && Array.isArray(h)){
        for(let i=0;i<count;i++){
          if(d.length) h.push(d.shift());
        }
        return true;
      }
    }

    return false;
  }

  function makeTraveler(owner, zone){
    const e = engine();
    return {
      card:{
        id: owner === "enemy" ? "TOKEN_ENEMY_TRAVELER" : "TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:owner,
      summonedTurn: owner === "enemy" ? ((e && e.enemyTurn) || 1) : ((e && e.playerTurn) || 1),
      summonedZone:zone
    };
  }

  function enemyHasEmptySlot(){
    if(!window.field) return null;
    for(let i=0;i<5;i++){
      if(field.enemy_front && !field.enemy_front[i]) return {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(field.enemy_back && !field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    }
    return null;
  }

  function enemySafeSummon(){
    // 優先使用既有 AI 召喚
    const fns = ["xlwEnemySummon","enemyAutoSummon","enemySummon","aiSummon","opponentSummon"];
    for(const name of fns){
      if(typeof window[name] === "function"){
        try{
          window[name]();
          return true;
        }catch(e){}
      }
    }

    // 保底：若對手場上有空位，召喚小旅人，確保能看到對手有動作
    const dest = enemyHasEmptySlot();
    if(dest){
      field[dest.zone][dest.idx] = makeTraveler("enemy", dest.zone);
      return true;
    }

    return false;
  }

  function needDefenseForEnemy(){
    const e = engine();
    return !!(
      window.PLAYER_ATTACK_DECLARED_LAST_TURN ||
      window.playerDeclaredAttackLastTurn ||
      window.lastPlayerDeclaredAttack ||
      window.pendingEnemyDefense ||
      (e && (
        e.playerDeclaredAttackLastTurn ||
        e.pendingEnemyDefense ||
        e.needEnemyDefense ||
        e.lastAttackOwner === "player"
      ))
    );
  }

  function resolveEnemyDefense(){
    const fns = ["resolveEnemyDefense","xlwResolveEnemyDefense","resolveDefense","resolveBattle","runDefenseBattle","autoResolveDefense"];
    for(const name of fns){
      if(typeof window[name] === "function"){
        try{
          window[name]();
          break;
        }catch(e){}
      }
    }

    window.PLAYER_ATTACK_DECLARED_LAST_TURN = false;
    window.playerDeclaredAttackLastTurn = false;
    window.lastPlayerDeclaredAttack = false;
    window.pendingEnemyDefense = false;

    const e = engine();
    if(e){
      e.playerDeclaredAttackLastTurn = false;
      e.pendingEnemyDefense = false;
      e.needEnemyDefense = false;
      e.lastAttackOwner = null;
    }
  }

  function enemyDeclareAttackIfPossible(){
    // 優先呼叫既有 AI 行動
    const fns = ["xlwEnemyAction","enemyAutoAction","enemyTakeAction","aiAction","enemyAttackDeclare","opponentAction"];
    for(const name of fns){
      if(typeof window[name] === "function"){
        try{
          window[name]();
          return true;
        }catch(e){}
      }
    }

    // 保底：讓第一個可攻擊的對手單位進入 attacking 狀態
    if(window.field && field.enemy_front){
      for(let i=0;i<5;i++){
        const u = field.enemy_front[i] || (field.enemy_back && field.enemy_back[i]);
        if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))){
          u.attacking = true;
          u.tapped = true;
          const e = engine();
          if(e) e.enemyDeclaredAttackLastTurn = true;
          window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;
          return true;
        }
      }
    }

    return false;
  }

  function finishEnemyTurnBackToPlayer(){
    setState("player", "draw", "抽牌階段");
    show("對手回合結束，進入我方抽牌階段。");

    drawFor("player", 2);

    // 清掉行動模式，避免卡在對手 attack
    window.XLW_ACTION_MODE = "player_draw";
    window.SK_ACTION_MODE = "player_draw";

    try{ attackDeclareMode = false; }catch(err){}
    try{ formationMode = false; }catch(err){}
    try{ summonMode = false; }catch(err){}

    const e = engine();
    if(e){
      e.attackDeclareMode = false;
      e.formationMode = false;
      e.summonMode = false;
    }

    enemyAutoRunning = false;
    safeRender();
  }

  function runEnemyTurnSequence(){
    if(enemyAutoRunning) return;
    enemyAutoRunning = true;

    setState("enemy", "draw", "抽牌階段");
    show("進入對手回合：對手抽 2 張牌。");
    drawFor("enemy", 2);
    safeRender();

    setTimeout(()=>{
      if(needDefenseForEnemy()){
        setState("enemy", "defense", "防守階段");
        show("對手防守階段：進行戰鬥判定。");
        resolveEnemyDefense();
        safeRender();
      }

      setTimeout(()=>{
        setState("enemy", "summon", "召喚階段");
        show("對手召喚階段。");
        enemySafeSummon();
        safeRender();

        setTimeout(()=>{
          setState("enemy", "attack", "進攻宣言");
          const didAttack = enemyDeclareAttackIfPossible();
          show(didAttack ? "對手進行進攻宣言。" : "對手沒有可進攻單位，跳過進攻。");
          safeRender();

          setTimeout(()=>{
            finishEnemyTurnBackToPlayer();
          }, 900);

        }, 900);

      }, 900);

    }, 900);
  }

  function replaceEndButtons(){
    // 綁定目前所有結束回合按鈕。不要用 capture/stopImmediatePropagation，避免卡住舊流程。
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      const label = btn.dataset.label || btn.getAttribute("aria-label") || btn.textContent || "";
      const txt = String(label).replace(/\s+/g,"");

      if(!(txt.includes("結束我方回合") || txt.includes("結束回合"))) return;

      if(btn.dataset.safeEnemyRunnerBound === "1") return;
      btn.dataset.safeEnemyRunnerBound = "1";

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        runEnemyTurnSequence();
        return false;
      };

      btn.style.setProperty("display","block","important");
      btn.style.setProperty("visibility","visible","important");
      btn.style.setProperty("pointer-events","auto","important");
    });
  }

  const oldRenderSafeEndTurn = render;
  render = function(){
    oldRenderSafeEndTurn();
    requestAnimationFrame(replaceEndButtons);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    replaceEndButtons();
    setTimeout(replaceEndButtons, 500);
    setTimeout(replaceEndButtons, 1200);
  });

})();


// ======================================================
// AUTHORITATIVE FLOW RULES PATCH
// 規則修正：
// 1. 雙方初始手牌固定 4 張。
// 2. 雙方抽牌階段自動抽 2 張。
// 3. 召喚階段後，只能二選一：戰術佈陣 或 進攻宣言，不會兩個都執行。
// 4. 先手玩家第一回合：只有召喚階段，不能戰術佈陣 / 進攻宣言。
// 5. 戰術佈陣階段：可先召喚 1 個不需獻祭單位 或 1 個小旅人；完成後才移動。
// 6. 移動原則：水平任意移動；非當回合召喚可前後移；當回合召喚只能往前，不能往後。
// ======================================================
(function(){

  const FLOW = window.XLW_FLOW_RULES = window.XLW_FLOW_RULES || {
    normalizedOpeningHand:false,
    currentPlayer:"player",
    playerTurn:1,
    enemyTurn:0,
    phase:"mulligan",
    actionChoice:null,
    summonUsed:false,
    formationSummonUsed:false,
    formationSummonDone:false,
    movementUnlocked:false
  };

  function E(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function setTop(owner, phaseText){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function getPlayerHand(){
    return Array.isArray(window.hand) ? window.hand :
           Array.isArray(window.playerHand) ? window.playerHand :
           (window.XLW_PLAYER && Array.isArray(window.XLW_PLAYER.hand)) ? window.XLW_PLAYER.hand :
           null;
  }

  function getPlayerDeck(){
    return Array.isArray(window.deck) ? window.deck :
           Array.isArray(window.playerDeck) ? window.playerDeck :
           (window.XLW_PLAYER && Array.isArray(window.XLW_PLAYER.deck)) ? window.XLW_PLAYER.deck :
           null;
  }

  function getEnemyHand(){
    return (window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.hand)) ? window.XLW_ENEMY.hand :
           Array.isArray(window.enemyHand) ? window.enemyHand :
           (window.enemy && Array.isArray(window.enemy.hand)) ? window.enemy.hand :
           null;
  }

  function getEnemyDeck(){
    return (window.XLW_ENEMY && Array.isArray(window.XLW_ENEMY.deck)) ? window.XLW_ENEMY.deck :
           Array.isArray(window.enemyDeck) ? window.enemyDeck :
           (window.enemy && Array.isArray(window.enemy.deck)) ? window.enemy.deck :
           null;
  }

  function draw(owner, n){
    const hand = owner === "enemy" ? getEnemyHand() : getPlayerHand();
    const deck = owner === "enemy" ? getEnemyDeck() : getPlayerDeck();

    if(!hand || !deck) return false;

    for(let i=0;i<n;i++){
      if(deck.length) hand.push(deck.shift());
    }

    return true;
  }

  function setHandToFour(owner){
    const hand = owner === "enemy" ? getEnemyHand() : getPlayerHand();
    const deck = owner === "enemy" ? getEnemyDeck() : getPlayerDeck();

    if(!hand || !deck) return false;

    while(hand.length > 4){
      deck.unshift(hand.pop());
    }

    while(hand.length < 4 && deck.length){
      hand.push(deck.shift());
    }

    return true;
  }

  function normalizeOpeningHands(){
    if(FLOW.normalizedOpeningHand) return;

    const ok1 = setHandToFour("player");
    const ok2 = setHandToFour("enemy");

    if(ok1 || ok2){
      FLOW.normalizedOpeningHand = true;
      show("雙方初始手牌已設定為 4 張。");
    }
  }

  function syncState(owner, rawPhase, zhPhase){
    FLOW.currentPlayer = owner;
    FLOW.phase = rawPhase;

    const e = E();
    if(e){
      e.currentPlayer = owner;
      e.phase = rawPhase;
      e.actionPhase = rawPhase;
      e.subphase = rawPhase;
      e.playerTurn = FLOW.playerTurn;
      e.enemyTurn = FLOW.enemyTurn;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = rawPhase; }catch(err){}
    try{ mode = rawPhase; }catch(err){}
    try{ phase = zhPhase; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + rawPhase;
    window.SK_ACTION_MODE = owner + "_" + rawPhase;

    setTop(owner, zhPhase);
  }

  function isFirstPlayerFirstTurn(){
    return FLOW.currentPlayer === "player" && FLOW.playerTurn <= 1;
  }

  function resetPhaseFlags(){
    FLOW.actionChoice = null;
    FLOW.summonUsed = false;
    FLOW.formationSummonUsed = false;
    FLOW.formationSummonDone = false;
    FLOW.movementUnlocked = false;

    const e = E();
    if(e){
      e._summonUsed = false;
      e._formationUsed = false;
      e.normalSummonUsed = false;
      e.tacticalSummonUsed = false;
    }

    window.normalSummonUsed = false;
    window.tacticalSummonUsed = false;
  }

  function startTurn(owner){
    FLOW.currentPlayer = owner;

    if(owner === "enemy"){
      FLOW.enemyTurn += 1;
    }else{
      // 第一次開局 playerTurn 已是 1；從對手回來才 +1
      if(FLOW.phase === "enemy_end" || FLOW.currentPlayer === "player_after_enemy"){
        FLOW.playerTurn += 1;
      }
    }

    resetPhaseFlags();

    syncState(owner, "draw", "抽牌階段");
    draw(owner, 2);
    show((owner === "enemy" ? "對手" : "我方") + "抽牌階段：自動抽 2 張。");

    setTimeout(()=>{
      startSummonPhase(owner);
    }, owner === "enemy" ? 650 : 250);
  }

  function startOpeningPlayerSummon(){
    normalizeOpeningHands();

    FLOW.currentPlayer = "player";
    FLOW.playerTurn = 1;
    resetPhaseFlags();

    syncState("player", "summon", "召喚階段");
    show("先手第一回合：只有召喚階段。不能戰術佈陣或進攻宣言。");
    updateButtons();
  }

  function startSummonPhase(owner){
    syncState(owner, "summon", "召喚階段");
    FLOW.summonUsed = false;

    show((owner === "enemy" ? "對手" : "我方") + "召喚階段：可召喚 1 個單位或 1 個小旅人。");

    if(owner === "enemy"){
      setTimeout(()=>{
        enemyAutoSummon();
        afterSummonChoice("enemy");
      }, 650);
    }

    updateButtons();
    if(typeof render === "function") render();
  }

  function afterSummonChoice(owner){
    if(owner === "player" && isFirstPlayerFirstTurn()){
      show("先手第一回合召喚階段結束，將進入對手回合。");
      setTimeout(()=>endTurnToOtherPlayer(), 650);
      return;
    }

    syncState(owner, "choose_action", "行動選擇");
    show((owner === "enemy" ? "對手" : "我方") + "召喚階段完成：請二選一，戰術佈陣或進攻宣言。");

    if(owner === "enemy"){
      setTimeout(()=>{
        // 對手簡易 AI：優先進攻，沒有可攻擊才戰術
        enterAttack(owner);
        setTimeout(()=>endTurnToOtherPlayer(), 900);
      }, 650);
    }

    updateButtons();
  }

  function enterFormation(owner){
    owner = owner || FLOW.currentPlayer;

    if(owner === "player" && isFirstPlayerFirstTurn()){
      show("先手玩家第一回合只有召喚階段，不能戰術佈陣。");
      return;
    }

    if(FLOW.actionChoice && FLOW.actionChoice !== "formation"){
      show("召喚階段後只能二選一：本回合已選擇進攻宣言，不能再戰術佈陣。");
      return;
    }

    FLOW.actionChoice = "formation";
    FLOW.formationSummonUsed = false;
    FLOW.formationSummonDone = false;
    FLOW.movementUnlocked = false;

    syncState(owner, "formation_summon", "戰術佈陣：召喚");
    show("戰術佈陣：可先召喚 1 個不需獻祭單位或 1 個小旅人；完成後才可移動單位。");

    window.SK_FORMATION_MODE = true;
    try{ formationMode = true; }catch(e){}
    try{ moveMode = false; }catch(e){}
    try{ selectedAction = "formation"; }catch(e){}

    const eng = E();
    if(eng){
      eng.formationMode = true;
      eng.moveMode = false;
      eng.selectedAction = "formation";
    }

    document.body.classList.add("mode-formation");
    document.body.classList.remove("mode-attack-declare");

    updateButtons();
    if(typeof render === "function") render();
  }

  function finishFormationSummonAndUnlockMove(){
    if(FLOW.phase !== "formation_summon") return;

    FLOW.formationSummonDone = true;
    FLOW.movementUnlocked = true;

    syncState(FLOW.currentPlayer, "formation_move", "戰術佈陣：移動");
    show("戰術佈陣移動階段：水平任意移動；非當回合召喚可前後移，當回合召喚只能往前不能往後。");

    try{ moveMode = true; }catch(e){}

    const eng = E();
    if(eng){
      eng.moveMode = true;
      eng.formationMode = true;
    }

    updateButtons();
    if(typeof render === "function") render();
  }

  function enterAttack(owner){
    owner = owner || FLOW.currentPlayer;

    if(owner === "player" && isFirstPlayerFirstTurn()){
      show("先手玩家第一回合只有召喚階段，不能進攻宣言。");
      return;
    }

    if(FLOW.actionChoice && FLOW.actionChoice !== "attack"){
      show("召喚階段後只能二選一：本回合已選擇戰術佈陣，不能再進攻宣言。");
      return;
    }

    FLOW.actionChoice = "attack";

    syncState(owner, "attack", "進攻宣言");
    show((owner === "enemy" ? "對手" : "我方") + "進入進攻宣言階段。");

    window.SK_ATTACK_DECLARE_MODE = true;
    try{ attackDeclareMode = true; }catch(e){}
    try{ selectedAction = "attack"; }catch(e){}

    const eng = E();
    if(eng){
      eng.attackDeclareMode = true;
      eng.selectedAction = "attack";
    }

    document.body.classList.add("mode-attack-declare");
    document.body.classList.remove("mode-formation");

    updateButtons();
    if(typeof render === "function") render();
  }

  function endTurnToOtherPlayer(){
    if(FLOW.currentPlayer === "player"){
      FLOW.phase = "player_end";
      syncState("enemy", "draw", "抽牌階段");
      startTurn("enemy");
    }else{
      FLOW.phase = "enemy_end";
      FLOW.currentPlayer = "player_after_enemy";
      FLOW.playerTurn += 1;
      resetPhaseFlags();
      syncState("player", "draw", "抽牌階段");
      draw("player", 2);
      show("對手回合結束，進入我方抽牌階段：自動抽 2 張。");

      setTimeout(()=>{
        startSummonPhase("player");
      }, 650);
    }
  }

  function enemyAutoSummon(){
    // 優先既有 AI
    const fns = ["xlwEnemySummon","enemyAutoSummon","enemySummon","aiSummon","opponentSummon"];
    for(const name of fns){
      if(typeof window[name] === "function" && window[name] !== enemyAutoSummon){
        try{
          window[name]();
          FLOW.summonUsed = true;
          return;
        }catch(e){}
      }
    }

    // 保底：召喚小旅人
    if(window.field){
      for(let i=0;i<5;i++){
        if(field.enemy_front && !field.enemy_front[i]){
          field.enemy_front[i] = makeTraveler("enemy","enemy_front");
          FLOW.summonUsed = true;
          return;
        }
      }
      for(let i=0;i<5;i++){
        if(field.enemy_back && !field.enemy_back[i]){
          field.enemy_back[i] = makeTraveler("enemy","enemy_back");
          FLOW.summonUsed = true;
          return;
        }
      }
    }
  }

  function makeTraveler(owner, zone){
    return {
      card:{
        id: owner === "enemy" ? "TOKEN_ENEMY_TRAVELER" : "TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:owner,
      summonedTurn: owner === "enemy" ? FLOW.enemyTurn : FLOW.playerTurn,
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function updateButtons(){
    const tactical = document.getElementById("surviveTacticalBtn") || document.getElementById("stableActionTactical");
    const attack = document.getElementById("surviveAttackBtn") || document.getElementById("stableActionAttack");
    const summon = document.getElementById("surviveSummonBtn") || document.getElementById("stableActionSummon");
    const end = document.getElementById("surviveEndBtn") || document.getElementById("stableActionEnd");

    const firstBlocked = FLOW.currentPlayer === "player" && FLOW.playerTurn <= 1;
    const canChoose = FLOW.phase === "choose_action";

    if(tactical){
      tactical.disabled = firstBlocked || !canChoose || !!(FLOW.actionChoice && FLOW.actionChoice !== "formation");
      tactical.classList.toggle("rule-disabled", tactical.disabled);
    }

    if(attack){
      attack.disabled = firstBlocked || !canChoose || !!(FLOW.actionChoice && FLOW.actionChoice !== "attack");
      attack.classList.toggle("rule-disabled", attack.disabled);
    }

    if(summon){
      summon.disabled = !(FLOW.phase === "summon" || FLOW.phase === "formation_summon");
      summon.classList.toggle("rule-disabled", summon.disabled);
    }

    if(end){
      end.disabled = false;
      end.classList.remove("rule-disabled");
    }
  }

  function bindFlowButtons(){
    const tactical = document.getElementById("surviveTacticalBtn") || document.getElementById("stableActionTactical");
    const attack = document.getElementById("surviveAttackBtn") || document.getElementById("stableActionAttack");
    const end = document.getElementById("surviveEndBtn") || document.getElementById("stableActionEnd");

    if(tactical && tactical.dataset.flowRuleBound !== "1"){
      tactical.dataset.flowRuleBound = "1";
      tactical.addEventListener("click", function(e){
        if(tactical.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        enterFormation("player");
      }, true);
    }

    if(attack && attack.dataset.flowRuleBound !== "1"){
      attack.dataset.flowRuleBound = "1";
      attack.addEventListener("click", function(e){
        if(attack.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        enterAttack("player");
      }, true);
    }

    if(end && end.dataset.flowRuleBound !== "1"){
      end.dataset.flowRuleBound = "1";
      end.addEventListener("click", function(e){
        e.preventDefault();
        e.stopPropagation();
        endTurnToOtherPlayer();
      }, true);
    }
  }

  // 召喚成功後：召喚階段 -> 行動二選一；戰術召喚 -> 解鎖移動
  function watchSummonByFieldCount(){
    let lastCounts = null;

    function count(owner){
      if(!window.field) return 0;
      const zones = owner === "enemy" ? ["enemy_front","enemy_back"] : ["player_front","player_back"];
      let n = 0;
      zones.forEach(z => (field[z] || []).forEach(u => { if(u) n++; }));
      return n;
    }

    setInterval(()=>{
      const owner = FLOW.currentPlayer;
      const now = count(owner);

      if(lastCounts === null){
        lastCounts = {owner, count:now};
        return;
      }

      if(lastCounts.owner !== owner || FLOW.phase === "draw"){
        lastCounts = {owner, count:now};
        return;
      }

      if(now > lastCounts.count){
        if(FLOW.phase === "summon"){
          FLOW.summonUsed = true;
          lastCounts = {owner, count:now};
          setTimeout(()=>afterSummonChoice(owner), 150);
          return;
        }

        if(FLOW.phase === "formation_summon"){
          FLOW.formationSummonUsed = true;
          lastCounts = {owner, count:now};
          setTimeout(()=>finishFormationSummonAndUnlockMove(), 150);
          return;
        }
      }

      lastCounts = {owner, count:now};
    }, 350);
  }

  window.XLW_FLOW_API = {
    startOpeningPlayerSummon,
    startTurn,
    startSummonPhase,
    afterSummonChoice,
    enterFormation,
    enterAttack,
    endTurnToOtherPlayer,
    finishFormationSummonAndUnlockMove
  };

  const oldRenderFlowRules = render;
  render = function(){
    oldRenderFlowRules();
    requestAnimationFrame(()=>{
      normalizeOpeningHands();
      bindFlowButtons();
      updateButtons();
    });
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(()=>{
      normalizeOpeningHands();
      bindFlowButtons();
      updateButtons();
      watchSummonByFieldCount();
    }, 500);
  });

})();


// ======================================================
// FLOW / ENEMY REAL DRAW / ACTION BUTTON FINAL FIX
// 本版修正：
// 1. 右下角按鈕區再往上移。
// 2. 戰術佈陣 / 進攻宣言不再永久反灰，並用高亮顯示已選擇。
// 3. 我方第一回合召喚階段：召喚單位 / 召喚小旅人只能二選一。
// 4. 對手真的抽牌：從對手牌庫移到手牌，牌庫顯示同步扣除。
// 5. 對手會自動召喚手牌單位；若無可召喚手牌，才召喚小旅人；再二選一戰術或進攻。
// ======================================================
(function(){

  const FIX = window.XLW_FINAL_FLOW_FIX = window.XLW_FINAL_FLOW_FIX || {
    phaseKey: "",
    playerSummonUsed: false,
    enemySummonUsed: false,
    enemyLastDeckCount: null
  };

  function E(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function FLOW(){
    window.XLW_FLOW_RULES = window.XLW_FLOW_RULES || {};
    return window.XLW_FLOW_RULES;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function top(owner, phaseText){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function getCurrentOwner(){
    const e = E();
    return (FLOW().currentPlayer || (e && e.currentPlayer) || window.currentPlayer || "player");
  }

  function getPhase(){
    const e = E();
    return String(FLOW().phase || (e && e.phase) || window.currentPhase || window.mode || "");
  }

  function getTurn(owner){
    const e = E();
    if(owner === "enemy") return Number(FLOW().enemyTurn || (e && e.enemyTurn) || window.enemyTurn || 0);
    return Number(FLOW().playerTurn || (e && e.playerTurn) || window.playerTurn || window.turn || 1);
  }

  function phaseKey(){
    return getCurrentOwner() + ":" + getTurn(getCurrentOwner()) + ":" + getPhase();
  }

  function resetIfNewPhase(){
    const k = phaseKey();
    if(FIX.phaseKey !== k){
      FIX.phaseKey = k;
      FIX.playerSummonUsed = false;
      FIX.enemySummonUsed = false;
    }
  }

  function setState(owner, raw, zh){
    const f = FLOW();
    f.currentPlayer = owner;
    f.phase = raw;

    const e = E();
    if(e){
      e.currentPlayer = owner;
      e.phase = raw;
      e.actionPhase = raw;
      e.subphase = raw;
      e.playerTurn = f.playerTurn || e.playerTurn || 1;
      e.enemyTurn = f.enemyTurn || e.enemyTurn || 0;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = raw; }catch(err){}
    try{ mode = raw; }catch(err){}
    try{ phase = zh; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + raw;
    window.SK_ACTION_MODE = owner + "_" + raw;

    top(owner, zh);
    resetIfNewPhase();
  }

  function isPlayerFirstTurn(){
    return getCurrentOwner() === "player" && getTurn("player") <= 1;
  }

  function getPlayerHand(){
    return Array.isArray(window.hand) ? window.hand :
           Array.isArray(window.playerHand) ? window.playerHand :
           (window.XLW_PLAYER && Array.isArray(window.XLW_PLAYER.hand)) ? window.XLW_PLAYER.hand :
           null;
  }

  function getPlayerDeck(){
    return Array.isArray(window.deck) ? window.deck :
           Array.isArray(window.playerDeck) ? window.playerDeck :
           (window.XLW_PLAYER && Array.isArray(window.XLW_PLAYER.deck)) ? window.XLW_PLAYER.deck :
           null;
  }

  function getEnemyObj(){
    if(window.XLW_ENEMY) return window.XLW_ENEMY;
    if(window.enemy) return window.enemy;
    if(window.opponent) return window.opponent;
    window.XLW_ENEMY = window.XLW_ENEMY || {deck:[], hand:[]};
    return window.XLW_ENEMY;
  }

  function getEnemyHand(){
    const obj = getEnemyObj();
    if(obj && Array.isArray(obj.hand)) return obj.hand;
    if(Array.isArray(window.enemyHand)) return window.enemyHand;
    obj.hand = obj.hand || [];
    return obj.hand;
  }

  function getEnemyDeck(){
    const obj = getEnemyObj();
    if(obj && Array.isArray(obj.deck)) return obj.deck;
    if(Array.isArray(window.enemyDeck)) return window.enemyDeck;
    obj.deck = obj.deck || [];
    return obj.deck;
  }

  function makeFallbackEnemyDeckIfNeeded(){
    const deck = getEnemyDeck();
    if(deck.length) return deck;

    // 若舊版只有假張數，補成 20 張簡單單位，確保真的能抽。
    for(let i=0;i<20;i++){
      deck.push({
        id:"ENEMY_AUTO_" + i,
        name:"妖怪村民",
        type:"unit",
        attack:2,
        atk:2,
        score:2,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:""
      });
    }
    return deck;
  }

  function drawReal(owner, n){
    n = n || 2;
    let hand, deck;

    if(owner === "enemy"){
      deck = makeFallbackEnemyDeckIfNeeded();
      hand = getEnemyHand();
    }else{
      deck = getPlayerDeck();
      hand = getPlayerHand();
    }

    if(!deck || !hand) return false;

    let drew = 0;
    for(let i=0;i<n;i++){
      if(deck.length){
        hand.push(deck.shift());
        drew++;
      }
    }

    if(owner === "enemy"){
      syncEnemyDeckDisplay();
    }

    return drew > 0;
  }

  function syncEnemyDeckDisplay(){
    const deck = getEnemyDeck();
    const count = deck ? deck.length : 0;
    FIX.enemyLastDeckCount = count;

    // 常見變數同步
    window.enemyDeckCount = count;
    window.enemyDeckFakeCount = count;
    if(window.XLW_ENEMY) window.XLW_ENEMY.deckCount = count;

    const selectors = [
      "#enemyDeckCount",
      "#enemyDeck .count",
      "#enemyDeck",
      ".enemy-deck-count",
      "[data-counter='enemyDeck']",
      "[data-zone='enemy_deck']"
    ];

    selectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        if(!el) return;
        if(el.children.length === 0 || el.id === "enemyDeckCount" || el.classList.contains("count")){
          el.textContent = String(count);
        }else{
          const c = el.querySelector(".count,.deck-count,.badge");
          if(c) c.textContent = String(count);
        }
      });
    });
  }

  function markSummonUsed(owner, source){
    if(owner === "enemy"){
      FIX.enemySummonUsed = true;
      FLOW().summonUsed = true;
    }else{
      FIX.playerSummonUsed = true;
      FLOW().summonUsed = true;
    }

    const e = E();
    if(e){
      e._summonUsed = true;
      e.normalSummonUsed = true;
    }

    window.normalSummonUsed = true;
    updateActionButtons();

    show((owner === "enemy" ? "對手" : "我方") + "已完成召喚，本階段不能再召喚其他單位或小旅人。");
  }

  function currentSummonUsed(owner){
    resetIfNewPhase();
    return owner === "enemy" ? FIX.enemySummonUsed || FLOW().summonUsed : FIX.playerSummonUsed || FLOW().summonUsed;
  }

  function playerCanSummon(){
    const p = getPhase();
    return getCurrentOwner() === "player" && (p === "summon" || p === "formation_summon") && !currentSummonUsed("player");
  }

  function blockIfPlayerSummonUsed(label){
    if(!playerCanSummon()){
      const p = getPhase();
      if(p === "summon" || p === "formation_summon"){
        show("本階段已召喚過單位或小旅人，不能再召喚「" + label + "」。");
        return true;
      }
    }
    return false;
  }

  // 包住手牌召喚：成功召喚單位後，禁止再召喚小旅人。
  const oldSummonHandTo = window.summonHandTo;
  if(typeof oldSummonHandTo === "function" && !window.__XLW_FINAL_SUMMON_LOCK_PATCHED__){
    window.__XLW_FINAL_SUMMON_LOCK_PATCHED__ = true;
    window.summonHandTo = function(zone, idx){
      if(blockIfPlayerSummonUsed("單位")) return false;
      const before = countUnits("player");
      const r = oldSummonHandTo.apply(this, arguments);
      const after = countUnits("player");
      if(r !== false && after > before){
        markSummonUsed("player", "unit");
      }
      return r;
    };
  }

  function countUnits(owner){
    if(!window.field) return 0;
    const zones = owner === "enemy" ? ["enemy_front","enemy_back"] : ["player_front","player_back"];
    let n = 0;
    zones.forEach(z => (field[z] || []).forEach(u => { if(u) n++; }));
    return n;
  }

  // 攔截小旅人按鈕：若已召喚單位，禁止召喚小旅人。
  document.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("button");
    if(!btn) return;

    const label = (btn.dataset.label || btn.getAttribute("aria-label") || btn.textContent || "").replace(/\s+/g,"");

    if(label.includes("召喚小旅人")){
      const owner = btn.closest("#enemyForest") ? "enemy" : "player";
      if(owner === "player" && blockIfPlayerSummonUsed("小旅人")){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
      }
    }
  }, true);

  // 偵測場上單位增加：不論是拖曳召喚、點格召喚、小旅人，都視為召喚已用。
  let lastPlayerCount = null;
  let lastEnemyCount = null;
  function watchSummonCounts(){
    const pc = countUnits("player");
    const ec = countUnits("enemy");

    if(lastPlayerCount === null){ lastPlayerCount = pc; }
    if(lastEnemyCount === null){ lastEnemyCount = ec; }

    if(getCurrentOwner() === "player" && (getPhase() === "summon" || getPhase() === "formation_summon") && pc > lastPlayerCount){
      markSummonUsed("player", "field-increase");
    }

    if(getCurrentOwner() === "enemy" && getPhase() === "summon" && ec > lastEnemyCount){
      markSummonUsed("enemy", "field-increase");
    }

    lastPlayerCount = pc;
    lastEnemyCount = ec;
  }

  function makeTraveler(owner, zone){
    return {
      card:{
        id: owner === "enemy" ? "TOKEN_ENEMY_TRAVELER" : "TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:"無任何特殊能力。"
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:owner,
      summonedTurn: getTurn(owner),
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function enemyEmptySlot(){
    if(!window.field) return null;
    for(let i=0;i<5;i++) if(field.enemy_front && !field.enemy_front[i]) return {zone:"enemy_front", idx:i};
    for(let i=0;i<5;i++) if(field.enemy_back && !field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    return null;
  }

  function cardCanAutoSummon(card){
    const tribute = Number(card.tribute || card.cost || card.sacrifice || 0);
    return !tribute;
  }

  function enemySummonFromHandOrTraveler(){
    if(currentSummonUsed("enemy")) return false;

    const hand = getEnemyHand();
    const dest = enemyEmptySlot();
    if(!dest) return false;

    if(hand && hand.length){
      let idx = hand.findIndex(c => c && (c.type === "unit" || c.card_type === "unit") && cardCanAutoSummon(c));
      if(idx < 0) idx = hand.findIndex(c => c && cardCanAutoSummon(c));

      if(idx >= 0){
        const card = hand.splice(idx, 1)[0];
        field[dest.zone][dest.idx] = {
          card,
          tapped:false,
          attacking:false,
          target:null,
          summonedBy:"enemy",
          summonedTurn:getTurn("enemy"),
          summonedZone:dest.zone,
          summonedThisTurn:true
        };
        markSummonUsed("enemy", "hand");
        syncEnemyDeckDisplay();
        return true;
      }
    }

    field[dest.zone][dest.idx] = makeTraveler("enemy", dest.zone);
    markSummonUsed("enemy", "traveler");
    syncEnemyDeckDisplay();
    return true;
  }

  function enemyCanAttack(){
    if(!window.field) return false;
    for(let i=0;i<5;i++){
      const u = (field.enemy_front && field.enemy_front[i]) || (field.enemy_back && field.enemy_back[i]);
      if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))) return true;
    }
    return false;
  }

  function enemyDeclareAttack(){
    if(!window.field) return false;
    for(let i=0;i<5;i++){
      const u = (field.enemy_front && field.enemy_front[i]) || (field.enemy_back && field.enemy_back[i]);
      if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))){
        u.attacking = true;
        u.tapped = true;
        window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;
        const e = E();
        if(e) e.enemyDeclaredAttackLastTurn = true;
        return true;
      }
    }
    return false;
  }

  function enemyDoFormation(){
    // 簡化 AI：若有可移動的後排單位且前方空，往前移
    if(!window.field) return false;
    for(let i=0;i<5;i++){
      if(field.enemy_back && field.enemy_back[i] && field.enemy_front && !field.enemy_front[i]){
        field.enemy_front[i] = field.enemy_back[i];
        field.enemy_back[i] = null;
        show("對手執行戰術佈陣，將單位往前移動。");
        return true;
      }
    }
    show("對手執行戰術佈陣。");
    return true;
  }

  function afterSummonChooseAction(owner){
    const f = FLOW();

    if(owner === "player"){
      if(isPlayerFirstTurn()){
        show("先手第一回合召喚完成，不能戰術佈陣或進攻宣言，請結束回合。");
        updateActionButtons();
        return;
      }

      f.phase = "choose_action";
      setState("player", "choose_action", "行動選擇");
      show("召喚階段完成：請選擇戰術佈陣或進攻宣言（二選一）。");
      updateActionButtons();
      return;
    }

    // 對手召喚完成後二選一：能攻擊則進攻，否則戰術。
    if(enemyCanAttack()){
      setState("enemy", "attack", "進攻宣言");
      enemyDeclareAttack();
      show("對手選擇進攻宣言。");
    }else{
      setState("enemy", "formation_move", "戰術佈陣");
      enemyDoFormation();
    }
  }

  function setState(owner, raw, zh){
    const f = FLOW();
    f.currentPlayer = owner;
    f.phase = raw;

    const e = E();
    if(e){
      e.currentPlayer = owner;
      e.phase = raw;
      e.actionPhase = raw;
      e.subphase = raw;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = raw; }catch(err){}
    try{ mode = raw; }catch(err){}
    try{ phase = zh; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + raw;
    window.SK_ACTION_MODE = owner + "_" + raw;

    top(owner, zh);
    resetIfNewPhase();
  }

  function startEnemyTurnReal(){
    const f = FLOW();
    f.currentPlayer = "enemy";
    f.enemyTurn = Number(f.enemyTurn || 0) + 1;
    f.summonUsed = false;
    FIX.enemySummonUsed = false;

    setState("enemy", "draw", "抽牌階段");
    drawReal("enemy", 2);
    show("對手抽牌階段：對手真的抽 2 張，牌庫張數已扣除。");

    if(typeof render === "function") render();

    setTimeout(()=>{
      setState("enemy", "summon", "召喚階段");
      show("對手召喚階段。");
      enemySummonFromHandOrTraveler();
      if(typeof render === "function") render();

      setTimeout(()=>{
        afterSummonChooseAction("enemy");
        if(typeof render === "function") render();
      }, 700);
    }, 700);
  }

  function updateActionButtons(){
    const tactical = document.getElementById("surviveTacticalBtn") || document.getElementById("stableActionTactical") || document.getElementById("stableActionTactical");
    const attack = document.getElementById("surviveAttackBtn") || document.getElementById("stableActionAttack");
    const summon = document.getElementById("surviveSummonBtn") || document.getElementById("stableActionSummon");

    const p = getPhase();
    const first = isPlayerFirstTurn();
    const canChoose = getCurrentOwner() === "player" && p === "choose_action";
    const actionChoice = FLOW().actionChoice;

    if(tactical){
      tactical.disabled = first || !canChoose || (actionChoice && actionChoice !== "formation");
      tactical.classList.toggle("rule-disabled", !!tactical.disabled);
      tactical.classList.toggle("active-choice", actionChoice === "formation");
    }

    if(attack){
      attack.disabled = first || !canChoose || (actionChoice && actionChoice !== "attack");
      attack.classList.toggle("rule-disabled", !!attack.disabled);
      attack.classList.toggle("active-choice", actionChoice === "attack");
    }

    if(summon){
      const can = getCurrentOwner() === "player" && (p === "summon" || p === "formation_summon") && !currentSummonUsed("player");
      summon.disabled = !can;
      summon.classList.toggle("rule-disabled", !can);
    }

    // 小旅人森林按鈕也同步反灰
    const forestBtn = document.querySelector("#playerForest button");
    if(forestBtn){
      const can = playerCanSummon();
      forestBtn.disabled = !can;
      forestBtn.classList.toggle("rule-disabled", !can);
    }

    syncEnemyDeckDisplay();
  }

  function movePanelUp(){
    ["surviveActionPanel","stableActionPanel","fixedRightActionPanel"].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("bottom", "220px", "important");
      }
    });
  }

  function bindButtonsOverride(){
    const tactical = document.getElementById("surviveTacticalBtn") || document.getElementById("stableActionTactical");
    const attack = document.getElementById("surviveAttackBtn") || document.getElementById("stableActionAttack");

    if(tactical && tactical.dataset.finalFlowBound !== "1"){
      tactical.dataset.finalFlowBound = "1";
      tactical.addEventListener("click", function(e){
        if(tactical.disabled) return;
        e.preventDefault(); e.stopPropagation();
        FLOW().actionChoice = "formation";
        setState("player","formation_summon","戰術佈陣：召喚");
        show("已選擇戰術佈陣：先召喚不需獻祭單位或小旅人，再移動單位。");
        updateActionButtons();
      }, true);
    }

    if(attack && attack.dataset.finalFlowBound !== "1"){
      attack.dataset.finalFlowBound = "1";
      attack.addEventListener("click", function(e){
        if(attack.disabled) return;
        e.preventDefault(); e.stopPropagation();
        FLOW().actionChoice = "attack";
        setState("player","attack","進攻宣言");
        show("已選擇進攻宣言：請選擇可進攻單位。");
        updateActionButtons();
      }, true);
    }
  }

  // 將原本安全對手流程中的抽牌替換為真抽牌
  const oldEndSafe = window.XLW_START_ENEMY_TURN_REAL;
  window.XLW_START_ENEMY_TURN_REAL = startEnemyTurnReal;

  function bindEndTurnToRealEnemy(){
    Array.from(document.querySelectorAll("button")).forEach(btn=>{
      const label = btn.dataset.label || btn.getAttribute("aria-label") || btn.textContent || "";
      const txt = String(label).replace(/\s+/g,"");
      if(!(txt.includes("結束我方回合") || txt.includes("結束回合"))) return;
      if(btn.dataset.realEnemyDrawBound === "1") return;

      btn.dataset.realEnemyDrawBound = "1";
      btn.addEventListener("click", function(e){
        if(getCurrentOwner() === "player"){
          e.preventDefault();
          e.stopPropagation();
          startEnemyTurnReal();
        }
      }, true);
    });
  }

  function apply(){
    resetIfNewPhase();
    watchSummonCounts();
    movePanelUp();
    bindButtonsOverride();
    bindEndTurnToRealEnemy();
    updateActionButtons();
  }

  const oldRenderFinalFlowFix = render;
  render = function(){
    oldRenderFinalFlowFix();
    requestAnimationFrame(apply);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    makeFallbackEnemyDeckIfNeeded();
    syncEnemyDeckDisplay();
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// FIX DISABLED BUTTONS / REAL ENEMY DECK / PLAYER SUMMON
// 修正：
// 1. 移除右下角空心殘留框。
// 2. 戰術佈陣 / 進攻宣言不再永久反灰。
// 3. 對手牌庫真正減少。
// 4. 對手真正召喚手牌單位。
// 5. 第二回合後我方重新可正常召喚。
// ======================================================
(function(){

  function FLOW(){
    window.XLW_FLOW_RULES = window.XLW_FLOW_RULES || {};
    return window.XLW_FLOW_RULES;
  }

  function E(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
  }

  function currentOwner(){
    return FLOW().currentPlayer || (E() && E().currentPlayer) || window.currentPlayer || "player";
  }

  function currentPhase(){
    return FLOW().phase || (E() && E().phase) || window.currentPhase || "";
  }

  function isFirstTurn(){
    return currentOwner() === "player" && Number(FLOW().playerTurn || 1) <= 1;
  }

  function resetSummonFlags(){
    FLOW().summonUsed = false;
    FLOW().travelerUsed = false;

    const e = E();
    if(e){
      e._summonUsed = false;
      e.normalSummonUsed = false;
      e.tacticalSummonUsed = false;
    }

    window.normalSummonUsed = false;
    window.tacticalSummonUsed = false;
  }

  // ==================================================
  // 修正：每次進入 summon / formation_summon 都重新解鎖召喚
  // ==================================================
  let lastPhaseFixKey = "";

  function phaseFixWatcher(){
    const key = currentOwner() + ":" + currentPhase() + ":" + (FLOW().playerTurn || 1) + ":" + (FLOW().enemyTurn || 0);

    if(key === lastPhaseFixKey) return;
    lastPhaseFixKey = key;

    const p = currentPhase();

    if(p === "summon" || p === "formation_summon"){
      resetSummonFlags();
    }

    updateButtonsReal();
  }

  // ==================================================
  // 真正的對手牌庫
  // ==================================================
  function enemyObj(){
    if(window.XLW_ENEMY) return window.XLW_ENEMY;

    window.XLW_ENEMY = window.XLW_ENEMY || {
      deck:[],
      hand:[]
    };

    return window.XLW_ENEMY;
  }

  function ensureEnemyDeck(){
    const e = enemyObj();

    if(!Array.isArray(e.deck)) e.deck = [];
    if(!Array.isArray(e.hand)) e.hand = [];

    // 若 deck 不存在或只有假張數，重建真正牌庫
    if(e.deck.length === 0){
      for(let i=0;i<20;i++){
        e.deck.push({
          id:"ENEMY_CARD_" + i,
          name:"敵方士兵",
          type:"unit",
          attack:2,
          atk:2,
          score:2,
          stars:1,
          tribute:0,
          image:"/static/little_traveler.jpeg",
          effect_text:""
        });
      }
    }

    return e;
  }

  function syncEnemyDeckCount(){
    const e = ensureEnemyDeck();
    const n = e.deck.length;

    window.enemyDeckCount = n;
    window.enemyDeckFakeCount = n;

    [
      "#enemyDeckCount",
      ".enemy-deck-count",
      "#enemyDeck .count",
      "[data-counter='enemyDeck']"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.textContent = String(n);
      });
    });
  }

  function enemyDrawReal(n){
    n = n || 2;

    const e = ensureEnemyDeck();

    for(let i=0;i<n;i++){
      if(e.deck.length){
        e.hand.push(e.deck.shift());
      }
    }

    syncEnemyDeckCount();
  }

  // ==================================================
  // 對手真正召喚手牌
  // ==================================================
  function emptyEnemySlot(){
    if(!window.field) return null;

    for(let i=0;i<5;i++){
      if(field.enemy_front && !field.enemy_front[i]){
        return {zone:"enemy_front", idx:i};
      }
    }

    for(let i=0;i<5;i++){
      if(field.enemy_back && !field.enemy_back[i]){
        return {zone:"enemy_back", idx:i};
      }
    }

    return null;
  }

  function makeTraveler(zone){
    return {
      card:{
        id:"TOKEN_ENEMY_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:""
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"enemy",
      summonedTurn:Number(FLOW().enemyTurn || 1),
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function enemyAutoSummonReal(){
    const e = ensureEnemyDeck();
    const dest = emptyEnemySlot();

    if(!dest) return false;

    // 優先從手牌召喚
    let idx = e.hand.findIndex(c => c && (c.type === "unit" || !c.tribute));

    if(idx >= 0){
      const card = e.hand.splice(idx,1)[0];

      field[dest.zone][dest.idx] = {
        card,
        tapped:false,
        attacking:false,
        target:null,
        summonedBy:"enemy",
        summonedTurn:Number(FLOW().enemyTurn || 1),
        summonedZone:dest.zone,
        summonedThisTurn:true
      };

      FLOW().summonUsed = true;
      return true;
    }

    // 沒有手牌單位才召喚小旅人
    field[dest.zone][dest.idx] = makeTraveler(dest.zone);
    FLOW().summonUsed = true;
    return true;
  }

  // ==================================================
  // 對手回合
  // ==================================================
  function enemyCanAttack(){
    if(!window.field) return false;

    for(let i=0;i<5;i++){
      const u =
        (field.enemy_front && field.enemy_front[i]) ||
        (field.enemy_back && field.enemy_back[i]);

      if(u && !u.tapped){
        return true;
      }
    }

    return false;
  }

  function enemyDoAttack(){
    if(!window.field) return false;

    for(let i=0;i<5;i++){
      const u =
        (field.enemy_front && field.enemy_front[i]) ||
        (field.enemy_back && field.enemy_back[i]);

      if(u && !u.tapped){
        u.attacking = true;
        u.tapped = true;
        return true;
      }
    }

    return false;
  }

  function enemyDoFormation(){
    if(!window.field) return false;

    for(let i=0;i<5;i++){
      if(field.enemy_back && field.enemy_back[i] &&
         field.enemy_front && !field.enemy_front[i]){
        field.enemy_front[i] = field.enemy_back[i];
        field.enemy_back[i] = null;
        return true;
      }
    }

    return true;
  }

  function realEnemyTurn(){
    FLOW().currentPlayer = "enemy";
    FLOW().enemyTurn = Number(FLOW().enemyTurn || 0) + 1;

    resetSummonFlags();

    FLOW().phase = "draw";
    enemyDrawReal(2);

    show("對手抽 2 張牌。");

    if(typeof render === "function") render();

    setTimeout(()=>{
      FLOW().phase = "summon";

      enemyAutoSummonReal();

      if(typeof render === "function") render();

      setTimeout(()=>{
        // 二選一：能攻擊就進攻，否則戰術
        if(enemyCanAttack()){
          FLOW().phase = "attack";
          enemyDoAttack();
          show("對手進攻宣言。");
        }else{
          FLOW().phase = "formation_move";
          enemyDoFormation();
          show("對手戰術佈陣。");
        }

        if(typeof render === "function") render();

      }, 700);

    }, 700);
  }

  // ==================================================
  // 修正：按鈕永久反灰
  // ==================================================
  function updateButtonsReal(){

    const tactical =
      document.getElementById("surviveTacticalBtn") ||
      document.getElementById("stableActionTactical");

    const attack =
      document.getElementById("surviveAttackBtn") ||
      document.getElementById("stableActionAttack");

    const summon =
      document.getElementById("surviveSummonBtn") ||
      document.getElementById("stableActionSummon");

    const phase = currentPhase();

    const canChoose =
      currentOwner() === "player" &&
      phase === "choose_action";

    if(tactical){

      const disabled =
        isFirstTurn() ||
        !canChoose;

      tactical.disabled = disabled;

      tactical.classList.toggle(
        "rule-disabled",
        disabled
      );
    }

    if(attack){

      const disabled =
        isFirstTurn() ||
        !canChoose;

      attack.disabled = disabled;

      attack.classList.toggle(
        "rule-disabled",
        disabled
      );
    }

    if(summon){

      const disabled =
        currentOwner() !== "player" ||
        !(
          phase === "summon" ||
          phase === "formation_summon"
        ) ||
        FLOW().summonUsed;

      summon.disabled = disabled;

      summon.classList.toggle(
        "rule-disabled",
        disabled
      );
    }
  }

  // ==================================================
  // 修正：結束回合 -> 真正對手回合
  // ==================================================
  function bindEndTurn(){

    Array.from(document.querySelectorAll("button")).forEach(btn=>{

      const txt =
        String(
          btn.dataset.label ||
          btn.getAttribute("aria-label") ||
          btn.textContent ||
          ""
        ).replace(/\s+/g,"");

      if(
        !txt.includes("結束我方回合") &&
        !txt.includes("結束回合")
      ) return;

      if(btn.dataset.finalEnemyBound === "1") return;

      btn.dataset.finalEnemyBound = "1";

      btn.onclick = function(e){

        e.preventDefault();
        e.stopPropagation();

        realEnemyTurn();

        return false;
      };
    });
  }

  // ==================================================
  // 移除空心框
  // ==================================================
  function removeGhostPanels(){

    [
      ".ghost-panel",
      ".unused-panel",
      ".blank-panel",
      ".empty-panel",
      "#unusedControlPanel",
      "#emptyControlPanel",
      "#rightPanelGhost"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.remove();
      });
    });

    // 刪除沒有按鈕的右下框
    document.querySelectorAll("div").forEach(el=>{

      const rect = el.getBoundingClientRect();

      const nearRightBottom =
        rect.right > window.innerWidth - 350 &&
        rect.bottom > window.innerHeight - 350;

      if(!nearRightBottom) return;

      const hasBtn = el.querySelector("button");

      if(hasBtn) return;

      const txt = (el.textContent || "").trim();

      if(txt === ""){
        const style = getComputedStyle(el);

        if(
          style.border !== "none" ||
          style.outlineStyle !== "none"
        ){
          el.remove();
        }
      }
    });
  }

  // ==================================================
  // 玩家召喚完成 -> choose_action
  // ==================================================
  function watchPlayerSummon(){

    let last = 0;

    setInterval(()=>{

      if(!window.field) return;

      let now = 0;

      ["player_front","player_back"].forEach(z=>{
        (field[z] || []).forEach(u=>{
          if(u) now++;
        });
      });

      if(
        currentOwner() === "player" &&
        currentPhase() === "summon" &&
        now > last
      ){
        FLOW().summonUsed = true;

        if(!isFirstTurn()){

          FLOW().phase = "choose_action";

          show(
            "召喚完成：請選擇戰術佈陣或進攻宣言。"
          );
        }

        updateButtonsReal();
      }

      last = now;

    }, 300);
  }

  const oldRenderFixEverything = render;

  render = function(){

    oldRenderFixEverything();

    requestAnimationFrame(()=>{

      phaseFixWatcher();

      syncEnemyDeckCount();

      bindEndTurn();

      updateButtonsReal();

      removeGhostPanels();
    });
  };

  document.addEventListener("DOMContentLoaded", ()=>{

    ensureEnemyDeck();

    syncEnemyDeckCount();

    watchPlayerSummon();

    setTimeout(()=>{
      removeGhostPanels();
      updateButtonsReal();
      bindEndTurn();
    },500);

    setTimeout(()=>{
      removeGhostPanels();
      updateButtonsReal();
      bindEndTurn();
    },1500);
  });

})();


// ======================================================
// REMOVE FINAL EMPTY BOX UNDER END TURN
// ======================================================
(function(){

  function removeBottomEmptyBox(){

    document.querySelectorAll("div").forEach(el=>{

      const rect = el.getBoundingClientRect();

      const nearRight =
        rect.right > window.innerWidth - 350;

      const nearBottom =
        rect.bottom > window.innerHeight - 250;

      if(!(nearRight && nearBottom)) return;

      // 保留真正的按鈕區
      if(
        el.id === "surviveActionPanel" ||
        el.id === "stableActionPanel" ||
        el.id === "fixedRightActionPanel"
      ){
        return;
      }

      // 沒有按鈕
      if(el.querySelector("button")) return;

      const txt = (el.textContent || "").trim();

      // 空內容框直接刪
      if(txt === ""){

        const style = getComputedStyle(el);

        const hasVisual =
          style.border !== "none" ||
          style.outlineStyle !== "none" ||
          style.boxShadow !== "none" ||
          style.backgroundColor !== "rgba(0, 0, 0, 0)";

        if(hasVisual){
          el.remove();
        }
      }
    });
  }

  const oldRenderRemoveFinalEmpty = render;

  render = function(){
    oldRenderRemoveFinalEmpty();
    requestAnimationFrame(removeBottomEmptyBox);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(removeBottomEmptyBox, 300);
    setTimeout(removeBottomEmptyBox, 1200);
    setTimeout(removeBottomEmptyBox, 2500);
  });

})();


// ======================================================
// FINAL AUTHORITATIVE CONTROL / ENEMY / CHOICE FIX
// 目的：最後覆蓋舊補丁互相干擾的問題。
// 1. 只保留一組 xlwFinalControlPanel；移除舊 panel 與空心框。
// 2. 對手抽牌/召喚不再依賴舊 AI；直接用真 deck/hand/field 操作，不會卡在召喚階段。
// 3. 我方召喚後，戰術佈陣 / 進攻宣言只能二選一；選完另一個禁止，之後只能結束回合。
// 4. 召喚階段單位 / 小旅人只能擇一。
// ======================================================
(function(){

  const AUTH = window.XLW_AUTH_FINAL = window.XLW_AUTH_FINAL || {
    currentPlayer: "player",
    playerTurn: 1,
    enemyTurn: 0,
    phase: "summon",
    summonUsed: false,
    actionChoice: null,
    lastPlayerUnits: null,
    lastEnemyUnits: null,
    enemyRunning: false
  };

  function eng(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function msg(t){
    try{ setStatus(t); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.textContent=t;
    });
  }

  function top(owner, phaseText){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function sync(owner, phase, phaseText){
    AUTH.currentPlayer = owner;
    AUTH.phase = phase;

    const e = eng();
    if(e){
      e.currentPlayer = owner;
      e.phase = phase;
      e.actionPhase = phase;
      e.subphase = phase;
      e.playerTurn = AUTH.playerTurn;
      e.enemyTurn = AUTH.enemyTurn;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = phase; }catch(err){}
    try{ mode = phase; }catch(err){}
    try{ window.phase = phaseText; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + phase;
    window.SK_ACTION_MODE = owner + "_" + phase;

    top(owner, phaseText);
  }

  function playerFirstTurn(){
    return AUTH.currentPlayer === "player" && Number(AUTH.playerTurn || 1) <= 1;
  }

  function clearTurnFlags(){
    AUTH.summonUsed = false;
    AUTH.actionChoice = null;

    const e = eng();
    if(e){
      e._summonUsed = false;
      e.normalSummonUsed = false;
      e.tacticalSummonUsed = false;
    }

    window.normalSummonUsed = false;
    window.tacticalSummonUsed = false;
  }

  function playerHand(){
    return Array.isArray(window.hand) ? window.hand :
      Array.isArray(window.playerHand) ? window.playerHand :
      (window.XLW_PLAYER && Array.isArray(window.XLW_PLAYER.hand)) ? window.XLW_PLAYER.hand : null;
  }

  function playerDeck(){
    return Array.isArray(window.deck) ? window.deck :
      Array.isArray(window.playerDeck) ? window.playerDeck :
      (window.XLW_PLAYER && Array.isArray(window.XLW_PLAYER.deck)) ? window.XLW_PLAYER.deck : null;
  }

  function enemyState(){
    window.XLW_ENEMY = window.XLW_ENEMY || {};
    const e = window.XLW_ENEMY;
    if(!Array.isArray(e.deck)) e.deck = [];
    if(!Array.isArray(e.hand)) e.hand = [];
    if(e.deck.length === 0 && e.hand.length === 0){
      for(let i=0;i<20;i++){
        e.deck.push({
          id:"YOKAI_VILLAGE_" + i,
          name:"妖怪村莊士兵",
          type:"unit",
          attack:2,
          atk:2,
          score:2,
          stars:1,
          tribute:0,
          image:"/static/little_traveler.jpeg",
          effect_text:""
        });
      }
    }
    window.enemyDeck = e.deck;
    window.enemyHand = e.hand;
    return e;
  }

  function draw(owner, n){
    n = n || 2;
    let h, d;
    if(owner === "enemy"){
      const e = enemyState();
      h = e.hand; d = e.deck;
    }else{
      h = playerHand(); d = playerDeck();
    }
    if(!h || !d) return 0;
    let drew = 0;
    for(let i=0;i<n;i++){
      if(d.length){
        h.push(d.shift());
        drew++;
      }
    }
    if(owner === "enemy") updateEnemyDeckDisplay();
    return drew;
  }

  function updateEnemyDeckDisplay(){
    const e = enemyState();
    const n = e.deck.length;
    window.enemyDeckCount = n;
    window.enemyDeckFakeCount = n;
    e.deckCount = n;

    const selectors = [
      "#enemyDeckCount",
      ".enemy-deck-count",
      "#enemyDeck .count",
      "#enemyDeck",
      "[data-counter='enemyDeck']",
      "[data-zone='enemy_deck']"
    ];

    selectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        if(el.id === "enemyDeck" && el.querySelector("img,button,.card")) {
          const c = el.querySelector(".count,.deck-count,.badge");
          if(c) c.textContent = String(n);
        } else {
          el.textContent = String(n);
        }
      });
    });
  }

  function countUnits(owner){
    if(!window.field) return 0;
    const zones = owner === "enemy" ? ["enemy_front","enemy_back"] : ["player_front","player_back"];
    let n=0;
    zones.forEach(z=>(field[z]||[]).forEach(u=>{ if(u) n++; }));
    return n;
  }

  function enemyEmptySlot(){
    if(!window.field) return null;
    for(let i=0;i<5;i++) if(field.enemy_front && !field.enemy_front[i]) return {zone:"enemy_front", idx:i};
    for(let i=0;i<5;i++) if(field.enemy_back && !field.enemy_back[i]) return {zone:"enemy_back", idx:i};
    return null;
  }

  function traveler(owner, zone){
    return {
      card:{
        id: owner === "enemy" ? "TOKEN_ENEMY_TRAVELER" : "TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:""
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:owner,
      summonedTurn: owner === "enemy" ? AUTH.enemyTurn : AUTH.playerTurn,
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function enemySummonGuaranteed(){
    const dest = enemyEmptySlot();
    if(!dest) return false;

    const e = enemyState();

    // 優先召喚手牌不需獻祭單位
    let idx = e.hand.findIndex(c=>{
      if(!c) return false;
      const tribute = Number(c.tribute || c.cost || c.sacrifice || 0);
      return tribute <= 0 && (c.type === "unit" || c.card_type === "unit" || c.attack !== undefined || c.atk !== undefined);
    });

    // 若沒有 unit 標記，召喚第一張不需獻祭牌作為單位
    if(idx < 0){
      idx = e.hand.findIndex(c => c && Number(c.tribute || c.cost || c.sacrifice || 0) <= 0);
    }

    if(idx >= 0){
      const card = e.hand.splice(idx, 1)[0];
      field[dest.zone][dest.idx] = {
        card,
        tapped:false,
        attacking:false,
        target:null,
        summonedBy:"enemy",
        summonedTurn:AUTH.enemyTurn,
        summonedZone:dest.zone,
        summonedThisTurn:true
      };
      AUTH.summonUsed = true;
      msg("對手召喚手牌單位：「" + (card.name || "單位") + "」。");
      return true;
    }

    field[dest.zone][dest.idx] = traveler("enemy", dest.zone);
    AUTH.summonUsed = true;
    msg("對手沒有可召喚手牌單位，改召喚小旅人。");
    return true;
  }

  function enemyCanAttack(){
    if(!window.field) return false;
    for(let i=0;i<5;i++){
      const u = (field.enemy_front && field.enemy_front[i]) || (field.enemy_back && field.enemy_back[i]);
      if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))) return true;
    }
    return false;
  }

  function enemyAttack(){
    if(!window.field) return false;
    for(let i=0;i<5;i++){
      const u = (field.enemy_front && field.enemy_front[i]) || (field.enemy_back && field.enemy_back[i]);
      if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))){
        u.attacking = true;
        u.tapped = true;
        window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;
        const e = eng();
        if(e) e.enemyDeclaredAttackLastTurn = true;
        msg("對手選擇進攻宣言。");
        return true;
      }
    }
    return false;
  }

  function enemyFormation(){
    if(window.field){
      for(let i=0;i<5;i++){
        if(field.enemy_back && field.enemy_back[i] && field.enemy_front && !field.enemy_front[i]){
          field.enemy_front[i] = field.enemy_back[i];
          field.enemy_back[i] = null;
          msg("對手選擇戰術佈陣，將單位往前移動。");
          return true;
        }
      }
    }
    msg("對手選擇戰術佈陣。");
    return true;
  }

  function runEnemyTurn(){
    if(AUTH.enemyRunning) return;
    AUTH.enemyRunning = true;

    AUTH.currentPlayer = "enemy";
    AUTH.enemyTurn = Number(AUTH.enemyTurn || 0) + 1;
    clearTurnFlags();

    sync("enemy", "draw", "抽牌階段");
    draw("enemy", 2);
    msg("對手抽牌階段：對手抽 2 張牌。");
    safeRender();

    setTimeout(()=>{
      sync("enemy", "summon", "召喚階段");
      msg("對手召喚階段。");
      enemySummonGuaranteed();
      safeRender();

      setTimeout(()=>{
        if(enemyCanAttack()){
          sync("enemy", "attack", "進攻宣言");
          enemyAttack();
        }else{
          sync("enemy", "formation_done", "戰術佈陣");
          enemyFormation();
        }
        safeRender();

        setTimeout(()=>{
          startPlayerNextTurn();
        }, 900);
      }, 900);
    }, 900);
  }

  function startPlayerNextTurn(){
    AUTH.enemyRunning = false;
    AUTH.currentPlayer = "player";
    AUTH.playerTurn = Number(AUTH.playerTurn || 1) + 1;
    clearTurnFlags();

    sync("player", "draw", "抽牌階段");
    draw("player", 2);
    msg("我方抽牌階段：自動抽 2 張。");
    safeRender();

    setTimeout(()=>{
      sync("player", "summon", "召喚階段");
      msg("我方召喚階段：可召喚 1 個單位或 1 個小旅人。");
      updateButtons();
      safeRender();
    }, 650);
  }

  function safeRender(){
    try{ if(typeof render === "function") render(); }catch(e){ console.error(e); }
  }

  function playerCanSummon(){
    return AUTH.currentPlayer === "player" &&
      (AUTH.phase === "summon" || AUTH.phase === "formation_summon") &&
      !AUTH.summonUsed;
  }

  function markPlayerSummonUsed(){
    AUTH.summonUsed = true;
    const e = eng();
    if(e){
      e._summonUsed = true;
      e.normalSummonUsed = true;
    }
    window.normalSummonUsed = true;
    updateButtons();

    if(AUTH.phase === "summon"){
      if(playerFirstTurn()){
        msg("先手第一回合已完成召喚，請結束回合。");
      }else{
        AUTH.phase = "choose_action";
        sync("player", "choose_action", "行動選擇");
        msg("召喚完成：請選擇戰術佈陣或進攻宣言（二選一）。");
      }
    }

    safeRender();
  }

  // 手牌召喚鎖
  const oldSummonHandToFinal = window.summonHandTo;
  if(typeof oldSummonHandToFinal === "function" && !window.__XLW_AUTH_SUMMON_LOCK__){
    window.__XLW_AUTH_SUMMON_LOCK__ = true;
    window.summonHandTo = function(zone, idx){
      if(!playerCanSummon()){
        if(AUTH.currentPlayer === "player" && (AUTH.phase === "summon" || AUTH.phase === "formation_summon")){
          msg("本階段已召喚過單位或小旅人，不能再次召喚。");
          return false;
        }
      }
      const before = countUnits("player");
      const r = oldSummonHandToFinal.apply(this, arguments);
      const after = countUnits("player");
      if(r !== false && after > before) markPlayerSummonUsed();
      return r;
    };
  }

  // 小旅人召喚鎖
  document.addEventListener("click", function(e){
    const btn = e.target.closest && e.target.closest("button");
    if(!btn) return;
    const label = (btn.dataset.label || btn.getAttribute("aria-label") || btn.textContent || "").replace(/\s+/g,"");
    if(label.includes("召喚小旅人") && AUTH.currentPlayer === "player"){
      if(!playerCanSummon()){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        msg("本階段已召喚過單位或小旅人，不能再次召喚。");
        return false;
      }
    }
  }, true);

  function chooseFormation(){
    if(AUTH.currentPlayer !== "player") return;
    if(AUTH.phase !== "choose_action"){
      msg("目前不是行動選擇階段。");
      return;
    }
    if(AUTH.actionChoice){
      msg("本回合已選擇「" + (AUTH.actionChoice === "formation" ? "戰術佈陣" : "進攻宣言") + "」，不能再選另一項。");
      return;
    }
    AUTH.actionChoice = "formation";
    sync("player", "formation_summon", "戰術佈陣");
    msg("已選擇戰術佈陣。完成後只能結束回合，不能再進攻宣言。");
    updateButtons();
    safeRender();
  }

  function chooseAttack(){
    if(AUTH.currentPlayer !== "player") return;
    if(AUTH.phase !== "choose_action"){
      msg("目前不是行動選擇階段。");
      return;
    }
    if(AUTH.actionChoice){
      msg("本回合已選擇「" + (AUTH.actionChoice === "formation" ? "戰術佈陣" : "進攻宣言") + "」，不能再選另一項。");
      return;
    }
    AUTH.actionChoice = "attack";
    sync("player", "attack", "進攻宣言");
    window.SK_ATTACK_DECLARE_MODE = true;
    try{ attackDeclareMode = true; }catch(err){}
    msg("已選擇進攻宣言。完成後只能結束回合，不能再戰術佈陣。");
    updateButtons();
    safeRender();
  }

  function endPlayerTurn(){
    if(AUTH.currentPlayer !== "player") return;
    msg("結束我方回合，進入對手回合。");
    runEnemyTurn();
  }

  function buildPanel(){
    let p = document.getElementById("xlwFinalControlPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwFinalControlPanel";
      document.body.appendChild(p);
      p.innerHTML = `
        <div class="xlw-final-row">
          <button id="xlwBtnFormation" class="xlw-final-btn formation" type="button" data-label="戰術佈陣" aria-label="戰術佈陣"></button>
          <button id="xlwBtnAttack" class="xlw-final-btn attack" type="button" data-label="進攻宣言" aria-label="進攻宣言"></button>
        </div>
        <button id="xlwBtnSummon" class="xlw-final-btn summon" type="button" data-label="召喚" aria-label="召喚"></button>
        <button id="xlwBtnEnd" class="xlw-final-btn end" type="button" data-label="結束我方回合" aria-label="結束我方回合"></button>
      `;
      document.getElementById("xlwBtnFormation").onclick = function(e){ e.preventDefault(); e.stopPropagation(); chooseFormation(); };
      document.getElementById("xlwBtnAttack").onclick = function(e){ e.preventDefault(); e.stopPropagation(); chooseAttack(); };
      document.getElementById("xlwBtnSummon").onclick = function(e){
        e.preventDefault(); e.stopPropagation();
        if(!playerCanSummon()) { msg("目前不能召喚，或本階段已召喚過。"); return; }
        window.SK_HAND_SUMMON_MODE = true;
        try{ summonMode = true; }catch(err){}
        msg("請先點選手牌，再點選可召喚位置。");
      };
      document.getElementById("xlwBtnEnd").onclick = function(e){ e.preventDefault(); e.stopPropagation(); endPlayerTurn(); };
    }
    p.style.setProperty("display","flex","important");
    p.style.setProperty("visibility","visible","important");
    p.style.setProperty("opacity","1","important");
    p.style.setProperty("pointer-events","auto","important");
  }

  function hideOldUI(){
    [
      "surviveActionPanel","stableActionPanel","fixedRightActionPanel",
      "finalRightControlPanel","prettyRightControlPanel",
      "actionPanel","summonPanel","tacticPanel","battleControls","bottomControls"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.remove();
    });

    ["summonHint","summonGuide","summonOverlay","handSummonHint","unifiedSummonHint","unifiedSummonBox"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.remove();
    });

    // 右下空心格：只要在 final panel 下方、無按鈕、無文字、有框線/尺寸，就直接移除
    const final = document.getElementById("xlwFinalControlPanel");
    const fr = final ? final.getBoundingClientRect() : null;
    document.querySelectorAll("div,section,aside").forEach(el=>{
      if(el.id === "xlwFinalControlPanel" || el.closest("#xlwFinalControlPanel")) return;
      if(el.querySelector("button,.slot,.card,img")) return;
      const txt = (el.textContent || "").trim();
      if(txt.length > 0) return;
      const r = el.getBoundingClientRect();
      if(r.width < 20 || r.height < 20) return;

      const nearRight = r.right > window.innerWidth - 380;
      const belowPanel = fr ? (r.top >= fr.bottom - 5 && r.left > fr.left - 40) : (r.bottom > window.innerHeight - 180);
      if(nearRight && belowPanel){
        el.remove();
      }
    });
  }

  function updateButtons(){
    buildPanel();

    const f = document.getElementById("xlwBtnFormation");
    const a = document.getElementById("xlwBtnAttack");
    const s = document.getElementById("xlwBtnSummon");
    const e = document.getElementById("xlwBtnEnd");

    const canChoose = AUTH.currentPlayer === "player" && AUTH.phase === "choose_action" && !playerFirstTurn() && !AUTH.actionChoice;
    const canSummon = playerCanSummon();

    if(f){
      f.disabled = !canChoose;
      f.classList.toggle("disabled", !canChoose);
      f.classList.toggle("active", AUTH.actionChoice === "formation");
    }
    if(a){
      a.disabled = !canChoose;
      a.classList.toggle("disabled", !canChoose);
      a.classList.toggle("active", AUTH.actionChoice === "attack");
    }
    if(s){
      s.disabled = !canSummon;
      s.classList.toggle("disabled", !canSummon);
    }
    if(e){
      e.disabled = AUTH.currentPlayer !== "player";
      e.classList.toggle("disabled", AUTH.currentPlayer !== "player");
    }
  }

  let lastPlayerCount = null;
  function watchPlayerSummon(){
    const c = countUnits("player");
    if(lastPlayerCount === null) lastPlayerCount = c;
    if(AUTH.currentPlayer === "player" && (AUTH.phase === "summon" || AUTH.phase === "formation_summon") && c > lastPlayerCount){
      markPlayerSummonUsed();
    }
    lastPlayerCount = c;
  }

  function apply(){
    buildPanel();
    hideOldUI();
    updateEnemyDeckDisplay();
    watchPlayerSummon();
    updateButtons();
  }

  const oldRenderXLWFinalAuth = render;
  render = function(){
    oldRenderXLWFinalAuth();
    requestAnimationFrame(apply);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    enemyState();
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// SAFE REDO PATCH — NO BROAD DOM REMOVAL
// 從上一板重新修正：
// 1. 不刪除場地 / 卡片 / 一般 div，避免整個場面消失。
// 2. 對手森林區與場地區只往左移 50。
// 3. 中上方狀態欄只保留 topStatusRestoreBar，僅隱藏明確舊 engine panel。
// 4. 修正對手抽牌後卡住：安全執行抽牌 -> 召喚 -> 行動 -> 回到我方。
// ======================================================
(function(){

  const ENEMY_LEFT = 786;
  const ENEMY_FOREST_TOP = 156;
  const ENEMY_FIELD_TOP = 302;

  let runningEnemyTurn = false;

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function setTop(owner, phaseText){
    const phase = document.getElementById("topStatusPhase");
    if(phase) phase.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function setState(owner, raw, zh){
    window.XLW_AUTH_FINAL = window.XLW_AUTH_FINAL || {};
    const s = window.XLW_AUTH_FINAL;

    s.currentPlayer = owner;
    s.phase = raw;

    const e = engine();
    if(e){
      e.currentPlayer = owner;
      e.phase = raw;
      e.actionPhase = raw;
      e.subphase = raw;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = raw; }catch(err){}
    try{ mode = raw; }catch(err){}
    try{ phase = zh; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + raw;
    window.SK_ACTION_MODE = owner + "_" + raw;

    setTop(owner, zh);
  }

  function moveEnemyZonesLeft50(){
    const enemyForest = document.getElementById("enemyForest");
    const enemyField = document.getElementById("enemyField");

    if(enemyForest){
      enemyForest.style.setProperty("position", "absolute", "important");
      enemyForest.style.setProperty("left", ENEMY_LEFT + "px", "important");
      enemyForest.style.setProperty("top", ENEMY_FOREST_TOP + "px", "important");
      enemyForest.style.setProperty("width", "110px", "important");
      enemyForest.style.setProperty("height", "138px", "important");
      enemyForest.style.setProperty("right", "auto", "important");
      enemyForest.style.setProperty("bottom", "auto", "important");
      enemyForest.style.setProperty("transform", "none", "important");
      enemyForest.style.setProperty("display", "flex", "important");
      enemyForest.style.setProperty("visibility", "visible", "important");
      enemyForest.style.setProperty("opacity", "1", "important");
    }

    if(enemyField){
      enemyField.style.setProperty("position", "absolute", "important");
      enemyField.style.setProperty("left", ENEMY_LEFT + "px", "important");
      enemyField.style.setProperty("top", ENEMY_FIELD_TOP + "px", "important");
      enemyField.style.setProperty("width", "110px", "important");
      enemyField.style.setProperty("height", "138px", "important");
      enemyField.style.setProperty("right", "auto", "important");
      enemyField.style.setProperty("bottom", "auto", "important");
      enemyField.style.setProperty("transform", "none", "important");
      enemyField.style.setProperty("display", "flex", "important");
      enemyField.style.setProperty("visibility", "visible", "important");
      enemyField.style.setProperty("opacity", "1", "important");
    }
  }

  function keepSingleTopStatusOnly(){
    // 只處理明確的重複 engine panel，不掃描/刪除一般 div，避免誤傷場地。
    const keep = document.getElementById("topStatusRestoreBar");
    if(keep){
      keep.style.setProperty("display", "flex", "important");
      keep.style.setProperty("visibility", "visible", "important");
      keep.style.setProperty("opacity", "1", "important");
    }

    [
      "unifiedEnginePanel",
      "skEnginePanel",
      "enginePanel",
      "turnEnginePanel",
      "prettyEnginePanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el && el.id !== "topStatusRestoreBar"){
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("pointer-events", "none", "important");
      }
    });
  }

  function enemyState(){
    window.XLW_ENEMY = window.XLW_ENEMY || {};
    const enemy = window.XLW_ENEMY;

    if(!Array.isArray(enemy.deck)) enemy.deck = [];
    if(!Array.isArray(enemy.hand)) enemy.hand = [];

    if(enemy.deck.length === 0 && enemy.hand.length === 0){
      for(let i=0;i<20;i++){
        enemy.deck.push({
          id:"YOKAI_VILLAGE_" + i,
          name:"妖怪村莊士兵",
          type:"unit",
          attack:2,
          atk:2,
          score:2,
          stars:1,
          tribute:0,
          image:"/static/little_traveler.jpeg",
          effect_text:""
        });
      }
    }

    window.enemyDeck = enemy.deck;
    window.enemyHand = enemy.hand;

    return enemy;
  }

  function updateEnemyDeckCount(){
    const enemy = enemyState();
    const n = enemy.deck.length;

    window.enemyDeckCount = n;
    window.enemyDeckFakeCount = n;
    enemy.deckCount = n;

    [
      "#enemyDeckCount",
      ".enemy-deck-count",
      "#enemyDeck .count",
      "[data-counter='enemyDeck']"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.textContent = String(n);
      });
    });
  }

  function enemyDrawTwo(){
    const enemy = enemyState();
    let drew = 0;

    for(let i=0;i<2;i++){
      if(enemy.deck.length){
        enemy.hand.push(enemy.deck.shift());
        drew++;
      }
    }

    updateEnemyDeckCount();
    return drew;
  }

  function enemyEmptySlot(){
    if(!window.field) return null;

    for(let i=0;i<5;i++){
      if(field.enemy_front && !field.enemy_front[i]){
        return {zone:"enemy_front", idx:i};
      }
    }

    for(let i=0;i<5;i++){
      if(field.enemy_back && !field.enemy_back[i]){
        return {zone:"enemy_back", idx:i};
      }
    }

    return null;
  }

  function makeEnemyTraveler(zone){
    return {
      card:{
        id:"TOKEN_ENEMY_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:""
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"enemy",
      summonedTurn:(window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.enemyTurn) || 1,
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function enemySummonSafely(){
    const dest = enemyEmptySlot();

    if(!dest){
      show("對手場上沒有空位，跳過召喚。");
      return false;
    }

    const enemy = enemyState();

    let idx = enemy.hand.findIndex(c=>{
      if(!c) return false;
      const tribute = Number(c.tribute || c.cost || c.sacrifice || 0);
      return tribute <= 0 && (
        c.type === "unit" ||
        c.card_type === "unit" ||
        c.attack !== undefined ||
        c.atk !== undefined
      );
    });

    if(idx < 0){
      idx = enemy.hand.findIndex(c=>{
        if(!c) return false;
        return Number(c.tribute || c.cost || c.sacrifice || 0) <= 0;
      });
    }

    if(idx >= 0){
      const card = enemy.hand.splice(idx, 1)[0];

      field[dest.zone][dest.idx] = {
        card,
        tapped:false,
        attacking:false,
        target:null,
        summonedBy:"enemy",
        summonedTurn:(window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.enemyTurn) || 1,
        summonedZone:dest.zone,
        summonedThisTurn:true
      };

      show("對手召喚「" + (card.name || "單位") + "」。");
      return true;
    }

    field[dest.zone][dest.idx] = makeEnemyTraveler(dest.zone);
    show("對手召喚小旅人。");
    return true;
  }

  function enemyCanAttack(){
    if(!window.field) return false;

    for(let i=0;i<5;i++){
      const unit =
        (field.enemy_front && field.enemy_front[i]) ||
        (field.enemy_back && field.enemy_back[i]);

      if(
        unit &&
        !unit.tapped &&
        !(unit.card && (unit.card.attack === "盾" || unit.card.atk === "盾"))
      ){
        return true;
      }
    }

    return false;
  }

  function enemyActionSafely(){
    if(enemyCanAttack()){
      setState("enemy", "attack", "進攻宣言");

      for(let i=0;i<5;i++){
        const unit =
          (field.enemy_front && field.enemy_front[i]) ||
          (field.enemy_back && field.enemy_back[i]);

        if(
          unit &&
          !unit.tapped &&
          !(unit.card && (unit.card.attack === "盾" || unit.card.atk === "盾"))
        ){
          unit.attacking = true;
          unit.tapped = true;
          window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;
          show("對手進行進攻宣言。");
          return;
        }
      }
    }

    setState("enemy", "formation_done", "戰術佈陣");

    if(window.field){
      for(let i=0;i<5;i++){
        if(
          field.enemy_back &&
          field.enemy_back[i] &&
          field.enemy_front &&
          !field.enemy_front[i]
        ){
          field.enemy_front[i] = field.enemy_back[i];
          field.enemy_back[i] = null;
          show("對手戰術佈陣，將單位往前移動。");
          return;
        }
      }
    }

    show("對手執行戰術佈陣。");
  }

  function safeRender(){
    try{
      if(typeof render === "function") render();
    }catch(err){
      console.error("render failed", err);
    }
  }

  function runEnemyTurnNoStuck(){
    if(runningEnemyTurn) return;
    runningEnemyTurn = true;

    window.XLW_AUTH_FINAL = window.XLW_AUTH_FINAL || {};
    const state = window.XLW_AUTH_FINAL;

    state.currentPlayer = "enemy";
    state.enemyTurn = Number(state.enemyTurn || 0) + 1;

    setState("enemy", "draw", "抽牌階段");
    const drew = enemyDrawTwo();
    show("對手抽牌階段：抽 " + drew + " 張牌。");
    safeRender();

    setTimeout(()=>{
      try{
        setState("enemy", "summon", "召喚階段");
        show("對手召喚階段。");
        enemySummonSafely();
        safeRender();
      }catch(err){
        console.error("enemy summon failed", err);
        show("對手召喚階段發生錯誤，已跳過避免卡住。");
      }

      setTimeout(()=>{
        try{
          enemyActionSafely();
          safeRender();
        }catch(err){
          console.error("enemy action failed", err);
          show("對手行動階段發生錯誤，已跳過避免卡住。");
        }

        setTimeout(()=>{
          runningEnemyTurn = false;

          state.currentPlayer = "player";
          state.playerTurn = Number(state.playerTurn || 1) + 1;

          setState("player", "draw", "抽牌階段");
          show("對手回合結束，進入我方抽牌階段。");
          safeRender();

          setTimeout(()=>{
            setState("player", "summon", "召喚階段");
            show("我方召喚階段。");
            safeRender();
          }, 650);

        }, 800);

      }, 900);
    }, 900);
  }

  function bindEndTurnToSafeEnemyFlow(){
    document.querySelectorAll("button").forEach(btn=>{
      const label = (
        btn.dataset.label ||
        btn.getAttribute("aria-label") ||
        btn.textContent ||
        ""
      ).replace(/\s+/g,"");

      if(!label.includes("結束我方回合") && !label.includes("結束回合")) return;

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        runEnemyTurnNoStuck();
        return false;
      };
    });
  }

  function applySafeRedo(){
    moveEnemyZonesLeft50();
    keepSingleTopStatusOnly();
    enemyState();
    updateEnemyDeckCount();
    bindEndTurnToSafeEnemyFlow();
  }

  const oldRenderSafeRedo = render;

  render = function(){
    oldRenderSafeRedo();
    requestAnimationFrame(applySafeRedo);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applySafeRedo();
    setTimeout(applySafeRedo, 500);
    setTimeout(applySafeRedo, 1200);
  });

})();


// ======================================================
// DEEP DRAW + ENEMY SUMMON FIX / ENEMY ZONES RIGHT +25
// 針對目前問題做最小但完整修正：
// 1. enemyForest / enemyField 從 786 往右 25 => 811。
// 2. 不依賴舊 draw 函式名稱，直接找真實 deck/hand 陣列抽牌。
// 3. 每次回合開始都強制抽 2 張：我方與對手都適用。
// 4. 對手有手牌時，召喚階段直接從手牌取不需獻祭單位放到場上；沒有才用小旅人。
// 5. 綁定結束回合按鈕與玩家回合開始，避免抽牌流程漏掉。
// ======================================================
(function(){

  const ENEMY_LEFT = 836;
  const ENEMY_FOREST_TOP = 156;
  const ENEMY_FIELD_TOP = 302;

  const FIX = window.XLW_DEEP_DRAW_SUMMON_FIX = window.XLW_DEEP_DRAW_SUMMON_FIX || {
    lastTurnKey: "",
    playerDrewKeys: {},
    enemyDrewKeys: {},
    enemyRunning: false,
    playerTurn: 1,
    enemyTurn: 0
  };

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function setTop(owner, phaseText){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function setState(owner, raw, zh){
    window.XLW_AUTH_FINAL = window.XLW_AUTH_FINAL || {};
    const S = window.XLW_AUTH_FINAL;
    S.currentPlayer = owner;
    S.phase = raw;

    const e = engine();
    if(e){
      e.currentPlayer = owner;
      e.phase = raw;
      e.actionPhase = raw;
      e.subphase = raw;
      e.playerTurn = FIX.playerTurn;
      e.enemyTurn = FIX.enemyTurn;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = raw; }catch(err){}
    try{ mode = raw; }catch(err){}
    try{ phase = zh; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + raw;
    window.SK_ACTION_MODE = owner + "_" + raw;

    setTop(owner, zh);
  }

  function moveEnemyZones(){
    const enemyForest = document.getElementById("enemyForest");
    const enemyField = document.getElementById("enemyField");

    if(enemyForest){
      enemyForest.style.setProperty("position","absolute","important");
      enemyForest.style.setProperty("left", ENEMY_LEFT + "px", "important");
      enemyForest.style.setProperty("top", ENEMY_FOREST_TOP + "px", "important");
      enemyForest.style.setProperty("width","110px","important");
      enemyForest.style.setProperty("height","138px","important");
      enemyForest.style.setProperty("right","auto","important");
      enemyForest.style.setProperty("bottom","auto","important");
      enemyForest.style.setProperty("transform","none","important");
      enemyForest.style.setProperty("display","flex","important");
      enemyForest.style.setProperty("visibility","visible","important");
      enemyForest.style.setProperty("opacity","1","important");
    }

    if(enemyField){
      enemyField.style.setProperty("position","absolute","important");
      enemyField.style.setProperty("left", ENEMY_LEFT + "px", "important");
      enemyField.style.setProperty("top", ENEMY_FIELD_TOP + "px", "important");
      enemyField.style.setProperty("width","110px","important");
      enemyField.style.setProperty("height","138px","important");
      enemyField.style.setProperty("right","auto","important");
      enemyField.style.setProperty("bottom","auto","important");
      enemyField.style.setProperty("transform","none","important");
      enemyField.style.setProperty("display","flex","important");
      enemyField.style.setProperty("visibility","visible","important");
      enemyField.style.setProperty("opacity","1","important");
    }
  }

  function ensureArray(obj, key){
    if(!obj) return null;
    if(!Array.isArray(obj[key])) obj[key] = [];
    return obj[key];
  }

  function getPlayerHand(){
    if(Array.isArray(window.hand)) return window.hand;
    if(Array.isArray(window.playerHand)) return window.playerHand;
    window.XLW_PLAYER = window.XLW_PLAYER || {};
    return ensureArray(window.XLW_PLAYER, "hand");
  }

  function getPlayerDeck(){
    if(Array.isArray(window.deck)) return window.deck;
    if(Array.isArray(window.playerDeck)) return window.playerDeck;
    window.XLW_PLAYER = window.XLW_PLAYER || {};
    return ensureArray(window.XLW_PLAYER, "deck");
  }

  function enemyObj(){
    window.XLW_ENEMY = window.XLW_ENEMY || {};
    const e = window.XLW_ENEMY;
    if(!Array.isArray(e.deck)) e.deck = Array.isArray(window.enemyDeck) ? window.enemyDeck : [];
    if(!Array.isArray(e.hand)) e.hand = Array.isArray(window.enemyHand) ? window.enemyHand : [];

    // 如果完全沒有真 deck/hand，建立妖怪村莊牌庫
    if(e.deck.length === 0 && e.hand.length === 0){
      for(let i=0;i<20;i++){
        e.deck.push({
          id:"YOKAI_VILLAGE_" + i,
          name:"妖怪村莊士兵",
          type:"unit",
          attack:2,
          atk:2,
          score:2,
          stars:1,
          tribute:0,
          image:"/static/little_traveler.jpeg",
          effect_text:""
        });
      }
    }

    window.enemyDeck = e.deck;
    window.enemyHand = e.hand;
    return e;
  }

  function updateEnemyDeckDisplay(){
    const e = enemyObj();
    const n = e.deck.length;
    window.enemyDeckCount = n;
    window.enemyDeckFakeCount = n;
    e.deckCount = n;

    [
      "#enemyDeckCount",
      ".enemy-deck-count",
      "#enemyDeck .count",
      "[data-counter='enemyDeck']"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el => el.textContent = String(n));
    });

    // 若牌庫格內有文字數字，更新最接近右上牌庫區的數字
    document.querySelectorAll("span,div").forEach(el=>{
      if(el.children.length > 0) return;
      const txt = (el.textContent || "").trim();
      if(!/^\d+$/.test(txt)) return;
      const r = el.getBoundingClientRect();
      if(r.top < 220 && r.left > window.innerWidth * 0.55){
        if(Number(txt) >= n && Number(txt) <= 30) el.textContent = String(n);
      }
    });
  }

  function drawDirect(owner, count, reason){
    count = count || 2;
    let hand, deck;

    if(owner === "enemy"){
      const e = enemyObj();
      hand = e.hand;
      deck = e.deck;
    }else{
      hand = getPlayerHand();
      deck = getPlayerDeck();
    }

    if(!hand || !deck) {
      show((owner === "enemy" ? "對手" : "我方") + "抽牌失敗：找不到 hand/deck。");
      return 0;
    }

    let drew = 0;
    for(let i=0;i<count;i++){
      if(deck.length){
        hand.push(deck.shift());
        drew++;
      }
    }

    if(owner === "enemy") updateEnemyDeckDisplay();

    show((owner === "enemy" ? "對手" : "我方") + "抽牌階段：抽 " + drew + " 張牌。");
    return drew;
  }

  function currentTurnKey(owner){
    return owner + ":" + (owner === "enemy" ? FIX.enemyTurn : FIX.playerTurn);
  }

  function drawAtTurnStart(owner){
    const key = currentTurnKey(owner);
    const map = owner === "enemy" ? FIX.enemyDrewKeys : FIX.playerDrewKeys;
    if(map[key]) return 0;
    map[key] = true;
    return drawDirect(owner, 2, "turn-start");
  }

  function fieldEmptySlot(owner){
    if(!window.field) return null;
    const front = owner === "enemy" ? "enemy_front" : "player_front";
    const back = owner === "enemy" ? "enemy_back" : "player_back";

    for(let i=0;i<5;i++) if(field[front] && !field[front][i]) return {zone:front, idx:i};
    for(let i=0;i<5;i++) if(field[back] && !field[back][i]) return {zone:back, idx:i};
    return null;
  }

  function traveler(owner, zone){
    return {
      card:{
        id: owner === "enemy" ? "TOKEN_ENEMY_TRAVELER" : "TOKEN_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:""
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:owner,
      summonedTurn: owner === "enemy" ? FIX.enemyTurn : FIX.playerTurn,
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function enemySummonDirect(){
    const dest = fieldEmptySlot("enemy");
    if(!dest){
      show("對手場上沒有空位，跳過召喚。");
      return false;
    }

    const enemy = enemyObj();

    // 先從手牌找不需獻祭的單位
    let idx = enemy.hand.findIndex(card=>{
      if(!card) return false;
      const tribute = Number(card.tribute || card.cost || card.sacrifice || 0);
      return tribute <= 0 && (
        card.type === "unit" ||
        card.card_type === "unit" ||
        card.attack !== undefined ||
        card.atk !== undefined ||
        card.score !== undefined
      );
    });

    if(idx < 0){
      idx = enemy.hand.findIndex(card => card && Number(card.tribute || card.cost || card.sacrifice || 0) <= 0);
    }

    if(idx >= 0){
      const card = enemy.hand.splice(idx, 1)[0];
      field[dest.zone][dest.idx] = {
        card,
        tapped:false,
        attacking:false,
        target:null,
        summonedBy:"enemy",
        summonedTurn:FIX.enemyTurn,
        summonedZone:dest.zone,
        summonedThisTurn:true
      };
      show("對手召喚手牌單位：「" + (card.name || "單位") + "」。");
      return true;
    }

    field[dest.zone][dest.idx] = traveler("enemy", dest.zone);
    show("對手沒有可召喚手牌單位，召喚小旅人。");
    return true;
  }

  function enemyCanAttack(){
    if(!window.field) return false;
    for(let i=0;i<5;i++){
      const u = (field.enemy_front && field.enemy_front[i]) || (field.enemy_back && field.enemy_back[i]);
      if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))) return true;
    }
    return false;
  }

  function enemyActionDirect(){
    if(enemyCanAttack()){
      setState("enemy", "attack", "進攻宣言");
      for(let i=0;i<5;i++){
        const u = (field.enemy_front && field.enemy_front[i]) || (field.enemy_back && field.enemy_back[i]);
        if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))){
          u.attacking = true;
          u.tapped = true;
          window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;
          const e = engine();
          if(e) e.enemyDeclaredAttackLastTurn = true;
          show("對手進行進攻宣言。");
          return;
        }
      }
    }

    setState("enemy", "formation_done", "戰術佈陣");
    if(window.field){
      for(let i=0;i<5;i++){
        if(field.enemy_back && field.enemy_back[i] && field.enemy_front && !field.enemy_front[i]){
          field.enemy_front[i] = field.enemy_back[i];
          field.enemy_back[i] = null;
          show("對手戰術佈陣，將單位往前移動。");
          return;
        }
      }
    }
    show("對手執行戰術佈陣。");
  }

  function safeRender(){
    try{ if(typeof render === "function") render(); }catch(e){ console.error(e); }
  }

  function startPlayerTurn(){
    FIX.playerTurn += 1;
    setState("player", "draw", "抽牌階段");
    drawAtTurnStart("player");
    safeRender();

    setTimeout(()=>{
      setState("player", "summon", "召喚階段");
      show("我方召喚階段。");
      safeRender();
    }, 650);
  }

  function startEnemyTurn(){
    if(FIX.enemyRunning) return;
    FIX.enemyRunning = true;

    FIX.enemyTurn += 1;

    setState("enemy", "draw", "抽牌階段");
    drawAtTurnStart("enemy");
    safeRender();

    setTimeout(()=>{
      setState("enemy", "summon", "召喚階段");
      show("對手召喚階段。");
      try{ enemySummonDirect(); }catch(err){ console.error(err); show("對手召喚發生錯誤，跳過避免卡住。"); }
      safeRender();

      setTimeout(()=>{
        try{ enemyActionDirect(); }catch(err){ console.error(err); show("對手行動發生錯誤，跳過避免卡住。"); }
        safeRender();

        setTimeout(()=>{
          FIX.enemyRunning = false;
          startPlayerTurn();
        }, 900);
      }, 900);
    }, 900);
  }

  function bindEndButtons(){
    document.querySelectorAll("button").forEach(btn=>{
      const label = (btn.dataset.label || btn.getAttribute("aria-label") || btn.textContent || "").replace(/\s+/g,"");
      if(!label.includes("結束我方回合") && !label.includes("結束回合")) return;
      if(btn.dataset.deepDrawBound === "1") return;
      btn.dataset.deepDrawBound = "1";

      btn.onclick = function(e){
        e.preventDefault();
        e.stopPropagation();
        startEnemyTurn();
        return false;
      };
    });
  }

  function detectTurnStartFromState(){
    const e = engine();
    const owner = (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.currentPlayer) || (e && e.currentPlayer) || window.currentPlayer;
    const ph = (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.phase) || (e && e.phase) || window.currentPhase || window.mode;

    if(owner === "player" && (ph === "draw" || ph === "抽牌階段")){
      drawAtTurnStart("player");
    }
    if(owner === "enemy" && (ph === "draw" || ph === "抽牌階段")){
      drawAtTurnStart("enemy");
    }
  }

  function apply(){
    moveEnemyZones();
    enemyObj();
    updateEnemyDeckDisplay();
    bindEndButtons();
    detectTurnStartFromState();
  }

  const oldRenderDeepDrawSummonFix = render;
  render = function(){
    oldRenderDeepDrawSummonFix();
    requestAnimationFrame(apply);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    enemyObj();
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// ABSOLUTE ENEMY DRAW FLOW FIX — DIV CONTROLS, NO BUTTON CLICK CONFLICT
// 問題深度原因：目前 game.js 已累積大量 document capture click 補丁，
// 其中多個會對 button 使用 stopImmediatePropagation，導致「結束我方回合」按鈕事件
// 在真正執行前就被舊補丁攔截，對手流程因此停在抽牌階段或完全不動。
// 本修正：
// 1. 新控制面板不用 <button>，改用 <div role="button">，避開舊 button 攔截器。
// 2. 結束回合由 div 直接啟動獨立安全流程。
// 3. 對手抽牌直接操作 XLW_ENEMY.deck / hand，並覆寫舊的假牌庫計數函式。
// 4. 對手召喚直接操作 field.enemy_front/back，不依賴舊 AI。
// 5. 對手區位置維持右移後 left=836。
// ======================================================
(function(){

  const PANEL_ID = "xlwAbsoluteControlPanel";
  const ENEMY_LEFT = 836;
  const ENEMY_FOREST_TOP = 156;
  const ENEMY_FIELD_TOP = 302;

  const ABS = window.XLW_ABSOLUTE_FLOW = window.XLW_ABSOLUTE_FLOW || {
    enemyRunning:false,
    playerTurn:1,
    enemyTurn:0,
    currentPlayer:"player",
    phase:"summon"
  };

  function log(msg){
    console.log("[XLW_ABSOLUTE_FLOW]", msg);
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function top(owner, phaseText){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = (owner === "enemy" ? "對手" : "我方") + "｜" + phaseText;
  }

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function setState(owner, phase, zh){
    ABS.currentPlayer = owner;
    ABS.phase = phase;

    window.XLW_AUTH_FINAL = window.XLW_AUTH_FINAL || {};
    window.XLW_AUTH_FINAL.currentPlayer = owner;
    window.XLW_AUTH_FINAL.phase = phase;
    window.XLW_AUTH_FINAL.playerTurn = ABS.playerTurn;
    window.XLW_AUTH_FINAL.enemyTurn = ABS.enemyTurn;

    const e = engine();
    if(e){
      e.currentPlayer = owner;
      e.phase = phase;
      e.actionPhase = phase;
      e.subphase = phase;
      e.playerTurn = ABS.playerTurn;
      e.enemyTurn = ABS.enemyTurn;
    }

    try{ currentPlayer = owner; }catch(err){}
    try{ currentPhase = phase; }catch(err){}
    try{ mode = phase; }catch(err){}
    try{ window.phase = zh; }catch(err){}

    window.XLW_ACTION_MODE = owner + "_" + phase;
    window.SK_ACTION_MODE = owner + "_" + phase;

    top(owner, zh);
  }

  function safeRender(){
    try{
      if(typeof render === "function") render();
    }catch(err){
      console.error("[XLW_ABSOLUTE_FLOW] render error", err);
    }
  }

  function moveEnemyZones(){
    const forest = document.getElementById("enemyForest");
    const fieldEl = document.getElementById("enemyField");

    if(forest){
      forest.style.setProperty("position","absolute","important");
      forest.style.setProperty("left",ENEMY_LEFT + "px","important");
      forest.style.setProperty("top",ENEMY_FOREST_TOP + "px","important");
      forest.style.setProperty("width","110px","important");
      forest.style.setProperty("height","138px","important");
      forest.style.setProperty("right","auto","important");
      forest.style.setProperty("bottom","auto","important");
      forest.style.setProperty("transform","none","important");
      forest.style.setProperty("display","flex","important");
      forest.style.setProperty("visibility","visible","important");
      forest.style.setProperty("opacity","1","important");
    }

    if(fieldEl){
      fieldEl.style.setProperty("position","absolute","important");
      fieldEl.style.setProperty("left",ENEMY_LEFT + "px","important");
      fieldEl.style.setProperty("top",ENEMY_FIELD_TOP + "px","important");
      fieldEl.style.setProperty("width","110px","important");
      fieldEl.style.setProperty("height","138px","important");
      fieldEl.style.setProperty("right","auto","important");
      fieldEl.style.setProperty("bottom","auto","important");
      fieldEl.style.setProperty("transform","none","important");
      fieldEl.style.setProperty("display","flex","important");
      fieldEl.style.setProperty("visibility","visible","important");
      fieldEl.style.setProperty("opacity","1","important");
    }
  }

  function enemyState(){
    window.XLW_ENEMY = window.XLW_ENEMY || {};
    const e = window.XLW_ENEMY;

    if(!Array.isArray(e.hand)){
      e.hand = Array.isArray(window.enemyHand) ? window.enemyHand : [];
    }
    if(!Array.isArray(e.deck)){
      e.deck = Array.isArray(window.enemyDeck) ? window.enemyDeck : [];
    }

    // 若只有假顯示沒有真牌庫，建立真牌庫
    if(e.deck.length === 0 && e.hand.length === 0){
      for(let i=0;i<20;i++){
        e.deck.push({
          id:"YOKAI_VILLAGE_" + i,
          name:"妖怪村莊士兵",
          type:"unit",
          attack:2,
          atk:2,
          score:2,
          stars:1,
          tribute:0,
          image:"/static/little_traveler.jpeg",
          effect_text:""
        });
      }
    }

    window.enemyDeck = e.deck;
    window.enemyHand = e.hand;
    return e;
  }

  function playerState(){
    window.XLW_PLAYER = window.XLW_PLAYER || {};
    if(!Array.isArray(window.XLW_PLAYER.hand)){
      window.XLW_PLAYER.hand = Array.isArray(window.hand) ? window.hand : (Array.isArray(window.playerHand) ? window.playerHand : []);
    }
    if(!Array.isArray(window.XLW_PLAYER.deck)){
      window.XLW_PLAYER.deck = Array.isArray(window.deck) ? window.deck : (Array.isArray(window.playerDeck) ? window.playerDeck : []);
    }
    return window.XLW_PLAYER;
  }

  function enemyDeckCount(){
    return enemyState().deck.length;
  }

  // 覆寫舊假計數，避免畫面一直顯示 20
  window.countEnemyDeckFake = function(){ return enemyDeckCount(); };
  window.getDeckCountEnemy = function(){ return enemyDeckCount(); };
  window.getEnemyDeckReady = function(){ return enemyState().deck; };

  function updateEnemyDeckDisplay(){
    const n = enemyDeckCount();

    window.enemyDeckCount = n;
    window.enemyDeckFakeCount = n;
    window.XLW_ENEMY.deckCount = n;

    [
      "#enemyDeckCount",
      ".enemy-deck-count",
      "#enemyDeck .count",
      "[data-counter='enemyDeck']",
      "[data-zone='enemy_deck'] .count"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        el.textContent = String(n);
      });
    });

    // 很多版本牌庫數字只是普通文字，找右上區的純數字同步
    document.querySelectorAll("div,span").forEach(el=>{
      if(el.children.length) return;
      const txt = (el.textContent || "").trim();
      if(!/^\d+$/.test(txt)) return;
      const r = el.getBoundingClientRect();
      if(r.top < 260 && r.left > window.innerWidth * 0.55 && Number(txt) <= 30){
        el.textContent = String(n);
      }
    });
  }

  function drawEnemy2(){
    const e = enemyState();
    let drew = 0;

    for(let i=0;i<2;i++){
      if(e.deck.length){
        e.hand.push(e.deck.shift());
        drew++;
      }
    }

    updateEnemyDeckDisplay();
    show("對手抽牌階段：抽 " + drew + " 張牌，牌庫剩 " + e.deck.length + " 張。");
    log("enemy drew " + drew + ", deck=" + e.deck.length + ", hand=" + e.hand.length);
    return drew;
  }

  function drawPlayer2(){
    const p = playerState();
    let drew = 0;
    for(let i=0;i<2;i++){
      if(p.deck && p.deck.length){
        p.hand.push(p.deck.shift());
        drew++;
      }
    }
    show("我方抽牌階段：抽 " + drew + " 張牌。");
    return drew;
  }

  function getField(){
    try{
      if(typeof field !== "undefined") return field;
    }catch(err){}
    return window.field || null;
  }

  function enemySlot(){
    const f = getField();
    if(!f) return null;

    for(let i=0;i<5;i++){
      if(f.enemy_front && !f.enemy_front[i]) return {zone:"enemy_front", idx:i};
    }
    for(let i=0;i<5;i++){
      if(f.enemy_back && !f.enemy_back[i]) return {zone:"enemy_back", idx:i};
    }
    return null;
  }

  function makeTraveler(zone){
    return {
      card:{
        id:"TOKEN_ENEMY_TRAVELER",
        name:"小旅人",
        type:"unit",
        attack:1,
        atk:1,
        score:1,
        stars:1,
        tribute:0,
        image:"/static/little_traveler.jpeg",
        effect_text:""
      },
      tapped:false,
      attacking:false,
      target:null,
      summonedBy:"enemy",
      summonedTurn:ABS.enemyTurn,
      summonedZone:zone,
      summonedThisTurn:true
    };
  }

  function summonEnemyFromHand(){
    const f = getField();
    if(!f){
      show("對手召喚失敗：找不到 field。");
      return false;
    }

    const slot = enemySlot();
    if(!slot){
      show("對手場上無空位，跳過召喚。");
      return false;
    }

    const e = enemyState();

    let idx = e.hand.findIndex(card=>{
      if(!card) return false;
      const tribute = Number(card.tribute || card.cost || card.sacrifice || 0);
      return tribute <= 0 && (
        card.type === "unit" ||
        card.card_type === "unit" ||
        card.attack !== undefined ||
        card.atk !== undefined ||
        card.score !== undefined
      );
    });

    if(idx < 0){
      idx = e.hand.findIndex(card => card && Number(card.tribute || card.cost || card.sacrifice || 0) <= 0);
    }

    if(idx >= 0){
      const card = e.hand.splice(idx, 1)[0];
      f[slot.zone][slot.idx] = {
        card,
        tapped:false,
        attacking:false,
        target:null,
        summonedBy:"enemy",
        summonedTurn:ABS.enemyTurn,
        summonedZone:slot.zone,
        summonedThisTurn:true
      };
      show("對手召喚手牌單位：「" + (card.name || "單位") + "」。");
      log("enemy summoned from hand, hand=" + e.hand.length);
      return true;
    }

    f[slot.zone][slot.idx] = makeTraveler(slot.zone);
    show("對手沒有可召喚手牌單位，召喚小旅人。");
    return true;
  }

  function enemyCanAttack(){
    const f = getField();
    if(!f) return false;

    for(let i=0;i<5;i++){
      const u = (f.enemy_front && f.enemy_front[i]) || (f.enemy_back && f.enemy_back[i]);
      if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))){
        return true;
      }
    }
    return false;
  }

  function enemyAction(){
    const f = getField();

    if(enemyCanAttack()){
      setState("enemy","attack","進攻宣言");
      for(let i=0;i<5;i++){
        const u = (f.enemy_front && f.enemy_front[i]) || (f.enemy_back && f.enemy_back[i]);
        if(u && !u.tapped && !(u.card && (u.card.attack === "盾" || u.card.atk === "盾"))){
          u.attacking = true;
          u.tapped = true;
          window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;
          show("對手進行進攻宣言。");
          return;
        }
      }
    }

    setState("enemy","formation_done","戰術佈陣");
    if(f){
      for(let i=0;i<5;i++){
        if(f.enemy_back && f.enemy_back[i] && f.enemy_front && !f.enemy_front[i]){
          f.enemy_front[i] = f.enemy_back[i];
          f.enemy_back[i] = null;
          show("對手戰術佈陣，單位往前移動。");
          return;
        }
      }
    }
    show("對手執行戰術佈陣。");
  }

  function startPlayerTurn(){
    ABS.currentPlayer = "player";
    ABS.playerTurn += 1;

    setState("player","draw","抽牌階段");
    drawPlayer2();
    safeRender();

    setTimeout(()=>{
      setState("player","summon","召喚階段");
      show("我方召喚階段。");
      safeRender();
    }, 700);
  }

  function startEnemyTurnAbsolute(){
    if(ABS.enemyRunning) return;

    ABS.enemyRunning = true;
    ABS.currentPlayer = "enemy";
    ABS.enemyTurn += 1;

    setState("enemy","draw","抽牌階段");
    drawEnemy2();
    safeRender();

    setTimeout(()=>{
      setState("enemy","summon","召喚階段");
      show("對手召喚階段。");
      try{
        summonEnemyFromHand();
      }catch(err){
        console.error("[XLW_ABSOLUTE_FLOW] enemy summon failed", err);
        show("對手召喚發生錯誤，已跳過避免卡住。");
      }
      safeRender();

      setTimeout(()=>{
        try{
          enemyAction();
        }catch(err){
          console.error("[XLW_ABSOLUTE_FLOW] enemy action failed", err);
          show("對手行動發生錯誤，已跳過避免卡住。");
        }
        safeRender();

        setTimeout(()=>{
          ABS.enemyRunning = false;
          startPlayerTurn();
        }, 900);
      }, 900);
    }, 900);
  }

  window.XLW_FORCE_ENEMY_TURN = startEnemyTurnAbsolute;

  function safeRender(){
    try{ if(typeof render === "function") render(); }catch(err){ console.error(err); }
  }

  function buildAbsolutePanel(){
    let p = document.getElementById("xlwAbsoluteControlPanel");
    if(!p){
      p = document.createElement("div");
      p.id = "xlwAbsoluteControlPanel";
      p.innerHTML = `
        <div class="xlw-abs-row">
          <div id="xlwAbsFormation" class="xlw-abs-btn formation" role="button" data-label="戰術佈陣"></div>
          <div id="xlwAbsAttack" class="xlw-abs-btn attack" role="button" data-label="進攻宣言"></div>
        </div>
        <div id="xlwAbsSummon" class="xlw-abs-btn summon" role="button" data-label="召喚"></div>
        <div id="xlwAbsEnd" class="xlw-abs-btn end" role="button" data-label="結束我方回合"></div>
      `;
      document.body.appendChild(p);

      document.getElementById("xlwAbsFormation").onclick = function(){
        show("已選擇戰術佈陣。");
        setState("player","formation_summon","戰術佈陣");
      };
      document.getElementById("xlwAbsAttack").onclick = function(){
        show("已選擇進攻宣言。");
        setState("player","attack","進攻宣言");
      };
      document.getElementById("xlwAbsSummon").onclick = function(){
        window.SK_HAND_SUMMON_MODE = true;
        try{ summonMode = true; }catch(err){}
        show("請先點選手牌，再點選可召喚位置。");
      };
      document.getElementById("xlwAbsEnd").onclick = function(){
        show("結束我方回合，進入對手回合。");
        startEnemyTurnAbsolute();
      };
    }

    p.style.setProperty("display","flex","important");
    p.style.setProperty("visibility","visible","important");
    p.style.setProperty("opacity","1","important");
    p.style.setProperty("pointer-events","auto","important");
  }

  function hideOldButtonPanels(){
    [
      "xlwFinalControlPanel",
      "surviveActionPanel",
      "stableActionPanel",
      "fixedRightActionPanel",
      "finalRightControlPanel",
      "prettyRightControlPanel"
    ].forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.style.setProperty("display","none","important");
        el.style.setProperty("visibility","hidden","important");
        el.style.setProperty("pointer-events","none","important");
      }
    });
  }

  function apply(){
    moveEnemyZones();
    enemyState();
    updateEnemyDeckDisplay();
    buildAbsolutePanel();
    hideOldButtonPanels();
  }

  const oldRenderAbsoluteFlow = render;
  render = function(){
    oldRenderAbsoluteFlow();
    requestAnimationFrame(apply);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1200);
  });

})();


// ======================================================
// FIRST TURN TRAVELER + END TURN FREEZE FIX
// ======================================================
(function(){

  window.XLW_ABSOLUTE_FLOW = window.XLW_ABSOLUTE_FLOW || {};
  const ABS = window.XLW_ABSOLUTE_FLOW;

  ABS.enemyRunning = false;

  function unlockFirstTurnTraveler(){

    const currentPlayer =
      ABS.currentPlayer ||
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.currentPlayer) ||
      window.currentPlayer ||
      "player";

    const phase =
      ABS.phase ||
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.phase) ||
      window.currentPhase ||
      "";

    const firstTurn =
      Number(ABS.playerTurn || 1) <= 1;

    const canUse =
      currentPlayer === "player" &&
      phase === "summon" &&
      firstTurn;

    const forestBtns = [
      ...document.querySelectorAll("#playerForest button"),
      ...document.querySelectorAll("[data-label='召喚小旅人']")
    ];

    forestBtns.forEach(btn=>{
      if(canUse){
        btn.disabled = false;
        btn.classList.remove("disabled");
        btn.classList.remove("rule-disabled");

        btn.style.setProperty("pointer-events","auto","important");
        btn.style.setProperty("opacity","1","important");
        btn.style.setProperty("filter","none","important");
      }
    });
  }

  function forceSafeEnemyTurn(){

    if(ABS.enemyRunning) return;

    ABS.enemyRunning = true;

    setTimeout(()=>{

      try{

        if(typeof window.XLW_FORCE_ENEMY_TURN === "function"){

          ABS.enemyRunning = false;

          window.XLW_FORCE_ENEMY_TURN();

          setTimeout(()=>{
            ABS.enemyRunning = false;
          }, 3000);

          return;
        }

      }catch(err){

        console.error("[XLW_FIX] enemy flow failed", err);

        ABS.enemyRunning = false;
      }

    }, 50);
  }

  function rebindEndTurn(){

    document.querySelectorAll("button").forEach(btn=>{

      const txt =
        String(
          btn.dataset.label ||
          btn.getAttribute("aria-label") ||
          btn.textContent ||
          ""
        ).replace(/\s+/g,"");

      if(
        !txt.includes("結束我方回合") &&
        !txt.includes("結束回合")
      ) return;

      btn.onclick = null;

      btn.addEventListener("click", function(e){

        e.preventDefault();
        e.stopPropagation();

        forceSafeEnemyTurn();

        return false;

      }, true);
    });

    ["#xlwAbsEnd","#xlwBtnEnd"].forEach(sel=>{

      document.querySelectorAll(sel).forEach(el=>{

        el.onclick = null;

        el.addEventListener("click", function(e){

          e.preventDefault();
          e.stopPropagation();

          forceSafeEnemyTurn();

          return false;

        }, true);
      });
    });
  }

  if(!window.__XLW_SAFE_RENDER_GUARD__){

    window.__XLW_SAFE_RENDER_GUARD__ = true;

    const oldRenderGuard = render;

    let rendering = false;

    render = function(){

      if(rendering) return;

      rendering = true;

      try{
        oldRenderGuard();
      }catch(err){
        console.error("[XLW_FIX] render failed", err);
      }

      requestAnimationFrame(()=>{

        unlockFirstTurnTraveler();
        rebindEndTurn();

        rendering = false;
      });
    };
  }

  document.addEventListener("DOMContentLoaded", ()=>{

    setTimeout(()=>{
      unlockFirstTurnTraveler();
      rebindEndTurn();
    }, 300);

    setTimeout(()=>{
      unlockFirstTurnTraveler();
      rebindEndTurn();
    }, 1200);
  });

})();


// ======================================================
// CLICKABLE FIRST TURN TRAVELER + ENEMY ATTACK RULE FIX
// 1. 第一回合小旅人按鈕解除 not-allowed cursor / pointer-events:none。
// 2. 對手若前方完全沒有我方單位，禁止進攻宣言，改進行戰術佈陣。
// ======================================================
(function(){

  function unlockTravelerRealClickable(){

    const currentPlayer =
      (window.XLW_ABSOLUTE_FLOW && window.XLW_ABSOLUTE_FLOW.currentPlayer) ||
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.currentPlayer) ||
      window.currentPlayer ||
      "player";

    const phase =
      (window.XLW_ABSOLUTE_FLOW && window.XLW_ABSOLUTE_FLOW.phase) ||
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.phase) ||
      window.currentPhase ||
      "";

    const firstTurn =
      Number(
        (window.XLW_ABSOLUTE_FLOW && window.XLW_ABSOLUTE_FLOW.playerTurn) ||
        1
      ) <= 1;

    const canUse =
      currentPlayer === "player" &&
      phase === "summon" &&
      firstTurn;

    if(!canUse) return;

    const els = [
      ...document.querySelectorAll("#playerForest button"),
      ...document.querySelectorAll("#playerForest *"),
      ...document.querySelectorAll("[data-label='召喚小旅人']")
    ];

    els.forEach(el=>{

      el.disabled = false;

      el.classList.remove("disabled");
      el.classList.remove("rule-disabled");

      el.style.setProperty("pointer-events","auto","important");
      el.style.setProperty("cursor","pointer","important");
      el.style.setProperty("opacity","1","important");
      el.style.setProperty("filter","none","important");

      // 若父層擋住也解除
      let p = el.parentElement;
      let depth = 0;

      while(p && depth < 5){

        p.style.setProperty("pointer-events","auto","important");
        p.style.setProperty("cursor","pointer","important");

        p = p.parentElement;
        depth++;
      }
    });
  }

  function playerHasFrontline(){

    const f = window.field || null;
    if(!f) return false;

    for(let i=0;i<5;i++){

      const unit =
        (f.player_front && f.player_front[i]) ||
        null;

      if(unit) return true;
    }

    return false;
  }

  // 覆寫敵方可攻擊判定
  window.XLW_ENEMY_CAN_ATTACK_RULE = function(){

    const f = window.field || null;
    if(!f) return false;

    // 若我方前方完全沒單位 => 禁止攻擊宣言
    if(!playerHasFrontline()){
      return false;
    }

    for(let i=0;i<5;i++){

      const u =
        (f.enemy_front && f.enemy_front[i]) ||
        (f.enemy_back && f.enemy_back[i]);

      if(
        u &&
        !u.tapped &&
        !(u.card && (
          u.card.attack === "盾" ||
          u.card.atk === "盾"
        ))
      ){
        return true;
      }
    }

    return false;
  };

  // 攔截舊 enemyCanAttack
  if(typeof enemyCanAttack === "function"){

    const oldEnemyCanAttack = enemyCanAttack;

    enemyCanAttack = function(){

      try{
        return window.XLW_ENEMY_CAN_ATTACK_RULE();
      }catch(err){
        console.error(err);
      }

      return oldEnemyCanAttack();
    };
  }

  // 攔截敵方行動
  if(typeof enemyAction === "function"){

    const oldEnemyAction = enemyAction;

    enemyAction = function(){

      // 我方前方無單位 => 強制戰術佈陣
      if(!window.XLW_ENEMY_CAN_ATTACK_RULE()){

        try{

          if(typeof setState === "function"){
            setState("enemy","formation_done","戰術佈陣");
          }

        }catch(err){}

        const f = window.field || null;

        if(f){

          for(let i=0;i<5;i++){

            if(
              f.enemy_back &&
              f.enemy_back[i] &&
              f.enemy_front &&
              !f.enemy_front[i]
            ){
              f.enemy_front[i] = f.enemy_back[i];
              f.enemy_back[i] = null;

              try{
                setStatus("對手前方無攻擊目標，改為戰術佈陣。");
              }catch(err){}

              return;
            }
          }
        }

        try{
          setStatus("對手前方無攻擊目標，跳過攻擊宣言。");
        }catch(err){}

        return;
      }

      return oldEnemyAction();
    };
  }

  const oldRenderTravelerFix = render;

  render = function(){

    oldRenderTravelerFix();

    requestAnimationFrame(()=>{
      unlockTravelerRealClickable();
    });
  };

  document.addEventListener("DOMContentLoaded", ()=>{

    setTimeout(unlockTravelerRealClickable, 300);
    setTimeout(unlockTravelerRealClickable, 1200);

  });

})();


// ======================================================
// SHIELD / BLOCK RULE GLOBAL FIX
// 盾牌單位規則：
// 1. 中上方為盾牌 => 視為「阻擋」單位。
// 2. 阻擋單位不具有攻擊力（不是0，是不可攻擊）。
// 3. 阻擋單位不能發動攻擊。
// 4. 阻擋單位不能被選為攻擊目標。
// 適用：喵喵賊 / 妖怪村莊 / 全部卡池。
// ======================================================
(function(){

  function isShieldUnit(card){

    if(!card) return false;

    const atk =
      card.attack ??
      card.atk ??
      card.power ??
      "";

    const text =
      String(
        card.effect_text ||
        card.effect ||
        card.keyword ||
        ""
      );

    return (
      atk === "盾" ||
      atk === "🛡" ||
      text.includes("阻擋")
    );
  }

  window.XLW_IS_SHIELD_UNIT = isShieldUnit;

  // ==========================================
  // 全域卡片正規化
  // ==========================================
  function normalizeAllCards(){

    const groups = [
      window.cards,
      window.cardPool,
      window.deck,
      window.playerDeck,
      window.enemyDeck,
      window.hand,
      window.playerHand,
      window.enemyHand
    ];

    groups.forEach(arr=>{

      if(!Array.isArray(arr)) return;

      arr.forEach(card=>{

        if(!card) return;

        if(isShieldUnit(card)){

          card.isShield = true;
          card.canAttack = false;
          card.cannotAttack = true;

          // 明確標記為「無攻擊能力」
          card.realAttack = null;
        }
      });
    });

    // 場上單位
    const f = window.field || null;

    if(f){

      Object.keys(f).forEach(zone=>{

        if(!Array.isArray(f[zone])) return;

        f[zone].forEach(unit=>{

          if(!unit || !unit.card) return;

          if(isShieldUnit(unit.card)){

            unit.card.isShield = true;
            unit.card.canAttack = false;
            unit.card.cannotAttack = true;

            unit.canAttack = false;
            unit.isShield = true;
          }
        });
      });
    }
  }

  // ==========================================
  // 禁止盾牌單位攻擊
  // ==========================================
  function canUnitAttack(unit){

    if(!unit || !unit.card) return false;

    if(isShieldUnit(unit.card)){
      return false;
    }

    if(unit.tapped) return false;

    return true;
  }

  window.XLW_CAN_UNIT_ATTACK = canUnitAttack;

  // ==========================================
  // 禁止選取盾牌單位為攻擊目標
  // ==========================================
  function canBeAttackTarget(unit){

    if(!unit || !unit.card) return false;

    if(isShieldUnit(unit.card)){
      return false;
    }

    return true;
  }

  window.XLW_CAN_BE_ATTACK_TARGET = canBeAttackTarget;

  // ==========================================
  // 攔截舊 attackDeclareMode / 攻擊流程
  // ==========================================
  document.addEventListener("click", function(e){

    const target = e.target;

    // 點到場上單位
    const slot =
      target.closest &&
      target.closest(".slot,.field-slot,.battle-slot");

    if(!slot) return;

    try{

      const zone =
        slot.dataset.zone ||
        slot.getAttribute("data-zone");

      const idx =
        Number(
          slot.dataset.index ||
          slot.getAttribute("data-index") ||
          -1
        );

      const f = window.field || null;

      if(!f || !f[zone]) return;

      const unit = f[zone][idx];

      // 阻止盾牌單位發動攻擊
      if(
        window.SK_ATTACK_DECLARE_MODE &&
        unit &&
        unit.card &&
        isShieldUnit(unit.card)
      ){

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        try{
          setStatus("具有阻擋效果的單位不能發動攻擊。");
        }catch(err){}

        return false;
      }

      // 阻止選擇盾牌單位為攻擊目標
      if(
        window.attackTargetMode &&
        unit &&
        unit.card &&
        isShieldUnit(unit.card)
      ){

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        try{
          setStatus("具有阻擋效果的單位不能被選為攻擊目標。");
        }catch(err){}

        return false;
      }

    }catch(err){
      console.error(err);
    }

  }, true);

  // ==========================================
  // 覆寫敵方攻擊判定
  // ==========================================
  if(typeof enemyCanAttack === "function"){

    const oldEnemyCanAttackShield = enemyCanAttack;

    enemyCanAttack = function(){

      const f = window.field || null;

      if(!f) return false;

      for(let i=0;i<5;i++){

        const u =
          (f.enemy_front && f.enemy_front[i]) ||
          (f.enemy_back && f.enemy_back[i]);

        if(
          u &&
          u.card &&
          !isShieldUnit(u.card) &&
          !u.tapped
        ){
          return true;
        }
      }

      return false;
    };
  }

  // ==========================================
  // render 時持續正規化
  // ==========================================
  const oldRenderShieldFix = render;

  render = function(){

    oldRenderShieldFix();

    requestAnimationFrame(()=>{
      normalizeAllCards();
    });
  };

  document.addEventListener("DOMContentLoaded", ()=>{

    setTimeout(normalizeAllCards, 300);
    setTimeout(normalizeAllCards, 1200);

  });

})();


// ======================================================
// WALL YOKAI = SHIELD UNIT
// 「牆壁妖怪」固定視為阻擋單位。
// ======================================================
(function(){

  if(typeof window.XLW_IS_SHIELD_UNIT === "function"){

    const oldShieldJudge = window.XLW_IS_SHIELD_UNIT;

    window.XLW_IS_SHIELD_UNIT = function(card){

      if(!card) return false;

      const name = String(card.name || "");

      // 牆壁妖怪固定為阻擋單位
      if(name.includes("牆壁妖怪")){
        return true;
      }

      return oldShieldJudge(card);
    };
  }

})();


// ======================================================
// ACTION BUTTONS FUNCTIONAL FIX
// 修正：戰術佈陣 / 進攻宣言按鈕看得到但無法執行。
// 原因：目前專案中已有多層舊按鈕與 render wrapper，部分會把 phase 卡在 summon，
// 導致按鈕按下後沒有進入可操作模式。
// 本版建立「最終權威按鈕行為」：不依賴 choose_action 檢查，只要是我方回合且非先手第一回合限制，
// 點擊就直接切換到對應模式，且兩者二選一。
// ======================================================
(function(){

  const ACT = window.XLW_ACTION_BUTTONS_FINAL = window.XLW_ACTION_BUTTONS_FINAL || {
    actionChoice:null,
    playerTurn:1
  };

  function auth(){
    window.XLW_AUTH_FINAL = window.XLW_AUTH_FINAL || {};
    return window.XLW_AUTH_FINAL;
  }

  function abs(){
    window.XLW_ABSOLUTE_FLOW = window.XLW_ABSOLUTE_FLOW || {};
    return window.XLW_ABSOLUTE_FLOW;
  }

  function owner(){
    return auth().currentPlayer || abs().currentPlayer || window.currentPlayer || "player";
  }

  function phase(){
    return auth().phase || abs().phase || window.currentPhase || window.mode || "";
  }

  function playerTurn(){
    return Number(auth().playerTurn || abs().playerTurn || ACT.playerTurn || window.playerTurn || 1);
  }

  function isFirstPlayerFirstTurn(){
    return owner() === "player" && playerTurn() <= 1;
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function top(label){
    const el = document.getElementById("topStatusPhase");
    if(el) el.textContent = "我方｜" + label;
  }

  function setMode(raw, label){
    auth().currentPlayer = "player";
    auth().phase = raw;
    abs().currentPlayer = "player";
    abs().phase = raw;

    const e = window.STAR_UNIFIED || window.SK_ENGINE || null;
    if(e){
      e.currentPlayer = "player";
      e.phase = raw;
      e.actionPhase = raw;
      e.subphase = raw;
      e.selectedAction = raw;
    }

    try{ currentPlayer = "player"; }catch(err){}
    try{ currentPhase = raw; }catch(err){}
    try{ mode = raw; }catch(err){}
    try{ phase = label; }catch(err){}

    window.XLW_ACTION_MODE = "player_" + raw;
    window.SK_ACTION_MODE = "player_" + raw;

    top(label);
  }

  function clearModes(){
    window.SK_HAND_SUMMON_MODE = false;
    window.SK_TRAVELER_SUMMON_MODE = false;
    window.SK_ATTACK_DECLARE_MODE = false;
    window.SK_FORMATION_MODE = false;

    try{ summonMode = false; }catch(e){}
    try{ attackDeclareMode = false; }catch(e){}
    try{ formationMode = false; }catch(e){}
    try{ moveMode = false; }catch(e){}
    try{ selectedAction = null; }catch(e){}

    const eng = window.STAR_UNIFIED || window.SK_ENGINE || null;
    if(eng){
      eng.summonMode = false;
      eng.attackDeclareMode = false;
      eng.formationMode = false;
      eng.moveMode = false;
    }
  }

  function enterFormationFinal(){
    if(owner() !== "player"){
      show("目前不是我方回合。");
      return;
    }

    if(isFirstPlayerFirstTurn()){
      show("先手玩家第一回合只有召喚階段，不能戰術佈陣。");
      return;
    }

    if(ACT.actionChoice && ACT.actionChoice !== "formation"){
      show("本回合已選擇進攻宣言，不能再戰術佈陣。");
      return;
    }

    clearModes();
    ACT.actionChoice = "formation";

    setMode("formation", "戰術佈陣");

    window.SK_FORMATION_MODE = true;
    try{ formationMode = true; }catch(e){}
    try{ moveMode = true; }catch(e){}
    try{ selectedAction = "formation"; }catch(e){}

    const eng = window.STAR_UNIFIED || window.SK_ENGINE || null;
    if(eng){
      eng.formationMode = true;
      eng.moveMode = true;
      eng.selectedAction = "formation";
    }

    document.body.classList.add("mode-formation");
    document.body.classList.remove("mode-attack-declare");

    show("已進入戰術佈陣。完成後只能結束回合，不能再進攻宣言。");
    updateButtonVisuals();
    try{ if(typeof render === "function") render(); }catch(e){}
  }

  function enterAttackFinal(){
    if(owner() !== "player"){
      show("目前不是我方回合。");
      return;
    }

    if(isFirstPlayerFirstTurn()){
      show("先手玩家第一回合只有召喚階段，不能進攻宣言。");
      return;
    }

    if(ACT.actionChoice && ACT.actionChoice !== "attack"){
      show("本回合已選擇戰術佈陣，不能再進攻宣言。");
      return;
    }

    clearModes();
    ACT.actionChoice = "attack";

    setMode("attack", "進攻宣言");

    window.SK_ATTACK_DECLARE_MODE = true;
    try{ attackDeclareMode = true; }catch(e){}
    try{ selectedAction = "attack"; }catch(e){}

    const eng = window.STAR_UNIFIED || window.SK_ENGINE || null;
    if(eng){
      eng.attackDeclareMode = true;
      eng.selectedAction = "attack";
    }

    document.body.classList.add("mode-attack-declare");
    document.body.classList.remove("mode-formation");

    show("已進入進攻宣言。完成後只能結束回合，不能再戰術佈陣。");
    updateButtonVisuals();
    try{ if(typeof render === "function") render(); }catch(e){}
  }

  function resetChoiceWhenNewTurn(){
    const key = owner() + ":" + playerTurn();
    if(ACT.turnKey !== key){
      ACT.turnKey = key;
      ACT.actionChoice = null;
    }
  }

  function findFormationEls(){
    return [
      ...document.querySelectorAll("#xlwAbsFormation"),
      ...document.querySelectorAll("#xlwBtnFormation"),
      ...document.querySelectorAll("[data-label='戰術佈陣']"),
      ...Array.from(document.querySelectorAll("button,div[role='button']")).filter(el=>
        (el.textContent || "").replace(/\s+/g,"").includes("戰術佈陣")
      )
    ];
  }

  function findAttackEls(){
    return [
      ...document.querySelectorAll("#xlwAbsAttack"),
      ...document.querySelectorAll("#xlwBtnAttack"),
      ...document.querySelectorAll("[data-label='進攻宣言']"),
      ...Array.from(document.querySelectorAll("button,div[role='button']")).filter(el=>
        (el.textContent || "").replace(/\s+/g,"").includes("進攻宣言")
      )
    ];
  }

  function styleClickable(el, disabled, active){
    if(!el) return;

    el.disabled = !!disabled;
    el.classList.toggle("disabled", !!disabled);
    el.classList.toggle("rule-disabled", !!disabled);
    el.classList.toggle("active", !!active);
    el.classList.toggle("active-choice", !!active);

    el.style.setProperty("pointer-events", disabled ? "none" : "auto", "important");
    el.style.setProperty("cursor", disabled ? "not-allowed" : "pointer", "important");
    el.style.setProperty("opacity", disabled ? ".35" : "1", "important");
    el.style.setProperty("filter", disabled ? "grayscale(1)" : "none", "important");
  }

  function updateButtonVisuals(){
    resetChoiceWhenNewTurn();

    const first = isFirstPlayerFirstTurn();
    const notPlayer = owner() !== "player";

    const formationDisabled =
      notPlayer ||
      first ||
      (ACT.actionChoice && ACT.actionChoice !== "formation");

    const attackDisabled =
      notPlayer ||
      first ||
      (ACT.actionChoice && ACT.actionChoice !== "attack");

    findFormationEls().forEach(el=>styleClickable(el, formationDisabled, ACT.actionChoice === "formation"));
    findAttackEls().forEach(el=>styleClickable(el, attackDisabled, ACT.actionChoice === "attack"));
  }

  function bindFinalActionButtons(){
    resetChoiceWhenNewTurn();

    findFormationEls().forEach(el=>{
      if(el.dataset.xlwFinalActionBound === "1") return;
      el.dataset.xlwFinalActionBound = "1";
      el.onclick = function(e){
        if(e){ e.preventDefault(); e.stopPropagation(); }
        enterFormationFinal();
        return false;
      };
    });

    findAttackEls().forEach(el=>{
      if(el.dataset.xlwFinalActionBound === "1") return;
      el.dataset.xlwFinalActionBound = "1";
      el.onclick = function(e){
        if(e){ e.preventDefault(); e.stopPropagation(); }
        enterAttackFinal();
        return false;
      };
    });

    updateButtonVisuals();
  }

  const oldRenderActionFunctional = render;
  render = function(){
    oldRenderActionFunctional();
    requestAnimationFrame(bindFinalActionButtons);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    bindFinalActionButtons();
    setTimeout(bindFinalActionButtons, 500);
    setTimeout(bindFinalActionButtons, 1200);
  });

})();


// ======================================================
// SAME LANE ATTACK RULE FIX
// 規則：雙方同一行戰線上沒有對方單位，則不能發起攻擊。
// 例：我方第3行要攻擊時，對手前排3 / 後排3 皆為空，則該我方單位不能攻擊。
// 對手同理：對手第3行要攻擊時，我方前排3 / 後排3 皆為空，則該對手單位不能攻擊。
// ======================================================
(function(){

  function getField(){
    try{
      if(typeof field !== "undefined") return field;
    }catch(e){}
    return window.field || null;
  }

  function zoneOwner(zone){
    if(!zone) return null;
    if(String(zone).startsWith("player_")) return "player";
    if(String(zone).startsWith("enemy_")) return "enemy";
    return null;
  }

  function opponentZones(owner){
    return owner === "player"
      ? ["enemy_front", "enemy_back"]
      : ["player_front", "player_back"];
  }

  function sameLaneHasOpponent(owner, laneIndex){
    const f = getField();
    if(!f) return false;

    const zones = opponentZones(owner);

    for(const z of zones){
      if(f[z] && f[z][laneIndex]){
        return true;
      }
    }

    return false;
  }

  function isShieldUnit(card){
    if(!card) return false;
    if(typeof window.XLW_IS_SHIELD_UNIT === "function"){
      try{ return window.XLW_IS_SHIELD_UNIT(card); }catch(e){}
    }

    const atk = card.attack ?? card.atk ?? card.power ?? "";
    const text = String(card.effect_text || card.effect || card.keyword || "");
    const name = String(card.name || "");

    return atk === "盾" || atk === "🛡" || text.includes("阻擋") || name.includes("牆壁妖怪");
  }

  function canUnitDeclareAttack(owner, laneIndex, unit){
    if(!unit || !unit.card) return false;
    if(unit.tapped) return false;
    if(isShieldUnit(unit.card)) return false;

    // 核心規則：同一行沒有對方前/後排單位，不能攻擊
    if(!sameLaneHasOpponent(owner, laneIndex)){
      return false;
    }

    return true;
  }

  window.XLW_SAME_LANE_HAS_OPPONENT = sameLaneHasOpponent;
  window.XLW_CAN_UNIT_DECLARE_ATTACK = canUnitDeclareAttack;

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  // 攔截玩家點選攻擊單位
  document.addEventListener("click", function(e){
    const slot = e.target.closest && e.target.closest(".slot,.field-slot,.battle-slot,[data-zone][data-index]");
    if(!slot) return;

    const z = slot.dataset.zone || slot.getAttribute("data-zone");
    const idx = Number(slot.dataset.index || slot.getAttribute("data-index"));
    if(!Number.isFinite(idx) || idx < 0) return;

    const owner = zoneOwner(z);
    if(owner !== "player") return;

    const attackingMode =
      window.SK_ATTACK_DECLARE_MODE ||
      window.XLW_ACTION_MODE === "player_attack" ||
      window.SK_ACTION_MODE === "player_attack" ||
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.phase === "attack") ||
      (window.XLW_ABSOLUTE_FLOW && window.XLW_ABSOLUTE_FLOW.phase === "attack");

    if(!attackingMode) return;

    const f = getField();
    if(!f || !f[z]) return;

    const unit = f[z][idx];

    if(unit && !canUnitDeclareAttack("player", idx, unit)){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if(isShieldUnit(unit.card)){
        show("具有阻擋效果的單位不能發動攻擊。");
      }else if(!sameLaneHasOpponent("player", idx)){
        show("同一行戰線上沒有對手單位，不能發起攻擊。");
      }else{
        show("此單位目前不能攻擊。");
      }

      return false;
    }
  }, true);

  // 覆寫/加強敵方是否可攻擊
  window.XLW_ENEMY_CAN_ATTACK_BY_LANE = function(){
    const f = getField();
    if(!f) return false;

    for(let i=0;i<5;i++){
      const candidates = [
        f.enemy_front && f.enemy_front[i],
        f.enemy_back && f.enemy_back[i]
      ];

      for(const u of candidates){
        if(canUnitDeclareAttack("enemy", i, u)){
          return true;
        }
      }
    }

    return false;
  };

  window.XLW_ENEMY_DECLARE_ATTACK_BY_LANE = function(){
    const f = getField();
    if(!f) return false;

    for(let i=0;i<5;i++){
      const front = f.enemy_front && f.enemy_front[i];
      const back = f.enemy_back && f.enemy_back[i];

      const u = canUnitDeclareAttack("enemy", i, front) ? front :
                canUnitDeclareAttack("enemy", i, back) ? back :
                null;

      if(u){
        u.attacking = true;
        u.tapped = true;
        window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;

        const eng = window.STAR_UNIFIED || window.SK_ENGINE || null;
        if(eng){
          eng.enemyDeclaredAttackLastTurn = true;
        }

        show("對手於第 " + (i + 1) + " 行發動進攻宣言。");
        return true;
      }
    }

    show("對手同戰線沒有可攻擊目標，不能進攻，改為戰術佈陣或跳過。");
    return false;
  };

  // 若舊版 enemyCanAttack 存在，改成同戰線判定
  try{
    enemyCanAttack = function(){
      return window.XLW_ENEMY_CAN_ATTACK_BY_LANE();
    };
  }catch(e){}

  // 若舊版 enemyAction 存在，加入同戰線判定
  try{
    const oldEnemyActionSameLane = enemyAction;
    enemyAction = function(){
      if(window.XLW_ENEMY_CAN_ATTACK_BY_LANE()){
        return window.XLW_ENEMY_DECLARE_ATTACK_BY_LANE();
      }

      // 沒有可攻擊目標，改走原本戰術/跳過邏輯
      if(typeof oldEnemyActionSameLane === "function"){
        // 但避免舊 enemyAction 又強制攻擊，所以先暫時關掉 attack flag
        return oldEnemyActionSameLane();
      }

      show("對手同戰線沒有可攻擊目標，跳過攻擊。");
      return false;
    };
  }catch(e){}

  // render 後標示不可攻擊的單位，避免使用者誤點
  function markIllegalAttackers(){
    const f = getField();
    if(!f) return;

    document.querySelectorAll("[data-zone][data-index]").forEach(el=>{
      const z = el.dataset.zone || el.getAttribute("data-zone");
      const idx = Number(el.dataset.index || el.getAttribute("data-index"));
      const owner = zoneOwner(z);

      if(!owner || !Number.isFinite(idx) || !f[z]) return;

      const unit = f[z][idx];
      if(!unit) {
        el.classList.remove("same-lane-cannot-attack");
        return;
      }

      const cannot =
        owner === "player" &&
        (
          !sameLaneHasOpponent("player", idx) ||
          isShieldUnit(unit.card)
        );

      el.classList.toggle("same-lane-cannot-attack", !!cannot);
    });
  }

  const oldRenderSameLaneAttackRule = render;
  render = function(){
    oldRenderSameLaneAttackRule();
    requestAnimationFrame(markIllegalAttackers);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(markIllegalAttackers, 300);
    setTimeout(markIllegalAttackers, 1200);
  });

})();


// ======================================================
// PLAYER TURN DRAW 2 + ENEMY SHIELD CANNOT ATTACK FINAL FIX
// 1. 我方第2回合開始，以及之後每個我方回合開始，自動抽2張。
// 2. 對手阻擋/盾牌單位不得進攻宣言；若舊AI嘗試宣言，會被立即取消。
// ======================================================
(function(){

  const FIX = window.XLW_PLAYER_DRAW_AND_SHIELD_FIX = window.XLW_PLAYER_DRAW_AND_SHIELD_FIX || {
    playerTurn: 1,
    lastOwner: null,
    drawnPlayerTurnKeys: {},
    lastPlayerUnitCount: null
  };

  function engine(){
    return window.STAR_UNIFIED || window.SK_ENGINE || null;
  }

  function owner(){
    return (
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.currentPlayer) ||
      (window.XLW_ABSOLUTE_FLOW && window.XLW_ABSOLUTE_FLOW.currentPlayer) ||
      (engine() && engine().currentPlayer) ||
      window.currentPlayer ||
      "player"
    );
  }

  function phaseName(){
    return String(
      (window.XLW_AUTH_FINAL && window.XLW_AUTH_FINAL.phase) ||
      (window.XLW_ABSOLUTE_FLOW && window.XLW_ABSOLUTE_FLOW.phase) ||
      (engine() && engine().phase) ||
      window.currentPhase ||
      window.mode ||
      ""
    );
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function getPlayerHand(){
    if(Array.isArray(window.hand)) return window.hand;
    if(Array.isArray(window.playerHand)) return window.playerHand;
    window.XLW_PLAYER = window.XLW_PLAYER || {};
    if(!Array.isArray(window.XLW_PLAYER.hand)) window.XLW_PLAYER.hand = [];
    return window.XLW_PLAYER.hand;
  }

  function getPlayerDeck(){
    if(Array.isArray(window.deck)) return window.deck;
    if(Array.isArray(window.playerDeck)) return window.playerDeck;
    window.XLW_PLAYER = window.XLW_PLAYER || {};
    if(!Array.isArray(window.XLW_PLAYER.deck)) window.XLW_PLAYER.deck = [];
    return window.XLW_PLAYER.deck;
  }

  function drawPlayerTwoOnce(reason){
    if(FIX.playerTurn <= 1) return 0;

    const key = "player:" + FIX.playerTurn;
    if(FIX.drawnPlayerTurnKeys[key]) return 0;

    const hand = getPlayerHand();
    const deck = getPlayerDeck();

    if(!hand || !deck) return 0;

    let drew = 0;
    for(let i=0;i<2;i++){
      if(deck.length){
        hand.push(deck.shift());
        drew++;
      }
    }

    FIX.drawnPlayerTurnKeys[key] = true;

    if(drew > 0){
      show("我方第 " + FIX.playerTurn + " 回合開始：自動抽 " + drew + " 張牌。");
    }

    return drew;
  }

  function syncPlayerTurnFromState(){
    const currentOwner = owner();
    const ph = phaseName();

    if(FIX.lastOwner === null){
      FIX.lastOwner = currentOwner;
    }

    // 從對手回到我方，視為我方新回合開始
    if(FIX.lastOwner === "enemy" && currentOwner === "player"){
      FIX.playerTurn += 1;
      drawPlayerTwoOnce("owner-change");
    }

    // 若狀態已經在我方抽牌階段，也補抽一次
    if(currentOwner === "player" && (ph === "draw" || ph.includes("抽牌"))){
      drawPlayerTwoOnce("draw-phase");
    }

    FIX.lastOwner = currentOwner;
  }

  function getField(){
    try{
      if(typeof field !== "undefined") return field;
    }catch(e){}
    return window.field || null;
  }

  function isShieldCard(card){
    if(!card) return false;

    if(typeof window.XLW_IS_SHIELD_UNIT === "function"){
      try{
        if(window.XLW_IS_SHIELD_UNIT(card)) return true;
      }catch(e){}
    }

    const name = String(card.name || "");
    const atk = card.attack ?? card.atk ?? card.power ?? "";
    const text = String(card.effect_text || card.effect || card.keyword || "");

    return (
      atk === "盾" ||
      atk === "🛡" ||
      text.includes("阻擋") ||
      name.includes("牆壁妖怪") ||
      name.includes("晴天娃娃")
    );
  }

  function enemySameLaneHasPlayerUnit(lane){
    const f = getField();
    if(!f) return false;

    return !!(
      (f.player_front && f.player_front[lane]) ||
      (f.player_back && f.player_back[lane])
    );
  }

  function enemyUnitCanAttack(unit, lane){
    if(!unit || !unit.card) return false;
    if(unit.tapped) return false;
    if(isShieldCard(unit.card)) return false;
    if(!enemySameLaneHasPlayerUnit(lane)) return false;
    return true;
  }

  function cancelIllegalEnemyShieldAttacks(){
    const f = getField();
    if(!f) return;

    for(let i=0;i<5;i++){
      ["enemy_front", "enemy_back"].forEach(zone=>{
        const unit = f[zone] && f[zone][i];
        if(!unit || !unit.card) return;

        if(isShieldCard(unit.card)){
          unit.isShield = true;
          unit.canAttack = false;
          unit.card.isShield = true;
          unit.card.canAttack = false;
          unit.card.cannotAttack = true;

          // 若舊流程已把盾牌單位設為進攻，立刻取消
          if(unit.attacking){
            unit.attacking = false;
            unit.target = null;
            show("阻擋單位不能發動攻擊，已取消對手盾牌單位的進攻宣言。");
          }
        }

        // 同戰線無我方單位也不能維持進攻宣言
        if(unit.attacking && !enemyUnitCanAttack(unit, i)){
          unit.attacking = false;
          unit.target = null;
          if(isShieldCard(unit.card)){
            show("阻擋單位不能發動攻擊。");
          }else{
            show("同一行戰線上沒有我方單位，對手不能發動攻擊。");
          }
        }
      });
    }
  }

  window.XLW_ENEMY_CAN_ATTACK_BY_RULE = function(){
    const f = getField();
    if(!f) return false;

    for(let i=0;i<5;i++){
      const front = f.enemy_front && f.enemy_front[i];
      const back = f.enemy_back && f.enemy_back[i];

      if(enemyUnitCanAttack(front, i) || enemyUnitCanAttack(back, i)){
        return true;
      }
    }

    return false;
  };

  window.XLW_ENEMY_DECLARE_ATTACK_BY_RULE = function(){
    const f = getField();
    if(!f) return false;

    for(let i=0;i<5;i++){
      const front = f.enemy_front && f.enemy_front[i];
      const back = f.enemy_back && f.enemy_back[i];

      const unit =
        enemyUnitCanAttack(front, i) ? front :
        enemyUnitCanAttack(back, i) ? back :
        null;

      if(unit){
        unit.attacking = true;
        unit.tapped = true;
        window.ENEMY_ATTACK_DECLARED_LAST_TURN = true;

        const eng = engine();
        if(eng) eng.enemyDeclaredAttackLastTurn = true;

        show("對手於第 " + (i + 1) + " 行發動進攻宣言。");
        return true;
      }
    }

    show("對手沒有合法攻擊單位，跳過進攻宣言。");
    return false;
  };

  // 覆寫常見全域 enemyCanAttack / enemyAction，避免盾牌單位被舊AI拿去攻擊
  try{
    enemyCanAttack = function(){
      return window.XLW_ENEMY_CAN_ATTACK_BY_RULE();
    };
  }catch(e){}

  try{
    const oldEnemyActionShieldFinal = enemyAction;
    enemyAction = function(){
      cancelIllegalEnemyShieldAttacks();

      if(window.XLW_ENEMY_CAN_ATTACK_BY_RULE()){
        return window.XLW_ENEMY_DECLARE_ATTACK_BY_RULE();
      }

      // 沒有合法攻擊者時，保留舊戰術佈陣或跳過
      if(typeof oldEnemyActionShieldFinal === "function"){
        return oldEnemyActionShieldFinal();
      }

      show("對手沒有合法攻擊單位，跳過進攻宣言。");
      return false;
    };
  }catch(e){}

  function applyFixes(){
    syncPlayerTurnFromState();
    cancelIllegalEnemyShieldAttacks();
  }

  const oldRenderPlayerDrawShieldFix = render;
  render = function(){
    oldRenderPlayerDrawShieldFix();
    requestAnimationFrame(applyFixes);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    applyFixes();
    setInterval(applyFixes, 350);
  });

})();

// ======================================================
// CAT BURGLARS DATABASE / 喵喵賊卡牌資料庫
// ======================================================
(function(){
  const CAT_DB = {"version": "cat_2026_05_current", "race": "喵喵賊", "main_deck_rule": {"deck_size": 20, "allowed_races": ["喵喵賊", "中立"], "exclude_types": ["outside_upgrade"], "notes": "左側有黃色星星的場外升級卡不放入牌庫、不佔20張；outside_limit代表可放張數。"}, "outside_deck_rule": {"enabled": true, "type": "outside_upgrade", "limit_field": "outside_limit"}, "cards": [{"id": "CAT-0001", "name": "靴喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 3, "tribute": 0, "keywords": ["偷襲"], "effect": "偷襲。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "PROMO-CAT-0001", "name": "靴喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 3, "tribute": 0, "keywords": ["偷襲", "PROMO", "異圖"], "effect": "偷襲。PROMO異圖。", "deck_eligible": true, "base_id": "CAT-0001", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "SSSR-CAT-0001", "name": "靴喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 3, "tribute": 0, "keywords": ["偷襲", "SSSR", "異圖"], "effect": "偷襲。SSSR異圖。", "deck_eligible": true, "base_id": "CAT-0001", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "CAT-0002", "name": "喵媽媽", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 4, "tribute": 1, "keywords": ["偷襲", "回手保護"], "effect": "偷襲。立即：下回合敵方防守階段時，使被破壞的所有我方偷襲單位改為回手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0003", "name": "驚喜喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 3, "tribute": 0, "keywords": ["偷襲", "額外打出"], "effect": "偷襲。你的其他單位偷襲成功時，可從手牌額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0004", "name": "虎老大", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 7, "tribute": 2, "keywords": ["偷襲", "額外打出", "終端"], "effect": "當敵方防守階段你有2個或以上的單位偷襲成功，可從手牌額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0004", "name": "虎老大", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 7, "tribute": 2, "keywords": ["偷襲", "額外打出", "終端", "異圖"], "effect": "當敵方防守階段你有2個或以上的單位偷襲成功，可從手牌額外打出此卡。SSR異圖。", "deck_eligible": true, "base_id": "CAT-0004", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "VR-CAT-0004", "name": "虎老大", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 7, "tribute": 2, "keywords": ["偷襲", "額外打出", "終端", "異圖"], "effect": "當敵方防守階段你有2個或以上的單位偷襲成功，可從手牌額外打出此卡。VR異圖。", "deck_eligible": true, "base_id": "CAT-0004", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "CAT-0005", "name": "綠喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 1, "reward": 3, "tribute": 0, "keywords": ["偷襲", "劇毒", "額外打出"], "effect": "劇毒。你的其他單位偷襲成功時，可從手牌額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0006", "name": "導遊喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 1, "tribute": 0, "keywords": ["偷襲", "小旅人"], "effect": "偷襲。此卡偷襲成功時，召喚3個小旅人。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0007", "name": "瘟疫喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 1, "tribute": 0, "keywords": ["偷襲", "牌庫破壞"], "effect": "偷襲。此卡偷襲成功時，棄掉敵方牌庫頂1張牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0008", "name": "老喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 5, "tribute": 0, "keywords": ["偷襲", "額外打出"], "effect": "偷襲。你的其他單位偷襲成功時，可從手牌額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0009", "name": "保喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 3, "tribute": 0, "keywords": ["偷襲", "魔法抗性", "保護"], "effect": "立即：使我方偷襲單位不會被敵方魔法卡選為目標直到下回合敵方防守階段結束。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CRP-CAT-0009", "name": "鷲峰良保喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 3, "tribute": 0, "keywords": ["偷襲", "敵方魔法抗性", "保護", "異圖"], "effect": "立即：使你偷襲單位被賦予敵方魔法抗性直到下回合敵方防守階段結束。", "deck_eligible": true, "base_id": "CAT-0009", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "CAT-0010", "name": "粉喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 2, "tribute": 0, "keywords": ["偷襲", "抽牌"], "effect": "偷襲。此卡偷襲成功時，抽1張牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0010", "name": "火野貝粉喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 2, "tribute": 0, "keywords": ["偷襲", "抽牌", "異圖"], "effect": "偷襲。此卡偷襲成功時，抽1張牌。", "deck_eligible": true, "base_id": "CAT-0010", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "CAT-0011", "name": "黑喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 6, "reward": 3, "tribute": 1, "keywords": ["偷襲", "破壞"], "effect": "偷襲。此卡偷襲成功時，使敵方場上1單位被破壞。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0011", "name": "黑喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 6, "reward": 3, "tribute": 1, "keywords": ["偷襲", "破壞", "異圖"], "effect": "偷襲。此卡偷襲成功時，使敵方場上1單位被破壞。SSR異圖。", "deck_eligible": true, "base_id": "CAT-0011", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "CAT-0012", "name": "喵玩具", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": -2, "reward": 0, "tribute": 0, "keywords": ["敵方場", "回手"], "effect": "可打在敵方場上。此卡進入墓地時會回到持有人手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0013", "name": "忍喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 3, "tribute": 0, "keywords": ["額外打出"], "effect": "你的主要階段開始時，若敵方場上單位總數為5或以上時，可從手牌額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0014", "name": "叮噹喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 1, "reward": 5, "tribute": 1, "keywords": ["偷襲", "後排", "額外打出"], "effect": "偷襲。你的其他單位偷襲成功時，可從手牌額外打出此卡；此卡可打出/召喚在後排戰線。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0015", "name": "騎士喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 2, "tribute": 0, "keywords": ["偷襲", "除外"], "effect": "偷襲。使被此卡戰鬥破壞的單位被除外，該單位被賦予的所有魔法卡則進入墓地。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0016", "name": "飄飄喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 1, "tribute": 0, "keywords": ["偷襲", "額外打出", "墓地觸發"], "effect": "偷襲。當你有單位進入墓地時，可從手牌額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0017", "name": "跳跳箱", "race": "喵喵賊", "faction": "喵喵賊", "type": "field", "attack": null, "reward": null, "tribute": 0, "keywords": ["場地", "偷襲賦予"], "effect": "主要階段。使你前排戰線所有單位被賦予偷襲；對小旅人無效。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "CAT-0018", "name": "虐傭兵", "race": "喵喵賊", "faction": "喵喵賊", "type": "spell", "attack": null, "reward": null, "tribute": 0, "keywords": ["消耗", "檢索"], "effect": "你的單位偷襲成功時，展示牌庫頂的3張牌，使其中喵喵賊單位加入手牌，其餘以順序放回牌庫頂。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "R-CAT-0019", "name": "脫逃", "race": "喵喵賊", "faction": "喵喵賊", "type": "spell", "attack": null, "reward": null, "tribute": 0, "keywords": ["消耗", "回手"], "effect": "敵方防守階段。使你在本次進攻時所有被破壞的單位改為回手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "CAT-0020", "name": "捕喵網", "race": "喵喵賊", "faction": "喵喵賊", "type": "spell", "attack": null, "reward": null, "tribute": 0, "keywords": ["消耗", "檢索"], "effect": "主要階段。從你牌庫尋找1張喵喵賊單位展示並加入手牌，然後重洗牌庫。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "R-CAT-0021", "name": "幽靈喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 2, "tribute": 0, "keywords": ["偷襲", "墓地額外打出"], "effect": "你的其他單位偷襲成功時，可從你墓地額外打出此卡。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SR-CAT-0022", "name": "壯壯喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 6, "reward": 4, "tribute": 1, "keywords": ["偷襲", "戰鬥不破壞"], "effect": "偷襲。此卡在戰鬥時不會被破壞。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "CAT-0023", "name": "醫療喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 5, "reward": 5, "tribute": 1, "keywords": ["偷襲", "墓地召喚"], "effect": "偷襲。此卡偷襲成功時，使你墓地2張喵喵賊單位卡被召喚。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0023", "name": "醫療喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 5, "reward": 5, "tribute": 1, "keywords": ["偷襲", "墓地召喚", "異圖"], "effect": "偷襲。此卡偷襲成功時，使你墓地2張喵喵賊單位卡被召喚。SSR異圖。", "deck_eligible": true, "base_id": "CAT-0023", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "CAT-0024", "name": "喵女", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 1, "tribute": 0, "keywords": ["偷襲", "額外打出", "無需祭品"], "effect": "偷襲。立即：使你手牌1張無需祭品的偷襲單位卡被額外打出。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0024", "name": "喵女", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 1, "tribute": 0, "keywords": ["偷襲", "額外打出", "無需祭品", "異圖"], "effect": "偷襲。立即：使你手牌1張無需祭品的偷襲單位卡被額外打出。SSR異圖。", "deck_eligible": true, "base_id": "CAT-0024", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "R-CAT-0025", "name": "壞掉的機械喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 5, "reward": 2, "tribute": 0, "keywords": ["機械", "偷襲賦予", "不能攻擊"], "effect": "此卡無法進攻，且左右邊的非小旅人單位獲得偷襲。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "SR-CAT-0026", "name": "惡魔招財喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 1, "tribute": 0, "keywords": ["神族", "偷襲", "墓地循環", "獎勵"], "effect": "你的主要階段，若你墓地有3個或以上喵喵賊單位，才可從手牌打出此卡。偷襲成功時，使你墓地1喵喵賊單位除外，若成功則獎勵+1。你的主要階段開始時，使你墓地的此卡回手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0027", "name": "草叢喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 2, "tribute": 0, "keywords": ["偷襲", "墓地洗回"], "effect": "偷襲。你的主要階段開始時，若你的牌庫有牌，則使你墓地的此卡洗回牌庫。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0028", "name": "破甲喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 5, "reward": 3, "tribute": 2, "keywords": ["破甲", "偷襲", "阻擋穿透"], "effect": "破甲。此單位進攻戰鬥破壞阻擋單位時，若該單位後方有單位，則可使此單位維持進攻狀態。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0029", "name": "肥宅喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 2, "tribute": 0, "keywords": ["橫放", "獎勵"], "effect": "你的主要階段限一次，可使你場上2個喵喵賊單位橫放，若成功則獎勵+1。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0030", "name": "彩虹幻象喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 1, "reward": 2, "tribute": 0, "keywords": ["偷襲", "虛擬", "攻擊提升"], "effect": "你的其他單位偷襲成功時，可從手牌棄掉此卡，並使你場上所有進攻單位被賦予+1攻擊力直到本回合主要階段開始時。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0031", "name": "訊號干擾喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 2, "tribute": 0, "keywords": ["偷襲", "洗回手牌"], "effect": "偷襲。此單位偷襲成功時，使敵方隨機1手牌洗回牌庫並抽1張牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SR-CAT-0032", "name": "次元突擊喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 1, "tribute": 0, "keywords": ["偷襲", "虛擬", "額外打出"], "effect": "偷襲。同名卡一回合限一次，你的其他單位偷襲成功時，可從手牌額外打出此卡，且此單位亦可進攻。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0032", "name": "次元突擊喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 1, "tribute": 0, "keywords": ["偷襲", "虛擬", "額外打出", "異圖"], "effect": "偷襲。同名卡一回合限一次，你的其他單位偷襲成功時，可從手牌額外打出此卡，且此單位亦可進攻。SSR異圖。", "deck_eligible": true, "base_id": "SR-CAT-0032", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "C-CAT-0033", "name": "易怒喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 4, "tribute": 1, "keywords": ["偷襲", "轉正"], "effect": "偷襲。有單位在敵方防守階段入場或移動至此單位正前方時，可使此單位被轉正並進攻。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SR-CAT-0034", "name": "百變喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 3, "tribute": 1, "keywords": ["偷襲", "效果複製", "回手"], "effect": "你的主要階段開始時限一次，可發動你場上1個喵喵賊偷襲單位的偷襲成功時效果，並使其與此單位回手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0035", "name": "惡夢9命喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 9, "reward": 9, "tribute": 4, "keywords": ["偷襲", "墓地召喚", "終端"], "effect": "你的其他單位偷襲成功時，若你本回合偷襲成功次數為3次或以上，則使你墓地的此卡被召喚。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0036", "name": "壞喵俱樂部 神隱喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 1, "tribute": 0, "keywords": ["偷襲", "後排"], "effect": "偷襲。此卡可打出或召喚至你的後排戰線。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0037", "name": "喵抓板", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": -3, "reward": 1, "tribute": 0, "keywords": ["偷襲", "額外打出", "不可獻祭"], "effect": "你的其他單位偷襲成功時，可從手牌額外打出此卡至敵方場上。此單位不得被獻祭。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0038", "name": "布偶喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 1, "reward": 1, "tribute": 0, "keywords": ["偷襲", "寄生合體"], "effect": "你的主要階段開始時限一次，可使此單位對你場上1個非小旅人單位發動寄生合體。若合體後的單位包含此卡，則該單位被賦予偷襲。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0039", "name": "雙子喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 3, "tribute": 1, "keywords": ["偷襲", "偷襲次數"], "effect": "偷襲。此卡偷襲成功時，視為偷襲成功2次。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0040", "name": "逗喵棒", "race": "喵喵賊", "faction": "喵喵賊", "type": "spell", "attack": null, "reward": null, "tribute": 0, "keywords": ["消耗", "轉正", "位移"], "effect": "主要/防守階段。使你場上1個喵喵賊單位被轉正，並可使其移動至你場上任意位置。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "R-CAT-0041", "name": "公關姐姐喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 3, "tribute": 0, "keywords": ["偷襲", "額外召喚", "獎勵"], "effect": "偷襲。你因喵喵賊卡牌效果額外打出或召喚喵喵賊單位卡時，使你獎勵+1。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0042", "name": "魔拳喵喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 2, "tribute": 0, "keywords": ["偷襲", "敵方魔法抗性"], "effect": "偷襲。立即：使你場上1個其他喵喵賊單位被賦予敵方魔法抗性直到下個回合結束時。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0042", "name": "魔拳喵喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 2, "tribute": 0, "keywords": ["偷襲", "敵方魔法抗性", "異圖"], "effect": "偷襲。立即：使你場上1個其他喵喵賊單位被賦予敵方魔法抗性直到下個回合結束時。SSR異圖。", "deck_eligible": true, "base_id": "R-CAT-0042", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "R-CAT-0043", "name": "喵喵球", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": -5, "reward": 2, "tribute": 0, "keywords": ["敵方場", "位置交換"], "effect": "此卡可打出或召喚至敵方場上。此單位戰鬥失敗時，敵方可使此單位由破壞改為與你場上的1個其他單位位置互換。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0044", "name": "殭屍喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 1, "tribute": 0, "keywords": ["偷襲", "墓地循環"], "effect": "偷襲。此卡偷襲成功時，可使你手牌1張喵喵賊卡牌進入墓地，若成功則使你墓地另一張喵喵賊單位卡回手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SR-CAT-0045", "name": "彈弓喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 2, "tribute": 0, "keywords": ["偷襲", "遠程攻擊"], "effect": "偷襲。遠程攻擊。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0046", "name": "負能量喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "outside_upgrade", "attack": 6, "reward": -1, "tribute": 2, "keywords": ["場外升級卡", "橫放", "偷襲次數"], "effect": "你場上的喵喵賊單位進攻戰鬥成功並橫放時，可視為該單位偷襲成功2次。", "deck_eligible": false, "base_id": null, "outside_limit": 1, "is_outside_deck": true, "variant": false, "can_attack": false}, {"id": "SR-CAT-0047", "name": "二連爪擊喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "outside_upgrade", "attack": 3, "reward": 3, "tribute": 0, "keywords": ["場外升級卡", "偷襲", "破甲"], "effect": "偷襲、破甲。一回合限一次，進攻的此單位在進行戰鬥破壞判定時，可使此單位維持進攻狀態並使該次戰鬥破壞被無效化，然後使此單位賦予+3攻擊力直到防守階段結束時。", "deck_eligible": false, "base_id": null, "outside_limit": 1, "is_outside_deck": true, "variant": false, "can_attack": false}, {"id": "R-CAT-0048", "name": "經理喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "outside_upgrade", "attack": 5, "reward": 2, "tribute": 0, "keywords": ["場外升級卡", "獎勵", "敵方魔法抗性"], "effect": "主要階段限一次，若你獎勵為正，則可獎勵-1並使你1張手牌置於牌庫底，若成功則使你場上所有喵喵賊單位被賦予敵方魔法抗性直到下回合敵方防守階段結束。", "deck_eligible": false, "base_id": null, "outside_limit": 1, "is_outside_deck": true, "variant": false, "can_attack": false}, {"id": "R-CAT-0049", "name": "喵玩具店", "race": "喵喵賊", "faction": "喵喵賊", "type": "field", "attack": null, "reward": null, "tribute": 0, "keywords": ["場地", "額外打出", "墓地回收"], "effect": "主要階段限一次，可使1張可打出或召喚至敵方場上的喵喵賊單位卡從你手牌被額外打出至敵方場上，或從你墓地回手牌。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": false}, {"id": "R-CAT-0050", "name": "打手喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 4, "reward": 0, "tribute": 0, "keywords": ["偷襲", "額外打出", "獎勵"], "effect": "偷襲。你的其他單位偷襲成功時，可從手牌額外打出此卡並使其被賦予+5攻擊力直到下個回合結束時。此卡偷襲成功時，使你獎勵+1。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0051", "name": "喵店店喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 3, "reward": 3, "tribute": 0, "keywords": ["偷襲", "額外打出"], "effect": "偷襲。立即：可使你手牌1張可打出或召喚至敵方場上的喵喵賊單位卡被額外打出至敵方場上任意位置。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0052", "name": "黑幫首喵 凱特琳", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 8, "reward": 2, "tribute": 2, "keywords": ["偷襲", "額外打出", "獎勵"], "effect": "偷襲。你的其他單位偷襲成功時，若本回合已偷襲成功至少2次，則可從手牌額外打出此卡。此卡或你的其他單位偷襲成功時，使你獎勵+X。X=本回合偷襲成功的次數。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "SSR-CAT-0052", "name": "黑幫首喵 凱特琳", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 8, "reward": 2, "tribute": 2, "keywords": ["偷襲", "額外打出", "獎勵", "異圖"], "effect": "偷襲。你的其他單位偷襲成功時，若本回合已偷襲成功至少2次，則可從手牌額外打出此卡。此卡或你的其他單位偷襲成功時，使你獎勵+X。X=本回合偷襲成功的次數。SSR異圖。", "deck_eligible": true, "base_id": "R-CAT-0052", "outside_limit": 0, "is_outside_deck": false, "variant": true, "can_attack": true}, {"id": "SR-CAT-0053", "name": "漏食球", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 1, "reward": 3, "tribute": 0, "keywords": ["禁錮", "敵方場", "小旅人"], "effect": "禁錮。此卡可打出或召喚至敵方場上。一回合限一次，防守的此單位被戰鬥破壞時，敵方可召喚1個小旅人代替破壞。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "C-CAT-0054", "name": "手賤喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 6, "reward": 2, "tribute": 0, "keywords": ["偷襲", "位移"], "effect": "偷襲。使被此單位戰鬥破壞的單位改為被移動至其場上任意位置。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "C-CAT-0055", "name": "易怒喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 7, "reward": 4, "tribute": 1, "keywords": ["偷襲", "轉正"], "effect": "偷襲。有單位在敵方防守階段入場或移動至此單位正前方時，可使此單位被轉正並進攻。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}, {"id": "R-CAT-0056", "name": "DJ喵", "race": "喵喵賊", "faction": "喵喵賊", "type": "unit", "attack": 2, "reward": 2, "tribute": 0, "keywords": ["偷襲", "後排", "位移"], "effect": "偷襲。此卡可打出或召喚至後排戰線。此卡與你的單位偷襲成功並回手時，使敵方場上1個單位移動至其場上任意位置。", "deck_eligible": true, "base_id": null, "outside_limit": 0, "is_outside_deck": false, "variant": false, "can_attack": true}]};
  window.XLW_CARD_DATABASE = window.XLW_CARD_DATABASE || {};
  window.XLW_CARD_DATABASE['喵喵賊'] = CAT_DB.cards;
  window.XLW_CAT_CARDS = CAT_DB.cards;
  window.XLW_CAT_CARD_DB = CAT_DB;
  window.XLW_DECK_BUILD_RULES = window.XLW_DECK_BUILD_RULES || {};
  window.XLW_DECK_BUILD_RULES['喵喵賊'] = {deckSize:20, allowedRaces:['喵喵賊','中立'], excludeTypes:['outside_upgrade'], outsideDeckEnabled:true};
  window.XLW_GET_CARDS_BY_RACE = function(race){ return (window.XLW_CARD_DATABASE && window.XLW_CARD_DATABASE[race]) || []; };
  window.XLW_GET_CARD_BY_ID = function(id){ return Object.values(window.XLW_CARD_DATABASE||{}).flat().find(c=>c.id===id||c.base_id===id)||null; };
  window.XLW_GET_CAT_MAIN_DECK_POOL = function(){ return CAT_DB.cards.filter(c=>c.deck_eligible!==false && c.type!=='outside_upgrade'); };
  window.XLW_GET_CAT_OUTSIDE_POOL = function(){ return CAT_DB.cards.filter(c=>c.type==='outside_upgrade'||c.is_outside_deck); };
  window.XLW_VALIDATE_DECK = function(race, mainDeckIds, outsideIds){
    const rules = window.XLW_DECK_BUILD_RULES[race]; const cards = window.XLW_CARD_DATABASE[race] || []; const byId = Object.fromEntries(cards.map(c=>[c.id,c])); const errors=[];
    if(!rules){ return {ok:false, errors:['找不到種族規則：'+race]}; }
    if(mainDeckIds.length !== rules.deckSize) errors.push('主牌庫必須剛好 '+rules.deckSize+' 張，目前 '+mainDeckIds.length+' 張。');
    mainDeckIds.forEach(id=>{ const c=byId[id]; if(!c){errors.push('未知卡：'+id); return;} if(c.deck_eligible===false||rules.excludeTypes.includes(c.type)) errors.push(c.name+' 不可放入20張主牌庫。'); if(!(rules.allowedRaces.includes(c.race)||rules.allowedRaces.includes(c.faction))) errors.push(c.name+' 不屬於可用種族。'); });
    const ct={}; (outsideIds||[]).forEach(id=>{ const c=byId[id]; if(!c){errors.push('場外未知卡：'+id); return;} if(c.type!=='outside_upgrade'&&!c.is_outside_deck) errors.push(c.name+' 不是場外升級卡。'); ct[id]=(ct[id]||0)+1; if(ct[id]>Number(c.outside_limit||0)) errors.push(c.name+' 場外最多只能放 '+c.outside_limit+' 張。'); });
    return {ok:errors.length===0, errors};
  };
  window.XLW_MERGE_CAT_CARDS_TO_POOL = function(){ window.cardPool = Array.isArray(window.cardPool)?window.cardPool:[]; const exists=new Set(window.cardPool.map(c=>c.id)); CAT_DB.cards.forEach(c=>{ if(!exists.has(c.id)) window.cardPool.push(c); }); };
  document.addEventListener('DOMContentLoaded',()=>{ try{ window.XLW_MERGE_CAT_CARDS_TO_POOL(); console.log('[XLW] 喵喵賊資料庫已載入：'+CAT_DB.cards.length+'筆'); }catch(e){ console.error(e); } });
})();


// THREE RACES CARD DATABASE INJECTION
(function(){
 const DB={"version": "three-races-current", "counts": {"喵喵賊": 68, "妖怪村莊": 68, "藝術品": 70, "total": 206}, "deck_rules": {"deck_size": 20, "喵喵賊": {"allowed_races": ["喵喵賊", "中立"], "exclude_types": ["outside_upgrade"]}, "妖怪村莊": {"allowed_races": ["妖怪村莊", "中立"], "exclude_types": ["outside_upgrade"]}, "藝術品": {"allowed_races": ["藝術品", "中立"], "exclude_types": ["outside_upgrade"]}}, "cards": [{"id": "CAT-0001", "name": "靴喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "PROMO-CAT-0001", "name": "靴喵 PROMO", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "SSSR-CAT-0001", "name": "靴喵 SSSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "CAT-0002", "name": "喵媽媽", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0003", "name": "驚喜喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0004", "name": "虎老大", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0004", "name": "虎老大 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "VR-CAT-0004", "name": "虎老大 VR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "CAT-0005", "name": "綠喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0006", "name": "導遊喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0007", "name": "瘟疫喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0008", "name": "老喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0009", "name": "保喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CRP-CAT-0009", "name": "鷲峰良保喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "CAT-0010", "name": "粉喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0010", "name": "火野貝粉喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0011", "name": "黑喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0011", "name": "黑喵 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "CAT-0012", "name": "喵玩具", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0013", "name": "忍喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0014", "name": "叮噹喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0015", "name": "騎士喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0016", "name": "飄飄喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0017", "name": "跳跳箱", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0018", "name": "虐傭兵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0019", "name": "脫逃", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0020", "name": "捕喵網", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0021", "name": "幽靈喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SR-CAT-0022", "name": "壯壯喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "CAT-0023", "name": "醫療喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0023", "name": "醫療喵 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "CAT-0024", "name": "喵女", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0024", "name": "喵女 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "R-CAT-0025", "name": "壞掉的機械喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SR-CAT-0026", "name": "惡魔招財喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0027", "name": "草叢喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0028", "name": "破甲喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0029", "name": "肥宅喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0030", "name": "彩虹幻象喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0031", "name": "訊號干擾喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SR-CAT-0032", "name": "次元突擊喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0032", "name": "次元突擊喵 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "C-CAT-0033", "name": "易怒喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SR-CAT-0034", "name": "百變喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0035", "name": "惡夢9命喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0036", "name": "壞喵俱樂部 神隱喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0037", "name": "喵抓板", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0038", "name": "布偶喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0039", "name": "雙子喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0040", "name": "逗喵棒", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0041", "name": "公關姐姐喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0042", "name": "魔拳喵喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0042", "name": "魔拳喵喵 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "R-CAT-0043", "name": "喵喵球", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0044", "name": "殭屍喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SR-CAT-0045", "name": "彈弓喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0046", "name": "負能量喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SR-CAT-0047", "name": "二連爪擊喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0048", "name": "經理喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0049", "name": "喵玩具店", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0050", "name": "打手喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0051", "name": "喵店店喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0052", "name": "黑幫首喵 凱特琳", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "SSR-CAT-0052", "name": "黑幫首喵 凱特琳 SSR", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": true, "deck_eligible": true}, {"id": "SR-CAT-0053", "name": "漏食球", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "C-CAT-0054", "name": "手賤喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "C-CAT-0055", "name": "易怒喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-CAT-0056", "name": "DJ喵", "race": "喵喵賊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["偷襲"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0001", "name": "晴天娃娃", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭", "阻擋"], "variant": false, "deck_eligible": true, "is_blocker": true, "can_attack": false}, {"id": "R-VLG-0002", "name": "雨傘妖怪", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSSR-VLG-0002", "name": "雨傘妖怪 黑銀夜鳥", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0003", "name": "嘴裂的女孩", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "PROMO-VLG-0003", "name": "嘴裂的女孩 PROMO", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0004", "name": "九尾妖狐", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSSR-VLG-0004", "name": "九尾妖狐 SSSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0005", "name": "河童", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0006", "name": "長脖子的女人", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0007", "name": "藍小鬼棒子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0008", "name": "紅小鬼棒子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0009", "name": "恐怖錄影帶", "race": "妖怪村莊", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0010", "name": "貞美子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSR-VLG-0010", "name": "貞美子 SSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0011", "name": "武士繪", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0012", "name": "雪女", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSR-VLG-0012", "name": "雪女 SSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "SSSR-VLG-0012", "name": "雪女 SSSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "VR-XLW-S0003", "name": "雪女 VR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0013", "name": "毛線怪", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSR-VLG-0013", "name": "毛線怪 SSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0014", "name": "座敷童子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSR-VLG-0014", "name": "座敷童子 SSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "SR-VLG-0015", "name": "十八呎大人", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0016", "name": "燈籠小鬼", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SR-VLG-0017", "name": "八岐大蛇", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0018", "name": "如月車站", "race": "妖怪村莊", "type": "field", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SR-VLG-0019", "name": "恐怖的井", "race": "妖怪村莊", "type": "field", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0020", "name": "詛咒通靈", "race": "妖怪村莊", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SR-VLG-0021", "name": "天狗", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSR-VLG-0021", "name": "天狗 SSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0022", "name": "智慧的般若", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0023", "name": "獨眼小僧", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0024", "name": "獨眼大僧", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0025", "name": "藍大鬼棒子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0026", "name": "紅大鬼棒子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0027", "name": "土蜘蛛", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0028", "name": "牆壁妖怪", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭", "阻擋"], "variant": false, "deck_eligible": true, "is_blocker": true, "can_attack": false}, {"id": "SR-VLG-0029", "name": "魔貨車", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0030", "name": "恐懼凝視", "race": "妖怪村莊", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "CRP-VLG-0030", "name": "汐海黑兔", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "R-VLG-0031", "name": "如月站長", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0032", "name": "伽椰美子", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0033", "name": "伽椰小俊", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SR-VLG-0034", "name": "紅衣女孩", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0035", "name": "背背小鬼", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0036", "name": "人臉魚", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0037", "name": "地下怪鳥", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "PROMO-VLG-0037", "name": "地下怪鳥 PROMO", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "SR-VLG-0038", "name": "水鬼", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SR-VLG-0039", "name": "無臉人", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0040", "name": "裂風龜龜", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0041", "name": "卡卡小巨人", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0042", "name": "虎姑媽", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0043", "name": "恐怖祭司", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "R-VLG-0044", "name": "毛線女孩", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "SSR-VLG-0044", "name": "毛線女孩 SSR", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": true, "deck_eligible": true}, {"id": "VLG-UP-001", "name": "憤怒的般若", "race": "妖怪村莊", "type": "outside_upgrade", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": false, "outside_limit": 1}, {"id": "VLG-UP-002", "name": "紅眼小僧", "race": "妖怪村莊", "type": "outside_upgrade", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": false, "outside_limit": 1}, {"id": "VLG-UP-003", "name": "伽椰貞美子", "race": "妖怪村莊", "type": "outside_upgrade", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": false, "outside_limit": 1}, {"id": "VLG-X001", "name": "恐怖小丑", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X002", "name": "瓶子長長", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X003", "name": "殭屍女", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X004", "name": "背後靈", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X005", "name": "如月車票", "race": "妖怪村莊", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X006", "name": "掃把精", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X007", "name": "事故物件", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "VLG-X008", "name": "魔神仔", "race": "妖怪村莊", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["獻祭"], "variant": false, "deck_eligible": true}, {"id": "ART-0001", "name": "始皇帝", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0002", "name": "戰士陶俑", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0003", "name": "三腳鼎", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0004", "name": "害羞的斑點南瓜", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0005", "name": "頸部痠痛的女人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0006", "name": "萌娜麗莎的大笑", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "VR-ART-0006", "name": "萌娜麗莎的大笑 VR", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": true, "deck_eligible": true}, {"id": "ART-0007", "name": "大鵰像", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0008", "name": "沉思的男人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0009", "name": "沉思的男人 放煙火版", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0010", "name": "吶喊的人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0011", "name": "鎧甲擺件", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0012", "name": "收藏家", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0013", "name": "兩位陌生人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0014", "name": "珍珠少女", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0015", "name": "梵老爹", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0015", "name": "梵老爹 SSR", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": true, "deck_eligible": true}, {"id": "ART-0016", "name": "向日葵小妹", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0016", "name": "向日葵小妹 SSR", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": true, "deck_eligible": true}, {"id": "ART-0017", "name": "拿波崙", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0018", "name": "創世男孩", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0019", "name": "創世老人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0020", "name": "番茄之子", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0021", "name": "摩艾石巨像", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0022", "name": "尿尿小男童", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0023", "name": "畫框", "race": "藝術品", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0024", "name": "博物館", "race": "藝術品", "type": "field", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0025", "name": "星空", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": true, "deck_eligible": true}, {"id": "ART-0026", "name": "拾穗者", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0027", "name": "紅色顏料", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["顏料"], "variant": false, "deck_eligible": true}, {"id": "ART-0028", "name": "綠色顏料", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["顏料"], "variant": false, "deck_eligible": true}, {"id": "ART-0029", "name": "藍色顏料", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["顏料"], "variant": false, "deck_eligible": true}, {"id": "ART-0030", "name": "牆壁上的香蕉", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0030", "name": "酷墨鏡香蕉摩艾", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": true, "deck_eligible": true}, {"id": "ART-0031", "name": "和平使者耶叔", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0032", "name": "最後的下午茶", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0033", "name": "最後的宵夜", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0034", "name": "最後的早餐", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0035", "name": "最後的中餐", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0036", "name": "最後的麵包與酒", "race": "藝術品", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0037", "name": "博物館保全", "race": "藝術品", "type": "field", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0038", "name": "實習畫家", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "CRP-ART-0038", "name": "李青 實習畫家", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": true, "deck_eligible": true}, {"id": "ART-0039", "name": "流浪畫家", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0040", "name": "率性龐克", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0041", "name": "金衣服的女人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0042", "name": "館長迪斯麥", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0043", "name": "詛咒斷臂雕像", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0044", "name": "博物館接待員", "race": "藝術品", "type": "field", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0045", "name": "哭泣女人", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0046", "name": "前台服務生", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0047", "name": "香蕉猴", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0048", "name": "黑心網路賣家", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0049", "name": "蜘蛛魔盜團團長 茉蘭", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0049", "name": "蜘蛛魔盜團團長 茉蘭 SSR", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": true, "deck_eligible": true}, {"id": "ART-0050", "name": "太極雕像", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0051", "name": "調色盤", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0052", "name": "牆壁上的塗鴉", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0053", "name": "最後的麵包與酒", "race": "藝術品", "type": "spell", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["最後的"], "variant": false, "deck_eligible": true}, {"id": "ART-0054", "name": "守護的斷臂雕像", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0055", "name": "顏料藝術家", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["顏料"], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0055", "name": "顏料藝術家 SSR", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["顏料"], "variant": true, "deck_eligible": true}, {"id": "ART-0056", "name": "博物館剪票員", "race": "藝術品", "type": "field", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0057", "name": "翡翠白菜", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": [], "variant": false, "deck_eligible": true}, {"id": "ART-0058", "name": "蜘蛛魔盜團 千面", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": false, "deck_eligible": true}, {"id": "ART-0059", "name": "蜘蛛魔盜團 銷贓", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": false, "deck_eligible": true}, {"id": "ART-0060", "name": "蜘蛛魔盜團間諜 迪斯麥", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": false, "deck_eligible": true}, {"id": "SSR-ART-0060", "name": "蜘蛛魔盜團間諜 迪斯麥 SSR", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": true, "deck_eligible": true}, {"id": "ART-0061", "name": "蜘蛛魔盜團 鎖頭", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": false, "deck_eligible": true}, {"id": "ART-0062", "name": "蜘蛛魔盜團 換日", "race": "藝術品", "type": "unit", "attack": null, "reward": null, "tribute": null, "effect": "", "keywords": ["綁架"], "variant": false, "deck_eligible": true}]};
 window.XLW_FULL_CARD_DATABASE=DB; window.XLW_ALL_CARDS=DB.cards; window.XLW_CARD_DATABASE=window.XLW_CARD_DATABASE||{};
 DB.cards.forEach(c=>{window.XLW_CARD_DATABASE[c.race]=window.XLW_CARD_DATABASE[c.race]||[]; if(!window.XLW_CARD_DATABASE[c.race].some(x=>x.id===c.id)) window.XLW_CARD_DATABASE[c.race].push(c);});
 window.XLW_DECK_BUILD_RULES=DB.deck_rules;
 window.XLW_GET_CARD_BY_ID=function(id){return DB.cards.find(c=>c.id===id||c.base_id===id)||null;};
 window.XLW_GET_CARDS_BY_RACE=function(race){return DB.cards.filter(c=>c.race===race);};
 window.XLW_GET_MAIN_DECK_POOL=function(race){const rule=DB.deck_rules[race]; return DB.cards.filter(c=>c.race===race&&c.deck_eligible!==false&&!(rule.exclude_types||[]).includes(c.type));};
 window.XLW_VALIDATE_RACE_DECK=function(race,ids){const rule=DB.deck_rules[race]; const errors=[]; if(!rule) errors.push('找不到種族規則：'+race); if(ids.length!==DB.deck_rules.deck_size) errors.push('主牌庫必須為 '+DB.deck_rules.deck_size+' 張，目前 '+ids.length+' 張。'); ids.forEach(id=>{const c=window.XLW_GET_CARD_BY_ID(id); if(!c) errors.push('未知卡：'+id); else if(c.deck_eligible===false||(rule.exclude_types||[]).includes(c.type)) errors.push(c.name+' 不可放入主牌庫。'); else if(!rule.allowed_races.includes(c.race)&&c.race!=='中立') errors.push(c.name+' 不可放入 '+race+' 牌庫。');}); return {ok:errors.length===0, errors};};
 console.log('[XLW] 三種族卡片資料庫已載入',DB.counts);
})();


// ======================================================
// RACE SELECT + SIMPLE DECK BUILDER + AUTO 20-CARD DECK
// 三種族開局選擇 / 牌庫建立 / 合法性檢查
// ======================================================
(function(){

  const STATE = window.XLW_RACE_DECK_STATE = window.XLW_RACE_DECK_STATE || {
    selectedRace: null,
    playerDeckIds: [],
    enemyRace: "妖怪村莊",
    enemyDeckIds: [],
    deckBuilt: false
  };

  const RACES = ["喵喵賊", "妖怪村莊", "藝術品"];

  function db(){
    return window.XLW_FULL_CARD_DATABASE || {cards:[], deck_rules:{}};
  }

  function cards(){
    return db().cards || [];
  }

  function getRaceCards(race){
    return cards().filter(c => c.race === race);
  }

  function getMainDeckPool(race){
    if(typeof window.XLW_GET_MAIN_DECK_POOL === "function"){
      return window.XLW_GET_MAIN_DECK_POOL(race);
    }
    const rule = db().deck_rules && db().deck_rules[race];
    return getRaceCards(race).filter(c => c.deck_eligible !== false && !(rule && rule.exclude_types || []).includes(c.type));
  }

  function getOutsidePool(race){
    return getRaceCards(race).filter(c => c.type === "outside_upgrade" || c.is_outside_deck);
  }

  function uniqueBasePool(pool){
    // 異圖仍保留在資料庫，但自動組牌時優先使用非異圖，避免同效果大量重複。
    const result = [];
    const seen = new Set();
    pool.forEach(c=>{
      const key = c.base_id || c.name;
      if(seen.has(key)) return;
      seen.add(key);
      result.push(c);
    });
    return result;
  }

  function autoDeck(race){
    const pool = uniqueBasePool(getMainDeckPool(race));
    const chosen = pool.slice(0, 20);
    return chosen.map(c => c.id);
  }

  function cardById(id){
    if(typeof window.XLW_GET_CARD_BY_ID === "function") return window.XLW_GET_CARD_BY_ID(id);
    return cards().find(c => c.id === id);
  }

  function show(msg){
    try{ setStatus(msg); }catch(e){}
    ["ue-msg","skEngineMessage","topStatusMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function applyDeckToGame(){
    const deckIds = STATE.playerDeckIds;
    const enemyDeckIds = STATE.enemyDeckIds.length ? STATE.enemyDeckIds : autoDeck(STATE.enemyRace);

    const playerCards = deckIds.map(cardById).filter(Boolean).map(c => ({...c}));
    const enemyCards = enemyDeckIds.map(cardById).filter(Boolean).map(c => ({...c}));

    // 洗牌
    shuffle(playerCards);
    shuffle(enemyCards);

    window.deck = playerCards;
    window.playerDeck = playerCards;
    window.hand = [];
    window.playerHand = window.hand;

    window.XLW_PLAYER = window.XLW_PLAYER || {};
    window.XLW_PLAYER.race = STATE.selectedRace;
    window.XLW_PLAYER.deck = playerCards;
    window.XLW_PLAYER.hand = window.hand;
    window.XLW_PLAYER.outside = getOutsidePool(STATE.selectedRace);

    window.XLW_ENEMY = window.XLW_ENEMY || {};
    window.XLW_ENEMY.race = STATE.enemyRace;
    window.XLW_ENEMY.deck = enemyCards;
    window.XLW_ENEMY.hand = [];
    window.enemyDeck = window.XLW_ENEMY.deck;
    window.enemyHand = window.XLW_ENEMY.hand;

    STATE.deckBuilt = true;

    // 初始手牌4張
    drawCards(window.deck, window.hand, 4);
    drawCards(window.XLW_ENEMY.deck, window.XLW_ENEMY.hand, 4);

    updateDeckDisplays();
    show("已選擇「" + STATE.selectedRace + "」，建立20張主牌庫，雙方初始手牌4張。");

    try{ if(typeof render === "function") render(); }catch(e){}
  }

  function drawCards(deck, hand, n){
    for(let i=0;i<n;i++){
      if(deck && deck.length) hand.push(deck.shift());
    }
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
  }

  function updateDeckDisplays(){
    const playerCount = (window.deck || window.playerDeck || []).length;
    const enemyCount = (window.XLW_ENEMY && window.XLW_ENEMY.deck || window.enemyDeck || []).length;

    [
      "#playerDeckCount",
      ".player-deck-count",
      "#playerDeck .count",
      "[data-counter='playerDeck']"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>el.textContent = String(playerCount));
    });

    [
      "#enemyDeckCount",
      ".enemy-deck-count",
      "#enemyDeck .count",
      "[data-counter='enemyDeck']"
    ].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>el.textContent = String(enemyCount));
    });
  }

  function validateDeckIds(race, ids){
    if(typeof window.XLW_VALIDATE_RACE_DECK === "function"){
      return window.XLW_VALIDATE_RACE_DECK(race, ids);
    }
    const errors = [];
    if(ids.length !== 20) errors.push("主牌庫必須20張，目前" + ids.length + "張。");
    ids.forEach(id=>{
      const c = cardById(id);
      if(!c) errors.push("未知卡：" + id);
      else if(c.race !== race && c.race !== "中立") errors.push(c.name + "不可放入" + race);
      else if(c.deck_eligible === false) errors.push(c.name + "不可放入主牌庫");
    });
    return {ok: errors.length === 0, errors};
  }

  function buildRacePanel(){
    if(document.getElementById("xlwRaceDeckPanel")) return;

    const panel = document.createElement("div");
    panel.id = "xlwRaceDeckPanel";
    panel.innerHTML = `
      <div class="xlw-race-title">選擇種族 / 建立牌庫</div>
      <div class="xlw-race-sub">主牌庫20張；場外升級卡不佔牌庫。</div>
      <div class="xlw-race-buttons">
        ${RACES.map(r=>`<div class="xlw-race-btn" data-race="${r}">${r}</div>`).join("")}
      </div>
      <div class="xlw-race-info" id="xlwRaceInfo">請選擇種族。</div>
      <div class="xlw-race-actions">
        <div class="xlw-race-action" id="xlwAutoDeckBtn">自動組20張</div>
        <div class="xlw-race-action primary" id="xlwStartDeckBtn">開始遊戲</div>
      </div>
      <div class="xlw-card-list" id="xlwRaceCardList"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelectorAll(".xlw-race-btn").forEach(btn=>{
      btn.onclick = ()=>{
        selectRace(btn.dataset.race);
      };
    });

    document.getElementById("xlwAutoDeckBtn").onclick = ()=>{
      if(!STATE.selectedRace){
        show("請先選擇種族。");
        return;
      }
      STATE.playerDeckIds = autoDeck(STATE.selectedRace);
      renderRaceInfo();
    };

    document.getElementById("xlwStartDeckBtn").onclick = ()=>{
      if(!STATE.selectedRace){
        show("請先選擇種族。");
        return;
      }
      if(!STATE.playerDeckIds.length) STATE.playerDeckIds = autoDeck(STATE.selectedRace);

      const result = validateDeckIds(STATE.selectedRace, STATE.playerDeckIds);
      if(!result.ok){
        show(result.errors[0] || "牌庫不合法。");
        renderRaceInfo(result.errors);
        return;
      }

      STATE.enemyRace = RACES.find(r => r !== STATE.selectedRace) || "妖怪村莊";
      STATE.enemyDeckIds = autoDeck(STATE.enemyRace);
      applyDeckToGame();
      panel.style.display = "none";
    };
  }

  function selectRace(race){
    STATE.selectedRace = race;
    STATE.playerDeckIds = autoDeck(race);

    document.querySelectorAll(".xlw-race-btn").forEach(btn=>{
      btn.classList.toggle("selected", btn.dataset.race === race);
    });

    renderRaceInfo();
  }

  function renderRaceInfo(errors){
    const info = document.getElementById("xlwRaceInfo");
    const list = document.getElementById("xlwRaceCardList");
    if(!info || !list) return;

    const race = STATE.selectedRace;
    if(!race){
      info.textContent = "請選擇種族。";
      list.innerHTML = "";
      return;
    }

    const pool = getMainDeckPool(race);
    const outside = getOutsidePool(race);
    const deckCards = STATE.playerDeckIds.map(cardById).filter(Boolean);

    info.innerHTML = `
      <b>${race}</b><br>
      主牌庫候選：${pool.length} 張｜目前牌庫：${deckCards.length}/20｜場外卡：${outside.length} 張
      ${errors && errors.length ? `<br><span class="xlw-error">${errors.join("<br>")}</span>` : ""}
    `;

    list.innerHTML = deckCards.map(c=>`
      <div class="xlw-card-row">
        <span>${c.id}</span>
        <b>${c.name}</b>
        <small>${c.type || ""}</small>
      </div>
    `).join("");
  }

  // 抽牌 API，供回合開始與其他系統共用
  window.XLW_DRAW_CARDS = function(owner, n){
    if(owner === "enemy"){
      window.XLW_ENEMY = window.XLW_ENEMY || {};
      window.XLW_ENEMY.deck = window.XLW_ENEMY.deck || window.enemyDeck || [];
      window.XLW_ENEMY.hand = window.XLW_ENEMY.hand || window.enemyHand || [];
      drawCards(window.XLW_ENEMY.deck, window.XLW_ENEMY.hand, n || 2);
    }else{
      window.deck = window.deck || window.playerDeck || [];
      window.hand = window.hand || window.playerHand || [];
      drawCards(window.deck, window.hand, n || 2);
    }
    updateDeckDisplays();
    try{ if(typeof render === "function") render(); }catch(e){}
  };

  function apply(){
    buildRacePanel();
    updateDeckDisplays();
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(apply, 300);
    setTimeout(apply, 1000);
  });

})();


// ======================================================
// FINAL FIX: RACE DECK APPLY + CARD IMAGE FALLBACK
// ======================================================
(function(){

  function DB(){ return window.XLW_FULL_CARD_DATABASE || {cards:[], deck_rules:{}}; }
  function allCards(){ return DB().cards || []; }

  function makeFallbackImage(card){
    const color = card.race === "藝術品" ? "#243b55" : card.race === "妖怪村莊" ? "#332646" : "#57351f";
    const safeName = String(card.name || card.id || "CARD").replace(/[<>&]/g,"");
    const safeRace = String(card.race || "").replace(/[<>&]/g,"");
    const safeId = String(card.id || "").replace(/[<>&]/g,"");
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="360" height="520">
        <rect width="360" height="520" rx="24" fill="${color}"/>
        <rect x="18" y="18" width="324" height="484" rx="20" fill="rgba(255,255,255,.08)" stroke="rgba(255,230,160,.6)" stroke-width="3"/>
        <text x="180" y="80" text-anchor="middle" fill="#fff1b8" font-size="30" font-weight="900" font-family="sans-serif">${safeName}</text>
        <text x="180" y="122" text-anchor="middle" fill="#fff" font-size="22" font-family="sans-serif">${safeRace}</text>
        <rect x="48" y="155" width="264" height="220" rx="18" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.25)"/>
        <text x="180" y="260" text-anchor="middle" fill="#fff" font-size="34" font-family="sans-serif">卡片圖</text>
        <text x="180" y="305" text-anchor="middle" fill="#ddd" font-size="20" font-family="sans-serif">待放入圖片</text>
        <text x="180" y="440" text-anchor="middle" fill="#ffe6a0" font-size="23" font-family="monospace">${safeId}</text>
      </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function normalize(card){
    if(!card) return card;
    const c = {...card};
    c.card_id = c.id;
    c.cardId = c.id;
    c.card_type = c.type;
    c.faction = c.race;
    c.stars = c.tribute ?? c.stars ?? 0;
    c.cost = c.tribute ?? c.cost ?? 0;
    c.atk = c.attack ?? c.atk ?? "";
    c.score = c.reward ?? c.score ?? 0;
    if(!c.image && !c.img && !c.image_url){
      c.image = makeFallbackImage(c);
      c.img = c.image;
      c.image_url = c.image;
    }
    return c;
  }

  function mainPool(race){
    const rule = DB().deck_rules && DB().deck_rules[race];
    const ex = rule ? (rule.exclude_types || []) : ["outside_upgrade"];
    const seen = new Set();
    const result = [];
    allCards()
      .filter(c => c.race === race && c.deck_eligible !== false && !ex.includes(c.type))
      .sort((a,b)=>(a.variant===b.variant ? 0 : a.variant ? 1 : -1))
      .forEach(c=>{
        const key = c.base_id || c.name;
        if(seen.has(key)) return;
        seen.add(key);
        result.push(c);
      });
    return result;
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
  }

  function draw(deck, hand, n){
    for(let i=0;i<n;i++){
      if(deck.length) hand.push(deck.shift());
    }
  }

  function rebuildDecks(race){
    const playerRace = race || (window.XLW_RACE_DECK_STATE && window.XLW_RACE_DECK_STATE.selectedRace) || "喵喵賊";
    const enemyRace = (window.XLW_RACE_DECK_STATE && window.XLW_RACE_DECK_STATE.enemyRace && window.XLW_RACE_DECK_STATE.enemyRace !== playerRace)
      ? window.XLW_RACE_DECK_STATE.enemyRace
      : (["喵喵賊","妖怪村莊","藝術品"].find(r=>r!==playerRace) || "妖怪村莊");

    const pDeck = mainPool(playerRace).slice(0,20).map(normalize);
    const eDeck = mainPool(enemyRace).slice(0,20).map(normalize);

    shuffle(pDeck); shuffle(eDeck);

    window.deck = pDeck;
    window.playerDeck = pDeck;
    window.hand = [];
    window.playerHand = window.hand;

    window.enemyDeck = eDeck;
    window.enemyHand = [];

    window.XLW_PLAYER = window.XLW_PLAYER || {};
    window.XLW_PLAYER.race = playerRace;
    window.XLW_PLAYER.deck = window.deck;
    window.XLW_PLAYER.hand = window.hand;

    window.XLW_ENEMY = window.XLW_ENEMY || {};
    window.XLW_ENEMY.race = enemyRace;
    window.XLW_ENEMY.deck = window.enemyDeck;
    window.XLW_ENEMY.hand = window.enemyHand;

    draw(window.deck, window.hand, 4);
    draw(window.enemyDeck, window.enemyHand, 4);

    if(window.XLW_RACE_DECK_STATE){
      window.XLW_RACE_DECK_STATE.selectedRace = playerRace;
      window.XLW_RACE_DECK_STATE.enemyRace = enemyRace;
      window.XLW_RACE_DECK_STATE.playerDeckIds = window.deck.map(c=>c.id);
      window.XLW_RACE_DECK_STATE.enemyDeckIds = window.enemyDeck.map(c=>c.id);
      window.XLW_RACE_DECK_STATE.deckBuilt = true;
    }

    try{ setStatus("已建立「"+playerRace+"」牌庫；對手使用「"+enemyRace+"」。"); }catch(e){}
    console.log("[XLW] rebuilt race decks", playerRace, window.hand, enemyRace, window.enemyHand);
  }

  function normalizeExisting(){
    ["deck","playerDeck","hand","playerHand","enemyDeck","enemyHand"].forEach(k=>{
      if(Array.isArray(window[k])) window[k] = window[k].map(normalize);
    });
    if(window.XLW_PLAYER){
      if(Array.isArray(window.XLW_PLAYER.deck)) window.XLW_PLAYER.deck = window.XLW_PLAYER.deck.map(normalize);
      if(Array.isArray(window.XLW_PLAYER.hand)) window.XLW_PLAYER.hand = window.XLW_PLAYER.hand.map(normalize);
    }
    if(window.XLW_ENEMY){
      if(Array.isArray(window.XLW_ENEMY.deck)) window.XLW_ENEMY.deck = window.XLW_ENEMY.deck.map(normalize);
      if(Array.isArray(window.XLW_ENEMY.hand)) window.XLW_ENEMY.hand = window.XLW_ENEMY.hand.map(normalize);
    }
  }

  function bind(){
    const start = document.getElementById("xlwStartDeckBtn");
    if(start && start.dataset.finalRaceApply !== "1"){
      start.dataset.finalRaceApply = "1";
      start.addEventListener("click", ()=>{
        setTimeout(()=>{
          const race = (window.XLW_RACE_DECK_STATE && window.XLW_RACE_DECK_STATE.selectedRace) || "喵喵賊";
          rebuildDecks(race);
          try{ if(typeof render === "function") render(); }catch(e){}
        }, 60);
      }, true);
    }
  }

  window.XLW_REBUILD_DECKS_BY_RACE = rebuildDecks;
  window.XLW_NORMALIZE_CARD_FOR_RENDER = normalize;

  const oldRenderRaceFix = render;
  render = function(){
    normalizeExisting();
    oldRenderRaceFix();
    requestAnimationFrame(bind);
  };

  document.addEventListener("DOMContentLoaded", ()=>{
    setTimeout(bind,300);
    setTimeout(bind,1000);
  });

})();


// ======================================================
// TRUE FINAL HOTFIX 2026-05-23
// 修正重點：
// 1. 舊版多層 patch 同時使用 let deck/hand 與 window.deck/window.hand，導致實際渲染仍讀到舊手牌。
// 2. 選藝術品時，部分後段補丁只改 window.deck，沒有改到 renderHand() 使用的 let deck/hand。
// 3. 回合抽牌同樣可能抽到 window.deck，但畫面讀 let hand，所以看起來「沒有抽牌」。
// 本段直接覆寫 newGame / draw / nextPhase，並同步 lexical state + window state。
// ======================================================
(function(){
  function cloneCard(c){
    try { return structuredClone(c); } catch(e) { return JSON.parse(JSON.stringify(c)); }
  }

  function selectedDeckName(){
    const sel = document.getElementById("deckSelect");
    return sel ? sel.value : "喵喵賊";
  }

  function cardDeckName(c){
    return c && (c.deck || c.race || c.faction || "");
  }

  function sourceCards(){
    // allCards 是遊戲原本從 /api/cards 讀入的正式資料，包含完整圖片路徑。
    if(Array.isArray(allCards) && allCards.length) return allCards;
    if(window.XLW_FULL_CARD_DATABASE && Array.isArray(window.XLW_FULL_CARD_DATABASE.cards)) return window.XLW_FULL_CARD_DATABASE.cards;
    if(Array.isArray(window.XLW_ALL_CARDS)) return window.XLW_ALL_CARDS;
    return [];
  }

  function buildDeckByName(deckName){
    const src = sourceCards();
    const ids = decks && Array.isArray(decks[deckName]) ? decks[deckName] : null;

    let cards = [];
    if(ids && ids.length){
      cards = ids.map(id => src.find(c => c.id === id)).filter(Boolean);
    }

    // 保險：若 decks.json 不完整或 id 對不到，就直接用 deck/race 欄位過濾。
    if(!cards.length || cards.some(c => cardDeckName(c) !== deckName)){
      cards = src.filter(c => cardDeckName(c) === deckName);
    }

    // 最後再強制過濾一次，避免混入喵喵賊/妖怪村莊。
    cards = cards.filter(c => cardDeckName(c) === deckName);

    return cards.map(c => {
      const n = cloneCard(c);
      n.deck = n.deck || deckName;
      n.race = n.race || n.deck || deckName;
      n.faction = n.faction || n.race || deckName;
      n.card_id = n.id;
      n.cardId = n.id;
      n.card_type = n.type;
      n.atk = n.attack;
      n.score = Number(n.score ?? n.reward ?? 0);
      n.tribute = Number(n.tribute ?? 0);
      if(!n.image && n.img) n.image = n.img;
      if(!n.img && n.image) n.img = n.image;
      if(!n.image_url && n.image) n.image_url = n.image;
      return n;
    });
  }

  function syncWindowState(){
    window.deck = deck;
    window.playerDeck = deck;
    window.hand = hand;
    window.playerHand = hand;
    window.graveyard = graveyard;
    window.enemyGraveyard = enemyGraveyard;
    window.field = field;

    window.XLW_PLAYER = window.XLW_PLAYER || {};
    window.XLW_PLAYER.deck = deck;
    window.XLW_PLAYER.hand = hand;
    window.XLW_PLAYER.graveyard = graveyard;
    window.XLW_PLAYER.race = selectedDeckName();

    window.XLW_ENEMY = window.XLW_ENEMY || {};
    window.XLW_ENEMY.deck = window.enemyDeck || [];
    window.XLW_ENEMY.hand = window.enemyHand || [];
  }

  function setCleanStatus(msg){
    try{ setStatus(msg); }catch(e){}
    const ids = ["status", "ue-msg", "topStatusMessage", "skEngineMessage"];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function hardShuffle(arr){
    for(let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // 直接覆寫原本 draw：一定操作 renderHand 使用的 let hand / let deck。
  draw = function(n){
    let drew = 0;
    for(let i=0; i<Number(n || 0); i++){
      if(!deck.length) break;
      hand.push(deck.shift());
      drew++;
    }
    syncWindowState();
    return drew;
  };

  function buildEnemyFor(playerDeckName){
    const enemyName = playerDeckName === "妖怪村莊" ? "喵喵賊" : "妖怪村莊";
    const enemy = buildDeckByName(enemyName);
    hardShuffle(enemy);
    window.enemyDeck = enemy;
    window.enemyHand = [];
    for(let i=0; i<4 && window.enemyDeck.length; i++) window.enemyHand.push(window.enemyDeck.shift());
    window.XLW_ENEMY = window.XLW_ENEMY || {};
    window.XLW_ENEMY.race = enemyName;
    window.XLW_ENEMY.deck = window.enemyDeck;
    window.XLW_ENEMY.hand = window.enemyHand;
  }

  newGame = function(){
    const deckName = selectedDeckName();
    const built = buildDeckByName(deckName);

    if(!built.length){
      setCleanStatus("找不到「" + deckName + "」牌組資料，請確認 data/cards.json 與 data/decks.json。");
      return;
    }

    deck = built;
    hardShuffle(deck);

    hand = [];
    graveyard = [];
    enemyGraveyard = [];
    field.player_front = [null,null,null,null,null];
    field.player_back = [null,null,null,null,null];
    field.enemy_front = [null,null,null,null,null];
    field.enemy_back = [null,null,null,null,null];

    phase = "召喚階段";
    turn = 1;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    dragged = null;
    mode = null;
    selectedAttacker = null;

    // 停用舊版起手換牌狀態，避免換牌補丁攔截手牌點擊或覆蓋抽牌。
    try{ if(typeof mulliganActive !== "undefined") mulliganActive = false; }catch(e){}
    try{ if(typeof selectedMulliganIndexes !== "undefined" && selectedMulliganIndexes.clear) selectedMulliganIndexes.clear(); }catch(e){}

    buildEnemyFor(deckName);
    const drew = draw(4);

    syncWindowState();
    setCleanStatus("已選擇「" + deckName + "」牌組；起手抽 " + drew + " 張。剩餘牌庫 " + deck.length + " 張。對手牌組圖片也已建立。");
    try{ render(); }catch(e){ console.error(e); }

    console.log("[TRUE FINAL] selected deck =", deckName);
    console.log("[TRUE FINAL] player hand =", hand.map(c => c.name + " / " + cardDeckName(c)));
    console.log("[TRUE FINAL] player deck left =", deck.length, deck.map(c => c.name + " / " + cardDeckName(c)).slice(0,5));
  };

  nextPhase = function(){
    if(phase === "召喚階段"){
      phase = "戰術階段";
      mode = null;
      setCleanStatus("進入戰術階段：可選戰術佈陣或進攻宣言。");
    }else if(phase === "戰術階段" || phase === "進攻宣言" || phase === "戰術佈陣"){
      phase = "結束階段";
      mode = null;
      setCleanStatus("進入結束階段。");
    }else{
      while(hand.length > 10){
        graveyard.push(hand.pop());
      }
      turn++;
      phase = "召喚階段";
      normalSummonUsed = false;
      tacticalSummonUsed = false;
      dragged = null;
      mode = null;
      selectedAttacker = null;
      const drew = draw(2);
      setCleanStatus("第 " + turn + " 回合開始：已抽 " + drew + " 張。手牌 " + hand.length + " 張，牌庫 " + deck.length + " 張。");
    }
    syncWindowState();
    try{ render(); }catch(e){ console.error(e); }
  };

  // 給後面所有補丁/按鈕使用的統一抽牌 API。
  window.XLW_DRAW_CARDS = function(owner, n){
    if(owner === "enemy"){
      window.enemyDeck = window.enemyDeck || [];
      window.enemyHand = window.enemyHand || [];
      let drew = 0;
      for(let i=0; i<Number(n || 2); i++){
        if(!window.enemyDeck.length) break;
        window.enemyHand.push(window.enemyDeck.shift());
        drew++;
      }
      if(window.XLW_ENEMY){
        window.XLW_ENEMY.deck = window.enemyDeck;
        window.XLW_ENEMY.hand = window.enemyHand;
      }
      try{ render(); }catch(e){}
      return drew;
    }
    const drew = draw(n || 2);
    try{ render(); }catch(e){}
    return drew;
  };

  function bindFinalButtons(){
    const ng = document.getElementById("newGameBtn");
    if(ng){
      ng.onclick = function(e){
        if(e) e.preventDefault();
        newGame();
        return false;
      };
    }
    const np = document.getElementById("nextPhaseBtn");
    if(np){
      np.onclick = function(e){
        if(e) e.preventDefault();
        nextPhase();
        return false;
      };
    }
  }

  window.XLW_TRUE_FINAL_NEW_GAME = newGame;
  window.XLW_TRUE_FINAL_DRAW = draw;
  window.XLW_TRUE_FINAL_SYNC = syncWindowState;

  document.addEventListener("DOMContentLoaded", function(){
    setTimeout(bindFinalButtons, 0);
    setTimeout(bindFinalButtons, 300);
    setTimeout(bindFinalButtons, 1200);
  });

  setTimeout(bindFinalButtons, 0);
})();


// ===== 強制我方抽牌修正 =====
function drawPhasePlayer(){
  let drawCount = 0;

  for(let i=0;i<2;i++){
    if(deck.length > 0){
      hand.push(deck.pop());
      drawCount++;
    }
  }

  console.log("我方抽牌:", drawCount, "張");
  render();
}

// 接管回合開始
const __oldEndTurn = window.endTurn;
window.endTurn = function(){
  if(typeof __oldEndTurn === "function"){
    __oldEndTurn();
  }

  setTimeout(()=>{
    turn++;

    // 我方回合開始
    drawPhasePlayer();

    phase = "召喚階段";

    setStatus(`第 ${turn} 回合開始，抽2張牌。`);
    render();
  }, 1200);
};


// ======================================================
// AUTHORITATIVE V5 FIX — DECK SELECTION / DRAW / IMAGE
// 放在檔案最後，覆蓋前面所有舊補丁。
// 目標：
// 1. 選藝術品就一定只建立藝術品牌庫。
// 2. 起手抽4張、我方新回合抽2張一定作用於畫面正在讀取的 deck/hand。
// 3. 對手牌庫與手牌也有 image/img/image_url。
// ======================================================
(function(){
  const RACES = ["喵喵賊", "妖怪村莊", "藝術品"];

  function clone(c){
    try { return structuredClone(c); }
    catch(e){ return JSON.parse(JSON.stringify(c)); }
  }

  function getSelectedRace(){
    const stateRace = window.XLW_RACE_DECK_STATE && window.XLW_RACE_DECK_STATE.selectedRace;
    const selectedBtn = document.querySelector(".xlw-race-btn.selected");
    const btnRace = selectedBtn && selectedBtn.dataset && selectedBtn.dataset.race;
    const sel = document.getElementById("deckSelect");
    const selRace = sel && sel.value;

    // 若有使用彈出種族選擇，以彈出選擇為主；否則用上方 select。
    const race = btnRace || stateRace || selRace || "喵喵賊";
    if(sel && RACES.includes(race)) sel.value = race;
    return RACES.includes(race) ? race : "喵喵賊";
  }

  function deckNameOf(c){
    return c && (c.deck || c.race || c.faction || "");
  }

  function sourceCards(){
    // 以 /api/cards 載入的正式 cards.json 為主。
    if(Array.isArray(allCards) && allCards.length) return allCards;
    if(window.XLW_FULL_CARD_DATABASE && Array.isArray(window.XLW_FULL_CARD_DATABASE.cards)) return window.XLW_FULL_CARD_DATABASE.cards;
    if(Array.isArray(window.XLW_ALL_CARDS)) return window.XLW_ALL_CARDS;
    return [];
  }

  function makeFallbackImage(card){
    const color = card.race === "藝術品" || card.deck === "藝術品" ? "#263d50" :
                  card.race === "妖怪村莊" || card.deck === "妖怪村莊" ? "#332646" : "#57351f";
    const safe = s => String(s || "").replace(/[<>&]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520">
      <rect width="360" height="520" rx="24" fill="${color}"/>
      <rect x="18" y="18" width="324" height="484" rx="20" fill="rgba(255,255,255,.08)" stroke="rgba(255,230,160,.65)" stroke-width="3"/>
      <text x="180" y="78" text-anchor="middle" fill="#fff1b8" font-size="28" font-weight="900" font-family="sans-serif">${safe(card.name)}</text>
      <text x="180" y="118" text-anchor="middle" fill="#fff" font-size="20" font-family="sans-serif">${safe(deckNameOf(card))}</text>
      <rect x="48" y="155" width="264" height="220" rx="18" fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.25)"/>
      <text x="180" y="265" text-anchor="middle" fill="#fff" font-size="32" font-family="sans-serif">卡片圖</text>
      <text x="180" y="438" text-anchor="middle" fill="#ffe6a0" font-size="22" font-family="monospace">${safe(card.id)}</text>
    </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function normalizeCard(raw, race){
    const c = clone(raw);
    c.deck = c.deck || race;
    c.race = c.race || c.deck || race;
    c.faction = c.faction || c.race || race;
    c.card_id = c.id;
    c.cardId = c.id;
    c.card_type = c.type || c.card_type || "unit";
    c.atk = c.attack ?? c.atk ?? "";
    c.score = Number(c.score ?? c.reward ?? 0);
    c.tribute = Number(c.tribute ?? c.cost ?? c.stars ?? 0);
    c.cost = c.tribute;
    c.stars = c.tribute;

    if(!c.image && c.img) c.image = c.img;
    if(!c.img && c.image) c.img = c.image;
    if(!c.image_url && c.image) c.image_url = c.image;
    if(!c.image){
      c.image = makeFallbackImage(c);
      c.img = c.image;
      c.image_url = c.image;
    }
    return c;
  }

  function uniqueMainCards(race){
    const src = sourceCards();
    let list = src.filter(c => {
      const d = deckNameOf(c);
      if(d !== race) return false;
      if(c.deck_eligible === false) return false;
      if(c.type === "outside_upgrade") return false;
      return true;
    });

    // 若 cards.json 有 decks 指定，仍要強制檢查種族，避免混入舊牌。
    if(typeof decks !== "undefined" && decks && Array.isArray(decks[race]) && decks[race].length){
      const idSet = new Set(decks[race]);
      const deckList = src.filter(c => idSet.has(c.id) && deckNameOf(c) === race && c.deck_eligible !== false && c.type !== "outside_upgrade");
      if(deckList.length) list = deckList;
    }

    // 自動組牌只取不同 base/name 的前20張；異圖保留在資料庫，但避免自動牌庫塞滿異圖。
    list.sort((a,b) => ((a.variant===b.variant) ? 0 : (a.variant ? 1 : -1)));
    const seen = new Set();
    const result = [];
    for(const c of list){
      const key = c.base_id || c.name || c.id;
      if(seen.has(key)) continue;
      seen.add(key);
      result.push(normalizeCard(c, race));
      if(result.length >= 20) break;
    }
    return result;
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
  }

  function sync(){
    window.deck = deck;
    window.playerDeck = deck;
    window.hand = hand;
    window.playerHand = hand;
    window.graveyard = graveyard;
    window.enemyGraveyard = enemyGraveyard;
    window.field = field;

    window.XLW_PLAYER = window.XLW_PLAYER || {};
    window.XLW_PLAYER.deck = deck;
    window.XLW_PLAYER.hand = hand;
    window.XLW_PLAYER.graveyard = graveyard;
    window.XLW_PLAYER.race = getSelectedRace();

    window.XLW_ENEMY = window.XLW_ENEMY || {};
    window.XLW_ENEMY.deck = window.enemyDeck || [];
    window.XLW_ENEMY.hand = window.enemyHand || [];
  }

  function status(msg){
    try{ setStatus(msg); }catch(e){}
    ["status","ue-msg","topStatusMessage","skEngineMessage"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.textContent = msg;
    });
  }

  function drawToPlayer(n){
    let drew = 0;
    for(let i=0;i<Number(n||0);i++){
      if(!deck.length) break;
      hand.push(deck.shift());
      drew++;
    }
    sync();
    return drew;
  }

  function buildEnemy(playerRace){
    const enemyRace = playerRace === "妖怪村莊" ? "喵喵賊" : "妖怪村莊";
    const ed = uniqueMainCards(enemyRace);
    shuffle(ed);
    window.enemyDeck = ed;
    window.enemyHand = [];
    for(let i=0;i<4 && window.enemyDeck.length;i++){
      window.enemyHand.push(window.enemyDeck.shift());
    }
    window.XLW_ENEMY = window.XLW_ENEMY || {};
    window.XLW_ENEMY.race = enemyRace;
    window.XLW_ENEMY.deck = window.enemyDeck;
    window.XLW_ENEMY.hand = window.enemyHand;
  }

  function resetField(){
    field.player_front = [null,null,null,null,null];
    field.player_back = [null,null,null,null,null];
    field.enemy_front = [null,null,null,null,null];
    field.enemy_back = [null,null,null,null,null];
  }

  function startGameV5(){
    const race = getSelectedRace();
    const built = uniqueMainCards(race);

    if(!built.length){
      status("找不到「" + race + "」牌組資料。");
      return false;
    }

    deck = built;
    shuffle(deck);
    hand = [];
    graveyard = [];
    enemyGraveyard = [];
    resetField();

    phase = "召喚階段";
    turn = 1;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    dragged = null;
    mode = null;
    selectedAttacker = null;

    try{ if(typeof mulliganActive !== "undefined") mulliganActive = false; }catch(e){}
    try{ if(typeof selectedMulliganIndexes !== "undefined" && selectedMulliganIndexes.clear) selectedMulliganIndexes.clear(); }catch(e){}

    buildEnemy(race);
    const drew = drawToPlayer(4);

    if(window.XLW_RACE_DECK_STATE){
      window.XLW_RACE_DECK_STATE.selectedRace = race;
      window.XLW_RACE_DECK_STATE.deckBuilt = true;
      window.XLW_RACE_DECK_STATE.playerDeckIds = deck.map(c=>c.id);
    }

    sync();
    status("已載入「" + race + "」牌組，起手抽 " + drew + " 張；目前手牌皆為「" + race + "」。");
    console.log("[V5] player race", race, "hand", hand.map(c=>c.name + "/" + deckNameOf(c)), "deck", deck.length);
    console.log("[V5] enemy hand", (window.enemyHand||[]).map(c=>c.name + "/" + deckNameOf(c)));

    try{ render(); }catch(e){ console.error(e); }
    return false;
  }

  function nextPhaseV5(){
    if(phase === "召喚階段"){
      phase = "戰術階段";
      mode = null;
      status("進入戰術階段。");
    }else if(phase === "戰術階段" || phase === "進攻宣言" || phase === "戰術佈陣"){
      phase = "結束階段";
      mode = null;
      status("進入結束階段。");
    }else{
      while(hand.length > 10) graveyard.push(hand.pop());
      turn++;
      phase = "召喚階段";
      normalSummonUsed = false;
      tacticalSummonUsed = false;
      dragged = null;
      mode = null;
      selectedAttacker = null;
      const drew = drawToPlayer(2);
      status("第 " + turn + " 回合開始，已抽 " + drew + " 張。");
    }
    sync();
    try{ render(); }catch(e){ console.error(e); }
    return false;
  }

  function drawV5(n){
    const drew = drawToPlayer(n || 2);
    status("已抽 " + drew + " 張。");
    try{ render(); }catch(e){}
    return drew;
  }

  // 覆寫同檔案前面的函式與 window API。
  newGame = startGameV5;
  nextPhase = nextPhaseV5;
  draw = function(n){ return drawToPlayer(n); };
  window.newGame = startGameV5;
  window.nextPhase = nextPhaseV5;
  window.XLW_DRAW_CARDS = function(owner, n){
    if(owner === "enemy"){
      window.enemyDeck = window.enemyDeck || [];
      window.enemyHand = window.enemyHand || [];
      let drew = 0;
      for(let i=0;i<Number(n||2);i++){
        if(!window.enemyDeck.length) break;
        window.enemyHand.push(window.enemyDeck.shift());
        drew++;
      }
      if(window.XLW_ENEMY){
        window.XLW_ENEMY.deck = window.enemyDeck;
        window.XLW_ENEMY.hand = window.enemyHand;
      }
      try{ render(); }catch(e){}
      return drew;
    }
    return drawV5(n || 2);
  };

  function bind(){
    const ng = document.getElementById("newGameBtn");
    if(ng){
      ng.onclick = function(e){ if(e) e.preventDefault(); return startGameV5(); };
    }
    const np = document.getElementById("nextPhaseBtn");
    if(np){
      np.onclick = function(e){ if(e) e.preventDefault(); return nextPhaseV5(); };
    }

    // 若有彈出種族選單，也同步上方 select，但不讓舊邏輯重建錯牌庫。
    document.querySelectorAll(".xlw-race-btn").forEach(btn=>{
      if(btn.dataset.v5Bound === "1") return;
      btn.dataset.v5Bound = "1";
      btn.addEventListener("click", ()=>{
        const race = btn.dataset.race;
        const sel = document.getElementById("deckSelect");
        if(sel && RACES.includes(race)) sel.value = race;
        window.XLW_RACE_DECK_STATE = window.XLW_RACE_DECK_STATE || {};
        window.XLW_RACE_DECK_STATE.selectedRace = race;
      }, true);
    });

    const start = document.getElementById("xlwStartDeckBtn");
    if(start){
      start.onclick = function(e){ if(e) e.preventDefault(); return startGameV5(); };
    }
  }

  window.XLW_START_GAME_V5 = startGameV5;
  window.XLW_DRAW_PLAYER_V5 = drawV5;

  document.addEventListener("DOMContentLoaded", ()=>{
    bind();
    setTimeout(bind,300);
    setTimeout(bind,1000);
    setTimeout(()=>{
      // 開啟後若已自動開始但手牌種族不對，就依目前選項重新開始一次。
      const race = getSelectedRace();
      if(hand && hand.length && hand.some(c=>deckNameOf(c)!==race)){
        console.warn("[V5] detected wrong opening hand, rebuilding deck");
        startGameV5();
      }
    }, 1400);
  });

  setTimeout(bind,0);
})();


// ===== v6 牌組混牌修正 =====
(function(){
  function raceOf(card){
    return (card && (card.deck || card.race || card.faction || "")).trim();
  }

  function strictDeckBuild(race){
    // 完全重新從 allCards 建立，不使用舊 decks cache
    const source = Array.isArray(allCards) ? allCards : [];

    let filtered = source.filter(c=>{
      return raceOf(c) === race;
    });

    // 去除異圖重複（同名只留第一張）
    const used = new Set();
    filtered = filtered.filter(c=>{
      const key = c.base_id || c.name || c.id;
      if(used.has(key)) return false;
      used.add(key);
      return true;
    });

    // 限制20張主牌
    filtered = filtered.slice(0,20);

    // 深拷貝
    return filtered.map(c=>{
      const x = JSON.parse(JSON.stringify(c));
      x.deck = race;
      x.race = race;
      x.faction = race;
      return x;
    });
  }

  window.XLW_FORCE_REBUILD_DECK = function(race){
    const rebuilt = strictDeckBuild(race);

    deck = rebuilt;
    hand = [];
    graveyard = [];

    // 洗牌
    for(let i=deck.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [deck[i],deck[j]]=[deck[j],deck[i]];
    }

    // 開局抽4
    for(let i=0;i<4;i++){
      if(deck.length){
        hand.push(deck.shift());
      }
    }

    console.log("[v6] 重新建立牌組:", race);
    console.log("[v6] 手牌:", hand.map(c=>c.name+" / "+raceOf(c)));
    console.log("[v6] 剩餘牌庫:", deck.map(c=>c.name+" / "+raceOf(c)));

    if(hand.some(c=>raceOf(c)!==race)){
      alert("偵測到混牌錯誤！");
    }

    try{ render(); }catch(e){}
  };

  // 接管開始遊戲按鈕
  const oldNewGame = window.newGame || newGame;

  window.newGame = function(){
    const sel = document.getElementById("deckSelect");
    const race = sel ? sel.value : "喵喵賊";

    // 先跑舊初始化
    try{
      if(typeof oldNewGame === "function"){
        oldNewGame();
      }
    }catch(e){
      console.error(e);
    }

    // 強制覆蓋成正確牌組
    setTimeout(()=>{
      window.XLW_FORCE_REBUILD_DECK(race);
    },100);
  };

  // DOM 載入後自動綁定
  document.addEventListener("DOMContentLoaded", ()=>{
    const btn = document.getElementById("newGameBtn");
    if(btn){
      btn.onclick = function(e){
        e.preventDefault();
        window.newGame();
        return false;
      };
    }
  });
})();



/* =========================================================
   XLW v7 HARD FIX
   1) 藝術品牌組只會使用 deck/faction/race = 藝術品 的卡
   2) 開始遊戲會直接進入對戰，強制隱藏種族選擇面板
   3) 修正 ART-0008/0009/0010 圖片快取與錯圖
   ========================================================= */
(function(){
  const XLW_FIX_VERSION = "v7_20260524_strict_deck_start_image";
  const VALID_DECKS = ["喵喵賊", "妖怪村莊", "藝術品"];
  let xlwLastSelectedDeck = "喵喵賊";

  function $(id){ return document.getElementById(id); }

  function normDeckName(v){
    v = String(v || "").trim();
    if(v.includes("藝術")) return "藝術品";
    if(v.includes("妖怪")) return "妖怪村莊";
    if(v.includes("喵") || v.includes("貓")) return "喵喵賊";
    return VALID_DECKS.includes(v) ? v : "喵喵賊";
  }

  function activeDeckName(force){
    if(force) return normDeckName(force);

    const selectedBtn = document.querySelector(".xlw-race-btn.selected");
    if(selectedBtn && selectedBtn.dataset && selectedBtn.dataset.race){
      xlwLastSelectedDeck = normDeckName(selectedBtn.dataset.race);
      return xlwLastSelectedDeck;
    }

    const select = $("deckSelect");
    if(select && select.value){
      xlwLastSelectedDeck = normDeckName(select.value);
      return xlwLastSelectedDeck;
    }

    return xlwLastSelectedDeck;
  }

  function isArtCard(c){
    if(!c) return false;
    const id = String(c.id || "");
    return (
      c.deck === "藝術品" ||
      c.faction === "藝術品" ||
      c.race === "藝術品" ||
      id.startsWith("ART-") ||
      id.startsWith("SSR-ART-") ||
      id.startsWith("SR-ART-") ||
      id.startsWith("CRP-ART-")
    );
  }

  function belongsToDeck(c, deckName){
    if(!c) return false;
    deckName = normDeckName(deckName);

    if(deckName === "藝術品"){
      // 藝術品嚴格限制：必須是藝術品，且不得是喵喵賊/妖怪村莊。
      if(c.deck === "喵喵賊" || c.faction === "喵喵賊" || c.race === "喵喵賊") return false;
      if(c.deck === "妖怪村莊" || c.faction === "妖怪村莊" || c.race === "妖怪村莊") return false;
      return isArtCard(c);
    }

    // 其他牌組嚴格限制，不吃「中立」或其他混牌。
    return c.deck === deckName || c.faction === deckName || c.race === deckName;
  }

  function fixKnownImagesOnCards(){
    if(!Array.isArray(allCards)) return;
    for(const c of allCards){
      if(!c) continue;
      if(c.id === "ART-0008") c.image = "/static/card_images/art_0008.jpeg?v=" + XLW_FIX_VERSION;
      if(c.id === "ART-0009") c.image = "/static/card_images/art_0009.jpeg?v=" + XLW_FIX_VERSION;
      if(c.id === "ART-0010") c.image = "/static/card_images/art_0010.jpeg?v=" + XLW_FIX_VERSION;
      if(isArtCard(c)){
        c.deck = "藝術品";
        c.faction = "藝術品";
        c.race = "藝術品";
      }
    }
  }

  function cloneCard(c){
    try{ return structuredClone(c); }
    catch(e){ return JSON.parse(JSON.stringify(c)); }
  }

  function strictSourceCards(deckName){
    deckName = normDeckName(deckName);
    fixKnownImagesOnCards();

    let ids = (decks && Array.isArray(decks[deckName])) ? decks[deckName] : [];
    let source = [];

    if(ids.length){
      source = ids.map(id => allCards.find(c => c && c.id === id)).filter(Boolean);
    }else{
      source = (allCards || []).filter(c => belongsToDeck(c, deckName));
    }

    // 二次嚴格過濾 + 去重，避免 decks.json 或舊補丁把別的種族混進來。
    const seen = new Set();
    source = source.filter(c => {
      if(!belongsToDeck(c, deckName)) return false;
      if(c.deck_eligible === false) return false;
      if(seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });

    return source;
  }

  function xlwShuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function hideRacePanel(){
    const panel = $("xlwRaceDeckPanel");
    if(panel){
      panel.style.display = "none";
      panel.classList.add("xlw-hidden-after-start");
    }
    document.body.classList.add("xlw-game-started");
  }

  function robustNewGame(forceDeckName){
    const deckName = activeDeckName(forceDeckName);
    xlwLastSelectedDeck = deckName;

    const select = $("deckSelect");
    if(select) select.value = deckName;

    const sourceCards = strictSourceCards(deckName);
    if(!sourceCards.length){
      if(typeof setStatus === "function") setStatus("找不到「" + deckName + "」牌組資料。");
      alert("找不到「" + deckName + "」牌組資料。");
      return;
    }

    deck = sourceCards.map(cloneCard);
    hand = [];
    graveyard = [];
    enemyGraveyard = [];

    if(field){
      field.player_front = [null,null,null,null,null];
      field.player_back = [null,null,null,null,null];
      field.enemy_front = [null,null,null,null,null];
      field.enemy_back = [null,null,null,null,null];
    }

    xlwShuffle(deck);

    phase = "召喚階段";
    turn = 1;
    normalSummonUsed = false;
    tacticalSummonUsed = false;
    mode = null;
    selectedAttacker = null;

    // 開局固定抽 4 張
    for(let i=0;i<4;i++){
      if(deck.length) hand.push(deck.pop());
    }

    // 最後防呆：若手牌或牌庫出現非該牌組，立刻報錯並移除。
    const bad = deck.concat(hand).filter(c => !belongsToDeck(c, deckName));
    if(bad.length){
      console.error("[XLW v7] 非本牌組卡被擋下：", bad.map(c => c.id + " " + c.name));
      deck = deck.filter(c => belongsToDeck(c, deckName));
      hand = hand.filter(c => belongsToDeck(c, deckName));
    }

    hideRacePanel();

    if(typeof setStatus === "function"){
      setStatus("已載入「" + deckName + "」牌組；目前牌庫 " + deck.length + " 張，手牌 " + hand.length + " 張。");
    }
    if(typeof render === "function") render();

    console.log("[XLW v7] start deck =", deckName);
    console.table(deck.concat(hand).map(c => ({id:c.id, name:c.name, deck:c.deck, race:c.race, faction:c.faction, image:c.image})));
  }

  // 覆蓋原本 newGame / draw，修正抽牌與牌組來源。
  newGame = robustNewGame;

  draw = function(n){
    const deckName = activeDeckName();
    fixKnownImagesOnCards();
    for(let i=0;i<n;i++){
      if(!deck.length){
        if(typeof setStatus === "function") setStatus("牌庫已空。");
        break;
      }
      const c = deck.pop();
      if(belongsToDeck(c, deckName)) hand.push(c);
      else console.error("[XLW v7] 抽牌時擋下非本牌組卡：", c);
    }
    if(typeof render === "function") render();
  };

  // 強制攔截所有開始按鈕，避免舊的種族面板流程卡住。
  function installStartButtonFix(){
    const topBtn = $("newGameBtn");
    if(topBtn){
      topBtn.addEventListener("click", function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        robustNewGame(activeDeckName());
      }, true);
    }

    document.addEventListener("click", function(e){
      const raceBtn = e.target.closest && e.target.closest(".xlw-race-btn");
      if(raceBtn && raceBtn.dataset && raceBtn.dataset.race){
        xlwLastSelectedDeck = normDeckName(raceBtn.dataset.race);
        const select = $("deckSelect");
        if(select) select.value = xlwLastSelectedDeck;
      }

      const startBtn = e.target.closest && e.target.closest("#xlwStartDeckBtn, .xlw-race-action.primary");
      if(startBtn){
        e.preventDefault();
        e.stopImmediatePropagation();
        robustNewGame(activeDeckName());
      }
    }, true);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", installStartButtonFix);
  }else{
    installStartButtonFix();
  }

  window.XLW_V7_DEBUG_DECK = function(name){
    name = activeDeckName(name);
    const source = strictSourceCards(name);
    console.log("[XLW v7 DEBUG]", name, "count =", source.length);
    console.table(source.map(c=>({id:c.id,name:c.name,deck:c.deck,race:c.race,faction:c.faction,image:c.image})));
    return source;
  };
})();
