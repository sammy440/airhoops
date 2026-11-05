import { CourtsRow } from "@/components/home/CourtsRow";
import { Craft } from "@/components/home/Craft";
import { Hero } from "@/components/home/Hero";
import { ModesShowcase } from "@/components/home/ModesShowcase";
import { PlayPlans } from "@/components/home/PlayPlans";
import { SiteFooter } from "@/components/home/SiteFooter";
import { StepsCarousel } from "@/components/home/StepsCarousel";
import { Welcome } from "@/components/home/Welcome";

export default function Home() {
  return (
    <div id="main" className="flex flex-1 flex-col">
      <Hero />
      <Welcome />
      <section id="modes" className="scroll-mt-8">
        <ModesShowcase />
      </section>
      <section id="how" className="scroll-mt-8">
        <StepsCarousel />
      </section>
      <Craft />
      <PlayPlans />
      <CourtsRow />
      <SiteFooter />
    </div>
  );
}
