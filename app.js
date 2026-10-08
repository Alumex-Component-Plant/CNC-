const SUPABASE_URL="https://embgwbcdiscfnsjsceei.supabase.co";

const SUPABASE_PUBLISHABLE_KEY="sb_publishable_wd2Vqxzkb9oi9xy56knx4Q_w21mjTTh";

// Compatibility fallback only.
// Both keys are public client keys.
// NEVER put a secret/service-role key here.
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtYmd3YmNkaXNjZm5zanNjZWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNTg4NzksImV4cCI6MjEwNjkzNDg3OX0.WWM-eQrDnxZl24O3aEluCCN9ulxQAgkC9WwLUV8mYDI";

let db=null;

function createSupabaseClient(key){

  if(
    !window.supabase ||
    typeof window.supabase.createClient!=="function"
  ){

    throw new Error(
      "Supabase JavaScript library did not load. Check internet/CDN access and refresh the page."
    );

  }

  return window.supabase.createClient(
    SUPABASE_URL,
    key,
    {
      db:{
        schema:"public"
      },

      auth:{
        persistSession:false,
        autoRefreshToken:false,
        detectSessionInUrl:false
      }
    }
  );
}

try{
  db=createSupabaseClient(SUPABASE_PUBLISHABLE_KEY);
}catch(e){
  console.error(e);
}


let shifts=[];
let profiles=[];
let tools=[];
let productions=[];
let downtime=[];
let oee=[];
let requisitions=[];
let charts={};
let planningCart=[];


const $=id=>document.getElementById(id);

const esc=s=>
  String(s??"").replace(
    /[&<>"']/g,
    m=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      "\"":"&quot;",
      "'":"&#039;"
    }[m])
  );

const num=v=>Number(v||0);

const pct=v=>
  (num(v)*100).toFixed(1)+"%";

const today=()=>
  new Date().toISOString().slice(0,10);

const fmtMin=m=>{
  m=Math.max(0,num(m));
  return `${Math.floor(m/60)}h ${Math.round(m%60)}m`;
};

const fmtSec=s=>{
  s=Math.max(0,num(s));
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
};


const toast=(m,bad=false)=>{

  const e=$("toast");

  e.textContent=m;

  e.className=
    `fixed z-[100] right-4 bottom-4 px-4 py-3 rounded-xl shadow-2xl text-sm font-bold text-white toast ${
      bad?"bg-rose-600":"bg-emerald-600"
    }`;

  requestAnimationFrame(()=>
    e.classList.remove(
      "translate-y-24",
      "opacity-0"
    )
  );

  setTimeout(()=>
    e.classList.add(
      "translate-y-24",
      "opacity-0"
    ),
    2800
  );

};


const err=(e,where)=>{
  console.error(where,e);

  toast(
    `${where}: ${e?.message||e}`,
    true
  );
};


function tab(name){

  document
    .querySelectorAll(".tab")
    .forEach(x=>x.classList.add("hidden"));

  $(name)?.classList.remove("hidden");

  document
    .querySelectorAll(".navbtn")
    .forEach(x=>
      x.classList.toggle(
        "active",
        x.dataset.tab===name
      )
    );

  if(name==="recovery")
    renderTrash();

  if(name==="planner")
    renderPlanningCart();

  if(name==="reports")
    updateReportPreview();

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });
}


document
  .querySelectorAll(".navbtn")
  .forEach(
    b=>b.onclick=()=>tab(b.dataset.tab)
  );


const savedTheme=
  localStorage.getItem("cnc5000-theme");

if(savedTheme==="dark"){

  document.documentElement.classList.add("dark");

  $("theme").textContent="☀️";

}else{

  $("theme").textContent="🌙";

}


$("theme").onclick=()=>{

  document
    .documentElement
    .classList.toggle("dark");

  const dark=
    document
      .documentElement
      .classList.contains("dark");

  localStorage.setItem(
    "cnc5000-theme",
    dark?"dark":"light"
  );

  $("theme").textContent=
    dark?"☀️":"🌙";

  renderCharts();

  updateReportPreview();

};


async function load(){

  const status=$("status");
  const loader=$("appLoading");

  status.innerHTML=
    '<span class="status-dot"></span>Connecting...';

  status.className=
    "px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold";

  loader.classList.remove("hidden");
  loader.classList.add("flex");


  try{

    if(!db)
      db=createSupabaseClient(
        SUPABASE_PUBLISHABLE_KEY
      );


    const query=(name,promise)=>
      promise.then(r=>{

        if(r.error){

          throw Object.assign(
            new Error(
              r.error.message ||
              `${name} query failed`
            ),
            {
              code:r.error.code,
              details:r.error.details,
              hint:r.error.hint
            }
          );

        }

        return r.data||[];

      });


    // Load every resource independently
    // so one bad view/query cannot make
    // the whole app look disconnected.

    const specs=[

      [
        "Shifts",
        ()=>db
          .from("shifts")
          .select("*")
          .eq("is_deleted",false)
          .order(
            "shift_date",
            {ascending:false}
          )
          .limit(1000)
      ],

      [
        "CNC Profiles",
        ()=>db
          .from("cnc_cycle_times")
          .select("*")
          .eq("is_deleted",false)
          .order("profile_code")
      ],

      [
        "Tools",
        ()=>db
          .from("cnc_tool_bits")
          .select("*")
          .eq("is_deleted",false)
          .order("category")
      ],

      [
        "Production",
        ()=>db
          .from("production_records")
          .select("*")
          .order(
            "created_at",
            {ascending:false}
          )
          .limit(3000)
      ],

      [
        "Downtime",
        ()=>db
          .from("downtime_events")
          .select("*")
          .order(
            "created_at",
            {ascending:false}
          )
          .limit(3000)
      ],

      [
        "OEE View",
        ()=>db
          .from("v_shift_oee")
          .select("*")
          .order(
            "shift_date",
            {ascending:false}
          )
          .limit(1000)
      ],

      [
        "Requisitions",
        ()=>db
          .from("tool_requisitions")
          .select("*")
          .order(
            "created_at",
            {ascending:false}
          )
          .limit(100)
      ]

    ];


    let results=
      await Promise.all(
        specs.map(
          ([n,q])=>query(n,q())
        )
      );


    [
      shifts,
      profiles,
      tools,
      productions,
      downtime,
      oee,
      requisitions
    ]=results;


    if(!Array.isArray(oee))
      oee=[];


    status.innerHTML=
      '<span class="status-dot"></span>Online';

    status.className=
      "px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold";


    renderAll();


  }catch(firstError){

    console.error(
      "Supabase primary connection/load failed:",
      firstError
    );


    // Retry with legacy anon key
    // for compatibility.

    try{

      db=createSupabaseClient(
        SUPABASE_ANON_KEY
      );


      const [
        s,
        p,
        t,
        pr,
        d,
        r
      ]=await Promise.all([

        db
          .from("shifts")
          .select("*")
          .eq("is_deleted",false)
          .order(
            "shift_date",
            {ascending:false}
          )
          .limit(1000),

        db
          .from("cnc_cycle_times")
          .select("*")
          .eq("is_deleted",false)
          .order("profile_code"),

        db
          .from("cnc_tool_bits")
          .select("*")
          .eq("is_deleted",false)
          .order("category"),

        db
          .from("production_records")
          .select("*")
          .order(
            "created_at",
            {ascending:false}
          )
          .limit(3000),

        db
          .from("downtime_events")
          .select("*")
          .order(
            "created_at",
            {ascending:false}
          )
          .limit(3000),

        db
          .from("tool_requisitions")
          .select("*")
          .order(
            "created_at",
            {ascending:false}
          )
          .limit(100)

      ]);


      const retry=[
        s,p,t,pr,d,r
      ];

      const bad=
        retry.find(x=>x.error);

      if(bad?.error)
        throw bad.error;


      [
        shifts,
        profiles,
        tools,
        productions,
        downtime,
        requisitions
      ]=
        retry.map(
          x=>x.data||[]
        );


      oee=
        buildOeeFromShifts(shifts);


      status.innerHTML=
        '<span class="status-dot"></span>Online';

      status.className=
        "px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold";


      renderAll();

      toast(
        "Supabase connected (compatibility key)"
      );


    }catch(retryError){

      status.innerHTML=
        '<span class="status-dot"></span>Database error';

      status.className=
        "px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold";

      err(
        retryError,
        "Supabase connection"
      );

      oee=[];

      renderAll();

    }

  }finally{

    loader.classList.add("hidden");
    loader.classList.remove("flex");

  }

}


