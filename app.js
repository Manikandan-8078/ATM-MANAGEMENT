/* GPT SmartATM — frontend-only implementation WITH Statement feature
   - last 10 transactions shown as statement with balance after tx
   - printable popup window for printing / saving PDF
   - transactions now store balanceAfter
   - PIN required for confirming each txn (modal)
*/

// ---------- sample DB ----------
fetch("db.json")
  .then(res => res.json())
  .then(data => {
    if (!localStorage.getItem("atmAccounts")) {
      localStorage.setItem("atmAccounts", JSON.stringify(data.accounts));
    }
  })
  .catch(err => console.error("Error loading DB:", err));

if(!localStorage.getItem('atm_db')) localStorage.setItem('atm_db', JSON.stringify(SAMPLE));

// ---------- helpers ----------
const DB = {
  read(){ return JSON.parse(localStorage.getItem('atm_db') || '[]') },
  save(arr){ localStorage.setItem('atm_db', JSON.stringify(arr)) }
};
let current = null; // selected account object
let authPassed = false; // authenticated after PIN entry

// DOM
const cardStatus = document.getElementById('cardStatus');
const slotInner = document.getElementById('slotInner');
const demoInsert = document.getElementById('demoInsert');
const ejectCardBtn = document.getElementById('ejectCard');
const lookupInput = document.getElementById('lookupInput');
const lookupResults = document.getElementById('lookupResults');

const views = {
  welcome: document.getElementById('welcomeView'),
  auth: document.getElementById('authView'),
  menu: document.getElementById('menuView'),
  txn: document.getElementById('txnView'),
  receipt: document.getElementById('receiptView'),
  statement: document.getElementById('statementView')
};

const pinInput = document.getElementById('pinInput');
const pinSubmit = document.getElementById('pinSubmit');
const pinCancel = document.getElementById('pinCancel');
const pinMsg = document.getElementById('pinMsg');

const tiles = document.querySelectorAll('.tile');
const txnTitle = document.getElementById('txnTitle');
const txnForm = document.getElementById('txnForm');
const txnConfirmBtn = document.getElementById('txnConfirm');
const txnCancelBtn = document.getElementById('txnCancel');

const confirmModal = document.getElementById('confirmModal');
const confirmText = document.getElementById('confirmText');
const confirmPin = document.getElementById('confirmPin');
const confirmOk = document.getElementById('confirmOk');
const confirmCancel = document.getElementById('confirmCancel');
const confirmMsg = document.getElementById('confirmMsg');

const otpModal = document.getElementById('otpModal');
const otpVal = document.getElementById('otpVal');
const otpClose = document.getElementById('otpClose');

const receiptBox = document.getElementById('receiptBox');
const downloadReceipt = document.getElementById('downloadReceipt');
const closeReceipt = document.getElementById('closeReceipt');

const openOtpBtn = document.getElementById('openOtp');
const blockBtn = document.getElementById('blockBtn');
const unblockBtn = document.getElementById('unblockBtn');

const statementBox = document.getElementById('statementBox');
const printStatementBtn = document.getElementById('printStatement');
const closeStatementBtn = document.getElementById('closeStatement');

// utilities
function showView(viewId){
  Object.values(views).forEach(v=>v.classList.remove('active'));
  if(views[viewId]) views[viewId].classList.add('active');
}
function setStatus(text){ cardStatus.textContent = text; }
function renderSlot(){
  if(!current) { slotInner.textContent = 'No card inserted'; setStatus('No card'); }
  else {
    slotInner.innerHTML = `<div style="text-align:center">
      <div style="font-weight:700">${current.name}</div>
      <div class="small muted">${current.card}</div>
    </div>`;
    setStatus(`Card: ${current.card.slice(-4)}`);
  }
}
function listResults(q){
  const arr = DB.read();
  const ql = q.trim().toLowerCase();
  const found = arr.filter(a=> a.card.includes(ql) || a.name.toLowerCase().includes(ql));
  lookupResults.innerHTML = '';
  found.forEach(a=>{
    const el = document.createElement('div'); el.className='lookup-item';
    el.innerHTML = `<div>
      <div style="font-weight:700">${a.name}</div>
      <div class="muted small">${a.card} • ${a.type}</div>
    </div>
    <div><button class="muted small">Use</button></div>`;
    el.querySelector('button').onclick = ()=> { current = a; renderSlot(); showAuth(); lookupResults.innerHTML=''; lookupInput.value=''; };
    lookupResults.appendChild(el);
  });
  if(found.length===0) lookupResults.innerHTML = `<div class="muted small">No matches</div>`;
}

