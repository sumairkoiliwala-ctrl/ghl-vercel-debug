import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { normalizeGhlPayload } from "@/lib/normalize";

export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const payload = await req.json();
    const normalized = normalizeGhlPayload(payload);

    console.log("========== GHL WEBHOOK RECEIVED ==========");
    console.log("Normalized IDs:", JSON.stringify(normalized, null, 2));
    console.log("Full Payload:", JSON.stringify(payload, null, 2));
    console.log("==========================================");

    return NextResponse.json({
      success: true,
      message: "Webhook received. Check Vercel logs.",
      normalized
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