/* =========================================================
   Ifeka School Management - app.js
   Stable CRUD version
   ========================================================= */

const TABLES = [
  ["students", "Students"],
  ["teachers", "Teachers"],
  ["parents", "Parents"],
  ["school_classes", "Classes"],
  ["subjects", "Subjects"],
  ["attendance", "Attendance"],
  ["results", "Results"],
  ["fee_payments", "Fee Payments"],
  ["student_parents", "Student Parents"]
];

const FORM_FIELDS = {
  students: [
    "student_id",
    "first_name",
    "last_name",
    "gender",
    "date_of_birth",
    "phone",
    "email",
    "address",
    "class_id",
    "photo_url"
  ],

  teachers: [
    "teacher_id",
    "first_name",
    "last_name",
    "gender",
    "phone",
    "email",
    "address",
    "qualification",
    "subject",
    "date_of_birth"
  ],

  parents: [
    "parent_id",
    "first_name",
    "last_name",
    "relationship",
    "phone",
    "email",
    "address",
    "occupation"
  ],

  school_classes: [
    "class_name",
    "section",
    "session",
    "teacher_id"
  ],

  subjects: [
    "subject_code",
    "subject_name",
    "class_id"
  ],

  attendance: [
    "student_id",
    "date",
    "status",
    "remark"
  ],

  results: [
    "student_id",
    "subject_id",
    "session",
    "term",
    "ca_score",
    "exam_score",
    "total",
    "grade",
    "remark"
  ],

  fee_payments: [
    "student_id",
    "amount",
    "payment_date",
    "payment_method",
    "term",
    "session",
    "reference",
    "remark"
  ],

  student_parents: [
    "student_id",
    "parent_id",
    "relationship"
  ]
};

/* Primary key for each table */
const PRIMARY_KEYS = {
  students: "student_id",
  teachers: "teacher_id",
  parents: "parent_id",
  school_classes: "id",
  subjects: "id",
  attendance: "id",
  results: "id",
  fee_payments: "id",
  student_parents: "id"
};

let client = null;
let currentTable = null;
let rows = [];
let columns = [];
let editingKey = null;


/* =========================================================
   Helpers
   ========================================================= */

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

function primaryKey(table) {
  return PRIMARY_KEYS[table] || "id";
}


/* =========================================================
   Application startup
   ========================================================= */

function init() {
  const menuBtn = $("#menuBtn");
  const sidebar = document.querySelector(".sidebar");

  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", function () {
      const isOpen = sidebar.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(isOpen));
    });
  }

  const nav = $("#nav");

if (!nav) {
  console.error("Navigation element #nav was not found.");
  return;
}

nav.addEventListener("click", function (event) {
    const button = event.target.closest("button");

    if (!button) return;

    const label = button.textContent
        .replace(/[^\p{L}\p{N}\s&/-]/gu, "")
        .trim()
        .toLowerCase();

    const moduleMap = {
        "students": "students",
        "teachers": "teachers",
        "classes": "school_classes",
        "subjects": "subjects",
        "parents / guardians": "parents",
        "attendance": "attendance",
        "results": "results",
        "fees & payments": "fee_payments"
    };

    if (label.includes("dashboard")) {
        currentTable = null;
        loadDashboard();
    } else if (moduleMap[label]) {
        loadTable(moduleMap[label]);
    } else if (
        label.includes("examinations") ||
        label.includes("timetable") ||
        label.includes("announcements") ||
        label.includes("transport")
    ) {
        alert(
            button.textContent.trim() +
            " is not connected to a database table yet."
        );
    }

    document.querySelector(".sidebar")?.classList.remove("open");
});

  const refreshBtn = $("refreshBtn");

  if (refreshBtn) {
    refreshBtn.onclick = () => {
      currentTable ? loadTable(currentTable) : loadDashboard();
    };
  }


  const searchInput = $("searchInput");

  if (searchInput) {
    searchInput.oninput = renderRows;
  }


  const addBtn = $("addBtn");

  if (addBtn) {
    addBtn.onclick = () => openForm();
  }


  const menuBtn = document.getElementById("menuBtn");