// insert / eject
demoInsert.onclick = ()=>{
  const arr = DB.read();
  current = arr[0];
  renderSlot();
  showAuth();
};
ejectCardBtn.onclick = ()=> {
  if(!current) return;
  current = null; authPassed=false;
  renderSlot(); showView('welcome');
  alert('Card ejected. Please take your card.');
};

lookupInput.addEventListener('input', (e)=> listResults(e.target.value));

// auth
function showAuth(){ if(!current){ alert('No card selected'); return; }
  if(current.blocked){ alert('Card is blocked — use Unblock -> OTP to reactivate'); return; }
  showView('auth'); pinInput.value=''; pinMsg.textContent='';
}
pinSubmit.onclick = ()=>{
  const val = pinInput.value.trim();
  if(!current) return;
  if(val === current.pin){
    pinMsg.textContent=''; authPassed=true; showView('menu');
  } else { pinMsg.textContent='Incorrect PIN'; }
};
pinCancel.onclick = ()=>{ showView('welcome'); current=null; renderSlot(); };

// menu tile actions
tiles.forEach(t=>{
  t.onclick = ()=> {
    if(!current || !authPassed) { alert('Insert card & enter PIN first'); return; }
    const act = t.dataset.action;
    switch(act){
      case 'balance': showBalance(); break;
      case 'withdraw': prepareTxn('Withdraw'); break;
      case 'deposit': prepareTxn('Deposit'); break;
      case 'transfer': prepareTxn('Transfer'); break;
      case 'history': showHistory(); break;
      case 'profile': showProfile(); break;
      case 'statement': showStatement(); break;
    }
  }
});

// transactions with confirm modal (PIN)
function showBalance(){
  txnTitle.textContent='Account Balance';
  txnForm.innerHTML = `<div class="muted">Available balance</div><div style="font-size:1.6rem;margin-top:8px">₹${current.balance.toFixed(2)}</div>`;
  document.getElementById('txnConfirm').style.display='none';
  showView('txn');
}

function prepareTxn(kind){
  txnTitle.textContent = kind;
  let html = '';
  if(kind === 'Withdraw' || kind === 'Deposit'){
    html = `<label>Amount (₹)</label><input id="txnAmount" type="number" min="1" placeholder="0.00" />`;
  } else if(kind === 'Transfer'){
    html = `<label>Recipient Card</label><input id="txnTo" placeholder="xxxx-xxxx-xxxx-xxxx" /><label>Amount (₹)</label><input id="txnAmount" type="number" min="1" />`;
  }
  txnForm.innerHTML = html;
  document.getElementById('txnConfirm').style.display='inline-block';
  txnConfirmBtn.onclick = ()=> openConfirmModal(kind);
  txnCancelBtn.onclick = ()=> showView('menu');
  showView('txn');
}

function openConfirmModal(kind){
  const amountEl = document.getElementById('txnAmount');
  const toEl = document.getElementById('txnTo');
  const amount = amountEl? Number(amountEl.value) : 0;
  const to = toEl? toEl.value.trim() : null;

  // validations
  if((kind==='Withdraw' || kind==='Deposit' || kind==='Transfer') && (!amount || amount<=0)){
    alert('Enter a valid amount'); return;
  }
  if(kind==='Withdraw' && amount>current.balance){ alert('Insufficient funds'); return; }
  if(kind==='Transfer'){
    const rec = DB.read().find(a=>a.card === to);
    if(!rec){ alert('Recipient not found'); return; }
  }

  confirmText.textContent = `${kind} — ₹${amount}` + (to? ` to ${to}` : '');
  confirmPin.value = '';
  confirmMsg.textContent = '';
  confirmModal.classList.remove('hidden');

  confirmOk.onclick = ()=> {
    const p = confirmPin.value.trim();
    if(p !== current.pin){ confirmMsg.textContent = 'PIN incorrect'; return; }
    // execute
    executeTxn(kind, amount, to);
    confirmModal.classList.add('hidden');
  };
  confirmCancel.onclick = ()=> confirmModal.classList.add('hidden');
}

