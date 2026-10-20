// Today's live content, exactly as the site renders it. The database is seeded
// from this, and the site falls back to it if the API cannot be reached, so
// the page never goes blank because of a backend problem.

import type {
  DemoSettings,
  EmailSettings,
  FormSettings,
  MenuLocation,
  Section,
  SecuritySettings,
  Seo,
  SeoSettings,
  SiteSettings,
} from './schemas';
import { securitySettingsSchema, seoSettingsSchema } from './schemas';
import type { PublicCollections, PublicMenu, PublicPage, PublicSettings, SiteBootstrap } from './public';

const emptySeo: Seo = {
  seoTitle: '',
  metaDescription: '',
  canonicalUrl: '',
  focusKeyword: '',
  ogTitle: '',
  ogDescription: '',
  ogImage: '',
  noIndex: false,
  robots: [],
  schemaType: 'auto',
  score: 0,
  schemaJson: '',
};

// Every field has a schema default, so an empty object yields the defaults.
export const defaultSeoSettings: SeoSettings = seoSettingsSchema.parse({});
export const defaultSecuritySettings: SecuritySettings = securitySettingsSchema.parse({});

const homeSeoTitle = 'Veyra | AI Shopping Assistant & Revenue Platform for Retail';
const homeMetaDescription = 'Veyra helps retailers increase conversion, grow basket value, empower store associates, and automate customer support across online and in-store journeys.';
const homeSeoSchema = JSON.stringify([
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Veyra',
    url: 'https://veyra4retail.com/',
    description: homeMetaDescription,
    keywords: 'AI shopping assistant, AI shopping assistant for ecommerce, AI personal shopper, conversational commerce AI, AI product recommendations, ecommerce personalization, AI customer service agent, AI customer support agent, in-store AI, assisted selling, cart recovery, ecommerce upselling',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Veyra',
    url: 'https://veyra4retail.com/',
    applicationCategory: 'AI Revenue Platform',
    operatingSystem: 'Web',
    description: homeMetaDescription,
    hasPart: [
      {
        '@type': 'SoftwareApplication',
        name: 'Veyra Online',
        applicationCategory: 'AI shopping assistant for ecommerce',
        description: 'Veyra is an AI shopping assistant for ecommerce that personalizes the storefront, guides product discovery, and helps shoppers move from intent to purchase.',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Veyra In-Person',
        applicationCategory: 'In-store AI assisted selling',
        description: 'Veyra brings AI-assisted selling into the store, giving associates product, inventory, recommendation, and customer context while the sale is happening.',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Cerin',
        applicationCategory: 'AI customer service agent',
        description: 'Cerin is an AI customer service agent that resolves predictable requests instantly and brings in a person with full context when human support is needed.',
      },
    ],
  },
]);

const video = (name: string, poster: string) => ({
  mp4: `/media/${name}.mp4`,
  webm: `/media/${name}.webm`,
  poster,
});

