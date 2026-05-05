import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { upsertHubSpotContactFromGhl } from "@/lib/hubspot";

export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const email = req.nextUrl.searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing email. Use ?email=test@example.com"
        },
        { status: 400 }
      );
    }

    const result = await upsertHubSpotContactFromGhl({
      email,
      firstName: "Test",
      lastName: "GHL Sync",
      fullName: "Test GHL Sync",
      phone: "+10000000000",
      ghlContactId: "test-ghl-contact-id",
      ghlLocationId: process.env.GHL_LOCATION_ID || ""
    });

    return NextResponse.json({
      success: true,
      result
    });
  } catch (error) {
    console.error("HubSpot Test Contact Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}