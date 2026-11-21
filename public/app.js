const grid = document.getElementById('menu-grid');
const cartPanel = document.getElementById('cart');
const overlay = document.getElementById('overlay');
const cartItems = document.getElementById('cart-items');
const errorBox = document.getElementById('form-error');
let menu = [];
let filter = 'All';
let cart = {};
try { cart = JSON.parse(localStorage.getItem('cj-cart') || '{}'); } catch { cart = {}; }
const dollars = n => '$' + n.toFixed(2);
const saveCart = () => { localStorage.setItem('cj-cart', JSON.stringify(cart)); drawCart(); };
const make = (tag, cls, value) => { const el = document.createElement(tag); if (cls) el.className=cls; if (value!==undefined) el.textContent=value; return el; };

function drawMenu() {
  grid.replaceChildren();
  for (const item of menu.filter(x => filter === 'All' || x.category === filter)) {
    const card=make('article','item-card');
    const icon=make('div','item-icon',item.icon);
    if (item.badge) icon.append(make('span','badge',item.badge));
    const body=make('div','item-body');
    body.append(make('span','item-cat',item.category),make('h3','',item.name),make('p','',item.description));
    const bottom=make('div','item-end');
    if(item.inStoreOnly){
      bottom.append(make('span','no-price','Ask for price in store'),make('span','in-store-chip','21+ · In store only'));
      body.append(make('p','instore-note','Age verification required. Not available for online ordering.'));
    } else {
      const add=make('button','add-btn','+ Add to order');add.type='button';
      add.addEventListener('click',()=>{cart[item.id]=Math.min(20,(cart[item.id]||0)+1);saveCart();openCart();});
      bottom.append(make('strong','',dollars(item.price)),add);
    }body.append(bottom);card.append(icon,body);grid.append(card);
  }
}
function drawCart() {
  cartItems.replaceChildren();
  let count=0, subtotal=0;
  for (const [id, quantity] of Object.entries(cart)) {
    const item=menu.find(m=>m.id===id);
    if (!item || item.inStoreOnly || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) { delete cart[id];continue; }
    count+=quantity;subtotal+=item.price*quantity;
    const row=make('div','cart-row');const detail=make('div');
    detail.append(make('b','',item.name),make('small','',dollars(item.price)+' each'));
    const right=make('div');right.append(make('b','',dollars(item.price*quantity)));
    const qty=make('div','qty-control');
    const minus=make('button','','−');minus.type='button';minus.setAttribute('aria-label','Remove one '+item.name);
    minus.addEventListener('click',()=>{ if(--cart[id]<=0)delete cart[id];saveCart(); });
    const plus=make('button','','+');plus.type='button';plus.setAttribute('aria-label','Add one '+item.name);
    plus.disabled=quantity>=20;plus.addEventListener('click',()=>{ cart[id]++;saveCart(); });
    qty.append(minus,make('span','',String(quantity)),plus);right.append(qty);row.append(detail,right);cartItems.append(row);
  }
  if (!count) cartItems.append(make('p','empty','Your cart is empty. Let’s find you something good! 🍗'));
  document.getElementById('cart-count').textContent=count;
  document.getElementById('subtotal').textContent=dollars(subtotal);
  document.getElementById('place-order').disabled=count===0;
}
function openCart(){cartPanel.classList.add('open');cartPanel.setAttribute('aria-hidden','false');overlay.hidden=false;document.getElementById('cart-toggle').setAttribute('aria-expanded','true');document.getElementById('cart-close').focus();document.body.style.overflow='hidden';}
function closeCart(){cartPanel.classList.remove('open');cartPanel.setAttribute('aria-hidden','true');overlay.hidden=true;document.getElementById('cart-toggle').setAttribute('aria-expanded','false');document.body.style.overflow='';document.getElementById('cart-toggle').focus();}
document.getElementById('cart-toggle').addEventListener('click',openCart);
document.getElementById('cart-close').addEventListener('click',closeCart);
overlay.addEventListener('click',closeCart);
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{ filter=button.dataset.filter;document.querySelectorAll('.filter').forEach(b=>{ b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button)); });drawMenu(); }));
document.getElementById('checkout-form').addEventListener('submit',async event=>{
  event.preventDefault();errorBox.textContent='';
  const submit=document.getElementById('place-order');submit.disabled=true;submit.textContent='Submitting order…';
  const form=event.currentTarget;
  try{
    const method=form.elements.paymentMethod.value;
    if(method==='card'){
      const response=await fetch('/api/card-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:{name:form.elements.name.value,phone:form.elements.phone.value},notes:form.elements.notes.value,items:Object.entries(cart).map(([id,quantity])=>({id,quantity}))})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Card checkout is not available right now. Please select pay at pickup.');
      window.location.assign(result.checkoutUrl);return;
    }
    const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customer:{name:form.elements.name.value,phone:form.elements.phone.value},notes:form.elements.notes.value,items:Object.entries(cart).map(([id,quantity])=>({id,quantity}))})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Could not submit your order.');
    cart={};saveCart();form.reset();closeCart();
    document.getElementById('order-number').textContent=result.orderNumber;
    document.getElementById('confirmation').hidden=false;
    document.getElementById('confirmation-close').focus();
  }catch(err){errorBox.textContent=err.message;}
  finally{submit.textContent='Place pickup order ↗';drawCart();}
});
document.getElementById('confirmation-close').addEventListener('click',()=>{document.getElementById('confirmation').hidden=true;document.body.style.overflow='';});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!document.getElementById('confirmation').hidden)document.getElementById('confirmation-close').click();else if(cartPanel.classList.contains('open'))closeCart();}});
document.getElementById('year').textContent=new Date().getFullYear();
fetch('/api/menu').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{menu=data;drawMenu();drawCart();}).catch(()=>grid.replaceChildren(make('p','','Could not load the menu. Please try refreshing.')));

const methodSelect=document.getElementById('payment-method');
methodSelect.addEventListener('change',()=>{document.getElementById('place-order').textContent=methodSelect.value==='card'?'Proceed to secure card checkout ↗':'Place pickup order ↗';});
