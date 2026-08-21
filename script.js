let db;
let tempChanges = {}; 
let statsChart = null;
const config = { locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}` };

// 1. تشغيل النظام
window.onload = async () => {
    try {
        const SQL = await initSqlJs(config);
        const saved = localStorage.getItem("prayer_pro_v8");
        if (saved) {
            db = new SQL.Database(new Uint8Array(JSON.parse(saved)));
            // تحديث قاعدة البيانات إذا كانت قديمة (إضافة عمود الهاتف)
            try { db.run("ALTER TABLE students ADD COLUMN phone TEXT"); } catch(e) {}
        } else {
            db = new SQL.Database();
            db.run("CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, room TEXT, phone TEXT)");
            db.run("CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, s_id INTEGER, status TEXT, notes TEXT, prayer TEXT, date TEXT)");
            db.run("CREATE TABLE khawatir (id INTEGER PRIMARY KEY AUTOINCREMENT, s_id INTEGER, date TEXT, status TEXT, notes TEXT)");
            db.run("CREATE TABLE lectures (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, l_date TEXT)");
            db.run("CREATE TABLE lecture_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, l_id INTEGER, s_id INTEGER, status TEXT, notes TEXT, timestamp TEXT)");
            save();
        }
        document.getElementById("loading-overlay").style.display = "none";
        if(localStorage.getItem("dark-mode") === "true") document.body.classList.add("dark-mode");
        setPrayer();
        renderRooms();
        if(typeof renderExportRooms === 'function') renderExportRooms();
    } catch (e) { console.error(e); }
};

function save() {
    const data = db.export();
    localStorage.setItem("prayer_pro_v8", JSON.stringify(Array.from(data)));
}

// 2. التنقل والواجهة
function switchTab(name) {
    document.querySelectorAll('.content-view').forEach(v => v.classList.add('d-none'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('view-' + name).classList.remove('d-none');
    document.getElementById('tab-btn-' + name).classList.add('active');
    closeSubView('rooms');
    if(name === 'rooms') renderRooms();
    if(name === 'manage') {
        renderManageList();
        if(typeof renderExportRooms === 'function') renderExportRooms();
    }
}

function closeSubView(type) {
    if(type === 'rooms') {
        document.getElementById('roomsGrid').classList.remove('d-none');
        document.getElementById('attendanceDetail').classList.add('d-none');
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("dark-mode", isDark);
}

// 3. إدارة الطلاب
function addNewStudent() {
    const n = document.getElementById("mName").value.trim();
    const r = document.getElementById("mRoom").value.trim();
    const p = document.getElementById("mPhone").value.trim();
    if(!n || !r) return alert("يرجى إكمال الاسم ورقم الغرفة");
    db.run("INSERT INTO students (name, room, phone) VALUES (?, ?, ?)", [n, r, p]);
    save(); 
    document.getElementById("mName").value = ""; 
    document.getElementById("mRoom").value = "";
    document.getElementById("mPhone").value = "";
    alert("✅ تمت إضافة الطالب بنجاح"); 
    renderManageList();
    if(typeof renderExportRooms === 'function') renderExportRooms();
}

function renderManageList() {
    const list = document.getElementById("mList");
    const q = document.getElementById("mSearch").value.toLowerCase();
    const res = db.exec("SELECT id, name, room, phone FROM students ORDER BY CAST(room AS INTEGER) ASC, name ASC");
    
    if (res.length > 0) {
        let h = '<table class="table table-hover align-middle"><thead class="table-light"><tr><th>الاسم</th><th>الغرفة</th><th>الجوال</th><th class="text-end">الإجراء</th></tr></thead><tbody>';
        res[0].values.forEach(r => {
            if(r[1].toLowerCase().includes(q) || r[2].toString().includes(q)) {
                h += `<tr>
                    <td class="fw-bold">${r[1]}</td>
                    <td><span class="badge bg-secondary rounded-pill">غرفة ${r[2]}</span></td>
                    <td class="small text-muted">${r[3] || '-'}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="delStudent(${r[0]})">حذف 🗑️</button>
                    </td>
                </tr>`;
            }
        });
        h += '</tbody></table>'; list.innerHTML = h;
    } else {
        list.innerHTML = '<div class="text-center p-4 text-muted">لا يوجد طلاب مسجلين</div>';
    }
}

function delStudent(id) {
    if(confirm("⚠️ هل تريد حذف الطالب وجميع سجلاته نهائياً؟ لا يمكن التراجع عن هذا الإجراء.")) {
        db.run("DELETE FROM attendance WHERE s_id = ?", [id]);
        db.run("DELETE FROM khawatir WHERE s_id = ?", [id]);
        db.run("DELETE FROM lecture_attendance WHERE s_id = ?", [id]);
        db.run("DELETE FROM students WHERE id = ?", [id]);
        save(); renderManageList();
        if(typeof renderExportRooms === 'function') renderExportRooms();
    }
}

// 4. جولات الصلوات
function renderRooms() {
    const grid = document.getElementById("roomsGrid"); grid.innerHTML = "";
    const res = db.exec("SELECT DISTINCT room FROM students ORDER BY CAST(room AS INTEGER) ASC");
    if (res.length > 0) {
        res[0].values.forEach(r => {
            const div = document.createElement("div"); div.className = "col-6 col-md-3";
            div.innerHTML = `<div class="room-card shadow-sm" onclick="openRoom('${r[0]}')"><b>غرفة ${r[0]}</b></div>`;
            grid.appendChild(div);
        });
    } else {
        grid.innerHTML = '<div class="col-12 text-center p-5 text-muted">يرجى إضافة طلاب من تبويب الإدارة أولاً</div>';
    }
}

function filterRooms() {
    const q = document.getElementById("roomSearch").value.toLowerCase();
    document.querySelectorAll("#roomsGrid .col-6").forEach(el => {
        el.style.display = el.innerText.toLowerCase().includes(q) ? "" : "none";
    });
}

function openRoom(num) {
    document.getElementById('roomsGrid').classList.add('d-none');
    document.getElementById('attendanceDetail').classList.remove('d-none');
    document.getElementById('roomTitle').innerText = "تحضير غرفة: " + num;
    const list = document.getElementById("attendanceList"); list.innerHTML = "";
    tempChanges = {};
    const res = db.exec("SELECT id, name FROM students WHERE room = ? ORDER BY name", [num]);
    if (res.length > 0) {
        res[0].values.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="fw-bold">${row[1]}</td>
                <td>
                    <select class="form-select form-select-sm rounded-pill" onchange="trackChange(${row[0]}, 'status', this.value, this)">
                        <option value="">---</option>
                        <option value="صلى">✅ صلى</option>
                        <option value="متأخر">🟡 متأخر</option>
                        <option value="نائم">🔴 نائم</option>
                        <option value="بعذر">⚪ بعذر</option>
                    </select>
                </td>
                <td><input type="text" class="form-control form-control-sm border-0 bg-light rounded-pill" placeholder="..." onchange="trackChange(${row[0]}, 'notes', this.value)"></td>
            `;
            list.appendChild(tr);
        });
    }
}

