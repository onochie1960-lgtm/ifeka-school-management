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
  ["student_parents", "Student Parents"],
["timetable", "Timetable"],
["announcements", "Announcements"],
["transport", "Transport"]
];



const FORM_FIELDS = {
  students: [
  "student_id", "first_name", "last_name", "gender",
  "date_of_birth", "phone", "email", "address",
  "class", "photo_url", "total_fee"
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
  examinations: [
    "examination_name",
    "session",
    "term",
    "class",
    "examination_date",
    "description"
  ],
  attendance: [
  "student_id", "attendance_date", "status", "remarks"
],

  results: [
    "student_id", "subject_id", "session", "term",
    "ca_score", "exam_score", "total", "grade", "remark"
  ],

    fee_payments: [
    "student_id",
    "amount",
    "payment_date",
    "payment_type",
    "reference",
    "remarks"
  ],

  student_parents: [
    "student_id",
    "parent_id",
    "relationship"
  ],

  timetable: [
    "class_id",
    "subject_id",
    "teacher_id",
    "day",
    "start_time",
    "end_time",
    "term",
      "session"
],
transport: [
  "vehicle_number",
  "vehicle_type",
  "driver_name",
  "driver_phone",
  "route",
  "capacity",
  "status",
  "remarks"
],

announcements: [
  "title",
  "message",
  "audience",
  "publish_date",
  "expiry_date",
  "status"
]
};

const PRIMARY_KEYS = {
  students: "id",
  teachers: "teacher_id",
  parents: "parent_id",
  school_classes: "id",
  subjects: "id",
  attendance: "id",
  results: "id",
  fee_payments: "id",
  student_parents: "id",
timetable: "id",
announcements: "id",
transport: "id"
};

/* Modules that currently do not have a table in the supplied
   database code. They still open a proper information page
   instead of doing nothing. */
const INFO_MODULES = {
  exams: {
    title: "Examinations",
    text: "Examinations module is ready. It can be connected when the examinations database table is available."
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
  exams: "examinations",
  results: "results",
  "fees-payments": "fee_payments",
  timetable: "timetable",
announcements: "announcements",
transport: "transport"
};

let db = null;
let currentTable = null;
let rows = [];
let columns = [];
let editingKey = null;
let isSuperAdmin = false;
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
async function checkSuperAdmin() {
  isSuperAdmin = false;

  if (!db) return false;

  try {
    const { data: sessionData, error: sessionError } =
      await db.auth.getSession();

    if (sessionError || !sessionData.session) {
      console.error("No authenticated session for role check.");
      return false;
    }

    const { data, error } = await db
      .from("school_users")
      .select("role")
      .eq("user_id", sessionData.session.user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (error) {
      console.error("Super Admin check failed:", error);
      return false;
    }

    isSuperAdmin = data?.role === "super_admin";
    console.log("Super Admin:", isSuperAdmin);

    return isSuperAdmin;
  } catch (error) {
    console.error("Super Admin check error:", error);
    return false;
  }
}
async function checkSchoolAccess() {
  if (!db) {
    return {
      allowed: false,
      message: "Database connection is unavailable."
    };
  }

  // Super Admin must always retain access.
  if (isSuperAdmin) {
    return { allowed: true };
  }

  try {
    const { data: sessionData, error: sessionError } =
      await db.auth.getSession();

    if (sessionError || !sessionData.session) {
      return {
        allowed: false,
        message: "Please sign in again."
      };
    }

    const userId = sessionData.session.user.id;

    const { data: userSchool, error: userError } = await db
      .from("school_users")
      .select("school_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (userError) throw userError;

    if (!userSchool) {
      return {
        allowed: false,
        message: "No school is linked to this account."
      };
    }

    const { data: school, error: schoolError } = await db
      .from("schools")
      .select(
        "access_status, demo_started_at, demo_expires_at, payment_status, subscription_expires_at"
      )
      .eq("id", userSchool.school_id)
      .single();

    if (schoolError) throw schoolError;

    if (school.access_status === "suspended") {
      return {
        allowed: false,
        message: "This school's access has been suspended. Please contact the administrator."
      };
    }

    const now = new Date();

    // Allow a valid paid subscription.
    if (
      school.payment_status === "paid" &&
      school.subscription_expires_at &&
      new Date(school.subscription_expires_at) > now &&
      school.access_status === "active"
    ) {
      return { allowed: true };
    }

    // Allow a demo only while its expiry date is in the future.
    if (
      school.demo_expires_at &&
      new Date(school.demo_expires_at) > now &&
      school.access_status === "active"
    ) {
      return { allowed: true };
    }

    // Preserve access for existing schools without subscription dates.
    if (
      !school.demo_expires_at &&
      !school.subscription_expires_at &&
      !school.payment_status
    ) {
      return { allowed: true };
    }

    return {
      allowed: false,
      message: "Your free demo has expired. Please contact Ifeka School Management to activate your subscription."
    };
  } catch (error) {
    console.error("School access check failed:", error);

    return {
      allowed: false,
      message: "Unable to verify school access. Please try again."
    };
  }
}
function getSchoolSettings() {
  let settings = {};

  try {
    settings = JSON.parse(
      localStorage.getItem("ifekaSchoolSettings") || "{}"
    ) || {};
  } catch (error) {
    settings = {};
  }

  return {
    schoolName: settings.schoolName || "",
    schoolAddress: settings.schoolAddress || "",
    schoolPhone: settings.schoolPhone || "",
    schoolEmail: settings.schoolEmail || "",
    principal: settings.principal || "",
    academicSession: settings.academicSession || "",
    currentTerm: settings.currentTerm || "",
schoolLogo: settings.schoolLogo || ""
  };
}
function printStudentReport() {
  const details = $("studentReportDetails");

  if (!details || !details.innerHTML.trim()) {
    alert("Please select a student first.");
    return;
  }

  const schoolSettings = getSchoolSettings();

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups to print the report.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${esc(schoolSettings.schoolName || "Student Report")}</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 30px;
          color: #111;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th, td {
          border: 1px solid #ddd;
          padding: 8px;
        }

        h2, h3 {
          margin-top: 10px;
        }

        #printStudentReportBtn {
          display: none !important;
        }

        @media print {
          body {
            padding: 15px;
          }
        }
      </style>
    </head>

    <body>
  ${details.innerHTML}

  <div style="margin-top:60px; display:flex; justify-content:space-between; gap:40px;">
    
    <div style="width:45%; text-align:center;">
      <div style="border-top:1px solid #000; padding-top:8px;">
        Class Teacher's Signature
      </div>
    </div>

    <div style="width:45%; text-align:center;">
      <div style="border-top:1px solid #000; padding-top:8px;">
        ${esc(schoolSettings.principal || "Principal / Head Teacher")}
      </div>
    </div>

  </div>
    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 300);
}

function printFeeReport() {
  const output = $("reportOutput");

  if (!output || !output.innerHTML.trim()) {
    alert("Please open the Fees & Payments Report first.");
    return;
  }

  const schoolSettings = getSchoolSettings();

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    alert("Please allow pop-ups for this school management app.");
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${esc(schoolSettings.schoolName || "Fees & Payments Report")}</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 30px;
          color: #111;
        }

        .school-header {
          text-align: center;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 15px;
          margin-bottom: 20px;
        }

        h1 {
          margin-bottom: 5px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }

        th,
        td {
          border: 1px solid #ccc;
          padding: 8px;
          text-align: left;
        }

        #printFeeReportBtn {
          display: none !important;
        }

        @media print {
          body {
            padding: 15px;
          }
        }
      </style>
    </head>

    <body>

          

      ${output.innerHTML}

    </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
  }, 500);
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

async function init() {
  setupNavigation();
  setupControls();
  setupSupabase();

  const authScreen = document.getElementById("authScreen");
  const resetScreen = document.getElementById("resetPasswordScreen");
  const sidebar = document.getElementById("sidebar");
  const main = document.querySelector("main.main");

  const loginForm = document.getElementById("loginForm");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
   const toggleLoginPassword = document.getElementById("toggleLoginPassword");

if (toggleLoginPassword) {
  toggleLoginPassword.addEventListener("click", function () {
    const isHidden = loginPassword.type === "password";

    loginPassword.type = isHidden ? "text" : "password";
    toggleLoginPassword.textContent = isHidden
      ? "🙈 Hide Password"
      : "👁️ Show Password";
  });
}
  const authMessage = document.getElementById("authMessage");

  const resetForm = document.getElementById("resetPasswordForm");
  const newPassword = document.getElementById("newPassword");
  const confirmPassword = document.getElementById("confirmPassword");
  const resetMessage = document.getElementById("resetPasswordMessage");

  function showLogin() {
    authScreen.style.display = "block";
    resetScreen.style.display = "none";
    sidebar.style.display = "none";
    main.style.display = "none";
  }

  function showReset() {
    authScreen.style.display = "none";
    resetScreen.style.display = "block";
    sidebar.style.display = "none";
    main.style.display = "none";
  }

  async function showApp() {
  await checkSuperAdmin();

  const access = await checkSchoolAccess();

  if (!access.allowed) {
    showLogin();
    authMessage.textContent = access.message;
    return;
  }

  authScreen.style.display = "none";
  resetScreen.style.display = "none";
  sidebar.style.display = "";
  main.style.display = "";

  const schoolsNavBtn = document.getElementById("schoolsNavBtn");

  if (schoolsNavBtn) {
    schoolsNavBtn.hidden = !isSuperAdmin;
  }

  console.log("Super Admin:", isSuperAdmin);

  showDashboard();
}

  if (!db) {
    showLogin();
    authMessage.textContent =
      "Supabase connection is unavailable. Check your configuration.";
    return;
  }

  showLogin();

  db.auth.onAuthStateChange(function (event, session) {
  if (event === "PASSWORD_RECOVERY") {
    showReset();
    return;
  }

  if (event === "SIGNED_OUT") {
    showLogin();
  }
});

try {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error("Session restoration error:", error);
    showLogin();
    authMessage.textContent =
      "Unable to restore your login session. Please sign in again.";
    return;
  }

  if (data.session) {
    showApp();
  } else {
    showLogin();
  }
} catch (error) {
  console.error("Session check failed:", error);
  showLogin();
  authMessage.textContent =
    "Unable to check your login session. Please sign in again.";
}
  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    authMessage.textContent = "Signing in...";

    const { data, error } = await db.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value
    });

    if (error) {
      authMessage.textContent = error.message;
      return;
    }

    if (data.session) {
      showApp();
    }
  });

  resetForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (newPassword.value !== confirmPassword.value) {
      resetMessage.textContent = "The passwords do not match.";
      return;
    }

    resetMessage.textContent = "Updating password...";

    const { error } = await db.auth.updateUser({
      password: newPassword.value
    });

    if (error) {
      resetMessage.textContent = error.message;
      return;
    }

    resetMessage.textContent =
      "Password updated successfully. Please sign in with your new password.";

    await db.auth.signOut();
    resetForm.reset();
    showLogin();
  });
}

