import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ghlRequest } from "@/lib/ghl";
import {
  associateContactToDeal,
  associateLineItemToDeal,
  upsertHubSpotContactFromGhl,
  upsertHubSpotDealFromGhl,
  upsertSinglePaidLineItemFromGhl
} from "@/lib/hubspot";

type AnyObject = Record<string, any>;

function getContactId(payload: AnyObject): string | null {
  return (
    payload.contact_id ||
    payload.contactId ||
    payload.contact?.id ||
    payload.payment?.customer?.id ||
    null
  );
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

  const listToSort =
    wonOpportunities.length > 0 ? wonOpportunities : opportunities;

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

function buildFallbackOpportunityFromPayment(params: {
  payment: AnyObject;
  contactId: string;
  locationId: string;
  payload: AnyObject;
}) {
  const { payment, contactId, locationId, payload } = params;

  const firstLineItem = payment?.line_items?.[0];

  const transactionId = payment?.transaction_id;
  const productName = firstLineItem?.title || payment?.invoice?.name;
  const customerName =
    payment?.customer?.name || payload.full_name || "GHL Payment Customer";

  return {
    id: `payment_${transactionId}`,
    name: productName ? `${customerName} - ${productName}` : customerName,
    monetaryValue: payment?.total_amount || firstLineItem?.price || 0,
    pipelineId: "",
    pipelineStageId: "",
    status:
      String(payment?.payment_status || "").toLowerCase() === "succeeded"
        ? "won"
        : "open",
    contactId,
    locationId,
    contact: {
      id: contactId,
      name: customerName,
      email: payment?.customer?.email || payload.email,
      phone: payment?.customer?.phone || payload.phone
    },
    isFallbackFromPayment: true
  };
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
    const payment = payload.payment || null;

    console.log("========== GHL WEBHOOK RECEIVED ==========");
    console.log("Contact ID:", contactId);
    console.log("Location ID:", locationId);
    console.log("Payment Transaction ID:", payment?.transaction_id || null);
    console.log("Payment Total Amount:", payment?.total_amount || null);
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
    console.log(
      "Selected opportunity:",
      JSON.stringify(selectedOpportunity, null, 2)
    );
    console.log("=============================================");

    let ghlOpportunity: AnyObject;

    if (selectedOpportunity?.id) {
      const opportunityDetails = await ghlRequest(
        `/opportunities/${selectedOpportunity.id}`
      );

      console.log("========== FULL OPPORTUNITY DETAILS ==========");
      console.log(JSON.stringify(opportunityDetails, null, 2));
      console.log("==============================================");

      ghlOpportunity =
        (opportunityDetails as AnyObject).opportunity || selectedOpportunity;
    } else if (payment?.transaction_id) {
      console.log(
        "No GHL opportunity found. Creating fallback HubSpot deal from payment transaction."
      );

      ghlOpportunity = buildFallbackOpportunityFromPayment({
        payment,
        contactId,
        locationId,
        payload
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message:
            "No matching opportunity found and no payment transaction available for fallback deal creation.",
          contactId,
          locationId,
          opportunitiesFound: opportunities.length
        },
        { status: 404 }
      );
    }

    const ghlContact =
      ghlOpportunity.contact ||
      selectedOpportunity?.contact ||
      payment?.customer ||
      payload;

    const hubspotContactResult = await upsertHubSpotContactFromGhl({
      email: ghlContact.email || payment?.customer?.email || payload.email,
      firstName:
        payload.first_name || payment?.customer?.first_name || undefined,
      lastName: payload.last_name || payment?.customer?.last_name || undefined,
      fullName: ghlContact.name || payment?.customer?.name || payload.full_name,
      phone: ghlContact.phone || payment?.customer?.phone || payload.phone,
      ghlContactId: ghlOpportunity.contactId || contactId,
      ghlLocationId: ghlOpportunity.locationId || locationId
    });

    const hubspotDealResult = await upsertHubSpotDealFromGhl({
      opportunityId: ghlOpportunity.id,
      opportunityName: ghlOpportunity.name,
      monetaryValue: ghlOpportunity.monetaryValue,
      pipelineId: ghlOpportunity.pipelineId,
      pipelineStageId: ghlOpportunity.pipelineStageId,
      status: ghlOpportunity.status,
      contactId: ghlOpportunity.contactId || contactId,
      locationId: ghlOpportunity.locationId || locationId
    });

    const associationResult = await associateContactToDeal({
      contactId: hubspotContactResult.contact.id,
      dealId: hubspotDealResult.deal.id
    });

    let hubspotLineItemResult: any = null;
    let lineItemAssociationResult: any = null;

    if (payment?.transaction_id) {
      hubspotLineItemResult = await upsertSinglePaidLineItemFromGhl({
        opportunityId: ghlOpportunity.id,
        opportunityName: ghlOpportunity.name,
        monetaryValue: ghlOpportunity.monetaryValue,
        contactId: ghlOpportunity.contactId || contactId,
        locationId: ghlOpportunity.locationId || locationId,
        payment
      });

      lineItemAssociationResult = await associateLineItemToDeal({
        lineItemId: hubspotLineItemResult.lineItem.id,
        dealId: hubspotDealResult.deal.id
      });
    }

    console.log("========== HUBSPOT SYNC RESULT ==========");
    console.log("Contact:", JSON.stringify(hubspotContactResult, null, 2));
    console.log("Deal:", JSON.stringify(hubspotDealResult, null, 2));
    console.log("Association:", JSON.stringify(associationResult, null, 2));

    if (hubspotLineItemResult) {
      console.log("Line Item:", JSON.stringify(hubspotLineItemResult, null, 2));
      console.log(
        "Line Item Association:",
        JSON.stringify(lineItemAssociationResult, null, 2)
      );
    } else {
      console.log(
        "Line Item: skipped because no payment transaction was present."
      );
    }

    console.log("=========================================");

    return NextResponse.json({
      success: true,
      message:
        "Webhook received, opportunity/payment matched, and HubSpot contact/deal synced.",
      ghl: {
        contactId,
        locationId,
        opportunityId: ghlOpportunity.id,
        opportunityStatus: ghlOpportunity.status,
        opportunityName: ghlOpportunity.name,
        opportunityValue: ghlOpportunity.monetaryValue,
        usedPaymentFallback: Boolean(ghlOpportunity.isFallbackFromPayment),
        paymentTransactionId: payment?.transaction_id || null,
        paymentTotalAmount: payment?.total_amount || null
      },
      hubspot: {
        contactAction: hubspotContactResult.action,
        contactId: hubspotContactResult.contact.id,
        dealAction: hubspotDealResult.action,
        dealId: hubspotDealResult.deal.id,
        lineItemAction: hubspotLineItemResult?.action || "skipped",
        lineItemId: hubspotLineItemResult?.lineItem?.id || null,
        associationCreated: true,
        lineItemAssociationCreated: Boolean(lineItemAssociationResult)
      }
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