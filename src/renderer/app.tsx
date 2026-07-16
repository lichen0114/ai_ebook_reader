import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { LibraryView } from "@/components/library/library-view";
import { ReaderShell } from "@/components/reader/reader-shell";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { WorkspaceView } from "@/components/workspace/workspace-view";
import type { LocalBook } from "@/shared/ipc";
import { navigate, usePathname } from "./router";

export function App() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [routeBook, setRouteBook] = useState<LocalBook | null | undefined>();

  useEffect(() => window.marginReader.app.onCommand((command) => {
    if (command === "settings") setSettingsOpen(true);
    if (command === "search") window.dispatchEvent(new CustomEvent("margin:search"));
    if (command === "import") {
      void window.marginReader.library.importFile().then((book) => {
        if (book) { navigate("/library"); window.dispatchEvent(new CustomEvent("margin:library-refresh")); }
      });
    }
  }), []);

  useEffect(() => {
    const match = /^\/(?:reader|book)\/([0-9a-f-]+)/i.exec(pathname);
    if (!match) { setRouteBook(undefined); return; }
    setRouteBook(undefined);
    void window.marginReader.library.get(match[1]).then(setRouteBook);
  }, [pathname]);

  let content: React.ReactNode;
  if (pathname === "/" || pathname === "/library") content = <LibraryView onOpenSettings={() => setSettingsOpen(true)} />;
  else if (/^\/reader\//.test(pathname)) content = routeBook === undefined ? <LoadingPage /> : routeBook ? <ReaderShell book={routeBook} onOpenSettings={() => setSettingsOpen(true)} /> : <MissingBook />;
  else if (/^\/book\/[^/]+\/workspace/.test(pathname)) content = routeBook === undefined ? <LoadingPage /> : routeBook ? <WorkspaceView book={routeBook} /> : <MissingBook />;
  else content = <LibraryView onOpenSettings={() => setSettingsOpen(true)} />;

  return <><div className="native-titlebar" aria-hidden="true"><span>Margin Reader</span></div>{content}{settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}</>;
}

function LoadingPage() { return <main className="grid h-dvh place-items-center bg-[#f4efe5]"><BookOpen className="animate-pulse text-[#596b7e]" /></main>; }
function MissingBook() { return <main className="grid h-dvh place-items-center bg-[#f4efe5]"><div className="text-center"><h1 className="reader-serif text-3xl">That book is no longer here.</h1><button onClick={() => navigate("/library")} className="mt-5 rounded-full bg-[#293440] px-5 py-2 text-sm text-white">Return to library</button></div></main>; }