function buildOeeFromShifts(rows){

  return (rows||[]).map(r=>{

    const total=
      num(r.total_produced);

    const reject=
      Math.max(
        0,
        num(r.rejected)
      );

    const good=
      Math.max(
        0,
        total-reject
      );

    const planned=
      Math.max(
        0,
        num(r.planned_minutes)
      );

    const operating=
      Math.max(
        0,
        num(r.operating_minutes)
      );

    const ideal=
      Math.max(
        0,
        num(r.ideal_cycle_seconds)
      );

    const availability=
      planned
        ? Math.min(
            1,
            Math.max(
              0,
              operating/planned
            )
          )
        : 0;

    const performance_raw=
      operating
        ? (ideal*total)/
          (operating*60)
        : 0;

    const performance=
      Math.min(
        1,
        Math.max(
          0,
          performance_raw
        )
      );

    const quality=
      total
        ? Math.min(
            1,
            Math.max(
              0,
              good/total
            )
          )
        : 0;

    return {
      ...r,
      good_parts:good,
      availability,
      performance_raw,
      quality,
      oee:
        availability*
        performance*
        quality
    };

  });

}


function aggregate(rows=oee){

  const total=
    rows.reduce(
      (s,r)=>
        s+num(r.total_produced),
      0
    );

  const reject=
    rows.reduce(
      (s,r)=>
        s+num(r.rejected),
      0
    );

  const planned=
    rows.reduce(
      (s,r)=>
        s+num(r.planned_minutes),
      0
    );

  const operating=
    rows.reduce(
      (s,r)=>
        s+num(r.operating_minutes),
      0
    );

  const ideal=
    rows.reduce(
      (s,r)=>
        s+
        num(r.ideal_cycle_seconds)*
        num(r.total_produced),
      0
    );

  const A=
    planned
      ? Math.min(
          1,
          Math.max(
            0,
            operating/planned
          )
        )
      : 0;

  const Praw=
    operating
      ? ideal/
        (operating*60)
      : 0;

  const P=
    Math.min(
      1,
      Math.max(
        0,
        Praw
      )
    );

  const Q=
    total
      ? Math.max(
          0,
          (total-reject)/total
        )
      : 0;

  return {
    total,
    reject,
    good:
      Math.max(
        0,
        total-reject
      ),
    planned,
    operating,
    A,
    P,
    Praw,
    Q,
    OEE:
      A*P*Q,
    down:
      rows.reduce(
        (s,r)=>
          s+num(r.downtime_minutes),
        0
      )
  };

}


function renderAll(){

  renderDashboard();
  renderShifts();
  renderProduction();
  renderDowntime();
  renderProfiles();
  renderTools();
  renderTrash();
  renderPlanningCart();
  renderRequisitions();
  renderCharts();
  updateReportPreview();

}


function renderDashboard(){

  const a=aggregate();

  $("kOee").textContent=
    pct(a.OEE);

  $("kApq").textContent=
    `A ${pct(a.A)} • P ${pct(a.P)} • Q ${pct(a.Q)}`;

  $("kOutput").textContent=
    a.total.toLocaleString();

  $("kGood").textContent=
    `Good ${a.good.toLocaleString()} • Scrap ${a.reject.toLocaleString()}`;

  $("kShifts").textContent=
    oee.length;

  $("kDown").textContent=
    `${a.down.toFixed(0)}m`;

  $("kTools").textContent=
    tools.filter(
      t=>num(t.stock)<3
    ).length;


  $("recent").innerHTML=
    oee
      .slice(0,8)
      .map(r=>
        `<tr class="border-b border-slate-100 dark:border-slate-800">

          <td class="p-2">
            ${esc(r.shift_date)}
          </td>

          <td class="p-2 text-center">
            ${esc(r.shift_type)}
          </td>

          <td class="p-2 text-center">
            ${esc(r.team||"-")}
          </td>

          <td class="p-2 text-center">
            ${num(r.total_produced)}
          </td>

          <td class="p-2 text-center">
            ${num(r.rejected)}
          </td>

          <td class="p-2 text-center font-black">
            ${pct(r.oee)}
          </td>

        </tr>`
      )
      .join("")
      ||
      `<tr>
        <td colspan="6" class="p-6 text-center text-slate-400">
          No shift data yet.
        </td>
      </tr>`;

}


function renderShifts(){

  const q=
    ($("shiftSearch")?.value||"")
      .toLowerCase();

  const f=
    $("shiftFilter")?.value||"ALL";

  const from=
    $("fromDate")?.value||"";

  const to=
    $("toDate")?.value||"";


  const rows=
    oee.filter(r=>
      (f==="ALL"||r.shift_type===f) &&
      (!from||r.shift_date>=from) &&
      (!to||r.shift_date<=to) &&
      (
        `${r.shift_date} ${r.team||""} ${r.operator_name||""} ${r.epf_no||""}`
      )
      .toLowerCase()
      .includes(q)
    );


  $("shiftRows").innerHTML=
    rows
      .map(r=>
        `<tr class="border-b border-slate-100 dark:border-slate-800">

          <td class="p-2">
            ${esc(r.shift_date)}
          </td>

          <td class="p-2 text-center">
            ${esc(r.shift_type)}
          </td>

          <td class="p-2 text-center">
            ${esc(r.team||"-")}
          </td>

          <td class="p-2 text-center">
            ${num(r.planned_minutes).toFixed(0)}m
          </td>

          <td class="p-2 text-center">
            ${num(r.operating_minutes).toFixed(0)}m
          </td>

          <td class="p-2 text-center">
            ${num(r.total_produced)}
          </td>

          <td class="p-2 text-center">
            ${num(r.good_parts)}
          </td>

          <td class="p-2 text-center">
            ${num(r.rejected)}
          </td>

          <td class="p-2 text-center">
            ${num(r.downtime_minutes).toFixed(0)}m
          </td>

          <td class="p-2 text-center font-black">
            ${pct(r.oee)}
            ${
              num(r.performance_raw)>1
                ? '<span class="quality-flag" title="Raw performance above 100%">!</span>'
                : ''
            }
          </td>

          <td class="p-2 text-center">

            <button
              class="text-blue-600 font-bold"
              onclick="editShift(${r.id})"
            >
              Edit
            </button>

            <button
              class="text-rose-600 font-bold"
              onclick="deleteShift(${r.id})"
            >
              Delete
            </button>

          </td>

        </tr>`
      )
      .join("")
      ||
      `<tr>
        <td colspan="11" class="p-6 text-center text-slate-400">
          No matching shifts.
        </td>
      </tr>`;

}


function renderProduction(){

  const map=
    new Map(
      shifts.map(
        s=>[s.id,s]
      )
    );


  $("prodCount").textContent=
    productions.length;

  $("prodTotal").textContent=
    productions
      .reduce(
        (s,p)=>
          s+num(p.produced),
        0
      )
      .toLocaleString();

  $("prodScrap").textContent=
    productions
      .reduce(
        (s,p)=>
          s+num(p.rejected),
        0
      )
      .toLocaleString();

  $("prodGood").textContent=
    productions
      .reduce(
        (s,p)=>
          s+
          num(p.produced)-
          num(p.rejected),
        0
      )
      .toLocaleString();


  $("prodRows").innerHTML=
    productions
      .slice(0,250)
      .map(p=>{

        const s=
          map.get(p.shift_id);

        return s
          ? `<tr class="border-b border-slate-100 dark:border-slate-800">

              <td class="p-2">
                ${esc(s.shift_date)}
              </td>

              <td class="p-2 text-center">
                ${esc(s.shift_type)}
              </td>

              <td class="p-2 text-center font-bold">
                ${esc(p.profile_code)}
              </td>

              <td class="p-2 text-center">
                ${num(p.produced)}
              </td>

              <td class="p-2 text-center">
                ${num(p.rejected)}
              </td>

              <td class="p-2 text-center">
                ${Math.max(
                  0,
                  num(p.produced)-
                  num(p.rejected)
                )}
              </td>

              <td class="p-2 text-center">
                ${num(p.ideal_cycle_seconds)}s
              </td>

              <td class="p-2 text-center">
                ${esc(p.reject_reason||"-")}
              </td>

              <td class="p-2 text-center">

                <button
                  class="text-rose-600 font-bold"
                  onclick="deleteProduction(${p.id})"
                >
                  Delete
                </button>

              </td>

            </tr>`
          : "";

      })
      .join("")
      ||
      `<tr>
        <td colspan="9" class="p-6 text-center text-slate-400">
          No production records.
        </td>
      </tr>`;

}


