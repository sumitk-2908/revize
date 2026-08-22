import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Resource Requests",
  description: "See which notes, PYQs, and tutorials students are still missing, and upload what is wanted most.",
};

export default function RequestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
