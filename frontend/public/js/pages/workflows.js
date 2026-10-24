import { api, state } from '../api.js';
import { esc, $, toast, empty, withLoading, confirmDialog, fmtDate, fmtDateTime } from '../ui.js';

const head = (title, subtitle, actions = '') => `<div class="dash-head"><div><h1>${esc(title)}</h1><p class="muted" style="margin:0">${esc(subtitle || '')}</p></div><div class="row no-print">${actions}</div></div>`;
const dateToday = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
  const obj = Object.fromEntries(parts.map((x) => [x.type, x.value])); return `${obj.year}-${obj.month}-${obj.day}`;
};
const statusText = (s) => ({
  draft:'Draf', submitted:'Diajukan', submitted_to_homeroom:'Menunggu wali kelas', returned_to_teacher:'Dikembalikan ke guru', approved_by_homeroom:'Disetujui wali kelas', pending_admin:'Menunggu Admin Sekolah', returned:'Dikembalikan', published:'Dipublikasikan',
  under_review:'Sedang ditinjau', needs_correction:'Perlu perbaikan', proposed:'Diusulkan', approved:'Disetujui', rejected:'Ditolak', disbursed:'Disalurkan', closed:'Ditutup', eligible:'Checklist lengkap', review_required:'Checklist belum lengkap', not_approved:'Belum/tidak diluluskan',
}[s] || s || '—');
function dateCell(v) { return v ? fmtDate(v) : '—'; }
function numberInput(studentId, component, current, label = '') {
  return `<input class="input grade-input" type="number" min="0" max="100" step="0.01" data-student="${Number(studentId)}" data-component="${component}" data-label="${esc(label)}" value="${current == null ? '' : esc(current)}" placeholder="—" aria-label="Nilai ${esc(component)} siswa ${Number(studentId)}">`;
}

