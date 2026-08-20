"use client";

import React, { useState, useEffect, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, BookOpen, Clock, Bookmark, Folder, Upload, Send, 
  ChevronLeft, ChevronRight, FileText, CheckCircle2, User
} from "lucide-react";

export function FeaturesCarousel({ trendingDocs = [] }: { trendingDocs?: any[] }) {
  const getMockDoc = (index: number, fallback: string) => {
    return trendingDocs && trendingDocs.length > index ? trendingDocs[index].title : fallback;
  };
  const getMockSubject = (index: number, fallback: string) => {
    return trendingDocs && trendingDocs.length > index ? trendingDocs[index].subject : fallback;
  };

  const features = [
  {
    id: "01",
    title: "Upload & Share",
    description: "Upload missing notes or contribute materials seamlessly to help others.",
    color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    renderMockup: () => (
      <div className="flex h-full flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800">
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Upload Material</h4>
        </div>
        <div className="flex-1 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-full dark:bg-blue-900/40 dark:text-blue-400">
            <Upload size={20} />
          </div>
          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Drag & drop your PDF here</p>
          <span className="text-[10px] text-zinc-400">Max size 50MB</span>
        </div>
      </div>
    )
  },
  {
    id: "02",
    title: "Organized Library",
    description: "Subject-wise organization with bookmarks, recently uploaded, and continue studying.",
    color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400",
    badgeColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    renderMockup: () => (
      <div className="flex h-full flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-1">Your Library</h4>
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
          <Clock size={14} className="text-emerald-500" /> Continue Studying
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
          <Bookmark size={14} className="text-emerald-500" /> Bookmarks
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400 p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
          <Upload size={14} className="text-emerald-500" /> Recent Uploads
        </div>
      </div>
    )
  },
  {
    id: "03",
    title: "Smart Search",
    description: "Find any PDF instantly with powerful search and filters across subjects, topics, and tags.",
    color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400",
    badgeColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    renderMockup: () => (
      <div className="flex h-full flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 px-3 py-2 border border-zinc-200 dark:border-zinc-700">
          <Search size={16} className="text-zinc-400" />
          <span className="text-sm text-zinc-600 dark:text-zinc-300">Data Structures</span>
        </div>
        <div className="flex gap-2 overflow-hidden">
          <span className="px-3 py-1 bg-indigo-600 text-white text-xs rounded-full font-medium">All</span>
          <span className="px-3 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 text-xs rounded-full font-medium whitespace-nowrap">Subject</span>
          <span className="px-3 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 text-xs rounded-full font-medium whitespace-nowrap">Unit</span>
        </div>
        <div className="mt-2 space-y-2">
          <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Top Results</h5>
          <div className="flex items-start gap-3 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <div className="p-1.5 bg-red-100 text-red-600 rounded-lg dark:bg-red-900/30 dark:text-red-400">
              <FileText size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{getMockDoc(0, "Data Structures - Unit 1")}</p>
              <p className="text-[10px] text-zinc-500 line-clamp-1">{getMockSubject(0, "Computer Science")} • Unit 1</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <div className="p-1.5 bg-red-100 text-red-600 rounded-lg dark:bg-red-900/30 dark:text-red-400">
              <FileText size={16} />
            </div>
            <div>
              <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{getMockDoc(1, "DS Lab Manual")}</p>
              <p className="text-[10px] text-zinc-500 line-clamp-1">{getMockSubject(1, "Computer Science")} • Lab</p>
            </div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "04",
    title: "Track & Continue",
    description: "Pick up where you left off and track your study progress seamlessly.",
    color: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    renderMockup: () => (
      <div className="flex h-full flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">Your Progress</h4>
          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">View all</span>
        </div>
        <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
          <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1 line-clamp-1">{getMockDoc(2, "Data Structures - Unit 1")}</p>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 w-[65%] rounded-full"></div>
            </div>
            <span className="text-[10px] font-medium text-zinc-500">65%</span>
          </div>
          <span className="text-[10px] text-zinc-400">Page 12 of 45</span>
        </div>
        <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mt-1">Recent Downloads</h4>
        <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer overflow-hidden">
          <FileText size={14} className="text-red-500 shrink-0" />
          <span className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{getMockDoc(3, "DBMS Quick Revision.pdf")}</span>
        </div>
      </div>
    )
  },
  {
    id: "05",
    title: "Request & Contribute",
    description: "Request missing materials or contribute notes to help the community.",
    color: "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400",
    badgeColor: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    renderMockup: () => (
      <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center">
             <User size={28} className="text-rose-500" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center">
             <CheckCircle2 size={12} className="text-white" />
          </div>
        </div>
        <div>
          <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm mb-1">Help the Community</h4>
          <p className="text-xs text-zinc-500 px-2 leading-relaxed">
            Can&rsquo;t find what you need? Request it from peers or upload your own to earn badges.
          </p>
        </div>
        <button className="px-4 py-1.5 bg-rose-500 text-white text-xs font-semibold rounded-full hover:bg-rose-600 transition-colors">
          Make a Request
        </button>
      </div>
    )
  }
];

  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true, 
    align: "center",
    skipSnaps: false
  }, [
    Autoplay({ delay: 5000, stopOnInteraction: true })
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollTo = useCallback((index: number) => emblaApi && emblaApi.scrollTo(index), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  return (
    <div className="relative w-full max-w-7xl mx-auto py-12 overflow-hidden">
      <div className="embla" ref={emblaRef}>
        <div className="embla__container flex items-stretch">
          {features.map((feature, index) => {
            const isActive = index === selectedIndex;
            return (
              <div 
                key={feature.id} 
                className="embla__slide relative flex-shrink-0 w-[85%] sm:w-[50%] md:w-[40%] lg:w-[30%] px-2 lg:px-4 flex flex-col items-center"
              >
                <motion.div
                  initial={false}
                  animate={{ 
                    scale: isActive ? 1 : 0.9,
                    opacity: isActive ? 1 : 0.4,
                    y: isActive ? 0 : 20,
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className={`w-full max-w-[320px] rounded-[2rem] p-6 sm:p-8 transition-colors duration-500 border ${
                    isActive 
                      ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl shadow-indigo-500/5 dark:shadow-indigo-500/10" 
                      : "bg-zinc-50/50 dark:bg-zinc-900/50 border-transparent shadow-none"
                  }`}
                  onClick={() => !isActive && scrollTo(index)}
                  style={{ cursor: isActive ? 'default' : 'pointer', height: isActive ? '420px' : '380px' }}
                >
                  {/* Mockup Container */}
                  <div className={`w-full h-[220px] rounded-2xl mb-6 p-2 ${feature.color}`}>
                     {feature.renderMockup()}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${feature.badgeColor}`}>
                        {feature.id}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                      {feature.title}
                    </h3>
                    {isActive && (
                      <motion.p 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed"
                      >
                        {feature.description}
                      </motion.p>
                    )}
                  </div>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-8 z-10 hidden sm:block">
        <button 
          onClick={() => emblaApi?.scrollPrev()}
          className="p-3 rounded-full bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-lg text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 hover:scale-105 transition-all backdrop-blur-sm"
        >
          <ChevronLeft size={24} />
        </button>
      </div>
      <div className="absolute top-1/2 -translate-y-1/2 right-2 sm:right-8 z-10 hidden sm:block">
        <button 
          onClick={() => emblaApi?.scrollNext()}
          className="p-3 rounded-full bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 shadow-lg text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 hover:scale-105 transition-all backdrop-blur-sm"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mt-8">
        {features.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollTo(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === selectedIndex 
                ? "w-8 bg-indigo-600 dark:bg-indigo-500" 
                : "w-2 bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
