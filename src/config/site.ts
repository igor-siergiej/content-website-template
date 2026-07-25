export interface LocalBusinessConfig {
  /** schema.org type — 'LocalBusiness' or a more specific subtype e.g. 'SportsActivityLocation', 'Restaurant'. */
  type: string;
  telephone: string;
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  /** schema.org opening hours spec strings, e.g. "Mo-Fr 09:00-18:00". */
  openingHours: string[];
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
  };
}

export const siteConfig = {
  name: '__APP_TITLE__',
  title: '__APP_TITLE__',
  description: 'A short description of __APP_TITLE__.',
  url: process.env.SITE_URL ?? 'http://localhost:4321',
  locale: 'en',
  social: {
    twitter: '',
  },
  defaultOgImage: '/og-default.png',
  /**
   * Set this for a local-business site (address/hours/phone/rating) to get
   * LocalBusiness JSON-LD instead of generic Organization — leave undefined
   * for a non-local-business content site.
   */
  business: undefined as LocalBusinessConfig | undefined,
  faqs: [] as { question: string; answer: string }[],
};

export type SiteConfig = typeof siteConfig;
