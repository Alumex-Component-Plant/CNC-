const SUPABASE_URL="https://embgwbcdiscfnsjsceei.supabase.co";
const SUPABASE_KEY="sb_publishable_wd2Vqxzkb9oi9xy56knx4Q_w21mjTTh";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

let shifts=[],profiles=[],tools=[],productions=[],downtime=[],oee=[], charts={};

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const num=v=>Number(v||0);
const pct=v=>(num(v)*100).toFixed(1)+"%";
const toast=(m,bad=false)=>{const e=$("toast");e.textContent=m;e.className=`fixed z-[100] right-4 bottom-4 px-4 py-3 rounded-xl shadow-2xl text-sm font-bold text-white toast ${bad?"bg-rose-600":"bg-emerald-600"}`;requestAnimationFrame(()=>e.classList.remove("translate-y-24","opacity-0"));setTimeout(()=>e.classList.add("translate-y-24","opacity-0"),2800)};
const err=(e,where)=>{console.error(where,e);toast(`${where}: ${e?.message||e}`,true)};
function tab(name){document.querySelectorAll(".tab").forEach(x=>x.classList.add("hidden"));$(name).classList.remove("hidden");document.querySelectorAll(".navbtn").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));if(name==="recovery")renderTrash();}
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>tab(b.dataset.tab));
const savedTheme=localStorage.getItem("cnc5000-theme");if(savedTheme==="dark"){document.documentElement.classList.add("dark");$("theme").textContent="☀️"}else{$("theme").textContent="🌙"}
$("theme").onclick=()=>{document.documentElement.classList.toggle("dark");const dark=document.documentElement.classList.contains("dark");localStorage.setItem("cnc5000-theme",dark?"dark":"light");$("theme").textContent=dark?"☀️":"🌙";renderCharts()};