const sidebar = document.querySelector(".sidebar");

if (menuBtn && sidebar) {
    menuBtn.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();

        sidebar.classList.toggle("open");

        const isOpen = sidebar.classList.contains("open");

        menuBtn.setAttribute(
            "aria-expanded",
            isOpen ? "true" : "false"
        );
    };
}

const recordForm = $("recordForm");
const dialog = $("recordDialog");
const closeDialogBtn = $("closeDialogBtn");
const cancelBtn = $("cancelBtn");
const saveBtn = $("saveBtn");

function closeRecordDialog() {
  if (dialog) {
    dialog.close();
  }

  editingKey = null;
}

if (closeDialogBtn) {
  closeDialogBtn.addEventListener("click", function (event) {
    event.preventDefault();
    closeRecordDialog();
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener("click", function (event) {
    event.preventDefault();
    closeRecordDialog();
  });
}

if (recordForm) {
  recordForm.addEventListener("submit", saveRecord);
}

  editingKey = null;
}


  closeDialogBtn.addEventListener("click", function (event) {
    event.preventDefault();
    closeRecordDialog();
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener("click", function (event) {
    event.preventDefault();
    closeRecordDialog();
  });
}

if (recordForm) {
  recordForm.addEventListener("submit", saveRecord);
}
  


  const config = window.IFEKA_CONFIG || {};

  if (
    !config.SUPABASE_URL ||
    config.SUPABASE_URL.includes("PASTE_") ||
    !config.SUPABASE_ANON_KEY ||
    config.SUPABASE_ANON_KEY.includes("PASTE_")
  ) {

    if ($("status")) {
      $("status").textContent =
        "Supabase connection is not configured.";
    }

    loadCardsLocal();
    return;
  }


  try {

    client = supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    );

  } catch (error) {

    console.error(error);

    if ($("status")) {
      $("status").textContent =
        "Supabase initialization failed: " + error.message;
    }

    return;
  }


  loadDashboard();
}


/* =========================================================
   Dashboard
   ========================================================= */

async function loadDashboard() {

  if (!client) {
    loadCardsLocal();
    return;
  }

  if ($("status")) {
    $("status").textContent =
      "Connected. Loading school records…";
  }


  const counts = [];

  for (const [table] of TABLES) {

    try {

      const { count, error } = await client
        .from(table)
        .select("*", {
          count: "exact",
          head: true
        });

      if (error) {

        console.error(
          "Dashboard error:",
          table,
          error
        );

        counts.push("!");

      } else {

        counts.push(count || 0);

      }

    } catch (error) {

      console.error(error);
      counts.push("!");

    }
  }


  if ($("cards")) {

    $("cards").innerHTML = TABLES.map(
      ([table, label], i) =>
        `<div class="card">
          <div class="label">${esc(label)}</div>
          <div class="num">${counts[i]}</div>
        </div>`
    ).join("") +

    `<div class="card">
      <div class="label">Total Modules</div>
      <div class="num">${TABLES.length}</div>
    </div>`;

  }


  const hasError = counts.includes("!");

  if ($("status")) {

    $("status").textContent = hasError
      ? "Connected, but some tables could not be read. Check Supabase RLS policies."
      : "Supabase connected.";

  }
}


