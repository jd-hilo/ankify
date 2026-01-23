'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui';
import { LogOut } from 'lucide-react';

interface DashboardNavProps {
  user: User;
}

export function DashboardNav({ user }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const navItems = [
    { href: '/dashboard', label: 'OVERVIEW' },
    { href: '/lectures', label: 'LECTURES' },
  ];

  return (
    <nav className="bg-white border-b-4 border-black shadow-neo-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link 
              href="/dashboard" 
              className="bg-neo-accent text-white border-4 border-black px-4 py-2 shadow-neo-sm hover:shadow-neo-md transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              <span className="text-xl sm:text-2xl font-black uppercase tracking-tighter">
                ANKIFY
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    inline-flex items-center px-4 py-2 text-sm font-black uppercase tracking-widest
                    border-4 border-black transition-all duration-100
                    ${isActive
                      ? 'bg-neo-secondary text-black shadow-neo-sm'
                      : 'bg-white text-black hover:bg-neo-accent hover:text-white hover:shadow-neo-sm'
                    }
                    active:translate-x-[2px] active:translate-y-[2px] active:shadow-none
                  `}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* User Info & Sign Out */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="hidden sm:inline text-sm font-bold uppercase tracking-wide">
              {user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4 stroke-[3px]" />
              <span className="hidden sm:inline">SIGN OUT</span>
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="sm:hidden pb-4 flex gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  inline-flex items-center px-3 py-2 text-xs font-black uppercase tracking-widest whitespace-nowrap
                  border-4 border-black transition-all duration-100
                  ${isActive
                    ? 'bg-neo-secondary text-black shadow-neo-sm'
                    : 'bg-white text-black hover:bg-neo-accent hover:text-white hover:shadow-neo-sm'
                  }
                  active:translate-x-[2px] active:translate-y-[2px] active:shadow-none
                `}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
