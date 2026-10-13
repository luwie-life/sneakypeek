import LegalLayout from '../../components/landing/LegalLayout'

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="October 2026">
      <p>
        This page describes what Sneaky Peek actually collects and how it's used. It is not a
        substitute for formal legal review — see the note at the bottom.
      </p>

      <h2>What we collect</h2>
      <p>
        When you create an account: your name, email address, and a securely hashed password
        (we never store your password in plain text). When you build an experience: the product
        information, materials (text, PDFs, links), and content you provide or generate. When a
        visitor views a published experience: an anonymous session identifier and basic
        interaction events (which sections they viewed, whether they clicked through to checkout)
        — never anything that identifies them personally.
      </p>

      <h2>How we use it</h2>
      <p>
        Your account details let you log in and manage your work. Product material you provide is
        sent to our AI provider (Anthropic) solely to help generate and refine your experiences —
        it is not used to train their models beyond their own standard data-use terms, which you
        can review on their site. Visitor interaction data powers the analytics dashboard you see
        for your own published experiences.
      </p>

      <h2>Payments</h2>
      <p>
        Subscription payments are processed by Flutterwave. We never see or store your full card
        details — only a record that a payment succeeded or failed, and a reference number.
      </p>

      <h2>What we don't do</h2>
      <p>
        We don't sell your data. We don't share your private product materials or extracted
        content with other users. We don't make your draft or unpublished experiences public.
      </p>

      <h2>Your choices</h2>
      <p>
        You can delete materials and experiences from your dashboard at any time. To request full
        account deletion, contact us (see our <a href="/contact" className="text-ink underline">Contact</a> page).
      </p>

      <h2>A note on this document</h2>
      <p>
        This is a plain-language, accurate description of current practice — not a document
        reviewed by legal counsel, and it doesn't name a registered company entity or jurisdiction
        yet. Treat it as a starting point to have properly reviewed before relying on it for
        compliance purposes.
      </p>
    </LegalLayout>
  )
}
