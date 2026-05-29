/**
 * Estimation simplifiée paie Québec (à valider avec comptable).
 */
export function computePayroll(employee, profile) {
  const gross = Number(employee.grossSalary) || 0;
  
  return {
    gross,
    federal: 0,
    provincial: 0,
    cpp: 0,
    ei: 0,
    qpp: 0,
    deductions: 0,
    net: gross,
    employerCost: gross,
  };
}

export function payrollSummary(employees, profile) {
  return employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    role: emp.role || '—',
    ...computePayroll(emp, profile),
  }));
}

export function totalPayrollCost(rows) {
  return rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      net: acc.net + r.net,
      deductions: acc.deductions + r.deductions,
      employerCost: acc.employerCost + r.employerCost,
    }),
    { gross: 0, net: 0, deductions: 0, employerCost: 0 }
  );
}