function renderDowntime(){

  const map=
    new Map(
      shifts.map(
        s=>[s.id,s]
      )
    );


  $("downRows").innerHTML=
    downtime
      .slice(0,250)
      .map(d=>{

        const s=
          map.get(d.shift_id);

        return `
        <tr class="border-b border-slate-100 dark:border-slate-800">

          <td class="p-2">
            ${esc(s?.shift_date||"-")}
          </td>

          <td class="p-2 text-center">
            ${esc(s?.shift_type||"-")}
          </td>

          <td class="p-2">
            ${esc(d.reason||"Other")}
          </td>

          <td class="p-2 text-center">
            ${num(d.duration_min).toFixed(1)}
          </td>

          <td class="p-2">
            ${esc(d.notes||"-")}
          </td>

          <td class="p-2 text-center">

            <button
              class="text-rose-600 font-bold"
              onclick="deleteDowntime(${d.id})"
            >
              Delete
            </button>

          </td>

        </tr>`;
      })
      .join("")
      ||
      `<tr>
        <td colspan="6" class="p-6 text-center text-slate-400">
          No downtime records.
        </td>
      </tr>`;

}


function renderProfiles(){

  const q=
    ($("profileSearch")?.value||"")
      .toLowerCase();

  const rows=
    profiles.filter(
      p=>
        `${p.profile_code} ${p.description||""}`
          .toLowerCase()
          .includes(q)
    );


  $("profileRows").innerHTML=
    rows
      .map(p=>
        `<tr class="border-b border-slate-100 dark:border-slate-800">

          <td class="p-2 font-black">
            ${esc(p.profile_code)}
          </td>

          <td class="p-2">
            ${esc(p.description||"-")}
          </td>

          <td class="p-2 text-center">
            ${num(p.cycle_seconds)}s
          </td>

          <td class="p-2 text-center">
            ${esc(p.feed_speeds||"-")}
          </td>

          <td class="p-2 text-center">
            ${esc(p.tooling||"-")}
          </td>

          <td class="p-2 text-center">

            <button
              onclick="editProfile(${p.id})"
              class="text-blue-600 font-bold"
            >
              Edit
            </button>

            <button
              onclick="deleteProfile(${p.id})"
              class="text-rose-600 font-bold"
            >
              Delete
            </button>

          </td>

        </tr>`
      )
      .join("")
      ||
      `<tr>
        <td colspan="6" class="p-6 text-center text-slate-400">
          No profiles.
        </td>
      </tr>`;

}


function renderTools(){

  const q=
    ($("toolSearch")?.value||"")
      .toLowerCase();

  const cat=
    $("toolCat")?.value||"ALL";


  const rows=
    tools.filter(
      t=>
        (cat==="ALL"||t.category===cat) &&
        `${t.tool_code||""} ${t.category} ${t.diameter} ${t.description||""} ${t.location||""}`
          .toLowerCase()
          .includes(q)
    );


  $("toolRows").innerHTML=
    rows
      .map(t=>{

        const s=
          num(t.stock);

        const min=
          num(t.min_stock);

        const c=
          s===0
            ?"text-rose-600"
            :s<3
              ?"text-amber-600"
              :s<=min
                ?"text-amber-600"
                :"text-emerald-600";


        return `
        <tr class="border-b border-slate-100 dark:border-slate-800">

          <td class="p-2 font-bold">

            ${esc(t.category)}

            <small class="block text-[9px] text-slate-400">
              ${esc(t.tool_code||"")}
            </small>

          </td>

          <td class="p-2 text-center">
            ${esc(t.diameter)}
          </td>

          <td class="p-2">
            ${esc(t.description||"-")}
          </td>

          <td class="p-2 text-center">

            <button
              onclick="stock(${t.id},-1)"
              class="px-2"
            >
              −
            </button>

            <b class="${c}">
              ${s}
            </b>

            <button
              onclick="stock(${t.id},1)"
              class="px-2"
            >
              +
            </button>

          </td>

          <td class="p-2 text-center">
            ${min}
          </td>

          <td class="p-2 text-center">
            ${esc(t.location||"-")}
          </td>

          <td class="p-2 text-center">

            <button
              onclick="editTool(${t.id})"
              class="text-blue-600 font-bold"
            >
              Edit
            </button>

            <button
              onclick="deleteTool(${t.id})"
              class="text-rose-600 font-bold"
            >
              Dispose
            </button>

          </td>

        </tr>`;

      })
      .join("")
      ||
      `<tr>
        <td colspan="7" class="p-6 text-center text-slate-400">
          No tools.
        </td>
      </tr>`;


  $("toolCritical").textContent=
    tools.filter(
      t=>num(t.stock)<3
    ).length;

  $("toolMinimum").textContent=
    tools.filter(
      t=>num(t.stock)<=num(t.min_stock)
    ).length;

  $("toolReqCount").textContent=
    requisitions.filter(
      r=>
        ["Submitted","Approved"]
          .includes(r.status)
    ).length;

  $("stockNotice")
    .classList
    .toggle(
      "hidden",
      !tools.some(
        t=>num(t.stock)<3
      )
    );

}


function renderRequisitions(){

  $("reqRows").innerHTML=
    requisitions
      .slice(0,20)
      .map(r=>
        `<tr class="border-b border-slate-100 dark:border-slate-800">

          <td class="p-2">
            #${r.id}
          </td>

          <td class="p-2">
            ${esc(r.requested_by||"Operations")}
          </td>

          <td class="p-2 text-center">
            ${esc(r.status)}
          </td>

          <td class="p-2">
            ${esc(r.notes||"-")}
          </td>

          <td class="p-2 text-center">
            ${new Date(r.created_at).toLocaleString()}
          </td>

        </tr>`
      )
      .join("")
      ||
      `<tr>
        <td colspan="5" class="p-6 text-center text-slate-400">
          No requisitions yet.
        </td>
      </tr>`;

}


function renderTrash(){

  Promise.all([

    db
      .from("cnc_cycle_times")
      .select("*")
      .eq("is_deleted",true)
      .order(
        "deleted_at",
        {ascending:false}
      ),

    db
      .from("cnc_tool_bits")
      .select("*")
      .eq("is_deleted",true)
      .order(
        "deleted_at",
        {ascending:false}
      ),

    db
      .from("shifts")
      .select("*")
      .eq("is_deleted",true)
      .order(
        "deleted_at",
        {ascending:false}
      )

  ])

  .then(([p,t,s])=>{

    if(p.error||t.error||s.error)
      throw(
        p.error||
        t.error||
        s.error
      );


    $("trashProfiles").innerHTML=
      (p.data||[])
        .map(
          x=>
            trashCard(
              x.profile_code,
              x.id,
              "profile"
            )
        )
        .join("")
        ||
        empty();


    $("trashTools").innerHTML=
      (t.data||[])
        .map(
          x=>
            trashCard(
              `${x.category} ${x.diameter}`,
              x.id,
              "tool"
            )
        )
        .join("")
        ||
        empty();


    $("trashShifts").innerHTML=
      (s.data||[])
        .map(
          x=>
            trashCard(
              `${x.shift_date} ${x.shift_type}`,
              x.id,
              "shift"
            )
        )
        .join("")
        ||
        empty();

  })

  .catch(
    e=>console.warn(e)
  );

}


const empty=()=>
  `<p class="text-xs text-slate-400">
    Vault empty.
  </p>`;


function trashCard(label,id,type){

  return `
  <div class="flex justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">

    <span>
      ${esc(label)}
    </span>

    <button
      onclick="restore('${type}',${id})"
      class="text-emerald-600 font-bold"
    >
      Restore
    </button>

  </div>`;

}


function openModal(title,body){

  $("modalTitle").textContent=title;

  $("modalBody").innerHTML=body;

  $("modal")
    .classList
    .remove("hidden");

  $("modal")
    .classList
    .add("flex");

  setTimeout(
    ()=>
      $(
        "modalBody input, #modalBody select, #modalBody textarea"
      )?.focus(),
    20
  );

}


function closeModal(){

  $("modal")
    .classList
    .add("hidden");

  $("modal")
    .classList
    .remove("flex");

}


$("modal").addEventListener(
  "click",
  e=>{
    if(e.target.id==="modal")
      closeModal();
  }
);


document.addEventListener(
  "keydown",
  e=>{
    if(e.key==="Escape")
      closeModal();
  }
);


function field(
  label,
  name,
  value,
  type="text",
  extra=""
){

  return `
  <label class="block">

    <span class="form-label">
      ${label}
    </span>

    <input
      class="input"
      name="${name}"
      type="${type}"
      value="${esc(value)}"
      ${extra}
    >

  </label>`;

}


