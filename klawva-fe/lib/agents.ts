export type AgentId = 'scrapper' | 'vendor' | 'researcher' | 'jobseeker' | 'leadscout'
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
  type: 'text' | 'textarea' | 'tel' | 'file' | 'select'
  required: boolean
  hint?: string
  csvImport?: boolean
  options?: string[]
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
      { id: 'whatsapp_number', label: 'Your WhatsApp business number', placeholder: '+234 800 000 0000', type: 'tel', required: true, hint: 'This number identifies you as the owner for admin access. For the agent to message you directly, use a different number when connecting via QR.' },
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
  jobseeker: {
    id: 'jobseeker',
    name: 'Klawva Job Seeker',
    title: 'Talent Acquisition',
    specialty: 'Finds jobs. Matches talent.',
    tagline: 'Your career on autopilot. Opportunities delivered daily.',
    description: 'The Job Seeker searches job boards, company career pages, and public listings to find opportunities matching your skills and preferences. Upload your CV and get tailored job matches delivered to your chat.',
    capabilities: [
      'Search job boards and company career pages daily',
      'Compile listings with salary, requirements, and apply links',
      'Track application deadlines and follow-up dates',
      'Research company backgrounds and culture',
      'Generate tailored cover letters and summaries',
    ],
    examplePrompt: 'Find software engineering roles in Lagos paying above ₦500k. Focus on fintech companies. Deliver a daily digest.',
    channels: ['whatsapp', 'telegram'],
    briefFields: [
      { id: 'cv', label: 'Upload your CV', placeholder: '', type: 'file', required: true, hint: 'Upload a .docx file with your CV/resume' },
      { id: 'role_preference', label: 'What roles are you looking for?', placeholder: 'e.g. Software Engineer, Product Manager, Data Analyst', type: 'textarea', required: true },
      { id: 'location', label: 'Preferred location(s)', placeholder: 'e.g. Lagos, Remote, Hybrid', type: 'text', required: false },
      { id: 'salary_range', label: 'Expected salary range', placeholder: 'e.g. ₦500k - ₦1M monthly', type: 'text', required: false },
      { id: 'extra_criteria', label: 'Any other preferences?', placeholder: 'e.g. Must be fintech, must have health insurance', type: 'textarea', required: false },
    ],
    priceNGN: 2500,
    priceUSD: 1.99,
  },
  leadscout: {
    id: 'leadscout',
    name: 'Klawva Lead Scout',
    title: 'Sales Intelligence',
    specialty: 'Finds leads. Qualifies prospects.',
    tagline: 'Your pipeline stays full. You stay focused on closing.',
    description: 'The Lead Scout searches the web for potential customers, partners, and business opportunities matching your ideal customer profile. It delivers qualified leads with contact info, company details, and source URLs.',
    capabilities: [
      'Search for potential customers matching your ICP',
      'Research company backgrounds and funding status',
      'Find key decision-makers and their contact info',
      'Qualify leads based on your criteria',
      'Maintain a deduplication log to avoid repeats',
    ],
    examplePrompt: 'Find 20 SaaS startups in Lagos that raised Series A in the last 6 months. I need CTO emails and company size.',
    channels: ['whatsapp', 'telegram'],
    briefFields: [
      { id: 'ideal_customer', label: 'Describe your ideal customer', placeholder: 'e.g. SaaS startups in Lagos, 10-50 employees, Series A funded', type: 'textarea', required: true },
      { id: 'industry', label: 'Target industry/industries', placeholder: 'e.g. Fintech, Healthcare, E-commerce', type: 'text', required: false },
      { id: 'contact_preference', label: 'What contact info do you need?', placeholder: 'e.g. CTO email, LinkedIn profile, company phone', type: 'select', required: false, options: ['Email', 'Phone', 'LinkedIn', 'All of the above'] },
      { id: 'extra_criteria', label: 'Any other criteria?', placeholder: 'e.g. Must have raised funding, must have a website', type: 'textarea', required: false },
    ],
    priceNGN: 2500,
    priceUSD: 1.99,
  },
}
