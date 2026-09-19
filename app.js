from pathlib import Path
code = r'''/* ========================================================= Ifeka School Management - app.js Clean replacement version ========================================================= */
const TABLES = [ ["Students", "Students"], ["teachers", "Teachers"], ["parents", "Parents"], ["school_classes", "Classes"], ["subjects", "Subjects"], ["attendance", "Attendance"], ["results", "Results"], ["fee_payments", "Fee Payments"], ["student_parents", "Student Parents"] ];
/* Fields used when a table is empty and therefore has no rows from which the application can automatically discover columns. */ const FORM_FIELDS = { Students: [ "student_id","first_name","last_name","gender","date_of_birth", "phone","email","address","class_id","photo_url" ], teachers: [ "teacher_id","first_name","last_name","gender","phone","email", "address","qualification","subject","date_of_birth" ], parents: [ "parent_id","first_name","last_name","relationship","phone", "email","address","occupation" ], school_classes: [ "class_name","section","session","teacher_id" ], subjects: [ "subject_code","subject_name","class_id" ], attendance: [ "student_id","date","status","remark" ], results: [ "student_id","subject_id","session","term", "ca_score","exam_score","total","grade","remark" ], fee_payments: [ "student_id","amount","payment_date","payment_method", "term","session","reference","remark" ], student_parents: [ "student_id","parent_id","relationship" ] };
let client = null; let currentTable = null; let rows = []; let columns = []; let editingId = null;
function $(id) { return document.getElementById(id); }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "'" }[c])); }
function pretty(value) { return String(value) .replaceAll("_", " ") .replace(/\b\w/g, c => c.toUpperCase()); }
function tableLabel(table) { const found = TABLES.find(x => x[0] === table); return found ? found[1] : pretty(table); }
function init() { const nav = $("nav");
nav.innerHTML = <button class="active" data-page="dashboard">🏠 Dashboard</button> + TABLES.map(([table, label]) => <button data-table="${esc(table)}">▦ ${esc(label)}</button> ).join("");
nav.querySelectorAll("button").forEach(button => { button.onclick = () => { nav.querySelectorAll("button") .forEach(x => x.classList.remove("active"));
button.classList.add("active");

  if (button.dataset.page === "dashboard") {
    showDashboard(button);
  } else {
    openTable(button.dataset.table, button);
  }

  document.querySelector(".sidebar")?.classList.remove("open");
};
});
$("refreshBtn").onclick = () => { currentTable ? loadTable(currentTable) : loadDashboard(); };
$("search").oninput = renderRows;
$("addBtn").onclick = () => openForm();
$("menuBtn").onclick = () => { document.querySelector(".sidebar")?.classList.toggle("open"); };
$("recordForm").onsubmit = saveRecord;
const config = window.IFEKA_CONFIG || {};
if ( !config.SUPABASE_URL || config.SUPABASE_URL.includes("PASTE_") || !config.SUPABASE_ANON_KEY || config.SUPABASE_ANON_KEY.includes("PASTE_") ) { $("status").textContent = "Supabase connection not configured yet."; loadCardsLocal(); return; }
client = supabase.createClient( config.SUPABASE_URL, config.SUPABASE_ANON_KEY );
loadDashboard(); }
async function loadDashboard() { if (!client) { loadCardsLocal(); return; }
$("status").textContent = "Connected. Loading school records…";
const counts = await Promise.all( TABLES.map(async ([table]) => { try { const { count, error } = await client .from(table) .select("*", { count: "exact", head: true });
return error ? 0 : (count || 0);
  } catch {
    return 0;
  }
})
);
$("cards").innerHTML = TABLES.map(([table, label], i) => <div class="card"> <div class="label">${esc(label)}</div> <div class="num">${counts[i]}</div> </div> ).join("") + ` Total Modules ${TABLES.length}
�
`;
$("status").textContent = "Supabase connected."; }
function loadCardsLocal() { $("cards").innerHTML = TABLES.map(([table, label]) => <div class="card"> <div class="label">${esc(label)}</div> <div class="num">—</div> </div> ).join("") + <div class="card"> <div class="label">Database</div> <div class="num">Ready</div> </div>; }
function showDashboard(button) { currentTable = null;
$("dashboard").classList.remove("hidden"); $("tableView").classList.add("hidden"); $("pageTitle").textContent = "Dashboard";
document.querySelectorAll("nav button") .forEach(x => x.classList.remove("active"));
button.classList.add("active"); loadDashboard(); }
async function openTable(table, button) { currentTable = table;
$("dashboard").classList.add("hidden"); $("tableView").classList.remove("hidden"); $("pageTitle").textContent = tableLabel(table);
document.querySelectorAll("nav button") .forEach(x => x.classList.remove("active"));
button.classList.add("active");
if (!client) { $("status").textContent = "Add your Supabase URL and public anon key in config.js first."; return; }
await loadTable(table); }
async function loadTable(table) { $("status").textContent = "Loading " + tableLabel(table) + "…";
const { data, error } = await client .from(table) .select("*") .limit(200);
if (error) { $("status").textContent = "Database error: " + error.message; $("thead").innerHTML = ""; $("tbody").innerHTML = ""; $("empty").classList.remove("hidden"); return; }
rows = data || [];
if (rows.length) { columns = Object.keys(rows[0]); $("empty").classList.add("hidden"); $("status").textContent = ${rows.length} record(s) loaded.; renderRows(); return; }
/* Empty table: use the known application schema so Add Record can still open. */ columns = FORM_FIELDS[table] || [];
$("thead").innerHTML = ""; $("tbody").innerHTML = ""; $("empty").classList.remove("hidden");
$("status").textContent = Table is empty. ${tableLabel(table)} is ready for a new record.; }
function renderRows() { const search = ($("search").value || "").toLowerCase();
const filtered = rows.filter(row => columns.some(column => String(row[column] ?? "") .toLowerCase() .includes(search) ) );
$("empty").classList.toggle("hidden", filtered.length > 0);
$("thead").innerHTML = "" + columns.map(column => <th>${esc(pretty(column))}</th> ).join("") + "Actions";
$("tbody").innerHTML = filtered.map(row => <tr> ${columns.map(column => ${formatCell(row[column])} ).join("")} <td class="actions"> <button class="small-btn" onclick="editRow(${rows.indexOf(row)})">Edit</button> <button class="small-btn danger" onclick="deleteRow(${rows.indexOf(row)})">Delete</button> </td> </tr> ).join(""); }
function formatCell(value) { if (value == null) return "";
const text = String(value);
if ( /^https?:///i.test(text) && /.(jpg|jpeg|png|gif|webp)(?.*)?$/i.test(text) ) { return <img src="${esc(text)}" alt="Photo" style="width:42px;height:42px;object-fit:cover;border-radius:8px">; }
return esc(text); }
function getFieldType(field) { if (field === "date" || field === "dob" || field === "date_of_birth" || field === "payment_date") return "date";
if (field.includes("email")) return "email"; if (field.includes("phone")) return "tel"; if ( field.includes("score") || field === "amount" || field === "total" ) return "number";
return "text"; }
function getFieldControl(field, value) { const v = value ?? "";
if (field === "gender") { return <select name="${esc(field)}"> <option value="">Select gender</option> <option value="Male" ${v === "Male" ? "selected" : ""}>Male</option> <option value="Female" ${v === "Female" ? "selected" : ""}>Female</option> </select>; }
if (field === "relationship") { return <select name="${esc(field)}"> <option value="">Select relationship</option> <option value="Father" ${v === "Father" ? "selected" : ""}>Father</option> <option value="Mother" ${v === "Mother" ? "selected" : ""}>Mother</option> <option value="Guardian" ${v === "Guardian" ? "selected" : ""}>Guardian</option> </select>; }
if (field === "status") { return <select name="${esc(field)}"> <option value="">Select status</option> <option value="Present" ${v === "Present" ? "selected" : ""}>Present</option> <option value="Absent" ${v === "Absent" ? "selected" : ""}>Absent</option> <option value="Late" ${v === "Late" ? "selected" : ""}>Late</option> </select>; }
if (field === "term") { return <select name="${esc(field)}"> <option value="">Select term</option> <option value="First Term" ${v === "First Term" ? "selected" : ""}>First Term</option> <option value="Second Term" ${v === "Second Term" ? "selected" : ""}>Second Term</option> <option value="Third Term" ${v === "Third Term" ? "selected" : ""}>Third Term</option> </select>; }
if (field === "payment_method") { return <select name="${esc(field)}"> <option value="">Select method</option> <option value="Cash" ${v === "Cash" ? "selected" : ""}>Cash</option> <option value="Transfer" ${v === "Transfer" ? "selected" : ""}>Transfer</option> <option value="POS" ${v === "POS" ? "selected" : ""}>POS</option> <option value="Online" ${v === "Online" ? "selected" : ""}>Online</option> </select>; }
return `<input name="${esc(field)}" type="${getFieldType(field)}" value="${esc(v)}" ${field === "id" ? 'readonly' : ''}
`; }
function openForm(row = null) { const fields = columns.length ? columns : (FORM_FIELDS[currentTable] || []);
if (!fields.length) { alert("No fields are available for this table yet."); return; }
editingId = row?.id ?? null;
$("dialogTitle").textContent = row ? Edit ${tableLabel(currentTable)} : Add ${tableLabel(currentTable)};
$("formFields").innerHTML = fields .filter(field => field !== "created_at") .map(field => { const value = row?.[field] ?? "";
return `<div class="field">
    <label>${esc(pretty(field))}</label>
    ${getFieldControl(field, value)}
  </div>`;
}).join("");
/* Student photo upload if the existing table has photo_url. */ if (currentTable === "Students" && fields.includes("photo_url")) { $("formFields").insertAdjacentHTML("beforeend", <div class="field"> <label>Student Photo</label> <input id="studentPhoto" type="file" accept="image/*"> ${row?.photo_url ?Existing photo is saved. Select another photo to replace it.: ""} </div>); }
$("recordDialog").showModal(); }
async function saveRecord(event) { event.preventDefault();
if (!client || !currentTable) return;
const formData = new FormData(event.target); const data = Object.fromEntries(formData.entries());
/* Remove empty strings. */ Object.keys(data).forEach(key => { if (data[key] === "") data[key] = null; });
/* Never manually insert an auto-generated numeric id. */ if (editingId === null) delete data.id;
const photoInput = $("studentPhoto"); const photoFile = photoInput?.files?.[0];
$("saveBtn").disabled = true;
try { if ( currentTable === "Students" && photoFile && photoFile.size > 0 ) { const extension = (photoFile.name.split(".").pop() || "jpg").toLowerCase();
const filePath =
    `${data.student_id || editingId || Date.now()}-${Date.now()}.${extension}`;

  const upload = await client.storage
    .from("student-photos")
    .upload(filePath, photoFile, {
      upsert: true,
      contentType: photoFile.type || "image/jpeg"
    });

  if (upload.error) throw upload.error;

  data.photo_url = filePath;
}

let result;

if (editingId !== null) {
  result = await client
    .from(currentTable)
    .update(data)
    .eq("id", editingId);
} else {
  result = await client
    .from(currentTable)
    .insert(data);
}

if (result.error) throw result.error;

$("recordDialog").close();
await loadTable(currentTable);
} catch (error) { alert("Save failed:\n\n" + (error.message || error)); } finally { $("saveBtn").disabled = false; } }
async function editRow(index) { openForm(rows[index]); }
async function deleteRow(index) { const row = rows[index];
if (!row?.id) { alert("This record does not have an id that can be deleted by the generic action."); return; }
if (!confirm( Delete this ${tableLabel(currentTable)} record?\n\nThis cannot be undone. )) return;
const { data, error } = await client .from(currentTable) .delete() .eq("id", row.id) .select() .limit(1);
if (error) { alert("Delete failed:\n\n" + error.message); return; }
if (!data || !data.length) { alert( "The record was not deleted.\n\n" + "Please check the DELETE RLS policy for the " + currentTable + " table." ); return; }
await loadTable(currentTable); }
window.editRow = editRow; window.deleteRow = deleteRow;
init(); '''
out = Path("/mnt/data/ifeka-school-management-app.js") out.write_text(code, encoding="utf-8") print(f"Created: {out}") print(f"Lines: {len(code.splitlines())}")