export const defaultCollections: PublicCollections = {
  metrics: [
    { id: 'metric-revenue', value: '50X', label: 'revenue for every $1 spent on Veyra' },
    { id: 'metric-conversion', value: '+16%', label: 'increase in shoppers who buy' },
    { id: 'metric-aov', value: '+9%', label: 'increase in average order value' },
    { id: 'metric-abandonment', value: '−24%', label: 'drop in cart abandonment' },
    { id: 'metric-support', value: '60%+', label: 'of predictable support requests resolved' },
  ],
  testimonials: [
    {
      id: 'story-ecommerce',
      quote: 'We were already bringing shoppers to the site. The opportunity was helping more of them actually find what they needed and buy.',
      role: 'Head of Ecommerce',
      segment: 'Fashion Retail · 500–1,000 employees',
      outcome: '+16% increase in conversion',
      explanation: 'Veyra helped shoppers move from discovery to purchase with more relevant guidance and recommendations.',
    },
    {
      id: 'story-store-ops',
      quote: 'Our associates needed answers while the customer was still standing in front of them, not after searching across multiple systems.',
      role: 'VP / Director of Store Operations',
      segment: 'Multi-Location Retail · 1,000–5,000 employees',
      outcome: '+18% assisted conversion',
      explanation: 'Veyra gave associates faster access to product, inventory, and recommendation context during customer conversations.',
    },
    {
      id: 'story-cx',
      quote: 'Most of our support volume was repetitive. We wanted customers to get answers faster without removing the human when it actually mattered.',
      role: 'Head of Customer Experience',
      segment: 'Consumer Retail · 500–1,000 employees',
      outcome: '60%+ predictable requests resolved',
      explanation: 'Cerin handled recurring support questions while passing more complex cases to people with the context already collected.',
    },
  ],
  faqs: [
    { id: 'faq-what', question: 'What is Veyra?', answer: 'Veyra is an AI revenue platform that helps customers discover products, gives store teams better selling context, and automates predictable post-purchase support.' },
    { id: 'faq-different', question: 'How is Veyra different from an AI shopping assistant or chatbot?', answer: 'Veyra connects online shopping, in-store selling, and support in one platform, so every conversation can use the same customer, product, and inventory context.' },
    { id: 'faq-conversion', question: 'How does Veyra help increase conversion?', answer: 'Veyra understands intent, recommends relevant products, resolves hesitation, and helps shoppers or associates move confidently toward a purchase.' },
    { id: 'faq-channels', question: 'Can Veyra work across digital and physical customer experiences?', answer: 'Yes. Veyra Online supports digital journeys, Veyra In-Person equips store associates, and Cerin continues the relationship after the sale.' },
    { id: 'faq-integrations', question: 'What systems does Veyra integrate with?', answer: 'Veyra is designed to work with the commerce, CRM, POS, ERP, inventory, customer-data, and support systems your business already uses.' },
    { id: 'faq-implementation', question: 'How long does implementation take?', answer: 'Timelines depend on your channels, data, and integrations. A focused rollout can start with one customer journey and expand from there.' },
    { id: 'faq-escalation', question: 'What happens when Cerin cannot resolve a request?', answer: 'Cerin escalates the conversation to your team with the customer, order, and interaction context already collected.' },
    { id: 'faq-voice', question: 'Does Veyra support voice and multiple languages?', answer: 'Veyra can be configured for multiple channels and languages based on your market and implementation requirements.' },
  ],
  logos: [
    { id: 'logo-canadian-tire', name: 'Canadian Tire', imageUrl: '/client-logos/canadian-tire.png', legacyMark: null },
    { id: 'logo-lakeshore', name: 'Lakeshore', imageUrl: '/client-logos/lakeshore.png', legacyMark: null },
    { id: 'logo-charger-logistics', name: 'Charger Logistics', imageUrl: '/client-logos/charger-logistics.png', legacyMark: null },
    { id: 'logo-deloitte', name: 'Deloitte', imageUrl: '/client-logos/deloitte.png', legacyMark: null },
    { id: 'logo-meta', name: 'Meta', imageUrl: '/client-logos/meta.png', legacyMark: null },
    { id: 'logo-riverside-natural-foods', name: 'Riverside Natural Foods', imageUrl: '/client-logos/riverside-natural-foods.png', legacyMark: null },
    { id: 'logo-canpar-express', name: 'Canpar Express', imageUrl: '/client-logos/canpar-express.png', legacyMark: null },
    { id: 'logo-royal-building-products', name: 'Royal Building Products', imageUrl: '/client-logos/royal-building-products.png', legacyMark: null },
    { id: 'logo-pernod-ricard', name: 'Pernod Ricard', imageUrl: '/client-logos/pernod-ricard.png', legacyMark: null },
    { id: 'logo-empire-company', name: 'Empire Company', imageUrl: '/client-logos/empire-company.png', legacyMark: null },
    { id: 'logo-scene', name: 'Scene', imageUrl: '/client-logos/scene.png', legacyMark: null },
    { id: 'logo-hudsons-bay', name: "Hudson's Bay", imageUrl: '/client-logos/hudsons-bay.png', legacyMark: null },
    { id: 'logo-sobeys', name: 'Sobeys', imageUrl: '/client-logos/sobeys.png', legacyMark: null },
    { id: 'logo-pet-valu', name: 'Pet Valu', imageUrl: '/client-logos/pet-valu.png', legacyMark: null },
    { id: 'logo-ahold-delhaize', name: 'Ahold Delhaize USA', imageUrl: '/client-logos/ahold-delhaize.png', legacyMark: null },
  ],
  products: [
    {
      id: 'product-online',
      name: 'Veyra Online',
      kicker: 'VEYRA ONLINE',
      anchorId: 'veyra-online',
      introTitle: 'Explore with confidence. Turn product questions into purchases.',
      introBody: 'Shoppers do not always know the product name, SKU, or exact words to search. Veyra understands what they mean, surfaces the right products, and helps them move from consideration to checkout.',
      bridge: '',
      ctaLabel: 'Book a demo call',
      features: [
        {
          id: 'adaptive-storefront',
          label: 'Adaptive Storefront',
          heading: 'Show every shopper a storefront built around them.',
          body: 'Veyra adapts what customers see from the moment they arrive and keeps changing as it learns what they want.',
          impact: '+16% online conversion',
          video: video('Adaptive_Storefront_1791304236001', '/figma/figma-online.png'),
        },
        {
          id: 'in-page-recommendations',
          label: 'In-Page Recommendations',
          heading: 'Put more relevant products in front of every shopper.',
          body: 'Veyra surfaces relevant alternatives and recommendations directly within the shopping journey, helping more of your catalog contribute to sales.',
          impact: 'More product discovery and conversion opportunities',
          video: video('In-Page_Recommendations_1791304236000', '/media/posters/In-Page_Recommendations_1791304236000.jpg'),
        },
        {
          id: 'real-time-upselling',
          label: 'Real-Time Upselling',
          heading: 'Turn purchase intent into a bigger basket.',
          body: 'Veyra recommends relevant add-ons, complementary products, and bundles while customers are already ready to buy.',
          impact: '+9% average order value',
          video: video('Real-Time_Upselling_1791304236000', '/media/posters/Real-Time_Upselling_1791304236000.jpg'),
        },
        {
          id: 'cart-recovery',
          label: 'Cart Recovery',
          heading: 'Keep purchase hesitation from becoming a missed opportunity',
          body: 'Veyra responds to uncertainty with relevant answers, comparisons, sizing guidance, or alternatives, helping more shoppers continue to checkout.',
          impact: '−24% cart abandonment',
          video: video('Cart_Recovery_1_1791304236001', '/media/posters/Cart_Recovery_1_1791304236001.jpg'),
        },
        {
          id: 'reduce-revenue-leakage',
          label: 'Reduce Revenue Leakage',
          heading: 'Turn shopper insights into opportunities to recover lost sales.',
          body: 'Veyra generates AI insights from shopper interactions, helping you understand what holds customers back and where to focus improvements to reduce revenue leakage.',
          impact: '',
          video: video('Reduce_Revenue_Leakage_20261014', '/media/posters/Reduce_Revenue_Leakage_20261014.jpg'),
        },
        {
          id: 'complete-the-sale',
          label: 'Complete the Sale',
          heading: 'Let shoppers go from choosing to buying directly through Veyra.',
          body: 'Veyra lets shoppers complete their purchase within the same experience, keeping product guidance and checkout connected when they are ready to buy.',
          impact: 'A more direct path from purchase intent to completed sale',
          video: video('Complete_the_Sale_20261014', '/media/posters/Complete_the_Sale_20261014.jpg'),
        },
      ],
    },
    {
      id: 'product-in-person',
      name: 'Veyra In-Person',
      kicker: 'VEYRA IN-PERSON',
      anchorId: 'veyra-in-person',
      introTitle: 'Turn more store conversations into sales.',
      introBody: 'Give associates the product, inventory, and recommendation context they need while the customer is still ready to buy.',
      bridge: 'The customer walked in. Veyra came with them.',
      ctaLabel: 'Book a demo call',
      features: [
        {
          id: 'product-inventory',
          label: 'Product & Inventory',
          heading: 'Give associates the answer while the customer is still there.',
          body: 'Bring product details and availability into one place so teams spend less time searching and more time selling.',
          impact: 'Faster answers. More productive customer conversations.',
          video: video('Product_&_Inventory_1791304236000', '/figma/figma-in-person.png'),
        },
        {
          id: 'smart-recommendations',
          label: 'Smart Recommendations',
          heading: 'Turn every product conversation into a bigger sales opportunity.',
          body: 'Veyra gives associates relevant alternatives, complementary products, and recommendations based on what the customer is already considering.',
          impact: 'More opportunities to increase in-store basket value.',
          video: video('Smart_Recommendations_1791304236000', '/media/posters/Smart_Recommendations_1791304236000.jpg'),
        },
        {
          id: 'customer-intelligence',
          label: 'Customer Intelligence',
          heading: 'Give every associate the context to make a stronger recommendation.',
          body: 'Veyra brings purchase history, preferences, basket activity, and customer behavior into one view so associates can identify better sales opportunities during the conversation.',
          impact: 'More relevant recommendations. More opportunities to convert.',
          video: video('Customer_Intelligence_1791304236001', '/media/posters/Customer_Intelligence_1791304236001.jpg'),
        },
      ],
    },
    {
      id: 'product-cerin',
      name: 'Cerin',
      kicker: 'CERIN  /  CUSTOMER SUPPORT',
      anchorId: 'cerin',
      introTitle: 'Protect the customer relationship after the sale.',
      introBody: 'Cerin resolves predictable requests instantly and brings in your team with full context when a conversation needs a person.',
      bridge: 'The sale happened. The relationship didn’t end.',
      ctaLabel: 'Book a demo call',
      features: [
        {
          id: 'order-tracking',
          label: 'Order Tracking & WISMO',
          heading: 'Give customers an answer before they open another ticket.',
          body: 'Cerin pulls order and shipping information automatically to resolve common delivery questions.',
          impact: '60%+ predictable support requests resolved',
          video: video('Track_Order_1_1791304236000', '/figma/figma-cerin.png'),
        },
        {
          id: 'returns-exchanges',
          label: 'Returns & Exchanges',
          heading: 'Keep returns and exchanges moving without adding to the support queue.',
          body: 'Cerin uses order details and business policies to guide eligible returns and exchanges automatically, helping your team focus on cases that actually need human attention.',
          impact: '24/7 support for routine requests',
          video: video('Return_1_1791304236000', '/media/posters/Return_1_1791304236000.jpg'),
        },
        {
          id: 'smart-escalation',
          label: 'Smart Escalation',
          heading: 'Give your team the context before they enter the conversation.',
          body: 'When human judgment is needed, Cerin passes the customer, order details, conversation history, and previous actions directly to the agent so they can act faster.',
          impact: 'One continuous conversation from AI to human',
          video: video('Smart_Escalation_1791304236000', '/media/posters/Smart_Escalation_1791304236000.jpg'),
        },
      ],
    },
  ],
};