function selectField(
  label,
  name,
  options,
  value
){

  return `
  <label class="block">

    <span class="form-label">
      ${label}
    </span>

    <select
      class="input"
      name="${name}"
    >

      ${
        options
          .map(
            x=>
              `<option
                value="${esc(x.value)}"
                ${
                  String(x.value)===String(value)
                    ?"selected"
                    :""
                }
              >
                ${esc(x.label)}
              </option>`
          )
          .join("")
      }

    </select>

  </label>`;

}


function openShift(id=null){

  const s=
    id
      ?shifts.find(
        x=>x.id===id
      )
      :null;


  openModal(
    id
      ?"Edit CNC 5000 Shift"
      :"Record CNC 5000 Shift",

    `
    <form
      id="shiftForm"
      class="grid md:grid-cols-2 gap-3"
    >

      <input
        type="hidden"
        name="id"
        value="${s?.id||""}"
      >

      ${field(
        "Shift date",
        "shift_date",
        s?.shift_date||today(),
        "date",
        "required"
      )}

      ${selectField(
        "Shift",
        "shift_type",
        [
          {
            value:"Day",
            label:"Day (06:00–18:00)"
          },
          {
            value:"Night",
            label:"Night (18:00–06:00)"
          }
        ],
        s?.shift_type||"Day"
      )}

      ${field(
        "Team",
        "team",
        s?.team||""
      )}

      ${field(
        "Operator",
        "operator_name",
        s?.operator_name||""
      )}

      ${field(
        "EPF No.",
        "epf_no",
        s?.epf_no||""
      )}

      ${field(
        "Shift length (min)",
        "shift_length_min",
        s?.shift_length_min??720,
        "number",
        "min=0"
      )}

      ${field(
        "Planned break (min)",
        "planned_break_min",
        s?.planned_break_min??90,
        "number",
        "min=0"
      )}

      ${field(
        "Planned time (min)",
        "planned_time_min",
        s?.planned_time_min??630,
        "number",
        "min=0"
      )}

      ${field(
        "Operating time (min)",
        "operating_time_min",
        s?.operating_time_min??
          s?.operating_minutes??
          0,
        "number",
        "min=0"
      )}

      ${field(
        "Downtime (min)",
        "downtime_minutes",
        s?.downtime_minutes??0,
        "number",
        "min=0"
      )}

      ${field(
        "Total produced",
        "total_produced",
        s?.total_produced??0,
        "number",
        "min=0"
      )}

      ${field(
        "Rejected",
        "rejected",
        s?.rejected??0,
        "number",
        "min=0"
      )}

      ${field(
        "Ideal cycle (s)",
        "ideal_cycle_seconds",
        s?.ideal_cycle_seconds??0,
        "number",
        "min=0 step=.01"
      )}

      ${selectField(
        "Machine planned?",
        "was_planned",
        [
          {
            value:"true",
            label:"Yes"
          },
          {
            value:"false",
            label:"No"
          }
        ],
        String(
          s?.was_planned??true
        )
      )}

      ${selectField(
        "Other department used?",
        "other_dept_used",
        [
          {
            value:"false",
            label:"No"
          },
          {
            value:"true",
            label:"Yes"
          }
        ],
        String(
          s?.other_dept_used??false
        )
      )}

      ${field(
        "Other department period",
        "other_dept_period",
        s?.other_dept_period||""
      )}

      ${field(
        "Supervisor sign / name",
        "supervisor_sign",
        s?.supervisor_sign||""
      )}

      ${field(
        "Quality sign / name",
        "quality_sign",
        s?.quality_sign||""
      )}

      <label class="md:col-span-2 block">

        <span class="form-label">
          Other notes
        </span>

        <textarea
          class="input"
          name="other_notes"
          rows="2"
        >${esc(s?.other_notes||"")}</textarea>

      </label>

      <label class="md:col-span-2 block">

        <span class="form-label">
          Shift notes
        </span>

        <textarea
          class="input"
          name="notes"
          rows="2"
        >${esc(s?.notes||"")}</textarea>

      </label>

      <div class="md:col-span-2 flex justify-end gap-2 mt-2">

        <button
          type="button"
          onclick="closeModal()"
          class="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-bold"
        >
          Cancel
        </button>

        <button
          class="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold"
        >
          Save Shift
        </button>

      </div>

    </form>
    `
  );


  $("shiftForm").onsubmit=
    saveShift;

}


async function saveShift(e){

  e.preventDefault();

  const x=
    Object.fromEntries(
      new FormData(e)
    );


  const shiftLength=
    num(x.shift_length_min)||720;

  const breakMin=
    num(x.planned_break_min)||90;

  const plannedTime=
    num(x.planned_time_min)||
    Math.max(
      0,
      shiftLength-breakMin
    );

  const operating=
    num(x.operating_time_min);

  const down=
    num(x.downtime_minutes);


  const p={

    shift_date:x.shift_date,

    shift_type:x.shift_type,

    team:x.team||null,

    operator_name:
      x.operator_name||null,

    epf_no:
      x.epf_no||null,

    machine:"CNC 5000",

    shift_length_min:
      shiftLength,

    planned_break_min:
      breakMin,

    planned_time_min:
      plannedTime,

    planned_minutes:
      plannedTime,

    operating_time_min:
      operating,

    operating_minutes:
      operating,

    downtime_minutes:
      down,

    total_produced:
      Math.trunc(
        num(x.total_produced)
      ),

    rejected:
      Math.trunc(
        num(x.rejected)
      ),

    ideal_cycle_seconds:
      num(x.ideal_cycle_seconds),

    was_planned:
      x.was_planned==="true",

    other_dept_used:
      x.other_dept_used==="true",

    other_dept_period:
      x.other_dept_period||null,

    other_notes:
      x.other_notes||null,

    supervisor_sign:
      x.supervisor_sign||null,

    quality_sign:
      x.quality_sign||null,

    notes:
      x.notes||null

  };


  if(
    p.rejected>
    p.total_produced
  )
    return toast(
      "Rejected cannot exceed total produced",
      true
    );


  if(
    p.operating_minutes>
    p.planned_minutes
  )
    return toast(
      "Operating time cannot exceed planned time",
      true
    );


  if(
    p.downtime_minutes>
    p.planned_minutes
  )
    return toast(
      "Downtime cannot exceed planned time",
      true
    );


  const r=
    x.id
      ?await db
        .from("shifts")
        .update(p)
        .eq("id",x.id)
      :await db
        .from("shifts")
        .insert(p);


  if(r.error)
    return err(
      r.error,
      "Save shift"
    );


  toast("Shift saved");

  closeModal();

  load();

}


function editShift(id){
  openShift(id);
}


function openProduction(){

  if(!shifts.length)
    return toast(
      "Record a shift first.",
      true
    );


  const shiftOptions=
    shifts
      .slice(0,100)
      .map(
        s=>({
          value:s.id,
          label:
            `${s.shift_date} · ${s.shift_type} · ${s.team||"No team"}`
        })
      );


  const profileOptions=
    profiles.map(
      p=>({
        value:p.profile_code,
        label:
          `${p.profile_code} · ${p.description||"Profile"}`
      })
    );


  openModal(
    "Add Production Record",

    `
    <form
      id="productionForm"
      class="grid md:grid-cols-2 gap-3"
    >

      ${selectField(
        "Shift",
        "shift_id",
        shiftOptions,
        shifts[0].id
      )}

      ${selectField(
        "CNC profile",
        "profile_code",
        profileOptions,
        profiles[0]?.profile_code||""
      )}

      ${field(
        "Produced pieces",
        "produced",
        0,
        "number",
        "min=0 required"
      )}

      ${field(
        "Rejected pieces",
        "rejected",
        0,
        "number",
        "min=0 required"
      )}

      ${field(
        "Setup time (min)",
        "setup_min",
        0,
        "number",
        "min=0"
      )}

      ${field(
        "Target pieces",
        "target",
        0,
        "number",
        "min=0"
      )}

      ${selectField(
        "Reject reason",
        "reject_reason",
        [
          {
            value:"",
            label:"Not specified"
          },
          {
            value:"Tooling",
            label:"Tooling"
          },
          {
            value:"Dimension / quality",
            label:"Dimension / quality"
          },
          {
            value:"Material",
            label:"Material"
          },
          {
            value:"Program / CNC",
            label:"Program / CNC"
          },
          {
            value:"Other",
            label:"Other"
          }
        ],
        ""
      )}

      <div class="md:col-span-2 flex justify-end gap-2">

        <button
          type="button"
          onclick="closeModal()"
          class="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-bold"
        >
          Cancel
        </button>

        <button
          class="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold"
        >
          Save Production
        </button>

      </div>

    </form>
    `
  );


  $("productionForm").onsubmit=
    saveProduction;

}


