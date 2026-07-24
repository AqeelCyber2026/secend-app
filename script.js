let db;
let tempChanges = {}; 
let statsChart = null;
const config = { locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${f}` };

// 1. تشغيل النظام
window.onload = async ( ) => {
    try {
        const SQL = await initSqlJs(config);
        const saved = localStorage.getItem("prayer_pro_v8");
        if (saved) {
            db = new SQL.Database(new Uint8Array(JSON.parse(saved)));
        } else {
            db = new SQL.Database();
            db.run("CREATE TABLE students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, room TEXT)");
            db.run("CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, s_id INTEGER, status TEXT, notes TEXT, prayer TEXT, date TEXT)");
            db.run("CREATE TABLE khawatir (id INTEGER PRIMARY KEY AUTOINCREMENT, s_id INTEGER, prayer TEXT, k_date TEXT, status TEXT)");
            save();
        }
        document.getElementById("loading-overlay").style.display = "none";
        if(localStorage.getItem("dark-mode") === "true") document.body.classList.add("dark-mode");
        setPrayer();
        renderRooms();
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
    document.getElementById('btn-' + name).classList.add('active');
    closeSubView('rooms'); closeSubView('khawatir');
    if(name === 'rooms') renderRooms();
    if(name === 'khawatir') renderKhawatirRooms();
    if(name === 'manage') renderManageList();
    if(name === 'reports') updateStatsChart();
}

function closeSubView(type) {
    if(type === 'rooms') {
        document.getElementById('roomsGrid').classList.remove('d-none');
        document.getElementById('attendanceDetail').classList.add('d-none');
    } else {
        document.getElementById('khawatirRoomsGrid').classList.remove('d-none');
        document.getElementById('khawatirDetail').classList.add('d-none');
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
    if(!n || !r) return alert("أكمل البيانات");
    db.run("INSERT INTO students (name, room) VALUES (?, ?)", [n, r]);
    save(); document.getElementById("mName").value = ""; alert("تمت الإضافة"); renderManageList();
}

function renderManageList() {
    const list = document.getElementById("mList"); list.innerHTML = "";
    const q = document.getElementById("mSearch").value.toLowerCase();
    const res = db.exec("SELECT id, name, room FROM students ORDER BY room, name");
    if (res.length > 0) {
        let h = '<table class="table table-sm"><tbody>';
        res[0].values.forEach(r => {
            if(r[1].toLowerCase().includes(q) || r[2].toLowerCase().includes(q)) {
                h += `<tr><td><b>${r[1]}</b></td><td>غرفة ${r[2]}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger border-0" onclick="delStudent(${r[0]})">حذف</button></td></tr>`;
            }
        });
        h += '</tbody></table>'; list.innerHTML = h;
    }
}

function delStudent(id) {
    if(confirm("هل تريد حذف الطالب وجميع سجلاته نهائياً؟")) {
        db.run("DELETE FROM attendance WHERE s_id = ?", [id]);
        db.run("DELETE FROM khawatir WHERE s_id = ?", [id]);
        db.run("DELETE FROM students WHERE id = ?", [id]);
        save(); renderManageList();
    }
}