export const defaultHomeSections: Section[] = [
  {
    id: 'hero',
    type: 'hero',
    visible: true,
    // Non-breaking spaces, as in the original markup, so the gap around the bar survives.
    eyebrow: 'VEYRA  |  AI REVENUE PLATFORM',
    heading: 'Turn more customer moments into revenue.',
    body: 'You’re already bringing customers in. Veyra helps you turn more visits into sales, grow every order, and keep customers coming back.',
    ctaLabel: 'Get Demo',
    video: {
      mp4: '/media/Hero_1_1791304236001.mp4',
      webm: '/media/Hero_1_1791304236001.webm',
      poster: '/figma/figma-hero.png',
    },
    fallbackImage: '/figma/figma-hero.png',
  },
  { id: 'trust', type: 'trust', visible: true, headline: 'Trusted by brands focused on growth.' },
  { id: 'metrics', type: 'metrics', visible: true },
  { id: 'experiences', type: 'experiences', visible: true, ariaLabel: 'Veyra Online, Veyra In-Person, and Cerin' },
  { id: 'testimonials', type: 'testimonials', visible: true, heading: 'Real results. Real customer journeys.' },
  {
    id: 'platform',
    type: 'platform',
    visible: true,
    heading: 'Different environments. One revenue platform.',
    body: 'Veyra connects every revenue moment with the customer context your business already has.',
    ctaLabel: 'Get Demo',
    diagram: {
      url: '/figma/veyra-platform-diagram.png',
      alt: 'Veyra connects online shopping, in-person selling, and post-sale support with commerce, CRM, POS, ERP, inventory, customer data, and support systems.',
    },
    stages: [
      { id: 'stage-online', name: 'Veyra Online', detail: 'Shop online', icon: 'shopping-cart', tone: 'violet' },
      { id: 'stage-in-person', name: 'Veyra In-Person', detail: 'Buy in store', icon: 'store', tone: 'blue' },
      { id: 'stage-cerin', name: 'Cerin', detail: 'Get support after the sale', icon: 'headphones', tone: 'coral' },
    ],
    mapNote: 'Customer context moves across the journey.',
    systemsLabel: 'Connected systems',
    systems: [
      { id: 'sys-commerce', name: 'Commerce', icon: 'shopping-cart', tone: 'violet' },
      { id: 'sys-crm', name: 'CRM', icon: 'users', tone: 'blue' },
      { id: 'sys-pos', name: 'POS', icon: 'monitor', tone: 'teal' },
      { id: 'sys-erp', name: 'ERP', icon: 'database', tone: 'violet' },
      { id: 'sys-data', name: 'Customer Data', icon: 'database', tone: 'blue' },
      { id: 'sys-inventory', name: 'Inventory', icon: 'package', tone: 'coral' },
      { id: 'sys-support', name: 'Support', icon: 'headphones', tone: 'pink' },
    ],
  },
  {
    id: 'faq',
    type: 'faq',
    visible: true,
    eyebrow: 'GOOD TO KNOW',
    heading: 'Frequently asked questions',
    image: { url: '/figma/figma-faq.png', alt: 'Two people using Veyra together in a city storefront' },
  },
];