function setupNavigation() {
  const nav = document.getElementById("nav");

  if (!nav) {
    console.error("Ifeka School: #nav was not found.");
    return;
  }

  console.log("Navigation initialized.");

  const buttons = nav.querySelectorAll("button[data-page]");

  buttons.forEach(function(button) {

    button.addEventListener("click", function(event) {

      event.preventDefault();
      event.stopPropagation();

      const page = button.getAttribute("data-page");

      console.log("CLICKED:", page);

      if (!page) {
        console.error("Button has no data-page:", button);
        return;
      }

      // Remove active state
      buttons.forEach(function(btn) {
        btn.classList.remove("active");
      });

      // Activate clicked button
      button.classList.add("active");

      // Close mobile menu
      closeMobileMenu();

      // Dashboard
      if (page === "dashboard") {
        showDashboard(button);
        return;
      }

      // Schools Management
if (page === "schools") {
  if (!isSuperAdmin) {
    setStatus("Access denied: Super Admin only.");
    return;
  }

  currentTable = null;
  editingKey = null;
  showOnly("moduleInfo");

  document.getElementById("pageTitle").textContent = "Schools Management";
  document.getElementById("moduleInfoTitle").textContent = "Schools Management";
  document.getElementById("moduleInfoText").innerHTML =
    document.getElementById("moduleInfoText").innerHTML = `
  <div style="margin-top:15px;">
    <button id="loadSchoolsBtn" class="btn" type="button">Refresh Schools</button>
    <button id="addSchoolBtn" class="btn" type="button">+ Add School</button>

    <p id="schoolsStatus">Loading schools...</p>

    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th>ID</th>
            <th>School Name</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Payment Status</th>
<th>Actions</th>
          </tr>
        </thead>
        <tbody id="schoolsTableBody"></tbody>
      </table>
    </div>

    <div id="addSchoolForm" hidden style="margin-top:20px;padding:15px;border:1px solid #ddd;">
      <h3>Add New School</h3>
      <form id="newSchoolForm">
        <p><input name="school_name" placeholder="School Name" required></p>
        <p><input name="school_address" placeholder="School Address"></p>
        <p><input name="school_phone" placeholder="School Phone"></p>
        <p><input name="school_email" type="email" placeholder="School Email"></p>
        <p><input name="principal" placeholder="Principal"></p>
        <p><input name="academic_session" placeholder="Academic Session, e.g. 2026/2027"></p>
        <p>
          <select name="current_term">
            <option>First Term</option>
            <option>Second Term</option>
            <option>Third Term</option>
          </select>
        </p>
        <button class="btn" type="submit">Save School</button>
        <button class="btn" id="cancelAddSchoolBtn" type="button">Cancel</button>
      </form>
    </div>
  </div>
`;
// Load and display all schools
async function loadSchools() {
  const status = document.getElementById("schoolsStatus");
  const tbody = document.getElementById("schoolsTableBody");

  status.textContent = "Loading schools...";
  tbody.innerHTML = "";

  try {
    const { data, error } = await db
      .from("schools")
      .select("id, school_name, school_address, school_phone, school_email")
      .order("id");

    if (error) throw error;

    if (!data || data.length === 0) {
      status.textContent = "No schools found.";
      return;
    }

    data.forEach(function (school) {
      const row = document.createElement("tr");

      [
        school.id,
        school.school_name,
        school.school_address,
        school.school_phone,
        school.school_email
      ].forEach(function (value) {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        cell.style.padding = "8px";
        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    status.textContent = "Schools loaded: " + data.length;
  } catch (error) {
    console.error("Loading schools failed:", error);
    status.textContent = "Could not load schools: " + error.message;
  }
}

// Refresh Schools button
document.getElementById("loadSchoolsBtn")
  .addEventListener("click", loadSchools);

// Add School button
document.getElementById("addSchoolBtn")
  .addEventListener("click", function () {
    document.getElementById("addSchoolForm").hidden = false;
  });

// Cancel Add School
document.getElementById("cancelAddSchoolBtn")
  .addEventListener("click", function () {
    document.getElementById("addSchoolForm").hidden = true;
    document.getElementById("newSchoolForm").reset();
  });

// Save a new school
document.getElementById("newSchoolForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const form = event.currentTarget;
    const status = document.getElementById("schoolsStatus");
    const values = Object.fromEntries(new FormData(form).entries());
const demoStart = new Date();
const demoExpiry = new Date(demoStart);
demoExpiry.setDate(demoExpiry.getDate() + 14);

values.demo_started_at = demoStart.toISOString();
values.demo_expires_at = demoExpiry.toISOString();
values.access_status = "active";
values.payment_status = "pending";
    status.textContent = "Saving school...";

    try {
      const { error } = await db
        .from("schools")
        .insert([values]);

      if (error) throw error;

      status.textContent = "School added successfully.";
      form.reset();
      document.getElementById("addSchoolForm").hidden = true;

      await loadSchools();
    } catch (error) {
      console.error("Saving school failed:", error);
      status.textContent = "Could not save school: " + error.message;
    }
  });

// Load schools when the page opens
loadSchools();
  return;
}
       // Database/table modules
      if (MODULE_MAP && MODULE_MAP[page]) {
        console.log(
          "Opening table:",
          MODULE_MAP[page]
        );

        openTable(MODULE_MAP[page], button);
        return;
      }

      // Information modules
      if (
        typeof INFO_MODULES !== "undefined" &&
        INFO_MODULES[page]
      ) {
        console.log(
          "Opening information module:",
          page
        );

        openInfoModule(page, button);
        return;
      }

      // Fallback
      console.warn(
        "Module not configured:",
        page
      );

      setStatus(
        "Module not configured: " + page
      );
    });

  });

  console.log(
    "Navigation buttons found:",
    buttons.length
  );
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
// Live Results calculation: Total, Grade and Remark
function calculateResultFields(form) {
  if (!form || currentTable !== "results") return;

  const caInput = form.querySelector('[name="ca_score"]');
  const examInput = form.querySelector('[name="exam_score"]');
  const totalInput = form.querySelector('[name="total"]');
  const gradeInput = form.querySelector('[name="grade"]');
  const remarkInput = form.querySelector('[name="remark"]');

  if (!caInput || !examInput) return;

  const caScore = Number(caInput.value) || 0;
  const examScore = Number(examInput.value) || 0;

  const total = caScore + examScore;

  let grade = "";
  let remark = "";

  if (total >= 70) {
    grade = "A";
    remark = "Excellent";
  } else if (total >= 60) {
    grade = "B";
    remark = "Very Good";
  } else if (total >= 50) {
    grade = "C";
    remark = "Good";
  } else if (total >= 45) {
    grade = "D";
    remark = "Fair";
  } else if (total >= 40) {
    grade = "E";
    remark = "Pass";
  } else {
    grade = "F";
    remark = "Fail";
  }

  if (totalInput) {
    totalInput.value = total;
  }

  if (gradeInput) {
    gradeInput.value = grade;
  }

  if (remarkInput) {
    remarkInput.value = remark;
  }
}


// Run calculation whenever CA or Exam changes
document.addEventListener("input", function (event) {
  if (currentTable !== "results") return;

  const target = event.target;

  if (
    !target.matches('[name="ca_score"], [name="exam_score"]')
  ) {
    return;
  }

  const form = target.closest("form");

  if (!form) return;

  calculateResultFields(form);
});


// Also calculate when the form is opened/loaded
document.addEventListener("change", function (event) {
  if (currentTable !== "results") return;

  const target = event.target;

  if (
    target.matches('[name="ca_score"], [name="exam_score"]')
  ) {
    const form = target.closest("form");

    if (form) {
      calculateResultFields(form);
    }
  }
});
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
  const dashboardPanel = document.querySelector("#dashboard .panel");
  const schoolLogo = getSchoolSettings().schoolLogo;
  const schoolName = getSchoolSettings().schoolName;
  const welcomeHeading = $("dashboardWelcome");

  if (welcomeHeading) {
    welcomeHeading.textContent = schoolName
      ? "Welcome to " + schoolName
      : "Welcome to Ifeka School Management";
  }
  if (dashboardPanel) {
    let dashboardLogo = document.getElementById("dashboardSchoolLogo");

    if (schoolLogo) {
      if (!dashboardLogo) {
        dashboardLogo = document.createElement("img");
        dashboardLogo.id = "dashboardSchoolLogo";
        dashboardLogo.alt = "School Logo";

        dashboardLogo.style.cssText =
          "display:block; max-width:100px; max-height:100px; object-fit:contain; margin:0 auto 16px;";

        dashboardPanel.prepend(dashboardLogo);
      }

      dashboardLogo.src = schoolLogo;
      dashboardLogo.style.display = "block";
    } else if (dashboardLogo) {
      dashboardLogo.style.display = "none";
    }
  }
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

  if (page === "reports") {
    if ($("moduleInfoText")) {
      $("moduleInfoText").innerHTML = `
        <div style="margin-top:15px;">
          <p>Generate useful reports from your school records.</p>

          <div style="display:grid; gap:12px; margin-top:20px;">
            <button type="button" id="studentReportBtn">
              Student Report
            </button>

            <button type="button" id="teacherReportBtn">
              Teacher Report
            </button>

            <button type="button" id="attendanceReportBtn">
              Attendance Report
            </button>

            <button type="button" id="resultReportBtn">
              Results Report
            </button>

            <button type="button" id="feeReportBtn">
              Fees & Payments Report
            </button>
          </div>

          <div id="reportOutput" style="margin-top:20px;"></div>
        </div>
      `;

      const reportButtons = {
  studentReportBtn: "students",
  teacherReportBtn: "teachers",
  attendanceReportBtn: "attendance",
  resultReportBtn: "results",
  feeReportBtn: "fee_payments"
};

Object.keys(reportButtons).forEach(id => {
  const btn = $(id);

  if (btn) {
    btn.addEventListener("click", async function () {
      const table = reportButtons[id];
      const output = $("reportOutput");

      if (!output || !db) return;

      output.innerHTML = "Loading report...";

      try {
        if (table === "students") {
          const studentsResult = await db
  .from("students")
  .select("*");

          if (studentsResult.error) {
            throw studentsResult.error;
          }

          const students = studentsResult.data || [];

          if (!students.length) {
            output.innerHTML = `
              <div style="padding:15px;">
                No students found.
              </div>
            `;
            return;
          }

          output.innerHTML = `
            <div style="padding:15px; border:1px solid #ddd; border-radius:10px;">
              <h3>Student Report</h3>

              <label for="studentReportSelect">
                <strong>Select Student</strong>
              </label>

              <select id="studentReportSelect"
                style="width:100%; padding:10px; margin-top:8px;">
                <option value="">-- Select Student --</option>

                ${students.map(student => `
                  <option value="${esc(student.student_id)}">
                    ${esc(
                      (student.first_name || "") +
                      " " +
                      (student.last_name || "")
                    )} -
                    ${esc(student.student_id)}
                  </option>
                `).join("")}
              </select>

              <div style="margin-top:15px;">
  <button
    type="button"
    id="printStudentReportBtn"
    onclick="printStudentReport()"
    style="width:100%; padding:12px; font-weight:bold;">
    Print / Save as PDF
  </button>
</div>

<div id="studentReportDetails" style="margin-top:20px;"></div>
          `;

          const select = $("studentReportSelect");

          if (select) {
            select.addEventListener("change", async function () {
              const studentId = this.value;
              const details = $("studentReportDetails");

              if (!details || !studentId) {
                if (details) details.innerHTML = "";
                return;
              }

              details.innerHTML = "Loading student details...";

              try {
                const studentResult = await db
  .from("students")
  .select("*")
  .eq("student_id", studentId)
  .limit(1);

if (studentResult.error) {
  throw studentResult.error;
}

const student = (studentResult.data || [])[0];

                if (!student) {
                  details.innerHTML = "Student record not found.";
                  return;
                }

                const resultData = await db
                  .from("results")
                  .select("*")
                  .eq("student_id", studentId)
                  .order("session")
                  .order("term");

                if (resultData.error) {
                  throw resultData.error;
                }

                const results = resultData.data || [];

                const subjectIds = [
                  ...new Set(
                    results
                      .map(row => row.subject_id)
                      .filter(value => value !== null && value !== undefined)
                  )
                ];

                let subjects = [];

const subjectData = await db
  .from("subjects")
  .select("*");

if (subjectData.error) {
  throw subjectData.error;
}

subjects = subjectData.data || [];

const subjectMap = {};

subjects.forEach(subject => {
  const subjectName =
    subject.subject_name ||
    subject.subject_code ||
    "Subject";

  subjectMap[String(subject.id)] = subjectName;
  subjectMap[String(subjectName).trim()] = subjectName;
});
                 const schoolSettings = getSchoolSettings();
                details.innerHTML = `
                  <div style="
  margin-bottom:20px;
  padding:20px;
  border:1px solid #ddd;
  border-radius:10px;
  text-align:center;
">
${schoolSettings.schoolLogo
  ? `
    <div style="margin-bottom:10px;">
      <img
        src="${schoolSettings.schoolLogo}"
        alt="School Logo"
        style="
          max-width:100px;
          max-height:100px;
          object-fit:contain;
        "
      >
    </div>
  `
  : ""
}
  <h2 style="margin:0 0 6px 0;">
    ${esc(schoolSettings.schoolName || "School")}
  </h2>

  <div style="font-size:14px;">
    ${esc(schoolSettings.schoolAddress || "")}
  </div>

  <div style="font-size:14px; margin-top:4px;">
    ${esc(schoolSettings.schoolPhone || "")}
    ${schoolSettings.schoolEmail
      ? " | " + esc(schoolSettings.schoolEmail)
      : ""}
  </div>

  <div style="margin-top:10px; font-weight:bold;">
    ${esc(schoolSettings.academicSession || "")}
    ${schoolSettings.currentTerm
      ? " | " + esc(schoolSettings.currentTerm)
      : ""}
  </div>
<div style="
  margin:15px 0;
  padding:10px;
  text-align:center;
  font-size:20px;
  font-weight:bold;
  border-top:2px solid #222;
  border-bottom:2px solid #222;
">
  STUDENT REPORT
</div>
</div>

<div style="margin-bottom:20px;">
                    <h3>
                      ${esc(
                        (student.first_name || "") +
                        " " +
                        (student.last_name || "")
                      )}
                    </h3>

                    <p>
                      <strong>Student ID:</strong>
                      ${esc(student.student_id || "")}
                    </p>

                    <p>
                      <strong>Gender:</strong>
                      ${esc(student.gender || "")}
                    </p>

                    <p>
                      <strong>Date of Birth:</strong>
                      ${esc(student.date_of_birth || "")}
                    </p>

                    <p>
                      <strong>Class:</strong>
                      ${esc(student.class || "")}
                    </p>

                    <p>
                      <strong>Phone:</strong>
                      ${esc(student.phone || "")}
                    </p>

                    <p>
                      <strong>Email:</strong>
                      ${esc(student.email || "")}
                    </p>
                  </div>

                  <h3>Academic Results</h3>

                  ${
                    results.length
                      ? `
                        <div style="overflow-x:auto;">
                          <table style="width:100%; border-collapse:collapse;">
                            <thead>
                              <tr>
                                <th style="border:1px solid #ddd; padding:8px;">Subject</th>
                                <th style="border:1px solid #ddd; padding:8px;">CA</th>
                                <th style="border:1px solid #ddd; padding:8px;">Exam</th>
                                <th style="border:1px solid #ddd; padding:8px;">Total</th>
                                <th style="border:1px solid #ddd; padding:8px;">Grade</th>
                                <th style="border:1px solid #ddd; padding:8px;">Remark</th>
                              </tr>
                            </thead>

                            <tbody>
                              ${results.map(row => `
                                <tr>
                                  <td style="border:1px solid #ddd; padding:8px;">
                                    
                                      ${esc(
  subjectMap[String(row.subject_id).trim()] ||
  row.subject_id ||
  ""
)}
                                  </td>

                                  <td style="border:1px solid #ddd; padding:8px;">
                                    ${esc(row.ca_score ?? "")}
                                  </td>

                                  <td style="border:1px solid #ddd; padding:8px;">
                                    ${esc(row.exam_score ?? "")}
                                  </td>

                                  <td style="border:1px solid #ddd; padding:8px;">
                                    ${esc(row.total ?? "")}
                                  </td>

                                  <td style="border:1px solid #ddd; padding:8px;">
                                    ${esc(row.grade ?? "")}
                                  </td>

                                  <td style="border:1px solid #ddd; padding:8px;">
                                    ${esc(row.remark ?? "")}
                                  </td>
                                </tr>
                              `).join("")}
                            </tbody>
                          </table>
                        </div>
                      `
                      : `
                        <p>No results found for this student.</p>
                      `
                  }
                `;
              } catch (error) {
                details.innerHTML = `
                  <div style="padding:15px; color:#b00020;">
                    Student report failed: ${esc(error.message)}
                  </div>
                `;
              }
            });
          }

          return;
        }
    if (table === "teachers") {
  const teacherResult = await db
    .from("teachers")
    .select("*");

  if (teacherResult.error) {
    throw teacherResult.error;
  }

  const teachers = teacherResult.data || [];

  if (!teachers.length) {
    output.innerHTML = `
      <div style="padding:15px;">
        No teachers found.
      </div>
    `;
    return;
  }

  const teacherColumns = Object.keys(teachers[0]);

  output.innerHTML = `
    <div style="padding:15px; border:1px solid #ddd; border-radius:10px;">
      <h3>Teacher Report</h3>

      <p>
        <strong>Total Teachers:</strong>
        ${teachers.length}
      </p>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              ${teacherColumns.map(column => `
                <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                  ${esc(pretty(column))}
                </th>
              `).join("")}
            </tr>
          </thead>

          <tbody>
            ${teachers.map(teacher => `
              <tr>
                ${teacherColumns.map(column => `
                  <td style="border:1px solid #ddd; padding:8px;">
                    ${esc(teacher[column] ?? "")}
                  </td>
                `).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return;
}

if (table === "attendance") {
  const attendanceResult = await db
    .from("attendance")
    .select("*");

  if (attendanceResult.error) {
    throw attendanceResult.error;
  }

  const attendance = attendanceResult.data || [];

  if (!attendance.length) {
    output.innerHTML = `
      <div style="padding:15px;">
        No attendance records found.
      </div>
    `;
    return;
  }

  const studentsResult = await db
    .from("students")
    .select("student_id, first_name, last_name");

  if (studentsResult.error) {
    throw studentsResult.error;
  }

  const students = studentsResult.data || [];

  const studentMap = {};

  students.forEach(student => {
    const name =
      `${student.first_name || ""} ${student.last_name || ""}`.trim();

    studentMap[String(student.student_id).trim()] =
      name || String(student.student_id || "");
  });

  output.innerHTML = `
    <div style="padding:15px; border:1px solid #ddd; border-radius:10px;">
      <h3>Attendance Report</h3>

      <p>
        <strong>Total Attendance Records:</strong>
        ${attendance.length}
      </p>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                ID
              </th>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                Student ID
              </th>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                Student Name
              </th>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                Attendance Date
              </th>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                Status
              </th>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                Remarks
              </th>
              <th style="border:1px solid #ddd; padding:8px; text-align:left;">
                Created At
              </th>
            </tr>
          </thead>

          <tbody>
            ${attendance.map(record => `
              <tr>
                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(record.id ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(record.student_id ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(
                    studentMap[String(record.student_id ?? "").trim()] ||
                    ""
                  )}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(record.attendance_date ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(record.status ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(record.remarks ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(record.created_at ?? "")}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return;
}
         if (table === "results") {
  const resultsResult = await db
    .from("results")
    .select("*");

  if (resultsResult.error) {
    throw resultsResult.error;
  }

  const results = resultsResult.data || [];

  if (!results.length) {
    output.innerHTML = `
      <div style="padding:15px;">
        No results found.
      </div>
    `;
    return;
  }

  const studentsResult = await db
    .from("students")
    .select("student_id, first_name, last_name");

  const subjectsResult = await db
    .from("subjects")
    .select("id, subject_name");

  const studentMap = {};

(studentsResult.data || []).forEach(student => {
  const name =
    `${student.first_name || ""} ${student.last_name || ""}`.trim();

  studentMap[String(student.student_id)] =
    name || String(student.student_id || "");
});
  const subjectMap = {};

  (subjectsResult.data || []).forEach(subject => {
    subjectMap[String(subject.id)] =
      subject.subject_name || "";
  });

  output.innerHTML = `
  ${
    (() => {
      const school = getSchoolSettings();

      return `
        <div style="text-align:center; margin-bottom:20px;">

          ${
            school.schoolLogo
              ? `<img
                  src="${school.schoolLogo}"
                  alt="School Logo"
                  style="max-width:120px; max-height:120px; object-fit:contain;"
                >`
              : ""
          }

          <h2 style="margin:8px 0;">
            ${esc(school.schoolName || "")}
          </h2>

          <p style="margin:5px 0;">
            ${esc(school.schoolAddress || "")}
          </p>

          <p style="margin:5px 0;">
            ${esc(school.schoolPhone || "")}
            ${school.schoolPhone && school.schoolEmail ? " | " : ""}
            ${esc(school.schoolEmail || "")}
          </p>

          <h3 style="margin:12px 0;">
            ${esc(school.academicSession || "")}
            ${school.academicSession && school.currentTerm ? " | " : ""}
            ${esc(school.currentTerm || "")}
          </h3>

          <hr>
          <h2>RESULTS REPORT</h2>
          <hr>

        </div>
      `;
    })()
  }
    <div style="padding:15px; border:1px solid #ddd; border-radius:10px;">
    ${esc(getSchoolSettings().schoolName || "School Name Not Set")}
  </h2>

  <p style="margin:5px 0;">
    ${esc(getSchoolSettings().schoolAddress || "School Address Not Set")}
  </p>

</div>
    <div style="padding:15px; border:1px solid #ddd; border-radius:10px;">
      <h3>Results Report</h3>

      <p>
        <strong>Total Results:</strong>
        ${results.length}
      </p>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="border:1px solid #ddd; padding:8px;">Student</th>
              <th style="border:1px solid #ddd; padding:8px;">Subject</th>
              <th style="border:1px solid #ddd; padding:8px;">Session</th>
              <th style="border:1px solid #ddd; padding:8px;">Term</th>
              <th style="border:1px solid #ddd; padding:8px;">CA</th>
              <th style="border:1px solid #ddd; padding:8px;">Exam</th>
              <th style="border:1px solid #ddd; padding:8px;">Total</th>
              <th style="border:1px solid #ddd; padding:8px;">Grade</th>
              <th style="border:1px solid #ddd; padding:8px;">Remark</th>
            </tr>
          </thead>

          <tbody>
            ${results.map(row => `
              <tr>
                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(
  studentMap[String(row.student_id)] ||
  row.student_id ||
  ""
)}
<br>
<small>${esc(row.student_id || "")}</small>
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(
                    subjectMap[String(row.subject_id)] ||
                    row.subject_id ||
                    ""
                  )}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.session ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.term ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.ca_score ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.exam_score ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.total ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.grade ?? "")}
                </td>

                <td style="border:1px solid #ddd; padding:8px;">
                  ${esc(row.remark ?? "")}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return;
}
         if (table === "fee_payments") {
  const feeResult = await db
    .from("fee_payments")
    .select("*");

  if (feeResult.error) {
    throw feeResult.error;
  }

  const fees = feeResult.data || [];

  const studentsResult = await db
    .from("students")
    .select("id, student_id, first_name, last_name, total_fee");

  if (studentsResult.error) {
    throw studentsResult.error;
  }

  const students = studentsResult.data || [];

  const paymentMap = {};

  fees.forEach(payment => {
    const key = String(payment.student_id ?? "").trim();

    if (!paymentMap[key]) {
      paymentMap[key] = 0;
    }

    paymentMap[key] += Number(payment.amount) || 0;
  });

  output.innerHTML = `
  
    <div style="padding:15px; border:1px solid #ddd; border-radius:10px; text-align:center;">

${
  getSchoolSettings().schoolLogo
    ? `<img
        src="${getSchoolSettings().schoolLogo}"
        alt="School Logo"
        style="max-width:100px; max-height:100px; object-fit:contain; margin-bottom:10px;"
      >`
    : ""
}

<h2 style="margin:0 0 6px;">
  ${esc(getSchoolSettings().schoolName || "School")}
</h2>

<div style="font-size:14px; margin-top:5px;">
  ${esc(getSchoolSettings().schoolAddress || "")}
</div>

<div style="font-size:14px; margin-top:4px;">
  ${esc(getSchoolSettings().schoolPhone || "")}
  ${getSchoolSettings().schoolEmail ? " | " + esc(getSchoolSettings().schoolEmail) : ""}
</div>

<div style="margin-top:10px; font-weight:bold;">
  ${esc(getSchoolSettings().academicSession || "")}
  ${getSchoolSettings().currentTerm ? " | " + esc(getSchoolSettings().currentTerm) : ""}
</div>

<div style="margin:15px 0; padding:10px; font-size:20px; font-weight:bold; border-top:2px solid #222; border-bottom:2px solid #222;">
  FEES & PAYMENTS REPORT
</div>

      <p>
        <strong>Total Payment Records:</strong>
        ${fees.length}
      </p>

<div style="margin:15px 0;">
  <button
    type="button"
    id="printFeeReportBtn"
    onclick="printFeeReport()"
    style="width:100%; padding:12px; font-weight:bold;"
  >
    Print / Save as PDF
  </button>
</div>
            <div style="width:100%; max-width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
        <table style="width:100%; min-width:700px; border-collapse:collapse; table-layout:auto;">

          <thead>
            <tr>
              <th style="border:1px solid #ddd; padding:8px;">
                Student ID
              </th>

              <th style="border:1px solid #ddd; padding:8px;">
                Student Name
              </th>

              <th style="border:1px solid #ddd; padding:8px;">
                Total Fee
              </th>

              <th style="border:1px solid #ddd; padding:8px;">
                Amount Paid
              </th>

              <th style="border:1px solid #ddd; padding:8px;">
                Balance
              </th>

              <th style="border:1px solid #ddd; padding:8px;">
                Payment Status
              </th>
            </tr>
          </thead>

          <tbody>

            ${students.map(student => {

              const studentDbId =
                String(student.id ?? "").trim();

              const totalFee =
                Number(student.total_fee) || 0;

              const amountPaid =
                paymentMap[studentDbId] || 0;

              const balance =
                Math.max(totalFee - amountPaid, 0);

              let status = "No Fee Set";

              if (totalFee > 0) {

                if (amountPaid <= 0) {
                  status = "Not Paid";
                } else if (amountPaid >= totalFee) {
                  status = "Full Payment";
                } else if (amountPaid * 2 === totalFee) {
                  status = "Half Payment";
                } else {
                  status = "Part Payment";
                }
              }

              const studentName =
                `${student.first_name || ""} ${student.last_name || ""}`.trim();

              return `
                <tr>

                  <td style="border:1px solid #ddd; padding:8px;">
                    ${esc(student.student_id || "")}
                  </td>

                  <td style="border:1px solid #ddd; padding:8px;">
                    ${esc(studentName)}
                  </td>

                  <td style="border:1px solid #ddd; padding:8px;">
                    ₦${totalFee.toLocaleString()}
                  </td>

                  <td style="border:1px solid #ddd; padding:8px;">
                    ₦${amountPaid.toLocaleString()}
                  </td>

                  <td style="border:1px solid #ddd; padding:8px;">
                    ₦${balance.toLocaleString()}
                  </td>

                  <td style="border:1px solid #ddd; padding:8px;">
                    ${esc(status)}
                  </td>

                </tr>
              `;
            }).join("")}

          </tbody>
        </table>
      </div>
    </div>
  `;

  return;
}
        const result = await db
          .from(table)
          .select("*");

        if (result.error) {
          throw result.error;
        }

        const data = result.data || [];

        output.innerHTML = `
          <div style="padding:15px; border:1px solid #ddd; border-radius:10px;">
            <h3>${table.replace("_", " ")} Report</h3>
            <p><strong>Total records:</strong> ${data.length}</p>
          </div>
        `;
      } catch (error) {
        output.innerHTML = `
          <div style="padding:15px; color:#b00020;">
            Report failed: ${esc(error.message)}
          </div>
        `;
      }
    });
  }
});
    }
    } else if (page === "settings") {
    let saved = {};

    try {
      saved = JSON.parse(
        localStorage.getItem("ifekaSchoolSettings") || "{}"
      ) || {};
    } catch (error) {
      saved = {};
    }

    if ($("moduleInfoText")) {
      $("moduleInfoText").innerHTML = `
        <div style="max-width:720px; margin-top:15px;">

          <p style="margin-bottom:20px;">
            Manage your school profile and academic settings.
          </p>

          <div style="
            display:grid;
            gap:15px;
          ">

            <label>
              <strong>School Name</strong>
              <input
                type="text"
                id="schoolSettingName"
                value="${esc(saved.schoolName || "")}"
                placeholder="e.g. Ifeka School"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>
            <label>
              <strong>School Logo</strong>
              <input
                type="file"
                id="schoolSettingLogo"
                accept="image/*"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>
            <label>
              <strong>School Address</strong>
              <input
                type="text"
                id="schoolSettingAddress"
                value="${esc(saved.schoolAddress || "")}"
                placeholder="School address"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>

            <label>
              <strong>School Phone</strong>
              <input
                type="text"
                id="schoolSettingPhone"
                value="${esc(saved.schoolPhone || "")}"
                placeholder="Phone number"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>

            <label>
              <strong>School Email</strong>
              <input
                type="email"
                id="schoolSettingEmail"
                value="${esc(saved.schoolEmail || "")}"
                placeholder="school@example.com"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>

            <label>
              <strong>Head Teacher / Principal</strong>
              <input
                type="text"
                id="schoolSettingPrincipal"
                value="${esc(saved.principal || "")}"
                placeholder="Name of Head Teacher / Principal"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>

            <label>
              <strong>Academic Session</strong>
              <input
                type="text"
                id="schoolSettingSession"
                value="${esc(saved.academicSession || "")}"
                placeholder="e.g. 2026/2027"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
            </label>

            <label>
              <strong>Current Term</strong>
              <select
                id="schoolSettingTerm"
                style="
                  width:100%;
                  box-sizing:border-box;
                  padding:10px;
                  margin-top:6px;
                "
              >
                <option value="">Select Term</option>
                <option value="First Term" ${saved.currentTerm === "First Term" ? "selected" : ""}>
                  First Term
                </option>
                <option value="Second Term" ${saved.currentTerm === "Second Term" ? "selected" : ""}>
                  Second Term
                </option>
                <option value="Third Term" ${saved.currentTerm === "Third Term" ? "selected" : ""}>
                  Third Term
                </option>
              </select>
            </label>

          </div>

          <div style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            margin-top:22px;
          ">

            <button
              type="button"
              id="saveSettingsBtn"
              style="padding:10px 16px;"
            >
              Save Settings
            </button>

            <button
              type="button"
              id="printSettingsBtn"
              style="padding:10px 16px;"
            >
              Print / Save as PDF
            </button>

          </div>

          <div
            id="settingsMessage"
            style="margin-top:15px;"
          ></div>

        </div>
      `;

      const saveBtn = $("saveSettingsBtn");
      const printBtn = $("printSettingsBtn");
      const message = $("settingsMessage");
// Load school settings from Supabase
(async function loadSchoolSettingsFromSupabase() {
  try {
    const { data: schoolId, error: idError } =
      await db.rpc("get_my_school_id");

    if (idError) throw idError;

    if (!schoolId) {
      throw new Error("No school is linked to this account.");
    }

    const { data: school, error: schoolError } = await db
      .from("schools")
      .select("*")
      .eq("id", schoolId)
      .single();

    if (schoolError) throw schoolError;

    $("schoolSettingName").value = school.school_name || "";
    $("schoolSettingAddress").value = school.school_address || "";
    $("schoolSettingPhone").value = school.school_phone || "";
    $("schoolSettingEmail").value = school.school_email || "";
    $("schoolSettingPrincipal").value = school.principal || "";
    $("schoolSettingSession").value = school.academic_session || "";
    $("schoolSettingTerm").value = school.current_term || "";

    saved.schoolLogo = school.school_logo || "";

    if (message) {
      message.innerHTML =
        '<span style="color:green;">School settings loaded from Supabase.</span>';
    }
  } catch (error) {
    if (message) {
      message.innerHTML =
        `<span style="color:#b00020;">Unable to load settings: ${esc(error.message)}</span>`;
    }
  }
})();
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
           
          const logoInput = $("schoolSettingLogo");
const logoFile = logoInput?.files?.[0];

let schoolLogo = saved.schoolLogo || "";

if (logoFile) {
  schoolLogo = await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");

        const maxSize = 500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };

      img.onerror = () => reject(
        new Error("Unable to process school logo.")
      );

      img.src = reader.result;
    };

    reader.onerror = () => reject(
      new Error("Unable to read school logo.")
    );

    reader.readAsDataURL(logoFile);
  });
}
          const settings = {
            schoolName: $("schoolSettingName")?.value.trim() || "",
            schoolAddress: $("schoolSettingAddress")?.value.trim() || "",
            schoolPhone: $("schoolSettingPhone")?.value.trim() || "",
            schoolEmail: $("schoolSettingEmail")?.value.trim() || "",
            principal: $("schoolSettingPrincipal")?.value.trim() || "",
            academicSession: $("schoolSettingSession")?.value.trim() || "",
            currentTerm: $("schoolSettingTerm")?.value || "",
schoolLogo: schoolLogo
          };

          try {
            const { data: schoolId, error: idError } =
  await db.rpc("get_my_school_id");

if (idError) throw idError;

if (!schoolId) {
  throw new Error("No school is linked to this account.");
}

const { error: updateError } = await db
  .from("schools")
  .update({
    school_name: settings.schoolName,
    school_address: settings.schoolAddress,
    school_phone: settings.schoolPhone,
    school_email: settings.schoolEmail,
    principal: settings.principal,
    academic_session: settings.academicSession,
    current_term: settings.currentTerm,
    school_logo: settings.schoolLogo
  })
  .eq("id", schoolId);

if (updateError) throw updateError;

localStorage.setItem(
  "ifekaSchoolSettings",
  JSON.stringify(settings)
);

            if (message) {
              message.innerHTML = `
                <span style="color:green; font-weight:bold;">
                  ✓ Settings saved successfully.
                </span>
              `;
            }

            if (typeof setStatus === "function") {
              setStatus("School settings saved.");
            }

          } catch (error) {

            if (message) {
              message.innerHTML = `
                <span style="color:#b00020;">
                  Unable to save settings: ${esc(error.message)}
                </span>
              `;
            }
          }
        });
      }

      if (printBtn) {
        printBtn.addEventListener("click", () => {

          const settings = {
            schoolName: $("schoolSettingName")?.value.trim() || "",
            schoolAddress: $("schoolSettingAddress")?.value.trim() || "",
            schoolPhone: $("schoolSettingPhone")?.value.trim() || "",
            schoolEmail: $("schoolSettingEmail")?.value.trim() || "",
            principal: $("schoolSettingPrincipal")?.value.trim() || "",
            academicSession: $("schoolSettingSession")?.value.trim() || "",
            currentTerm: $("schoolSettingTerm")?.value || ""
          };

          const printWindow = window.open(
            "",
            "_blank",
            "width=800,height=900"
          );

          if (!printWindow) {
            if (message) {
              message.innerHTML = `
                <span style="color:#b00020;">
                  Please allow pop-ups to print the settings.
                </span>
              `;
            }
            return;
          }

          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>${esc(settings.schoolName || "School Settings")}</title>

              <style>
                body {
                  font-family: Arial, sans-serif;
                  padding: 40px;
                  color: #111;
                }

                h1 {
                  text-align: center;
                  margin-bottom: 5px;
                }

                .subtitle {
                  text-align: center;
                  margin-bottom: 30px;
                  color: #555;
                }

                table {
                  width: 100%;
                  border-collapse: collapse;
                  margin-top: 20px;
                }

                th, td {
                  border: 1px solid #ccc;
                  padding: 12px;
                  text-align: left;
                }

                th {
                  width: 35%;
                  background: #f3f3f3;
                }

                .footer {
                  margin-top: 40px;
                  text-align: center;
                  font-size: 12px;
                  color: #666;
                }

                @media print {
                  body {
                    padding: 20px;
                  }
                }
              </style>
            </head>

            <body>

              <h1>${esc(settings.schoolName || "School")}</h1>

              <div class="subtitle">
                School Settings
              </div>

              <table>
                <tr>
                  <th>School Name</th>
                  <td>${esc(settings.schoolName)}</td>
                </tr>

                <tr>
                  <th>School Address</th>
                  <td>${esc(settings.schoolAddress)}</td>
                </tr>

                <tr>
                  <th>School Phone</th>
                  <td>${esc(settings.schoolPhone)}</td>
                </tr>

                <tr>
                  <th>School Email</th>
                  <td>${esc(settings.schoolEmail)}</td>
                </tr>

                <tr>
                  <th>Head Teacher / Principal</th>
                  <td>${esc(settings.principal)}</td>
                </tr>

                <tr>
                  <th>Academic Session</th>
                  <td>${esc(settings.academicSession)}</td>
                </tr>

                <tr>
                  <th>Current Term</th>
                  <td>${esc(settings.currentTerm)}</td>
                </tr>
              </table>

              <div class="footer">
                Generated from Ifeka School Management
              </div>

            </body>
            </html>
          `);

          printWindow.document.close();

          setTimeout(() => {
            printWindow.focus();
            printWindow.print();
          }, 300);
        });
      }
    }

  } else {
    if ($("moduleInfoText")) {
      $("moduleInfoText").textContent = info.text;
    }
  }

  if ($("addBtn")) {
    $("addBtn").style.display = "none";
  }

  document.querySelectorAll("#nav button").forEach(btn => {
    btn.classList.remove("active");
  });

  if (button) {
    button.classList.add("active");
  }

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

if (table === "teachers") {
  result.data?.sort((a, b) =>
    String(a.teacher_id || "").localeCompare(
      String(b.teacher_id || ""),
      undefined,
      { numeric: true, sensitivity: "base" }
    )
  );
}
console.log("Loading table:", table);
console.log("Supabase result:", result);
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

if (table === "students") {
  window.studentsList = rows;
}
     

if (table === "results") {
  const { data: resultStudents, error: resultStudentsError } = await db
    .from("students")
    .select("id, student_id, first_name, last_name");

  if (resultStudentsError) {
    console.error("Could not load result student names:", resultStudentsError);
    window.studentsList = [];
  } else {
    window.studentsList = resultStudents || [];
  }
}

if (table === "fee_payments") {
  const { data: feeStudents, error: feeStudentsError } = await db
    .from("students")
    .select("id, student_id, first_name, last_name");

  if (feeStudentsError) {
    console.error("Could not load fee payment student names:", feeStudentsError);
    window.feePaymentStudents = [];
  } else {
    window.feePaymentStudents = feeStudents || [];
  }
}
if (table === "timetable") {
  const [
    { data: classData },
    { data: subjectData },
    { data: teacherData }
  ] = await Promise.all([
    db.from("school_classes")
      .select("id, class_name, section"),

    db.from("subjects")
      .select("id, subject_name, subject_code"),

    db.from("teachers")
      .select("id, teacher_id, first_name, last_name")
  ]);

  window.timetableClasses = classData || [];
  window.timetableSubjects = subjectData || [];
  window.timetableTeachers = teacherData || [];
}
     if (table === "school_classes") {
  const { data: classTeachers, error: classTeachersError } = await db
    .from("teachers")
    .select("id, teacher_id, first_name, last_name");

  if (classTeachersError) {
    console.error(
      "Could not load class teacher names:",
      classTeachersError
    );
    window.classTeachers = [];
  } else {
    window.classTeachers = classTeachers || [];
  }
}
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
      columns.map(column => {
  let heading = pretty(column);

  if (currentTable === "timetable") {
    if (column === "class_id") heading = "Class";
    if (column === "subject_id") heading = "Subject";
    if (column === "teacher_id") heading = "Teacher";
  }

  return "<th>" + esc(heading) + "</th>";
}).join("") +
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

  const displayColumns =
  currentTable === "school_classes"
    ? [
        ...columns.filter(column =>
          !["description", "created_at", "teacher_id", "class_teacher_id"].includes(column)
        ),
        "class_teacher"
      ]
    : currentTable === "fee_payments" || currentTable === "results"
      ? columns.flatMap(column =>
          column === "student_id"
            ? ["student_id", "student_name"]
            : [column]
        )
      : columns;
  const thead = $("thead");
  if (thead) {
    thead.innerHTML =
      "<tr>" +
      displayColumns.map(column => {
  let heading = pretty(column);

  if (currentTable === "school_classes" && column === "class_teacher") {
    heading = "Class Teacher";
  }

  return "<th>" + esc(heading) + "</th>";
}).join("") +
      "<th>Actions</th>" +
      "</tr>";
  }

  const tbody = $("tbody");
  if (!tbody) return;

  
  tbody.innerHTML = filtered.map(row => {
    const index = rows.indexOf(row);

    return (
      "<tr>" +
      displayColumns.map(column => {
  let value = row[column];
         if (currentTable === "school_classes" && column === "class_teacher") {
  value = row.teacher_id || "";
}
      if (currentTable === "fee_payments" && column === "student_name") {
  const student = (window.feePaymentStudents || []).find(
    s => String(s.id) === String(row.student_id)
  );

  value = student
    ? `${student.first_name || ""} ${student.last_name || ""}`.trim()
    : "";
}   
if (currentTable === "results" && column === "student_name") {
    const student = (window.studentsList || []).find(
        s => String(s.student_id) === String(row.student_id)
    );

    value = student
        ? `${student.first_name || ""} ${student.last_name || ""}`.trim()
        : "";
}
  if (currentTable === "timetable") {

    if (column === "class_id") {
      const item = (window.timetableClasses || []).find(
        x => String(x.id) === String(value)
      );

      if (item) {
        value = item.class_name +
          (item.section ? " - " + item.section : "");
      }
    }

    if (column === "subject_id") {
      const item = (window.timetableSubjects || []).find(
        x => String(x.id) === String(value)
      );

      if (item) {
        value = item.subject_name +
          (item.subject_code
            ? " (" + item.subject_code + ")"
            : "");
      }
    }
       }
    if (currentTable === "school_classes" && column === "teacher_id") {
  value = row.teacher_id || "";
}
  if (column === "day") {
  const days = {
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
    7: "Sunday"
  };

  value = days[value] || value;
}
  return "<td>" + formatCell(value) + "</td>";
}).join("")+
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
    field === "payment_date" ||
    field === "examination_date"
  ) {
    return "date";
  }

  if (field.includes("email")) return "email";
  if (field.includes("phone")) return "tel";

  if (
  field.includes("score") ||
  field === "amount" ||
  field === "total" ||
  field === "total_fee"
) {
  return "number";}
}
function getFieldControl(field, value, attendanceStudents = []) {

    /* =========================================================
       ATTENDANCE → STUDENT DROPDOWN
       ========================================================= */
      // Attendance controls
  if (field === "student_id" && currentTable === "attendance") {
  return `
    <select name="${esc(field)}" required>
      <option value="">Select student</option>
      ${attendanceStudents.map(s => `
        <option value="${esc(s.student_id)}"
          ${String(value ?? "") === String(s.student_id ?? "") ? "selected" : ""}>
          ${esc(
            `${s.first_name || ""} ${s.last_name || ""}`.trim()
          )} - ${esc(s.student_id)}
        </option>
      `).join("")}
    </select>
  `;
}

  if (field === "date" || field === "attendance_date") {
    let dateValue = value;

    if (dateValue && dateValue.includes("/")) {
        const parts = dateValue.split("/");

        if (parts.length === 3) {
            const [day, month, year] = parts;
            dateValue =
                `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
        }
    }

    return `
        <input
            name="${esc(field)}"
            type="date"
            value="${esc(dateValue)}"
            required
        >
    `;
  }
        

    /* =========================================================
       EXISTING SELECT CONTROLS
       ========================================================= */

    if (field === "gender") {
        return `
            <select name="${esc(field)}">
                <option value="">Select gender</option>
                <option value="Male" ${value === "Male" ? "selected" : ""}>Male</option>
                <option value="Female" ${value === "Female" ? "selected" : ""}>Female</option>
            </select>
        `;
    }

    if (field === "relationship") {
        return `
            <select name="${esc(field)}">
                <option value="">Select relationship</option>
                <option value="Father" ${value === "Father" ? "selected" : ""}>Father</option>
                <option value="Mother" ${value === "Mother" ? "selected" : ""}>Mother</option>
                <option value="Guardian" ${value === "Guardian" ? "selected" : ""}>Guardian</option>
            </select>
        `;
    }
    if (currentTable === "timetable" && field === "class_id") {
        return `
            <select name="class_id">
                <option value="">Select class</option>
                ${(window.timetableClasses || []).map(item => `
                    <option value="${esc(item.id)}"
                        ${String(value) === String(item.id) ? "selected" : ""}>
                        ${esc(
                            item.class_name +
                            (item.section ? " - " + item.section : "")
                        )}
                    </option>
                `).join("")}
            </select>
        `;
    }

    if (currentTable === "timetable" && field === "subject_id") {
        return `
            <select name="subject_id">
                <option value="">Select subject</option>
                ${(window.timetableSubjects || []).map(item => `
                    <option value="${esc(item.id)}"
                        ${String(value) === String(item.id) ? "selected" : ""}>
                        ${esc(
                            item.subject_name ||
                            item.subject_code ||
                            ("Subject " + item.id)
                        )}
                    </option>
                `).join("")}
            </select>
        `;
    }
