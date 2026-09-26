/* =========================================================
   Ifeka School Management - app.js
   Clean navigation + Supabase CRUD version
   ========================================================= */

const TABLES = [
  ["Students", "students"],
  ["teachers", "Teachers"],
  ["school_classes", "Classes"],
  ["subjects", "Subjects"],
  ["parents", "Parents / Guardians"],
  ["attendance", "Attendance"],
  ["results", "Results"],
  ["fee_payments", "Fees & Payments"],
  ["student_parents", "Student Parents"]
];

const FORM_FIELDS = {
  students: [
    "student_id", "first_name", "last_name", "gender",
    "date_of_birth", "phone", "email", "address",
    "class", "photo_url"
  ],

  teachers: [
    "teacher_id", "first_name", "last_name", "gender",
    "phone", "email", "address", "qualification",
    "subject", "date_of_birth"
  ],

  parents: [
    "parent_id", "first_name", "last_name", "relationship",
    "phone", "email", "address", "occupation"
  ],

  school_classes: [
    "class_name", "section", "session", "teacher_id"
  ],

  subjects: [
    "subject_code", "subject_name", "class"
  ],

  attendance: [
  "student_id", "attendance_date", "status", "remarks"
],

  results: [
    "student_id", "subject_id", "session", "term",
    "ca_score", "exam_score", "total", "grade", "remark"
  ],

  fee_payments: [
    "student_id", "amount", "payment_date",
    "payment_method", "term", "session",
    "reference", "remark"
  ],

  student_parents: [
    "student_id", "parent_id", "relationship"
  ]
};

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

/* Modules that currently do not have a table in the supplied
   database code. They still open a proper information page
   instead of doing nothing. */
const INFO_MODULES = {
  exams: {
    title: "Examinations",
    text: "Examinations module is ready. It can be connected when the examinations database table is available."
  },
  timetable: {
    title: "Timetable",
    text: "Timetable module is ready. It can be connected when the timetable database table is available."
  },
  announcements: {
    title: "Announcements",
    text: "Announcements module is ready. It can be connected when the announcements database table is available."
  },
  transport: {
    title: "Transport",
    text: "Transport module is ready. It can be connected when the transport database table is available."
  },
  reports: {
    title: "Reports",
    text: "Reports module is ready. It will use the school records to generate reports."
  },
  settings: {
    title: "Settings",
    text: "Settings module is ready for school profile, academic session and system configuration."
  }
};

const MODULE_MAP = {
  students: "students",
  teachers: "teachers",
  classes: "school_classes",
  subjects: "subjects",
  parents: "parents",
  attendance: "attendance",
  results: "results",
  "fees-payments": "fee_payments"
};

let db = null;
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
  return String(value ?? "").replace(/[&<>"']/g, function (c) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c];
  });
}

function pretty(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function tableLabel(table) {
  const item = TABLES.find(x => x[0] === table);
  return item ? item[1] : pretty(table);
}

function primaryKey(table) {
  return PRIMARY_KEYS[table] || "id";
}

function setStatus(message) {
  const el = $("status");
  if (el) el.textContent = message;
}

function showOnly(sectionId) {
  ["dashboard", "tableView", "moduleInfo"].forEach(id => {
    const el = $(id);
    if (el) el.classList.toggle("hidden", id !== sectionId);
  });
}

function closeMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  const menuBtn = $("menuBtn");

  if (sidebar) sidebar.classList.remove("open");
  document.body.classList.remove("menu-open");

  if (menuBtn) {
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Open menu");
  }
}

/* =========================================================
   Startup
   ========================================================= */

function init() {
  setupNavigation();
  setupControls();
  setupSupabase();

  showDashboard();
}

function setupNavigation() {
  const nav = $("nav");

  if (!nav) {
    console.error("Ifeka School: #nav was not found.");
    return;
  }

  nav.addEventListener("click", function (event) {
    const button = event.target.closest("button[data-page]");
    if (!button) return;

    event.preventDefault();

    const page = button.dataset.page;
    if (!page) return;

    document.querySelectorAll("#nav button").forEach(btn => {
      btn.classList.remove("active");
    });

    button.classList.add("active");
    closeMobileMenu();

    if (page === "dashboard") {
      showDashboard(button);
      return;
    }

    if (MODULE_MAP[page]) {
      openTable(MODULE_MAP[page], button);
      return;
    }

    if (INFO_MODULES[page]) {
      openInfoModule(page, button);
      return;
    }

    setStatus("Module is not configured.");
  });
}

