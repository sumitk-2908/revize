import {
  Calculator,
  Atom,
  Terminal,
  Leaf,
  Wrench,
  Beaker,
  Zap,
  PenTool,
  BookOpen,
  MessageSquare,
  Globe,
  Users
} from "lucide-react";

// Academic years a subject can be offered in, and that a student can belong to.
export const ACADEMIC_YEARS = [
  { value: 1, label: "1st year" },
  { value: 2, label: "2nd year" },
  { value: 3, label: "3rd year" },
  { value: 4, label: "4th year" },
  { value: 5, label: "5th year" },
] as const;

export const getYearLabel = (year: number | null) =>
  ACADEMIC_YEARS.find(y => y.value === year)?.label ?? "";

// Categorized strictly into the 5 semantic global tokens:
// Primary (Indigo), Success (Emerald), Warning (Amber), Destructive (Red), Muted (Zinc)

export const SUBJECT_UI_MAP: Record<string, any> = {
   "maths-1": { icon: Calculator, color: "text-primary", bg: "bg-primary/10", hoverBg: "group-hover:bg-primary", border: "border-primary", topBar: "bg-primary" },
   "maths-2": { icon: Calculator, color: "text-primary", bg: "bg-primary/10", hoverBg: "group-hover:bg-primary", border: "border-primary", topBar: "bg-primary" },
   "pps": { icon: Terminal, color: "text-primary", bg: "bg-primary/10", hoverBg: "group-hover:bg-primary", border: "border-primary", topBar: "bg-primary" },
   "communication-skills": { icon: MessageSquare, color: "text-primary", bg: "bg-primary/10", hoverBg: "group-hover:bg-primary", border: "border-primary", topBar: "bg-primary" },
   
   "biology": { icon: Leaf, color: "text-success", bg: "bg-success/10", hoverBg: "group-hover:bg-success", border: "border-success", topBar: "bg-success" },
   "environmental-science": { icon: Globe, color: "text-success", bg: "bg-success/10", hoverBg: "group-hover:bg-success", border: "border-success", topBar: "bg-success" },
   "chemistry": { icon: Beaker, color: "text-success", bg: "bg-success/10", hoverBg: "group-hover:bg-success", border: "border-success", topBar: "bg-success" },
   "chemistry-lab": { icon: Beaker, color: "text-success", bg: "bg-success/10", hoverBg: "group-hover:bg-success", border: "border-success", topBar: "bg-success" },

   "physics": { icon: Atom, color: "text-warning", bg: "bg-warning/10", hoverBg: "group-hover:bg-warning", border: "border-warning", topBar: "bg-warning" },
   "physics-lab": { icon: Beaker, color: "text-warning", bg: "bg-warning/10", hoverBg: "group-hover:bg-warning", border: "border-warning", topBar: "bg-warning" },
   "bee": { icon: Zap, color: "text-warning", bg: "bg-warning/10", hoverBg: "group-hover:bg-warning", border: "border-warning", topBar: "bg-warning" },
   "bee-lab": { icon: Zap, color: "text-warning", bg: "bg-warning/10", hoverBg: "group-hover:bg-warning", border: "border-warning", topBar: "bg-warning" },

   "workshop": { icon: Wrench, color: "text-destructive", bg: "bg-destructive/10", hoverBg: "group-hover:bg-destructive", border: "border-destructive", topBar: "bg-destructive" },
   "be": { icon: BookOpen, color: "text-destructive", bg: "bg-destructive/10", hoverBg: "group-hover:bg-destructive", border: "border-destructive", topBar: "bg-destructive" },
   "be-lab": { icon: BookOpen, color: "text-destructive", bg: "bg-destructive/10", hoverBg: "group-hover:bg-destructive", border: "border-destructive", topBar: "bg-destructive" },
   "bme": { icon: Wrench, color: "text-destructive", bg: "bg-destructive/10", hoverBg: "group-hover:bg-destructive", border: "border-destructive", topBar: "bg-destructive" },
   "nss": { icon: Users, color: "text-destructive", bg: "bg-destructive/10", hoverBg: "group-hover:bg-destructive", border: "border-destructive", topBar: "bg-destructive" },

   "engineering-graphics": { icon: PenTool, color: "text-sky-500", bg: "bg-sky-500/10", hoverBg: "group-hover:bg-sky-500", border: "border-sky-500", topBar: "bg-sky-500" },
   
   "default": { icon: BookOpen, color: "text-primary", bg: "bg-primary/10", hoverBg: "group-hover:bg-primary", border: "border-primary", topBar: "bg-primary" }
};
