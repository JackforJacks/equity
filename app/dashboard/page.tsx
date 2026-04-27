"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ChatsCircle } from "@phosphor-icons/react";

export default function Dashboard() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="flex flex-col flex-1 bg-white dark:bg-black">
      <header className="flex items-center justify-end px-8 py-6">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-black text-black transition-colors hover:bg-zinc-100 dark:border-white dark:text-white dark:hover:bg-zinc-900"
          >
            <span className="text-lg leading-none tracking-tighter">···</span>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-40 rounded-xl border border-zinc-200 bg-white py-1 shadow-md dark:border-zinc-800 dark:bg-zinc-950">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-8 px-8 py-10">
      </main>
      <button className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-black text-white shadow-lg transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
        <ChatsCircle size={28} weight="fill" />
      </button>
    </div>
  );
}
