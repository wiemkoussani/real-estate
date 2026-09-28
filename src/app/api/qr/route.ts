import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { canViewComplex } from "@/lib/complex-access";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    const access = await canViewComplex(slug);
    if (!access.ok && access.reason !== "local") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const target = `${req.nextUrl.origin}/c/${slug}`;
    const png = await QRCode.toBuffer(target, {
      type: "png",
      width: 640,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Disposition": `inline; filename="${slug}-qr.png"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not generate QR" }, { status: 500 });
  }
}
