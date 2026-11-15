require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(helmet());
app.use(cors({ origin: (process.env.FRONTEND_ORIGIN || "").split(",").map(x=>x.trim()), credentials: false }));
app.use(express.json({ limit: "1mb" }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const fail = (res, status, error) => res.status(status).json({ error });
const moneyTotal = items => items.reduce((sum,x)=>sum+x.unit_price*x.quantity,0);

async function auth(req,res,next){
  const token=(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!token)return fail(res,401,"Sign in required");
  const {data,error}=await supabase.auth.getUser(token);
  if(error||!data.user)return fail(res,401,"Invalid or expired session");
  req.user=data.user;next();
}
async function optionalAuth(req,res,next){
  const token=(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");
  if(token){
    const {data}=await supabase.auth.getUser(token);
    if(data?.user) req.user=data.user;
  }
  next();
}
async function admin(req,res,next){
  const {data,error}=await supabase.from("profiles").select("role").eq("id",req.user.id).single();
  if(error||data?.role!=="admin")return fail(res,403,"Admin access required");
  next();
}
app.get("/health",(_req,res)=>res.json({ok:true,service:"karthik-jewelry-api"}));
app.get("/api/products",async(req,res)=>{
  const {data,error}=await supabase.from("products").select("id,name,slug,category,description,price,compare_at_price,image_url,tag,stock,created_at").eq("active",true).order("created_at",{ascending:false});
  if(error)return fail(res,500,"Could not load products");
  res.json({products:data});
});
app.post("/api/orders",optionalAuth,async(req,res)=>{
  try{
    const {customer_name,phone,email,shipping_address,payment_method,items}=req.body||{};
    if(!customer_name||!phone||!email||!shipping_address?.line1||!shipping_address?.city||!shipping_address?.pincode||!Array.isArray(items)||!items.length)return fail(res,400,"Please complete all checkout details");
    if(!/^\d{10}$/.test(String(phone))||!/^\d{6}$/.test(String(shipping_address.pincode)))return fail(res,400,"Enter a valid Indian mobile number and PIN code");
    if(!["cod","online"].includes(payment_method))return fail(res,400,"Invalid payment method");
    if(payment_method==="online")return fail(res,501,"Online payment is not configured yet. Please choose COD or contact the store.");
    const ids=[...new Set(items.map(x=>String(x.product_id)))];
    const {data:products,error}=await supabase.from("products").select("id,name,price,stock,active").in("id",ids);
    if(error)return fail(res,500,"Could not validate cart");
    const map=new Map(products.map(p=>[String(p.id),p]));
    const clean=[];
    for(const item of items){
      const p=map.get(String(item.product_id)),qty=Number(item.quantity);
      if(!p||!p.active||!Number.isInteger(qty)||qty<1||qty>20)return fail(res,400,"One or more cart items are invalid");
      if(p.stock<qty)return fail(res,409,`${p.name} has insufficient stock`);
      clean.push({product_id:p.id,product_name:p.name,unit_price:Number(p.price),quantity:qty});
    }
    const total=moneyTotal(clean);
    const orderNumber="KJ"+Date.now().toString().slice(-9);
    const {data:order,error:orderError}=await supabase.from("orders").insert({
      order_number:orderNumber,user_id:req.user?.id||null,customer_name,phone,email,
      shipping_address,payment_method,status:"placed",payment_status:"pending",subtotal:total,total
    }).select().single();
    if(orderError)return fail(res,500,"Could not create order");
    const rows=clean.map(x=>({...x,order_id:order.id}));
    const {error:itemError}=await supabase.from("order_items").insert(rows);
    if(itemError){await supabase.from("orders").delete().eq("id",order.id);return fail(res,500,"Could not save order items");}
    // Stock reservation should be upgraded to a database transaction/RPC before high-volume production.
    for(const x of clean){const p=map.get(String(x.product_id));await supabase.from("products").update({stock:p.stock-x.quantity}).eq("id",p.id);}
    res.status(201).json({order,order_number:orderNumber});
  }catch(e){console.error(e);fail(res,500,"Unexpected order error");}
});
app.get("/api/my-orders",auth,async(req,res)=>{
  const {data,error}=await supabase.from("orders").select("id,order_number,status,total,created_at").eq("user_id",req.user.id).order("created_at",{ascending:false});
  if(error)return fail(res,500,"Could not load orders");res.json({orders:data});
});
app.get("/api/admin/orders",auth,admin,async(req,res)=>{
  const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,total,status,created_at").order("created_at",{ascending:false}).limit(100);
  if(error)return fail(res,500,"Could not load orders");res.json({orders:data});
});
app.post("/api/admin/products",auth,admin,async(req,res)=>{
  const {name,category,price,image_url,description,stock}=req.body||{};
  if(!name||!category||!Number.isFinite(Number(price))||Number(price)<=0)return fail(res,400,"Name, category and valid price are required");
  const slug=String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now().toString().slice(-5);
  const {data,error}=await supabase.from("products").insert({name,slug,category,price:Number(price),image_url:image_url||null,description:description||"",stock:Math.max(0,Number(stock)||0),active:true}).select().single();
  if(error)return fail(res,500,"Could not add product");res.status(201).json({product:data});
});
app.patch("/api/admin/products/:id",auth,admin,async(req,res)=>{
  const allowed=["name","category","description","price","compare_at_price","image_url","tag","stock","active"];
  const patch=Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>allowed.includes(k)));
  const {data,error}=await supabase.from("products").update(patch).eq("id",req.params.id).select().single();
  if(error)return fail(res,500,"Could not update product");res.json({product:data});
});
app.delete("/api/admin/products/:id",auth,admin,async(req,res)=>{
  const {error}=await supabase.from("products").update({active:false}).eq("id",req.params.id);
  if(error)return fail(res,500,"Could not archive product");res.json({ok:true});
});
app.post("/api/newsletter",async(req,res)=>{
  const email=String(req.body?.email||"").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail(res,400,"Enter a valid email");
  const {error}=await supabase.from("newsletter_subscribers").upsert({email},{onConflict:"email"});
  if(error)return fail(res,500,"Could not subscribe");res.status(201).json({ok:true});
});
app.use((err,_req,res,_next)=>{console.error(err);fail(res,500,"Server error");});
const port=process.env.PORT||10000;
app.listen(port,()=>console.log(`Karthik Jewelry API listening on ${port}`));