export async function teacherGradesPage(el) {
  let periods = [], assignments = [];
  try {
    [periods, assignments] = await Promise.all([api('/assessments/periods').then(x => x.data), api('/assessments/assignments/mine').then(x => x.data)]);
  } catch (err) { el.innerHTML = `${head('Input Nilai', 'Nilai dikelola melalui penugasan mapel dan periode akademik.') }<div class="form-error">${esc(err.message)}</div>`; return; }
  const openPeriods = periods.filter(p => p.status === 'open');
  el.innerHTML = `${head('Input Nilai Mata Pelajaran', 'Input nilai per siswa, simpan draf, lalu kirim ke wali kelas. Nilai kosong bukan nilai nol.')}
    <div class="card mb"><div class="form-grid">
      <div class="field"><label for="grade-assignment">Penugasan kelas dan mata pelajaran</label><select class="input" id="grade-assignment"><option value="">Pilih penugasan</option>${assignments.map(a => `<option value="${Number(a.teaching_assignment_id)}">${esc(a.class_name)} · ${esc(a.subject_name)} · ${esc(a.academic_year)}</option>`).join('')}</select></div>
      <div class="field"><label for="grade-period">Periode nilai terbuka</label><select class="input" id="grade-period"><option value="">Pilih periode</option>${openPeriods.map(p => `<option value="${Number(p.id)}" data-type="${esc(p.period_type)}">${esc(p.label)} · ${esc(p.academic_year)} · Semester ${Number(p.semester)}</option>`).join('')}</select></div>
    </div><p class="subtle mt">${openPeriods.length ? 'Hanya periode berstatus terbuka yang dapat diedit.' : 'Belum ada periode nilai terbuka. Admin Sekolah harus membuat dan membuka periode terlebih dahulu.'}</p></div>
    <div id="grades-editor">${assignments.length ? empty('Pilih penugasan dan periode untuk memuat daftar siswa.') : empty('Akun ini belum memiliki penugasan mata pelajaran aktif.')}</div>`;
  const reload = async () => {
    const assignmentId = Number($('#grade-assignment', el).value); const periodId = Number($('#grade-period', el).value);
    const editor = $('#grades-editor', el);
    if (!assignmentId || !periodId) { editor.innerHTML = empty('Pilih penugasan dan periode.'); return; }
    try {
      const r = await api(`/assessments/assignments/${assignmentId}/roster?period_id=${periodId}`); const d = r.data;
      const p = openPeriods.find(x => Number(x.id) === periodId);
      const rows = d.roster.map(student => {
        const find = (component, label='') => d.scores.find(x => Number(x.student_record_id) === Number(student.student_record_id) && x.component === component && (component !== 'task' || x.item_label === label))?.score;
        return `<tr><td>${esc(student.full_name)}</td><td>${esc(student.student_number || '—')}</td>${p.period_type === 'monthly' ? `<td>${numberInput(student.student_record_id,'task',find('task','Rata-rata Tugas Bulanan'),'Rata-rata Tugas Bulanan')}</td><td>${numberInput(student.student_record_id,'monthly_exam',find('monthly_exam'),'Ujian Bulanan')}</td>` : `<td>${numberInput(student.student_record_id,p.period_type,find(p.period_type),p.period_type.toUpperCase())}</td>`}</tr>`;
      }).join('');
      const currentStatus = d.submission ? statusText(d.submission.status) : 'Belum disimpan';
      editor.innerHTML = `<div class="card"><div class="row between wrap"><div><h3>${esc(d.assignment.class_name)} · ${esc(d.assignment.subject_name)}</h3><p class="subtle">Status pengajuan: <strong>${esc(currentStatus)}</strong></p></div><span class="badge">${d.roster.length} siswa</span></div>
       ${d.submission?.status === 'submitted_to_homeroom' || d.submission?.status === 'approved_by_homeroom' ? `<div class="notice">Nilai sudah berada pada tahap review. Untuk mengubahnya, wali kelas harus mengembalikan pengajuan dengan alasan.</div>` : ''}
       <div class="table-wrap"><table class="data"><thead><tr><th>Nama Siswa</th><th>Nomor Induk</th>${p.period_type === 'monthly' ? '<th>Rata-rata Tugas Bulanan</th><th>Ujian Bulanan</th>' : `<th>${p.period_type.toUpperCase()}</th>`}</tr></thead><tbody>${rows || `<tr><td colspan="4">${empty('Roster siswa belum tersedia.')}</td></tr>`}</tbody></table></div>
       <p class="subtle mt">Bobot tugas dan ujian untuk nilai bulanan: ${Number(p.task_weight)}% / ${Number(p.exam_weight)}%. Nilai UTS/UAS disimpan sebagai komponen terpisah.</p>
       <div class="form-actions"><button class="btn btn-outline" id="save-grade-draft" ${['submitted_to_homeroom','approved_by_homeroom'].includes(d.submission?.status) ? 'disabled' : ''}>Simpan Draf</button><button class="btn btn-primary" id="submit-grade-values" ${['submitted_to_homeroom','approved_by_homeroom'].includes(d.submission?.status) ? 'disabled' : ''}>Kirim ke Wali Kelas</button></div></div>`;
      const collect = () => [...editor.querySelectorAll('.grade-input')].map(inp => ({ student_record_id:Number(inp.dataset.student), component:inp.dataset.component, item_label:inp.dataset.label || '', score:inp.value === '' ? null : Number(inp.value), notes:'' }));
      $('#save-grade-draft', editor)?.addEventListener('click', e => withLoading(e.currentTarget, async () => {
        const scores = collect();
        if (scores.some(x => x.score !== null && (!Number.isFinite(x.score) || x.score < 0 || x.score > 100))) { toast('Nilai harus berada pada rentang 0 sampai 100.', 'error'); return; }
        try { await api('/assessments/submissions', { method:'POST', body:{period_id:periodId, teaching_assignment_id:assignmentId, scores} }); toast('Draf nilai tersimpan.'); await reload(); }
        catch (err) { toast(err.message, 'error'); }
      }));
      $('#submit-grade-values', editor)?.addEventListener('click', e => withLoading(e.currentTarget, async () => {
        const scores = collect();
        if (scores.some(x => x.score !== null && (!Number.isFinite(x.score) || x.score < 0 || x.score > 100))) { toast('Nilai harus berada pada rentang 0 sampai 100.', 'error'); return; }
        try {
          // First persist any last edits. Submission id is then read from the roster response.
          const saved = await api('/assessments/submissions', { method:'POST', body:{period_id:periodId, teaching_assignment_id:assignmentId, scores} });
          await api(`/assessments/submissions/${saved.data.id}/submit`, { method:'POST', body:{} });
          toast('Nilai dikirim ke wali kelas untuk ditinjau.'); await reload();
        } catch (err) { toast(err.message, 'error'); }
      }));
    } catch (err) { editor.innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
  };
  $('#grade-assignment', el).onchange = reload; $('#grade-period', el).onchange = reload;
}

export async function homeroomReportsPage(el) {
  const isAdmin = state.user?.role === 'admin' || state.user?.permissions?.includes('reports.publish');
  if (isAdmin) return adminReportPackagesPage(el);
  let [classes, periods] = await Promise.all([
    api('/assessments/homeroom/classes').then(x=>x.data),
    api('/assessments/periods').then(x=>x.data),
  ]);
  periods = periods.filter(p => ['open','closed','locked'].includes(p.status));
  el.innerHTML = `${head('Pengelolaan Rapor Kelas', 'Tinjau pengiriman nilai seluruh guru mapel, siapkan paket rapor, lalu kirim ke Admin Sekolah.')}
    <div class="card mb"><div class="form-grid"><div class="field"><label for="hr-class">Kelas wali</label><select class="input" id="hr-class"><option value="">Pilih kelas</option>${classes.map(c=>`<option value="${Number(c.id)}">${esc(c.name)} · ${esc(c.study_program)} · ${esc(c.academic_year)}</option>`).join('')}</select></div>
    <div class="field"><label for="hr-period">Periode</label><select class="input" id="hr-period"><option value="">Pilih periode</option>${periods.map(p=>`<option value="${Number(p.id)}">${esc(p.label)} · ${esc(p.academic_year)}</option>`).join('')}</select></div></div></div><div id="hr-data">${empty('Pilih kelas dan periode untuk memeriksa kelengkapan nilai.')}</div><div id="hr-packages"></div>`;
  const reload = async () => {
    const cid=Number($('#hr-class',el).value), pid=Number($('#hr-period',el).value); if(!cid||!pid)return;
    const host=$('#hr-data',el); host.innerHTML='<div class="skeleton"></div>';
    try {
      const d=(await api(`/assessments/homeroom/${cid}/${pid}`)).data;
      host.innerHTML=`<div class="card mb"><div class="row between"><div><h3>${esc(d.period.label)} · ${esc(d.roster.length)} siswa</h3><p class="subtle">Nilai disetujui: ${d.submissions.filter(s=>s.status==='approved_by_homeroom').length}/${d.submissions.length} penugasan mapel</p></div><button class="btn btn-primary" id="build-report-package" ${d.missing_subjects.length?'disabled':''}>Bangun Paket Rapor</button></div>
      ${d.missing_subjects.length?`<div class="notice warn mb">Masih ada nilai yang belum siap: ${d.missing_subjects.map(x=>`${esc(x.subject_name)} (${esc(statusText(x.status))})`).join(', ')}</div>`:''}
      <div class="table-wrap"><table class="data"><thead><tr><th>Mata pelajaran</th><th>Guru</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>${d.submissions.map(s=>`<tr><td>${esc(s.subject_name)}</td><td>${esc(s.teacher_name)}</td><td>${esc(statusText(s.status))}${s.review_reason?`<p class="subtle">Alasan: ${esc(s.review_reason)}</p>`:''}</td><td>${s.status==='submitted_to_homeroom'?`<button class="btn btn-sm btn-primary" data-review-grade="${Number(s.id)}" data-action="approve">Setujui</button> <button class="btn btn-sm btn-outline" data-review-grade="${Number(s.id)}" data-action="return">Kembalikan</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`;
      host.querySelectorAll('[data-review-grade]').forEach(btn=>btn.onclick=()=>withLoading(btn,async()=>{
        let reason=''; if(btn.dataset.action==='return'){reason=window.prompt('Masukkan alasan pengembalian nilai kepada guru:')||'';if(reason.trim().length<5){toast('Alasan minimal 5 karakter.', 'error');return;}}
        try{await api(`/assessments/submissions/${Number(btn.dataset.reviewGrade)}/review`,{method:'POST',body:{action:btn.dataset.action,reason}});toast('Status nilai diperbarui.');await reload();}catch(err){toast(err.message,'error');}
      }));
      $('#build-report-package',host)?.addEventListener('click',e=>withLoading(e.currentTarget,async()=>{
        try{const pkg=await api('/assessments/packages/build',{method:'POST',body:{class_id:cid,period_id:pid}});const submitted=await api(`/assessments/packages/${pkg.data.id}/submit`,{method:'POST',body:{}});toast(submitted.message||'Paket rapor dikirim.');await showHomeroomPackages();}catch(err){toast(err.message,'error');}
      }));
      await showHomeroomPackages();
    }catch(err){host.innerHTML=`<div class="form-error">${esc(err.message)}</div>`;}
  };
  async function showHomeroomPackages(){
    try{const list=(await api('/assessments/packages')).data;$('#hr-packages',el).innerHTML=`<div class="card"><h3>Paket Rapor</h3>${list.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Kelas</th><th>Periode</th><th>Versi</th><th>Status</th><th>Terakhir diperbarui</th></tr></thead><tbody>${list.map(p=>`<tr><td>${esc(p.class_name)}</td><td>${esc(p.period_label)}</td><td>${Number(p.version_no)}</td><td>${esc(statusText(p.status))}</td><td>${fmtDateTime(p.updated_at)}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada paket rapor.')}</div>`;}catch(err){$('#hr-packages',el).innerHTML=`<div class="subtle">${esc(err.message)}</div>`;}
  }
  $('#hr-class',el).onchange=reload;$('#hr-period',el).onchange=reload;
}

async function adminReportPackagesPage(el) {
  let periods = [], years = [];
  try {
    [periods, years] = await Promise.all([
      api('/assessments/periods').then(x => x.data),
      api('/academics/setup-options').then(x => x.data.academicYears || []),
    ]);
  } catch (err) {
    el.innerHTML = `${head('Pemeriksaan & Publikasi Rapor', '')}<div class="form-error">${esc(err.message)}</div>`;
    return;
  }
  const periodRows = periods.length ? periods.map(p => {
    const next = ({ draft: 'open', open: 'closed', closed: 'locked' })[p.status];
    const label = ({ draft: 'Buka periode', open: 'Tutup input', closed: 'Kunci periode' })[p.status];
    return `<tr><td>${esc(p.label)}</td><td>${esc(p.academic_year)} · Semester ${Number(p.semester)}</td><td>${esc(p.period_type === 'monthly' ? `Bulanan ${p.period_number}` : p.period_type.toUpperCase())}</td><td>${esc(statusText(p.status))}</td><td>${next ? `<button class="btn btn-sm btn-outline" data-period-status="${Number(p.id)}" data-next-status="${next}">${label}</button>` : 'Final'}</td></tr>`;
  }).join('') : `<tr><td colspan="5">Belum ada periode penilaian.</td></tr>`;
  el.innerHTML = `${head('Pemeriksaan & Publikasi Rapor', 'Kelola periode nilai dan tinjau paket kelas yang dikirim wali kelas. Nilai siswa hanya ditampilkan setelah paket dipublikasikan.')}
    <details class="card mb" id="assessment-period-create"><summary><strong>Buat periode penilaian</strong></summary>
      <form id="assessment-period-form" class="mt"><div class="form-grid">
        <div class="field"><label>Tahun ajaran</label><select class="input" name="academic_year_id" required><option value="">Pilih tahun ajaran</option>${years.map(y => `<option value="${Number(y.id)}">${esc(y.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Semester</label><select class="input" name="semester" required><option value="1">Semester 1</option><option value="2">Semester 2</option></select></div>
        <div class="field"><label>Jenis periode</label><select class="input" name="period_type" id="new-period-type"><option value="monthly">Bulanan</option><option value="uts">UTS</option><option value="uas">UAS</option></select></div>
        <div class="field" id="month-number-field"><label>Nomor bulan (1–12)</label><input class="input" type="number" name="period_number" min="1" max="12" value="1" required></div>
        <div class="field"><label>Nama periode</label><input class="input" name="label" maxlength="100" placeholder="Contoh: Nilai Bulanan Oktober" required></div>
        <div class="field"><label>Bobot tugas (%)</label><input class="input" type="number" name="task_weight" min="0" max="100" step="0.01" value="40" required></div>
        <div class="field"><label>Bobot ujian (%)</label><input class="input" type="number" name="exam_weight" min="0" max="100" step="0.01" value="60" required></div>
        <div class="field"><label>Tanggal mulai (opsional)</label><input class="input" type="date" name="starts_on"></div>
        <div class="field"><label>Tanggal akhir (opsional)</label><input class="input" type="date" name="ends_on"></div>
      </div><p class="subtle mt">Bobot tugas dan ujian harus berjumlah 100%. Bobot digunakan pada periode bulanan; nilai UTS/UAS tetap komponen terpisah. Periode dibuat sebagai draf dan baru menerima input setelah dibuka.</p><button class="btn btn-primary mt">Simpan periode sebagai draf</button></form>
    </details>
    <div class="card mb"><h3>Lifecycle periode penilaian</h3><div class="table-wrap"><table class="data"><thead><tr><th>Periode</th><th>Tahun ajaran</th><th>Jenis</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>${periodRows}</tbody></table></div></div>
    <div class="card mb"><div class="field"><label for="admin-report-period">Filter paket rapor</label><select class="input" id="admin-report-period"><option value="">Semua periode</option>${periods.map(p => `<option value="${Number(p.id)}">${esc(p.label)} · ${esc(p.academic_year)}</option>`).join('')}</select></div></div><div id="admin-packages"></div>`;

  const typeSelect = $('#new-period-type', el);
  const monthField = $('#month-number-field', el);
  const syncType = () => {
    const monthly = typeSelect.value === 'monthly';
    monthField.hidden = !monthly;
    monthField.querySelector('input').required = monthly;
    if (!monthly) monthField.querySelector('input').value = '';
    else if (!monthField.querySelector('input').value) monthField.querySelector('input').value = '1';
    // These weights are only used for the monthly calculation; retain a valid neutral sum for every type.
  };
  typeSelect.onchange = syncType;
  syncType();
  $('#assessment-period-form', el).onsubmit = async e => {
    e.preventDefault();
    const f = e.currentTarget;
    const monthly = f.period_type.value === 'monthly';
    const taskWeight = Number(f.task_weight.value), examWeight = Number(f.exam_weight.value);
    if (Math.round((taskWeight + examWeight) * 100) / 100 !== 100) { toast('Bobot tugas dan ujian harus berjumlah 100%.', 'error'); return; }
    if (f.starts_on.value && f.ends_on.value && f.ends_on.value < f.starts_on.value) { toast('Tanggal akhir harus sama dengan atau setelah tanggal mulai.', 'error'); return; }
    try {
      await api('/assessments/periods', { method: 'POST', body: {
        academic_year_id: Number(f.academic_year_id.value), semester: Number(f.semester.value),
        period_type: f.period_type.value, period_number: monthly ? Number(f.period_number.value) : null,
        label: f.label.value.trim(), task_weight: taskWeight, exam_weight: examWeight,
        starts_on: f.starts_on.value || null, ends_on: f.ends_on.value || null, status: 'draft',
      }});
      toast('Periode penilaian dibuat sebagai draf.');
      await adminReportPackagesPage(el);
    } catch (err) { toast(err.message, 'error'); }
  };
  el.querySelectorAll('[data-period-status]').forEach(btn => btn.onclick = () => withLoading(btn, async () => {
    const next = btn.dataset.nextStatus;
    const descriptions = { open: 'Guru dapat mulai mengisi nilai pada periode ini.', closed: 'Input nilai akan dihentikan; wali kelas tetap dapat meninjau dan menyiapkan paket.', locked: 'Periode dikunci untuk menghentikan perubahan pada proses input.' };
    const ok = await confirmDialog({ title: `Ubah status periode menjadi ${next}`, message: descriptions[next] || 'Lanjutkan perubahan status periode?', confirmText: 'Ubah status' });
    if (!ok) return;
    try { await api(`/assessments/periods/${Number(btn.dataset.periodStatus)}/status`, { method: 'PUT', body: { status: next } }); toast('Status periode diperbarui.'); await adminReportPackagesPage(el); }
    catch (err) { toast(err.message, 'error'); }
  }));

  const reload = async () => {
    try {
      const pid = $('#admin-report-period', el).value;
      const data = (await api(`/assessments/packages${pid ? `?period_id=${encodeURIComponent(pid)}` : ''}`)).data;
      $('#admin-packages', el).innerHTML = data.length ? `<div class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Kelas</th><th>Periode</th><th>Versi</th><th>Status</th><th>Wali/pembuat</th><th>Tindakan</th></tr></thead><tbody>${data.map(p => `<tr><td>${esc(p.class_name)}</td><td>${esc(p.period_label)}</td><td>${Number(p.version_no)}</td><td>${esc(statusText(p.status))}${p.review_reason ? `<p class="subtle">Alasan: ${esc(p.review_reason)}</p>` : ''}</td><td>${esc(p.creator_name || '—')}</td><td>${p.status === 'pending_admin' ? `<button class="btn btn-sm btn-primary" data-package-id="${Number(p.id)}" data-action="publish">Publikasikan</button> <button class="btn btn-sm btn-outline" data-package-id="${Number(p.id)}" data-action="return">Kembalikan</button>` : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : empty('Belum ada paket rapor pada filter ini.');
      $('#admin-packages', el).querySelectorAll('[data-package-id]').forEach(btn => btn.onclick = () => withLoading(btn, async () => {
        let reason = '';
        if (btn.dataset.action === 'return') { reason = prompt('Alasan pengembalian kepada wali kelas:') || ''; if (reason.trim().length < 5) { toast('Alasan minimal 5 karakter.', 'error'); return; } }
        const ok = btn.dataset.action === 'return' || await confirmDialog({ title: 'Publikasikan rapor', message: 'Paket kelas/periode ini akan terlihat oleh siswa yang terhubung dengan identitasnya. Pastikan data sudah benar.', confirmText: 'Publikasikan' });
        if (!ok) return;
        try { await api(`/assessments/packages/${Number(btn.dataset.packageId)}/review`, { method: 'POST', body: { action: btn.dataset.action, reason } }); toast('Status paket rapor diperbarui.'); await reload(); }
        catch (err) { toast(err.message, 'error'); }
      }));
    } catch (err) { $('#admin-packages', el).innerHTML = `<div class="form-error">${esc(err.message)}</div>`; }
  };
  $('#admin-report-period', el).onchange = reload;
  await reload();
}

export async function studentReportsPage(el) {
  try{const data=(await api('/assessments/mine')).data;const reports=data.reports||[];const groups=new Map();for(const row of reports){const key=`${row.academic_year}|${row.semester}|${row.period_label}|${row.package_id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    el.innerHTML=`${head('Rapor Saya','Hanya paket rapor yang sudah dipublikasikan dan terkait dengan identitas siswa yang ditampilkan.')}${groups.size?[...groups.entries()].map(([key,rows])=>`<div class="card mb"><div class="row between"><div><h3>${esc(rows[0].period_label)}</h3><p class="muted">${esc(rows[0].academic_year)} · Semester ${Number(rows[0].semester)} · Kelas ${esc(rows[0].class_name)}</p></div><span class="badge">Versi ${Number(rows[0].version_no)}</span></div><div class="table-wrap"><table class="data"><thead><tr><th>Mata Pelajaran</th><th>Nilai akhir</th><th>Rincian</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.subject_name)}</td><td>${r.final_score==null?'—':Number(r.final_score).toFixed(2)}</td><td><details><summary>Lihat komponen</summary><pre>${esc(JSON.stringify(r.score_payload,null,2))}</pre></details></td></tr>`).join('')}</tbody></table></div></div>`).join(''):empty('Belum ada rapor yang dipublikasikan untuk akun Anda.')}`;
  }catch(err){el.innerHTML=`${head('Rapor Saya','') }<div class="form-error">${esc(err.message)}</div>`;}
}

export async function educationAidPage(el) {
  const canManage=state.user?.permissions?.includes('aid.manage');
  let programs=[], applications=[];
  try{[programs,applications]=await Promise.all([api('/administration/aid/programs').then(r=>r.data),api('/administration/aid/applications').then(r=>r.data)]);}catch(err){el.innerHTML=`${head('Bantuan Pendidikan','') }<div class="form-error">${esc(err.message)}</div>`;return;}
  const years=canManage?(await api('/academics/setup-options').then(r=>r.data.academicYears).catch(()=>[])):[];
  el.innerHTML=`${head('Bantuan Pendidikan',canManage?'Kelola program bantuan dan tinjau berkas pengajuan siswa. Keputusan akhir mengikuti kriteria program/instansi pemberi bantuan.':'Program bantuan yang terbuka dapat diajukan melalui akun siswa. Jangan memasukkan informasi keluarga yang tidak diminta program.')}
   ${canManage?`<details class="card mb" open><summary><strong>Buat program bantuan</strong></summary><form id="aid-program-form" class="mt"><div class="form-grid"><div class="field"><label>Nama program</label><input class="input" name="name" required minlength="3" maxlength="160"></div><div class="field"><label>Penyedia</label><input class="input" name="provider" maxlength="160"></div><div class="field"><label>Tahun ajaran</label><select class="input" name="academic_year_id"><option value="">Tidak terikat</option>${years.map(y=>`<option value="${Number(y.id)}">${esc(y.name)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select class="input" name="status"><option value="draft">Draf</option><option value="open">Buka pengajuan</option><option value="closed">Tutup</option></select></div><div class="field"><label>Tanggal mulai</label><input class="input" type="date" name="starts_on"></div><div class="field"><label>Tanggal akhir</label><input class="input" type="date" name="ends_on"></div><div class="field full"><label>Persyaratan (JSON)</label><textarea class="input" name="requirements" rows="3">{}</textarea></div></div><button class="btn btn-primary mt">Simpan Program</button></form></details>`:''}
   <div class="card mb"><h3>${canManage?'Daftar Program':'Program yang tersedia'}</h3>${programs.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Program</th><th>Penyedia</th><th>Periode</th><th>Status</th>${canManage?'<th>Tindakan</th>':'<th>Pengajuan</th>'}</tr></thead><tbody>${programs.map(p=>`<tr><td><strong>${esc(p.name)}</strong><p class="subtle">${esc(JSON.stringify(p.requirements||{}))}</p></td><td>${esc(p.provider||'—')}</td><td>${dateCell(p.starts_on)} – ${dateCell(p.ends_on)}</td><td>${esc(statusText(p.status))}</td><td>${canManage?'Dikelola oleh Admin':p.status==='open'?`<button class="btn btn-sm btn-primary" data-apply-program="${Number(p.id)}">Ajukan</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada program bantuan tersedia.')}</div>
   <div class="card"><h3>${canManage?'Pengajuan siswa':'Status pengajuan saya'}</h3>${applications.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Program</th>${canManage?'<th>Siswa</th>':''}<th>Status</th><th>Catatan</th><th>Tindakan</th></tr></thead><tbody>${applications.map(a=>`<tr><td>${esc(a.program_name)}</td>${canManage?`<td>${esc(a.student_name)} · ${esc(a.student_number||'—')}</td>`:''}<td>${esc(statusText(a.status))}</td><td>${esc(a.decision_notes||'—')}</td><td>${canManage?`<select class="input" data-aid-status="${Number(a.id)}"><option value="">Ubah status…</option>${['under_review','needs_correction','proposed','approved','rejected','disbursed','closed'].map(s=>`<option value="${s}">${esc(statusText(s))}</option>`).join('')}</select><button class="btn btn-sm btn-outline mt" data-review-aid="${Number(a.id)}">Simpan status</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada pengajuan.')}</div>`;
  $('#aid-program-form',el)?.addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{const requirements=JSON.parse(f.requirements.value||'{}');if(!requirements||Array.isArray(requirements)||typeof requirements!=='object')throw new Error('Persyaratan harus berupa objek JSON.');const v={name:f.name.value.trim(),provider:f.provider.value.trim(),academic_year_id:f.academic_year_id.value?Number(f.academic_year_id.value):null,starts_on:f.starts_on.value||null,ends_on:f.ends_on.value||null,status:f.status.value,requirements};await api('/administration/aid/programs',{method:'POST',body:v});toast('Program bantuan disimpan.');await educationAidPage(el);}catch(err){toast(err.message,'error');}});
  el.querySelectorAll('[data-apply-program]').forEach(btn=>btn.onclick=()=>withLoading(btn,async()=>{const raw=prompt('Masukkan data bukti yang diminta sebagai JSON. Jangan menulis kata sandi atau informasi yang tidak diminta.','{}');if(raw===null)return;try{const evidence=JSON.parse(raw);if(!evidence||Array.isArray(evidence)||typeof evidence!=='object')throw new Error('Bukti harus berupa objek JSON.');await api('/administration/aid/applications',{method:'POST',body:{program_id:Number(btn.dataset.applyProgram),evidence}});toast('Pengajuan bantuan disimpan.');await educationAidPage(el);}catch(err){toast(err.message,'error');}}));
  el.querySelectorAll('[data-review-aid]').forEach(btn=>btn.onclick=()=>withLoading(btn,async()=>{const id=Number(btn.dataset.reviewAid), status=$(`[data-aid-status="${id}"]`,el).value;if(!status){toast('Pilih status terlebih dahulu.','error');return;}let notes='';if(['needs_correction','rejected'].includes(status)){notes=prompt('Alasan koreksi/penolakan (wajib):')||'';if(notes.trim().length<5){toast('Alasan minimal 5 karakter.','error');return;}}try{await api(`/administration/aid/applications/${id}/review`,{method:'POST',body:{status,notes}});toast('Status bantuan diperbarui.');await educationAidPage(el);}catch(err){toast(err.message,'error');}}));
}

export async function graduationPage(el) {
  let setup, records;
  try{[setup,records]=await Promise.all([api('/academics/setup-options').then(r=>r.data),api('/administration/graduation').then(r=>r.data)]);}catch(err){el.innerHTML=`${head('Pemeriksaan Kelulusan','') }<div class="form-error">${esc(err.message)}</div>`;return;}
  const students=setup.students||[], years=setup.academicYears||[];
  el.innerHTML=`${head('Pemeriksaan Kelulusan','Sistem memeriksa kelengkapan administratif. Keputusan kelulusan tetap keputusan resmi sekolah/otoritas; absensi saja tidak menentukan kelulusan.')}
   <form class="card mb" id="grad-review-form"><h3>Checklist Siswa</h3><div class="form-grid"><div class="field"><label>Siswa</label><select class="input" name="student_record_id" required><option value="">Pilih siswa</option>${students.map(s=>`<option value="${Number(s.id)}">${esc(s.full_name)} · ${esc(s.student_number||'')}</option>`).join('')}</select></div><div class="field"><label>Tahun ajaran</label><select class="input" name="academic_year_id" required><option value="">Pilih tahun ajaran</option>${years.map(y=>`<option value="${Number(y.id)}">${esc(y.name)}</option>`).join('')}</select></div></div><div class="form-grid mt">${[['attendance_complete','Kehadiran sudah diperiksa'],['grades_complete','Nilai/rapor lengkap'],['pkl_complete','PKL selesai dan dinilai'],['administration_complete','Administrasi selesai']].map(([n,l])=>`<label class="check"><input type="checkbox" name="${n}"> ${l}</label>`).join('')}</div><div class="field mt"><label>Referensi/catatan verifikasi (JSON)</label><textarea class="input" name="evidence" rows="2">{}</textarea></div><button class="btn btn-primary mt">Simpan Checklist</button></form>
   <div class="card"><h3>Daftar Review Kelulusan</h3>${records.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Siswa</th><th>Tahun Ajaran</th><th>Checklist</th><th>Status</th><th>Keputusan</th></tr></thead><tbody>${records.map(r=>`<tr><td>${esc(r.student_name)} · ${esc(r.student_number||'')}</td><td>${esc(r.academic_year)}</td><td>${['attendance_complete','grades_complete','pkl_complete','administration_complete'].filter(k=>r[k]).length}/4</td><td>${esc(statusText(r.status))}</td><td>${['eligible','review_required'].includes(r.status)?`<button class="btn btn-sm btn-primary" data-grad-decision="${Number(r.id)}" data-decision="approved">Setujui</button> <button class="btn btn-sm btn-outline" data-grad-decision="${Number(r.id)}" data-decision="not_approved">Tidak setujui</button>`:'Keputusan telah dicatat'}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada checklist kelulusan.')}</div>`;
  $('#grad-review-form',el).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{const evidence=JSON.parse(f.evidence.value||'{}');await api('/administration/graduation/reviews',{method:'POST',body:{academic_year_id:Number(f.academic_year_id.value),student_record_id:Number(f.student_record_id.value),attendance_complete:f.attendance_complete.checked,grades_complete:f.grades_complete.checked,pkl_complete:f.pkl_complete.checked,administration_complete:f.administration_complete.checked,evidence}});toast('Checklist tersimpan.');await graduationPage(el);}catch(err){toast(err.message,'error');}};
  el.querySelectorAll('[data-grad-decision]').forEach(btn=>btn.onclick=()=>withLoading(btn,async()=>{const reason=prompt('Masukkan alasan dan rujukan keputusan resmi (minimal 5 karakter):')||'';if(reason.trim().length<5){toast('Alasan minimal 5 karakter.','error');return;}const ok=await confirmDialog({title:'Catat keputusan kelulusan',message:'Pastikan keputusan berasal dari otoritas sekolah yang berwenang dan mengikuti ketentuan resmi.',confirmText:'Catat keputusan'});if(!ok)return;try{await api(`/administration/graduation/${Number(btn.dataset.gradDecision)}/decision`,{method:'POST',body:{decision:btn.dataset.decision,reason}});toast('Keputusan dicatat.');await graduationPage(el);}catch(err){toast(err.message,'error');}}));
}

export async function teacherQrCheckinPage(el) {
  let history=[]; try{history=(await api('/academics/teacher-attendance/qr/me')).data;}catch(err){el.innerHTML=`${head('Presensi Kedatangan Guru','') }<div class="form-error">${esc(err.message)}</div>`;return;}
  el.innerHTML=`${head('Presensi Kedatangan Guru','Scan QR dinamis yang ditampilkan Admin Sekolah, lalu izinkan lokasi browser. QR berlaku singkat dan satu guru hanya dapat melakukan satu check-in per hari.')}
    <div class="card mb"><div class="notice warn mb">Pemeriksaan GPS dan QR memperkuat validasi, tetapi browser tidak dapat menjamin deteksi seluruh pemalsuan lokasi. Catatan tidak otomatis memotong honor.</div><div class="row wrap"><button class="btn btn-outline" id="start-qr-scan">Scan QR dengan Kamera</button><button class="btn btn-outline" id="stop-qr-scan" hidden>Matikan Kamera</button></div><video id="qr-camera-preview" class="qr-camera" playsinline muted hidden></video><div class="field mt"><label for="teacher-qr-token">Token QR (kamera atau scanner eksternal)</label><input class="input" id="teacher-qr-token" autocomplete="off" maxlength="200" placeholder="Token dari QR dinamis"></div><button class="btn btn-primary mt" id="teacher-qr-checkin">Dapatkan Lokasi & Check-in</button><p class="subtle mt" id="qr-camera-note">Jika browser tidak mendukung pemindaian QR, gunakan scanner QR yang mengisi token pada kolom di atas.</p></div>
    <div class="card"><h3>Riwayat kedatangan</h3>${history.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Tanggal</th><th>Jam</th><th>Status</th><th>Jarak</th><th>Akurasi lokasi</th></tr></thead><tbody>${history.map(h=>`<tr><td>${dateCell(h.checkin_date)}</td><td>${fmtDateTime(h.checked_in_at)}</td><td>${esc(statusText(h.verification_status))}</td><td>${Math.round(Number(h.distance_m))} m</td><td>${Math.round(Number(h.accuracy_m))} m</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada presensi kedatangan tercatat.')}</div>`;
  const video=$('#qr-camera-preview',el), start=$('#start-qr-scan',el), stop=$('#stop-qr-scan',el), note=$('#qr-camera-note',el);let stream=null,active=false;
  const stopCamera=()=>{active=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}video.pause();video.srcObject=null;video.hidden=true;stop.hidden=true;start.hidden=false;};
  start.onclick=async()=>{if(!('BarcodeDetector' in window)){note.textContent='BarcodeDetector tidak didukung browser ini. Gunakan scanner QR eksternal atau isi token secara manual.';return;}try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=stream;video.hidden=false;stop.hidden=false;start.hidden=true;await video.play();const detector=new BarcodeDetector({formats:['qr_code']});active=true;note.textContent='Arahkan kamera ke QR sebelum kedaluwarsa.';const scan=async()=>{if(!active)return;try{const codes=await detector.detect(video);if(codes.length&&codes[0].rawValue){$('#teacher-qr-token',el).value=codes[0].rawValue;stopCamera();note.textContent='QR terbaca. Lanjutkan untuk verifikasi lokasi.';return;}}catch{}setTimeout(scan,250);};scan();}catch(err){stopCamera();toast('Kamera tidak dapat diakses. Periksa izin kamera atau isi token manual.','error');}};
  stop.onclick=stopCamera;
  $('#teacher-qr-checkin',el).onclick=()=>withLoading($('#teacher-qr-checkin',el),async()=>{const token=$('#teacher-qr-token',el).value.trim();if(!token){toast('Scan QR terlebih dahulu.','error');return;}if(!navigator.geolocation){toast('Browser tidak mendukung lokasi.','error');return;}navigator.geolocation.getCurrentPosition(async pos=>{try{const response=await api('/academics/teacher-attendance/qr/check-in',{method:'POST',body:{token,latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy_m:pos.coords.accuracy}});toast(response.message||'Check-in tersimpan.');stopCamera();await teacherQrCheckinPage(el);}catch(err){toast(err.message,'error');}},err=>toast(err.code===1?'Izin lokasi ditolak. Aktifkan izin lokasi browser.':'Lokasi tidak tersedia. Coba di area terbuka dan periksa GPS.','error'),{enableHighAccuracy:true,timeout:15000,maximumAge:0});});
  // Stop camera when navigating away from this view.
  window.addEventListener('app:navigate',stopCamera,{once:true});window.addEventListener('pagehide',stopCamera,{once:true});
}

export async function teacherQrAdminPage(el) {
  let policy, checkins=[];
  try{policy=(await api('/academics/teacher-attendance/qr/policy')).data;checkins=(await api(`/academics/teacher-attendance/qr/checkins?date=${dateToday()}`)).data;}catch(err){el.innerHTML=`${head('QR Presensi Guru','') }<div class="form-error">${esc(err.message)}</div>`;return;}
  el.innerHTML=`${head('Pengaturan QR Presensi Guru','QR berubah dan memiliki masa berlaku singkat. Atur koordinat titik sekolah dari peta yang tepercaya; hasil GPS dipakai sebagai indikator verifikasi, bukan bukti mutlak.')}
   <form class="card mb" id="qr-policy-form"><h3>Geofence dan QR</h3><div class="form-grid"><div class="field"><label>Latitude titik sekolah</label><input class="input" type="number" name="latitude" min="-90" max="90" step="0.0000001" required value="${policy?.latitude??''}"></div><div class="field"><label>Longitude titik sekolah</label><input class="input" type="number" name="longitude" min="-180" max="180" step="0.0000001" required value="${policy?.longitude??''}"></div><div class="field"><label>Radius diterima (meter)</label><input class="input" type="number" name="radius_m" min="20" max="1000" required value="${Number(policy?.radius_m||100)}"></div><div class="field"><label>Akurasi maksimum GPS (meter)</label><input class="input" type="number" name="max_accuracy_m" min="5" max="250" required value="${Number(policy?.max_accuracy_m||50)}"></div><div class="field"><label>Masa berlaku QR (detik)</label><input class="input" type="number" name="qr_ttl_seconds" min="30" max="180" required value="${Number(policy?.qr_ttl_seconds||60)}"></div></div><button class="btn btn-primary mt">Simpan Kebijakan</button><p class="subtle mt">QR lama akan dicabut ketika kebijakan diubah. Gunakan radius sesuai kondisi lokasi sekolah dan kebijakan yang disepakati.</p></form>
   <div class="card mb"><div class="row between wrap"><div><h3>QR kedatangan aktif</h3><p class="muted">QR dibentuk oleh layanan internal dan hanya berisi token acak yang disimpan sebagai hash di database.</p></div><button class="btn btn-primary" id="issue-teacher-qr">Terbitkan QR Baru</button></div><div id="teacher-qr-issued"></div></div>
   <div class="card"><div class="row between wrap"><h3>Presensi Hari Ini</h3><input class="input" id="checkins-date" type="date" value="${dateToday()}" style="max-width:200px"></div><div id="teacher-checkins-table"></div></div>`;
  const renderRows=rows=>$('#teacher-checkins-table',el).innerHTML=rows.length?`<div class="table-wrap"><table class="data"><thead><tr><th>Guru</th><th>No. Pegawai</th><th>Waktu</th><th>Jarak</th><th>Akurasi</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.full_name)}</td><td>${esc(r.employee_number||'—')}</td><td>${fmtDateTime(r.checked_in_at)}</td><td>${Math.round(Number(r.distance_m))} m</td><td>${Math.round(Number(r.accuracy_m))} m</td><td>${esc(statusText(r.verification_status))}</td></tr>`).join('')}</tbody></table></div>`:empty('Belum ada presensi QR untuk tanggal ini.');
  renderRows(checkins);
  $('#qr-policy-form',el).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api('/academics/teacher-attendance/qr/policy',{method:'PUT',body:{latitude:Number(f.latitude.value),longitude:Number(f.longitude.value),radius_m:Number(f.radius_m.value),max_accuracy_m:Number(f.max_accuracy_m.value),qr_ttl_seconds:Number(f.qr_ttl_seconds.value)}});toast('Kebijakan presensi tersimpan.');policy=(await api('/academics/teacher-attendance/qr/policy')).data;}catch(err){toast(err.message,'error');}};
  $('#issue-teacher-qr',el).onclick=()=>withLoading($('#issue-teacher-qr',el),async()=>{try{const r=await api('/academics/teacher-attendance/qr/issue',{method:'POST',body:{}});$('#teacher-qr-issued',el).innerHTML=`<div class="qr-issued mt"><img src="${esc(r.data.qr_data_uri)}" alt="QR presensi guru" width="260" height="260"><p><strong>Berlaku sampai:</strong> ${fmtDateTime(r.data.expires_at)}</p><p class="subtle">QR kedaluwarsa sekitar ${Math.max(0,Math.ceil((new Date(r.data.expires_at).getTime()-Date.now())/1000))} detik lagi. Terbitkan ulang saat habis.</p><button type="button" class="btn btn-outline" id="print-teacher-qr">Cetak QR</button></div>`;$('#print-teacher-qr',el).onclick=()=>window.print();toast('QR diterbitkan; QR sebelumnya telah dinonaktifkan.');}catch(err){toast(err.message,'error');}});
  $('#checkins-date',el).onchange=async e=>{try{const d=(await api(`/academics/teacher-attendance/qr/checkins?date=${encodeURIComponent(e.target.value)}`)).data;renderRows(d);}catch(err){toast(err.message,'error');}};
}
