import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req) {
  return NextResponse.json({ success: true, message: "Socket.IO server is running on port 3001" });
}

export async function POST(req) {
  return NextResponse.json({ success: true, message: "Socket.IO server is running on port 3001" });
}