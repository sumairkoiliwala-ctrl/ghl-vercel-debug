import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { ghlRequest } from "@/lib/ghl";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const locationId =
      req.nextUrl.searchParams.get("locationId") ||
      process.env.GHL_LOCATION_ID;

    const contactId = req.nextUrl.searchParams.get("contactId");
    const status = req.nextUrl.searchParams.get("status");
    const pipelineId = req.nextUrl.searchParams.get("pipelineId");

    if (!locationId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing locationId. Add ?locationId=YOUR_LOCATION_ID or set GHL_LOCATION_ID."
        },
        { status: 400 }
      );
    }

    const params = new URLSearchParams();
    params.set("location_id", locationId);

    if (contactId) params.set("contact_id", contactId);
    if (status) params.set("status", status);
    if (pipelineId) params.set("pipeline_id", pipelineId);

    const path = `/opportunities/search?${params.toString()}`;

    const data = await ghlRequest(path);

    console.log("========== GHL OPPORTUNITY SEARCH ==========");
    console.log("Search Params:", params.toString());
    console.log(JSON.stringify(data, null, 2));
    console.log("============================================");

    return NextResponse.json({
      success: true,
      searchParams: Object.fromEntries(params.entries()),
      data
    });
  } catch (error) {
    console.error("Opportunity Search Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}