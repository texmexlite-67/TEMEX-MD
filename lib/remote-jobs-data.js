/**
 * Curated research: legit remote AI / online tasking jobs (2026).
 * -----------------------------------------------------------------
 * Snapshot compiled 2026-11-28 from public sources (platform sites,
 * review sites, FTC/Forbes/Bitdefender guidance). Rates and country
 * eligibility change frequently — every consumer of this data MUST
 * show a "verify on the official site" disclaimer.
 *
 * Kenya note (recap of conflicting public reporting, 2026-11):
 *   - Outlier (Scale AI): working guidelines effective 2026-07-15 do NOT
 *     list Kenya as a permitted work country (verified 2026-10-16).
 *   - Remotasks (Scale AI): stopped operating in Kenya in March 2024.
 *   - Mercor: Kenya explicitly excluded in writing.
 *   - DataAnnotation & Appen/CrowdGen publish no country list — Kenya
 *     users report access; verify at signup.
 *   - TELUS Digital AI Community & Sama hire inside Kenya (Nairobi).
 *   - Prolific, Clickworker, Toloka/Mindrift, Welo Data (Kiswahili) are
 *     commonly reported open to Kenya.
 * Always confirm current eligibility on the platform's own site.
 */

export const RESEARCH_DATE = '2026-11-28';
export const DISCLAIMER =
  'Rates & eligibility change — always verify on the official site before applying. Legit platforms NEVER charge you to work or to withdraw. Last researched Nov 2026.';

