export interface PurchaseStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PurchaseEligibilityOrder {
  paidAt: Date | null;
  status: string;
}

export function shouldTrackPurchase(order: PurchaseEligibilityOrder): boolean {
  return order.paidAt !== null && order.status !== "CANCELLED";
}

export function purchaseDedupeKey(orderNumber: string): string {
  return `zitsy:purchase:${orderNumber}`;
}

export function claimPurchaseReport(
  storage: PurchaseStorage,
  orderNumber: string,
  reportedAt = new Date().toISOString(),
): boolean {
  const key = purchaseDedupeKey(orderNumber);
  if (storage.getItem(key) !== null) return false;
  storage.setItem(key, reportedAt);
  return true;
}