function executeTxn(kind, amount=0, to=null){
  const db = DB.read();
  const now = new Date().toLocaleString();

  if(kind === 'Withdraw'){
    current.balance -= amount;
    current.transactions.push({type:'Withdraw',amount,date:now,balanceAfter:current.balance});
  } else if(kind === 'Deposit'){
    current.balance += amount;
    current.transactions.push({type:'Deposit',amount,date:now,balanceAfter:current.balance});
  } else if(kind === 'Transfer'){
    const rec = db.find(a=>a.card===to);
    if(!rec){ alert('Recipient not found'); return; }
    current.balance -= amount;
    rec.balance += amount;
    current.transactions.push({type:`Transfer to ${rec.card}`,amount,date:now,balanceAfter:current.balance});
    rec.transactions.push({type:`Received from ${current.card}`,amount,date:now,balanceAfter:rec.balance});
    // save recipient
    db[db.findIndex(a=>a.card===rec.card)] = rec;
  }

  // update current in DB and save
  db[db.findIndex(a=>a.card===current.card)] = current;
  DB.save(db);

  // show receipt then auto-eject
  showReceipt({type:kind,amount,date:now});
  autoEjectAfterTx();
}

function showHistory(){
  let html = '<ul style="list-style:none;padding:0">';
  (current.transactions||[]).slice().reverse().forEach(t=>{
    html += `<li style="padding:8px;border-bottom:1px dashed rgba(255,255,255,0.04)">${t.date} — ${t.type} — ₹${t.amount} — Bal: ₹${t.balanceAfter?.toFixed(2)||'-'}</li>`;
  });
  html += '</ul>';
  txnTitle.textContent='Transaction History';
  txnForm.innerHTML = html;
  document.getElementById('txnConfirm').style.display='none';
  showView('txn');
}

function showProfile(){
  const html = `
    <div style="text-align:left">
      <div><b>Name:</b> ${current.name}</div>
      <div><b>Card:</b> ${current.card}</div>
      <div><b>Type:</b> ${current.type}</div>
      <div><b>Email:</b> ${current.email}</div>
      <div><b>Phone:</b> ${current.phone}</div>
      <div><b>Address:</b> ${current.address}</div>
      <div><b>Status:</b> ${current.blocked? 'Blocked' : 'Active'}</div>
      <div style="margin-top:8px"><button id="changePinBtn" class="muted">Change PIN (Green PIN)</button></div>
    </div>`;
  txnTitle.textContent='Profile';
  txnForm.innerHTML = html;
  document.getElementById('txnConfirm').style.display='none';
  showView('txn');

  setTimeout(()=>{
    const cp = document.getElementById('changePinBtn');
    if(cp) cp.onclick = ()=> {
      const newPin = prompt('Enter new 4-digit PIN:');
      if(!newPin || newPin.length!==4) return alert('Invalid PIN');
      current.pin = newPin;
      const db = DB.read(); db[db.findIndex(a=>a.card===current.card)] = current; DB.save(db);
      alert('PIN changed');
    };
  },50);
}

// OTP and block/unblock
openOtpBtn.onclick = ()=>{
  const otp = (Math.floor(Math.random()*900000)+100000).toString();
  otpVal.textContent = otp; otpModal.classList.remove('hidden');
};
otpClose.onclick = ()=> otpModal.classList.add('hidden');

blockBtn.onclick = ()=>{
  if(!current) return alert('Select card first');
  if(current.blocked) return alert('Already blocked');
  current.blocked = true;
  const db = DB.read(); db[db.findIndex(a=>a.card===current.card)] = current; DB.save(db);
  alert('Card blocked');
  renderSlot(); showView('welcome');
};

unblockBtn.onclick = ()=>{
  if(!current) return alert('Select card first');
  if(!current.blocked) return alert('Not blocked');
  const otp = (Math.floor(Math.random()*900000)+100000).toString();
  otpVal.textContent = otp; otpModal.classList.remove('hidden');
  otpClose.onclick = ()=> {
    otpModal.classList.add('hidden');
    const entered = prompt('Enter OTP as shown to confirm unblock:');
    if(entered === otp){
      current.blocked = false;
      const db = DB.read(); db[db.findIndex(a=>a.card===current.card)] = current; DB.save(db);
      alert('Card unblocked');
      renderSlot();
    } else alert('OTP mismatch');
    otpClose.onclick = ()=> otpModal.classList.add('hidden');
  };
};