async function saveProduction(e){

  e.preventDefault();

  const x=
    Object.fromEntries(
      new FormData(e)
    );


  const produced=
    Math.trunc(
      num(x.produced)
    );

  const rejected=
    Math.trunc(
      num(x.rejected)
    );

  const shiftId=
    num(x.shift_id);

  const profile=
    profiles.find(
      p=>p.profile_code===
        x.profile_code
    );


  if(rejected>produced)
    return toast(
      "Rejected cannot exceed produced",
      true
    );


  const r=
    await db
      .from("production_records")
      .insert({

        shift_id:
          shiftId,

        profile_code:
          x.profile_code,

        produced,

        rejected,

        ideal_cycle_seconds:
          num(
            profile?.cycle_seconds
          ),

        setup_min:
          num(x.setup_min),

        target:
          Math.trunc(
            num(x.target)
          ),

        reject_reason:
          x.reject_reason||null

      });


  if(r.error)
    return err(
      r.error,
      "Save production"
    );


  const related=[
    ...productions.filter(
      p=>p.shift_id===shiftId
    ),
    {
      produced,
      rejected
    }
  ];


  const totalProduced=
    related.reduce(
      (s,p)=>
        s+num(p.produced),
      0
    );


  const totalRejected=
    related.reduce(
      (s,p)=>
        s+num(p.rejected),
      0
    );


  const existing=
    shifts.find(
      s=>s.id===shiftId
    );


  const newIdeal=
    profile?.cycle_seconds||
    num(existing?.ideal_cycle_seconds);


  const u=
    await db
      .from("shifts")
      .update({
        total_produced:
          totalProduced,
        rejected:
          totalRejected,
        ideal_cycle_seconds:
          newIdeal||0
      })
      .eq("id",shiftId);


  if(u.error)
    return err(
      u.error,
      "Update shift output"
    );


  toast(
    "Production recorded"
  );

  closeModal();

  load();

}


async function deleteProduction(id){

  if(
    !confirm(
      "Delete this production record? The linked shift totals will be recalculated."
    )
  )
    return;


  const r=
    await db
      .from("production_records")
      .delete()
      .eq("id",id);


  if(r.error)
    return err(
      r.error,
      "Delete production"
    );


  // Recalculate the linked shift totals after deletion.
  // This keeps OEE, dashboard and reports consistent with the records.
  const deleted = productions.find(x => x.id === id);
  const linkedShiftId = num(deleted?.shift_id);

  if(linkedShiftId){
    const remaining = productions.filter(
      x => x.shift_id === linkedShiftId && x.id !== id
    );

    const totalProduced = remaining.reduce(
      (sum,x) => sum + num(x.produced),
      0
    );

    const totalRejected = remaining.reduce(
      (sum,x) => sum + num(x.rejected),
      0
    );

    const idealValues = remaining
      .map(x => num(x.ideal_cycle_seconds))
      .filter(v => v > 0);

    const idealCycle = idealValues.length
      ? idealValues[idealValues.length - 1]
      : 0;

    const u = await db
      .from("shifts")
      .update({
        total_produced: totalProduced,
        rejected: totalRejected,
        ideal_cycle_seconds: idealCycle
      })
      .eq("id", linkedShiftId);

    if(u.error)
      return err(u.error, "Recalculate shift after production deletion");
  }

  toast(
    "Production record deleted and shift totals recalculated"
  );

  load();

}


function openDowntime(){

  if(!shifts.length)
    return toast(
      "Record a shift first.",
      true
    );


  const reasons=[
    "Tool change",
    "Tool breakage",
    "Machine setup",
    "Material shortage",
    "Quality inspection",
    "Program / CNC issue",
    "Mechanical fault",
    "Electrical fault",
    "Cleaning",
    "Other"
  ];


  openModal(
    "Add Downtime Event",

    `
    <form
      id="downForm"
      class="grid md:grid-cols-2 gap-3"
    >

      ${selectField(
        "Shift",
        "shift_id",
        shifts
          .slice(0,100)
          .map(
            s=>({
              value:s.id,
              label:
                `${s.shift_date} · ${s.shift_type} · ${s.team||"No team"}`
            })
          ),
        shifts[0].id
      )}

      ${selectField(
        "Reason",
        "reason",
        reasons.map(
          x=>({
            value:x,
            label:x
          })
        ),
        reasons[0]
      )}

      ${field(
        "Duration minutes",
        "duration_min",
        0,
        "number",
        "min=0 required"
      )}

      <label class="md:col-span-2 block">

        <span class="form-label">
          Notes
        </span>

        <textarea
          class="input"
          name="notes"
          rows="3"
        ></textarea>

      </label>

      <div class="md:col-span-2 flex justify-end gap-2">

        <button
          type="button"
          onclick="closeModal()"
          class="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-xs font-bold"
        >
          Cancel
        </button>

        <button
          class="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold"
        >
          Save Loss
        </button>

      </div>

    </form>
    `
  );


  $("downForm").onsubmit=
    saveDowntime;

}


async function saveDowntime(e){

  e.preventDefault();

  const x=
    Object.fromEntries(
      new FormData(e)
    );

  const shiftId=
    num(x.shift_id);

  const duration=
    num(x.duration_min);


  const r=
    await db
      .from("downtime_events")
      .insert({

        shift_id:
          shiftId,

        reason:
          x.reason,

        duration_min:
          duration,

        notes:
          x.notes||null

      });


  if(r.error)
    return err(
      r.error,
      "Save downtime"
    );


  const related=[
    ...downtime.filter(
      d=>d.shift_id===shiftId
    ),
    {
      duration_min:duration
    }
  ];


  const totalDown=
    related.reduce(
      (s,d)=>
        s+num(d.duration_min),
      0
    );


  const shift=
    shifts.find(
      s=>s.id===shiftId
    );


  const planned=
    Math.max(
      0,
      num(
        shift?.planned_time_min ??
        shift?.planned_minutes
      )
    );


  const operating=
    Math.max(
      0,
      planned-totalDown
    );


  const u=
    await db
      .from("shifts")
      .update({

        downtime_minutes:
          totalDown,

        operating_minutes:
          operating,

        operating_time_min:
          operating

      })
      .eq("id",shiftId);


  if(u.error)
    return err(
      u.error,
      "Update shift downtime"
    );


  toast(
    "Downtime recorded"
  );

  closeModal();

  load();

}


async function deleteDowntime(id){

  if(
    !confirm(
      "Delete this downtime record and recalculate the shift?"
    )
  )
    return;


  const d=
    downtime.find(
      x=>x.id===id
    );

  if(!d)
    return;


  const r=
    await db
      .from("downtime_events")
      .delete()
      .eq("id",id);


  if(r.error)
    return err(
      r.error,
      "Delete downtime"
    );


  const related=
    downtime.filter(
      x=>
        x.shift_id===d.shift_id &&
        x.id!==id
    );


  const totalDown=
    related.reduce(
      (s,x)=>
        s+num(x.duration_min),
      0
    );


  const shift=
    shifts.find(
      s=>s.id===d.shift_id
    );


  const planned=
    Math.max(
      0,
      num(
        shift?.planned_time_min ??
        shift?.planned_minutes
      )
    );


  const operating=
    Math.max(
      0,
      planned-totalDown
    );


  await db
    .from("shifts")
    .update({

      downtime_minutes:
        totalDown,

      operating_minutes:
        operating,

      operating_time_min:
        operating

    })
    .eq(
      "id",
      d.shift_id
    );


  toast(
    "Downtime deleted"
  );

  load();

}


function openProfile(id=null){

  const p=
    id
      ?profiles.find(
        x=>x.id===id
      )
      :null;


  openModal(

    id
      ?"Edit CNC Profile"
      :"Add CNC Profile",

    `
    <form
      id="profileForm"
      class="grid md:grid-cols-2 gap-3"
    >

      <input
        type="hidden"
        name="id"
        value="${p?.id||""}"
      >

      ${field(
        "Profile code",
        "profile_code",
        p?.profile_code||"",
        "text",
        "required"
      )}

      ${field(
        "Description",
        "description",
        p?.description||""
      )}

      ${field(
        "Length / dimensions",
        "length",
        p?.length||""
      )}

      ${field(
        "Cycle seconds",
        "cycle_seconds",
        p?.cycle_seconds??0,
        "number",
        "min=0 step=.01"
      )}

      ${field(
        "Feed / speed",
        "feed_speeds",
        p?.feed_speeds||""
      )}

      ${field(
        "Tooling",
        "tooling",
        p?.tooling||""
      )}

      <label class="md:col-span-2 block">

        <span class="form-label">
          Notes
        </span>

        <textarea
          class="input"
          name="notes"
          rows="2"
        >${esc(p?.notes||"")}</textarea>

      </label>

      <div class="md:col-span-2 flex justify-end">

        <button
          class="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold"
        >
          Save Profile
        </button>

      </div>

    </form>
    `
  );


  $("profileForm").onsubmit=
    saveProfile;

}