function setupControls() {
  const refreshBtn = $("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      if (currentTable) {
        loadTable(currentTable);
      } else {
        loadDashboard();
      }
    });
  }

  const searchInput = $("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderRows);
  }

  const addBtn = $("addBtn");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      openForm();
    });
  }

  const form = $("recordForm");
  if (form) {
    form.addEventListener("submit", saveRecord);
  }

  const closeBtn = $("closeDialogBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      closeRecordDialog();
    });
  }

  const cancelBtn = $("cancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      closeRecordDialog();
    });
  }

  const dialog = $("recordDialog");
  if (dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        closeRecordDialog();
      }
    });
  }
}

function setupSupabase() {
  const config = window.IFEKA_CONFIG || {};

  if (
    !config.SUPABASE_URL ||
    !config.SUPABASE_ANON_KEY ||
    config.SUPABASE_URL.includes("PASTE_") ||
    config.SUPABASE_ANON_KEY.includes("PASTE_")
  ) {
    db = null;
    setStatus("Supabase connection is not configured.");
    return;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    db = null;
    setStatus("Supabase library did not load.");
    console.error("Supabase library is unavailable.");
    return;
  }

  try {
    db = window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    );

    setStatus("Supabase connected.");
  } catch (error) {
    db = null;
    console.error(error);
    setStatus("Supabase initialization failed: " + error.message);
  }
}

/* =========================================================
   Dashboard
   ========================================================= */

async function showDashboard(button) {
  currentTable = null;
  editingKey = null;

  showOnly("dashboard");

  if ($("pageTitle")) {
    $("pageTitle").textContent = "Dashboard";
  }

  document.querySelectorAll("#nav button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  } else {
    document.querySelector('#nav button[data-page="dashboard"]')
      ?.classList.add("active");
  }

  await loadDashboard();
}

async function loadDashboard() {
  if (!db) {
    setDashboardCount("studentCount", "—");
    setDashboardCount("teacherCount", "—");
    setDashboardCount("classCount", "—");
    setDashboardCount("subjectCount", "—");
    setStatus("Supabase is not connected.");
    return;
  }

  setStatus("Loading school records...");

  const wanted = [
    ["students", "studentCount"],
    ["teachers", "teacherCount"],
    ["school_classes", "classCount"],
    ["subjects", "subjectCount"]
  ];

  let failed = false;

  for (const [table, elementId] of wanted) {
    try {
      const result = await db
        .from(table)
        .select("*", { count: "exact", head: true });

      if (result.error) {
        console.error("Dashboard:", table, result.error);
        setDashboardCount(elementId, "!");
        failed = true;
      } else {
        setDashboardCount(elementId, result.count ?? 0);
      }
    } catch (error) {
      console.error(error);
      setDashboardCount(elementId, "!");
      failed = true;
    }
  }

  setStatus(
    failed
      ? "Connected, but one or more dashboard tables could not be read."
      : "Supabase connected."
  );
}

