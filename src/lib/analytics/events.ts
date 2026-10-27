export interface AnalyticsLineInput {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string;
  unitPriceMinor: number;
  quantity: number;
  currency: string;
  category?: string;
}

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  item_variant: string;
  item_brand: string;
  item_category?: string;
  price: number;
  quantity: number;
}

export interface EcommerceParams {
  currency: string;
  value: number;
  items: AnalyticsItem[];
}

export interface PurchaseParams extends EcommerceParams {
  transaction_id: string;
  shipping: number;
}

function minorToMajor(minor: number): number {
  return Math.round(minor) / 100;
}

export function toAnalyticsItem(line: AnalyticsLineInput): AnalyticsItem {
  return {
    item_id: line.variantId || line.productId,
    item_name: line.productTitle,
    item_variant: line.variantTitle,
    item_brand: "Zitsy",
    ...(line.category ? { item_category: line.category } : {}),
    price: minorToMajor(line.unitPriceMinor),
    quantity: line.quantity,
  };
}

export function lineValueMinor(line: AnalyticsLineInput): number {
  return line.unitPriceMinor * line.quantity;
}

export function ecommerceParams(lines: AnalyticsLineInput[]): EcommerceParams {
  const currency = lines[0]?.currency ?? "GBP";
  const valueMinor = lines.reduce((sum, line) => sum + lineValueMinor(line), 0);
  return {
    currency,
    value: minorToMajor(valueMinor),
    items: lines.map(toAnalyticsItem),
  };
}

export function viewItemParams(line: AnalyticsLineInput): EcommerceParams {
  return ecommerceParams([line]);
}

export function purchaseParams(
  lineInputs: AnalyticsLineInput[],
  input: {
    orderNumber: string;
    totalMinor: number;
    shippingMinor: number;
    currency: string;
  },
): PurchaseParams {
  return {
    transaction_id: input.orderNumber,
    currency: input.currency,
    value: minorToMajor(input.totalMinor),
    shipping: minorToMajor(input.shippingMinor),
    items: lineInputs.map(toAnalyticsItem),
  };
}

export function searchEventParams(results: number) {
  return {
    results,
  };
}