export const defaultContactSections: Section[] = [
  {
    id: 'contact-intro',
    type: 'pageIntro',
    visible: true,
    eyebrow: 'CONTACT US',
    heading: 'Let’s talk about your next growth opportunity.',
    lede: 'Tell us what you’re looking to improve across online shopping, in-store selling, or customer support.',
  },
  {
    id: 'contact-form',
    type: 'contactForm',
    visible: true,
    heading: 'Tell us what you have in mind.',
    unavailableTitle: 'This form isn’t accepting messages yet.',
    unavailableNotice: 'Approved privacy material and a delivery destination are required. Nothing can be sent or retained while this form is unavailable.',
    inquiryTypes: ['Request a demo', 'Product question', 'Partnership', 'Other'],
    solutions: ['Veyra Online', 'Veyra In-Person', 'Cerin', 'Multiple solutions', 'Not sure yet'],
    submitLabel: 'Send message',
    successMessage: 'Thanks — your message is on its way. We’ll review it and connect you with the right person.',
    aside: [
      {
        id: 'aside-help',
        heading: 'How can we help?',
        items: ['Explore Veyra and request a demo.', 'Discuss a business challenge.', 'Explore a partnership.'],
        body: '',
      },
      {
        id: 'aside-next',
        heading: 'What happens next?',
        items: [],
        body: 'We’ll review your message and connect you with the right person.',
      },
    ],
  },
];

