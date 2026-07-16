import type { Metadata } from "next";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import { demoBook } from "@/lib/books/demo";

export const metadata: Metadata = { title: "Notebook" };
export default async function WorkspacePage({ params }: { params: Promise<{ bookId: string }> }) { const { bookId } = await params; return <WorkspaceView book={{ ...demoBook, id: bookId }} />; }