async function saveProfile(e){

  e.preventDefault();

  const x=
    Object.fromEntries(
      new FormData(e)
    );


  const p={

    profile_code:
      x.profile_code.trim(),

    description:
      x.description||null,

    length:
      x.length||null,

    cycle_seconds:
      num(x.cycle_seconds),

    feed_speeds:
      x.feed_speeds||null,

    tooling:
      x.tooling||null,

    notes:
      x.notes||null,

    record_date:
      today()

  };


  const r=
    x.id
      ?await db
        .from("cnc_cycle_times")
        .update(p)
        .eq("id",x.id)

      :await db
        .from("cnc_cycle_times")
        .insert(p);


  if(r.error)
    return err(
      r.error,
      "Save profile"
    );


  toast(
    "Profile saved"
  );

  closeModal();

  load();

}


function editProfile(id){
  openProfile(id);
}


function openTool(id=null){

  const t=
    id
      ?tools.find(
        x=>x.id===id
      )
      :null;


  const cats=[
    "End Mill",
    "Ball Nose End Mill",
    "Drill Bit",
    "Tap Bit",
    "Chamfer Tool",
    "Face Mill"
  ];


  openModal(

    id
      ?"Edit Tool"
      :"Add Tool",

    `
    <form
      id="toolForm"
      class="grid md:grid-cols-2 gap-3"
    >

      <input
        type="hidden"
        name="id"
        value="${t?.id||""}"
      >

      ${selectField(
        "Category",
        "category",
        cats.map(
          x=>({
            value:x,
            label:x
          })
        ),
        t?.category||"End Mill"
      )}

      ${field(
        "Diameter / Size",
        "diameter",
        t?.diameter||"",
        "text",
        "required"
      )}

      ${field(
        "Description",
        "description",
        t?.description||""
      )}

      ${field(
        "Stock",
        "stock",
        t?.stock??0,
        "number",
        "min=0"
      )}

      ${field(
        "Minimum stock",
        "min_stock",
        t?.min_stock??2,
        "number",
        "min=0"
      )}

      ${field(
        "Location",
        "location",
        t?.location||"Main Storage Rack"
      )}

      ${field(
        "Sub-type",
        "sub_type",
        t?.sub_type||""
      )}

      <div class="md:col-span-2 flex justify-end">

        <button
          class="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold"
        >
          Save Tool
        </button>

      </div>

    </form>
    `
  );


  $("toolForm").onsubmit=
    saveTool;

}


async function saveTool(e){

  e.preventDefault();

  const x=
    Object.fromEntries(
      new FormData(e)
    );


  const p={

    category:
      x.category,

    diameter:
      x.diameter.trim(),

    description:
      x.description||null,

    stock:
      Math.max(
        0,
        Math.trunc(
          num(x.stock)
        )
      ),

    min_stock:
      Math.max(
        0,
        Math.trunc(
          num(x.min_stock)
        )
      ),

    location:
      x.location||
      "Main Storage Rack",

    sub_type:
      x.sub_type||null

  };


  const r=
    x.id
      ?await db
        .from("cnc_tool_bits")
        .update(p)
        .eq("id",x.id)

      :await db
        .from("cnc_tool_bits")
        .insert(p);


  if(r.error)
    return err(
      r.error,
      "Save tool"
    );


  toast(
    "Tool saved"
  );

  closeModal();

  load();

}


function editTool(id){
  openTool(id);
}


async function stock(id,delta){

  const t=
    tools.find(
      x=>x.id===id
    );

  if(!t)
    return;


  if(
    delta<0 &&
    num(t.stock)<=0
  )
    return toast(
      "Stock is already zero.",
      true
    );


  const n=
    Math.max(
      0,
      num(t.stock)+delta
    );


  const r=
    await db
      .from("cnc_tool_bits")
      .update({
        stock:n
      })
      .eq(
        "id",
        id
      );


  if(r.error)
    return err(
      r.error,
      "Stock"
    );


  const movement = await db
    .from("tool_stock_movements")
    .insert({
      tool_id: id,
      delta,
      stock_after: n,
      reason: delta > 0
        ? "Manual stock increase"
        : "Manual stock decrease"
    });

  if(movement.error){
    // Best-effort rollback so the stock quantity and movement ledger stay aligned.
    await db
      .from("cnc_tool_bits")
      .update({stock: num(t.stock)})
      .eq("id", id);

    return err(movement.error, "Stock movement");
  }

  toast(
    "Stock updated"
  );

  load();

}


async function deleteTool(id){

  if(
    !confirm(
      "Move this tool to Recovery?"
    )
  )
    return;


  const r=
    await db
      .from("cnc_tool_bits")
      .update({

        is_deleted:true,

        deleted_at:
          new Date().toISOString()

      })
      .eq(
        "id",
        id
      );


  if(r.error)
    return err(
      r.error,
      "Dispose"
    );


  toast(
    "Tool moved to Recovery"
  );

  load();

}


async function deleteProfile(id){

  if(
    !confirm(
      "Move this profile to Recovery?"
    )
  )
    return;


  const r=
    await db
      .from("cnc_cycle_times")
      .update({

        is_deleted:true,

        deleted_at:
          new Date().toISOString()

      })
      .eq(
        "id",
        id
      );


  if(r.error)
    return err(
      r.error,
      "Delete profile"
    );


  toast(
    "Profile moved to Recovery"
  );

  load();

}


async function deleteShift(id){

  if(
    !confirm(
      "Move this shift to Recovery? Production and downtime remain linked."
    )
  )
    return;


  const r=
    await db
      .from("shifts")
      .update({

        is_deleted:true,

        deleted_at:
          new Date().toISOString()

      })
      .eq(
        "id",
        id
      );


  if(r.error)
    return err(
      r.error,
      "Delete shift"
    );


  toast(
    "Shift moved to Recovery"
  );

  load();

}


async function restore(type,id){

  const table=
    type==="profile"
      ?"cnc_cycle_times"
      :type==="tool"
        ?"cnc_tool_bits"
        :"shifts";


  const r=
    await db
      .from(table)
      .update({

        is_deleted:false,

        deleted_at:null

      })
      .eq(
        "id",
        id
      );


  if(r.error)
    return err(
      r.error,
      "Restore"
    );


  toast(
    "Restored"
  );

  load();

}


function renderPlanningCart(){

  const list=
    $("planningCartList");

  if(!list)
    return;


  populatePlanningDropdown();


  if(!planningCart.length){

    list.innerHTML=
      '<p class="text-xs text-slate-400 italic">No profiles in the job assembly queue.</p>';

    $("calcTotalQty").textContent=
      "0 pcs";

    $("calcTheorTime").textContent=
      "0h 0m";

    $("calcShiftRequirement").textContent=
      "0.0";

    return;

  }


  let qty=0;
  let seconds=0;


  list.innerHTML=
    planningCart
      .map((x,i)=>{

        const total=
          (
            x.cycle_seconds+
            x.handling_seconds
          )*
          x.qty;

        qty+=x.qty;
        seconds+=total;


        return `
        <div class="planner-item">

          <div>

            <b>
              ${esc(x.profile)}
            </b>

            <span>
              Qty ${x.qty}
              · Cycle ${x.cycle_seconds}s
              · Handling ${x.handling_seconds}s
            </span>

          </div>

          <div>

            <strong>
              ${fmtSec(total)}
            </strong>

            <button
              onclick="removePlanningItem(${i})"
              class="text-rose-600 font-black"
            >
              ×
            </button>

          </div>

        </div>`;

      })
      .join("");


  $("calcTotalQty").textContent=
    `${qty} pcs`;

  $("calcTheorTime").textContent=
    fmtSec(seconds);


  const shiftHrs=
    Math.max(
      .1,
      num(
        $("planShiftHrs")?.value
      )||12
    );


  const breakMins=
    Math.max(
      0,
      num(
        $("planBreakMins")?.value
      )||90
    );


  const net=
    (
      shiftHrs*60-
      breakMins
    )*60;


  const avg=
    oee.length
      ?oee.reduce(
        (s,r)=>
          s+num(r.oee),
        0
      )/oee.length
      :.75;


  const usable=
    Math.max(
      .01,
      avg||.75
    );


  $("calcShiftRequirement").textContent=
    net>0
      ?(
        (seconds/net)/
        usable
      ).toFixed(1)
      :"0.0";


  $("planAvgOee").textContent=
    `Planning factor: ${pct(usable)} average OEE`;

}