function setDashboardCount(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

/* =========================================================
   Navigation / Modules
   ========================================================= */

async function openTable(table, button) {
  currentTable = table;
  editingKey = null;

  showOnly("tableView");

  if ($("pageTitle")) {
    $("pageTitle").textContent = tableLabel(table);
  }

  if ($("searchInput")) {
    $("searchInput").value = "";
  }

  if ($("addBtn")) {
    $("addBtn").hidden = false;
    $("addBtn").style.display = "inline-flex";
    $("addBtn").textContent = "+ Add " + tableLabel(table);
  }

  document.querySelectorAll("#nav button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (button) button.classList.add("active");

  if (!db) {
    setStatus("Supabase is not connected.");
    rows = [];
    columns = FORM_FIELDS[table] || [];
    renderEmptyTable();
    return;
  }

  await loadTable(table);
}

function openInfoModule(page, button) {
  currentTable = null;
  editingKey = null;

  showOnly("moduleInfo");

  const info = INFO_MODULES[page];

  if ($("pageTitle")) {
    $("pageTitle").textContent = info.title;
  }

  if ($("moduleInfoTitle")) {
    $("moduleInfoTitle").textContent = info.title;
  }

  if ($("moduleInfoText")) {
    $("moduleInfoText").textContent = info.text;
  }

  if ($("addBtn")) {
    $("addBtn").style.display = "none";
  }

  document.querySelectorAll("#nav button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (button) button.classList.add("active");

  setStatus(info.title + " module");
}

/* =========================================================
   Table loading
   ========================================================= */

async function loadTable(table) {
  if (!db) {
    setStatus("Supabase is not connected.");
    return;
  }

  setStatus("Loading " + tableLabel(table) + "...");

  try {
    const result = await db
      .from(table)
      .select("*")
      .limit(200);

    if (result.error) {
      console.error("Supabase table error:", table, result.error);

      rows = [];
      columns = FORM_FIELDS[table] || [];
      renderEmptyTable();

      setStatus(
        "Database error: " + result.error.message
      );
      return;
    }

    rows = result.data || [];

    if (rows.length > 0) {
      columns = Object.keys(rows[0]);
      renderRows();

      setStatus(
        rows.length + " record(s) loaded."
      );
    } else {
      columns = FORM_FIELDS[table] || [];
      renderEmptyTable();

      setStatus(
        "No records yet. " +
        tableLabel(table) +
        " is ready for a new record."
      );
    }
  } catch (error) {
    console.error(error);
    rows = [];
    columns = FORM_FIELDS[table] || [];
    renderEmptyTable();
    setStatus("Could not load " + tableLabel(table) + ".");
  }
}

function renderEmptyTable() {
  const thead = $("thead");
  const tbody = $("tbody");

  if (thead) {
    thead.innerHTML =
      "<tr>" +
      columns.map(column =>
        "<th>" + esc(pretty(column)) + "</th>"
      ).join("") +
      "<th>Actions</th>" +
      "</tr>";
  }

  if (tbody) {
    tbody.innerHTML = "";
  }

  $("empty")?.classList.remove("hidden");
}

/* =========================================================
   Table rendering
   ========================================================= */

function renderRows() {
  const searchInput = $("searchInput");
  const search = (searchInput?.value || "").toLowerCase().trim();

  const filtered = rows.filter(row =>
    columns.some(column =>
      String(row[column] ?? "")
        .toLowerCase()
        .includes(search)
    )
  );

  const empty = $("empty");
  if (empty) {
    empty.classList.toggle("hidden", filtered.length !== 0);
  }

  const thead = $("thead");
  if (thead) {
    thead.innerHTML =
      "<tr>" +
      columns.map(column =>
        "<th>" + esc(pretty(column)) + "</th>"
      ).join("") +
      "<th>Actions</th>" +
      "</tr>";
  }

  const tbody = $("tbody");
  if (!tbody) return;

  tbody.innerHTML = filtered.map(row => {
    const index = rows.indexOf(row);

    return (
      "<tr>" +
      columns.map(column =>
        "<td>" + formatCell(row[column]) + "</td>"
      ).join("") +
      '<td class="actions">' +
        '<button class="small-btn" type="button" ' +
          'onclick="viewRow(' + index + ')">View</button>' +
        '<button class="small-btn" type="button" ' +
          'onclick="editRow(' + index + ')">Edit</button>' +
        '<button class="small-btn danger" type="button" ' +
          'onclick="deleteRow(' + index + ')">Delete</button>' +
      "</td>" +
      "</tr>"
    );
  }).join("");
}

function formatCell(value) {
  if (value == null) return "";

  const text = String(value);

  if (
    /^https?:\/\//i.test(text) &&
    /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(text)
  ) {
    return (
      '<img src="' + esc(text) + '" alt="Photo" ' +
      'style="width:42px;height:42px;object-fit:cover;border-radius:8px;">'
    );
  }

  return esc(text);
}

/* =========================================================
   Forms
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

  if (field.includes("email")) return "email";
  if (field.includes("phone")) return "tel";

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

  if  (field === "gender") {
    return `
      <select name="${esc(field)}">
        <option value="">Select gender</option>
        <option value="Male" ${v === "Male" ? "selected" : ""}>Male</option>
        <option value="Female" ${v === "Female" ? "selected" : ""}>Female</option>
      </select>
    `;
  }

  if  (currentTable === "attendance" && field === "student_id") {
  const students = window.studentsList || [];

  return `
    <select name="${esc(field)}" required>
      <option value="">Select student</option>
      ${students.map(student => `
        <option value="${esc(student.student_id)}"
          ${String(value ?? "") === String(student.student_id) ? "selected" : ""}>
          ${esc(student.student_id)} - ${esc(
            [student.first_name, student.last_name].filter(Boolean).join(" ")
          )}
        </option>
      `).join("")}
    </select>
  `;
}  (field === "relationship") {
    return `
      <select name="${esc(field)}">
        <option value="">Select relationship</option>
        <option value="Father" ${v === "Father" ? "selected" : ""}>Father</option>
        <option value="Mother" ${v === "Mother" ? "selected" : ""}>Mother</option>
        <option value="Guardian" ${v === "Guardian" ? "selected" : ""}>Guardian</option>
      </select>
    `;
  }

  if (field === "status") {
    return `
      <select name="${esc(field)}">
        <option value="">Select status</option>
        <option value="Present" ${v === "Present" ? "selected" : ""}>Present</option>
        <option value="Absent" ${v === "Absent" ? "selected" : ""}>Absent</option>
        <option value="Late" ${v === "Late" ? "selected" : ""}>Late</option>
      </select>
    `;
  }

  if (field === "term") {
    return `
      <select name="${esc(field)}">
        <option value="">Select term</option>
        <option value="First Term" ${v === "First Term" ? "selected" : ""}>First Term</option>
        <option value="Second Term" ${v === "Second Term" ? "selected" : ""}>Second Term</option>
        <option value="Third Term" ${v === "Third Term" ? "selected" : ""}>Third Term</option>
      </select>
    `;
  }

  if (field === "payment_method") {
    return `
      <select name="${esc(field)}">
        <option value="">Select method</option>
        <option value="Cash" ${v === "Cash" ? "selected" : ""}>Cash</option>
        <option value="Transfer" ${v === "Transfer" ? "selected" : ""}>Transfer</option>
        <option value="POS" ${v === "POS" ? "selected" : ""}>POS</option>
        <option value="Online" ${v === "Online" ? "selected" : ""}>Online</option>
      </select>
    `;
  }

  return `
    <input
      name="${esc(field)}"
      type="${getFieldType(field)}"
      value="${esc(v)}"
    >
  `;
}

function openForm(row = null) {
  if (!currentTable) {
    alert("Please select a module first.");
    return;
  }

  const fields = FORM_FIELDS[currentTable] || columns;

  if (!fields.length) {
    alert("No fields are available for this table.");
    return;
  }

  const key = primaryKey(currentTable);

  editingKey = row ? (row[key] ?? null) : null;

  if ($("dialogTitle")) {
    $("dialogTitle").textContent =
      row
        ? "Edit " + tableLabel(currentTable)
        : "Add " + tableLabel(currentTable);
  }

  const formFields = $("formFields");

  if (formFields) {
    formFields.innerHTML = fields
      .filter(field =>
        field !== "created_at" &&
        field !== "updated_at"
      )
      .map(field => {
        const value = row?.[field] ?? "";

        return `
          <div class="field">
            <label>${esc(pretty(field))}</label>
            ${getFieldControl(field, value)}
          </div>
        `;
      })
      .join("");
  }

  if (
    currentTable === "students" &&
    fields.includes("photo_url")
  ) {
    formFields?.insertAdjacentHTML(
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
              ? "<small>Existing photo is saved. Select another photo to replace it.</small>"
              : ""
          }
        </div>
      `
    );
  }

  const dialog = $("recordDialog");

  if (dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }
}

function closeRecordDialog() {
  const dialog = $("recordDialog");

  if (dialog) {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  editingKey = null;
}

/* =========================================================
   Save
   ========================================================= */

async function saveRecord(event) {
  event.preventDefault();

  if (!db || !currentTable) {
    alert("Database is not connected.");
    return;
  }

  const formData = new FormData(event.target);
  const data = Object.fromEntries(formData.entries());
   // Attendance uses attendance_date in Supabase
if (currentTable === "attendance" && data.date !== undefined) {
  const parts = data.date.split("/");

  if (parts.length === 3) {
    const [day, month, year] = parts;
    data.attendance_date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  } else {
    data.attendance_date = data.date;
  }

  delete data.date;
}
  Object.keys(data).forEach(key => {
    if (data[key] === "") data[key] = null;
  });

  const key = primaryKey(currentTable);

  if (editingKey !== null) {
    delete data[key];
  }

  const photoInput = $("studentPhoto");
  const photoFile = photoInput?.files?.[0];
  const saveBtn = $("saveBtn");

  if (saveBtn) saveBtn.disabled = true;

  try {
    if (
      currentTable === "students" &&
      photoFile &&
      photoFile.size > 0
    ) {
      const extension =
        (photoFile.name.split(".").pop() || "jpg").toLowerCase();

      const studentIdentifier =
        data.student_id ||
        editingKey ||
        Date.now();

      const filePath =
        studentIdentifier + "-" +
        Date.now() + "." +
        extension;

      const upload = await db.storage
        .from("student-photos")
        .upload(filePath, photoFile, {
          upsert: true,
          contentType: photoFile.type || "image/jpeg"
        });

      if (upload.error) {
        throw upload.error;
      }

      const publicUrl = db.storage
        .from("student-photos")
        .getPublicUrl(filePath);

      data.photo_url = publicUrl.data.publicUrl;
    }

    let result;

    if (editingKey !== null) {
      result = await db
        .from(currentTable)
        .update(data)
        .eq(key, editingKey);
    } else {
      result = await db
        .from(currentTable)
        .insert(data);
    }

    if (result.error) {
      throw result.error;
    }

    closeRecordDialog();
    await loadTable(currentTable);

  } catch (error) {
    console.error(error);
    alert(
      "Save failed:\n\n" +
      (error.message || String(error))
    );
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/* =========================================================
   View
   ========================================================= */

function ensureViewDialog() {
  if ($("viewDialog")) return;

  const dialog = document.createElement("dialog");
  dialog.id = "viewDialog";

  dialog.innerHTML = `
    <div class="dialog-head">
      <h2 id="viewDialogTitle">Record Details</h2>
      <button type="button" class="small-btn" id="closeViewBtn">
        Close
      </button>
    </div>

    <div id="viewFields" class="view-grid"></div>
  `;

  document.body.appendChild(dialog);

  $("closeViewBtn").addEventListener("click", function () {
    dialog.close();
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

function viewRow(index) {
  const row = rows[index];
  if (!row) return;

  ensureViewDialog();

  $("viewDialogTitle").textContent =
    tableLabel(currentTable) + " — View Record";

  $("viewFields").innerHTML = columns
    .filter(field =>
      field !== "created_at" &&
      field !== "updated_at"
    )
    .map(field => {
      const value = row[field];

      let display =
        value == null || value === ""
          ? "—"
          : esc(value);

      if (
        typeof value === "string" &&
        /^https?:\/\//i.test(value) &&
        /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(value)
      ) {
        display = `
          <img
            src="${esc(value)}"
            alt="Photo"
            style="
              max-width:180px;
              max-height:180px;
              object-fit:cover;
              border-radius:12px;
            "
          >
        `;
      }

      return `
        <div class="field">
          <label>${esc(pretty(field))}</label>
          <div class="view-value">${display}</div>
        </div>
      `;
    })
    .join("");

  const dialog = $("viewDialog");

  if (dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }
}

/* =========================================================
   Edit / Delete
   ========================================================= */

function editRow(index) {
  const row = rows[index];
  if (!row) return;

  openForm(row);
}

async function deleteRow(index) {
  const row = rows[index];
  if (!row) return;

  if (!db || !currentTable) {
    alert("Database is not connected.");
    return;
  }

  const key = primaryKey(currentTable);
  const keyValue = row[key];

  if (keyValue === undefined || keyValue === null) {
    alert(
      "This record has no " +
      key +
      " value, so it cannot be deleted."
    );
    return;
  }

  const confirmed = confirm(
    "Delete this " +
    tableLabel(currentTable) +
    " record?\n\nThis cannot be undone."
  );

  if (!confirmed) return;

  try {
    const result = await db
      .from(currentTable)
      .delete()
      .eq(key, keyValue)
      .select();

    if (result.error) {
      throw result.error;
    }

    if (!result.data || result.data.length === 0) {
      alert(
        "The record was not deleted.\n\n" +
        "Please check the DELETE RLS policy for the " +
        currentTable +
        " table."
      );
      return;
    }

    await loadTable(currentTable);

  } catch (error) {
    console.error(error);

    alert(
      "Delete failed:\n\n" +
      (error.message || String(error))
    );
  }
}

/* =========================================================
   Global functions for table action buttons
   ========================================================= */

window.viewRow = viewRow;
window.editRow = editRow;
window.deleteRow = deleteRow;
window.openForm = openForm;

/* =========================================================
   Start
   ========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
