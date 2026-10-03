/** Text from the model with `backtick` parts rendered in code font (commands and addresses, per the style guide). */
export function Coded({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}
    </>
  )
}
