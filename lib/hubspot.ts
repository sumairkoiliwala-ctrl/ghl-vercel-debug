type HubSpotRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

export async function hubspotRequest<T>(
  path: string,
  options: HubSpotRequestOptions = {}
): Promise<T> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing HUBSPOT_ACCESS_TOKEN in environment variables.");
  }

  const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });

  const text = await response.text();

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    console.error("HubSpot API Error:", {
      status: response.status,
      path,
      data
    });

    throw new Error(`HubSpot API failed with status ${response.status}`);
  }

  return data as T;
}

export async function searchHubSpotContactByEmail(email: string) {
  const result = await hubspotRequest<{
    total: number;
    results: Array<{
      id: string;
      properties: Record<string, string>;
    }>;
  }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "email",
              operator: "EQ",
              value: email
            }
          ]
        }
      ],
      properties: [
        "email",
        "firstname",
        "lastname",
        "phone",
        "ghl_contact_id",
        "ghl_location_id",
        "ghl_source_crm",
        "ghl_last_synced_at"
      ],
      limit: 1
    }
  });

  return result.results?.[0] || null;
}

export async function createHubSpotContact(properties: Record<string, string>) {
  return hubspotRequest<{
    id: string;
    properties: Record<string, string>;
  }>("/crm/v3/objects/contacts", {
    method: "POST",
    body: { properties }
  });
}

export async function updateHubSpotContact(
  contactId: string,
  properties: Record<string, string>
) {
  return hubspotRequest<{
    id: string;
    properties: Record<string, string>;
  }>(`/crm/v3/objects/contacts/${contactId}`, {
    method: "PATCH",
    body: { properties }
  });
}

export async function upsertHubSpotContactFromGhl(params: {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  phone?: string | null;
  ghlContactId?: string | null;
  ghlLocationId?: string | null;
}) {
  const {
    email,
    firstName,
    lastName,
    fullName,
    phone,
    ghlContactId,
    ghlLocationId
  } = params;

  if (!email) {
    throw new Error("Cannot upsert HubSpot contact because email is missing.");
  }

  const nameParts = fullName ? fullName.trim().split(/\s+/) : [];

  const properties: Record<string, string> = {
    email,
    firstname: firstName || nameParts[0] || "",
    lastname: lastName || nameParts.slice(1).join(" ") || "",
    phone: phone || "",
    ghl_contact_id: ghlContactId || "",
    ghl_location_id: ghlLocationId || "",
    ghl_source_crm: "GoHighLevel",
    ghl_last_synced_at: new Date().toISOString()
  };

  const existingContact = await searchHubSpotContactByEmail(email);

  if (existingContact?.id) {
    const updatedContact = await updateHubSpotContact(
      existingContact.id,
      properties
    );

    return {
      action: "updated",
      contact: updatedContact
    };
  }

  const createdContact = await createHubSpotContact(properties);

  return {
    action: "created",
    contact: createdContact
  };
}

export async function searchHubSpotDealByGhlOpportunityId(
  ghlOpportunityId: string
) {
  const result = await hubspotRequest<{
    total: number;
    results: Array<{
      id: string;
      properties: Record<string, string>;
    }>;
  }>("/crm/v3/objects/deals/search", {
    method: "POST",
    body: {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "ghl_opportunity_id",
              operator: "EQ",
              value: ghlOpportunityId
            }
          ]
        }
      ],
      properties: [
        "dealname",
        "amount",
        "dealstage",
        "pipeline",
        "ghl_opportunity_id",
        "ghl_contact_id",
        "ghl_location_id",
        "ghl_pipeline_id",
        "ghl_pipeline_stage_id",
        "ghl_opportunity_status",
        "ghl_source_crm",
        "ghl_last_synced_at"
      ],
      limit: 1
    }
  });

  return result.results?.[0] || null;
}

export async function createHubSpotDeal(properties: Record<string, string>) {
  return hubspotRequest<{
    id: string;
    properties: Record<string, string>;
  }>("/crm/v3/objects/deals", {
    method: "POST",
    body: { properties }
  });
}

export async function updateHubSpotDeal(
  dealId: string,
  properties: Record<string, string>
) {
  return hubspotRequest<{
    id: string;
    properties: Record<string, string>;
  }>(`/crm/v3/objects/deals/${dealId}`, {
    method: "PATCH",
    body: { properties }
  });
}

export async function upsertHubSpotDealFromGhl(params: {
  opportunityId: string;
  opportunityName: string;
  monetaryValue?: number | string | null;
  pipelineId?: string | null;
  pipelineStageId?: string | null;
  status?: string | null;
  contactId?: string | null;
  locationId?: string | null;
}) {
  const {
    opportunityId,
    opportunityName,
    monetaryValue,
    pipelineId,
    pipelineStageId,
    status,
    contactId,
    locationId
  } = params;

  if (!opportunityId) {
    throw new Error("Cannot upsert HubSpot deal because GHL opportunity ID is missing.");
  }

  const properties: Record<string, string> = {
    dealname: opportunityName || `GHL Opportunity ${opportunityId}`,
    amount: String(monetaryValue || 0),
    ghl_opportunity_id: opportunityId,
    ghl_contact_id: contactId || "",
    ghl_location_id: locationId || "",
    ghl_pipeline_id: pipelineId || "",
    ghl_pipeline_stage_id: pipelineStageId || "",
    ghl_opportunity_status: status || "",
    ghl_source_crm: "GoHighLevel",
    ghl_last_synced_at: new Date().toISOString()
  };

  const existingDeal = await searchHubSpotDealByGhlOpportunityId(opportunityId);

  if (existingDeal?.id) {
    const updatedDeal = await updateHubSpotDeal(existingDeal.id, properties);

    return {
      action: "updated",
      deal: updatedDeal
    };
  }

  const createdDeal = await createHubSpotDeal(properties);

  return {
    action: "created",
    deal: createdDeal
  };
}

export async function associateContactToDeal(params: {
  contactId: string;
  dealId: string;
}) {
  const { contactId, dealId } = params;

  return hubspotRequest(
    `/crm/v4/objects/contacts/${contactId}/associations/default/deals/${dealId}`,
    {
      method: "PUT"
    }
  );
}