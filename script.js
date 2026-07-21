let db;
let todayAttendance = {}; 
const config = { locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${filename}` };

// وظيفة التبديل بين التبويبات
function showTab(tabName, el ) {
    document.querySelectorAll('.tab-content-item').forEach(item => item.classList.add('d-none'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.remove('d-none');
    el.classList.add('active');
    if(tabName === 'manage') displayAllStudents();
    if(tabName === 'rooms') displayRooms();
}

// تهيئة قاعدة البيانات
async function initDatabase() {
    try {
        const SQL = await initSqlJs(config);
        const savedData = localStorage.getItem("prayer_db_v2");
        if (savedData) {
            db = new SQL.Database(new Uint8Array(JSON.parse(savedData)));
        } else {
            db = new SQL.Database();
            db.run("CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, room_number TEXT)");
            db.run("CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, status TEXT, notes TEXT, prayer_name TEXT, date TEXT)");
            saveDatabase();
        }
        setPrayerByTime();
        displayRooms();
    } catch (e) { console.error("Database error:", e); }
}

function saveDatabase() {
    const data = db.export();
    localStorage.setItem("prayer_db_v2", JSON.stringify(Array.from(data)));
}

function setPrayerByTime() {
    const hour = new Date().getHours();
    const select = document.getElementById("prayerSelect");
    const prayers = ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"];
    select.innerHTML = prayers.map(p => `<option value="${p}">${p}</option>`).join('');
    let current = "الفجر";
    if (hour >= 4 && hour < 11) current = "الفجر";
    else if (hour >= 11 && hour < 15) current = "الظهر";
    else if (hour >= 15 && hour < 18) current = "العصر";
    else if (hour >= 18 && hour < 20) current = "المغرب";
    else current = "العشاء";
    select.value = current;
}

// وظائف الجولات
function displayRooms() {
    const container = document.getElementById("roomsContainer"); container.innerHTML = "";
    const res = db.exec("SELECT DISTINCT room_number FROM students ORDER BY room_number");
    if (res.length > 0) {
        res[0].values.forEach(row => {
            const div = document.createElement("div"); div.className = "col-6 col-md-3";
            div.innerHTML = `<div class="room-card shadow-sm" onclick="openAttendance('${row[0]}')"><h5>غرفة ${row[0]}</h5></div>`;
            container.appendChild(div);
        });
    }
}

function openAttendance(roomNum) {
    document.getElementById("roomsContainer").classList.add("d-none");
    document.getElementById("attendanceArea").classList.remove("d-none");
    document.getElementById("currentRoomTitle").innerText = "🚪 غرفة: " + roomNum;
    const list = document.getElementById("attendanceList"); list.innerHTML = "";
    todayAttendance = {}; 
    const res = db.exec("SELECT id, name FROM students WHERE room_number = ? ORDER BY name", [roomNum]);
    if (res.length > 0) {
        res[0].values.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${row[1]}</td>
                <td>
                    <select class="form-select form-select-sm" onchange="markAttendance(${row[0]}, this.value, this)">
                        <option value="">---</option>
                        <option value="صلى">✅ صلى</option>
                        <option value="متأخر">🟡 متأخر</option>
                        <option value="نائم">🔴 نائم</option>
                        <option value="بعذر">⚪ بعذر</option>
                    </select>
                </td>
                <td><input type="text" class="form-control form-control-sm" placeholder="..." onchange="updateNotes(${row[0]}, this.value)"></td>
            `;
            list.appendChild(tr);
        });
    }
}

function markAttendance(id, status, element) {
    if (status === "") { delete todayAttendance[id]; if(element) element.closest('tr').style.backgroundColor = ""; return; }
    if(!todayAttendance[id]) todayAttendance[id] = { notes: "", date: new Date().toISOString().split('T')[0] };
    todayAttendance[id].status = status;
    if(element) {
        const colors = { "صلى": "#e8f5e9", "متأخر": "#fffde7", "نائم": "#ffebee", "بعذر": "#f5f5f5" };
        element.closest('tr').style.backgroundColor = colors[status];
    }
}

function updateNotes(id, notes) {
    if(!todayAttendance[id]) todayAttendance[id] = { status: "ملاحظة", date: new Date().toISOString().split('T')[0] };
    todayAttendance[id].notes = notes;
}

function exportDailyReport() {
    const prayer = document.getElementById("prayerSelect").value;
    const keys = Object.keys(todayAttendance).filter(k => todayAttendance[k].status !== "" || todayAttendance[k].notes !== "");
    if (keys.length === 0) { alert("لم يتم تعديل أي طالب."); backToRooms(); return; }
    keys.forEach(id => {
        const att = todayAttendance[id];
        db.run("INSERT INTO attendance (student_id, status, notes, prayer_name, date) VALUES (?, ?, ?, ?, ?)", [id, att.status, att.notes, prayer, att.date]);
    });
    saveDatabase();
    alert(`تم حفظ (${keys.length}) طلاب.`);
    backToRooms();
}

