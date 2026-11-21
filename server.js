require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const Stripe = require('stripe');
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const menu = require('./data/menu.json');
const orderPath = path.join(__dirname, 'data', 'orders.json');
let ordersCollection;
let fileQueue = Promise.resolve();

app.disable('x-powered-by');
// Stripe webhooks require unmodified raw request bodies and must precede express.json().
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req,res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(503);
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET); }
  catch (err) { return res.status(400).send('Invalid webhook signature'); }
  if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
    const id = event.data.object.metadata?.orderNumber;
    try { await updateOrder(id, { status: 'paid', paymentMethod: 'Card paid online', stripeSessionId: event.data.object.id }); }
    catch (err) { console.error('Stripe webhook persistence failed:', err); return res.sendStatus(500); }
  }
  res.json({received:true});
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function saveOrder(order) {
  if (ordersCollection) return ordersCollection.insertOne(order);
  const write = async () => {
    let existing = [];
    try { existing = JSON.parse(await fs.readFile(orderPath,'utf8')); }
    catch(err) { if(err.code !== 'ENOENT') throw err; }
    existing.push(order);
    await fs.writeFile(orderPath,JSON.stringify(existing,null,2));
  };
  fileQueue=fileQueue.then(write,write);
  return fileQueue;
}
async function updateOrder(orderNumber, values) {
  if (!orderNumber) throw new Error('Missing order reference');
  if (ordersCollection) {
    const result = await ordersCollection.updateOne({orderNumber},{$set:values});
    if (!result.matchedCount) throw new Error('Order not found');
    return;
  }
  const write = async () => {
    const existing = JSON.parse(await fs.readFile(orderPath,'utf8'));
    const order = existing.find(o=>o.orderNumber===orderNumber);
    if (!order) throw new Error('Order not found');
    Object.assign(order,values);
    await fs.writeFile(orderPath,JSON.stringify(existing,null,2));
  };
  fileQueue=fileQueue.then(write,write);
  return fileQueue;
}
function money(n) { return Math.round(n * 100) / 100; }
function validText(s, max = 120) { return typeof s === 'string' && s.trim().length > 0 && s.trim().length <= max; }

app.get('/api/menu', (req, res) => res.json(menu));

