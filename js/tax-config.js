/** Configuration fiscale — Haïti (Manoue Bar) */
export function taxRate(profile) {
  return (profile.tpsRate ?? 0.07) + (profile.tvqRate ?? 0);
}

export function taxLabel(profile) {
  return profile.taxLabel || 'Taxe';
}

export function splitTaxAmount(total, profile, taxIncluded) {
  if (!taxIncluded) {
    return { subtotal: total, tax: 0, total };
  }
  const rate = taxRate(profile);
  const subtotal = total / (1 + rate);
  const tax = Math.round(subtotal * rate * 100) / 100;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    tax,
    total,
  };
}

export function applyTaxToTransaction(amount, profile, taxIncluded) {
  if (!taxIncluded) return { tpsAmount: 0, tvqAmount: 0 };
  const { tax } = splitTaxAmount(amount, profile, true);
  return { tpsAmount: tax, tvqAmount: 0 };
}