async function load(){
  $("status").innerHTML="<span class=\"status-dot\"></span>Connecting...";$("appLoading").classList.remove("hidden");$("appLoading").classList.add("flex");
  try{
    const results=await Promise.all([
      db.from("shifts").select("*").eq("is_deleted",false).order("shift_date",{ascending:false}).limit(1000),
      db.from("cnc_cycle_times").select("*").eq("is_deleted",false).order("profile_code"),
      db.from("cnc_tool_bits").select("*").eq("is_deleted",false).order("category"),
      db.from("production_records").select("*").order("created_at",{ascending:false}).limit(3000),
      db.from("downtime_events").select("*").order("created_at",{ascending:false}).limit(3000),
      db.from("v_shift_oee").select("*").order("shift_date",{ascending:false}).limit(1000)
    ]);
    for(const r of results)if(r.error)throw r.error;
    [shifts,profiles,tools,productions,downtime,oee]=results.map(r=>r.data||[]);
    $("status").innerHTML="<span class=\"status-dot\"></span>Online";$("status").className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold";
    renderAll();
  }catch(e){$("status").innerHTML="<span class=\"status-dot\"></span>Database error";$("status").className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold";err(e,"Supabase")}finally{$("appLoading").classList.add("hidden");$("appLoading").classList.remove("flex")}
}

function renderAll(){renderDashboard();renderShifts();renderProduction();renderProfiles();renderTools();renderTrash();renderCharts()}

function renderDashboard(){
  const total=oee.reduce((s,r)=>s+num(r.total_produced),0), reject=oee.reduce((s,r)=>s+num(r.rejected),0);
  const planned=oee.reduce((s,r)=>s+num(r.planned_minutes),0), operating=oee.reduce((s,r)=>s+num(r.operating_minutes),0);
  const idealProduced=oee.reduce((s,r)=>s+num(r.ideal_cycle_seconds)*num(r.total_produced),0);
  const A=planned?Math.min(1,operating/planned):0;
  const Praw=operating?idealProduced/(operating*60):0; const P=Math.min(1,Math.max(0,Praw));
  const Q=total?Math.max(0,(total-reject)/total):0;
  const O=A*P*Q;
  const down=oee.reduce((s,r)=>s+num(r.downtime_minutes),0);
  $("kOee").textContent=pct(O);$("kApq").textContent=`A ${pct(A)} • P ${pct(P)} • Q ${pct(Q)}`;
  $("kOutput").textContent=total.toLocaleString();$("kGood").textContent=`Good ${(total-reject).toLocaleString()} • Scrap ${reject.toLocaleString()}`;
  $("kShifts").textContent=oee.length;$("kDown").textContent=`${down.toFixed(0)}m`;
  $("kTools").textContent=tools.filter(t=>num(t.stock)<=num(t.min_stock)).length;
  $("recent").innerHTML=oee.slice(0,8).map(r=>`<tr class="border-b border-slate-100 dark:border-slate-800"><td class="p-2">${esc(r.shift_date)}</td><td class="p-2 text-center">${esc(r.shift_type)}</td><td class="p-2 text-center">${esc(r.team||"-")}</td><td class="p-2 text-center">${num(r.total_produced)}</td><td class="p-2 text-center">${num(r.rejected)}</td><td class="p-2 text-center font-black">${pct(r.oee)}</td></tr>`).join("")||`<tr><td colspan="6" class="p-6 text-center text-slate-400">No shift data yet.</td></tr>`;
}

function renderShifts(){
 const q=($("shiftSearch")?.value||"").toLowerCase(), f=$("shiftFilter")?.value||"ALL", from=$("fromDate")?.value||"", to=$("toDate")?.value||"";
 const rows=oee.filter(r=>(f==="ALL"||r.shift_type===f)&&(!from||r.shift_date>=from)&&(!to||r.shift_date<=to)&&(`${r.shift_date} ${r.team||""} ${r.operator_name||""}`.toLowerCase().includes(q)));
 $("shiftRows").innerHTML=rows.map(r=>`<tr class="border-b border-slate-100 dark:border-slate-800"><td class="p-2">${esc(r.shift_date)}</td><td class="p-2 text-center">${esc(r.shift_type)}</td><td class="p-2 text-center">${esc(r.team||"-")}</td><td class="p-2 text-center">${num(r.planned_minutes).toFixed(0)}m</td><td class="p-2 text-center">${num(r.operating_minutes).toFixed(0)}m</td><td class="p-2 text-center">${num(r.total_produced)}</td><td class="p-2 text-center">${num(r.good_parts)}</td><td class="p-2 text-center">${num(r.rejected)}</td><td class="p-2 text-center">${num(r.downtime_minutes).toFixed(0)}m</td><td class="p-2 text-center font-black">${pct(r.oee)}</td><td class="p-2 text-center"><button class="text-blue-600 font-bold" onclick="editShift(${r.id})">Edit</button> <button class="text-rose-600 font-bold" onclick="deleteShift(${r.id})">Delete</button></td></tr>`).join("")||`<tr><td colspan="11" class="p-6 text-center text-slate-400">No matching shifts.</td></tr>`;
}

function renderProduction(){
 const map=new Map(shifts.map(s=>[s.id,s]));
 $("prodRows").innerHTML=productions.map(p=>{const s=map.get(p.shift_id);return s?`<tr class="border-b border-slate-100 dark:border-slate-800"><td class="p-2">${esc(s.shift_date)}</td><td class="p-2 text-center">${esc(s.shift_type)}</td><td class="p-2 text-center font-bold">${esc(p.profile_code)}</td><td class="p-2 text-center">${num(p.produced)}</td><td class="p-2 text-center">${num(p.rejected)}</td><td class="p-2 text-center">${num(p.produced)-num(p.rejected)}</td></tr>`:""}).join("")||`<tr><td colspan="6" class="p-6 text-center text-slate-400">No production records.</td></tr>`;
}

function renderProfiles(){
 const q=($("profileSearch")?.value||"").toLowerCase();
 const rows=profiles.filter(p=>`${p.profile_code} ${p.description||""}`.toLowerCase().includes(q));
 $("profileRows").innerHTML=rows.map(p=>`<tr class="border-b border-slate-100 dark:border-slate-800"><td class="p-2 font-black">${esc(p.profile_code)}</td><td class="p-2">${esc(p.description||"-")}</td><td class="p-2 text-center">${num(p.cycle_seconds)}s</td><td class="p-2 text-center">${esc(p.feed_speeds||"-")}</td><td class="p-2 text-center">${esc(p.tooling||"-")}</td><td class="p-2 text-center"><button onclick="editProfile(${p.id})" class="text-blue-600 font-bold">Edit</button> <button onclick="deleteProfile(${p.id})" class="text-rose-600 font-bold">Delete</button></td></tr>`).join("")||`<tr><td colspan="6" class="p-6 text-center text-slate-400">No profiles.</td></tr>`;
}

function renderTools(){
 const q=($("toolSearch")?.value||"").toLowerCase(),cat=$("toolCat")?.value||"ALL";
 const rows=tools.filter(t=>(cat==="ALL"||t.category===cat)&&`${t.category} ${t.diameter} ${t.description||""} ${t.location||""}`.toLowerCase().includes(q));
 $("toolRows").innerHTML=rows.map(t=>{const s=num(t.stock),min=num(t.min_stock),c=s===0?"text-rose-600":s<=min?"text-amber-600":"text-emerald-600";return `<tr class="border-b border-slate-100 dark:border-slate-800"><td class="p-2 font-bold">${esc(t.category)}</td><td class="p-2 text-center">${esc(t.diameter)}</td><td class="p-2">${esc(t.description||"-")}</td><td class="p-2 text-center"><button onclick="stock(${t.id},-1)" class="px-2">−</button><b class="${c}">${s}</b><button onclick="stock(${t.id},1)" class="px-2">+</button></td><td class="p-2 text-center">${esc(t.location||"-")}</td><td class="p-2 text-center"><button onclick="editTool(${t.id})" class="text-blue-600 font-bold">Edit</button> <button onclick="deleteTool(${t.id})" class="text-rose-600 font-bold">Dispose</button></td></tr>`}).join("")||`<tr><td colspan="6" class="p-6 text-center text-slate-400">No tools.</td></tr>`;
}

function renderTrash(){
 Promise.all([
  db.from("cnc_cycle_times").select("*").eq("is_deleted",true).order("deleted_at",{ascending:false}),
  db.from("cnc_tool_bits").select("*").eq("is_deleted",true).order("deleted_at",{ascending:false}),
  db.from("shifts").select("*").eq("is_deleted",true).order("deleted_at",{ascending:false})
 ]).then(([p,t,s])=>{
  if(p.error||t.error||s.error)throw(p.error||t.error||s.error);
  $("trashProfiles").innerHTML=(p.data||[]).map(x=>trashCard(x.profile_code,x.id,"profile")).join("")||empty();
  $("trashTools").innerHTML=(t.data||[]).map(x=>trashCard(`${x.category} ${x.diameter}`,x.id,"tool")).join("")||empty();
  $("trashShifts").innerHTML=(s.data||[]).map(x=>trashCard(`${x.shift_date} ${x.shift_type}`,x.id,"shift")).join("")||empty();
 }).catch(e=>console.warn(e));
}
const empty=()=>`<p class="text-xs text-slate-400">Vault empty.</p>`;
function trashCard(label,id,type){return `<div class="flex justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs"><span>${esc(label)}</span><button onclick="restore('${type}',${id})" class="text-emerald-600 font-bold">Restore</button></div>`}

function openModal(title,body){$("modalTitle").textContent=title;$("modalBody").innerHTML=body;$("modal").classList.remove("hidden");$("modal").classList.add("flex")}
function closeModal(){$("modal").classList.add("hidden");$("modal").classList.remove("flex")}

function openShift(id=null){
 const s=id?oee.find(x=>x.id===id):null;
 openModal(id?"Edit Shift":"Add Shift",`<form id="f" class="grid md:grid-cols-2 gap-3">
 <input type="hidden" name="id" value="${s?.id||""}">
 <label>Date<input class="input" name="shift_date" type="date" required value="${s?.shift_date||new Date().toISOString().slice(0,10)}"></label>
 <label>Shift<select class="input" name="shift_type"><option ${s?.shift_type==="Day"?"selected":""}>Day</option><option ${s?.shift_type==="Night"?"selected":""}>Night</option></select></label>
 <label>Team<input class="input" name="team" value="${esc(s?.team||"")}"></label><label>Operator<input class="input" name="operator_name" value="${esc(s?.operator_name||"")}"></label>
 <label>Planned minutes<input class="input" name="planned_minutes" type="number" value="${s?.planned_minutes??630}"></label>
 <label>Break minutes<input class="input" name="planned_break_minutes" type="number" value="${s?.planned_break_minutes??90}"></label>
 <label>Operating minutes<input class="input" name="operating_minutes" type="number" value="${s?.operating_minutes??0}"></label>
 <label>Downtime minutes<input class="input" name="downtime_minutes" type="number" value="${s?.downtime_minutes??0}"></label>
 <label>Total produced<input class="input" name="total_produced" type="number" min="0" value="${s?.total_produced??0}"></label>
 <label>Rejected<input class="input" name="rejected" type="number" min="0" value="${s?.rejected??0}"></label>
 <label>Ideal cycle seconds<input class="input" name="ideal_cycle_seconds" type="number" step="0.01" value="${s?.ideal_cycle_seconds??0}"></label>
 <label>Notes<input class="input" name="notes" value="${esc(s?.notes||"")}"></label>
 <div class="md:col-span-2 flex justify-end gap-2 mt-2"><button type="button" onclick="closeModal()" class="px-4 py-2 rounded-lg bg-slate-200 text-xs font-bold">Cancel</button><button class="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold">Save</button></div>
 </form>`);
 $("f").onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e));const p={shift_date:x.shift_date,shift_type:x.shift_type,team:x.team||null,operator_name:x.operator_name||null,planned_minutes:num(x.planned_minutes),planned_break_minutes:num(x.planned_break_minutes),operating_minutes:num(x.operating_minutes),downtime_minutes:num(x.downtime_minutes),total_produced:Math.trunc(num(x.total_produced)),rejected:Math.trunc(num(x.rejected)),ideal_cycle_seconds:num(x.ideal_cycle_seconds),notes:x.notes||null};if(p.rejected>p.total_produced)return toast("Rejected cannot exceed produced",true);let r=x.id?await db.from("shifts").update(p).eq("id",x.id):await db.from("shifts").insert(p);if(r.error)return err(r.error,"Save shift");toast("Shift saved");closeModal();load()};
}
function editShift(id){openShift(id)}

