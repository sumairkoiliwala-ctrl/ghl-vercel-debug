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

    const opportunityId = req.nextUrl.searchParams.get("id");

    if (!opportunityId) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing opportunity id. Use ?id=GHL_OPPORTUNITY_ID"
        },
        { status: 400 }
      );
    }

    const data = await ghlRequest(`/opportunities/${opportunityId}`);

    console.log("========== GHL OPPORTUNITY DETAILS ==========");
    console.log(JSON.stringify(data, null, 2));
    console.log("=============================================");

    return NextResponse.json({
      success: true,
      opportunityId,
      data
    });
  } catch (error) {
    console.error("Opportunity Fetch Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}