if (currentTable === "school_classes" && field === "teacher_id") {
    return `
        <select name="teacher_id" required>
            <option value="">Select Class Teacher</option>
            ${(window.classTeachers || []).map(item => {
                const teacherName =
                    `${item.first_name || ""} ${item.last_name || ""}`.trim();

                return `
                    <option value="${esc(teacherName)}"
                        ${String(value || "") === String(teacherName) ? "selected" : ""}>
                        ${esc(teacherName)}
                    </option>
                `;
            }).join("")}
        </select>
    `;
}
    if (currentTable === "timetable" && field === "teacher_id") {
        return `
            <select name="teacher_id">
                <option value="">Select teacher</option>
                ${(window.timetableTeachers || []).map(item => `
                    <option value="${esc(item.id)}"
${String(value) === String(item.id) ? "selected" : ""}>
${esc((item.first_name || "") + " " + (item.last_name || ""))}
</option>
${esc(
  ((item.first_name || "") + " " + (item.last_name || "")).trim() ||
  item.teacher_id ||
  ("Teacher " + item.id)
)}
</option>
                `).join("")}
            </select>
        `;
    }
    if (
  field === "student_id" &&
  (currentTable === "fee_payments" || currentTable === "results")
) {
    return `
        <select name="${esc(field)}">
            <option value="">Select student</option>
            ${attendanceStudents.map(student => {
                const studentCode = student.student_id || "";
                const studentDbId = student.id ?? "";
                const optionValue =
                    currentTable === "fee_payments"
                        ? studentDbId
                        : studentCode;

                const name =
    `${student.first_name || ""} ${student.last_name || ""}`.trim();

                return `
                    <option value="${esc(optionValue)}"
                        ${String(value) === String(optionValue) ? "selected" : ""}>
                        ${esc(name ? studentCode + " - " + name : studentCode)}
                    </option>
                `;
            }).join("")}
        </select>
    `;
}
   // Day Code Here
   if (currentTable === "timetable" && field === "day") {
    return `
        <select name="day">
            <option value="">Select day</option>
            <option value="1" ${String(value) === "1" ? "selected" : ""}>Monday</option>
            <option value="2" ${String(value) === "2" ? "selected" : ""}>Tuesday</option>
            <option value="3" ${String(value) === "3" ? "selected" : ""}>Wednesday</option>
            <option value="4" ${String(value) === "4" ? "selected" : ""}>Thursday</option>
            <option value="5" ${String(value) === "5" ? "selected" : ""}>Friday</option>
            <option value="6" ${String(value) === "6" ? "selected" : ""}>Saturday</option>
            <option value="7" ${String(value) === "7" ? "selected" : ""}>Sunday</option>
        </select>
    `;
}
    if (field === "term") {
        return `
            <select name="${esc(field)}">
                <option value="">Select term</option>
                <option value="First Term" ${value === "First Term" ? "selected" : ""}>First Term</option>
                <option value="Second Term" ${value === "Second Term" ? "selected" : ""}>Second Term</option>
                <option value="Third Term" ${value === "Third Term" ? "selected" : ""}>Third Term</option>
            </select>
        `;
    }
