import { uid, safeMoney, formatMoney, saveState } from './storage.js';
import { validateEmployee } from './validate.js';
import { payrollSummary, totalPayrollCost } from './payroll.js';

export let editingEmployeeId = null;

export function onSubmitEmployee(e) {
  e.preventDefault();
  const emp = {
    id: editingEmployeeId || uid(),
    name: document.getElementById('emp-name').value.trim(),
    role: document.getElementById('emp-role').value.trim(),
    grossSalary: safeMoney(document.getElementById('emp-gross').value),
  };
  const v = validateEmployee(emp);
  if (!v.ok) {
    document.getElementById('emp-validation').innerHTML = v.errors
      .map((err) => `<div class="alert alert--danger">${escapeHtml(err)}</div>`)
      .join('');
    return;
  }
  document.getElementById('emp-validation').innerHTML = '';
  if (editingEmployeeId) {
    const idx = state.employees.findIndex((x) => x.id === editingEmployeeId);
    if (idx >= 0) state.employees[idx] = emp;
  } else {
    state.employees.push(emp);
  }
  saveState(state);
  clearEmployeeEdit();
  renderAll();
}

export function startEditEmployee(id) {
  const emp = state.employees.find((x) => x.id === id);
  if (!emp) return;
  editingEmployeeId = id;
  document.getElementById('emp-name').value = emp.name;
  document.getElementById('emp-role').value = emp.role || '';
  document.getElementById('emp-gross').value = emp.grossSalary;
  document.getElementById('emp-form-title').textContent = 'Modifier un employé';
  document.getElementById('emp-submit-btn').textContent = 'Enregistrer les modifications';
  document.getElementById('emp-cancel-edit').hidden = false;
  switchToPanel('paie');
  document.getElementById('form-employee').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function clearEmployeeEdit() {
  editingEmployeeId = null;
  document.getElementById('form-employee').reset();
  document.getElementById('emp-gross').value = '0';
  document.getElementById('emp-form-title').textContent = 'Ajouter un employé';
  document.getElementById('emp-submit-btn').textContent = 'Ajouter';
  document.getElementById('emp-cancel-edit').hidden = true;
}

export function renderPayroll() {
  const rows = payrollSummary(state.employees, state.profile);
  const tbody = document.getElementById('payroll-table-body');
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty-state">Ajoutez un employé pour estimer la paie nette.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td data-label="Employé">${escapeHtml(r.name)}</td>
      <td data-label="Rôle">${escapeHtml(r.role)}</td>
      <td class="amount-pos" data-label="Salaire">${formatMoney(r.gross)}</td>
      <td class="actions-cell" data-label="Actions">
        <button type="button" class="btn btn--ghost btn-sm" data-edit-emp="${r.id}">Modif.</button>
        <button type="button" class="btn btn--ghost btn-sm" data-del-emp="${r.id}">Suppr.</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-edit-emp]').forEach((btn) => {
    btn.addEventListener('click', () => startEditEmployee(btn.dataset.editEmp));
  });
  tbody.querySelectorAll('[data-del-emp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!confirm('Supprimer cet employé ?')) return;
      if (editingEmployeeId === btn.dataset.delEmp) clearEmployeeEdit();
      state.employees = state.employees.filter((x) => x.id !== btn.dataset.delEmp);
      saveState(state);
      renderAll();
    });
  });

  const tot = totalPayrollCost(rows);
  document.getElementById('payroll-totals').innerHTML = `
    <p><strong>Total paie :</strong> ${formatMoney(tot.gross)}</p>
    <p class="hint">Total des montants versés aux employés.</p>`;
}