function openProfile(id=null){
 const p=id?profiles.find(x=>x.id===id):null;
 openModal(id?"Edit Profile":"Add Profile",`<form id="f" class="grid gap-3"><input type="hidden" name="id" value="${p?.id||""}">
 <label>Profile code<input class="input" name="profile_code" required value="${esc(p?.profile_code||"")}"></label>
 <label>Description<input class="input" name="description" value="${esc(p?.description||"")}"></label>
 <label>Length<input class="input" name="length" value="${esc(p?.length||"")}"></label>
 <label>Cycle seconds<input class="input" name="cycle_seconds" type="number" step="0.01" min="0" value="${p?.cycle_seconds??0}"></label>
 <label>Feed / speed<input class="input" name="feed_speeds" value="${esc(p?.feed_speeds||"")}"></label>
 <label>Tooling<input class="input" name="tooling" value="${esc(p?.tooling||"")}"></label>
 <label>Notes<textarea class="input" name="notes">${esc(p?.notes||"")}</textarea></label>
 <button class="bg-blue-600 text-white rounded-lg py-2 text-xs font-bold">Save Profile</button></form>`);
 $("f").onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e));const pld={profile_code:x.profile_code.trim(),description:x.description||null,length:x.length||null,cycle_seconds:num(x.cycle_seconds),feed_speeds:x.feed_speeds||null,tooling:x.tooling||null,notes:x.notes||null};const r=x.id?await db.from("cnc_cycle_times").update(pld).eq("id",x.id):await db.from("cnc_cycle_times").insert(pld);if(r.error)return err(r.error,"Save profile");toast("Profile saved");closeModal();load()};
}
function editProfile(id){openProfile(id)}

