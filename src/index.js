const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
const b64url=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const now=()=>new Date().toISOString();
const id=()=>crypto.randomUUID();
const ROLE_PERMISSIONS={
  super_admin:["students.read","students.create","students.update","students.archive","admins.read","admins.create","admins.update","admins.permissions","badges.read","badges.manage","support.read","support.manage","support.moderate","audit.read"],
  admin:["students.read","students.create","students.update","students.archive","admins.read","badges.read","badges.manage","support.read","support.manage","support.moderate"],
  viewer:["students.read","badges.read","support.read"],
  support:["support.read","support.manage"]
};
class HttpError extends Error{constructor(message,status=400){super(message);this.status=status}}
async function verifyAccess(request,env){
  const token=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)throw new HttpError("School sign-in is required",401);
  if(token.length>16384)throw new HttpError("Access token is too large",401);
  const parts=token.split(".");if(parts.length!==3)throw new HttpError("Invalid Access token",401);
  let header,claims;try{header=JSON.parse(new TextDecoder().decode(b64url(parts[0])));claims=JSON.parse(new TextDecoder().decode(b64url(parts[1])))}catch{throw new HttpError("Invalid Access token",401)}
  const issuer="https://"+env.ACCESS_TEAM_DOMAIN,clock=Date.now()/1000;
  const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(header.alg!=="RS256"||typeof header.kid!=="string"||claims.iss!==issuer||!audiences.includes(env.ACCESS_AUD)||typeof claims.sub!=="string"||!claims.sub||!Number.isFinite(claims.exp)||claims.exp<=clock||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>clock)))throw new HttpError("Access token claims rejected",401);
  const response=await fetch(issuer+"/cdn-cgi/access/certs");
  if(!response.ok)throw new HttpError("Identity verification is temporarily unavailable",503);
  const keys=(await response.json()).keys||[],jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk)throw new HttpError("Untrusted signing key",401);
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
async function bodyOf(request){
  const contentType=(request.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  if(contentType!=="application/json")throw new HttpError("Content-Type must be application/json",415);
  const declared=Number(request.headers.get("content-length")||0);
  if(declared>16384)throw new HttpError("Request body is too large",413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>16384)throw new HttpError("Request body is too large",413);
  let b;try{b=JSON.parse(raw||"null")}catch{throw new HttpError("A valid JSON object is required")}
  if(!b||typeof b!=="object"||Array.isArray(b))throw new HttpError("A valid JSON object is required");
  return b;
}
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
  if(studentId&&method==="GET"){
    await need(env,user,"students.read");
    const student=await env.DB.prepare("SELECT student_id,first_name,last_name,grade,section,school_name,status,created_at,updated_at FROM students WHERE school_id=? AND student_id=?").bind(user.school_id,studentId).first();
    if(!student)throw new HttpError("Student not found",404);
    return json({item:student});
  }
  if(studentId&&method==="PATCH"){
    const b=await bodyOf(request),allowed=["first_name","last_name","grade","section","school_name","status"];
    const updates=[];const args=[];
    for(const field of allowed)if(Object.hasOwn(b,field)){
      if(field==="status"){await need(env,user,"students.archive");if(!["active","archived"].includes(b[field]))throw new HttpError("Invalid status")}
      else await need(env,user,"students.update");
      const max=field==="school_name"?120:80;const value=clean(b[field],max);if(!value&&!["section","school_name"].includes(field))throw new HttpError("Invalid "+field);
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
  if(target&&parts.length===4&&parts[3]==="permissions"&&request.method==="GET"){
    await need(env,user,"admins.read");
    if(user.role!=="super_admin")throw new HttpError("Only the Super Admin can view permission overrides",403);
    const targetAdmin=await env.DB.prepare("SELECT id,role FROM administrators WHERE id=? AND school_id=?").bind(target,user.school_id).first();
    if(!targetAdmin)throw new HttpError("Administrator not found",404);
    const rows=await env.DB.prepare("SELECT permission,allowed FROM permission_overrides WHERE admin_id=? ORDER BY permission").bind(target).all();
    return json({role:targetAdmin.role,permissions:rows.results||[],catalog:["students.read","students.create","students.update","students.archive","admins.read","admins.create","admins.update","badges.read","badges.manage","support.read","support.manage","support.moderate","audit.read"]});
  }
  if(target&&parts.length===4&&parts[3]==="permissions"&&(request.method==="PUT"||request.method==="PATCH")){
    await need(env,user,"admins.permissions");
    if(user.role!=="super_admin")throw new HttpError("Only the Super Admin can change permissions",403);
    if(target===user.id)throw new HttpError("You cannot override your own permissions");
    const targetAdmin=await env.DB.prepare("SELECT id,role FROM administrators WHERE id=? AND school_id=?").bind(target,user.school_id).first();
    if(!targetAdmin)throw new HttpError("Administrator not found",404);
    if(targetAdmin.role==="super_admin")throw new HttpError("Super Admin permissions cannot be overridden");
    const b=await bodyOf(request),overrides=b.overrides;
    const catalog=["students.read","students.create","students.update","students.archive","admins.read","admins.create","admins.update","badges.read","badges.manage","support.read","support.manage","support.moderate","audit.read"];
    if(!overrides||typeof overrides!=="object"||Array.isArray(overrides))throw new HttpError("overrides must be an object");
    const entries=Object.entries(overrides);
    if(entries.some(([key,value])=>!catalog.includes(key)||!(typeof value==="boolean"||value===null)))throw new HttpError("Invalid permission override");
    for(const [permission,allowed] of entries){
      if(allowed===null){
        await env.DB.prepare("DELETE FROM permission_overrides WHERE admin_id=? AND permission=?").bind(target,permission).run();
      }else{
        await env.DB.prepare("INSERT INTO permission_overrides(admin_id,permission,allowed,granted_by,created_at) VALUES(?,?,?,?,?) ON CONFLICT(admin_id,permission) DO UPDATE SET allowed=excluded.allowed,granted_by=excluded.granted_by,created_at=excluded.created_at").bind(target,permission,allowed?1:0,user.id,now()).run();
      }
    }
    await audit(env,user,"admin.permissions.updated","administrator",target,{permissions:entries.map(([key,value])=>({permission:key,allowed:value}))});
    return json({ok:true});
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
    const duplicate=await env.DB.prepare("SELECT id FROM student_badges WHERE school_id=? AND student_id=? AND badge_id=? AND revoked_at IS NULL").bind(user.school_id,studentId,badgeId).first();
    if(duplicate)throw new HttpError("This badge is already active for the student",409);
    const eventId=id();await env.DB.prepare("INSERT INTO student_badges(id,school_id,student_id,badge_id,issuer_admin_id,reason,issued_at) VALUES(?,?,?,?,?,?,?)").bind(eventId,user.school_id,studentId,badgeId,user.id,reason,now()).run();
    await env.DB.prepare("INSERT INTO badge_events(id,school_id,student_id,badge_id,action,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id(),user.school_id,studentId,badgeId,"issued",user.id,reason,now()).run();
    await audit(env,user,"badge.issued","student",studentId,{badge_id:badgeId});return json({ok:true,id:eventId},201);
  }
  if(request.method==="DELETE"&&parts.length===5&&parts[2]==="students"){
    await need(env,user,"badges.manage");
    const studentId=decodeURIComponent(parts[3]),assignmentId=decodeURIComponent(parts[4]);
    const assignment=await env.DB.prepare("SELECT id,badge_id FROM student_badges WHERE id=? AND school_id=? AND student_id=? AND revoked_at IS NULL").bind(assignmentId,user.school_id,studentId).first();
    if(!assignment)throw new HttpError("Active badge assignment not found",404);
    await env.DB.prepare("UPDATE student_badges SET revoked_at=? WHERE id=? AND school_id=?").bind(now(),assignmentId,user.school_id).run();
    await env.DB.prepare("INSERT INTO badge_events(id,school_id,student_id,badge_id,action,actor_id,reason,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id(),user.school_id,studentId,assignment.badge_id,"revoked",user.id,"Revoked by administrator",now()).run();
    await audit(env,user,"badge.revoked","student",studentId,{assignment_id:assignmentId,badge_id:assignment.badge_id});
    return json({ok:true});
  }
  if(request.method==="GET"&&parts.length===4&&parts[2]==="students"){
    await need(env,user,"badges.read");const studentId=decodeURIComponent(parts[3]);const rows=await env.DB.prepare("SELECT sb.id,sb.reason,sb.issued_at,sb.expires_at,b.name,b.description,b.color FROM student_badges sb JOIN badges b ON b.id=sb.badge_id WHERE sb.school_id=? AND sb.student_id=? AND sb.revoked_at IS NULL ORDER BY sb.issued_at DESC").bind(user.school_id,studentId).all();return json({items:rows.results||[]});
  }
  throw new HttpError("Badge route not found",404);
}
export function canViewSupportTicket(u,t){return u.school_id===t.school_id&&(["super_admin","admin"].includes(u.role)||t.requester_admin_id===u.id||t.assigned_admin_id===u.id)}
export function supportMessageLimit(value){
 const n=value===null||value===undefined||value===""?50:Number(value);
 return Number.isInteger(n)?Math.max(1,Math.min(50,n)):50;
}
export function pageSupportMessages(rows,limit){
 const hasMore=rows.length>limit,messages=rows.slice(0,limit).reverse();
 return {messages,has_more:hasMore,next_before:hasMore?(messages[0]?.id||null):null};
}
function supportDb(env){const db=env.DB;return db&&typeof db.withSession==="function"?db.withSession("first-primary"):db}
export async function supportViewerAllowed(env,schoolId,ticketId,adminId){
 if(!env.DB)return false;
 const row=await supportDb(env).prepare("SELECT a.id FROM administrators a JOIN support_tickets t ON t.id=? AND t.school_id=? LEFT JOIN permission_overrides po ON po.admin_id=a.id AND po.permission='support.read' WHERE a.id=? AND a.school_id=t.school_id AND a.active=1 AND a.role IN ('super_admin','admin','viewer','support') AND COALESCE(po.allowed,1)=1 AND (a.role IN ('super_admin','admin') OR t.requester_admin_id=a.id OR t.assigned_admin_id=a.id) LIMIT 1").bind(ticketId,schoolId,adminId).first();
 return !!row;
}
async function authorizedSupportViewers(env,schoolId,ticketId){
 if(!env.DB)return new Set();
 const rows=await supportDb(env).prepare("SELECT a.id FROM administrators a JOIN support_tickets t ON t.id=? AND t.school_id=? LEFT JOIN permission_overrides po ON po.admin_id=a.id AND po.permission='support.read' WHERE a.school_id=t.school_id AND a.active=1 AND a.role IN ('super_admin','admin','viewer','support') AND COALESCE(po.allowed,1)=1 AND (a.role IN ('super_admin','admin') OR t.requester_admin_id=a.id OR t.assigned_admin_id=a.id)").bind(ticketId,schoolId).all();
 return new Set((rows.results||[]).map(row=>row.id));
}
async function supportApi(request,env,user,url){
 const p=url.pathname.split("/").filter(Boolean),tid=p[2]||null,sub=p[3]||null,lead=["super_admin","admin"].includes(user.role);
 const ticket=async()=>{const t=await env.DB.prepare("SELECT t.*,d.name AS department_name,a.display_name AS assignee_name FROM support_tickets t LEFT JOIN support_departments d ON d.id=t.department_id AND d.school_id=t.school_id LEFT JOIN administrators a ON a.id=t.assigned_admin_id AND a.school_id=t.school_id WHERE t.id=? AND t.school_id=?").bind(tid,user.school_id).first();if(!t||!canViewSupportTicket(user,t))throw new HttpError("Ticket not found",404);return t};
 if(p.length===3&&p[2]==="departments"){
  if(request.method==="GET"){await need(env,user,"support.read");const r=await env.DB.prepare("SELECT id,name,description FROM support_departments WHERE school_id=? AND active=1 ORDER BY name").bind(user.school_id).all();return json({items:r.results||[]})}
  if(request.method==="POST"){await need(env,user,"support.manage");if(!lead)throw new HttpError("Administrator access required",403);const b=await bodyOf(request),name=clean(b.name,70);if(!name)throw new HttpError("Department name required");const did=id();try{await env.DB.prepare("INSERT INTO support_departments(id,school_id,name,description,created_at) VALUES(?,?,?,?,?)").bind(did,user.school_id,name,clean(b.description,240),now()).run()}catch{throw new HttpError("Department already exists",409)}await audit(env,user,"support.department.created","support_department",did,{name});return json({ok:true,id:did},201)}
 }
 if(p.length===3&&p[2]==="reports"&&request.method==="GET"){await need(env,user,"support.moderate");if(!lead)throw new HttpError("Administrator access required",403);const r=await env.DB.prepare("SELECT id,ticket_id,message_id,reason,status,created_at FROM support_reports WHERE school_id=? ORDER BY created_at DESC LIMIT 100").bind(user.school_id).all();return json({items:r.results||[]})}
 if(p.length===4&&p[2]==="reports"&&request.method==="PATCH"){await need(env,user,"support.moderate");if(!lead)throw new HttpError("Administrator access required",403);const b=await bodyOf(request);if(!["reviewed","dismissed"].includes(b.status))throw new HttpError("Invalid report status");const r=await env.DB.prepare("UPDATE support_reports SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND school_id=?").bind(b.status,user.id,now(),p[3],user.school_id).run();if(!r.meta?.changes)throw new HttpError("Report not found",404);await audit(env,user,"support.report.reviewed","support_report",p[3],{status:b.status});return json({ok:true})}
 if(request.method==="GET"&&!tid){await need(env,user,"support.read");const scope=lead?"t.school_id=?":"t.school_id=? AND (t.requester_admin_id=? OR t.assigned_admin_id=?)",args=lead?[user.school_id]:[user.school_id,user.id,user.id];const r=await env.DB.prepare("SELECT t.id,t.category,t.subject,t.status,t.priority,t.department_id,d.name AS department_name,t.assigned_admin_id,a.display_name AS assignee_name,t.created_at,t.updated_at FROM support_tickets t LEFT JOIN support_departments d ON d.id=t.department_id AND d.school_id=t.school_id LEFT JOIN administrators a ON a.id=t.assigned_admin_id AND a.school_id=t.school_id WHERE "+scope+" ORDER BY t.updated_at DESC LIMIT 100").bind(...args).all();return json({items:r.results||[]})}
 if(request.method==="POST"&&!tid){await need(env,user,"support.manage");const b=await bodyOf(request),subject=clean(b.subject,120),category=clean(b.category,40),desc=clean(b.description,3000),dept=clean(b.department_id,80)||null,requester=clean(b.requester_type,30)||"school_staff";if(!subject||!category||!desc||!["student","parent_guardian","teacher","administrator","school","technical_support","school_staff"].includes(requester))throw new HttpError("Subject, category, requester type and description are required");if(dept&&!await env.DB.prepare("SELECT id FROM support_departments WHERE id=? AND school_id=? AND active=1").bind(dept,user.school_id).first())throw new HttpError("Department not found",404);const idv=id(),ts=now();await env.DB.prepare("INSERT INTO support_tickets(id,school_id,requester_admin_id,category,subject,status,priority,created_at,updated_at,requester_type,description,department_id) VALUES(?,?,?,?,?,'open','normal',?,?,?,?,?)").bind(idv,user.school_id,user.id,category,subject,ts,ts,requester,desc,dept).run();await env.DB.prepare("INSERT INTO support_messages(id,ticket_id,sender_admin_id,body,created_at) VALUES(?,?,?,?,?)").bind(id(),idv,user.id,desc,ts).run();await audit(env,user,"support.ticket.created","support_ticket",idv,{department_id:dept});return json({ok:true,id:idv},201)}
 if(!tid)throw new HttpError("Support route not found",404);
 if(p.length===3&&request.method==="GET"){
  await need(env,user,"support.read");const t=await ticket(),limit=supportMessageLimit(url.searchParams.get("limit")),before=clean(url.searchParams.get("before"),80);
  const select="SELECT m.id,m.body,m.created_at,m.sender_admin_id,a.display_name AS sender_name FROM support_messages m LEFT JOIN administrators a ON a.id=m.sender_admin_id ";
  let rows;
  if(before){
   const cursor=await env.DB.prepare("SELECT created_at,id FROM support_messages WHERE id=? AND ticket_id=?").bind(before,tid).first();
   if(!cursor)throw new HttpError("Invalid message history cursor",400);
   rows=await env.DB.prepare(select+"WHERE m.ticket_id=? AND (m.created_at<? OR (m.created_at=? AND m.id<?)) ORDER BY m.created_at DESC,m.id DESC LIMIT ?").bind(tid,cursor.created_at,cursor.created_at,cursor.id,limit+1).all();
  }else{
   rows=await env.DB.prepare(select+"WHERE m.ticket_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT ?").bind(tid,limit+1).all();
  }
  return json({ticket:t,...pageSupportMessages(rows.results||[],limit)});
 }
 if(p.length===4&&sub==="live"&&request.method==="GET"){await need(env,user,"support.read");await ticket();if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")throw new HttpError("WebSocket upgrade required",426);if(!env.SUPPORT_ROOMS)throw new HttpError("SUPPORT_ROOMS binding is not configured",503);const stub=env.SUPPORT_ROOMS.get(env.SUPPORT_ROOMS.idFromName(user.school_id+":"+tid)),h=new Headers(request.headers);h.set("x-trueonly-school",user.school_id);h.set("x-trueonly-ticket",tid);h.set("x-trueonly-admin",user.id);return stub.fetch(new Request(request,{headers:h}))}
 if(p.length===4&&sub==="messages"&&request.method==="POST"){await need(env,user,"support.read");await need(env,user,"support.manage");const t=await ticket();if(t.status==="closed")throw new HttpError("Ticket is closed",409);const b=await bodyOf(request),body=typeof b.body==="string"?b.body.trim():"";if(!body||body.length>4000)throw new HttpError("Message must be 1-4000 characters");const mid=id(),ts=now();await env.DB.prepare("INSERT INTO support_messages(id,ticket_id,sender_admin_id,body,created_at) VALUES(?,?,?,?,?)").bind(mid,tid,user.id,body,ts).run();await env.DB.prepare("UPDATE support_tickets SET updated_at=?,status=CASE WHEN status='resolved' THEN 'in_progress' ELSE status END WHERE id=? AND school_id=?").bind(ts,tid,user.school_id).run();await audit(env,user,"support.message.created","support_ticket",tid,{message_id:mid});if(env.SUPPORT_ROOMS){try{const room=env.SUPPORT_ROOMS.get(env.SUPPORT_ROOMS.idFromName(user.school_id+":"+tid));await room.fetch(new Request("https://room/publish",{method:"POST",headers:{"content-type":"application/json","x-trueonly-school":user.school_id,"x-trueonly-ticket":tid},body:JSON.stringify({type:"message.created",message:{id:mid}})}))}catch{}}return json({ok:true,id:mid},201)}
 if(p.length===4&&sub==="reports"&&request.method==="POST"){await need(env,user,"support.read");await ticket();const b=await bodyOf(request),mid=clean(b.message_id,80),reason=clean(b.reason,500);if(!mid||!reason)throw new HttpError("Message ID and reason required");if(!await env.DB.prepare("SELECT id FROM support_messages WHERE id=? AND ticket_id=?").bind(mid,tid).first())throw new HttpError("Message not found",404);const rid=id();await env.DB.prepare("INSERT INTO support_reports(id,school_id,ticket_id,message_id,reporter_admin_id,reason,created_at) VALUES(?,?,?,?,?,?,?)").bind(rid,user.school_id,tid,mid,user.id,reason,now()).run();await audit(env,user,"support.message.reported","support_message",mid,{report_id:rid});return json({ok:true,id:rid},201)}
 if(request.method==="PATCH"&&p.length===3){await need(env,user,"support.read");await need(env,user,"support.manage");await ticket();const b=await bodyOf(request),u=[],a=[];if(Object.hasOwn(b,"status")){if(!["open","in_progress","waiting","resolved","closed"].includes(b.status))throw new HttpError("Invalid status");u.push("status=?");a.push(b.status)}if(Object.hasOwn(b,"priority")){if(!["low","normal","high","urgent"].includes(b.priority))throw new HttpError("Invalid priority");u.push("priority=?");a.push(b.priority)}if(Object.hasOwn(b,"assigned_admin_id")||Object.hasOwn(b,"department_id")){if(!lead)throw new HttpError("Only administrators can reassign",403);if(Object.hasOwn(b,"assigned_admin_id")){const x=clean(b.assigned_admin_id,80);if(x&&!await env.DB.prepare("SELECT id FROM administrators WHERE id=? AND school_id=? AND active=1 AND role IN ('super_admin','admin','support')").bind(x,user.school_id).first())throw new HttpError("Assignee not found",404);u.push("assigned_admin_id=?");a.push(x||null)}if(Object.hasOwn(b,"department_id")){const x=clean(b.department_id,80);if(x&&!await env.DB.prepare("SELECT id FROM support_departments WHERE id=? AND school_id=? AND active=1").bind(x,user.school_id).first())throw new HttpError("Department not found",404);u.push("department_id=?");a.push(x||null)}}if(!u.length)throw new HttpError("No changes supplied");u.push("updated_at=?");a.push(now(),user.school_id,tid);const r=await env.DB.prepare("UPDATE support_tickets SET "+u.join(",")+" WHERE school_id=? AND id=?").bind(...a).run();if(!r.meta?.changes)throw new HttpError("Ticket not found",404);await audit(env,user,"support.ticket.updated","support_ticket",tid,{status:b.status,priority:b.priority,assigned_admin_id:b.assigned_admin_id,department_id:b.department_id});return json({ok:true})}
 throw new HttpError("Support route not found",404);
}
async function handleApi(request,env){
  const url=new URL(request.url);if(url.pathname==="/api/health"){if(request.method!=="GET")throw new HttpError("Method not allowed",405);return json({ok:true,service:"trueonly-api"});}
  if(["POST","PUT","PATCH","DELETE"].includes(request.method)){
    const origin=request.headers.get("Origin");
    if(!origin||origin!==url.origin||request.headers.get("Sec-Fetch-Site")==="cross-site")throw new HttpError("Cross-origin requests are not allowed",403);
  }
  if(!env.DB)throw new HttpError("D1 database binding DB is not configured",503);
  const user=await actorFor(request,env);
  if(url.pathname==="/api/me"&&request.method==="GET")return json({id:user.id,display_name:user.display_name,role:user.role,school_id:user.school_id});
  if(url.pathname.startsWith("/api/students"))return studentsApi(request,env,user,url);
  if(url.pathname.startsWith("/api/admins"))return adminsApi(request,env,user,url);
  if(url.pathname.startsWith("/api/badges"))return badgesApi(request,env,user,url);
  if(url.pathname.startsWith("/api/support"))return supportApi(request,env,user,url);
  if(url.pathname==="/api/audit"&&request.method==="GET"){await need(env,user,"audit.read");const rows=await env.DB.prepare("SELECT action,entity_type,entity_id,details_json,created_at FROM audit_log WHERE actor_id IN (SELECT id FROM administrators WHERE school_id=?) ORDER BY created_at DESC LIMIT 100").bind(user.school_id).all();return json({items:rows.results||[]})}
  throw new HttpError("Not found",404);
}
export class SupportRoom{
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==="/publish"){
   if(request.method!=="POST")return new Response("Method not allowed",{status:405});
   const school=request.headers.get("x-trueonly-school"),ticket=request.headers.get("x-trueonly-ticket");
   if(!school||!ticket)return json({error:"Invalid room scope"},400);
   if(!this.env.DB)return json({error:"D1 binding is unavailable"},503);
   const event=await request.json().catch(()=>null),messageId=typeof event?.message?.id==="string"?event.message.id:"";
   if(event?.type!=="message.created"||!messageId||messageId.length>80)return json({error:"Invalid event"},400);
   const exists=await supportDb(this.env).prepare("SELECT m.id FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE m.id=? AND m.ticket_id=? AND t.school_id=?").bind(messageId,ticket,school).first();
   if(!exists)return new Response("Message not found",{status:404});
   const sockets=this.ctx.getWebSockets().filter(ws=>{const a=ws.deserializeAttachment();return a?.school_id===school&&a?.ticket_id===ticket});
   const allowed=await authorizedSupportViewers(this.env,school,ticket);
   const payload=JSON.stringify({type:"message.created",message:{id:messageId}});
   for(const ws of sockets){
    const a=ws.deserializeAttachment();
    if(!allowed.has(a?.admin_id)){try{ws.close(1008,"Authorization changed")}catch{};continue}
    try{ws.send(payload)}catch{}
   }
   return new Response(null,{status:204});
  }
  if(url.pathname==="/connect"||url.pathname.endsWith("/live")){
   if(request.method!=="GET")return new Response("Method not allowed",{status:405});
   if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket")return new Response("Upgrade required",{status:426});
   const school=request.headers.get("x-trueonly-school"),ticket=request.headers.get("x-trueonly-ticket"),admin=request.headers.get("x-trueonly-admin");
   if(!school||!ticket||!admin)return new Response("Invalid room scope",{status:400});
   if(!this.env.DB)return new Response("D1 binding is unavailable",{status:503});
   if(!await supportViewerAllowed(this.env,school,ticket,admin))return new Response("Support access is no longer authorized",{status:403});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server);server.serializeAttachment({school_id:school,ticket_id:ticket,admin_id:admin});
   return new Response(null,{status:101,webSocket:client});
  }
  return new Response("Not found",{status:404});
 }
 async webSocketMessage(ws,message){try{ws.send(JSON.stringify({type:"error",code:"send_messages_over_api"}))}catch{}}
 async webSocketClose(ws,code,reason,clean){}
}

export default {async fetch(request,env){
  const url=new URL(request.url),headers={"content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'","x-frame-options":"DENY","permissions-policy":"camera=(), microphone=(), geolocation=()","strict-transport-security":"max-age=31536000; includeSubDomains"};
  if(url.pathname.startsWith("/api/")){
    try{const response=await handleApi(request,env);if(response.status!==101)for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response}
    catch(e){const status=e instanceof HttpError?e.status:500;return json({error:status===500?"Internal server error":e.message},status)}
  }
  if(env.ASSETS){const response=await env.ASSETS.fetch(request);for(const [k,v] of Object.entries(headers))response.headers.set(k,v);return response}
  return new Response("TrueOnly static assets binding is not configured",{status:503,headers});
}};