// The /resources listing. Its intro is editable; the posts below it come
// from the Resources section of the admin.
export const defaultResourcesSections: Section[] = [
  {
    id: 'resources-intro',
    type: 'pageIntro',
    visible: true,
    eyebrow: 'RESOURCES',
    heading: 'Ideas and insights for every customer moment.',
    lede: 'Explore practical guidance, use cases, and events for online shopping, in-store selling, and customer support.',
  },
];

export const defaultPages: Record<'home' | 'contact' | 'resources', PublicPage> = {
  home: {
    slug: 'home',
    title: 'Home',
    excerpt: '',
    featuredImage: '',
    sections: defaultHomeSections,
    seo: {
      ...emptySeo,
      seoTitle: homeSeoTitle,
      metaDescription: homeMetaDescription,
      canonicalUrl: 'https://veyra4retail.com/',
      ogTitle: homeSeoTitle,
      ogDescription: homeMetaDescription,
      ogImage: 'https://veyra4retail.com/og-image.jpg',
      schemaJson: homeSeoSchema,
    },
    updatedAt: '2026-10-09T00:00:00.000Z',
  },
  contact: {
    slug: 'contact',
    title: 'Contact Us',
    excerpt: 'Tell us what you’re looking to improve across online shopping, in-store selling, or customer support.',
    featuredImage: '',
    sections: defaultContactSections,
    seo: { ...emptySeo, seoTitle: 'Contact Veyra | Talk to Our Team' },
    updatedAt: '2026-10-09T00:00:00.000Z',
  },
  resources: {
    slug: 'resources',
    title: 'Resources',
    excerpt: 'Practical guidance on online conversion, in-store selling and customer support from the Veyra team.',
    featuredImage: '',
    sections: defaultResourcesSections,
    seo: { ...emptySeo, seoTitle: 'Resources | Veyra' },
    updatedAt: '2026-10-13T00:00:00.000Z',
  },
};

