export type AgentId = 'scrapper' | 'vendor' | 'researcher'
export type Channel = 'whatsapp' | 'telegram'

export interface Agent {
  id: AgentId
  name: string
  title: string
  specialty: string
  tagline: string
  description: string
  capabilities: string[]
  examplePrompt: string
  channels: Channel[]
  comingSoon?: boolean
  briefFields: BriefField[]
  priceNGN: number
  priceUSD: number
}

export interface BriefField {
  id: string
  label: string
  placeholder: string
  type: 'text' | 'textarea' | 'tel'
  required: boolean
  hint?: string
  csvImport?: boolean
}

export const agents: Record<AgentId, Agent> = {
  scrapper: {
    id: 'scrapper',
    name: 'Klawva Scrapper',
    title: 'Web Intelligence & Data',
    specialty: 'Finds, monitors, extracts.',
    tagline: 'Set it loose on the web. Get back structured intelligence.',
    description: 'The Scrapper monitors prices, tracks competitors, extracts data from any public website, and delivers organized reports. If it exists on the web, the Scrapper can find it.',
    capabilities: [
      'Track product prices on Jumia, Konga, Jiji in real time',
      'Monitor competitor websites for changes in pricing or products',
      'Scrape and compile structured data from public sources',
      'Extract business listings, contacts, or directory data',
      'Monitor news for mentions of a keyword, brand, or topic',
    ],
    examplePrompt: 'Monitor these 5 Jumia product pages every 2 hours and alert me to any price changes. Also find 3 competitor products and compare specs.',
    channels: ['whatsapp', 'telegram'],
    briefFields: [
      { id: 'task', label: 'What should the Scrapper find or monitor?', placeholder: 'e.g. Track price of Samsung Galaxy A55 on Jumia and Konga', type: 'textarea', required: true },
      { id: 'urls', label: 'Specific URLs to monitor (optional)', placeholder: 'Paste URLs, one per line', type: 'textarea', required: false },
      { id: 'output', label: 'How do you want the results delivered?', placeholder: 'e.g. A table comparing prices, with alerts if anything drops', type: 'text', required: false },
    ],
    priceNGN: 2500,
    priceUSD: 1.99,
  },
  vendor: {
    id: 'vendor',
    name: 'Klawva Vendor',
    title: 'Business Operations',
    specialty: 'Attends to your customers.',
    tagline: 'Your business stays open. You stay focused.',
    description: 'The Vendor connects to your WhatsApp business number and handles every customer inquiry using your product brief. You message yourself to give instructions. Customers get fast, professional responses.',
    capabilities: [
      'Respond to customer FAQs using your product catalog',
      'Handle order status inquiries from your order list',
      'Draft professional responses to complaints',
      'Escalate issues to you when human judgment is needed',
      'Deliver an end-of-shift summary of all interactions',
    ],
    examplePrompt: 'I\'m running a flash sale. Here\'s my product list. Handle all incoming messages and escalate only if a customer is very upset.',
    channels: ['whatsapp'],
    briefFields: [
      { id: 'whatsapp_number', label: 'Your WhatsApp business number', placeholder: '+234 800 000 0000', type: 'tel', required: true, hint: 'Use a separate number from your personal WhatsApp. This number will be linked to your Vendor.' },
      { id: 'products', label: 'Your products and prices', placeholder: 'Paste your product list here — names, prices, descriptions', type: 'textarea', required: true, csvImport: true },
      { id: 'orders', label: 'Current orders (optional)', placeholder: 'Paste any active orders the Vendor should know about', type: 'textarea', required: false },
      { id: 'instructions', label: 'Special instructions', placeholder: 'e.g. Do not offer discounts. Always mention our return policy.', type: 'textarea', required: false },
    ],
    priceNGN: 2500,
    priceUSD: 1.99,
  },
  researcher: {
    id: 'researcher',
    name: 'Klawva Researcher',
    title: 'Academic & Market Research',
    specialty: 'Reads everything. Writes it clean.',
    tagline: 'The 8-hour deep dive. Done in your sleep.',
    description: 'The Researcher browses multiple sources, synthesizes information, and produces a structured, readable report. From competitive analysis to academic literature reviews, it delivers work you can actually use.',
    capabilities: [
      'Compile multi-source research reports on any topic',
      'Perform market analysis: size, key players, trends',
      'Summarize long documents, PDFs, and academic papers',
      'Build structured competitive analyses',
      'Gather information for business plans or grant applications',
    ],
    examplePrompt: 'Write a 1,500-word competitive analysis of the Nigerian fintech lending space. Cover the top 5 players, their demographics, pricing, and recent funding.',
    channels: ['whatsapp', 'telegram'],
    briefFields: [
      { id: 'topic', label: 'What should the Researcher investigate?', placeholder: 'e.g. Competitive landscape of Nigerian food delivery apps in 2025', type: 'textarea', required: true },
      { id: 'depth', label: 'How deep should it go?', placeholder: 'e.g. 1,500-word report with sources, or a bullet-point briefing', type: 'text', required: true },
      { id: 'context', label: 'Any context or specific angle?', placeholder: 'e.g. I\'m pitching to investors, focus on market size and growth', type: 'textarea', required: false },
    ],
    priceNGN: 2500,
    priceUSD: 1.99,
  },
}