function populatePlanningDropdown(){

  const sel=
    $("planProfileSelect");

  if(!sel)
    return;


  sel.innerHTML=
    '<option value="">-- Choose Profile --</option>'+
    profiles
      .map(
        p=>
          `<option value="${p.id}">
            ${esc(p.profile_code)}
            (${num(p.cycle_seconds)}s)
          </option>`
      )
      .join("");

}


function addProfileToPlanningCart(){

  const id=
    $("planProfileSelect").value;

  const p=
    profiles.find(
      x=>String(x.id)===String(id)
    );


  if(!p)
    return toast(
      "Select a CNC profile first.",
      true
    );


  const h=
    Math.max(
      0,
      num(
        $("planHandlingSec").value
      )
    );


  const q=
    Math.max(
      1,
      Math.trunc(
        num(
          $("planBatchQty").value
        )
      )
    );


  planningCart.push({

    id:p.id,

    profile:
      p.profile_code,

    cycle_seconds:
      num(p.cycle_seconds),

    handling_seconds:
      h,

    qty:q

  });


  renderPlanningCart();

}


function removePlanningItem(i){

  planningCart.splice(
    i,
    1
  );

  renderPlanningCart();

}


function clearPlanningCart(){

  planningCart=[];

  renderPlanningCart();

}


function exportTraveler(){

  if(!planningCart.length)
    return toast(
      "Planner queue is empty.",
      true
    );


  const {jsPDF}=
    window.jspdf;

  const doc=
    new jsPDF(
      "p",
      "mm",
      "a4"
    );


  doc.setFontSize(16);

  doc.text(
    "CNC 5000 - Production Traveler Sheet",
    14,
    16
  );


  doc.setFontSize(9);

  doc.text(
    `ALUMEX PLC - Component Plant | Generated ${new Date().toLocaleString()}`,
    14,
    23
  );


  const rows=
    planningCart.map(
      (x,i)=>
        [
          i+1,
          x.profile,
          `${x.cycle_seconds}s`,
          `${x.handling_seconds}s`,
          x.qty,
          fmtSec(
            (
              x.cycle_seconds+
              x.handling_seconds
            )*
            x.qty
          )
        ]
    );


  doc.autoTable({

    head:[
      [
        "#",
        "Profile",
        "Cycle",
        "Handling",
        "Qty",
        "Total"
      ]
    ],

    body:rows,

    startY:30,

    styles:{
      fontSize:8
    },

    headStyles:{
      fillColor:[
        37,
        99,
        235
      ]
    }

  });


  doc.save(
    `CNC5000_Traveler_${today()}.pdf`
  );


  toast(
    "Traveler exported"
  );

}


function createRequisition(){

  const low=
    tools.filter(
      t=>num(t.stock)<3
    );


  if(!low.length)
    return toast(
      "No tools are below 3 pcs."
    );


  openModal(

    "Critical Tool Restock Requisition",

    `
    <div class="space-y-2">

      ${
        low
          .map(
            t=>
              `<div class="planner-item">

                <div>

                  <b>
                    ${esc(t.category)}
                    ${esc(t.diameter)}
                  </b>

                  <span>
                    Stock ${num(t.stock)}
                    · Minimum ${num(t.min_stock)}
                    · ${esc(t.location||"-")}
                  </span>

                </div>

                <label class="flex items-center gap-2 text-xs font-bold">

                  Qty

                  <input
                    id="req-${t.id}"
                    class="input req-qty"
                    type="number"
                    min="1"
                    value="5"
                  >

                </label>

              </div>`
          )
          .join("")
      }

    </div>

    <div class="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">

      Critical stock is defined here as
      <b>below 3 pieces</b>,
      matching the operational restock workflow.

    </div>

    <button
      id="saveReq"
      class="w-full mt-4 bg-blue-600 text-white rounded-lg py-2 text-xs font-bold"
    >
      Submit Requisition
    </button>
    `
  );


  $("saveReq").onclick=
    async()=>{

      const h=
        await db
          .from("tool_requisitions")
          .insert({

            requested_by:
              "CNC 5000 Operations",

            supervisor:
              "Mr. U.N. Kavinda",

            status:
              "Submitted",

            notes:
              `Critical stock report: ${low.length} tool(s) below 3 pcs.`

          })
          .select()
          .single();


      if(h.error)
        return err(
          h.error,
          "Requisition"
        );


      const items=
        low.map(
          t=>({

            requisition_id:
              h.data.id,

            tool_id:
              t.id,

            category:
              t.category,

            diameter:
              t.diameter,

            stock_at_request:
              t.stock,

            requested_qty:
              Math.max(
                1,
                Math.trunc(
                  num(
                    $(`req-${t.id}`).value
                  )||5
                )
              ),

            priority:
              num(t.stock)===0
                ?"Critical"
                :"Urgent"

          })
        );


      const r=
        await db
          .from(
            "tool_requisition_items"
          )
          .insert(items);


      if(r.error)
        return err(
          r.error,
          "Requisition items"
        );


      toast(
        "Restock requisition submitted"
      );

      closeModal();

      load();

    };

}


function renderCharts(){

  if(
    !$("oeeChart")||
    !$("prodChart")
  )
    return;


  const labels=
    [
      ...new Set(
        oee.map(
          x=>x.shift_date
        )
      )
    ]
    .sort()
    .slice(-14);


  const byDate=
    d=>
      oee.filter(
        x=>x.shift_date===d
      );


  const oe=
    labels.map(
      d=>{

        const rs=
          byDate(d);

        const a=
          aggregate(rs);

        return +(
          a.OEE*100
        ).toFixed(1);

      }
    );


  const po=
    labels.map(
      d=>
        byDate(d)
          .reduce(
            (s,r)=>
              s+
              num(r.total_produced)-
              num(r.rejected),
            0
          )
    );


  if(charts.oee)
    charts.oee.destroy();

  if(charts.prod)
    charts.prod.destroy();

  if(charts.down)
    charts.down.destroy();


  charts.oee=
    new Chart(
      $("oeeChart"),
      {
        type:"line",

        data:{
          labels,

          datasets:[
            {
              label:"OEE %",
              data:oe,
              tension:.3,
              borderWidth:2,
              pointRadius:3
            }
          ]
        },

        options:{
          responsive:true,
          maintainAspectRatio:false,

          plugins:{
            legend:{
              display:true
            }
          },

          scales:{
            y:{
              beginAtZero:true,
              max:100
            }
          }
        }
      }
    );


  charts.prod=
    new Chart(
      $("prodChart"),
      {
        type:"bar",

        data:{
          labels,

          datasets:[
            {
              label:"Good pcs",
              data:po,
              borderRadius:6
            }
          ]
        },

        options:{
          responsive:true,
          maintainAspectRatio:false,

          plugins:{
            legend:{
              display:true
            }
          }
        }
      }
    );


  if($("downChart")){

    const reasonMap=
      new Map();


    downtime.forEach(
      d=>
        reasonMap.set(
          d.reason||"Other",

          (
            reasonMap.get(
              d.reason||"Other"
            )||0
          )+
          num(d.duration_min)
        )
    );


    const dl=
      [...reasonMap.keys()]
        .slice(0,10);


    const dv=
      dl.map(
        x=>reasonMap.get(x)
      );


    charts.down=
      new Chart(
        $("downChart"),
        {
          type:"bar",

          data:{
            labels:dl,

            datasets:[
              {
                label:"Minutes",
                data:dv,
                borderRadius:5
              }
            ]
          },

          options:{
            indexAxis:"y",
            responsive:true,
            maintainAspectRatio:false,

            plugins:{
              legend:{
                display:true
              }
            }
          }
        }
      );

  }

}


function reportRange(){

  const type=
    $("repDateFilter")?.value||
    "30";


  let start=
    "1970-01-01";

  let end=
    today();


  if(type==="7"){

    const d=
      new Date();

    d.setDate(
      d.getDate()-6
    );

    start=
      d.toISOString()
        .slice(0,10);

  }

  else if(type==="30"){

    const d=
      new Date();

    d.setDate(
      d.getDate()-29
    );

    start=
      d.toISOString()
        .slice(0,10);

  }

  else if(type==="custom"){

    start=
      $("repStartDate")?.value||
      start;

    end=
      $("repEndDate")?.value||
      end;

  }


  return {
    start,
    end
  };

}


