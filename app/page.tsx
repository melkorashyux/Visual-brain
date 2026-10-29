import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { LibraryClient } from "@/components/LibraryClient";
import { listItems } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function Home() {
  // First launch: choose how tagging works (or skip) before the library.
  if (!getSettings().setupComplete) redirect("/setup");

  const items = listItems();

  return (
    <>
      <Nav />
      <LibraryClient initialItems={items} />
    </>
  );
}