function loadCardsLocal() {

  if (!$("cards")) return;

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


/* =========================================================
   Navigation
   ========================================================= */

function showDashboard(button) {

  currentTable = null;
  editingKey = null;

  $("dashboard")?.classList.remove("hidden");
  $("tableView")?.classList.add("hidden");

  if ($("pageTitle")) {
    $("pageTitle").textContent = "Dashboard";
  }

  document.querySelectorAll("nav button")
    .forEach(x => x.classList.remove("active"));

  button?.classList.add("active");

  loadDashboard();
}


async function openTable(table, button) {

  currentTable = table;
  editingKey = null;

  $("dashboard")?.classList.add("hidden");
  $("tableView")?.classList.remove("hidden");

  if ($("pageTitle")) {
    $("pageTitle").textContent = tableLabel(table);
  }


  const addBtn = $("addBtn");

  if (addBtn) {

    addBtn.hidden = false;
    addBtn.style.display = "inline-flex";
    addBtn.textContent =
      "+ Add " + tableLabel(table);

  }


  document.querySelectorAll("nav button")
    .forEach(x => x.classList.remove("active"));

  button?.classList.add("active");


  if (!client) {

    if ($("status")) {
      $("status").textContent =
        "Supabase is not connected.";
    }

    return;
  }


  await loadTable(table);
}


/* =========================================================
   Load table
   ========================================================= */

async function loadTable(table) {

  const addBtn = $("addBtn");

  if (addBtn) {
    addBtn.hidden = false;
    addBtn.style.display = "inline-flex";
    addBtn.textContent =
      "+ Add " + tableLabel(table);
  }


  if ($("status")) {
    $("status").textContent =
      "Loading " + tableLabel(table) + "…";
  }


  const { data, error } = await client
    .from(table)
    .select("*")
    .limit(200);


  if (error) {

    console.error(
      "Supabase table error:",
      table,
      error
    );

    rows = [];
    columns = FORM_FIELDS[table] || [];

    if ($("status")) {
      $("status").textContent =
        "Database error: " + error.message;
    }

    renderEmptyTable();
    return;
  }


  rows = data || [];


  if (rows.length > 0) {

    columns = Object.keys(rows[0]);

    $("empty")?.classList.add("hidden");

    if ($("status")) {
      $("status").textContent =
        `${rows.length} record(s) loaded.`;
    }

    renderRows();
    return;
  }


  columns = FORM_FIELDS[table] || [];

  renderEmptyTable();


  if ($("status")) {
    $("status").textContent =
      `No records yet. ${tableLabel(table)} is ready for a new record.`;
  }
}


function renderEmptyTable() {

  if ($("thead")) {
    $("thead").innerHTML =
      `<tr>
        ${columns.map(column =>
          `<th>${esc(pretty(column))}</th>`
        ).join("")}
        <th>Actions</th>
      </tr>`;
  }

  if ($("tbody")) {
    $("tbody").innerHTML = "";
  }

  $("empty")?.classList.remove("hidden");
}


/* =========================================================
   Render rows
   ========================================================= */

function renderRows() {

  const searchInput = $("searchInput");

  const search =
    (searchInput?.value || "")
      .toLowerCase()
      .trim();


  const filtered = rows.filter(row =>
    columns.some(column =>
      String(row[column] ?? "")
        .toLowerCase()
        .includes(search)
    )
  );


  $("empty")?.classList.toggle(
    "hidden",
    filtered.length > 0
  );


  if ($("thead")) {

    $("thead").innerHTML =
      "<tr>" +
      columns.map(column =>
        `<th>${esc(pretty(column))}</th>`
      ).join("") +
      "<th>Actions</th></tr>";

  }


  if ($("tbody")) {

    $("tbody").innerHTML = filtered.map(row => {

      const index = rows.indexOf(row);

      return `<tr>
        ${columns.map(column =>
          `<td>${formatCell(row[column])}</td>`
        ).join("")}

        <td class="actions">

          <button
            class="small-btn"
            onclick="viewRow(${index})">
            View
          </button>

          <button
            class="small-btn"
            onclick="editRow(${index})">
            Edit
          </button>

          <button
            class="small-btn danger"
            onclick="deleteRow(${index})">
            Delete
          </button>

        </td>
      </tr>`;

    }).join("");

  }
}


/* =========================================================
   Cell formatting
   ========================================================= */

function formatCell(value) {

  if (value == null) return "";

  const text = String(value);


  if (
    /^https?:\/\//i.test(text) &&
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(text)
  ) {

    return `<img
      src="${esc(text)}"
      alt="Photo"
      style="
        width:42px;
        height:42px;
        object-fit:cover;
        border-radius:8px;
      ">`;

  }


  return esc(text);
}


/* =========================================================
   Form controls
   ========================================================= */

function getFieldType(field) {

  if (
    field === "date" ||
    field === "dob" ||
    field === "date_of_birth" ||
    field === "payment_date"
  ) {
    return "date";
  }


  if (field.includes("email")) {
    return "email";
  }


  if (field.includes("phone")) {
    return "tel";
  }


  if (
    field.includes("score") ||
    field === "amount" ||
    field === "total"
  ) {
    return "number";
  }


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
  >`;
}


/* =========================================================
   Open Add/Edit form
   ========================================================= */

function openForm(row = null) {

  if (!currentTable) {
    alert("Please select a module first.");
    return;
  }


  const fields =
    columns.length
      ? columns
      : (FORM_FIELDS[currentTable] || []);


  if (!fields.length) {
    alert("No fields are available for this table.");
    return;
  }


  const key = primaryKey(currentTable);

  editingKey =
    row?.[key] ??
    null;


  if ($("dialogTitle")) {

    $("dialogTitle").textContent =
      row
        ? `Edit ${tableLabel(currentTable)}`
        : `Add ${tableLabel(currentTable)}`;

  }


  if ($("formFields")) {

    $("formFields").innerHTML =
      fields
        .filter(field =>
          field !== "created_at" &&
          field !== "updated_at"
        )
        .map(field => {

          const value =
            row?.[field] ?? "";

          return `
            <div class="field">

              <label>
                ${esc(pretty(field))}
              </label>

              ${getFieldControl(field, value)}

            </div>
          `;

        })
        .join("");

  }


  /* Student photo */
  if (
    currentTable === "students" &&
    fields.includes("photo_url")
  ) {

    $("formFields")?.insertAdjacentHTML(
      "beforeend",

      `
      <div class="field">

        <label>Student Photo</label>

        <input
          id="studentPhoto"
          type="file"
          accept="image/*"
        >

        ${
          row?.photo_url
            ? `<small>
                Existing photo is saved.
                Select another photo to replace it.
              </small>`
            : ""
        }

      </div>
      `
    );

  }


  const dialog = $("recordDialog");

  if (dialog) {
    dialog.showModal();
  }
}


/* =========================================================
   Save record
   ========================================================= */

async function saveRecord(event) {

  event.preventDefault();


  if (!client || !currentTable) {
    alert("Database is not connected.");
    return;
  }


  const formData =
    new FormData(event.target);


  const data =
    Object.fromEntries(formData.entries());


  /* Convert empty strings to null */
  Object.keys(data).forEach(key => {

    if (data[key] === "") {
      data[key] = null;
    }

  });


  const key =
    primaryKey(currentTable);


  /* Do not overwrite primary key during edit */
  if (editingKey !== null) {
    delete data[key];
  }


  const photoInput =
    $("studentPhoto");


  const photoFile =
    photoInput?.files?.[0];


  const saveBtn =
    $("saveBtn");


  if (saveBtn) {
    saveBtn.disabled = true;
  }


  try {

    /* Student photo upload */
    if (
      currentTable === "students" &&
      photoFile &&
      photoFile.size > 0
    ) {

      const extension =
        (photoFile.name.split(".").pop() || "jpg")
          .toLowerCase();


      const studentIdentifier =
        data.student_id ||
        editingKey ||
        Date.now();


      const filePath =
        `${studentIdentifier}-${Date.now()}.${extension}`;


      const upload =
        await client.storage
          .from("student-photos")
          .upload(
            filePath,
            photoFile,
            {
              upsert: true,
              contentType:
                photoFile.type || "image/jpeg"
            }
          );


      if (upload.error) {
        throw upload.error;
      }


      const publicUrl =
        client.storage
          .from("student-photos")
          .getPublicUrl(filePath);


      data.photo_url =
        publicUrl.data.publicUrl;

    }


    let result;


    if (editingKey !== null) {

      result =
        await client
          .from(currentTable)
          .update(data)
          .eq(key, editingKey);

    } else {

      result =
        await client
          .from(currentTable)
          .insert(data);

    }


    if (result.error) {
      throw result.error;
    }


    $("recordDialog")?.close();

    editingKey = null;

    await loadTable(currentTable);


  } catch (error) {

    console.error(error);

    alert(
      "Save failed:\n\n" +
      (error.message || error)
    );

  } finally {

    if (saveBtn) {
      saveBtn.disabled = false;
    }

  }
}


/* =========================================================
   View record
   ========================================================= */

function ensureViewDialog() {

  if ($("viewDialog")) return;


  const dialog =
    document.createElement("dialog");


  dialog.id =
    "viewDialog";


  dialog.innerHTML = `
    <div class="dialog-head">

      <h2 id="viewDialogTitle">
        Record Details
      </h2>

      <button
        type="button"
        class="small-btn"
        id="closeViewBtn">
        Close
      </button>

    </div>

    <div
      id="viewFields"
      class="view-grid">
    </div>
  `;


  document.body.appendChild(dialog);


  $("closeViewBtn").onclick =
    () => dialog.close();


  dialog.addEventListener(
    "click",
    event => {

      if (event.target === dialog) {
        dialog.close();
      }

    }
  );
}


function viewRow(index) {

  const row =
    rows[index];


  if (!row) return;


  ensureViewDialog();


  $("viewDialogTitle").textContent =
    `${tableLabel(currentTable)} — View Record`;


  $("viewFields").innerHTML =
    columns
      .filter(field =>
        field !== "created_at" &&
        field !== "updated_at"
      )
      .map(field => {

        const value =
          row[field];


        let display =
          value == null || value === ""
            ? "—"
            : esc(value);


        if (
          typeof value === "string" &&
          /^https?:\/\//i.test(value) &&
          /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(value)
        ) {

          display =
            `<img
              src="${esc(value)}"
              alt="Photo"
              style="
                max-width:180px;
                max-height:180px;
                object-fit:cover;
                border-radius:12px;
              ">`;

        }


        return `
          <div class="field">

            <label>
              ${esc(pretty(field))}
            </label>

            <div class="view-value">
              ${display}
            </div>

          </div>
        `;

      })
      .join("");


  $("viewDialog")?.showModal();
}


