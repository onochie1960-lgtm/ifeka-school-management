/* Ifeka School Management - CLEAN app.js */

const TABLES=[
  ["students","Students"],["teachers","Teachers"],["school_classes","Classes"],
  ["subjects","Subjects"],["parents","Parents / Guardians"],["attendance","Attendance"],
  ["results","Results"],["fee_payments","Fees & Payments"],["student_parents","Student Parents"]
];

const FORM_FIELDS={
 students:["student_id","first_name","last_name","gender","date_of_birth","phone","email","address","class_id","photo_url"],
 teachers:["teacher_id","first_name","last_name","gender","phone","email","address","qualification","subject","date_of_birth"],
 school_classes:["class_name","section","session","teacher_id"],
 subjects:["subject_code","subject_name","class_id"],
 parents:["parent_id","first_name","last_name","relationship","phone","email","address","occupation"],
 attendance:["student_id","date","status","remark"],
 results:["student_id","subject_id","session","term","ca_score","exam_score","total","grade","remark"],
 fee_payments:["student_id","amount","payment_date","payment_method","term","session","reference","remark"],
 student_parents:["student_id","parent_id","relationship"]
};

const PRIMARY_KEYS={
 students:"student_id",teachers:"teacher_id",parents:"parent_id",
 school_classes:"id",subjects:"id",attendance:"id",results:"id",
 fee_payments:"id",student_parents:"id"
};

const MODULE_MAP={
 dashboard:null,students:"students",teachers:"teachers",classes:"school_classes",
 subjects:"subjects",parents:"parents",attendance:"attendance",exams:null,
 results:"results",fees:"fee_payments",timetable:null,announcements:null,
 transport:null,reports:null,settings:null
};

const INFO_TEXT={
 exams:"Examinations module is ready for development.",
 timetable:"Timetable module is ready for development.",
 announcements:"Announcements module is ready for development.",
 transport:"Transport module is ready for development.",
 reports:"Reports module is ready for development.",
 settings:"System settings module is ready for development."
};

let db=null,currentTable=null,rows=[],columns=[],editingKey=null;

