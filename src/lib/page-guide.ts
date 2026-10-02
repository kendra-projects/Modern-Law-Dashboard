/**
 * What each page does, and which Make.com automations sit behind it.
 *
 * The client can see the dashboard but has no way of knowing that, say, Meeting
 * Resolution is the front end of five separate Make scenarios — or which one to
 * open when something looks wrong. This is that map, written for someone who
 * has never opened Make.
 *
 * It feeds two things: the strip under the topbar, which names the automations
 * in the open so nobody has to go looking for them, and the (i) panel, which
 * holds the longer explanation for when somebody does want it.
 *
 * Descriptions are deliberately about outcomes ("posts each consultation to the
 * attorney's Slack") rather than modules, and they must stay true: if a
 * scenario is renamed, retired, or its job changes, correct it here.
 */

const MAKE_TEAM = "1555038"

export const makeScenarioUrl = (id: number) =>
  `https://us2.make.com/${MAKE_TEAM}/scenarios/${id}/edit`

export interface GuideScenario {
  /** Make scenario id — also what the "open in Make" link is built from. */
  id: number
  /** Full name as it appears in Make, so the two can be matched by eye. */
  name: string
  /** Short label for the strip, where space is tight. */
  short: string
  /** One sentence, in the client's language, about what it actually does. */
  does: string
  /**
   * True when `public/scenarios/<id>.png` holds a screenshot of the Make
   * canvas. Set it when you add the file — the dialog also copes with a
   * missing image, but the flag keeps it from flashing a broken frame first.
   */
  hasDiagram?: boolean
}

export interface PageGuide {
  /** One or two sentences: what this page is for. Opens the (i) panel. */
  what: string
  /** The longer version — how it actually works, and what it is not. */
  detail?: string
  /** The journey a record takes, as short labels. Rendered as a chain. */
  flow?: string[]
  scenarios: GuideScenario[]
  /** Shown in place of the scenario list when the page runs no automation. */
  note?: string
  /** Where to look first when this page shows something unexpected. */
  troubleshoot?: string
}

const ML_WORKFLOW: GuideScenario = {
  id: 6152557,
  name: "Modern Law Workflow 2.0",
  short: "Modern Law Workflow",
  does: "Takes a Modern Law upload from transcript to finished post — blog draft, artwork, YouTube, Instagram and Facebook.",
  hasDiagram: true,
}

const BOL_WORKFLOW: GuideScenario = {
  id: 6163520,
  name: "The Business of Law Workflow 2.0",
  short: "Business of Law Workflow",
  does: "The same pipeline for Billie's own show, which publishes to YouTube and the blog only.",
  hasDiagram: true,
}

const GBP_PUBLISHER: GuideScenario = {
  id: 4533517,
  name: "GBP Post Publisher — Modern Law (All Locations)",
  short: "GBP Post Publisher",
  does: "Turns each published blog into eight different Google Business Profile posts, one per Arizona location.",
  hasDiagram: true,
}

const ZOOM_SLACK: GuideScenario = {
  id: 5030250,
  name: "Zoom Summaries to Slack for Approval",
  short: "Zoom → Slack approval",
  does: "Catches the finished Zoom summary, finds the client in Clio, and posts it to the attorney's Slack for approval.",
  hasDiagram: true,
}

const ZOOM_TRANSCRIPTS: GuideScenario = {
  id: 5144016,
  name: "Zoom Transcripts to Clio (via Parking Lot)",
  short: "Zoom transcripts",
  does: "Collects the full transcript separately and attaches it to the same matter once the summary is approved.",
  hasDiagram: true,
}

const ZOOM_ROUTER: GuideScenario = {
  id: 5057544,
  name: "Zoom Summaries Router",
  short: "Slack buttons",
  does: "Handles the Slack buttons — approve, flag a wrong matter, or hand it to an admin to file manually.",
  hasDiagram: true,
}

const CLIO_LOOKUP: GuideScenario = {
  id: 6212817,
  name: "Clio Matter Lookup (Dashboard)",
  short: "Matter search",
  does: "Answers the matter search box on this page by querying Clio live, so the list is never out of date.",
  hasDiagram: true,
}

const CLIO_FILE: GuideScenario = {
  id: 6212838,
  name: "File Consultation to Clio (Dashboard)",
  short: "File to Clio",
  does: "Creates the actual Clio note when you file from here, and retires the Slack buttons so it cannot be filed twice.",
  hasDiagram: true,
}

const RECOVERY_AUTO: GuideScenario = {
  id: 6132511,
  name: "Error Recovery System (Auto)",
  short: "Recovery — Auto",
  does: "Sweeps the queue every 15 minutes and retries anything that failed, on its own.",
  hasDiagram: true,
}

const RECOVERY_MANUAL: GuideScenario = {
  id: 6195213,
  name: "Error Recovery System (Manual)",
  short: "Recovery — Manual",
  does: "The same recovery, run on demand — this is what the Retry Now button calls.",
  hasDiagram: true,
}