const menu = (
  location: MenuLocation,
  items: Array<[label: string, url: string]>,
): PublicMenu => ({
  location,
  cta: { enabled: true, label: 'Get Demo' },
  items: items.map(([label, url], index) => ({
    id: `${location}-${index + 1}`,
    label,
    url,
    external: false,
    newTab: false,
    children: [],
  })),
});

export const defaultMenus: Record<MenuLocation, PublicMenu> = {
  'home-header': menu('home-header', [
    ['Home', '/'],
    ['Resources', '/resources'],
    ['Contact Us', '/contact'],
  ]),
  'home-footer': menu('home-footer', [
    ['Veyra Online', '#veyra-online'],
    ['Veyra In-Person', '#veyra-in-person'],
    ['Cerin', '#cerin'],
    ['FAQ', '#faq'],
  ]),
  'page-header': menu('page-header', [
    ['Home', '/'],
    ['Resources', '/resources'],
    ['Contact Us', '/contact'],
  ]),
  'page-footer': menu('page-footer', [
    ['Home', '/'],
    ['Veyra Online', '/#veyra-online'],
    ['Veyra In-Person', '/#veyra-in-person'],
    ['Cerin', '/#cerin'],
    ['FAQ', '/#faq'],
    ['Resources', '/resources'],
    ['Contact Us', '/contact'],
  ]),
};

export const defaultSiteSettings: SiteSettings = {
  siteName: 'Veyra',
  logo: { url: '/veyra-logo.svg', alt: 'Veyra' },
  footerLogo: { url: '', alt: '' },
  favicon: '/favicon.ico',
  contactEmail: '',
  phone: '',
  address: '',
  social: {},
  whatsapp: '',
  copyright: '© {year} Veyra. All rights reserved.',
  defaultSeoTitle: 'Veyra | AI Shopping Assistant & Revenue Platform for Retail',
  defaultMetaDescription:
    'Veyra helps retailers increase conversion, grow basket value, empower store associates, and automate customer support across online and in-store journeys.',
  defaultOgImage: '/og-image.jpg',
  googleAnalyticsId: '',
  googleTagManagerId: '',
  maintenanceMode: false,
  maintenanceMessage: 'We’re making a few improvements and will be back shortly.',
  headerScripts: '',
  footerScripts: '',
  notificationEmail: '',
  robotsDisallow: [],
};

export const defaultDemoSettings: DemoSettings = {
  mode: 'dialog',
  url: '',
  ctaLabel: 'Get Demo',
  title: 'Get Demo',
  lede: 'Tell us where you want to grow and we will shape the walkthrough around it.',
  interests: ['Veyra Online', 'Veyra In-Person', 'Cerin', 'Not sure yet'],
  submitLabel: 'Request a demo',
  successTitle: 'Request received',
  successMessage: 'Thanks, {firstName}. We have your details and will reply to {email}.',
};

export const defaultFormSettings: FormSettings = {
  demoEnabled: true,
  // Off to match the live site, where it was disabled pending approved
  // privacy material. The form is fully connected; switch it on in Settings.
  contactEnabled: false,
};

export const defaultEmailSettings: EmailSettings = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  fromName: 'Veyra',
  fromEmail: '',
};

export function publicSettingsFrom(
  settings: SiteSettings,
  demo: DemoSettings,
  forms: FormSettings,
): PublicSettings {
  return {
    siteName: settings.siteName,
    logo: settings.logo,
    footerLogo: settings.footerLogo,
    favicon: settings.favicon,
    contactEmail: settings.contactEmail,
    phone: settings.phone,
    address: settings.address,
    social: settings.social,
    whatsapp: settings.whatsapp,
    copyright: settings.copyright,
    demo,
    forms,
  };
}

// The bootstrap the site uses when the API is unreachable. Forms are switched
// off in this fallback: with no backend there is nowhere for a message to go.
export function fallbackBootstrap(path: string): SiteBootstrap {
  const clean = path.replace(/\/+$/, '') || '/';
  const page = clean === '/' ? defaultPages.home : clean === '/contact' ? defaultPages.contact : clean === '/resources' ? defaultPages.resources : null;
  return {
    settings: publicSettingsFrom(defaultSiteSettings, defaultDemoSettings, {
      demoEnabled: false,
      contactEnabled: false,
    }),
    menus: defaultMenus,
    collections: defaultCollections,
    page,
    preview: false,
    generatedAt: 'fallback',
  };
}
