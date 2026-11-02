import { Suspense } from 'react';
import {
  AboutSection,
  AmenitiesSection,
  BookingEntrySection,
  ContactSection,
  FAQSection,
  HeroSection,
  LocationSection,
  WhyStaySection,
} from '@/components/home/home-sections';
import {
  FeaturedApartments,
  FeaturedApartmentsLoading,
} from '@/components/site/featured-apartments';

export default function HomePage() {
  return (
    <main id="main-content">
      <HeroSection />
      <BookingEntrySection />
      <Suspense
        fallback={
          <section className="section-wrap">
            <FeaturedApartmentsLoading />
          </section>
        }
      >
        <FeaturedApartments />
      </Suspense>
      <WhyStaySection />
      <AboutSection />
      <AmenitiesSection />
      <LocationSection />
      <FAQSection />
      <ContactSection />
    </main>
  );
}