export const PLATFORMS = [
  {
    id: 'dataannotation',
    name: 'DataAnnotation.tech (Surge AI)',
    url: 'https://www.dataannotation.tech',
    type: 'AI evaluation (writing, code, reasoning)',
    pay: '$15–$25/hr general · $22–$35/hr coding/STEM',
    payouts: 'PayPal (weekly / twice weekly)',
    eligibility: 'No published country list (US-centric). Unpaid aptitude assessment required. Verify eligibility at signup.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Strong English writers, coders, STEM graduates',
    notes: 'Assessment is selective; task flow comes and goes. Works best as supplementary income.'
  },
  {
    id: 'outlier',
    name: 'Outlier (Scale AI)',
    url: 'https://outlier.ai',
    type: 'AI model evaluation & domain-expert tasks',
    pay: '$15–$40/hr general · $60–$150/hr experts (law, medicine, code)',
    payouts: 'PayPal (weekly) · wallet/bank in some regions',
    eligibility: '80+ countries. NOTE: Kenya is NOT on the permitted-country list (guidelines effective 2026-07-15). Verify before applying.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Domain experts, coders, multilingual reviewers',
    notes: 'Requires government ID + resume/LinkedIn. Strict quality audits; low-quality work gets access revoked.'
  },
  {
    id: 'remotasks',
    name: 'Remotasks (Scale AI)',
    url: 'https://remotasks.com',
    type: 'Image / LiDAR / text annotation',
    pay: '$3–$20/hr (piece-rate; experts higher)',
    payouts: 'PayPal / Airwallex (weekly)',
    eligibility: '100+ countries, but exited Kenya in March 2024. Great free training for beginners.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Beginners wanting free training & guided onboarding',
    notes: 'Piece-rate: first weeks can be below minimum wage until you learn the spec.'
  },
  {
    id: 'appen',
    name: 'Appen / CrowdGen',
    url: 'https://www.appen.com',
    type: 'Search evaluation, annotation, audio, LLM projects',
    pay: '$8–$15/hr (US/EU) · $3–$7/hr (Africa, India, Philippines)',
    payouts: 'Payoneer (monthly; some regions PayPal/direct)',
    eligibility: '170+ countries incl. Kenya. Project availability varies; multilingual speakers in demand.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Kenya/Global contributors wanting steady project-based work',
    notes: 'Monthly pay cycle; onboarding can take weeks. Rates vary heavily by project.'
  },
  {
    id: 'prolific',
    name: 'Prolific',
    url: 'https://www.prolific.com',
    type: 'Paid research & AI data-collection studies',
    pay: '~$8–$12/hr average',
    payouts: 'PayPal (low minimum cashout)',
    eligibility: 'Open to Kenya, Nigeria, South Africa, Egypt & more. Profile-based eligibility.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Anyone wanting simple paid studies, no special skills',
    notes: 'Task flow is bursty — check in daily. Fair, participant-friendly model.'
  },
  {
    id: 'micro1',
    name: 'micro1',
    url: 'https://micro1.ai',
    type: 'Expert AI training & GenAI data roles',
    pay: '$30–$200/hr (role-dependent)',
    payouts: 'Deel (bank transfer / Wise-style rails)',
    eligibility: 'Global. micro1 publishes an excluded-countries list — Kenya is NOT on it. Verify at signup.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Experienced engineers & credentialed specialists',
    notes: 'AI-interview style vetting; competitive but high pay for qualified experts.'
  },
  {
    id: 'mercor',
    name: 'Mercor',
    url: 'https://mercor.com',
    type: 'Expert network for frontier-lab AI training',
    pay: '$40–$150/hr',
    payouts: 'Stripe Connect (weekly/biweekly)',
    eligibility: 'NOT available in Kenya (excluded in writing). US/EU/India-centric.',
    legit: 'VERIFIED LEGIT (not for KE)',
    bestFor: 'Verified professionals outside excluded regions',
    notes: 'Credential verification is strict. Do not misrepresent your background.'
  },
  {
    id: 'afterquery',
    name: 'AfterQuery',
    url: 'https://www.afterquery.com',
    type: 'Subject-matter-expert verified AI tasks',
    pay: '$20–$250/hr (SME-verified)',
    payouts: 'Stripe Connect',
    eligibility: 'Varies by project — most roles require verified professional credentials.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Doctors, lawyers, engineers, finance professionals',
    notes: 'Invite/qualification driven; not casual gig work.'
  },
  {
    id: 'alignerr',
    name: 'Alignerr',
    url: 'https://www.alignerr.com',
    type: 'LLM text training & data optimization',
    pay: '$40–$150/hr (project-dependent)',
    payouts: 'Stripe / Wise',
    eligibility: 'Multiple regions; check role listings for your country.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Writers, editors, technical reviewers',
    notes: 'Assessment + work-sample based onboarding.'
  },
  {
    id: 'mindrift',
    name: 'Mindrift (Toloka)',
    url: 'https://mindrift.ai',
    type: 'Crowd AI-training & evaluation tasks',
    pay: '$3–$10/hr typical',
    payouts: 'PayPal / Payoneer',
    eligibility: 'High-volume global crowd platform; many African countries supported.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'High-volume, flexible microtasking',
    notes: 'Low individual pay; quality gates and anti-spam audits apply.'
  },
  {
    id: 'toloka',
    name: 'Toloka',
    url: 'https://toloka.ai',
    type: 'Microtasks (search relevance, AI data)',
    pay: 'Usually <$5/hr equivalent',
    payouts: 'PayPal / Payoneer / Skrill (region-dependent)',
    eligibility: 'Global, incl. most of Africa.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Topping up earnings, simple tasks',
    notes: 'Treat as pocket-change top-up, not a main income.'
  },
  {
    id: 'telus',
    name: 'TELUS Digital AI Community',
    url: 'https://telusdigital.com',
    type: 'Internet assessment / AI search-quality rating',
    pay: '~$10–$30/hr (country-adjusted)',
    payouts: 'Hyperwallet / PayPal (where available)',
    eligibility: 'Per-country hiring — check current openings for your country (Nairobi has historically been hired).',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Longer-running assessment contracts',
    notes: 'Formal qualification process; hours can be stable once admitted.'
  },
  {
    id: 'sama',
    name: 'Sama',
    url: 'https://www.sama.com',
    type: 'Data annotation & AI quality (Sama Nairobi)',
    pay: 'Local Kenyan wage (salaried employment)',
    payouts: 'M-Pesa / bank (local payroll)',
    eligibility: 'Kenya (Nairobi office; some remote/contract options)',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Kenyan residents wanting stable local employment + benefits',
    notes: 'Social-enterprise employer; requires AI 101-style training then interviews.'
  },
  {
    id: 'welo',
    name: 'Welo Data (Welocalize)',
    url: 'https://welodata.com',
    type: 'Kiswahili / multilingual AI annotation & evaluation',
    pay: 'Project-based (disclosed during onboarding)',
    payouts: 'Contract payment rails (shared after qualification)',
    eligibility: 'Actively recruits Kiswahili speakers based in Kenya',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Native/fluent Kiswahili & other African-language speakers',
    notes: 'African-language skills are in short supply — strong leverage.'
  },
  {
    id: 'clickworker',
    name: 'Clickworker',
    url: 'https://www.clickworker.com',
    type: 'Microtasks, categorization, AI training data',
    pay: '~$3–$10/hr equivalent',
    payouts: 'PayPal / SEPA bank transfer',
    eligibility: 'Global incl. Kenya',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Filling gaps between bigger projects',
    notes: 'Assessments needed for some task types (e.g. writing).'
  },
  {
    id: 'rev',
    name: 'Rev / TranscribeMe',
    url: 'https://www.rev.com',
    type: 'Transcription & captioning (feeds AI datasets)',
    pay: '$5–$22 per audio hour (TranscribeMe entry ~$5–15)',
    payouts: 'PayPal / weekly (Rev)',
    eligibility: 'Rev favors US/Canada/Australia/NZ/English hubs; TranscribeMe broader. Test eligibility first.',
    legit: 'VERIFIED LEGIT',
    bestFor: 'Fast typists, strong accents-English listeners',
    notes: 'Style guides + accuracy gates; rejection loops are normal at the start.'
  },
  {
    id: 'mturk',
    name: 'Amazon Mechanical Turk',
    url: 'https://www.mturk.com',
    type: 'Crowd microtasks (HITs)',
    pay: 'Usually <$5/hr for most workers',
    payouts: 'Amazon Payments / US bank (US-centric)',
    eligibility: 'Practical access is US-focused; not recommended for KE/Global beginners',
    legit: 'VERIFIED LEGIT (limited utility)',
    bestFor: 'US-based workers / API integrations',
    notes: 'Mentioned for completeness — low pay and US focus.'
  }
];

