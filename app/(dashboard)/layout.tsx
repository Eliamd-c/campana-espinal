import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { DashboardHeader } from "./components/DashboardHeader";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch session on the server for ultra-fast initial paint
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Sidebar Component (Handles both Desktop & Mobile Views) */}
      <DashboardSidebar session={session} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Component (Handles smart search) */}
        <DashboardHeader />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
