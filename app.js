const TABLES = [
  ["Students","Students"],
  ["attendance","Attendance"],
  ["fee_payments","Fee Payments"],
  ["parents","Parents"],
  ["results","Results"],
  ["school_classes","School Classes"],
  ["student_parents","Student Parents"],
  ["subjects","Subjects"],
  ["teachers","Teachers"]
];

let client=null,
    currentTable=null,
    rows=[],
    columns=[],
    editingId=null;

function $(id){
  return document.getElementById(id);
}

function esc(v){
  return String(v??"").replace(
    /[&<>"']/g,
    c=>({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[c])
  );
}

function pretty(s){
  return s
    .replaceAll("_"," ")
    .replace(/\b\w/g,c=>c.toUpperCase());
}

function init(){
  const nav=$("nav");

  nav.innerHTML=
    '<button class="active" data-page="dashboard">🏠 Dashboard</button>'+
    TABLES.map(([t,l])=>
      `<button data-table="${esc(t)}">▦ ${esc(l)}</button>`
    ).join("");

  nav.querySelectorAll("button").forEach(b=>{
    b.onclick=()=>{
      nav.querySelectorAll("button")
        .forEach(x=>x.classList.remove("active"));

      b.classList.add("active");

      if(b.dataset.page==="dashboard"){
        showDashboard(b);
      }else{
        openTable(b.dataset.table,b);
      }

      document
        .querySelector(".sidebar")
        ?.classList.remove("open");
    };
  });

  $("refreshBtn").onclick=()=>{
    currentTable
      ? loadTable(currentTable)
      : loadDashboard();
  };

  $("search").oninput=renderRows;

  $("addBtn").onclick=()=>{
    openForm();
  };

  $("menuBtn").onclick=()=>{
    document
      .querySelector(".sidebar")
      .classList.toggle("open");
  };

  const c=window.IFEKA_CONFIG||{};

  if(
    !c.SUPABASE_URL ||
    c.SUPABASE_URL.includes("PASTE_") ||
    !c.SUPABASE_ANON_KEY ||
    c.SUPABASE_ANON_KEY.includes("PASTE_")
  ){
    $("status").textContent=
      "Supabase connection not configured yet.";

    loadCardsLocal();
    return;
  }

  client=supabase.createClient(
    c.SUPABASE_URL,
    c.SUPABASE_ANON_KEY
  );

  loadDashboard();
}

async function loadDashboard(){
  $("status").textContent=
    "Connected. Loading school records…";

  const counts=await Promise.all(
    TABLES.map(async ([t])=>{
      try{
        const {count,error}=await client
          .from(t)
          .select("*",{count:"exact",head:true});

        return error ? 0 : (count||0);
      }catch(e){
        return 0;
      }
    })
  );

  $("cards").innerHTML=
    TABLES.slice(0,4)
      .map(([t,l],i)=>
        `<div class="card">
          <div class="label">${l}</div>
          <div class="num">${counts[i]}</div>
        </div>`
      )
      .join("")+
    `<div class="card">
      <div class="label">Total Modules</div>
      <div class="num">${TABLES.length}</div>
    </div>`;

  $("status").textContent=
    "Supabase connected.";
}

function loadCardsLocal(){
  $("cards").innerHTML=
    TABLES.slice(0,4)
      .map(([t,l])=>
        `<div class="card">
          <div class="label">${l}</div>
          <div class="num">—</div>
        </div>`
      )
      .join("")+
    `<div class="card">
      <div class="label">Database</div>
      <div class="num">Ready</div>
    </div>`;
}

function showDashboard(btn){
  currentTable=null;

  $("dashboard")
    .classList
    .remove("hidden");

  $("tableView")
    .classList
    .add("hidden");

  $("pageTitle").textContent="Dashboard";

  document
    .querySelectorAll("nav button")
    .forEach(x=>x.classList.remove("active"));

  btn.classList.add("active");

  loadDashboard();
}

async function openTable(t,btn){
  currentTable=t;

  $("dashboard")
    .classList
    .add("hidden");

  $("tableView")
    .classList
    .remove("hidden");

  $("pageTitle").textContent=pretty(t);

  document
    .querySelectorAll("nav button")
    .forEach(x=>x.classList.remove("active"));

  btn.classList.add("active");

  if(!client){
    $("status").textContent=
      "Add your Supabase URL and public anon key in config.js first.";
    return;
  }

  await loadTable(t);
}

async function loadTable(t){
  $("status").textContent=
    "Loading "+pretty(t)+"…";

  const {data,error}=await client
    .from(t)
    .select("*")
    .limit(200);

  if(error){
    $("status").textContent=
      "Database error: "+error.message;

    $("thead").innerHTML="";
    $("tbody").innerHTML="";

    return;
  }

  rows=data||[];

  columns=rows.length
    ? Object.keys(rows[0])
    : [];

  if(!columns.length){
    $("status").textContent=
      "Table is empty. Add a record using the database schema, or we can configure its form next.";

    $("thead").innerHTML="";
    $("tbody").innerHTML="";

    $("empty")
      .classList
      .remove("hidden");

    return;
  }

  $("empty")
    .classList
    .add("hidden");

  $("status").textContent=
    `${rows.length} record(s) loaded.`;

  renderRows();
}

function renderRows(){
  const q=($("search").value||"")
    .toLowerCase();

  const filtered=rows.filter(r=>
    columns.some(c=>
      String(r[c]??"")
        .toLowerCase()
        .includes(q)
    )
  );

  $("thead").innerHTML=
    "<tr>"+
    columns
      .map(c=>`<th>${esc(pretty(c))}</th>`)
      .join("")+
    "<th>Actions</th></tr>";

  $("tbody").innerHTML=
    filtered
      .map(r=>
        `<tr>
          ${columns
            .map(c=>`<td>${esc(r[c])}</td>`)
            .join("")}
          <td class="actions">
            <button
              class="small-btn"
              onclick="editRow(${rows.indexOf(r)})">
              Edit
            </button>

            <button
              class="small-btn danger"
              onclick="deleteRow(${rows.indexOf(r)})">
              Delete
            </button>
          </td>
        </tr>`
      )
      .join("");
}

function editRow(i){
  openForm(rows[i]);
}

function openForm(row=null){
  if(!columns.length){
    alert(
      "This table has no existing records, so its columns are not available to this generic form yet. We will configure the empty table form next."
    );
    return;
  }

  editingId=row?.id??null;

  $("dialogTitle").textContent=
    row ? "Edit Record" : "Add Record";

  $("formFields").innerHTML=
    columns
      .filter(c=>c!=="created_at")
      .map(c=>{
        const v=row?.[c]??"";
        let type="text";

        if(c.includes("date")||c==="dob")
          type="date";
        else if(c.includes("email"))
          type="email";
        else if(c.includes("phone"))
          type="tel";

        return `
          <div class="field">
            <label>${esc(pretty(c))}</label>
            <input
              name="${esc(c)}"
              type="${type}"
              value="${esc(v)}"
              ${c==="id"&&row?"readonly":""}>
          </div>`;
      })
      .join("");

  $("recordDialog").showModal();
}

$("recordForm").onsubmit=async e=>{
  e.preventDefault();

  if(!client||!currentTable)
    return;

  const data=Object.fromEntries(
    new FormData(e.target).entries()
  );

  Object.keys(data).forEach(k=>{
    if(data[k]==="")
      data[k]=null;
  });

  $("saveBtn").disabled=true;

  let result;

  /* =========================
     EDIT / UPDATE
     ========================= */

  if(editingId!=null){

    result=await client
      .from(currentTable)
      .update(data)
      .eq("id",editingId)
      .select()
      .limit(1);

    if(result.error){
      $("saveBtn").disabled=false;

      alert(
        "Update failed:\n\n"+
        result.error.message
      );

      return;
    }

    /*
      If Supabase returns zero rows,
      the UPDATE policy may be blocking
      the operation or the ID may not match.
    */

    if(!result.data || result.data.length===0){
      $("saveBtn").disabled=false;

      alert(
        "The record was not updated.\n\n"+
        "Please check the UPDATE RLS policy "+
        "for the "+currentTable+" table."
      );

      return;
    }

  }else{

    /* =========================
       ADD / INSERT
       ========================= */

    delete data.id;

    result=await client
      .from(currentTable)
      .insert(data);

    if(result.error){
      $("saveBtn").disabled=false;

      alert(
        "Save failed:\n\n"+
        result.error.message
      );

      return;
    }
  }

  $("saveBtn").disabled=false;

  $("recordDialog").close();

  await loadTable(currentTable);
};

/* =========================
   DELETE
   ========================= */

async function deleteRow(i){

  const r=rows[i];

  if(r?.id==null){
    alert(
      "This record has no numeric id available for the generic delete action."
    );
    return;
  }

  if(!confirm(
    "Delete this record? This cannot be undone."
  )){
    return;
  }

  const {data,error}=await client
    .from(currentTable)
    .delete()
    .eq("id",r.id)
    .select()
    .limit(1);

  if(error){
    alert(
      "Delete failed:\n\n"+
      error.message
    );

    return;
  }

  if(!data || data.length===0){
    alert(
      "The record was not deleted.\n\n"+
      "Please check the DELETE RLS policy "+
      "for the "+currentTable+" table."
    );

    return;
  }

  await loadTable(currentTable);
}

window.editRow=editRow;
window.deleteRow=deleteRow;

init();  if(!c.SUPABASE_URL||c.SUPABASE_URL.includes("PASTE_")||!c.SUPABASE_ANON_KEY||c.SUPABASE_ANON_KEY.includes("PASTE_")){
    $("status").textContent="Supabase connection not configured yet.";
    loadCardsLocal();
    return;
  }
  client=supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);
  loadDashboard();
}
async function loadDashboard(){
  $("status").textContent="Connected. Loading school records…";
  const counts=await Promise.all(TABLES.map(async ([t])=>{
    try{const {count,error}=await client.from(t).select("*",{count:"exact",head:true});return error?0:(count||0)}
    catch(e){return 0}
  }));
  $("cards").innerHTML=TABLES.slice(0,4).map(([t,l],i)=>`<div class="card"><div class="label">${l}</div><div class="num">${counts[i]}</div></div>`).join("")+
    `<div class="card"><div class="label">Total Modules</div><div class="num">${TABLES.length}</div></div>`;
  $("status").textContent="Supabase connected.";
}
function loadCardsLocal(){
  $("cards").innerHTML=TABLES.slice(0,4).map(([t,l])=>`<div class="card"><div class="label">${l}</div><div class="num">—</div></div>`).join("")+
  `<div class="card"><div class="label">Database</div><div class="num">Ready</div></div>`;
}
function showDashboard(btn){
  currentTable=null;$("dashboard").classList.remove("hidden");$("tableView").classList.add("hidden");
  $("pageTitle").textContent="Dashboard";document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
  loadDashboard();
}
async function openTable(t,btn){
  currentTable=t;$("dashboard").classList.add("hidden");$("tableView").classList.remove("hidden");
  $("pageTitle").textContent=pretty(t);document.querySelectorAll("nav button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");
  if(!client){$("status").textContent="Add your Supabase URL and public anon key in config.js first.";return}
  await loadTable(t);
}
async function loadTable(t){
  $("status").textContent="Loading "+pretty(t)+"…";
  const {data,error}=await client.from(t).select("*").limit(200);
  if(error){$("status").textContent="Database error: "+error.message;$("thead").innerHTML="";$("tbody").innerHTML="";return}
  rows=data||[];columns=rows.length?Object.keys(rows[0]):[];
  if(!columns.length){
    // Try to infer columns from a harmless select result; empty tables need explicit schema.
    $("status").textContent="Table is empty. Add a record using the database schema, or we can configure its form next.";
    $("thead").innerHTML="";$("tbody").innerHTML="";$("empty").classList.remove("hidden");return;
  }
  $("empty").classList.add("hidden");$("status").textContent=`${rows.length} record(s) loaded.`;renderRows();
}
function renderRows(){
  const q=($("search").value||"").toLowerCase();
  const filtered=rows.filter(r=>columns.some(c=>String(r[c]??"").toLowerCase().includes(q)));
  $("thead").innerHTML="<tr>"+columns.map(c=>`<th>${esc(pretty(c))}</th>`).join("")+"<th>Actions</th></tr>";
  $("tbody").innerHTML=filtered.map((r,i)=>`<tr>${columns.map(c=>`<td>${esc(r[c])}</td>`).join("")}<td class="actions"><button class="small-btn" onclick="editRow(${rows.indexOf(r)})">Edit</button><button class="small-btn danger" onclick="deleteRow(${rows.indexOf(r)})">Delete</button></td></tr>`).join("");
}
function editRow(i){openForm(rows[i])}
function openForm(row=null){
  if(!columns.length){alert("This table has no existing records, so its columns are not available to this generic form yet. We will configure the empty table form next.");return}
  editingId=row?.id??null;$("dialogTitle").textContent=row?"Edit Record":"Add Record";
  $("formFields").innerHTML=columns.filter(c=>c!=="created_at").map(c=>{
    const v=row?.[c]??"";let type="text";
    if(c.includes("date")||c==="dob")type="date";
    else if(c.includes("email"))type="email";
    else if(c.includes("phone"))type="tel";
    return `<div class="field"><label>${esc(pretty(c))}</label><input name="${esc(c)}" type="${type}" value="${esc(v)}" ${c==="id"&&row?"readonly":""}></div>`
  }).join("");
  $("recordDialog").showModal();
}
$("recordForm").onsubmit=async e=>{
  e.preventDefault();
  if(!client||!currentTable)return;
  const data=Object.fromEntries(new FormData(e.target).entries());
  Object.keys(data).forEach(k=>{if(data[k]==="")data[k]=null});
  $("saveBtn").disabled=true;
  let result;
  if(editingId!=null) result=await client.from(currentTable).update(data).eq("id",editingId);
  else {delete data.id;result=await client.from(currentTable).insert(data)}
  $("saveBtn").disabled=false;
  if(result.error){alert(result.error.message);return}
  $("recordDialog").close();await loadTable(currentTable);
};
async function deleteRow(i){
  const r=rows[i];if(r?.id==null){alert("This record has no numeric id available for the generic delete action.");return}
  if(!confirm("Delete this record? This cannot be undone."))return;
  const {error}=await client.from(currentTable).delete().eq("id",r.id);
  if(error)alert(error.message);else await loadTable(currentTable);
}
window.editRow=editRow;window.deleteRow=deleteRow;
init();