if (field === "message") {
    return `
        <textarea
            name="message"
            rows="8"
            placeholder="Write the full announcement message here..."
        >${esc(value)}</textarea>
    `;
}

    if (field === "payment_type") {
        return `
            <select name="${esc(field)}">
                <option value="">Select method</option>
                <option value="Cash" ${value === "Cash" ? "selected" : ""}>Cash</option>
                <option value="Transfer" ${value === "Transfer" ? "selected" : ""}>Transfer</option>
                <option value="POS" ${value === "POS" ? "selected" : ""}>POS</option>
                <option value="Online" ${value === "Online" ? "selected" : ""}>Online</option>
            </select>
        `;
    }

    return `
        <input
            name="${esc(field)}"
            type="${getFieldType(field)}"
            value="${esc(value)}"
        >
    `;
}
let attendanceStudents = [];

window.timetableClasses = [];
window.timetableSubjects = [];
window.timetableTeachers = [];
   async function updateFeePaymentCalculation(form) {
  if (!form || currentTable !== "fee_payments") return;

  const studentSelect = form.querySelector('[name="student_id"]');
  const amountInput = form.querySelector('[name="amount"]');
  const preview = form.querySelector("#feePaymentPreview");

  if (!studentSelect || !amountInput || !preview) return;

  const studentId = studentSelect.value;

  if (!studentId) {
    preview.innerHTML = "";
    return;
  }

  const student = (attendanceStudents || []).find(
    s => String(s.id) === String(studentId)
  );

  if (!student) {
    preview.innerHTML = "";
    return;
  }

  const totalFee = Number(student.total_fee) || 0;
  const newAmount = Number(amountInput.value) || 0;

  let previousPaid = 0;

  const paymentResult = await db
    .from("fee_payments")
    .select("id, amount")
    .eq("student_id", studentId);

  if (paymentResult.error) {
    console.error("Payment calculation error:", paymentResult.error);
    preview.innerHTML =
      "<div style='color:#b00020;'>Could not calculate payment.</div>";
    return;
  }

  (paymentResult.data || []).forEach(payment => {
    // When editing, don't count the payment being edited twice.
    if (
      editingKey !== null &&
      String(payment.id) === String(editingKey)
    ) {
      return;
    }

    previousPaid += Number(payment.amount) || 0;
  });

  const amountPaid = previousPaid + newAmount;
  const balance = Math.max(totalFee - amountPaid, 0);
const excessPayment = Math.max(amountPaid - totalFee, 0);
  let status = "No Fee Set";

  if (totalFee > 0) {
    if (amountPaid <= 0) {
      status = "Not Paid";
    } else if (amountPaid >= totalFee) {
      status = "Full Payment";
    } else if (amountPaid * 2 === totalFee) {
      status = "Half Payment";
    } else {
      status = "Part Payment";
    }
  }

  preview.innerHTML = `
    <div style="
      margin-top:12px;
      padding:12px;
      border:1px solid #ddd;
      border-radius:8px;
      background:#f8f9fa;
    ">
      <div><strong>Total Fee:</strong> ₦${totalFee.toLocaleString()}</div>
<div><strong>Previously Paid:</strong> ₦${previousPaid.toLocaleString()}</div>
<div><strong>Total Amount Paid:</strong> ₦${amountPaid.toLocaleString()}</div>
<div><strong>Balance:</strong> ₦${balance.toLocaleString()}</div>
<div><strong>Excess Payment:</strong> ₦${excessPayment.toLocaleString()}</div>
<div><strong>Payment Status:</strong> ${esc(status)}</div>
  `;
}

