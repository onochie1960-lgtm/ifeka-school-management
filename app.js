/* =========================================================
   Ifeka School Management - app.js
   Clean replacement version
   ========================================================= */

const TABLES = [
  ["Students", "Students"],
  ["teachers", "Teachers"],
  ["parents", "Parents"],
  ["school_classes", "Classes"],
  ["subjects", "Subjects"],
  ["attendance", "Attendance"],
  ["results", "Results"],
  ["fee_payments", "Fee Payments"],
  ["student_parents", "Student Parents"]
];

/* Fields used when a table is empty and therefore has no rows
   from which the application can automatically discover columns. */
const FORM_FIELDS = {
  Students: [
    "student_id","first_name","last_name","gender","date_of_birth",
    "phone","email","address","class_id","photo_url"
  ],
  teachers: [
    "teacher_id","first_name","last_name","gender","phone","email",
    "address","qualification","subject","date_of_birth"
  ],
  parents: [
    "parent_id","first_name","last_name","relationship","phone",
    "email","address","occupation"
  ],
  school_classes: [
    "class_name","section","session","teacher_id"
  ],
  subjects: [
    "subject_code","subject_name","class_id"
  ],
  attendance: [
    "student_id","date","status","remark"
  ],
  results: [
    "student_id","subject_id","session","term",
    "ca_score","exam_score","total","grade","remark"
  ],
  fee_payments: [
    "student_id","amount","payment_date","payment_method",
    "term","session","reference","remark"
  ],
  student_parents: [
    "student_id","parent_id","relationship"
  ]
};

let client = null;
let currentTable = null;
let rows = [];
let columns = [];
let editingId = null;