// 4. جولات الصلوات
function renderRooms() {
    const grid = document.getElementById("roomsGrid"); grid.innerHTML = "";
    const res = db.exec("SELECT DISTINCT room FROM students ORDER BY room");
    if (res.length > 0) {
        res[0].values.forEach(r => {
            const div = document.createElement("div"); div.className = "col-6 col-md-3";
            div.innerHTML = `<div class="room-card shadow-sm" onclick="openRoom('${r[0]}')"><b>غرفة ${r[0]}</b></div>`;
            grid.appendChild(div);
        });
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
    document.getElementById('roomTitle').innerText = "غرفة: " + num;
    const list = document.getElementById("attendanceList"); list.innerHTML = "";
    tempChanges = {};
    const res = db.exec("SELECT id, name FROM students WHERE room = ? ORDER BY name", [num]);
    if (res.length > 0) {
        res[0].values.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td>${row[1]}</td><td><select class="form-select form-select-sm" onchange="trackChange(${row[0]}, 'status', this.value, this)"><option value="">---</option><option value="صلى">✅ صلى</option><option value="متأخر">🟡 متأخر</option><option value="نائم">🔴 نائم</option><option value="بعذر">⚪ بعذر</option></select></td><td><input type="text" class="form-control form-control-sm border-0 bg-light" placeholder="..." onchange="trackChange(${row[0]}, 'notes', this.value)"></td>`;
            list.appendChild(tr);
        });
    }
}

function trackChange(id, field, val, el) {
    if(!tempChanges[id]) tempChanges[id] = { status: "", notes: "", date: new Date().toISOString().split('T')[0] };
    tempChanges[id][field] = val;
    if(field === 'status' && el) {
        const colors = {"صلى":"#19875422", "متأخر":"#ffc10722", "نائم":"#dc354522", "بعذر":"#6c757d22", "":"transparent"};
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
    save(); alert("تم الحفظ"); closeSubView('rooms');
}

// 5. الخواطر
function renderKhawatirRooms() {
    const grid = document.getElementById("khawatirRoomsGrid"); grid.innerHTML = "";
    const res = db.exec("SELECT DISTINCT room FROM students ORDER BY room");
    if (res.length > 0) {
        res[0].values.forEach(r => {
            const div = document.createElement("div"); div.className = "col-6 col-md-3";
            div.innerHTML = `<div class="room-card shadow-sm" style="border-left: 4px solid #6a11cb" onclick="openKhawatirRoom('${r[0]}')"><b>غرفة ${r[0]}</b></div>`;
            grid.appendChild(div);
        });
    }
}

function openKhawatirRoom(num) {
    document.getElementById('khawatirRoomsGrid').classList.add('d-none');
    document.getElementById('khawatirDetail').classList.remove('d-none');
    document.getElementById('khawatirRoomTitle').innerText = "خواطر غرفة: " + num;
    renderKhawatirList(num);
}

function renderKhawatirList(num) {
    const list = document.getElementById("khawatirList"); list.innerHTML = "";
    const res = db.exec(`SELECT s.id, s.name, k.prayer, k.k_date, k.status, k.id as kid FROM students s LEFT JOIN khawatir k ON s.id = k.s_id AND k.status != 'مفعل' WHERE s.room = ? ORDER BY s.name`, [num]);
    if (res.length > 0) {
        res[0].values.forEach(row => {
            const tr = document.createElement("tr");
            if(row[4] === 'تم الأداء') tr.className = 'student-done';
            tr.innerHTML = `
                <td class="small fw-bold">${row[1]}</td>
                <td>${!row[5] ? `<select id="kp-${row[0]}" class="form-select form-select-sm mb-1"><option value="الفجر">الفجر</option><option value="الظهر">الظهر</option><option value="العصر">العصر</option><option value="المغرب">المغرب</option><option value="العشاء">العشاء</option></select><input type="date" id="kd-${row[0]}" class="form-control form-control-sm">` : `<span class="small">${row[2]} | ${row[3]}</span>`}</td>
                <td><span class="badge ${row[4] === 'تم الأداء' ? 'bg-success' : 'bg-warning text-dark'}">${row[4] || 'لم يكلف'}</span></td>
                <td>${!row[5] ? `<button class="btn btn-sm btn-primary w-100" onclick="assignK(${row[0]}, '${num}')">تكليف</button>` : `<div class="btn-group"><button class="btn btn-sm btn-success" onclick="updateK(${row[5]}, 'تم الأداء', '${num}')">تم</button><button class="btn btn-sm btn-outline-secondary" onclick="updateK(${row[5]}, 'مفعل', '${num}')">تفعيل</button></div>`}</td>
            `;
            list.appendChild(tr);
        });
    }
}

function assignK(sid, num) {
    const p = document.getElementById(`kp-${sid}`).value;
    const d = document.getElementById(`kd-${sid}`).value;
    if(!d) return alert("اختر التاريخ");
    db.run("INSERT INTO khawatir (s_id, prayer, k_date, status) VALUES (?, ?, ?, ?)", [sid, p, d, 'قيد الانتظار']);
    save(); renderKhawatirList(num);
}

function updateK(kid, status, num) {
    db.run("UPDATE khawatir SET status = ? WHERE id = ?", [status, kid]);
    save(); renderKhawatirList(num);
}

// 6. التقارير والإحصائيات
function toggleRepName() { document.getElementById('repNameDiv').classList.toggle('d-none', document.getElementById('repTarget').value !== 'one'); }

function generateFullReport() {
    const target = document.getElementById("repTarget").value;
    const name = document.getElementById("repName").value.trim();
    const period = document.getElementById("repPeriod").value;
    let filter = ""; const today = new Date().toISOString().split('T')[0];
    if (period === "today") filter = `AND a.date = '${today}'`;
    else if (period === "week") { let d = new Date(); d.setDate(d.getDate()-7); filter = `AND a.date >= '${d.toISOString().split('T')[0]}'`; }
    let sFilter = (target === "one") ? `AND s.name LIKE '%${name}%'` : "";
    const res = db.exec(`SELECT s.name, s.room, a.status, a.notes, a.prayer, a.date FROM attendance a JOIN students s ON a.s_id = s.id WHERE 1=1 ${sFilter} ${filter} ORDER BY a.date DESC`);
    document.getElementById("repArea").classList.remove("d-none");
    const cont = document.getElementById("repTable");
    if (res.length > 0) {
        let h = '<table class="table table-sm border small"><thead><tr><th>التاريخ</th><th>الصلاة</th><th>الغرفة</th><th>الاسم</th><th>الحالة</th><th>ملاحظة</th></tr></thead><tbody>';
        res[0].values.forEach(r => { h += `<tr><td>${r[5]}</td><td>${r[4]}</td><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td><td>${r[3]||'-'}</td></tr>`; });
        h += '</tbody></table>'; cont.innerHTML = h;
    } else { cont.innerHTML = "<p class='text-center'>لا توجد سجلات</p>"; }
}

function updateStatsChart() {
    const ctx = document.getElementById('statsChart').getContext('2d');
    const res = db.exec("SELECT status, COUNT(*) FROM attendance GROUP BY status");
    let labels = [], data = [];
    if (res.length > 0) { res[0].values.forEach(r => { if(r[0]) { labels.push(r[0]); data.push(r[1]); } }); }
    if (statsChart) statsChart.destroy();
    statsChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#198754', '#ffc107', '#dc3545', '#6c757d'] }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function copyToClipboard() {
    let t = "📋 تقرير المتابعة\n";
    document.querySelectorAll("#repTable tbody tr").forEach(r => {
        const c = r.querySelectorAll("td");
        t += `🚪 ${c[2].innerText} | 👤 ${c[3].innerText} | 📍 ${c[4].innerText} | 📝 ${c[5].innerText}\n`;
    });
    navigator.clipboard.writeText(t).then(() => alert("تم النسخ بنجاح"));
}

// 7. النسخ الاحتياطي
function exportBackup() {
    const data = db.export();
    const blob = new Blob([data], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup_prayer_${new Date().toISOString().split('T')[0]}.db`;
    a.click();
}

async function importBackup(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = async function() {
        const SQL = await initSqlJs(config);
        db = new SQL.Database(new Uint8Array(reader.result));
        save();
        alert("تم الاستيراد بنجاح! سيتم تحديث الصفحة.");
        location.reload();
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