function backToRooms() { document.getElementById("roomsContainer").classList.remove("d-none"); document.getElementById("attendanceArea").classList.add("d-none"); }

// وظائف التقارير
function toggleReportUI() {
    document.getElementById('studentSearchCol').classList.toggle('d-none', document.getElementById('reportTarget').value !== 'specific');
    document.getElementById('customDateCol').classList.toggle('d-none', document.getElementById('filterPeriod').value !== 'custom');
}

function generateReport() {
    const target = document.getElementById("reportTarget").value;
    const name = document.getElementById("searchStudentName").value.trim();
    const period = document.getElementById("filterPeriod").value;
    const customDate = document.getElementById("customDate").value;
    let dateFilter = "";
    const today = new Date().toISOString().split('T')[0];
    if (period === "today") dateFilter = `AND a.date = '${today}'`;
    else if (period === "week") { let d = new Date(); d.setDate(d.getDate() - 7); dateFilter = `AND a.date >= '${d.toISOString().split('T')[0]}'`; }
    else if (period === "month") { let d = new Date(); dateFilter = `AND a.date >= '${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01'`; }
    else if (period === "custom" && customDate) dateFilter = `AND a.date = '${customDate}'`;
    let studentFilter = (target === "specific") ? `AND s.name LIKE '%${name}%'` : "";

    const query = `SELECT s.name, s.room_number, a.status, a.notes, a.prayer_name, a.date FROM attendance a JOIN students s ON a.student_id = s.id WHERE 1=1 ${studentFilter} ${dateFilter} ORDER BY a.date DESC, s.room_number ASC`;
    const res = db.exec(query);
    const container = document.getElementById("reportTableContainer");
    document.getElementById("reportResultArea").classList.remove("d-none");
    if (res.length > 0) {
        let html = '<table class="table table-sm border small"><thead><tr><th>التاريخ</th><th>الصلاة</th><th>الغرفة</th><th>الاسم</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>';
        res[0].values.forEach(row => { html += `<tr><td>${row[5]}</td><td>${row[4]}</td><td>${row[1]}</td><td>${row[0]}</td><td>${row[2]}</td><td>${row[3] || '-'}</td></tr>`; });
        html += '</tbody></table>'; container.innerHTML = html;
    } else { container.innerHTML = '<p class="text-center">لا توجد بيانات</p>'; }
}

function copyFullReport() {
    const table = document.querySelector("#reportTableContainer table");
    if (!table) return alert("لا يوجد تقرير");
    let text = "📋 تقرير متابعة الصلاة\n------------------\n";
    table.querySelectorAll("tbody tr").forEach(row => {
        const c = row.querySelectorAll("td");
        text += `🚪 ${c[2].innerText} | 👤 ${c[3].innerText} | 📍 ${c[4].innerText} | 📝 ${c[5].innerText}\n`;
    });
    navigator.clipboard.writeText(text).then(() => alert("✅ تم النسخ"));
}

// وظائف الإدارة
function addStudent() {
    const name = document.getElementById("studentName").value.trim();
    const room = document.getElementById("roomNumber").value.trim();
    if (!name || !room) return alert("أكمل البيانات");
    db.run("INSERT INTO students (name, room_number) VALUES (?, ?)", [name, room]);
    saveDatabase();
    document.getElementById("studentName").value = "";
    alert("تم الإضافة");
    displayAllStudents();
}

function displayAllStudents() {
    const list = document.getElementById("allStudentsList"); list.innerHTML = "";
    const q = document.getElementById("manageSearch").value.toLowerCase();
    const res = db.exec("SELECT id, name, room_number FROM students ORDER BY room_number, name");
    if (res.length > 0) {
        res[0].values.forEach(row => {
            if(row[1].toLowerCase().includes(q) || row[2].toLowerCase().includes(q)) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td><b>${row[1]}</b></td><td>غرفة ${row[2]}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger" onclick="deleteStudent(${row[0]})">حذف</button></td>`;
                list.appendChild(tr);
            }
        });
    }
}

function deleteStudent(id) {
    if (confirm("حذف الطالب وسجلاته؟")) { db.run("DELETE FROM attendance WHERE student_id = ?", [id]); db.run("DELETE FROM students WHERE id = ?", [id]); saveDatabase(); displayAllStudents(); }
}

function clearAllAttendance() {
    if (confirm("مسح جميع التقارير؟")) { db.run("DELETE FROM attendance"); saveDatabase(); alert("تم المسح"); }
}

// بدء التشغيل
initDatabase();