function openTool(id=null){
 const t=id?tools.find(x=>x.id===id):null;
 openModal(id?"Edit Tool":"Add Tool",`<form id="f" class="grid md:grid-cols-2 gap-3"><input type="hidden" name="id" value="${t?.id||""}">
 <label>Category<select class="input" name="category"><option>End Mill</option><option>Ball Nose End Mill</option><option>Drill Bit</option><option>Tap Bit</option><option>Chamfer Tool</option><option>Face Mill</option></select></label>
 <label>Diameter / Size<input class="input" name="diameter" required value="${esc(t?.diameter||"")}"></label>
 <label>Description<input class="input" name="description" value="${esc(t?.description||"")}"></label>
 <label>Stock<input class="input" name="stock" type="number" min="0" value="${t?.stock??0}"></label>
 <label>Minimum stock<input class="input" name="min_stock" type="number" min="0" value="${t?.min_stock??2}"></label>
 <label>Location<input class="input" name="location" value="${esc(t?.location||"Main Storage Rack")}"></label>
 <button class="md:col-span-2 bg-blue-600 text-white rounded-lg py-2 text-xs font-bold">Save Tool</button></form>`);
 $("f").category.value=t?.category||"End Mill";
 $("f").onsubmit=async e=>{e.preventDefault();const x=Object.fromEntries(new FormData(e));const pld={category:x.category,diameter:x.diameter.trim(),description:x.description||null,stock:Math.max(0,Math.trunc(num(x.stock))),min_stock:Math.max(0,Math.trunc(num(x.min_stock))),location:x.location||"Main Storage Rack"};const r=x.id?await db.from("cnc_tool_bits").update(pld).eq("id",x.id):await db.from("cnc_tool_bits").insert(pld);if(r.error)return err(r.error,"Save tool");toast("Tool saved");closeModal();load()};
}
function editTool(id){openTool(id)}

