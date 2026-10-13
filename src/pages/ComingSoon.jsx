export default function ComingSoon({ label }) {
  return (
    <p className="text-muted font-sans max-w-md">
      {label} isn't built yet — it's part of the next slice, once the core
      create → publish → view loop is solid.
    </p>
  )
}