function $(id){return document.getElementById(id);}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function pretty(v){return String(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
function label(t){return TABLES.find(x=>x[0]===t)?.[1]||pretty(t);}
function pk(t){return PRIMARY_KEYS[t]||"id";}
function status(t){if($("status"))$("status").textContent=t;}
function title(t){if($("pageTitle"))$("pageTitle").textContent=t;}

async function loadDashboard(){
 currentTable=null;
 $("dashboard")?.classList.remove("hidden");
 $("tableView")?.classList.add("hidden");
 $("moduleInfo")?.classList.add("hidden");
 title("Dashboard");

 if(!db){
  status("Supabase is not connected.");
  setCount("studentCount","—");
  setCount("teacherCount","—");
  setCount("classCount","—");
  setCount("subjectCount","—");
  return;
 }

 status("Loading school records...");
 const counts={};
 let bad=false;

 for(const [table] of TABLES){
  try{
   const r=await db.from(table).select("*",{count:"exact",head:true});
   if(r.error){
    console.error(table,r.error);
    counts[table]="!";
    bad=true;
   }else{
    counts[table]=r.count??0;
   }
  }catch(e){
   console.error(e);
   counts[table]="!";
   bad=true;
  }
 }

 setCount("studentCount",counts.students);
 setCount("teacherCount",counts.teachers);
 setCount("classCount",counts.school_classes);
 setCount("subjectCount",counts.subjects);

 status(
  bad
   ?"Connected, but some tables could not be read. Check Supabase/RLS."
   :"Supabase connected."
 );
}

function setCount(id,v){
 if($(id))$(id).textContent=v;
}

function navigate(e){
 const b=e.target.closest("#nav button");
 if(!b)return;

 e.preventDefault();

 const page=b.dataset.page;
 if(!page)return;

 document.querySelectorAll("#nav button")
  .forEach(x=>x.classList.remove("active"));

 b.classList.add("active");

 document.querySelector(".sidebar")?.classList.remove("open");
 $("menuBtn")?.setAttribute("aria-expanded","false");

 if(page==="dashboard"){
  loadDashboard();
  return;
 }

 const table=MODULE_MAP[page];

 if(table){
  openTable(table);
  return;
 }

 showInfo(
  pretty(page),
  INFO_TEXT[page]||"This module is ready to be connected."
 );
}

function showInfo(t,txt){
 currentTable=null;

 $("dashboard")?.classList.add("hidden");
 $("tableView")?.classList.add("hidden");
 $("moduleInfo")?.classList.remove("hidden");

 title(t);

 if($("moduleInfoTitle"))
  $("moduleInfoTitle").textContent=t;

 if($("moduleInfoText"))
  $("moduleInfoText").textContent=txt;

 status("Module ready.");
}

async function openTable(table){
 currentTable=table;
 editingKey=null;

 $("dashboard")?.classList.add("hidden");
 $("moduleInfo")?.classList.add("hidden");
 $("tableView")?.classList.remove("hidden");

 title(label(table));

 if($("addBtn")){
  $("addBtn").hidden=false;
  $("addBtn").style.display="inline-flex";
  $("addBtn").textContent="+ Add "+label(table);
 }

 if(!db){
  status("Supabase is not connected.");
  columns=FORM_FIELDS[table]||[];
  rows=[];
  emptyTable();
  return;
 }

 await loadTable(table);
}

async function loadTable(table){
 status("Loading "+label(table)+"...");

 try{
  const r=await db
   .from(table)
   .select("*")
   .limit(200);

  if(r.error)throw r.error;

  rows=r.data||[];

  if(rows.length){
   columns=Object.keys(rows[0]);

   $("empty")?.classList.add("hidden");

   status(rows.length+" record(s) loaded.");

   renderRows();
  }else{
   columns=FORM_FIELDS[table]||[];
   emptyTable();

   status(
    "No records yet. "+
    label(table)+
    " is ready for a new record."
   );
  }

 }catch(e){
  console.error(e);

  rows=[];
  columns=FORM_FIELDS[table]||[];

  emptyTable();

  status(
   "Database error: "+
   (e.message||e)
  );
 }
}

function emptyTable(){
 if($("thead")){
  $("thead").innerHTML=
   "<tr>"+
   columns.map(c=>"<th>"+esc(pretty(c))+"</th>").join("")+
   "<th>Actions</th>"+
   "</tr>";
 }

 if($("tbody"))
  $("tbody").innerHTML="";

 $("empty")?.classList.remove("hidden");
}

function renderRows(){
 const q=(
  $("searchInput")?.value||""
 ).toLowerCase().trim();

 const filtered=rows.filter(r=>
  columns.some(c=>
   String(r[c]??"")
    .toLowerCase()
    .includes(q)
  )
 );

 $("empty")?.classList.toggle(
  "hidden",
  filtered.length>0
 );

 if($("thead")){
  $("thead").innerHTML=
   "<tr>"+
   columns.map(c=>"<th>"+esc(pretty(c))+"</th>").join("")+
   "<th>Actions</th>"+
   "</tr>";
 }

 if($("tbody")){
  $("tbody").innerHTML=filtered.map(r=>{

   const i=rows.indexOf(r);

   return "<tr>"+
    columns.map(c=>
     "<td>"+formatCell(r[c])+"</td>"
    ).join("")+

    '<td class="actions">'+
    '<button class="small-btn" data-action="view" data-index="'+i+'">View</button> '+
    '<button class="small-btn" data-action="edit" data-index="'+i+'">Edit</button> '+
    '<button class="small-btn danger" data-action="delete" data-index="'+i+'">Delete</button>'+
    "</td>"+

    "</tr>";

  }).join("");
 }
}

function formatCell(v){
 if(v==null)return "";

 const s=String(v);

 if(
  /^https?:\/\//i.test(s)&&
  /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(s)
 ){
  return '<img src="'+esc(s)+'" alt="Photo" style="width:42px;height:42px;object-fit:cover;border-radius:8px">';
 }

 return esc(s);
}

function fieldType(f){
 if(
  ["date","dob","date_of_birth","payment_date"].includes(f)
 )return"date";

 if(f.includes("email"))return"email";

 if(f.includes("phone"))return"tel";

 if(
  f.includes("score")||
  f==="amount"||
  f==="total"
 )return"number";

 return"text";
}

function control(f,v){
 v=v??"";

 if(f==="gender")
  return select(
   f,
   v,
   [["","Select gender"],["Male","Male"],["Female","Female"]]
  );

 if(f==="relationship")
  return select(
   f,
   v,
   [["","Select relationship"],["Father","Father"],["Mother","Mother"],["Guardian","Guardian"]]
  );

 if(f==="status")
  return select(
   f,
   v,
   [["","Select status"],["Present","Present"],["Absent","Absent"],["Late","Late"]]
  );

 if(f==="term")
  return select(
   f,
   v,
   [["","Select term"],["First Term","First Term"],["Second Term","Second Term"],["Third Term","Third Term"]]
  );

 if(f==="payment_method")
  return select(
   f,
   v,
   [["","Select method"],["Cash","Cash"],["Transfer","Transfer"],["POS","POS"],["Online","Online"]]
  );

 return '<input name="'+
  esc(f)+
  '" type="'+
  fieldType(f)+
  '" value="'+
  esc(v)+
  '">';
}

function select(name,v,opts){
 return '<select name="'+
  esc(name)+
  '">'+

  opts.map(o=>
   '<option value="'+
   esc(o[0])+
   '" '+
   (v===o[0]?"selected":"")+
   '>'+
   esc(o[1])+
   "</option>"
  ).join("")+

  "</select>";
}

function openForm(row=null){
 if(!currentTable){
  alert("Please select a module first.");
  return;
 }

 const fields=FORM_FIELDS[currentTable]||columns||[];

 editingKey=
  row?
   row[pk(currentTable)]??null:
   null;

 if($("dialogTitle")){
  $("dialogTitle").textContent=
   row?
    "Edit "+label(currentTable):
    "Add "+label(currentTable);
 }

 if($("formFields")){

  $("formFields").innerHTML=
   fields
   .filter(f=>
    !["created_at","updated_at"].includes(f)
   )
   .map(f=>
    '<div class="field">'+
    '<label>'+
    esc(pretty(f))+
    "</label>"+
    control(f,row?.[f]??"")+
    "</div>"
   ).join("");

  if(
   currentTable==="students"&&
   fields.includes("photo_url")
  ){
   $("formFields").insertAdjacentHTML(
    "beforeend",
    '<div class="field">'+
    '<label>Student Photo</label>'+
    '<input id="studentPhoto" type="file" accept="image/*">'+
    "</div>"
   );
  }
 }

 const d=$("recordDialog");

 if(d){
  if(d.showModal)
   d.showModal();
  else
   d.setAttribute("open","");
 }
}

function closeForm(){
 const d=$("recordDialog");

 if(d?.open)
  d.close();

 editingKey=null;
}

async function saveRecord(e){
 e.preventDefault();

 if(!db||!currentTable){
  alert("Database is not connected.");
  return;
 }

 const data=Object.fromEntries(
  new FormData(e.target).entries()
 );

 Object.keys(data).forEach(k=>{
  if(data[k]==="")
   data[k]=null;
 });

 const key=pk(currentTable);

 if(editingKey!==null)
  delete data[key];

 const file=$("studentPhoto")?.files?.[0];

 const save=$("saveBtn");

 if(save)
  save.disabled=true;

 try{

  if(
   currentTable==="students"&&
   file?.size
  ){

   const ext=
    (file.name.split(".").pop()||"jpg")
    .toLowerCase();

   const id=
    data.student_id||
    editingKey||
    Date.now();

   const path=
    id+
    "-"+
    Date.now()+
    "."+
    ext;

   const up=
    await db.storage
    .from("student-photos")
    .upload(
     path,
     file,
     {
      upsert:true,
      contentType:
       file.type||
       "image/jpeg"
     }
    );

   if(up.error)
    throw up.error;

   data.photo_url=
    db.storage
    .from("student-photos")
    .getPublicUrl(path)
    .data.publicUrl;
  }

  const r=
   editingKey!==null
   ?
    await db
    .from(currentTable)
    .update(data)
    .eq(key,editingKey)
   :
    await db
    .from(currentTable)
    .insert(data);

  if(r.error)
   throw r.error;

  closeForm();

  await loadTable(currentTable);

 }catch(err){

  console.error(err);

  alert(
   "Save failed:\n\n"+
   (err.message||err)
  );

 }finally{

  if(save)
   save.disabled=false;
 }
}

function ensureView(){

 if($("viewDialog"))
  return;

 const d=document.createElement("dialog");

 d.id="viewDialog";

 d.innerHTML=
  '<div class="dialog-head">'+
  '<h2 id="viewDialogTitle">Record Details</h2>'+
  '<button type="button" class="small-btn" id="closeViewBtn">Close</button>'+
  "</div>"+
  '<div id="viewFields" class="view-grid"></div>';

 document.body.appendChild(d);

 $("closeViewBtn").onclick=
  ()=>d.close();
}

function viewRow(i){

 const r=rows[i];

 if(!r)return;

 ensureView();

 $("viewDialogTitle").textContent=
  label(currentTable)+
  " — View Record";

 $("viewFields").innerHTML=
  columns
  .filter(f=>
   !["created_at","updated_at"].includes(f)
  )
  .map(f=>{

   const v=r[f];

   let display=
    v==null||v===""
    ?"—"
    :esc(v);

   if(
    typeof v==="string"&&
    /^https?:\/\//i.test(v)&&
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(v)
   ){
    display=
     '<img src="'+
     esc(v)+
     '" alt="Photo" style="max-width:180px;max-height:180px;object-fit:cover;border-radius:12px">';
   }

   return=
    '<div class="field">'+
    '<label>'+
    esc(pretty(f))+
    "</label>"+
    '<div class="view-value">'+
    display+
    "</div>"+
    "</div>";

  }).join("");

 $("viewDialog")?.showModal();
}

function editRow(i){
 if(rows[i])
  openForm(rows[i]);
}

async function deleteRow(i){

 const r=rows[i];

 if(!r||!db||!currentTable)
  return;

 const key=pk(currentTable);

 const value=r[key];

 if(value==null){
  alert(
   "This record has no "+
   key+
   " value."
  );
  return;
 }

 if(
  !confirm(
   "Delete this "+
   label(currentTable)+
   " record?\n\n"+
   "This cannot be undone."
  )
 )return;

 try{

  const x=
   await db
   .from(currentTable)
   .delete()
   .eq(key,value);

  if(x.error)
   throw x.error;

  await loadTable(currentTable);

 }catch(e){

  console.error(e);

  alert(
   "Delete failed:\n\n"+
   (e.message||e)
  );
 }
}

function init(){

 $("menuBtn")?.addEventListener(
  "click",
  ()=>{
   const s=
    document.querySelector(".sidebar");

   const open=
    s?.classList.toggle("open")||false;

   $("menuBtn")?.setAttribute(
    "aria-expanded",
    String(open)
   );
  }
 );

 $("nav")?.addEventListener(
  "click",
  navigate
 );

 $("refreshBtn")?.addEventListener(
  "click",
  ()=>
   currentTable?
    loadTable(currentTable):
    loadDashboard()
 );

 $("searchInput")?.addEventListener(
  "input",
  renderRows
 );

 $("addBtn")?.addEventListener(
  "click",
  ()=>openForm()
 );

 $("tbody")?.addEventListener(
  "click",
  e=>{
   const b=
    e.target.closest(
     "button[data-action]"
    );

   if(!b)return;

   const i=
    Number(b.dataset.index);

   if(b.dataset.action==="view")
    viewRow(i);

   if(b.dataset.action==="edit")
    editRow(i);

   if(b.dataset.action==="delete")
    deleteRow(i);
  }
 );

 $("closeDialogBtn")?.addEventListener(
  "click",
  e=>{
   e.preventDefault();
   closeForm();
  }
 );

 $("cancelBtn")?.addEventListener(
  "click",
  e=>{
   e.preventDefault();
   closeForm();
  }
 );

 $("recordForm")?.addEventListener(
  "submit",
  saveRecord
 );

 const c=
  window.IFEKA_CONFIG||{};

 if(
  !c.SUPABASE_URL||
  !c.SUPABASE_ANON_KEY||
  c.SUPABASE_URL.includes("PASTE_")||
  c.SUPABASE_ANON_KEY.includes("PASTE_")
 ){
  status(
   "Supabase connection is not configured."
  );
  loadDashboard();
  return;
 }

 try{

  if(!window.supabase?.createClient)
   throw new Error(
    "Supabase library did not load."
   );

  db=
   window.supabase.createClient(
    c.SUPABASE_URL,
    c.SUPABASE_ANON_KEY
   );

  status("Connecting to Supabase...");

  loadDashboard();

 }catch(e){

  console.error(e);

  status(
   "Supabase initialization failed: "+
   e.message
  );
 }
}

document.addEventListener(
 "DOMContentLoaded",
 init
);
