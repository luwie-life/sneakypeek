import { Link } from 'react-router-dom'
import RevealMark from '../components/RevealMark'
import Button from '../components/ui/Button'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center gap-4 px-6 text-center">
      <RevealMark size={36} />
      <h1 className="font-serif text-3xl text-ink">Page not found</h1>
      <p className="text-muted text-sm max-w-xs">
        The page you're looking for doesn't exist, or the link may be out of date.
      </p>
      <Link to="/">
        <Button variant="accent" size="sm">Back to Sneaky Peek</Button>
      </Link>
    </div>
  )
}