// Receipt and QR
function showReceipt(txn){
  receiptBox.innerHTML = '';
  const title = document.createElement('div'); title.style.fontWeight='700';
  title.textContent = txn.type + ' • ₹' + txn.amount;
  const dt = document.createElement('div'); dt.className='muted small'; dt.textContent = txn.date;
  const acc = document.createElement('div'); acc.className='muted small'; acc.textContent = `Account: ${current.card} • ${current.name}`;
  const qrWrap = document.createElement('div'); qrWrap.style.marginTop='12px';
  receiptBox.appendChild(title); receiptBox.appendChild(dt); receiptBox.appendChild(acc); receiptBox.appendChild(qrWrap);

  const qrText = `Account:${current.card}\nName:${current.name}\nTxn:${txn.type}\nAmt:₹${txn.amount}\nDate:${txn.date}`;
  new QRCode(qrWrap, { text: qrText, width:160, height:160 });

  showView('receipt');

  downloadReceipt.onclick = ()=> {
    const canvas = qrWrap.querySelector('canvas');
    const w = 500, h = 600;
    const c = document.createElement('canvas'); c.width=w; c.height=h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = "#02121a"; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = "#00ffd1"; ctx.font = "20px sans-serif"; ctx.fillText("GPT Smart ATM Receipt", 20, 40);
    ctx.fillStyle = "#ffffff"; ctx.font="16px sans-serif"; ctx.fillText(`Name: ${current.name}`, 20, 90);
    ctx.fillText(`Card: ${current.card}`,20,120); ctx.fillText(`Txn: ${txn.type}  Amount: ₹${txn.amount}`,20,150);
    ctx.fillText(`Date: ${txn.date}`,20,180);
    if(canvas){ ctx.drawImage(canvas, 20,220,220,220); }
    const link = document.createElement('a'); link.download = `receipt_${Date.now()}.png`; link.href = c.toDataURL(); link.click();
  };

  closeReceipt.onclick = ()=> { showView('welcome'); };
}

// auto-eject after tx
function autoEjectAfterTx(){
  setTimeout(()=> {
    alert('Transaction done. Your card has been ejected. Please take it.');
    current = null; authPassed=false;
    renderSlot(); showView('welcome');
  }, 700);
}

// ---------- STATEMENT feature ----------
// show statement in-app
function showStatement(){
  const txs = (current.transactions || []).slice().reverse().slice(0,10); // last 10
  let html = `<div class="statement-header"><div><strong>${current.name}</strong><div class="muted small">${current.card}</div></div><div class="muted small">Generated: ${new Date().toLocaleString()}</div></div>`;
  html += `<table class="statement-table"><thead><tr><th>Date</th><th>Type</th><th>Amount (₹)</th><th>Balance After (₹)</th></tr></thead><tbody>`;
  if(!txs.length) {
    html += `<tr><td colspan="4" style="padding:12px">No transactions</td></tr>`;
  } else {
    txs.forEach(t=>{
      html += `<tr>
        <td>${t.date}</td>
        <td>${t.type}</td>
        <td>${t.amount.toFixed? t.amount.toFixed(2) : t.amount}</td>
        <td>${t.balanceAfter? t.balanceAfter.toFixed(2) : '-'}</td>
      </tr>`;
    });
  }
  html += `</tbody></table>`;
  statementBox.innerHTML = html;
  showView('statement');
}

// print statement popup
printStatementBtn.onclick = ()=> {
  const txs = (current.transactions || []).slice().reverse().slice(0,50);
  const win = window.open('','_blank','width=900,height=700');
  const style = `
    body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#02121a}
    .header{display:flex;justify-content:space-between;align-items:center}
    table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
    h2{color:#02121a}
  `;
  let html = `<html><head><title>Statement - ${current.name}</title><style>${style}</style></head><body>
    <div class="header"><div><h2>GPT Smart ATM - Statement</h2><div>${current.name}</div><div>${current.card}</div></div>
    <div>${new Date().toLocaleString()}</div></div>
    <table><thead><tr><th>Date</th><th>Type</th><th>Amount (₹)</th><th>Balance After (₹)</th></tr></thead><tbody>`;
  if(!txs.length) html += `<tr><td colspan="4">No transactions</td></tr>`;
  else txs.forEach(t=>{
    html += `<tr><td>${t.date}</td><td>${t.type}</td><td>${t.amount.toFixed? t.amount.toFixed(2):t.amount}</td><td>${t.balanceAfter? t.balanceAfter.toFixed(2): '-'}</td></tr>`;
  });
  html += `</tbody></table><div style="margin-top:18px;"><button onclick="window.print()">Print / Save as PDF</button></div></body></html>`;
  win.document.write(html);
  win.document.close();
};

// close statement
closeStatementBtn.onclick = ()=> showView('menu');

// initial rendering
renderSlot();
listResults('');
