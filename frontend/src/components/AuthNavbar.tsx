"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { UsageBadge } from "./usage/UsageBadge";

interface AuthNavbarProps {
  className?: string;
}

export function AuthNavbar({ className = "" }: AuthNavbarProps) {
  const { user, openModal, logout } = useAuth();

  return (
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
  );
}
