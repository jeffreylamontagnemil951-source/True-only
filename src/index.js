const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
const b64url=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
async function verifyAccess(request,env){
  const token=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)throw new Error("Access authentication required");
  const parts=token.split(".");if(parts.length!==3)throw new Error("Invalid Access token");
  const header=JSON.parse(new TextDecoder().decode(b64url(parts[0]))),claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  const issuer="https://"+env.ACCESS_TEAM_DOMAIN;
  if(claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.ACCESS_AUD)||!claims.sub||claims.exp<Date.now()/1000)throw new Error("Access token claims rejected");
  const certs=await fetch(issuer+"/cdn-cgi/access/certs",{cf:{cacheTtl:300}});
  if(!certs.ok)throw new Error("Could not verify identity provider");
  const keys=(await certs.json()).keys||[],jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk||header.alg!=="RS256")throw new Error("Untrusted signing key");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!valid)throw new Error("Access signature rejected");
  return {sub:claims.sub,email:claims.email||null};
}
async function actorFor(request,env){const identity=await verifyAccess(request,env);const user=await env.DB.prepare("SELECT id, role, school_id, display_name, active FROM administrators WHERE access_sub=?").bind(identity.sub).first();if(!user||!user.active)throw new Error("Your account is not authorized. Ask your school administrator.");return {...user,identity};}
function requireRole(user,roles){if(!roles.includes(user.role))throw new Error("Permission denied");}
async function audit(env,user,action,entityType,entityId,details={}){await env.DB.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,action,entityType,entityId,JSON.stringify(details),new Date().toISOString()).run()}
async function handleApi(request,env){
  if(!env.DB) return json({error:"Database binding DB is not configured"},503);
  let user;try{user=await actorFor(request,env)}catch(e){return json({error:e.message},401)}
  const url=new URL(request.url),method=request.method;
  if(url.pathname==="/api/me"&&method==="GET")return json({id:user.id,display_name:user.display_name,role:user.role,school_id:user.school_id});
  if(url.pathname==="/api/students"&&method==="GET"){
    requireRole(user,["super_admin","admin","viewer"]);
    const q=(url.searchParams.get("q")||"").trim().slice(0,100),status=url.searchParams.get("status")||"active",page=Math.max(1,Math.min(10000,Number(url.searchParams.get("page"))||1)),limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit"))||20)),offset=(page-1)*limit;
    if(!["active","archived","all"].includes(status))return json({error:"Invalid status filter"},400);
    const where=["school_id=?"];const args=[user.school_id];
    if(status!=="all"){where.push("status=?");args.push(status)}
    if(q){where.push("(instr(lower(student_id),lower(?))>0 OR instr(lower(first_name),lower(?))>0 OR instr(lower(last_name),lower(?))>0 OR instr(lower(grade),lower(?))>0 OR instr(lower(section),lower(?))>0)");args.push(q,q,q,q,q)}
    const clause=where.join(" AND ");
    const [count,active,archived,items]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE "+clause).bind(...args).first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE school_id=? AND status='active'").bind(user.school_id).first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM students WHERE school_id=? AND status='archived'").bind(user.school_id).first(),
      env.DB.prepare("SELECT student_id,first_name,last_name,grade,section,school_name,status FROM students WHERE "+clause+" ORDER BY last_name,first_name LIMIT ? OFFSET ?").bind(...args,limit,offset).all()
    ]);
    return json({total:count.n,active:active.n,archived:archived.n,page,limit,items:items.results||[]});
  }
  if(url.pathname==="/api/students"&&method==="POST"){
    requireRole(user,["super_admin","admin"]);
    const body=await request.json().catch(()=>null);if(!body)return json({error:"Invalid JSON"},400);
    const fields=["student_id","first_name","last_name","grade"];for(const f of fields)if(typeof body[f]!=="string"||!body[f].trim()||body[f].length>80)return json({error:"Missing or invalid "+f},400);
    const section=typeof body.section==="string"?body.section.slice(0,40):"",school=typeof body.school_name==="string"?body.school_name.slice(0,120):"";
    try{await env.DB.prepare("INSERT INTO students(student_id,school_id,first_name,last_name,grade,section,school_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',?,?)").bind(body.student_id.trim(),user.school_id,body.first_name.trim(),body.last_name.trim(),body.grade.trim(),section,school,new Date().toISOString(),new Date().toISOString()).run();await audit(env,user,"student.created","student",body.student_id.trim());return json({ok:true},201)}catch(e){return json({error:"Could not create record. Check for a duplicate Student ID."},409)}
  }
  if(url.pathname==="/api/health"&&method==="GET")return json({ok:true,service:"trueonly-api"});
  return json({error:"Not found"},404);
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  const headers={"content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'","x-frame-options":"DENY","permissions-policy":"camera=(), microphone=(), geolocation=()","strict-transport-security":"max-age=31536000; includeSubDomains"};
  if(url.pathname.startsWith("/api/")){
    if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:"trueonly-api"});
    try{const response=await handleApi(request,env);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response}catch(e){return json({error:e.message||"Internal error"},e.message==="Permission denied"?403:500)}
  }
  if(env.ASSETS){const response=await env.ASSETS.fetch(request);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response}
  return new Response("TrueOnly static assets binding is not configured",{status:503,headers});
}};