function $(id) {
  return document.getElementById(id);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function pretty(value) {
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function tableLabel(table) {
  const found = TABLES.find(x => x[0] === table);
  return found ? found[1] : pretty(table);
}

function init() {
  const nav = $("nav");

  nav.innerHTML =
    `<button class="active" data-page="dashboard">🏠 Dashboard</button>` +
    TABLES.map(([table, label]) =>
      `<button data-table="${esc(table)}">▦ ${esc(label)}</button>`
    ).join("");

  nav.querySelectorAll("button").forEach(button => {
    button.onclick = () => {
      nav.querySelectorAll("button")
        .forEach(x => x.classList.remove("active"));

      button.classList.add("active");

      if (button.dataset.page === "dashboard") {
        showDashboard(button);
      } else {
        openTable(button.dataset.table, button);
      }

      document.querySelector(".sidebar")?.classList.remove("open");
    };
  });

  $("refreshBtn").onclick = () => {
    currentTable ? loadTable(currentTable) : loadDashboard();
  };

  $("search").oninput = renderRows;

  $("addBtn").onclick = () => openForm();

  $("menuBtn").onclick = () => {
    document.querySelector(".sidebar")?.classList.toggle("open");
  };

  $("recordForm").onsubmit = saveRecord;

  const config = window.IFEKA_CONFIG || {};

  if (
    !config.SUPABASE_URL ||
    config.SUPABASE_URL.includes("PASTE_") ||
    !config.SUPABASE_ANON_KEY ||
    config.SUPABASE_ANON_KEY.includes("PASTE_")
  ) {
    $("status").textContent = "Supabase connection not configured yet.";
    loadCardsLocal();
    return;
  }

  client = supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
  );

  loadDashboard();
}

async function loadDashboard() {
  if (!client) {
    loadCardsLocal();
    return;
  }

  $("status").textContent = "Connected. Loading school records…";

  const counts = await Promise.all(
    TABLES.map(async ([table]) => {
      try {
        const { count, error } = await client
          .from(table)
          .select("*", { count: "exact", head: true });

        return error ? 0 : (count || 0);
      } catch {
        return 0;
      }
    })
  );

  $("cards").innerHTML = TABLES.map(([table, label], i) =>
    `<div class="card">
       <div class="label">${esc(label)}</div>
       <div class="num">${counts[i]}</div>
     </div>`
  ).join("") +
  `<div class="card">
     <div class="label">Total Modules</div>
     <div class="num">${TABLES.length}</div>
   </div>`;

  $("status").textContent = "Supabase connected.";
}

function loadCardsLocal() {
  $("cards").innerHTML =
    TABLES.map(([table, label]) =>
      `<div class="card">
         <div class="label">${esc(label)}</div>
         <div class="num">—</div>
       </div>`
    ).join("") +
    `<div class="card">
       <div class="label">Database</div>
       <div class="num">Ready</div>
     </div>`;
}

function showDashboard(button) {
  currentTable = null;

  $("dashboard").classList.remove("hidden");
  $("tableView").classList.add("hidden");
  $("pageTitle").textContent = "Dashboard";

  document.querySelectorAll("nav button")
    .forEach(x => x.classList.remove("active"));

  button.classList.add("active");
  loadDashboard();
}

async function openTable(table, button) {
  currentTable = table;

  $("dashboard").classList.add("hidden");
  $("tableView").classList.remove("hidden");
  $("pageTitle").textContent = tableLabel(table);

  // Always show the module's Add Record button.
  const addBtn = $("addBtn");
  if (addBtn) {
    addBtn.hidden = false;
    addBtn.style.display = "inline-flex";
    addBtn.textContent = "+ Add Record";
    addBtn.setAttribute("aria-label", "Add " + tableLabel(table) + " record");
  }

  document.querySelectorAll("nav button")
    .forEach(x => x.classList.remove("active"));

  button.classList.add("active");

  if (!client) {
    $("status").textContent =
      "Add your Supabase URL and public anon key in config.js first.";
    return;
  }

  await loadTable(table);
}

async function loadTable(table) {
  const addBtn = $("addBtn");
  if (addBtn) {
    addBtn.hidden = false;
    addBtn.style.display = "inline-flex";
    addBtn.textContent = "+ Add Record";
  }

  $("status").textContent = "Loading " + tableLabel(table) + "…";

  const { data, error } = await client
    .from(table)
    .select("*")
    .limit(200);

  if (error) {
    $("status").textContent = "Database error: " + error.message;
    $("thead").innerHTML = "";
    $("tbody").innerHTML = "";
    $("empty").classList.remove("hidden");
    return;
  }

  rows = data || [];

  if (rows.length) {
    columns = Object.keys(rows[0]);
    $("empty").classList.add("hidden");
    $("status").textContent = `${rows.length} record(s) loaded.`;
    renderRows();
    return;
  }

  /* Empty table: use the known application schema so Add Record
     can still open. */
  columns = FORM_FIELDS[table] || [];

  $("thead").innerHTML = "";
  $("tbody").innerHTML = "";
  $("empty").classList.remove("hidden");

  $("status").textContent =
    `Table is empty. ${tableLabel(table)} is ready for a new record.`;
}

function renderRows() {
  const search = ($("search").value || "").toLowerCase();

  const filtered = rows.filter(row =>
    columns.some(column =>
      String(row[column] ?? "")
        .toLowerCase()
        .includes(search)
    )
  );

  $("empty").classList.toggle("hidden", filtered.length > 0);

  $("thead").innerHTML =
    "<tr>" +
    columns.map(column =>
      `<th>${esc(pretty(column))}</th>`
    ).join("") +
    "<th>Actions</th></tr>";

  $("tbody").innerHTML = filtered.map(row =>
    `<tr>
      ${columns.map(column =>
        `<td>${formatCell(row[column])}</td>`
      ).join("")}
      <td class="actions">
        <button class="small-btn"
          onclick="viewRow(${rows.indexOf(row)})">View</button>
        <button class="small-btn"
          onclick="editRow(${rows.indexOf(row)})">Edit</button>
        <button class="small-btn danger"
          onclick="deleteRow(${rows.indexOf(row)})">Delete</button>
      </td>
    </tr>`
  ).join("");
}

function formatCell(value) {
  if (value == null) return "";

  const text = String(value);

  if (
    /^https?:\/\//i.test(text) &&
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(text)
  ) {
    return `<img src="${esc(text)}"
      alt="Photo"
      style="width:42px;height:42px;object-fit:cover;border-radius:8px">`;
  }

  return esc(text);
}

function getFieldType(field) {
  if (field === "date" ||
      field === "dob" ||
      field === "date_of_birth" ||
      field === "payment_date") return "date";

  if (field.includes("email")) return "email";
  if (field.includes("phone")) return "tel";
  if (
    field.includes("score") ||
    field === "amount" ||
    field === "total"
  ) return "number";

  return "text";
}

function getFieldControl(field, value) {
  const v = value ?? "";

  if (field === "gender") {
    return `<select name="${esc(field)}">
      <option value="">Select gender</option>
      <option value="Male" ${v === "Male" ? "selected" : ""}>Male</option>
      <option value="Female" ${v === "Female" ? "selected" : ""}>Female</option>
    </select>`;
  }

  if (field === "relationship") {
    return `<select name="${esc(field)}">
      <option value="">Select relationship</option>
      <option value="Father" ${v === "Father" ? "selected" : ""}>Father</option>
      <option value="Mother" ${v === "Mother" ? "selected" : ""}>Mother</option>
      <option value="Guardian" ${v === "Guardian" ? "selected" : ""}>Guardian</option>
    </select>`;
  }

  if (field === "status") {
    return `<select name="${esc(field)}">
      <option value="">Select status</option>
      <option value="Present" ${v === "Present" ? "selected" : ""}>Present</option>
      <option value="Absent" ${v === "Absent" ? "selected" : ""}>Absent</option>
      <option value="Late" ${v === "Late" ? "selected" : ""}>Late</option>
    </select>`;
  }

  if (field === "term") {
    return `<select name="${esc(field)}">
      <option value="">Select term</option>
      <option value="First Term" ${v === "First Term" ? "selected" : ""}>First Term</option>
      <option value="Second Term" ${v === "Second Term" ? "selected" : ""}>Second Term</option>
      <option value="Third Term" ${v === "Third Term" ? "selected" : ""}>Third Term</option>
    </select>`;
  }

  if (field === "payment_method") {
    return `<select name="${esc(field)}">
      <option value="">Select method</option>
      <option value="Cash" ${v === "Cash" ? "selected" : ""}>Cash</option>
      <option value="Transfer" ${v === "Transfer" ? "selected" : ""}>Transfer</option>
      <option value="POS" ${v === "POS" ? "selected" : ""}>POS</option>
      <option value="Online" ${v === "Online" ? "selected" : ""}>Online</option>
    </select>`;
  }

  return `<input
    name="${esc(field)}"
    type="${getFieldType(field)}"
    value="${esc(v)}"
    ${field === "id" ? 'readonly' : ''}
  >`;
}

function openForm(row = null) {
  const fields = columns.length
    ? columns
    : (FORM_FIELDS[currentTable] || []);

  if (!fields.length) {
    alert("No fields are available for this table yet.");
    return;
  }

  editingId = row?.id ?? null;

  $("dialogTitle").textContent =
    row ? `Edit ${tableLabel(currentTable)}` :
          `Add ${tableLabel(currentTable)}`;

  $("formFields").innerHTML = fields
    .filter(field => field !== "created_at")
    .map(field => {
      const value = row?.[field] ?? "";

      return `<div class="field">
        <label>${esc(pretty(field))}</label>
        ${getFieldControl(field, value)}
      </div>`;
    }).join("");

  /* Student photo upload if the existing table has photo_url. */
  if (currentTable === "Students" &&
      fields.includes("photo_url")) {
    $("formFields").insertAdjacentHTML("beforeend", `
      <div class="field">
        <label>Student Photo</label>
        <input id="studentPhoto"
          type="file"
          accept="image/*">
        ${row?.photo_url
          ? `<small>Existing photo is saved. Select another photo to replace it.</small>`
          : ""}
      </div>
    `);
  }

  $("recordDialog").showModal();
}

async function saveRecord(event) {
  event.preventDefault();

  if (!client || !currentTable) return;

  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());

  /* Remove empty strings. */
  Object.keys(data).forEach(key => {
    if (data[key] === "") data[key] = null;
  });

  /* Never manually insert an auto-generated numeric id. */
  if (editingId === null) delete data.id;

  const photoInput = $("studentPhoto");
  const photoFile = photoInput?.files?.[0];

  $("saveBtn").disabled = true;

  try {
    if (
      currentTable === "Students" &&
      photoFile &&
      photoFile.size > 0
    ) {
      const extension =
        (photoFile.name.split(".").pop() || "jpg").toLowerCase();

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

  } catch (error) {
    alert("Save failed:\n\n" + (error.message || error));
  } finally {
    $("saveBtn").disabled = false;
  }
}

function ensureViewDialog() {
  if ($("viewDialog")) return;

  const dialog = document.createElement("dialog");
  dialog.id = "viewDialog";
  dialog.innerHTML = `
    <div class="dialog-head">
      <h2 id="viewDialogTitle">Record Details</h2>
      <button type="button" class="small-btn" id="closeViewBtn">Close</button>
    </div>
    <div id="viewFields" class="view-grid"></div>
  `;
  document.body.appendChild(dialog);

  $("closeViewBtn").onclick = () => dialog.close();
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
}

function viewRow(index) {
  const row = rows[index];
  if (!row) return;

  ensureViewDialog();

  $("viewDialogTitle").textContent =
    `${tableLabel(currentTable)} — View Record`;

  $("viewFields").innerHTML = columns
    .filter(field => field !== "created_at")
    .map(field => {
      const value = row[field];

      let display = value == null || value === "" ? "—" : esc(value);

      if (
        typeof value === "string" &&
        /^https?:\/\//i.test(value) &&
        /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(value)
      ) {
        display = `<img src="${esc(value)}" alt="Photo"
          style="max-width:180px;max-height:180px;object-fit:cover;border-radius:12px">`;
      }

      return `
        <div class="field">
          <label>${esc(pretty(field))}</label>
          <div class="view-value">${display}</div>
        </div>
      `;
    }).join("");

  $("viewDialog").showModal();
}

async function editRow(index) {
  openForm(rows[index]);
}

async function deleteRow(index) {
  const row = rows[index];

  if (!row?.id) {
    alert("This record does not have an id that can be deleted by the generic action.");
    return;
  }

  if (!confirm(
    `Delete this ${tableLabel(currentTable)} record?\n\nThis cannot be undone.`
  )) return;

  const { data, error } = await client
    .from(currentTable)
    .delete()
    .eq("id", row.id)
    .select()
    .limit(1);

  if (error) {
    alert("Delete failed:\n\n" + error.message);
    return;
  }

  if (!data || !data.length) {
    alert(
      "The record was not deleted.\n\n" +
      "Please check the DELETE RLS policy for the " +
      currentTable + " table."
    );
    return;
  }

  await loadTable(currentTable);
}

window.viewRow = viewRow;
window.editRow = editRow;
window.deleteRow = deleteRow;

init();
.mini-news{background:#fff;border:1px solid #e0e6ea;border-radius:15px;padding:18px;box-shadow:0 7px 20px rgba(20,40,60,.06)}
.mini-news h4{font-size:18px;line-height:1.3;margin:7px 0}
.video-news{margin-top:35px}
.video-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.video-card{background:#101418;color:#fff;border-radius:15px;overflow:hidden}
.video-card video{width:100%;height:190px;display:block;background:#000}
.video-thumb{position:relative;height:190px;background:#000;cursor:pointer;overflow:hidden}
.video-thumb video{width:100%;height:100%;object-fit:cover;pointer-events:none}
.video-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;display:grid;place-items:center;background:rgba(255,134,23,.95);color:#fff;font-size:25px;padding-left:3px;box-shadow:0 8px 25px rgba(0,0,0,.35);pointer-events:none}
.video-inline .video-play{width:52px;height:52px}

.video-card .video-info{padding:15px}
.video-card h3{font-size:18px;line-height:1.3;margin:5px 0 8px}
.article-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:3000;overflow:auto;padding:20px}
.article-modal{max-width:900px;margin:20px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.35)}
.article-top{padding:10px 15px;text-align:right}
.article-close{border:0;background:#092f45;color:#fff;border-radius:50%;width:40px;height:40px;font-size:23px;cursor:pointer}
.article-body{padding:0 28px 30px}
.article-media{background:#071b22;border-radius:14px;overflow:hidden;margin-bottom:20px}
.article-media img,.article-media video{width:100%;max-height:520px;display:block;object-fit:cover}
.article-title{font-size:42px;line-height:1.12;color:#123b30;margin:10px 0}
.article-meta{color:#07946c;font-weight:bold;margin-bottom:20px}
.article-content{font-size:18px;line-height:1.85;white-space:pre-wrap;color:#263746}
.share-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:25px}
.share-row .share-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:0;border-radius:9px;padding:12px 16px;font-weight:700;cursor:pointer;text-decoration:none;font-size:14px}
.share-facebook{background:#1877f2;color:#fff}.share-whatsapp{background:#25d366;color:#fff}.share-copy{background:#eef3f6;color:#173243;border:1px solid #d6e0e6!important}.share-row .share-btn:hover{transform:translateY(-1px);filter:brightness(.98)}
.share-status{width:100%;font-size:13px;color:#07946c;font-weight:700;min-height:18px}
.no-results{text-align:center;padding:40px;background:#fff;border-radius:15px;border:1px dashed #ccd7df}
@media(max-width:900px){
  .featured-news{grid-template-columns:1fr}
  .video-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:600px){
  .news-tools-row{grid-template-columns:1fr}
  .featured-media{height:240px}
  .featured-body h3{font-size:26px}
  .video-grid{grid-template-columns:1fr}
  .article-body{padding:0 18px 25px}
  .article-title{font-size:30px}
  .article-overlay{padding:8px}
}


.social-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.social-links a{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:9px;background:rgba(255,255,255,.1);color:#fff;text-decoration:none;font-weight:bold;border:1px solid rgba(255,255,255,.15)}
.social-links a:hover{background:#07946c}


/* Mature homepage redesign */
.hero.mature-hero{padding:72px 6%;min-height:390px;background:linear-gradient(90deg,rgba(2,48,38,.97),rgba(3,67,54,.90) 48%,rgba(3,67,54,.35)),radial-gradient(circle at 78% 35%,#557568,#173f35 35%,#062d25 70%);position:relative;overflow:hidden}
.mature-hero:after{content:"";position:absolute;right:-8%;bottom:-35%;width:58%;height:110%;border-radius:50%;background:radial-gradient(ellipse,#607d70,#24483e 35%,transparent 70%);opacity:.65}
.mature-hero .hero-container{position:relative;z-index:2}
.mature-hero h1{font-size:58px;max-width:620px}.mature-hero p{max-width:560px;font-size:17px}
.find-box{background:#fff;color:#172a3a;border-radius:18px;padding:25px;box-shadow:0 15px 45px #001c1640}
.find-box input,.find-box select{width:100%;padding:13px;border:1px solid #d6dde0;border-radius:8px;margin:7px 0 10px;background:#fff}
.find-box button{width:100%;margin-top:5px}
.social-strip{text-align:center;padding:18px 5% 24px;background:#fff}
.social-strip h2{font-size:25px;margin:2px 0 4px}.social-strip p{font-size:14px;margin-bottom:12px}
.social-icons{display:flex;justify-content:center;gap:38px;flex-wrap:wrap;font-size:29px}.social-icons a{text-decoration:none;line-height:1}
.core-section{padding:12px 4% 28px;background:linear-gradient(180deg,#fff,#f8faf9)}
.core-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.core-card{background:#fff;border:1px solid #e5ece9;border-radius:10px;padding:20px 13px;text-align:center;box-shadow:0 4px 16px #0d3b2b0d}
.core-card .icon{font-size:32px;margin-bottom:9px}.core-card h3{font-size:15px;margin-bottom:6px}
.core-card p{font-size:12px;color:#4f5d65;min-height:38px}.core-card a,.survey-item a{color:#087956;font-weight:700;text-decoration:none;font-size:12px}
.mini-section{padding:12px 4% 28px;background:#fff}.section-heading{text-align:center;margin-bottom:15px}
.section-heading h2{font-size:24px;margin:0}.section-heading h2:after{content:"";display:block;width:42px;height:2px;background:#15916d;margin:7px auto 0}
.survey-row{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid #e8eceb;border-bottom:1px solid #e8eceb}
.survey-item{padding:16px 20px;display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:start;border-right:1px solid #e8eceb}
.survey-item:last-child{border-right:0}.survey-item .icon{font-size:36px}.survey-item h3{font-size:14px;margin-bottom:4px}.survey-item p{font-size:11px;color:#59656b}
.provider-section{padding:10px 4% 28px;background:#fff}.provider-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.provider-card{background:#fff;border:1px solid #e7ecea;border-radius:10px;padding:17px 10px;text-align:center;box-shadow:0 4px 16px #0d3b2b0d}
.provider-card .icon{font-size:34px;margin-bottom:7px}.provider-card h3{font-size:13px}.provider-card p{font-size:11px;color:#5a666c;margin-top:4px}
.news-preview{padding:8px 4% 36px;background:#fff}.news-preview-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.news-preview-card{border:1px solid #e5e9e8;border-radius:7px;overflow:hidden;background:#fff}.news-preview-card .news-image{height:105px;background:linear-gradient(135deg,#0b3d31,#3f7464);display:flex;align-items:center;justify-content:center;color:#fff;font-size:34px}
.news-preview-card .news-copy{padding:10px}.news-preview-card small{color:#087956;font-weight:700;font-size:9px}
.news-preview-card h3{font-size:13px;line-height:1.3;margin:5px 0}.news-preview-card p{font-size:10px;color:#68747a}
@media(max-width:900px){.core-grid,.provider-grid{grid-template-columns:repeat(2,1fr)}.survey-row{grid-template-columns:repeat(2,1fr)}.survey-item:nth-child(2){border-right:0}.news-preview-grid{grid-template-columns:repeat(2,1fr)}.mature-hero h1{font-size:44px}}
@media(max-width:600px){.mature-hero{padding:50px 5%!important}.mature-hero .hero-container{grid-template-columns:1fr}.mature-hero h1{font-size:42px}.social-icons{gap:25px}.core-grid,.provider-grid,.news-preview-grid{grid-template-columns:1fr 1fr}.survey-row{grid-template-columns:1fr}.survey-item{border-right:0!important;border-bottom:1px solid #e8eceb}.survey-item:last-child{border-bottom:0}}

/* Robust mobile hamburger menu */
@media(max-width:700px){
  .hub-nav-wrap{position:relative;z-index:4100}
  .hub-nav{position:relative;display:flex;align-items:center;justify-content:flex-start;overflow:hidden;min-height:58px;padding:0 64px 0 14px;gap:0}
  .hub-nav a{display:none!important}
  .hub-nav a:nth-child(-n+4){display:block!important;white-space:nowrap}
  .hub-nav a:nth-child(n+5){display:none!important}
  .hub-menu{display:flex!important;align-items:center;justify-content:center;position:absolute;right:8px;top:10px;width:48px;height:38px;z-index:4200;border:0;color:#fff;background:transparent;font-size:30px;line-height:1;border-radius:5px;cursor:pointer}
  .hub-nav.show{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;overflow-y:auto;overflow-x:hidden;max-height:calc(100vh - 90px);padding:0 58px 8px 0;gap:0;background:var(--hub-navy2);box-shadow:0 12px 30px rgba(0,0,0,.35);scrollbar-width:thin}
  .hub-nav.show a,.hub-nav.show a:nth-child(n){display:block!important;width:100%;box-sizing:border-box;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.12);background:var(--hub-navy2);color:#fff;font-size:15px;font-weight:800;text-decoration:none;white-space:nowrap}
  .hub-nav.show a.active{border-bottom:3px solid var(--hub-orange)}
  .hub-nav.show a[href="#admin"]{color:#fff;background:#12345f;border-left:4px solid var(--hub-orange)}
  .hub-nav.show .hub-menu{position:sticky!important;top:0!important;align-self:flex-end;flex:0 0 42px;margin:0 -50px 0 0;width:48px!important;height:42px!important;}
  .hub-nav.show .hub-menu{top:8px;right:8px;position:absolute;background:var(--hub-navy2);font-size:28px}
}
</style>

<style>
.price ul{margin:18px 0;padding-left:22px;text-align:left;line-height:1.8;color:#52616d}.price li{margin-bottom:7px}.price hr{border:0;border-top:1px solid #e2e8ec;margin:18px 0}.price h4{margin:0;color:#123b30;font-size:19px}.price p{line-height:1.6}.price strong{color:#123b30}
</style>

<style id="ifekahub-v6-design">
:root{
  --hub-navy:#061a38;
  --hub-navy2:#0a2347;
  --hub-orange:#ff8617;
  --hub-orange2:#ff9a2e;
  --hub-white:#fff;
  --hub-text:#15243b;
}
body{background:#fff;color:var(--hub-text)}
.hub-header{position:sticky;top:0;z-index:4000;background:var(--hub-navy);color:#fff;box-shadow:0 3px 18px rgba(0,0,0,.18)}
.hub-top{max-width:1400px;margin:auto;min-height:78px;padding:8px 3.5%;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px}
.hub-social{display:flex;gap:16px;align-items:center}
.hub-social a{color:#fff;text-decoration:none;font-weight:800;font-size:16px;opacity:.95}
.hub-social a:hover{color:var(--hub-orange)}
.hub-brand{display:flex;flex-direction:column;align-items:center;text-decoration:none;color:#fff;line-height:1}
.hub-brand strong{font-size:46px;letter-spacing:-2px;font-weight:900}
.hub-brand strong span{color:var(--hub-orange)}
.hub-brand small{font-size:12px;margin-top:7px;letter-spacing:.2px;color:#e7edf6}
.hub-actions{display:flex;justify-content:flex-end;align-items:center;gap:14px}
.hub-search{color:#fff;text-decoration:none;font-size:27px}
.hub-advertise,.hub-contact{padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:800;font-size:13px}
.hub-advertise{background:var(--hub-orange);color:#fff}
.hub-contact{border:1px solid #dce6f4;color:#fff}
.hub-nav-wrap{background:var(--hub-navy2);border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.08)}
.hub-nav{max-width:1400px;margin:auto;padding:0 3%;min-height:47px;display:flex;align-items:center;justify-content:center;gap:2px}
.hub-nav a{color:#fff;text-decoration:none;font-size:12px;font-weight:800;padding:16px 13px 13px;white-space:nowrap;border-bottom:3px solid transparent}
.hub-nav a:hover,.hub-nav a.active{border-bottom-color:var(--hub-orange);color:#fff}
.hub-menu{margin-left:auto;border:0;background:none;color:#fff;font-size:24px;cursor:pointer;display:none}

.hero.mature-hero{
  padding:55px 5%;
  min-height:390px;
  background:
    linear-gradient(90deg,rgba(3,20,47,.98),rgba(5,29,63,.93) 46%,rgba(5,29,63,.72)),
    radial-gradient(circle at 75% 50%,#274d75,#0a2347 42%,#061a38 75%);
}
.mature-hero .hero-container{max-width:1320px;grid-template-columns:.82fr 1.18fr;gap:38px}
.mature-hero h1{font-size:53px;line-height:1.05;color:#fff;max-width:540px}
.mature-hero h1 span{color:#fff}
.mature-hero p{max-width:520px;color:#e8eef7}
.mature-hero .badge{color:var(--hub-orange2)}
.find-box{order:2;background:#fff;border-radius:12px;padding:25px;max-width:540px;justify-self:end;box-shadow:0 14px 40px rgba(0,0,0,.24);color:#172a3a}
.find-box h3{font-size:18px;margin-bottom:10px}
.find-box input,.find-box select{width:100%;padding:12px;border:1px solid #d4dce6;border-radius:7px;margin:6px 0;font:inherit}
.find-box .btn{width:100%;background:var(--hub-orange);color:#fff}
.buttons .green{background:var(--hub-orange)}

.social-strip{background:#fff;padding:24px 5%;border-bottom:1px solid #edf1f5}
.social-strip .section-heading{margin-bottom:12px}
.social-icons{gap:28px}
.social-icons a{font-size:25px;text-decoration:none}

.core-section,.mini-section,.provider-section,.section-clean,.news-preview,.blog{background:#fff}
.core-grid,.provider-grid{max-width:1320px;margin:auto}
.core-card,.provider-card{border:1px solid #e4e9ef;box-shadow:0 4px 18px rgba(14,33,56,.07);border-radius:10px}
.section-heading h2,.section-title h2{color:var(--hub-navy)}
.section-heading small,.section-title small{color:var(--hub-orange)}
.provider-section{background:#f7f9fc}
.news-preview{background:#fff}

#blog{background:#f5f7fa}
.news-tools,.featured-card,.mini-news,.card,.video-card{border-radius:10px}
.btn.green{background:var(--hub-orange)}
.featured-card{border-color:#dce4ed}
.featured-body h3{color:var(--hub-navy)}
.breaking{background  } catch {
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
