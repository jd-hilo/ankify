import Link from 'next/link';
import { Button, Card, Badge } from '@/components/ui';
import { ArrowRight, Zap, Shield, Target, Star } from 'lucide-react';
import { ReviewsCarousel } from '@/components/reviews-carousel';
import { LandingHeader } from '@/components/landing-header';

export default function Home() {
  const reviews = [
    {
      name: 'SARAH CHEN',
      role: 'MEDICAL STUDENT, YEAR 2',
      text: 'ANKIFY TRANSFORMED HOW I STUDY. NO MORE MANUALLY MATCHING LECTURES TO CARDS. IT DOES IT INSTANTLY.',
      rating: 5,
    },
    {
      name: 'JAMES PARKER',
      role: 'PRE-MED TUTOR',
      text: 'MY STUDENTS LOVE BEING ABLE TO EXPORT EXACT CARDS FOR EACH LECTURE. IT SAVES HOURS EVERY WEEK.',
      rating: 5,
    },
    {
      name: 'DR. MARTINEZ',
      role: 'ANATOMY INSTRUCTOR',
      text: 'FINALLY, A TOOL THAT BRIDGES THE GAP BETWEEN LECTURE CONTENT AND ANKI CARDS. BRILLIANT.',
      rating: 5,
    },
  ];

  const features = [
    {
      icon: Zap,
      title: 'LIGHTNING FAST',
      description: 'MATCH HUNDREDS OF SLIDES IN MINUTES, NOT HOURS',
      bgClass: 'bg-neo-accent',
    },
    {
      icon: Shield,
      title: 'PRIVACY FIRST',
      description: 'WE NEVER STORE YOUR CARD CONTENT. ONLY CONCEPTS.',
      bgClass: 'bg-neo-secondary',
    },
    {
      icon: Target,
      title: 'PRECISE MATCHING',
      description: 'AI-POWERED MATCHING FINDS THE PERFECT CARDS FOR EACH SLIDE',
      bgClass: 'bg-neo-muted',
    },
  ];

  return (
    <main className="min-h-screen bg-neo-bg bg-dots relative">
      <LandingHeader />

      {/* Hero Section - Full Width Block */}
      <section className="border-b-8 border-black bg-white/80 backdrop-blur-sm relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-10 right-10 animate-spin-slow opacity-20 hidden lg:block">
          <Star className="h-40 w-40 fill-neo-secondary stroke-black stroke-[4px]" />
        </div>

        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-32 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left Column - Title */}
            <div className="relative">
              <div className="absolute -top-16 -left-8 rotate-[-12deg] z-20">
                <Badge variant="accent" size="lg" className="text-2xl px-6 py-3 shadow-neo-md">
                  NEW
                </Badge>
              </div>
              <h1 className="text-7xl sm:text-8xl md:text-9xl font-black uppercase tracking-tighter mb-6 leading-none">
                <span className="text-stroke block">STUDY</span>
                <span className="block text-neo-accent drop-shadow-[8px_8px_0px_rgba(0,0,0,1)]">SMARTER</span>
              </h1>
              <p className="text-2xl sm:text-3xl font-black uppercase mb-10 leading-tight max-w-md">
                MATCH LECTURES WITH <span className="bg-neo-secondary px-2 border-4 border-black inline-block rotate-1">ANKING</span> CARDS INSTANTLY
              </p>
              <div className="flex flex-col sm:flex-row gap-6">
                <Link href="/login">
                  <Button variant="primary" size="lg" className="w-full sm:w-auto text-xl py-8 px-10">
                    GET STARTED
                    <ArrowRight className="ml-2 h-6 w-6 stroke-[4px]" />
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-xl py-8 px-10 bg-white">
                    SIGN UP
                  </Button>
                </Link>
              </div>
            </div>
            
            {/* Right Column - Large Numbered Box */}
            <div className="relative">
              <div className="absolute -top-6 -right-6 w-full h-full bg-black z-0" />
              <div className="bg-neo-accent border-8 border-black p-12 relative z-10 translate-x-[-8px] translate-y-[-8px]">
                <div className="text-9xl font-black text-white mb-4 drop-shadow-[8px_8px_0px_rgba(0,0,0,1)]">3</div>
                <div className="text-4xl font-black text-white uppercase mb-6 tracking-tighter">SIMPLE STEPS</div>
                <div className="space-y-6">
                  <div className="bg-white border-4 border-black p-5 shadow-neo-sm rotate-1">
                    <div className="text-2xl font-black">1. ADD LECTURES</div>
                  </div>
                  <div className="bg-white border-4 border-black p-5 shadow-neo-sm -rotate-1">
                    <div className="text-2xl font-black">2. GET MATCHED CARDS</div>
                  </div>
                  <div className="bg-white border-4 border-black p-5 shadow-neo-sm rotate-2">
                    <div className="text-2xl font-black">3. EXPORT</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Marquee Section */}
      <div className="bg-black py-4 overflow-hidden border-b-8 border-black whitespace-nowrap">
        <div className="inline-block animate-marquee text-white font-black text-2xl uppercase tracking-[0.2em]">
          NO MORE MANUAL SEARCHING • SAVE HOURS EVERY WEEK • MASTER YOUR CURRICULUM • AI-POWERED MATCHING • ANKING COMPATIBLE • NO MORE MANUAL SEARCHING • SAVE HOURS EVERY WEEK • MASTER YOUR CURRICULUM • AI-POWERED MATCHING • ANKING COMPATIBLE •
        </div>
      </div>

      {/* How It Works - Grid Layout */}
      <section id="how-it-works" className="border-b-8 border-black bg-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-grid opacity-20 pointer-events-none" />
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 relative z-10">
          <div className="inline-block bg-neo-secondary border-4 border-black px-6 py-2 mb-8 rotate-[-2deg] shadow-neo-sm">
            <h2 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter">
              THE WORKFLOW
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-12">
            <Card hover className="bg-neo-bg border-8 border-black p-10 rotate-1">
              <div className="bg-neo-accent border-4 border-black p-6 mb-8 inline-block shadow-neo-md">
                <span className="text-6xl font-black text-white">1</span>
              </div>
              <h3 className="text-3xl font-black uppercase mb-6 tracking-tight">ADD LECTURES</h3>
              <p className="text-xl font-bold leading-relaxed opacity-80">
                UPLOAD YOUR LECTURE SLIDES (PDF OR PPTX). WE EXTRACT CONCEPTS FROM EACH SLIDE USING AI.
              </p>
            </Card>

            <Card hover className="bg-neo-bg border-8 border-black p-10 -rotate-1">
              <div className="bg-neo-secondary border-4 border-black p-6 mb-8 inline-block shadow-neo-md">
                <span className="text-6xl font-black">2</span>
              </div>
              <h3 className="text-3xl font-black uppercase mb-6 tracking-tight">GET MATCHED CARDS</h3>
              <p className="text-xl font-bold leading-relaxed opacity-80">
                AI MATCHES YOUR SLIDE CONCEPTS TO ANKING CARDS FROM ANY UPLOADED DECK. INSTANT RESULTS.
              </p>
            </Card>

            <Card hover className="bg-neo-bg border-8 border-black p-10 rotate-2">
              <div className="bg-neo-muted border-4 border-black p-6 mb-8 inline-block shadow-neo-md">
                <span className="text-6xl font-black">3</span>
              </div>
              <h3 className="text-3xl font-black uppercase mb-6 tracking-tight">EXPORT</h3>
              <p className="text-xl font-bold leading-relaxed opacity-80">
                COPY CARD IDS TO CREATE FILTERED DECKS IN ANKI. STUDY EXACTLY WHAT YOU NEED FOR EACH LECTURE.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section - Asymmetric Layout */}
      <section id="features" className="border-b-8 border-black bg-neo-secondary relative">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
          <div className="flex flex-col md:flex-row justify-between items-center mb-16 gap-8">
            <h2 className="text-6xl sm:text-7xl font-black uppercase tracking-tighter text-black drop-shadow-[4px_4px_0px_rgba(255,255,255,1)]">
              WHY ANKIFY?
            </h2>
            <div className="bg-black text-white border-4 border-white p-4 rotate-1 shadow-neo-white-sm">
              <p className="font-black uppercase tracking-widest">BUILT FOR MED STUDENTS</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              const rotations = ['rotate-1', '-rotate-2', 'rotate-1'];
              return (
                <Card key={feature.title} hover className={`bg-white border-8 border-black p-10 ${rotations[idx]}`}>
                  <div className={`${feature.bgClass} border-4 border-black p-6 mb-8 inline-block shadow-neo-md`}>
                    <Icon className="h-12 w-12 stroke-black stroke-[3px]" />
                  </div>
                  <h3 className="text-3xl font-black uppercase mb-4 tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-lg font-bold leading-relaxed opacity-70">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Reviews Section - Carousel */}
      <section id="reviews" className="border-b-8 border-black bg-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-neo-muted/20 -skew-x-12 translate-x-20" />
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 relative z-10">
          <h2 className="text-6xl sm:text-7xl font-black uppercase tracking-tighter mb-16 text-center drop-shadow-[6px_6px_0px_rgba(196,181,253,1)]">
            STUDENT FEEDBACK
          </h2>
          <ReviewsCarousel reviews={reviews} />
        </div>
      </section>

      {/* Stats Section - Full Width Block */}
      <section id="stats" className="border-b-8 border-black bg-neo-accent relative overflow-hidden">
        <div className="absolute inset-0 bg-halftone opacity-30" />
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24 relative z-10">
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <Card hover className="bg-white border-8 border-black p-10 -rotate-1 shadow-neo-xl">
              <div className="text-8xl font-black mb-4 tracking-tighter text-neo-accent">1000+</div>
              <div className="text-2xl font-black uppercase tracking-widest">LECTURES</div>
            </Card>
            <Card hover className="bg-white border-8 border-black p-10 rotate-1 shadow-neo-xl">
              <div className="text-8xl font-black mb-4 tracking-tighter text-neo-secondary">50K+</div>
              <div className="text-2xl font-black uppercase tracking-widest">CARDS</div>
            </Card>
            <Card hover className="bg-white border-8 border-black p-10 -rotate-2 shadow-neo-xl">
              <div className="text-8xl font-black mb-4 tracking-tighter text-neo-muted">500+</div>
              <div className="text-2xl font-black uppercase tracking-widest">STUDENTS</div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section - Full Width Block */}
      <section className="bg-neo-muted py-24 px-4">
        <div className="container mx-auto max-w-5xl">
          <Card hover className="bg-white border-8 border-black p-12 sm:p-20 text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-neo-secondary border-8 border-black rotate-12" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-neo-accent border-8 border-black -rotate-12" />
            
            <div className="relative z-10">
              <h2 className="text-6xl sm:text-7xl md:text-8xl font-black uppercase tracking-tighter mb-8 leading-none">
                READY TO <br />
                <span className="text-neo-accent">TRANSFORM</span> <br />
                STUDYING?
              </h2>
              <p className="text-2xl sm:text-3xl font-black mb-12 uppercase tracking-tight opacity-80">
                JOIN HUNDREDS OF MEDICAL STUDENTS USING ANKIFY
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center">
                <Link href="/signup">
                  <Button variant="primary" size="lg" className="w-full sm:w-auto text-2xl py-10 px-12 shadow-neo-lg">
                    GET STARTED FREE
                    <ArrowRight className="ml-2 h-8 w-8 stroke-[4px]" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto text-2xl py-10 px-12 bg-white">
                    SIGN IN
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12 border-t-8 border-black">
        <div className="container mx-auto max-w-7xl px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="bg-neo-accent border-4 border-white p-2">
              <span className="text-2xl font-black text-white">A</span>
            </div>
            <span className="text-3xl font-black uppercase tracking-tighter">ANKIFY</span>
          </div>
          <p className="font-bold uppercase tracking-widest opacity-60">
            © 2026 ANKIFY. ALL RIGHTS RESERVED. BOLDLY BUILT.
          </p>
        </div>
      </footer>
    </main>
  );
}
