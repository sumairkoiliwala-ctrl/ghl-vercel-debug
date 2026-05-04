type AnyObject = Record<string, unknown>;

export function findNestedValue(obj: unknown, possibleKeys: string[]): unknown {
  if (!obj || typeof obj !== "object") return null;

  const record = obj as AnyObject;

  for (const key of possibleKeys) {
    if (record[key]) return record[key];
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findNestedValue(value, possibleKeys);
      if (found) return found;
    }
  }

  return null;
}

export function normalizeGhlPayload(payload: unknown) {
  const opportunityId = findNestedValue(payload, [
    "opportunityId",
    "opportunity_id",
    "opportunityID",
    "id"
  ]);

  const contactId = findNestedValue(payload, [
    "contactId",
    "contact_id",
    "contactID"
  ]);

  const locationId = findNestedValue(payload, [
    "locationId",
    "location_id",
    "locationID"
  ]);

  const subscriptionId = findNestedValue(payload, [
    "subscriptionId",
    "subscription_id",
    "subscriptionID",
    "stripeSubscriptionId"
  ]);

  const transactionId = findNestedValue(payload, [
    "transactionId",
    "transaction_id",
    "paymentId",
    "payment_id",
    "chargeId",
    "charge_id"
  ]);

  const email = findNestedValue(payload, ["email", "customerEmail"]);

  const status = findNestedValue(payload, [
    "status",
    "opportunityStatus",
    "paymentStatus"
  ]);

  return {
    opportunityId,
    contactId,
    locationId,
    subscriptionId,
    transactionId,
    email,
    status
  };
}