function getReportRows(){

  const r=
    reportRange();

  return oee.filter(
    x=>
      x.shift_date>=r.start &&
      x.shift_date<=r.end
  );

}


function updateReportPreview(){

  if(!$("prevShifts"))
    return;


  const rows=
    getReportRows();

  const a=
    aggregate(rows);


  $("prevShifts").textContent=
    rows.length;

  $("prevProduced").textContent=
    a.total.toLocaleString();

  $("prevScrap").textContent=
    a.reject.toLocaleString();

  $("prevGood").textContent=
    a.good.toLocaleString();

  $("prevOee").textContent=
    pct(a.OEE);


  const map=
    new Map();


  rows
    .slice()
    .reverse()
    .forEach(
      r=>{

        if(!map.has(r.shift_date))
          map.set(
            r.shift_date,
            []
          );

        map
          .get(r.shift_date)
          .push(r);

      }
    );


  const labels=
    [...map.keys()]
      .slice(-14);


  const vals=
    labels.map(
      d=>
        aggregate(
          map.get(d)
        ).OEE*100
    );


  if(charts.report)
    charts.report.destroy();


  if($("reportChart")){

    charts.report=
      new Chart(
        $("reportChart"),
        {
          type:"line",

          data:{
            labels,

            datasets:[
              {
                label:"OEE %",
                data:vals,
                tension:.3,
                borderWidth:2,
                pointRadius:3
              }
            ]
          },

          options:{
            responsive:true,
            maintainAspectRatio:false,

            scales:{
              y:{
                beginAtZero:true,
                max:100
              }
            }
          }
        }
      );

  }


  $("reportPreviewTable").innerHTML=
    rows
      .slice(0,30)
      .map(
        r=>
          `<tr>

            <td class="p-2">
              ${esc(r.shift_date)}
            </td>

            <td class="p-2">
              ${esc(r.shift_type)}
            </td>

            <td class="p-2">
              ${esc(r.team||"-")}
            </td>

            <td class="p-2 text-center">
              ${num(r.total_produced)}
            </td>

            <td class="p-2 text-center">
              ${num(r.rejected)}
            </td>

            <td class="p-2 text-center">
              ${pct(r.oee)}
            </td>

          </tr>`
      )
      .join("")
      ||
      `<tr>
        <td colspan="6" class="p-6 text-center text-slate-400">
          No records in selected period.
        </td>
      </tr>`;

}


function toggleCustomReport(){

  const custom=
    $("repDateFilter").value===
    "custom";


  $("repCustomDateRow")
    .classList
    .toggle(
      "hidden",
      !custom
    );


  updateReportPreview();

}


function filteredProduction(rows){

  const ids=
    new Set(
      rows.map(
        r=>r.id
      )
    );


  return productions.filter(
    p=>ids.has(p.shift_id)
  );

}


function exportReportExcel(){

  const rows=
    getReportRows();

  const prod=
    filteredProduction(rows);

  const down=
    downtime.filter(
      d=>
        new Set(
          rows.map(
            r=>r.id
          )
        ).has(
          d.shift_id
        )
    );


  const wb=
    XLSX.utils.book_new();


  XLSX.utils.book_append_sheet(

    wb,

    XLSX.utils.json_to_sheet(

      rows.map(
        r=>({

          Date:
            r.shift_date,

          Shift:
            r.shift_type,

          Team:
            r.team||"",

          Operator:
            r.operator_name||"",

          Planned_Min:
            r.planned_minutes,

          Operating_Min:
            r.operating_minutes,

          Produced:
            r.total_produced,

          Good:
            r.good_parts,

          Reject:
            r.rejected,

          Downtime_Min:
            r.downtime_minutes,

          Availability:
            pct(r.availability),

          Performance_Raw:
            pct(r.performance_raw),

          Quality:
            pct(r.quality),

          OEE:
            pct(r.oee)

        })
      )

    ),

    "Shift_OEE"

  );


  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(prod),
    "Production"
  );


  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(down),
    "Downtime"
  );


  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(profiles),
    "Profiles"
  );


  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tools),
    "Tools"
  );


  XLSX.writeFile(
    wb,
    `CNC5000_Filtered_Report_${today()}.xlsx`
  );


  toast(
    "Filtered Excel exported"
  );

}


function generateCustomPDF(){

  const rows=
    getReportRows();


  if(!rows.length)
    return toast(
      "No shift data in selected period.",
      true
    );


  const a=
    aggregate(rows);


  const {jsPDF}=
    window.jspdf;


  const doc=
    new jsPDF(
      "p",
      "mm",
      "a4"
    );


  const title=
    $("repTitle").value||
    "CNC 5000 OEE & Production Report";


  const prepared=
    $("repPrepName").value||
    "CNC 5000 Operations";


  const role=
    $("repPrepRole").value||
    "Operations";


  const reviewer=
    $("repReviewer").value||
    "";


  const plant=
    $("repPlantName").value||
    "Alumex PLC - Sapugaskanda";


  doc.setFontSize(17);

  doc.text(
    plant,
    14,
    15
  );


  doc.setFontSize(12);

  doc.text(
    title,
    14,
    23
  );


  doc.setFontSize(8);

  doc.text(
    `Period: ${reportRange().start} to ${reportRange().end} | Prepared by: ${prepared} (${role})`,
    14,
    29
  );


  if(reviewer){

    doc.text(
      `Reviewed by: ${reviewer}`,
      14,
      34
    );

  }


  doc.setFontSize(10);

  doc.text(
    `OEE ${pct(a.OEE)} | Availability ${pct(a.A)} | Performance ${pct(a.Praw)} raw | Quality ${pct(a.Q)}`,
    14,
    41
  );


  let y=46;


  if($("chkExecSum").checked){

    doc.autoTable({

      head:[
        [
          "Metric",
          "Value"
        ]
      ],

      body:[
        [
          "Shifts",
          rows.length
        ],
        [
          "Total output",
          a.total
        ],
        [
          "Good output",
          a.good
        ],
        [
          "Scrap",
          a.reject
        ],
        [
          "Downtime",
          `${a.down.toFixed(1)} min`
        ],
        [
          "OEE",
          pct(a.OEE)
        ]
      ],

      startY:y,

      styles:{
        fontSize:8
      },

      headStyles:{
        fillColor:[
          37,
          99,
          235
        ]
      }

    });


    y=
      doc.lastAutoTable.finalY+
      8;

  }


  if($("chkYield").checked){

    doc.setFontSize(11);

    doc.text(
      "Yield Analysis",
      14,
      y
    );


    y+=3;


    doc.autoTable({

      head:[
        [
          "Date",
          "Shift",
          "Team",
          "Produced",
          "Good",
          "Scrap",
          "OEE"
        ]
      ],

      body:
        rows
          .slice(0,80)
          .map(
            r=>[
              r.shift_date,
              r.shift_type,
              r.team||"-",
              r.total_produced,
              r.good_parts,
              r.rejected,
              pct(r.oee)
            ]
          ),

      startY:y+2,

      styles:{
        fontSize:7
      },

      headStyles:{
        fillColor:[
          5,
          150,
          105
        ]
      }

    });


    y=
      doc.lastAutoTable.finalY+
      8;

  }


  if($("chkDown").checked){

    const rs=
      downtime.filter(
        d=>
          rows.some(
            r=>r.id===d.shift_id
          )
      );


    doc.setFontSize(11);

    doc.text(
      "Downtime Logs",
      14,
      y
    );


    doc.autoTable({

      head:[
        [
          "Shift ID",
          "Reason",
          "Minutes",
          "Notes"
        ]
      ],

      body:
        rs
          .slice(0,80)
          .map(
            d=>[
              d.shift_id,
              d.reason,
              num(
                d.duration_min
              ).toFixed(1),
              d.notes||"-"
            ]
          ),

      startY:y+3,

      styles:{
        fontSize:7
      },

      headStyles:{
        fillColor:[
          220,
          38,
          38
        ]
      }

    });

  }


  doc.save(
    `CNC5000_${title.replace(
      /[^a-z0-9]+/gi,
      "_"
    )}_${today()}.pdf`
  );


  toast(
    "Professional PDF generated"
  );

}


function exportExcel(){
  exportReportExcel();
}


function exportPDF(){
  generateCustomPDF();
}


function printReport(){
  window.print();
}


window.addEventListener(
  "load",
  load
);