/* =========================================================
   Edit record
   ========================================================= */

function editRow(index) {

  const row =
    rows[index];


  if (!row) return;


  openForm(row);
}


/* =========================================================
   Delete record
   ========================================================= */

async function deleteRow(index) {

  const row =
    rows[index];


  if (!row) return;


  const key =
    primaryKey(currentTable);


  const keyValue =
    row[key];


  if (
    keyValue === undefined ||
    keyValue === null
  ) {

    alert(
      `The ${tableLabel(currentTable)} record has no ${key} value.`
    );

    return;
  }


  if (
    !confirm(
      `Delete this ${tableLabel(currentTable)} record?\n\nThis cannot be undone.`
    )
  ) {
    return;
  }


  const { data, error } =
    await client
      .from(currentTable)
      .delete()
      .eq(key, keyValue)
      .select();


  if (error) {

    alert(
      "Delete failed:\n\n" +
      error.message
    );

    return;
  }


  if (!data || data.length === 0) {

    alert(
      "The record was not deleted.\n\n" +
      "Please check the DELETE RLS policy for the " +
      currentTable +
      " table."
    );

    return;
  }


  await loadTable(currentTable);
}


/* =========================================================
   Global functions used by table buttons
   ========================================================= */

window.viewRow = viewRow;
window.editRow = editRow;
window.deleteRow = deleteRow;


/* =========================================================
   Start application
   ========================================================= */

init();
