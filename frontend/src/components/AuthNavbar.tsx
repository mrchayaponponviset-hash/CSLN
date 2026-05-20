"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { UsageBadge } from "./usage/UsageBadge";
import { SettingsModal } from "./SettingsModal";

interface AuthNavbarProps {
  className?: string;
}

export function AuthNavbar({ className = "" }: AuthNavbarProps) {
  const { user, openModal, logout } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <nav className={`z-50 bg-white/80 backdrop-blur-md border-b border-[var(--color-gray-200)] shadow-sm ${className}`}>
        <div className="w-full px-6 md:px-12 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group/logo">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0 relative overflow-hidden">
               <Image src="/pic.jpg" alt="Logo" fill className="object-cover scale-[1.4]" />
            </div>
            <span className="text-lg font-bold tracking-tight text-[var(--color-primary)] group-hover:opacity-80 transition-all">CSLearning</span>
          </Link>

          {user ? (
            <div className="flex items-center gap-4">
              <UsageBadge />
              <span className="text-sm font-medium text-[var(--color-gray-600)] hidden sm:block">
                {user.displayName || user.email}
              </span>
              
              {/* Settings Button */}
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 text-[var(--color-gray-500)] hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
                title="Settings & API Key"
              >
                <svg className="w-5 h-5" fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              <button 
                onClick={logout}
                className="px-4 py-1.5 text-sm font-medium text-[var(--color-gray-500)] hover:text-black transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button 
              onClick={openModal}
              className="px-6 py-2 text-sm font-bold bg-[var(--color-primary)] text-white rounded-xl
                         transition-all duration-200
                         shadow-[0_4px_0_0_rgba(100,90,240,1)]
                         hover:shadow-[0_6px_0_0_rgba(100,90,240,1)]
                         hover:-translate-y-0.5
                         active:translate-y-1 active:shadow-none"
            >
              Sign in
            </button>
          )}
        </div>
      </nav>

      {/* Render SettingsModal Outside of Navbar layout constraints */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}
