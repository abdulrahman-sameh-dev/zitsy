-- CreateIndex
CREATE INDEX "Order_currency_paidAt_idx" ON "Order"("currency", "paidAt");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