export const TOP_PICKS = ['dataannotation', 'outlier', 'appen', 'prolific', 'micro1', 'welo'];

export const SCAM_RED_FLAGS = [
  'Asks YOU to pay — deposit, fee, “training”, equipment, or “to unlock withdrawal”. Real employers never charge you.',
  'Unsolicited WhatsApp/Telegram/SMS/DM offering online work you never applied for.',
  '“Like/follow/rate videos & product reviews for daily pay” — classic task-scam script.',
  'Guaranteed income (“KES 5,000 per day”, “$500/day easy”) with no skill or interview.',
  'Deposits/“recharges” via M-Pesa till, personal bank account, or crypto wallet.',
  'Small real payouts at first, then fees to withdraw the “balance” shown on a dashboard.',
  'Support only via Telegram/free email (gmail/yahoo); no verifiable company site or address.',
  'High withdrawal thresholds + countdown pressure (“bonus expires in 10 minutes”).',
  'Asks for your passwords, OTP codes, or M-Pesa PIN. Never share these — ever.'
];

export const VETTING_STEPS = [
  'Apply ONLY on the platform’s official site (type the URL yourself) — never via a chat-link recruiter.',
  'Search “<platform> + scam/review” on Trustpilot, Reddit and YouTube before joining.',
  'Check the company is registered & named (e.g. Scale AI, Appen (ASX: APX), TELUS, Sama).',
  'Confirm payout method exists in your country (PayPal/Payoneer availability for Kenya).',
  'Never pay to work, upgrade, train, or withdraw — if money must flow from you, stop.',
  'Keep screenshots of agreement, rates and support tickets.',
  'Report scams: report the number on WhatsApp/Telegram, and to Kenya’s DCI / your bank.'
];

export const KENYA_NOTES = [
  'REMOTASKS left Kenya (Mar 2024). OUTLIER does NOT list Kenya as permitted (Jul 2026 guidelines). MERCOR excludes Kenya in writing.',
  'Open/volume options for Kenya: Appen/CrowdGen, Prolific, Clickworker, Toloka/Mindrift, Welo Data (Kiswahili), DataAnnotation (no KE list published — verify at signup).',
  'Nairobi proper: Sama (salaried, M-Pesa/bank) and TELUS Digital AI Community openings when advertised.',
  'Money rails: PayPal (withdraw to Kenyan bank, then M-Pesa) or Payoneer; Wise/grey-market exchangers exist but carry heavy fees — check rates first.'
];
