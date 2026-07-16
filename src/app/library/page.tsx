import type { Metadata } from "next";
import { LibraryView } from "@/components/library/library-view";
import { demoBook } from "@/lib/books/demo";

export const metadata: Metadata = { title: "Library" };
export default function LibraryPage() { return <LibraryView demoBook={demoBook} />; }