function setupFeePaymentCalculation(form) {
  if (!form || currentTable !== "fee_payments") return;

  const studentSelect = form.querySelector('[name="student_id"]');
  const amountInput = form.querySelector('[name="amount"]');

  if (!studentSelect || !amountInput) return;

  if (!form.querySelector("#feePaymentPreview")) {
    amountInput.insertAdjacentHTML(
      "afterend",
      `<div id="feePaymentPreview"></div>`
    );
  }

  studentSelect.addEventListener("change", function () {
    updateFeePaymentCalculation(form);
  });

  amountInput.addEventListener("input", function () {
    updateFeePaymentCalculation(form);
  });

  updateFeePaymentCalculation(form);
}
async function openForm(row = null) {
  if (!currentTable) {
    alert("Please select a module first.");
    return;
  }

  if (!db) {
    alert("Database is not connected.");
    return;
  }
   if (currentTable === "school_classes") {
  const { data, error } = await db
    .from("teachers")
    .select("teacher_id, first_name, last_name")
    .order("first_name");

  if (error) {
    console.error("Could not load teachers:", error);
    alert("Could not load teachers.");
    return;
  }

  window.classTeachers = data || [];
}
if (currentTable === "timetable") {
    const [classesResult, subjectsResult, teachersResult] =
        await Promise.all([
            db.from("school_classes").select("*").order("class_name"),
            db.from("subjects").select("*").order("subject_name"),
            db.from("teachers").select("*").order("first_name")
        ]);

    if (classesResult.error) {
        console.error("Timetable classes error:", classesResult.error);
        alert("Could not load Classes for Timetable.");
        return;
    }

    if (subjectsResult.error) {
        console.error("Timetable subjects error:", subjectsResult.error);
        alert("Could not load Subjects for Timetable.");
        return;
    }

    if (teachersResult.error) {
        console.error("Timetable teachers error:", teachersResult.error);
        alert("Could not load Teachers for Timetable.");
        return;
    }

    window.timetableClasses = classesResult.data || [];
    window.timetableSubjects = subjectsResult.data || [];
    window.timetableTeachers = teachersResult.data || [];
}
if (
  currentTable === "attendance" ||
  currentTable === "fee_payments" ||
  currentTable === "results"
) {
    const { data, error } = await db
        .from("students")
        .select("*")
        .order("student_id", { ascending: true });

    if (error) {
        console.error("Failed to load students:", error);
        alert("Could not load students.");
        return;
    }

    attendanceStudents = data || [];
}
  let fields = FORM_FIELDS[currentTable] || columns;

if (currentTable === "attendance") {
    fields = ["student_id", "date", "status", "remarks"];
}

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
        const value =
          currentTable === "attendance" && field === "date"
            ? (row?.attendance_date ?? row?.date ?? "")
            : (row?.[field] ?? "");

        return `
  <div class="field">
    <label>${esc(pretty(field))}</label>
    ${getFieldControl(field, value, attendanceStudents)}
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

    if (currentTable === "fee_payments") {
    const feeForm = $("recordForm");

    if (feeForm) {
      setupFeePaymentCalculation(feeForm);
    }
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
   // Automatically generate Student ID
if (currentTable === "students" && !data.student_id) {
  const studentIdsResult = await db
    .from("students")
    .select("student_id");

  if (studentIdsResult.error) {
    throw studentIdsResult.error;
  }

  const numbers = (studentIdsResult.data || [])
  .map(row => String(row.student_id || "").trim().match(/^STU(\d+)$/i))
  .filter(match => match)
  .map(match => Number(match[1]));

let nextNumber = numbers.length
  ? Math.max(...numbers) + 1
  : 1;

let newStudentId = "STU" + String(nextNumber).padStart(3, "0");

while (
  (studentIdsResult.data || []).some(
    row => String(row.student_id || "").trim().toUpperCase() === newStudentId
  )
) {
  nextNumber++;
  newStudentId = "STU" + String(nextNumber).padStart(3, "0");
}

data.student_id = newStudentId;
 
}
   
// Automatically generate Teacher ID serially
if (currentTable === "teachers" && !data.teacher_id) {
  const teacherIdsResult = await db
    .from("teachers")
    .select("teacher_id");

  if (teacherIdsResult.error) {
    throw teacherIdsResult.error;
  }

  const numbers = (teacherIdsResult.data || [])
    .map(row => {
      const match = String(row.teacher_id || "")
        .trim()
        .match(/^TEA(\d+)$/i);
      return match ? Number(match[1]) : null;
    })
    .filter(number => number !== null);

  let nextNumber = numbers.length
    ? Math.max(...numbers) + 1
    : 1;

  let newTeacherId =
    "TEA" + String(nextNumber).padStart(3, "0");

  while (
    (teacherIdsResult.data || []).some(
      row =>
        String(row.teacher_id || "").trim().toUpperCase()
        === newTeacherId
    )
  ) {
    nextNumber++;
    newTeacherId =
      "TEA" + String(nextNumber).padStart(3, "0");
  }

  data.teacher_id = newTeacherId;
}
// Automatically calculate Total for Results
if (currentTable === "results") {
  const caScore = Number(data.ca_score || 0);
  const examScore = Number(data.exam_score || 0);

  data.total = caScore + examScore;
}
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
        .eq(key, editingKey)
        .select();

      if (result.error) {
        throw result.error;
      }

      if (!result.data || result.data.length === 0) {
        throw new Error(
          "No record was updated. Check the UPDATE RLS policy and record ID."
        );
      }
} else {
    const tablesWithSchoolId = [
    "announcements",
    "attendance",
    "examinations",
    "fee_payments",
    "parents",
    "results",
    "school_classes",
    "student_parents",
    "students",
    "subjects",
    "teachers",
    "timetable",
    "transport"
];

if (tablesWithSchoolId.includes(currentTable)) {
    const schoolId = await db.rpc("get_my_school_id");

    if (schoolId.error) {
        throw schoolId.error;
    }

    if (!schoolId.data) {
        throw new Error("No school is linked to this account.");
    }

    data.school_id = schoolId.data;
}
result = await db
    .from(currentTable)
    .insert(data)
    .select("*");

if (result.error) {
    console.error("Insert failed:", currentTable, data, result.error);
    throw result.error;
}

if (!result.data || result.data.length === 0) {
    throw new Error(
        "No record returned after saving. Check the INSERT policy."
    );
}

      if (result.error) {
        throw result.error;
      }
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

async function viewRow(index) {
  const row = rows[index];
  if (!row) return;

  ensureViewDialog();

  $("viewDialogTitle").textContent =
    tableLabel(currentTable) + " — View Record";

  let displayRow = { ...row };
  let viewColumns = [...columns];

  if (currentTable === "fee_payments" && db) {
    const { data: student } = await db
      .from("students")
      .select("id, student_id, first_name, last_name")
      .eq("id", row.student_id)
      .maybeSingle();

    if (student) {
      displayRow.student_id = student.student_id || row.student_id;

      displayRow.student_name =
        `${student.first_name || ""} ${student.last_name || ""}`.trim();

      viewColumns = [
        "student_id",
        "student_name",
        ...columns.filter(column => column !== "student_id")
      ];
    }
  }
   if (currentTable === "attendance" && db) {
  const { data: student, error } = await db
    .from("students")
    .select("student_id, first_name, last_name")
    .eq("student_id", String(row.student_id).trim())
    .maybeSingle();

  if (error) {
    console.error("Could not load attendance student:", error);
  }

  if (student) {
    displayRow.student_name =
      `${student.first_name || ""} ${student.last_name || ""}`.trim();

    viewColumns = columns;
  }
}

  if (currentTable === "timetable" && db) {
    const [
      { data: classData },
      { data: subjectData },
      { data: teacherData }
    ] = await Promise.all([
      db.from("school_classes")
        .select("id, class_name, section"),

      db.from("subjects")
        .select("id, subject_name, subject_code"),

      db.from("teachers")
        .select("teacher_id, first_name, last_name")
    ]);

    const classItem = (classData || []).find(
      item => String(item.id) === String(row.class_id)
    );

    const subjectItem = (subjectData || []).find(
      item => String(item.id) === String(row.subject_id)
    );

    const teacherItem = (window.timetableTeachers || []).find(
  item => String(item.id) === String(row.teacher_id)
);

    displayRow.class_id = classItem
      ? classItem.class_name +
        (classItem.section ? " - " + classItem.section : "")
      : row.class_id;

    displayRow.subject_id = subjectItem
      ? subjectItem.subject_name +
        (subjectItem.subject_code
          ? " (" + subjectItem.subject_code + ")"
          : "")
      : row.subject_id;

    displayRow.teacher_id = teacherItem
      ? (teacherItem.first_name || "") +
        " " +
        (teacherItem.last_name || "")
      : row.teacher_id;
  }

    $("viewFields").innerHTML = viewColumns
    .filter(field =>
      field !== "created_at" &&
      field !== "updated_at" &&
      (
        currentTable !== "school_classes" ||
        !["description", "class_teacher_id"].includes(field)
      )
    )
    .map(field => {
      const value = displayRow[field];
let display =
  value == null || value === ""
    ? "—"
    : esc(value);

if (currentTable === "timetable" && field === "day") {
  const days = [
    "",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  display = days[Number(value)] || esc(value);
}
      return `
  <div class="field">
    <label>${esc(
      currentTable === "school_classes" && field === "teacher_id"
        ? "Class Teacher"
        : pretty(field)
    )}</label>
    <div class="view-value">${display}</div>
  </div>

${
  ["fee_payments", "attendance"].includes(currentTable) &&
  field === "student_id" &&
  displayRow.student_name
    ? `
      <div class="field">
        <label>Student Name</label>
        <div class="view-value">${esc(displayRow.student_name)}</div>
      </div>
    `
    : ""
}
`;
})
.join("");

  const dialog = $("viewDialog");

  if (dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.classList.remove("hidden");
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

  const key =
  currentTable === "students" && !row.student_id
    ? "id"
    : primaryKey(currentTable);

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

  if (currentTable === "students") {
    const studentId = row.id;

    if (studentId) {
      const relatedTables = [
        "attendance",
        "results",
        "fee_payments",
        "student_parents"
      ];

      for (const table of relatedTables) {
        const relatedResult = await db
          .from(table)
          .delete()
          .eq("student_id", studentId);

        if (relatedResult.error) {
          throw relatedResult.error;
        }
      }
    }
  }

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