async function stock(id,delta){const t=tools.find(x=>x.id===id);if(!t)return;const n=Math.max(0,num(t.stock)+delta);const r=await db.from("cnc_tool_bits").update({stock:n}).eq("id",id);if(r.error)return err(r.error,"Stock");toast("Stock updated");load()}
async function deleteTool(id){if(!confirm("Move this tool to Recovery?"))return;const r=await db.from("cnc_tool_bits").update({is_deleted:true,deleted_at:new Date().toISOString()}).eq("id",id);if(r.error)return err(r.error,"Dispose");toast("Tool moved to Recovery");load()}
async function deleteProfile(id){if(!confirm("Move this profile to Recovery?"))return;const r=await db.from("cnc_cycle_times").update({is_deleted:true,deleted_at:new Date().toISOString()}).eq("id",id);if(r.error)return err(r.error,"Delete profile");toast("Profile moved to Recovery");load()}
async function deleteShift(id){if(!confirm("Move this shift to Recovery? Production/downtime remain linked."))return;const r=await db.from("shifts").update({is_deleted:true,deleted_at:new Date().toISOString()}).eq("id",id);if(r.error)return err(r.error,"Delete shift");toast("Shift moved to Recovery");load()}
async function restore(type,id){const table=type==="profile"?"cnc_cycle_times":type==="tool"?"cnc_tool_bits":"shifts";const r=await db.from(table).update({is_deleted:false,deleted_at:null}).eq("id",id);if(r.error)return err(r.error,"Restore");toast("Restored");load()}