function trackChange(id, field, val, el) {
    if(!tempChanges[id]) tempChanges[id] = { status: "", notes: "", date: new Date().toISOString().split('T')[0] };
    tempChanges[id][field] = val;
    if(field === 'status' && el) {
        const colors = {"صلى":"#19875411", "متأخر":"#ffc10711", "نائم":"#dc354511", "بعذر":"#6c757d11", "":"transparent"};
        el.closest('tr').style.backgroundColor = colors[val];
    }
}

function savePrayerAttendance() {
    const prayer = document.getElementById("prayerSelect").value;
    const ids = Object.keys(tempChanges).filter(id => tempChanges[id].status !== "" || tempChanges[id].notes !== "");
    if(ids.length === 0) return closeSubView('rooms');
    ids.forEach(id => {
        const a = tempChanges[id];
        db.run("INSERT INTO attendance (s_id, status, notes, prayer, date) VALUES (?, ?, ?, ?, ?)", [id, a.status, a.notes, prayer, a.date]);
    });
    save(); alert("✅ تم حفظ تحضير الصلاة بنجاح"); closeSubView('rooms');
}

// 5. النسخ الاحتياطي والاستيراد
function exportBackup() {
    const data = db.export();
    const blob = new Blob([data], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup_prayer_full_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
}

async function importBackup(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const data = new Uint8Array(reader.result);
            // محاولة التحقق إذا كان ملف JSON (تصدير مختار)
            const text = new TextDecoder().decode(data);
            if (text.includes("selective_export")) {
                const selectiveData = JSON.parse(text);
                selectiveData.students.forEach(s => {
                    // فحص إذا كان الطالب موجوداً مسبقاً بنفس الاسم والغرفة
                    const check = db.exec(`SELECT id FROM students WHERE name='${s.name}' AND room='${s.room}'`);
                    if (!check.length) {
                        db.run("INSERT INTO students (name, room, phone) VALUES (?, ?, ?)", [s.name, s.room, s.phone]);
                    }
                });
                save();
                alert("✅ تم دمج الطلاب المختارين بنجاح!");
                location.reload();
            } else {
                // استيراد قاعدة بيانات كاملة
                const SQL = await initSqlJs(config);
                db = new SQL.Database(data);
                save();
                alert("✅ تم استيراد قاعدة البيانات بنجاح!");
                location.reload();
            }
        } catch (e) {
            alert("❌ خطأ في معالجة الملف. تأكد أنه ملف صالح.");
            console.error(e);
        }
    };
    reader.readAsArrayBuffer(input.files[0]);
}

function setPrayer() {
    const h = new Date().getHours();
    const s = document.getElementById("prayerSelect");
    const p = ["الفجر", "الظهر", "العصر", "المغرب", "العشاء"];
    s.innerHTML = p.map(x => `<option value="${x}">${x}</option>`).join('');
    if (h >= 4 && h < 11) s.value = "الفجر";
    else if (h >= 11 && h < 15) s.value = "الظهر";
    else if (h >= 15 && h < 18) s.value = "العصر";
    else if (h >= 18 && h < 20) s.value = "المغرب";
    else s.value = "العشاء";
}
