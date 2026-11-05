const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
const b64url=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const ROLE_PERMISSIONS={
  super_admin:["students.read","students.create","students.update","students.archive","admins.read","admins.create","admins.update","badges.read","badges.manage","support.read","support.manage","audit.read"],
  admin:["students.read","students.create","students.update","students.archive","badges.read","badges.manage","support.read","support.manage"],
  viewer:["students.read","badges.read","support.read"],
  support:["support.read","support.manage"]
};
class HttpError extends Error{constructor(message,status=400){super(message);this.status=status}}
async function verifyAccess(request,env){
  const token=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)throw new HttpError("School sign-in is required",401);
  const parts=token.split(".");if(parts.length!==3)throw new HttpError("Invalid Access token",401);
  let header,claims;try{header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])))}catch{throw new HttpError("Invalid Access token",401)}
  const issuer="https://"+env.ACCESS_TEAM_DOMAIN;
  if(claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(env.ACCESS_AUD)||!claims.sub||claims.exp<Date.now()/1000)throw new HttpError("Access token claims rejected",401);
  const response=await fetch(issuer+"/cdn-cgi/access/certs");
  if(!response.ok)throw new HttpError("Identity verification is temporarily unavailable",503);
  const keys=(await response.json()).keys||[],jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk||header.alg!=="RS256")throw new HttpError("Untrusted signing key",401);
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64url(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  if(!valid)throw new HttpError("Access signature rejected",401);
  return {sub:claims.sub,email:claims.email||null};
}
async function actorFor(request,env){
  const identity=await verifyAccess(request,env);
  const user=await env.DB.prepare("SELECT id,role,school_id,display_name,active FROM administrators WHERE access_sub=?").bind(identity.sub).first();
  if(!user||!user.active)throw new HttpError("Your account is not authorized. Ask your school administrator.",403);
  return {...user,identity};
}
async function can(env,user,permission){
  const override=await env.DB.prepare("SELECT allowed FROM permission_overrides WHERE admin_id=? AND permission=?").bind(user.id,permission).first();
  if(override)return override.allowed===1;
  return (ROLE_PERMISSIONS[user.role]||[]).includes(permission);
}
async function need(env,user,permission){if(!await can(env,user,permission))throw new HttpError("Permission denied: "+permission,403)}
async function audit(env,user,action,entityType,entityId,details={}){
  await env.DB.prepare("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?)").bind(user.id,action,entityType,entityId,JSON.stringify(details),now()).run();
}
const clean=(v,max=120)=>typeof v==="string"?v.trim().slice(0,max):"";
async function bodyOf(request){const b=await request.json().catch(()=>null);if(!b||typeof b!=="object"||Array.isArray(b))throw new HttpError("A valid JSON object is required");return b}
async function studentsApi(request,env,user,url){
  const method=request.method,parts=url.pathname.split("/").filter(Boolean),studentId=parts[2]?decodeURIComponent(parts[2]):null;
  if(method==="GET"&&!studentId){
    await need(env,user,"students.read");
    const q=clean(url.searchParams.get("q"),100),status=url.searchParams.get("status")||"active",page=Math.max(1,Math.min(10000,Number(url.searchParams.get("page"))||1)),limit=Math.max(1,Math.min(50,Number(url.searchParams.get("limit"))||20)),offset=(page-1)*limit;
    if(!["active","archived","all"].includes(status))throw new HttpError("Invalid status filter");
    const where=["school_id=?"],args=[user.school_id];if(status!=="all"){where.push("status=?");args.push(status)}
    if(q){where.push("(instr(lower(student_id),lower(?))>0 OR instr(lower(first_name),lower(?))>0 OR instr(lower(last_name),lower(?))>0 OR instr(lower(grade),lower(?))>0 OR instr(lower(section),lower(?))>0)");args.push(q,q,q,q,q)}
    const clause=where.join(" AND ");
    const [count,active,archived,items]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) n FROM students WHERE "+clause).bind(...args).first(),
      env.DB.prepare("SELECT COUNT(*) n FROM students WHERE school_id=? AND status='active'").bind(user.school_id).first(),
      env.DB.prepare("SELECT COUNT(*) n FROM students WHERE school_id=? AND status='archived'").bind(user.school_id).first(),
      env.DB.prepare("SELECT student_id,first_name,last_name,grade,section,school_name,status FROM students WHERE "+clause+" ORDER BY last_name,first_name LIMIT ? OFFSET ?").bind(...args,limit,offset).all()
    ]);
    return json({total:count.n,active:active.n,archived:archived.n,page,limit,items:items.results||[]});
  }
  if(method==="POST"&&!studentId){
    await need(env,user,"students.create");const b=await bodyOf(request);
    const student_id=clean(b.student_id,80),first=clean(b.first_name,80),last=clean(b.last_name,80),grade=clean(b.grade,40);
    if(!student_id||!first||!last||!grade)throw new HttpError("Student ID, first name, last name and grade are required");
    try{await env.DB.prepare("INSERT INTO students(student_id,school_id,first_name,last_name,grade,section,school_name,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'active',?,?)").bind(student_id,user.school_id,first,last,grade,clean(b.section,40),clean(b.school_name,120),now(),now()).run()}catch{throw new HttpError("Could not create record. Check for a duplicate Student ID.",409)}
    await audit(env,user,"student.created","student",student_id);return json({ok:true,student_id},201);
  }
  if(studentId&&method==="PATCH"){
    const b=await bodyOf(request),allowed=["first_name","last_name","grade","section","school_name","status"];
    const updates=[];const args=[];
    for(const field of allowed)if(Object.hasOwn(b,field)){
      if(field==="status"){await need(env,user,"students.archive");if(!["active","archived"].includes(b[field]))throw new HttpError("Invalid status")}
      else await need(env,user,"students.update");
      const max=field==="school_name"?120:80;const value=clean(b[field],max);if(!value)throw new HttpError("Invalid "+field);
      updates.push(field+"=?");args.push(value);
    }
    if(!updates.length)throw new HttpError("No supported fields supplied");
    updates.push("updated_at=?");args.push(now(),user.school_id,studentId);
    const result=await env.DB.prepare("UPDATE students SET "+updates.join(",")+" WHERE school_id=? AND student_id=?").bind(...args).run();
    if(!result.meta?.changes)throw new HttpError("Student not found",404);
    await audit(env,user,"student.updated","student",studentId,{fields:allowed.filter(k=>Object.hasOwn(b,k))});return json({ok:true});
  }
  throw new HttpError("Student route not found",404);
}
async function adminsApi(request,env,user,url){
  const parts=url.pathname.split("/").filter(Boolean),target=parts[2]||null;
  if(request.method==="GET"&&!target){await need(env,user,"admins.read");const rows=await env.DB.prepare("SELECT id,display_name,role,active,created_at,last_seen_at FROM administrators WHERE school_id=? ORDER BY display_name").bind(user.school_id).all();return json({items:rows.results||[]})}
  if(request.method==="POST"&&!target){
    await need(env,user,"admins.create");if(user.role!=="super_admin")throw new HttpError("Only the Super Admin can add administrators",403);
    const b=await bodyOf(request),subject=clean(b.access_sub,250),name=clean(b.display_name,100),role=clean(b.role,30);
    if(!subject||!name||!["admin","viewer","support"].includes(role))throw new HttpError("Provide Access identity subject, display name and a permitted role");
    const newId=id();try{await env.DB.prepare("INSERT INTO administrators(id,access_sub,display_name,role,school_id,active,created_at) VALUES(?,?,?,?,?,1,?)").bind(newId,subject,name,role,user.school_id,now()).run()}catch{throw new HttpError("Could not add administrator; the Access identity may already be registered",409)}
    await audit(env,user,"admin.created","administrator",newId,{role});return json({ok:true,id:newId},201);
  }
  if(request.method==="PATCH"&&target){
    await need(env,user,"admins.update");if(user.role!=="super_admin")throw new HttpError("Only the Super Admin can change administrator access",403);
    if(target===user.id)throw new HttpError("You cannot change your own administrator account");
    const b=await bodyOf(request),updates=[],args=[];
    if(Object.hasOwn(b,"role")){if(!["admin","viewer","support"].includes(b.role))throw new HttpError("Invalid administrator role");updates.push("role=?");args.push(b.role)}
    if(Object.hasOwn(b,"active")){if(typeof b.active!=="boolean")throw new HttpError("active must be true or false");updates.push("active=?");args.push(b.active?1:0)}
    if(!updates.length)throw new HttpError("No supported changes supplied");
    args.push(user.school_id,target);const result=await env.DB.prepare("UPDATE administrators SET "+updates.join(",")+" WHERE school_id=? AND id=?").bind(...args).run();
    if(!result.meta?.changes)throw new HttpError("Administrator not found",404);
    await audit(env,user,"admin.updated","administrator",target,{role:b.role,active:b.active});return json({ok:true});
  }
  throw new HttpError("Administrator route not found",404);
}
async function badgesApi(request,env,user,url){
  const parts=url.pathname.split("/").filter(Boolean);
  if(request.method==="GET"&&parts.length===2){await need(env,user,"badges.read");const rows=await env.DB.prepare("SELECT id,name,description,color,created_at FROM badges WHERE school_id=? ORDER BY name").bind(user.school_id).all();return json({items:rows.results||[]})}
  if(request.method==="POST"&&parts.length===2){
    await need(env,user,"badges.manage");const b=await bodyOf(request),name=clean(b.name,70),description=clean(b.description,240),color=clean(b.color,7);
    if(!name||!/^#[0-9a-fA-F]{6}$/.test(color))throw new HttpError("Badge name and a valid hex color are required");
    const badgeId=id();await env.DB.prepare("INSERT INTO badges(id,school_id,name,description,color,created_at) VALUES(?,?,?,?,?,?)").bind(badgeId,user.school_id,name,description,color,now()).run();await audit(env,user,"badge.created","badge",badgeId,{name});return json({ok:true,id:badgeId},201);
  }
  if(request.method==="POST"&&parts.length===4&&parts[2]==="students"){
    await need(env,user,"badges.manage");const studentId=decodeURIComponent(parts[3]),b=await bodyOf(request),badgeId=clean(b.badge_id,80),reason=clean(b.reason,250);
    const badge=await env.DB.prepare("SELECT id FROM badges WHERE id=? AND school_id=?").bind(badgeId,user.school_id).first();if(!badge)throw new HttpError("Badge not found",404);
    const student=await env.DB.prepare("SELECT student_id FROM students WHERE student_id=? AND school_id=?").bind(studentId,user.school_id).first();if(!student)throw new HttpError("Student not found",404);
    const eventId=id();await env.DB.prepare("INSERT INTO student_badges(id,school_id,student_id,badge_id,issuer_admin_id,reason,issued_at) VALUES(?,?,?,?,?,?,?)").bind(eventId,user.school_id,studentId,badgeId,user.id,reason,now()).run();
    await env.DB.prepare("INSERT INTO badge_events(id,school_id,student_id,badge_id,action,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id(),user.school_id,studentId,badgeId,"issued",user.id,reason,now()).run();
    await audit(env,user,"badge.issued","student",studentId,{badge_id:badgeId});return json({ok:true,id:eventId},201);
  }
  if(request.method==="GET"&&parts.length===4&&parts[2]==="students"){
    await need(env,user,"badges.read");const studentId=decodeURIComponent(parts[3]);const rows=await env.DB.prepare("SELECT sb.id,sb.reason,sb.issued_at,sb.expires_at,b.name,b.description,b.color FROM student_badges sb JOIN badges b ON b.id=sb.badge_id WHERE sb.school_id=? AND sb.student_id=? AND sb.revoked_at IS NULL ORDER BY sb.issued_at DESC").bind(user.school_id,studentId).all();return json({items:rows.results||[]});
  }
  throw new HttpError("Badge route not found",404);
}
async function supportApi(request,env,user,url){
  const parts=url.pathname.split("/").filter(Boolean),ticketId=parts[2]||null;
  if(request.method==="GET"&&!ticketId){await need(env,user,"support.read");const rows=await env.DB.prepare("SELECT id,category,subject,status,priority,requester_type,created_at,updated_at FROM support_tickets WHERE school_id=? ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,updated_at DESC LIMIT 100").bind(user.school_id).all();return json({items:rows.results||[]})}
  if(request.method==="POST"&&!ticketId){
    await need(env,user,"support.manage");const b=await bodyOf(request),category=clean(b.category,40),subject=clean(b.subject,120),description=clean(b.description,3000),requester=clean(b.requester_type,30)||"school_staff";
    if(!category||!subject||!description||!["student","parent_guardian","teacher","administrator","school","technical_support","school_staff"].includes(requester))throw new HttpError("Category, subject and description are required");
    const ticket=id();await env.DB.prepare("INSERT INTO support_tickets(id,school_id,requester_admin_id,category,subject,status,priority,created_at,updated_at,requester_type,description) VALUES(?,?,?,?,?,'open','normal',?,?,?,?)").bind(ticket,user.school_id,user.id,category,subject,now(),now(),requester,description).run();
    await audit(env,user,"support.ticket.created","support_ticket",ticket);return json({ok:true,id:ticket},201);
  }
  if(request.method==="PATCH"&&ticketId){
    await need(env,user,"support.manage");const b=await bodyOf(request),updates=[],args=[];
    if(Object.hasOwn(b,"status")){if(!["open","in_progress","waiting","resolved","closed"].includes(b.status))throw new HttpError("Invalid ticket status");updates.push("status=?");args.push(b.status)}
    if(Object.hasOwn(b,"priority")){if(!["low","normal","high","urgent"].includes(b.priority))throw new HttpError("Invalid priority");updates.push("priority=?");args.push(b.priority)}
    if(Object.hasOwn(b,"assigned_admin_id")){const assignee=clean(b.assigned_admin_id,80);if(assignee){const valid=await env.DB.prepare("SELECT id FROM administrators WHERE id=? AND school_id=? AND active=1").bind(assignee,user.school_id).first();if(!valid)throw new HttpError("Assignee is not an active administrator")}updates.push("assigned_admin_id=?");args.push(assignee||null)}
    if(!updates.length)throw new HttpError("No supported ticket changes supplied");
    updates.push("updated_at=?");args.push(now(),user.school_id,ticketId);
    const result=await env.DB.prepare("UPDATE support_tickets SET "+updates.join(",")+" WHERE school_id=? AND id=?").bind(...args).run();if(!result.meta?.changes)throw new HttpError("Ticket not found",404);
    await audit(env,user,"support.ticket.updated","support_ticket",ticketId,b);return json({ok:true});
  }
  throw new HttpError("Support route not found",404);
}
async function handleApi(request,env){
  if(!env.DB)throw new HttpError("D1 database binding DB is not configured",503);
  const url=new URL(request.url);if(url.pathname==="/api/health"&&request.method==="GET")return json({ok:true,service:"trueonly-api"});
  const user=await actorFor(request,env);
  if(url.pathname==="/api/me"&&request.method==="GET")return json({id:user.id,display_name:user.display_name,role:user.role,school_id:user.school_id});
  if(url.pathname.startsWith("/api/students"))return studentsApi(request,env,user,url);
  if(url.pathname.startsWith("/api/admins"))return adminsApi(request,env,user,url);
  if(url.pathname.startsWith("/api/badges"))return badgesApi(request,env,user,url);
  if(url.pathname.startsWith("/api/support"))return supportApi(request,env,user,url);
  if(url.pathname==="/api/audit"&&request.method==="GET"){await need(env,user,"audit.read");const rows=await env.DB.prepare("SELECT action,entity_type,entity_id,details_json,created_at FROM audit_log WHERE actor_id IN (SELECT id FROM administrators WHERE school_id=?) ORDER BY created_at DESC LIMIT 100").bind(user.school_id).all();return json({items:rows.results||[]})}
  throw new HttpError("Not found",404);
}
export default {async fetch(request,env){
  const url=new URL(request.url),headers={"content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'","x-frame-options":"DENY","permissions-policy":"camera=(), microphone=(), geolocation=()","strict-transport-security":"max-age=31536000; includeSubDomains"};
  if(url.pathname.startsWith("/api/")){
    try{const response=await handleApi(request,env);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response}
    catch(e){const status=e instanceof HttpError?e.status:500;return json({error:status===500?"Internal server error":e.message},status)}
  }
  if(env.ASSETS){const response=await env.ASSETS.fetch(request);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response}
  return new Response("TrueOnly static assets binding is not configured",{status:503,headers});
}};
