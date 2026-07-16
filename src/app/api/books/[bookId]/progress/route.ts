import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionId } from "@/lib/auth/session";
import { ownsBook, serverRepository } from "@/lib/books/server-repository";

const schema = z.object({ locator: z.record(z.string(), z.unknown()), spineIndex: z.number().int().min(0), blockIndex: z.number().int().min(0), percentage: z.number().min(0).max(1) });
export async function GET(_request: Request, { params }: { params: Promise<{ bookId: string }> }) { const { bookId } = await params; const ownerId = await getSessionId(); if (!ownsBook(ownerId, bookId)) return NextResponse.json({ error: "Not found" }, { status: 404 }); return NextResponse.json({ progress: serverRepository.progress.get(`${ownerId}:${bookId}`) ?? null }); }
export async function PUT(request: Request, { params }: { params: Promise<{ bookId: string }> }) { const { bookId } = await params; const ownerId = await getSessionId(); if (!ownsBook(ownerId, bookId)) return NextResponse.json({ error: "Not found" }, { status: 404 }); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid progress locator." }, { status: 400 }); const record = { ...parsed.data, locator: parsed.data.locator as never, updatedAt: new Date().toISOString() }; serverRepository.progress.set(`${ownerId}:${bookId}`, record); return NextResponse.json({ progress: record }); }