app.post('/api/orders', async (req, res) => {
  const { customer, items, notes } = req.body || {};
  if (!customer || !validText(customer.name) || !validText(customer.phone, 35) ||
      !/^[+\d().\s-]{7,35}$/.test(customer.phone.trim()) ||
      !Array.isArray(items) || items.length < 1 || items.length > 30 ||
      (notes !== undefined && (typeof notes !== 'string' || notes.length > 500))) {
    return res.status(400).json({ error: 'Please enter your name, phone number, and valid items.' });
  }
  const chosen = [];
  for (const item of items) {
    const found = menu.find(m => m.id === item?.id);
    if (!found || found.inStoreOnly || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      return res.status(400).json({ error: 'Your cart contains an invalid item or quantity.' });
    }
    chosen.push({ id: found.id, name: found.name, quantity: item.quantity, unitPrice: found.price,
      lineTotal: money(found.price * item.quantity) });
  }
  const subtotal = money(chosen.reduce((sum, item) => sum + item.lineTotal, 0));
  if (subtotal > 1000) return res.status(400).json({ error: 'Please call the store for large orders.' });
  const order = {
    orderNumber: `CJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    createdAt: new Date().toISOString(),
    status: 'received',
    customer: { name: customer.name.trim(), phone: customer.phone.trim() },
    items: chosen,
    notes: (notes || '').trim(),
    subtotal,
    paymentMethod: 'Pay at pickup',
    fulfillment: 'Pickup'
  };
  try {
    await saveOrder(order);
    return res.status(201).json({ orderNumber: order.orderNumber, subtotal: order.subtotal, status: 'received' });
  } catch (err) {
    console.error('Failed to save order:', err);
    return res.status(503).json({ error: 'Order could not be saved. Please call the store instead.' });
  }
});

// Card payments: only non-age-restricted items, with Stripe-hosted checkout.
app.post('/api/card-checkout', async (req,res) => {
  if (!stripe || !process.env.PUBLIC_BASE_URL || !process.env.STRIPE_WEBHOOK_SECRET)
    return res.status(503).json({error:'Online card payment is not configured. Please choose pay at pickup.'});
  const {customer,items,notes} = req.body || {};
  if (!customer || !validText(customer.name) || !validText(customer.phone,35) ||
      !/^[+\d().\s-]{7,35}$/.test(customer.phone.trim()) ||
      !Array.isArray(items) || items.length<1 || items.length>30 ||
      (notes!==undefined && (typeof notes!=='string' || notes.length>500)))
    return res.status(400).json({error:'Please enter a valid name, phone and cart.'});
  const chosen=[];
  for (const item of items) {
    const found=menu.find(m=>m.id===item?.id);
    if (!found || found.inStoreOnly || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>20)
      return res.status(400).json({error:'Age-restricted or invalid items cannot be ordered online.'});
    chosen.push({id:found.id,name:found.name,quantity:item.quantity,unitPrice:found.price,lineTotal:money(found.price*item.quantity)});
  }
  const subtotal=money(chosen.reduce((a,b)=>a+b.lineTotal,0));
  if(subtotal>1000)return res.status(400).json({error:'Please call the store for large orders.'});
  const orderNumber=`CJ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const order={orderNumber,createdAt:new Date().toISOString(),status:'awaiting_payment',
    customer:{name:customer.name.trim(),phone:customer.phone.trim()},items:chosen,
    notes:(notes||'').trim(),subtotal,paymentMethod:'Card checkout pending',fulfillment:'Pickup'};
  try {
    const base=process.env.PUBLIC_BASE_URL.replace(/\/$/,'');
    if(!/^https:\/\//.test(base))return res.status(503).json({error:'Secure checkout base URL is not configured.'});
    await saveOrder(order);
    const session=await stripe.checkout.sessions.create({
      mode:'payment',line_items:chosen.map(item=>({price_data:{currency:'usd',unit_amount:Math.round(item.unitPrice*100),product_data:{name:item.name}},quantity:item.quantity})),
      success_url:`${base}/?payment=return&order=${encodeURIComponent(orderNumber)}`,
      cancel_url:`${base}/?payment=cancel`,
      metadata:{orderNumber},client_reference_id:orderNumber,
      phone_number_collection:{enabled:false}
    });
    return res.json({checkoutUrl:session.url});
  } catch(err) {console.error('Card checkout error:',err);return res.status(503).json({error:'Card checkout unavailable. Choose pay at pickup instead.'});}
});

// Optional owner-only order viewing. Set ADMIN_TOKEN in the environment.
app.get('/api/admin/orders', async (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.get('x-admin-token') !== process.env.ADMIN_TOKEN) {
    return res.sendStatus(403);
  }
  try {
    let orders;
    if (ordersCollection) orders = await ordersCollection.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(100).toArray();
    else {
      try { orders = JSON.parse(await fs.readFile(orderPath, 'utf8')).reverse().slice(0, 100); }
      catch (err) { if (err.code !== 'ENOENT') throw err; orders = []; }
    }
    res.json(orders);
  } catch { res.status(500).json({ error: 'Could not load orders.' }); }
});

async function start() {
  if (process.env.MONGODB_URI) {
    const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    ordersCollection = client.db(process.env.MONGODB_DB || 'cjs_orders').collection('orders');
    console.log('Connected to MongoDB: orders will be stored persistently.');
  } else {
    console.warn('MONGODB_URI not set: using local JSON orders. Configure MongoDB before deploying to Render.');
  }
  app.listen(PORT, () => console.log(`C.J.'s website running at http://localhost:${PORT}`));
}
start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
