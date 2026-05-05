import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ghlRequest } from "@/lib/ghl";

type AnyObject = Record<string, any>;

function getContactId(payload: AnyObject): string | null {
  return payload.contact_id || payload.contactId || payload.contact?.id || null;
}

function getLocationId(payload: AnyObject): string | null {
  return (
    payload.location?.id ||
    payload.location_id ||
    payload.locationId ||
    process.env.GHL_LOCATION_ID ||
    null
  );
}

function pickLatestWonOpportunity(opportunities: AnyObject[]) {
  const wonOpportunities = opportunities.filter((opp) => {
    return String(opp.status || "").toLowerCase() === "won";
  });

  const listToSort = wonOpportunities.length > 0 ? wonOpportunities : opportunities;

  return listToSort.sort((a, b) => {
    const dateA = new Date(
      a.updatedAt || a.lastStatusChangeAt || a.createdAt || 0
    ).getTime();

    const dateB = new Date(
      b.updatedAt || b.lastStatusChangeAt || b.createdAt || 0
    ).getTime();

    return dateB - dateA;
  })[0];
}

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = await req.json();

    const contactId = getContactId(payload);
    const locationId = getLocationId(payload);

    console.log("========== GHL WEBHOOK RECEIVED ==========");
    console.log("Contact ID:", contactId);
    console.log("Location ID:", locationId);
    console.log("Full Payload:", JSON.stringify(payload, null, 2));

    if (!contactId || !locationId) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing contactId or locationId from webhook payload.",
          contactId,
          locationId
        },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.set("location_id", locationId);
    params.set("contact_id", contactId);

    const searchResult = await ghlRequest<{
      opportunities?: AnyObject[];
    }>(`/opportunities/search?${params.toString()}`);

    const opportunities = searchResult.opportunities || [];
    const selectedOpportunity = pickLatestWonOpportunity(opportunities);

    console.log("========== MATCHED GHL OPPORTUNITY ==========");
    console.log("Total opportunities found:", opportunities.length);
    console.log("Selected opportunity:", JSON.stringify(selectedOpportunity, null, 2));
    console.log("=============================================");

    if (!selectedOpportunity?.id) {
      return NextResponse.json(
        {
          success: false,
          message: "No matching opportunity found for this contact.",
          contactId,
          locationId,
          opportunitiesFound: opportunities.length
        },
        { status: 404 }
      );
    }

    const opportunityDetails = await ghlRequest(
      `/opportunities/${selectedOpportunity.id}`
    );

    console.log("========== FULL OPPORTUNITY DETAILS ==========");
    console.log(JSON.stringify(opportunityDetails, null, 2));
    console.log("==============================================");

    return NextResponse.json({
      success: true,
      message: "Webhook received and opportunity matched.",
      contactId,
      locationId,
      matchedOpportunityId: selectedOpportunity.id,
      matchedOpportunityStatus: selectedOpportunity.status,
      matchedOpportunityName: selectedOpportunity.name,
      matchedOpportunityValue: selectedOpportunity.monetaryValue,
      opportunityDetails
    });
  } catch (error) {
    console.error("Webhook Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "GHL webhook endpoint is live. Use POST from GHL workflow."
  });
}