function createRequisition(){
 const low=tools.filter(t=>num(t.stock)<=num(t.min_stock));
 if(!low.length)return toast("No tools are at or below minimum stock.");
 openModal("Restock List",`<div class="space-y-2">${low.map(t=>`<div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs flex justify-between"><span><b>${esc(t.category)}</b> • ${esc(t.diameter)} • Stock ${num(t.stock)}</span><b class="text-rose-600">Order 5</b></div>`).join("")}</div><button id="saveReq" class="w-full mt-4 bg-blue-600 text-white rounded-lg py-2 text-xs font-bold">Save Restock Requisition</button>`);
 $("saveReq").onclick=async()=>{const h=await db.from("tool_requisitions").insert({requested_by:"CNC 5000 Operations",supervisor:"Mr. U.N. Kavinda",status:"Submitted"}).select().single();if(h.error)return err(h.error,"Requisition");const items=low.map(t=>({requisition_id:h.data.id,tool_id:t.id,category:t.category,diameter:t.diameter,stock_at_request:t.stock,requested_qty:5,priority:num(t.stock)===0?"Critical":"Urgent"}));const r=await db.from("tool_requisition_items").insert(items);if(r.error)return err(r.error,"Requisition items");toast("Restock requisition saved");closeModal()};
}

function renderCharts(){
 const labels=[...new Set(oee.map(x=>x.shift_date))].sort().slice(-14), byDate=d=>oee.filter(x=>x.shift_date===d);
 const oe=labels.map(d=>{const rs=byDate(d);const pp=rs.reduce((s,r)=>s+num(r.planned_minutes),0),op=rs.reduce((s,r)=>s+num(r.operating_minutes),0),tp=rs.reduce((s,r)=>s+num(r.total_produced),0),rej=rs.reduce((s,r)=>s+num(r.rejected),0),ic=rs.reduce((s,r)=>s+num(r.ideal_cycle_seconds)*num(r.total_produced),0);const A=pp?Math.min(1,op/pp):0,P=op?Math.min(1,ic/(op*60)):0,Q=tp?(tp-rej)/tp:0;return +(A*P*Q*100).toFixed(1)});
 const po=labels.map(d=>byDate(d).reduce((s,r)=>s+num(r.total_produced)-num(r.rejected),0));
 if(charts.oee)charts.oee.destroy();if(charts.prod)charts.prod.destroy();
 charts.oee=new Chart($("oeeChart"),{type:"line",data:{labels,datasets:[{label:"OEE %",data:oe,tension:.3,borderWidth:2,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true}},scales:{y:{beginAtZero:true,max:100}}}});
 charts.prod=new Chart($("prodChart"),{type:"bar",data:{labels,datasets:[{label:"Good pcs",data:po,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true}}}});
}

function exportExcel(){
 const rows=oee.map(r=>({Date:r.shift_date,Shift:r.shift_type,Team:r.team||"",Planned_Min:r.planned_minutes,Operating_Min:r.operating_minutes,Produced:r.total_produced,Good:r.good_parts,Reject:r.rejected,Downtime_Min:r.downtime_minutes,Availability:pct(r.availability),Performance:pct(Math.min(1,num(r.performance_raw))),Quality:pct(r.quality),OEE:pct(r.oee)}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Shift_OEE");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(profiles),"Profiles");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(tools),"Tools");XLSX.writeFile(wb,`CNC5000_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
}
function exportPDF(){
 const {jsPDF}=window.jspdf,doc=new jsPDF("p","mm","a4");doc.setFontSize(16);doc.text("ALUMEX PLC - CNC 5000 OPERATIONS REPORT",14,16);doc.setFontSize(9);doc.text(`Generated ${new Date().toLocaleString()}`,14,23);
 const rows=oee.slice(0,80).map(r=>[r.shift_date,r.shift_type,r.team||"-",r.total_produced,r.good_parts,r.rejected,`${num(r.downtime_minutes).toFixed(0)}m`,pct(r.oee)]);
 doc.autoTable({head:[["Date","Shift","Team","Produced","Good","Scrap","Down","OEE"]],body:rows,startY:30,styles:{fontSize:7},headStyles:{fillColor:[37,99,235]}});
 doc.save(`CNC5000_Report_${new Date().toISOString().slice(0,10)}.pdf`);
}
function printReport(){window.print()}

window.addEventListener("load",load);
