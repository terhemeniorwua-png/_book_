import Image from 'next/image';
import { ButtonLink } from '@/components/site/button-link';
import { SectionHeading } from '@/components/site/section-heading';

export function HeroSection() {
  return (
    <section
      id="home"
      className="relative isolate flex min-h-[calc(100svh-77px)] w-full scroll-mt-20 items-center justify-center overflow-hidden px-5 py-16 text-center sm:px-8 sm:py-20"
    >
      <Image
        src="/images/illustrative-living-room.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        aria-hidden="true"
        className="-z-20 object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-br from-ink/70 via-forest/55 to-forest/65"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center">
        <p className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-white/30 bg-white/15 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-[#e8d7b5]" /> Your stay,
          your comfort
        </p>
        <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
          Stay Somewhere Special.
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-7 text-white/90 sm:text-lg sm:leading-8">
          Discover thoughtfully selected apartments designed to make every stay
          comfortable, convenient and memorable.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink
            href="/apartments"
            className="focus-visible:ring-2 focus-visible:ring-white"
          >
            Explore apartments
          </ButtonLink>
          <a
            href="#about"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Learn more <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="mt-12 flex items-center justify-center gap-3 text-left text-xs text-white/90">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-[#e8d7b5]"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4">
              <path
                d="m5 12 4 4L19 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>
            <strong className="font-semibold text-white">
              Thoughtful from the start
            </strong>
            <br />
            Property details coming soon
          </span>
        </div>
      </div>
      <span className="absolute bottom-4 right-5 rounded-full bg-ink/45 px-3 py-2 text-[9px] font-medium text-white backdrop-blur sm:bottom-6 sm:right-8">
        Illustrative image · Unsplash
      </span>
    </section>
  );
}

export function BookingEntrySection() {
  return (
    <section className="mx-auto max-w-[1320px] px-5 pb-16 sm:px-8 lg:px-12">
      <div className="flex flex-col gap-6 rounded-2xl bg-forest p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8 lg:px-10">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-lime">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
            >
              <path
                d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <p className="font-display text-2xl leading-tight sm:text-3xl">
              Your Stay, Made Simple.
            </p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              Browse available apartments and find the details that matter to
              you.
            </p>
          </div>
        </div>
        <ButtonLink href="/apartments" variant="light" className="shrink-0">
          Find an apartment
        </ButtonLink>
      </div>
    </section>
  );
}

export function WhyStaySection() {
  const values = [
    {
      number: '01',
      title: 'Room to settle in',
      text: 'A little more space can make a trip feel more like your own.',
    },
    {
      number: '02',
      title: 'Details up front',
      text: 'Know what each apartment offers before you choose your stay.',
    },
    {
      number: '03',
      title: 'Made for your plans',
      text: 'Browse at your pace and find a place that suits your itinerary.',
    },
  ];

  return (
    <section className="section-wrap">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <SectionHeading
          eyebrow="Why stay with us"
          title="The little things make a stay."
          description="Comfort looks different to everyone. We’re shaping a clear, considered way to find an apartment that feels right for your time away."
        />
        <div className="grid gap-0">
          {values.map((value) => (
            <article
              key={value.number}
              className="grid grid-cols-[56px_1fr] gap-4 border-b border-ink/10 py-6 first:pt-0 last:border-0 sm:grid-cols-[76px_1fr] sm:gap-6 sm:py-7"
            >
              <span className="font-display text-2xl text-[#285548]">
                {value.number}
              </span>
              <div>
                <h3 className="font-display text-2xl text-ink sm:text-3xl">
                  {value.title}
                </h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted">
                  {value.text}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AboutSection() {
  return (
    <section id="about" className="scroll-mt-24 bg-[#e8e3da]">
      <div className="mx-auto grid max-w-[1320px] gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-12 lg:py-24">
        <div className="relative mx-auto aspect-[1.12/1] w-full max-w-[620px] overflow-hidden rounded-[2rem] sm:rounded-[2.5rem]">
          <Image
            src="/images/illustrative-interior.jpg"
            alt="Illustrative interior: a bright living room with natural light and neutral furnishings"
            fill
            sizes="(max-width: 1024px) 90vw, 45vw"
            className="object-cover"
          />
          <span className="absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-2 text-[10px] font-semibold text-forest backdrop-blur">
            Illustrative image · Unsplash
          </span>
        </div>
        <div>
          <SectionHeading
            eyebrow="A little about us"
            title="A place to make your own."
            description="We believe where you stay is part of the story of your trip. Our aim is to make choosing that place feel thoughtful, simple, and clear."
          />
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted">
            Property name, history, and the people behind it will be added here
            once the owner shares those details. Until then, we’re keeping the
            focus on the things every guest should be able to see clearly: the
            space, the price, and what is included.
          </p>
          <ButtonLink href="/apartments" variant="outline" className="mt-7">
            See apartment listings
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

export function AmenitiesSection() {
  const details = [
    {
      icon: 'building',
      title: 'In the apartment',
      note: 'Amenities to be confirmed',
    },
    {
      icon: 'map-pin',
      title: 'Getting around',
      note: 'Transport details to come',
    },
    { icon: 'calendar', title: 'Your stay', note: 'Check-in details to come' },
    { icon: 'info', title: 'Good to know', note: 'House information to come' },
  ];

  return (
    <section id="amenities" className="section-wrap scroll-mt-24">
      <SectionHeading
        eyebrow="The details"
        title="Know what comes with your stay."
        description="Every listing should answer the practical questions, too. Confirmed amenities and stay information will appear here and on each apartment page."
        align="center"
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {details.map((detail) => (
          <article
            key={detail.title}
            className="rounded-2xl border border-ink/10 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md"
          >
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-2xl bg-[#e8d7b5] text-forest"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="size-5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {detail.icon === 'building' ? (
                  <>
                    <path d="M6 22V3h12v19M6 12H4v10h16V12h-2" />
                    <path d="M10 7h4M10 11h4M10 15h4M10 19h4" />
                  </>
                ) : detail.icon === 'map-pin' ? (
                  <>
                    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </>
                ) : detail.icon === 'calendar' ? (
                  <>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M16 3v4M8 3v4M3 11h18M8 15h.01M12 15h.01M16 15h.01" />
                  </>
                ) : (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
                  </>
                )}
              </svg>
            </span>
            <h3 className="mt-6 font-display text-2xl text-ink">
              {detail.title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">{detail.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LocationSection() {
  return (
    <section
      id="location"
      className="mx-auto max-w-[1320px] px-5 pb-16 sm:px-8 lg:px-12 lg:pb-24"
    >
      <div className="grid overflow-hidden rounded-2xl border border-[#e8e3da] bg-[#e8e3da] lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative min-h-[300px] overflow-hidden bg-[#f6f1e8] p-8 sm:min-h-[380px] sm:p-12">
          <span className="relative inline-flex size-12 items-center justify-center rounded-full bg-forest text-lime shadow-lg">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
            >
              <path
                d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <circle
                cx="12"
                cy="10"
                r="2.2"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </span>
          <div className="absolute bottom-8 left-8 rounded-xl border border-[#e8e3da] bg-white px-5 py-4 sm:bottom-12 sm:left-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#285548]">
              Location preview
            </p>
            <p className="mt-1 font-display text-xl text-ink">
              Details coming soon
            </p>
          </div>
        </div>
        <div className="flex flex-col justify-center p-8 sm:p-12 lg:p-14">
          <SectionHeading
            eyebrow="Find your way"
            title="A good location makes all the difference."
            description="The property address, nearby transport, and local points of interest will be shared as soon as the location has been confirmed."
          />
          <p className="mt-5 text-xs leading-5 text-muted">
            No map or location has been added yet, so you can plan with accurate
            information once it is available.
          </p>
          <a
            href="#contact"
            className="mt-7 inline-flex w-fit items-center gap-2 text-sm font-semibold text-forest underline decoration-forest/30 underline-offset-4 hover:decoration-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral"
          >
            Ask us about the area <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}

const questions = [
  {
    question: 'How do I choose an apartment?',
    answer:
      'Browse the published apartment listings to compare the space, pricing, and confirmed details. Listings will appear when they are ready.',
  },
  {
    question: 'Where is the property located?',
    answer:
      'The owner has not supplied a confirmed location yet. The address and local information will be added here once verified.',
  },
  {
    question: 'Which amenities are included?',
    answer:
      'Amenities vary by apartment. Each listing will show only the features confirmed for that space.',
  },
  {
    question: 'What are the check-in and cancellation policies?',
    answer:
      'These policies are being confirmed by the property owner and will be published before reservations open.',
  },
];

export function FAQSection() {
  return (
    <section
      id="faq"
      className="bg-forest px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24"
    >
      <div className="mx-auto grid max-w-[1296px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <SectionHeading
          eyebrow="Frequently asked"
          title="A few things you may be wondering."
          description="We’ll keep this section up to date as property and booking details are confirmed."
          light
        />
        <div className="divide-y divide-white/15">
          {questions.map((item, index) => (
            <details
              key={item.question}
              className="group py-5 first:pt-0 last:pb-0"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-5 rounded-lg py-1 font-display text-xl text-white marker:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lime sm:text-2xl">
                <span className="flex items-start gap-4">
                  <span className="mt-1 font-sans text-[10px] font-bold tracking-[0.15em] text-lime">
                    0{index + 1}
                  </span>
                  {item.question}
                </span>
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/20 text-lime transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="ml-10 mt-4 max-w-2xl pr-10 text-sm leading-7 text-white/65">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ContactSection() {
  return (
    <section
      id="contact"
      className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
    >
      <div className="mx-auto grid max-w-[1296px] gap-10 rounded-2xl bg-[#e8e3da] p-7 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:p-12">
        <div>
          <SectionHeading
            eyebrow="We’re here to help"
            title="Questions are always welcome."
            description="The owner’s contact details have not been supplied yet. They will be added here before reservations open."
          />
          <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-semibold text-muted">
            <span className="size-1.5 rounded-full bg-[#c6a36b]" /> Contact
            information coming soon
          </p>
        </div>
        <ButtonLink href="/apartments" className="w-fit">
          Explore apartments
        </ButtonLink>
      </div>
    </section>
  );
}
