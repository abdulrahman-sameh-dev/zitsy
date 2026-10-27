import { Analytics } from "@/components/analytics/analytics";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";

export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <Header />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      <Analytics />
    </div>
  );
}