import LegalLayout from '../../components/landing/LegalLayout'

export default function Contact() {
  return (
    <LegalLayout title="Contact">
      <p>
        Questions, feedback, or anything else — reach us at{' '}
        <a href="mailto:hello@sneakypeek.com" className="text-ink underline">hello@sneakypeek.com</a>.
      </p>
      <p>
        If you're a creator interested in early access or want to report an issue with a published
        experience, the same address works — just let us know what it's about.
      </p>
    </LegalLayout>
  )
}