export const PAGE_GUIDES: Record<string, PageGuide> = {
  "/": {
    what: "The whole operation on one screen — what came in, what is being worked on, what published, and what needs a person.",
    detail:
      "Nothing is started from here. Every number is read back from the same database the automations write to, so this page cannot disagree with the pages underneath it. Failed Make runs are pulled in automatically, which is why a breakage appears here rather than only in an email nobody opens.",
    flow: ["Upload or Zoom", "AI drafts", "Published", "Tracked here"],
    scenarios: [],
    note: "This page runs no automation of its own — it reads what all the others wrote.",
    troubleshoot:
      "If a number here looks wrong, open the page it belongs to: the counts are derived from those same records, not stored separately.",
  },

  "/upload": {
    what: "Drop a downloaded TikTok video and the content pipeline starts on its own.",
    detail:
      "Each file is fingerprinted in the browser before it uploads, so the same video sent twice is recognised and skipped — no duplicate blogs, no duplicate posts. Media lands in a private bucket and is only ever played back through short-lived signed links. The upload finishes as soon as the file is registered; transcription and drafting carry on in the background.",
    flow: ["File dropped", "Stored", "Transcribed", "Blog + social drafted"],
    scenarios: [ML_WORKFLOW, BOL_WORKFLOW],
    troubleshoot:
      "An upload that stays on Pending means the workflow has not picked it up yet — check the automation below, then the Recovery Queue.",
  },

  "/blogs": {
    what: "Every AI-drafted article, with its artwork, waiting to be read.",
    detail:
      "The workflow writes the draft straight into WordPress and stops there — it never publishes on its own, because the copy is legal marketing and a person signs it off. Publishing happens in WordPress; marking it live here records the live URL, and that in turn is what releases the Google Business Profile posts.",
    flow: ["Transcript", "AI writes", "WordPress draft", "You publish"],
    scenarios: [ML_WORKFLOW, BOL_WORKFLOW],
    troubleshoot:
      "A blog stuck on Draft is waiting on a person, not on the system.",
  },

  "/gbp": {
    what: "Google Business Profile posts for all eight Arizona locations.",
    detail:
      "Each location gets its own separately written post from the same blog — Google demotes locations that publish identical text, so eight copies of one post would do harm. Every post is stored here with its own status, so if one location fails the other seven still go out and only the failure is retried.",
    flow: ["Blog published", "8 posts written", "Posted to Google"],
    scenarios: [GBP_PUBLISHER],
    troubleshoot:
      "A location showing Failed is already queued for retry — the Recovery Queue tracks it.",
  },

  "/archive": {
    what: "Every intake, transcript, article, published record and filed consultation ever produced, searchable in one place.",
    detail:
      "This is the record, not a control panel — nothing here changes what is live. It holds two streams: the content pipeline (uploads, blog drafts, published articles, Google posts) and the Zoom consultations that were summarised and filed into Clio. Transcripts are kept in full rather than truncated and each entry links back to the media or the Clio matter it came from, so an old episode or an old consultation can be traced end to end long after the automation that made it has moved on.",
    flow: ["Upload or Zoom", "Transcribed", "Published or filed", "Kept here"],
    scenarios: [
      ML_WORKFLOW,
      BOL_WORKFLOW,
      GBP_PUBLISHER,
      ZOOM_SLACK,
      ZOOM_TRANSCRIPTS,
      CLIO_FILE,
    ],
    troubleshoot:
      "Nothing is filed or published from this page. A consultation that reads Pending Review is waiting on an attorney over on Meeting Resolution.",
  },

  "/meetings": {
    what: "Zoom consultations waiting on an attorney before the note is filed to Clio.",
    detail:
      "When a Zoom consultation ends, the client is looked up in Clio from the attendee's email and their most recent open matter is suggested. The attorney normally approves straight from Slack. Anything the automation could not be sure about — no matching client, no open matter, or a matter the attorney rejected — lands here instead. Filing from this page creates the real Clio note and retires the Slack buttons, so the same consultation can never be filed twice.",
    flow: ["Zoom ends", "Matched to Clio", "Attorney confirms", "Note filed"],
    scenarios: [
      ZOOM_SLACK,
      ZOOM_TRANSCRIPTS,
      ZOOM_ROUTER,
      CLIO_LOOKUP,
      CLIO_FILE,
    ],
    troubleshoot:
      "A consultation stays on this list until Clio confirms the note — if one lingers after filing, the Recovery Queue will be holding it.",
  },

  "/recovery": {
    what: "Anything that failed and is being retried, with the option to retry it now.",
    detail:
      "A failed step never stops the rest of the pipeline. It is queued here with everything needed to redo it — including the content itself, not just a pointer to it, so a retry works even when the original record is what went missing. Retries happen automatically on a schedule; a job only asks for a person once it has used up its attempts.",
    flow: ["Step fails", "Queued", "Auto-retried", "Resolved"],
    scenarios: [RECOVERY_AUTO, RECOVERY_MANUAL],
    troubleshoot:
      "Needs attention means the automatic retries are exhausted — that one wants a human decision.",
  },

  "/logs": {
    what: "A complete timeline of every automation event — uploads, drafts, each platform publish, retries and errors.",
    detail:
      "Every automation writes here as it works, and failed Make runs are pulled in on their own, so an error shows up without anyone forwarding an email. This is the place to answer 'what actually happened, and when' — the other pages show the current state, this one shows how it got there.",
    scenarios: [],
    note: "Written to by every automation on the system.",
  },
}

export function guideFor(pathname: string): PageGuide | null {
  if (PAGE_GUIDES[pathname]) return PAGE_GUIDES[pathname]
  // Nested routes (e.g. /archive/… ) fall back to their section.
  const match = Object.keys(PAGE_GUIDES)
    .filter((h) => h !== "/")
    .sort((a, b) => b.length - a.length)
    .find((h) => pathname.startsWith(h))
  return match ? PAGE_GUIDES[match] : null
}
