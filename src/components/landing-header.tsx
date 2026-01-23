'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

export function LandingHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { name: 'HOW IT WORKS', href: '#how-it-works' },
    { name: 'FEATURES', href: '#features' },
    { name: 'REVIEWS', href: '#reviews' },
    { name: 'STATS', href: '#stats' },
  ];

  return (
    <header className="sticky top-0 z-50 bg-neo-bg border-b-8 border-black">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="bg-neo-accent border-4 border-black p-2 shadow-neo-sm group-hover:shadow-neo-md transition-all">
              <span className="text-2xl font-black text-white">A</span>
            </div>
            <span className="text-3xl font-black uppercase tracking-tighter">ANKIFY</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm font-black uppercase tracking-widest hover:text-neo-accent transition-colors"
              >
                {link.name}
              </a>
            ))}
            <div className="flex items-center gap-4 ml-4">
              <Link href="/login">
                <Button variant="outline" size="md">LOG IN</Button>
              </Link>
              <Link href="/signup">
                <Button variant="primary" size="md">SIGN UP</Button>
              </Link>
            </div>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 border-4 border-black bg-white shadow-neo-sm active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {isMenuOpen && (
        <div className="md:hidden border-t-8 border-black bg-neo-bg p-4 space-y-4">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              className="block text-xl font-black uppercase tracking-widest p-2 border-4 border-transparent hover:border-black hover:bg-neo-secondary transition-all"
              onClick={() => setIsMenuOpen(false)}
            >
              {link.name}
            </a>
          ))}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t-4 border-black">
            <Link href="/login" className="w-full">
              <Button variant="outline" size="md" className="w-full">LOG IN</Button>
            </Link>
            <Link href="/signup" className="w-full">
              <Button variant="primary" size="md" className="w-full">SIGN UP</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
